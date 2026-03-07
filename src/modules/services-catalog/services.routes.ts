/**
 * Laundry Services Catalog — קטלוג שירותי כביסה
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const ServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['WASH', 'DRY_CLEAN', 'IRON', 'FOLD', 'SPECIAL']).default('WASH'),
  basePrice: z.number().positive(),
  expressMultiplier: z.number().min(1).default(1.5),
  pricePerKg: z.number().positive().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// ─── List Services ───────────────────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { category, active } = req.query;
  const where: any = { tenantId: req.user.tenantId };
  if (category) where.category = category;
  if (active !== undefined) where.isActive = active === 'true';

  const services = await prisma.laundryService.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });
  sendSuccess(res, services);
}));

// ─── Get Service ─────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const service = await prisma.laundryService.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!service) return sendError(res, 'שירות לא נמצא', 404);
  sendSuccess(res, service);
}));

// ─── Create Service ──────────────────────────────────────────────

router.post('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = ServiceSchema.parse(req.body);
  const service = await prisma.laundryService.create({
    data: { ...data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, service, 201);
}));

// ─── Update Service ──────────────────────────────────────────────

router.patch('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = ServiceSchema.partial().parse(req.body);
  const service = await prisma.laundryService.update({
    where: { id: req.params.id },
    data,
  });
  sendSuccess(res, service);
}));

// ─── Deactivate Service ──────────────────────────────────────────

router.delete('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const service = await prisma.laundryService.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  sendSuccess(res, service);
}));

export default router;
