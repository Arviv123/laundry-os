/**
 * Delivery Routes — ראוטים למשלוחים
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { createDeliveryRun, completeStop, getPendingDeliveries } from './delivery.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const CreateRunSchema = z.object({
  driverId: z.string().min(1),
  date: z.string().datetime(),
  stops: z.array(z.object({
    orderId: z.string().min(1),
    type: z.enum(['PICKUP_STOP', 'DELIVERY_STOP']),
    address: z.record(z.any()),
    scheduledTime: z.string().datetime().optional(),
    notes: z.string().optional(),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

// ─── Pending Pickups & Deliveries ────────────────────────────────

router.get('/pending', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pending = await getPendingDeliveries(req.user.tenantId);
  sendSuccess(res, pending);
}));

// ─── List Runs ───────────────────────────────────────────────────

router.get('/runs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, driverId, date } = req.query;
  const where: any = { tenantId: req.user.tenantId };
  if (status) where.status = status;
  if (driverId) where.driverId = driverId;
  if (date) {
    const d = new Date(date as string);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.date = { gte: d, lt: next };
  }

  const runs = await prisma.deliveryRun.findMany({
    where,
    include: { stops: { include: { order: { include: { customer: true } } } }, driver: true },
    orderBy: { date: 'desc' },
  });
  sendSuccess(res, runs);
}));

// ─── Get Run Detail ──────────────────────────────────────────────

router.get('/runs/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const run = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { stops: { include: { order: { include: { customer: true, items: true } } } }, driver: true },
  });
  if (!run) return sendError(res, 'משלוח לא נמצא', 404);
  sendSuccess(res, run);
}));

// ─── Create Run ──────────────────────────────────────────────────

router.post('/runs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = CreateRunSchema.parse(req.body);
  const run = await createDeliveryRun({
    tenantId: req.user.tenantId,
    driverId: data.driverId,
    date: new Date(data.date),
    stops: data.stops.map(s => ({
      ...s,
      scheduledTime: s.scheduledTime ? new Date(s.scheduledTime) : undefined,
    })),
  });
  sendSuccess(res, run, 201);
}));

// ─── Start Run ───────────────────────────────────────────────────

router.patch('/runs/:id/start', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const run = await prisma.deliveryRun.update({
    where: { id: req.params.id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: { stops: true },
  });
  sendSuccess(res, run);
}));

// ─── Complete Stop ───────────────────────────────────────────────

router.patch('/runs/:id/stops/:stopId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { signature, notes } = req.body;
  const stop = await completeStop(req.params.stopId, signature, notes);
  sendSuccess(res, stop);
}));

export default router;
