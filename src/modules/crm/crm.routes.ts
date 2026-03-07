import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import {
  getCustomerCreditUsage,
  checkCreditLimit,
  setCustomerCreditLimit,
  getCustomerCreditReport,
} from './credit-limit.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const CustomerSchema = z.object({
  name:       z.string().min(1),
  businessId: z.string().optional(),
  email:      z.string().email().optional(),
  phone:      z.string().optional(),
  address:    z.record(z.any()).optional(),
  type:       z.enum(['B2B', 'B2C', 'GOVERNMENT']).default('B2B'),
  status:     z.enum(['LEAD', 'ACTIVE', 'INACTIVE', 'BLOCKED']).default('LEAD'),
  assignedTo: z.string().optional(),
  metadata:   z.record(z.any()).default({}),  // JSONB - completely flexible
});

// GET /crm/customers
router.get('/customers', async (req: AuthenticatedRequest, res: Response) => {
  const { status, type, page = '1', pageSize = '25', search } = req.query;

  const where = withTenant(req, {
    ...(status ? { status: status as any } : {}),
    ...(type   ? { type:   type   as any } : {}),
    ...(search ? {
      OR: [
        { name:  { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
      ],
    } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take:    parseInt(pageSize as string),
    }),
    prisma.customer.count({ where }),
  ]);

  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
});

// GET /crm/customers/:id
router.get('/customers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.tenantId !== req.user.tenantId) {
    sendError(res, 'Customer not found', 404);
    return;
  }
  sendSuccess(res, customer);
});

// POST /crm/customers
router.post('/customers', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CustomerSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, customer, 201);
});

// PATCH /crm/customers/:id
router.patch('/customers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CustomerSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) {
    sendError(res, 'Customer not found', 404);
    return;
  }

  // Deep merge metadata (JSONB flexible fields)
  const mergedMetadata =
    parsed.data.metadata
      ? { ...(existing.metadata as object), ...parsed.data.metadata }
      : existing.metadata;

  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data:  { ...parsed.data, metadata: mergedMetadata ?? undefined },
  });
  sendSuccess(res, updated);
});

// DELETE /crm/customers/:id  (soft delete)
router.delete('/customers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) {
    sendError(res, 'Customer not found', 404);
    return;
  }

  await prisma.customer.update({
    where: { id: req.params.id },
    data:  { status: 'INACTIVE' },
  });
  sendSuccess(res, { message: 'Customer deactivated' });
});

// ─── Credit Limit Routes ──────────────────────────────────────────

// GET /crm/credit-report — דו"ח אשראי לכלל הלקוחות (ACCOUNTANT+)
router.get(
  '/credit-report',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const report = await getCustomerCreditReport(req.user.tenantId);
    sendSuccess(res, report);
  })
);

// GET /crm/customers/:id/credit — קבלת מצב אשראי לקוח
router.get(
  '/customers/:id/credit',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const usage = await getCustomerCreditUsage(req.params.id, req.user.tenantId);
      sendSuccess(res, usage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Customer not found') {
        sendError(res, 'Customer not found', 404);
        return;
      }
      throw err;
    }
  })
);

// PATCH /crm/customers/:id/credit — עדכון תקרת אשראי (ADMIN+)
const CreditLimitSchema = z.object({
  creditLimit:      z.number().min(0).nullable(),
  paymentTermsDays: z.number().int().min(0).optional(),
});

router.patch(
  '/customers/:id/credit',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreditLimitSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const updated = await setCustomerCreditLimit(
        req.params.id,
        req.user.tenantId,
        parsed.data.creditLimit,
        parsed.data.paymentTermsDays
      );
      sendSuccess(res, updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Customer not found') {
        sendError(res, 'Customer not found', 404);
        return;
      }
      throw err;
    }
  })
);

// POST /crm/customers/:id/check-credit — בדיקה האם סכום מסוים חורג מתקרת האשראי
const CheckCreditSchema = z.object({
  amount: z.number().positive(),
});

router.post(
  '/customers/:id/check-credit',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CheckCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const result = await checkCreditLimit(
        req.params.id,
        req.user.tenantId,
        parsed.data.amount
      );
      sendSuccess(res, result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Customer not found') {
        sendError(res, 'Customer not found', 404);
        return;
      }
      throw err;
    }
  })
);

export default router;
