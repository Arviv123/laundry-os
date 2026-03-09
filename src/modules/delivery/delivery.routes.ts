/**
 * Delivery Routes — ראוטים למשלוחים (נהגים + אדמין)
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
import {
  notifyCustomerNavigating,
  notifyCustomerPickedUp,
  notifyCustomerDelivered,
} from '../delivery-mgmt/delivery-notifications';

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

const ReorderSchema = z.object({
  stops: z.array(z.object({
    stopId: z.string().min(1),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

// ─── Pending Pickups & Deliveries ────────────────────────────────

router.get('/pending', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pending = await getPendingDeliveries(req.user.tenantId);
  sendSuccess(res, pending);
}));

// ─── My Active Run (for driver mode) ────────────────────────────

router.get('/runs/my', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Find runs where the driver is the current user
  const runs = await prisma.deliveryRun.findMany({
    where: {
      tenantId: req.user.tenantId,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
      driverId: req.user.userId,
    },
    include: {
      stops: { orderBy: { sortOrder: 'asc' }, include: { order: { include: { customer: true } } } },
      driver: true,
    },
    orderBy: { date: 'desc' },
  });
  sendSuccess(res, runs);
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
    include: {
      stops: { orderBy: { sortOrder: 'asc' }, include: { order: { include: { customer: true } } } },
      driver: true,
    },
    orderBy: { date: 'desc' },
  });
  sendSuccess(res, runs);
}));

// ─── Get Run Detail ──────────────────────────────────────────────

router.get('/runs/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const run = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      stops: {
        orderBy: { sortOrder: 'asc' },
        include: { order: { include: { customer: true, items: true } } },
      },
      driver: true,
    },
  });
  if (!run) return sendError(res, 'סיבוב לא נמצא', 404);
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
  const existing = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'סיבוב לא נמצא', 404);

  const run = await prisma.deliveryRun.update({
    where: { id: existing.id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: { stops: { orderBy: { sortOrder: 'asc' } } },
  });
  sendSuccess(res, run);
}));

// ─── Reorder Stops ───────────────────────────────────────────────

router.patch('/runs/:id/reorder', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { stops } = ReorderSchema.parse(req.body);

  const run = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!run) return sendError(res, 'סיבוב לא נמצא', 404);

  // If locked, only ADMIN/MANAGER can reorder
  if (run.isLocked && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return sendError(res, 'הסיבוב נעול — רק מנהל יכול לשנות סדר', 403);
  }

  // Verify all stops belong to this run
  const validStops = await prisma.deliveryStop.findMany({
    where: { deliveryRunId: run.id, id: { in: stops.map(s => s.stopId) } },
    select: { id: true },
  });
  const validIds = new Set(validStops.map(s => s.id));
  const invalidStops = stops.filter(s => !validIds.has(s.stopId));
  if (invalidStops.length > 0) return sendError(res, 'עצירות לא שייכות לסיבוב זה', 400);

  await prisma.$transaction(
    stops.map(s =>
      prisma.deliveryStop.update({
        where: { id: s.stopId },
        data: { sortOrder: s.sortOrder },
      })
    )
  );

  const updated = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id },
    include: {
      stops: { orderBy: { sortOrder: 'asc' }, include: { order: { include: { customer: true } } } },
      driver: true,
    },
  });
  sendSuccess(res, updated);
}));

// ─── Lock Run ────────────────────────────────────────────────────

router.patch('/runs/:id/lock', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return sendError(res, 'רק מנהל יכול לנעול סיבוב', 403);
  }
  const existing = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'סיבוב לא נמצא', 404);

  const run = await prisma.deliveryRun.update({
    where: { id: existing.id },
    data: { isLocked: true },
  });
  sendSuccess(res, run);
}));

// ─── Unlock Run ──────────────────────────────────────────────────

router.patch('/runs/:id/unlock', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return sendError(res, 'רק מנהל יכול לפתוח סיבוב', 403);
  }
  const existing = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'סיבוב לא נמצא', 404);

  const run = await prisma.deliveryRun.update({
    where: { id: existing.id },
    data: { isLocked: false },
  });
  sendSuccess(res, run);
}));

// ─── Navigate to Stop (sends WhatsApp) ──────────────────────────

router.post('/runs/:id/stops/:stopId/navigate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stop = await prisma.deliveryStop.findFirst({
    where: {
      id: req.params.stopId,
      deliveryRunId: req.params.id,
      deliveryRun: { tenantId: req.user.tenantId },
    },
    include: { order: { include: { customer: true } }, deliveryRun: { include: { driver: true } } },
  });
  if (!stop) return sendError(res, 'עצירה לא נמצאה', 404);

  const addr = stop.address as any;
  const addressStr = [addr?.street, addr?.city].filter(Boolean).join(', ');
  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(addressStr)}&navigate=yes`;

  const driverName = [stop.deliveryRun.driver?.firstName, stop.deliveryRun.driver?.lastName].filter(Boolean).join(' ') || 'השליח';
  await notifyCustomerNavigating(stop.deliveryRun.tenantId, stop.orderId, driverName);

  sendSuccess(res, { wazeUrl, addressStr });
}));

// ─── Arrive at Stop ──────────────────────────────────────────────

router.patch('/runs/:id/stops/:stopId/arrive', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Verify run belongs to tenant
  const run = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!run) return sendError(res, 'סיבוב לא נמצא', 404);

  // Verify stop belongs to this run
  const existingStop = await prisma.deliveryStop.findFirst({
    where: { id: req.params.stopId, deliveryRunId: run.id },
  });
  if (!existingStop) return sendError(res, 'עצירה לא נמצאה בסיבוב זה', 404);

  const stop = await prisma.deliveryStop.update({
    where: { id: existingStop.id },
    data: { status: 'ARRIVED' },
    include: { order: { include: { customer: true } } },
  });
  sendSuccess(res, stop);
}));

// ─── Complete Stop (with WhatsApp notifications) ─────────────────

router.patch('/runs/:id/stops/:stopId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { signature, notes, status: reqStatus } = req.body;

  // Verify run belongs to tenant and stop belongs to run
  const run = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!run) return sendError(res, 'סיבוב לא נמצא', 404);

  const existingStop = await prisma.deliveryStop.findFirst({
    where: { id: req.params.stopId, deliveryRunId: run.id },
    include: { order: { include: { customer: true } } },
  });
  if (!existingStop) return sendError(res, 'עצירה לא נמצאה בסיבוב זה', 404);

  if (reqStatus === 'FAILED') {
    const stop = await prisma.deliveryStop.update({
      where: { id: existingStop.id },
      data: { status: 'FAILED', notes },
      include: { order: true },
    });
    return sendSuccess(res, stop);
  }

  const metadata = (existingStop.order.customer?.metadata as any) || {};
  if (metadata.requireSignature && !signature) {
    return sendError(res, 'חתימה נדרשת עבור לקוח זה', 400);
  }

  const stop = await completeStop(req.params.stopId, signature, notes);

  // Send WhatsApp notification
  try {
    const run = await prisma.deliveryRun.findFirst({ where: { id: req.params.id } });
    if (run) {
      if (stop.type === 'PICKUP_STOP') {
        await notifyCustomerPickedUp(run.tenantId, stop.orderId);
      } else if (stop.type === 'DELIVERY_STOP') {
        await notifyCustomerDelivered(run.tenantId, stop.orderId);
      }
    }
  } catch {
    // Don't fail stop completion if notification fails
  }

  sendSuccess(res, stop);
}));

// ─── Complete Run ────────────────────────────────────────────────

router.patch('/runs/:id/complete', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.deliveryRun.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'סיבוב לא נמצא', 404);

  const run = await prisma.deliveryRun.update({
    where: { id: existing.id },
    data: { status: 'COMPLETED_RUN', completedAt: new Date() },
    include: { stops: true },
  });
  sendSuccess(res, run);
}));

// ─── Scan Barcode in Run ─────────────────────────────────────────

router.post('/runs/:id/scan', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { barcode } = req.body;
  if (!barcode) return sendError(res, 'ברקוד חובה', 400);

  const item = await prisma.laundryOrderItem.findFirst({
    where: { barcode, order: { tenantId: req.user.tenantId } },
    include: { order: { include: { customer: true } } },
  });
  if (!item) return sendError(res, 'פריט לא נמצא', 404);

  const stop = await prisma.deliveryStop.findFirst({
    where: { deliveryRunId: req.params.id, orderId: item.orderId },
    include: { order: { include: { customer: true } } },
  });
  if (!stop) return sendError(res, 'לא נמצאה עצירה מתאימה בסיבוב זה', 404);

  sendSuccess(res, { stop, order: item.order, item });
}));

export default router;
