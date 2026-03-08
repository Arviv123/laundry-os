/**
 * Delivery Management Routes — ראוטים לניהול משלוחים והקצאות נהגים
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ──────────────────────────────────────────

const CreateAssignmentSchema = z.object({
  driverId: z.string().min(1, 'נהג חובה'),
  orderId: z.string().min(1, 'הזמנה חובה'),
  type: z.enum(['PICKUP', 'DELIVERY']),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const UpdateAssignmentSchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED']).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  driverId: z.string().optional(),
});

const SignAssignmentSchema = z.object({
  signatureData: z.string().min(1, 'חתימה חובה'),
  signedBy: z.string().min(1, 'שם חותם חובה'),
});

// ─── GET /assignments — List Assignments ────────────────────────

router.get('/assignments', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { driverId, status, type } = req.query;

  const where: any = { tenantId: req.user.tenantId };
  if (driverId) where.driverId = driverId;
  if (status) where.status = status;
  if (type) where.type = type;

  const assignments = await prisma.deliveryAssignment.findMany({
    where,
    include: {
      order: {
        include: {
          customer: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Enrich with driver info
  const driverIds = [...new Set(assignments.map(a => a.driverId))];
  const drivers = driverIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: driverIds }, tenantId: req.user.tenantId },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  const enriched = assignments.map(a => ({
    ...a,
    driver: driverMap[a.driverId] || null,
  }));

  sendSuccess(res, enriched);
}));

// ─── POST /assignments — Create Assignment ──────────────────────

router.post('/assignments', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = CreateAssignmentSchema.parse(req.body);

  // Verify order exists and belongs to tenant
  const order = await prisma.laundryOrder.findFirst({
    where: { id: data.orderId, tenantId: req.user.tenantId },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);

  // Verify driver exists and belongs to tenant
  const driver = await prisma.user.findFirst({
    where: { id: data.driverId, tenantId: req.user.tenantId },
  });
  if (!driver) return sendError(res, 'נהג לא נמצא', 404);

  const assignment = await prisma.deliveryAssignment.create({
    data: {
      tenantId: req.user.tenantId,
      driverId: data.driverId,
      orderId: data.orderId,
      type: data.type,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      notes: data.notes,
    },
    include: {
      order: { include: { customer: true } },
    },
  });
  sendSuccess(res, assignment, 201);
}));

// ─── PATCH /assignments/:id — Update Assignment ─────────────────

router.patch('/assignments/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = UpdateAssignmentSchema.parse(req.body);

  const existing = await prisma.deliveryAssignment.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הקצאה לא נמצאה', 404);

  const updateData: any = { ...data };
  if (data.scheduledAt !== undefined) {
    updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  }
  if (data.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
    updateData.completedAt = new Date();
  }

  const assignment = await prisma.deliveryAssignment.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      order: { include: { customer: true } },
    },
  });
  sendSuccess(res, assignment);
}));

// ─── PATCH /assignments/:id/complete — Mark Completed ───────────

router.patch('/assignments/:id/complete', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.deliveryAssignment.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הקצאה לא נמצאה', 404);

  const assignment = await prisma.deliveryAssignment.update({
    where: { id: req.params.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
    include: {
      order: { include: { customer: true } },
    },
  });
  sendSuccess(res, assignment);
}));

// ─── POST /assignments/:id/sign — Save Digital Signature ────────

router.post('/assignments/:id/sign', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = SignAssignmentSchema.parse(req.body);

  const existing = await prisma.deliveryAssignment.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הקצאה לא נמצאה', 404);

  const assignment = await prisma.deliveryAssignment.update({
    where: { id: req.params.id },
    data: {
      signatureData: data.signatureData,
      signedBy: data.signedBy,
      signedAt: new Date(),
      status: 'COMPLETED',
      completedAt: existing.completedAt ?? new Date(),
    },
  });
  sendSuccess(res, assignment);
}));

// ─── GET /drivers — List Available Drivers ──────────────────────

router.get('/drivers', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const drivers = await prisma.user.findMany({
    where: {
      tenantId: req.user.tenantId,
      role: 'DRIVER',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
  sendSuccess(res, drivers);
}));

// ─── POST /auto-assign — Auto-Assign Pending Orders ─────────────

router.post('/auto-assign', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user.tenantId;

  // Get all active drivers
  const drivers = await prisma.user.findMany({
    where: { tenantId, role: 'DRIVER', isActive: true },
    select: { id: true },
  });

  if (drivers.length === 0) {
    return sendError(res, 'אין נהגים זמינים', 400);
  }

  // Get pending delivery orders that have no assignment yet
  const pendingOrders = await prisma.laundryOrder.findMany({
    where: {
      tenantId,
      deliveryType: 'HOME_DELIVERY',
      status: { in: ['RECEIVED', 'READY'] },
      deliveryAssignments: { none: {} },
    },
    select: { id: true, status: true },
  });

  if (pendingOrders.length === 0) {
    return sendSuccess(res, { assigned: 0, message: 'אין הזמנות ממתינות להקצאה' });
  }

  // Count current active assignments per driver for round-robin
  const activeCounts = await prisma.deliveryAssignment.groupBy({
    by: ['driverId'],
    where: {
      tenantId,
      status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] },
    },
    _count: true,
  });
  const countMap = Object.fromEntries(activeCounts.map(c => [c.driverId, c._count]));

  // Sort drivers by fewest active assignments (round-robin fairness)
  const sortedDrivers = [...drivers].sort(
    (a, b) => (countMap[a.id] ?? 0) - (countMap[b.id] ?? 0)
  );

  const created: any[] = [];
  let driverIndex = 0;

  for (const order of pendingOrders) {
    const driver = sortedDrivers[driverIndex % sortedDrivers.length];
    const type = order.status === 'RECEIVED' ? 'PICKUP' : 'DELIVERY';

    const assignment = await prisma.deliveryAssignment.create({
      data: {
        tenantId,
        driverId: driver.id,
        orderId: order.id,
        type,
        status: 'PENDING',
      },
    });
    created.push(assignment);
    driverIndex++;
  }

  sendSuccess(res, { assigned: created.length, assignments: created });
}));

export default router;
