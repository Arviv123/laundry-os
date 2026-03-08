/**
 * Price Lists — מחירונים
 * Manage per-service pricing tiers and assign customers to price lists.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Schemas ─────────────────────────────────────────────────────

const CreatePriceListSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  items: z.array(z.object({
    serviceId: z.string().cuid(),
    price: z.number().min(0),
  })).default([]),
});

const UpdatePriceListSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const ReplaceItemsSchema = z.array(z.object({
  serviceId: z.string().cuid(),
  price: z.number().min(0),
}));

const AssignCustomersSchema = z.object({
  customerIds: z.array(z.string().cuid()).min(1),
});

// ─── GET / — List all price lists ─────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const priceLists = await prisma.priceList.findMany({
    where: withTenant(req),
    include: {
      _count: { select: { items: true, customers: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, priceLists);
}));

// ─── POST / — Create price list ──────────────────────────────────

router.post('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CreatePriceListSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const { items, ...data } = parsed.data;
  const tenantId = req.user.tenantId;

  // If setting as default, unset any existing default
  if (data.isDefault) {
    await prisma.priceList.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const priceList = await prisma.priceList.create({
    data: {
      ...data,
      tenantId,
      items: items.length > 0 ? {
        create: items.map(item => ({
          serviceId: item.serviceId,
          price: item.price,
        })),
      } : undefined,
    },
    include: {
      items: { include: { service: true } },
      _count: { select: { customers: true } },
    },
  });

  sendSuccess(res, priceList, 201);
}));

// ─── GET /:id — Get price list with details ─────────────────────

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const priceList = await prisma.priceList.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      items: {
        include: { service: true },
        orderBy: { service: { sortOrder: 'asc' } },
      },
      customers: {
        select: { id: true, name: true, phone: true, email: true, status: true },
      },
    },
  });

  if (!priceList) { sendError(res, 'מחירון לא נמצא', 404); return; }
  sendSuccess(res, priceList);
}));

// ─── PATCH /:id — Update price list metadata ────────────────────

router.patch('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = UpdatePriceListSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.priceList.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) { sendError(res, 'מחירון לא נמצא', 404); return; }

  const tenantId = req.user.tenantId;

  // If setting as default, unset any existing default
  if (parsed.data.isDefault) {
    await prisma.priceList.updateMany({
      where: { tenantId, isDefault: true, id: { not: req.params.id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.priceList.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: {
      items: { include: { service: true } },
      _count: { select: { customers: true } },
    },
  });

  sendSuccess(res, updated);
}));

// ─── PUT /:id/items — Replace all items for a price list ────────

router.put('/:id/items', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = ReplaceItemsSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.priceList.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) { sendError(res, 'מחירון לא נמצא', 404); return; }

  // Delete all existing items and recreate
  await prisma.$transaction([
    prisma.priceListItem.deleteMany({ where: { priceListId: req.params.id } }),
    ...parsed.data.map(item =>
      prisma.priceListItem.create({
        data: {
          priceListId: req.params.id,
          serviceId: item.serviceId,
          price: item.price,
        },
      })
    ),
  ]);

  // Return updated price list
  const updated = await prisma.priceList.findUnique({
    where: { id: req.params.id },
    include: {
      items: { include: { service: true } },
      _count: { select: { customers: true } },
    },
  });

  sendSuccess(res, updated);
}));

// ─── DELETE /:id — Delete price list ─────────────────────────────

router.delete('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.priceList.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) { sendError(res, 'מחירון לא נמצא', 404); return; }

  // Unassign all customers from this price list first
  await prisma.customer.updateMany({
    where: { priceListId: req.params.id },
    data: { priceListId: null },
  });

  // Delete price list (items cascade automatically)
  await prisma.priceList.delete({ where: { id: req.params.id } });

  sendSuccess(res, { message: 'מחירון נמחק בהצלחה' });
}));

// ─── POST /:id/assign — Assign customers to this price list ─────

router.post('/:id/assign', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = AssignCustomersSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.priceList.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) { sendError(res, 'מחירון לא נמצא', 404); return; }

  // Update all specified customers to use this price list
  const result = await prisma.customer.updateMany({
    where: {
      id: { in: parsed.data.customerIds },
      tenantId: req.user.tenantId,
    },
    data: { priceListId: req.params.id },
  });

  sendSuccess(res, { assigned: result.count });
}));

export default router;
