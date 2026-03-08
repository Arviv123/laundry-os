/**
 * Recurring Laundry Orders Routes — ראוטים להזמנות כביסה חוזרות
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { generateOrderNumber } from '../orders/order-number.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ──────────────────────────────────────────

const CreateRecurringOrderSchema = z.object({
  customerId:      z.string().min(1, 'לקוח חובה'),
  daysOfWeek:      z.array(z.number().int().min(0).max(6)).min(1, 'יש לבחור לפחות יום אחד'),
  timeWindow:      z.enum(['morning', 'afternoon', 'evening']),
  pickupAddress:   z.record(z.any()),
  deliveryAddress: z.record(z.any()).optional(),
  deliveryType:    z.enum(['same', 'different', 'store']).default('same'),
  bags:            z.number().int().min(1).default(1),
  priority:        z.enum(['NORMAL', 'EXPRESS']).default('NORMAL'),
  instructions:    z.string().optional(),
  driverId:        z.string().optional(),
});

const UpdateRecurringOrderSchema = CreateRecurringOrderSchema.partial();

// ─── GET /recurring-orders — List Recurring Orders ───────────────

router.get('/recurring-orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.query;

  const where: any = { tenantId: req.user.tenantId };
  if (status) where.status = status;

  const orders = await prisma.recurringLaundryOrder.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });

  sendSuccess(res, orders);
}));

// ─── GET /recurring-orders/:id — Get Single Recurring Order ──────

router.get('/recurring-orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.recurringLaundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { customer: true },
  });

  if (!order) return sendError(res, 'הזמנה חוזרת לא נמצאה', 404);
  sendSuccess(res, order);
}));

// ─── POST /recurring-orders — Create Recurring Order ─────────────

router.post('/recurring-orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = CreateRecurringOrderSchema.parse(req.body);

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, tenantId: req.user.tenantId },
  });
  if (!customer) return sendError(res, 'לקוח לא נמצא', 404);

  const order = await prisma.recurringLaundryOrder.create({
    data: {
      tenantId: req.user.tenantId,
      customerId: data.customerId,
      daysOfWeek: data.daysOfWeek,
      timeWindow: data.timeWindow,
      pickupAddress: data.pickupAddress,
      deliveryAddress: data.deliveryAddress,
      deliveryType: data.deliveryType,
      bags: data.bags,
      priority: data.priority,
      instructions: data.instructions,
      driverId: data.driverId,
    },
    include: { customer: true },
  });

  sendSuccess(res, order, 201);
}));

// ─── PATCH /recurring-orders/:id — Update Recurring Order ────────

router.patch('/recurring-orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = UpdateRecurringOrderSchema.parse(req.body);

  const existing = await prisma.recurringLaundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הזמנה חוזרת לא נמצאה', 404);

  const order = await prisma.recurringLaundryOrder.update({
    where: { id: req.params.id },
    data,
    include: { customer: true },
  });

  sendSuccess(res, order);
}));

// ─── PATCH /recurring-orders/:id/pause — Pause Recurring Order ───

router.patch('/recurring-orders/:id/pause', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.recurringLaundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הזמנה חוזרת לא נמצאה', 404);

  const order = await prisma.recurringLaundryOrder.update({
    where: { id: req.params.id },
    data: { status: 'PAUSED' },
    include: { customer: true },
  });

  sendSuccess(res, order);
}));

// ─── PATCH /recurring-orders/:id/resume — Resume Recurring Order ─

router.patch('/recurring-orders/:id/resume', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.recurringLaundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הזמנה חוזרת לא נמצאה', 404);

  const order = await prisma.recurringLaundryOrder.update({
    where: { id: req.params.id },
    data: { status: 'ACTIVE' },
    include: { customer: true },
  });

  sendSuccess(res, order);
}));

// ─── DELETE /recurring-orders/:id — Cancel (soft delete) ─────────

router.delete('/recurring-orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.recurringLaundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'הזמנה חוזרת לא נמצאה', 404);

  const order = await prisma.recurringLaundryOrder.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
    include: { customer: true },
  });

  sendSuccess(res, order);
}));

// ─── POST /recurring-orders/generate — Generate Today's Orders ───

router.post('/recurring-orders/generate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user.tenantId;

  // Get current day of week in Israel timezone
  const nowInIsrael = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const todayDow = nowInIsrael.getDay(); // 0=Sunday .. 6=Saturday

  // Find all ACTIVE recurring orders where today's day is in daysOfWeek
  const recurringOrders = await prisma.recurringLaundryOrder.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      daysOfWeek: { has: todayDow },
    },
    include: { customer: true },
  });

  if (recurringOrders.length === 0) {
    return sendSuccess(res, { generated: 0 });
  }

  // Get first service for this tenant (fallback for order creation)
  const firstService = await prisma.laundryService.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!firstService) {
    return sendError(res, 'לא נמצא שירות פעיל לטנאנט', 400);
  }

  let generated = 0;

  for (const recurring of recurringOrders) {
    const orderNumber = await generateOrderNumber(tenantId);
    const unitPrice = Number(firstService.basePrice);

    // Create the laundry order
    const order = await prisma.laundryOrder.create({
      data: {
        tenantId,
        orderNumber,
        customerId: recurring.customerId,
        priority: recurring.priority as any,
        source: 'PICKUP' as any,
        deliveryType: 'HOME_DELIVERY' as any,
        deliveryAddress: (recurring.deliveryType === 'same'
          ? recurring.pickupAddress
          : (recurring.deliveryAddress ?? recurring.pickupAddress)) as any,
        notes: recurring.instructions,
        subtotal: unitPrice * recurring.bags,
        vatAmount: unitPrice * recurring.bags * 0.18,
        total: unitPrice * recurring.bags * 1.18,
        statusHistory: [{ status: 'RECEIVED', changedAt: new Date(), note: 'נוצר אוטומטית מהזמנה חוזרת' }],
        items: {
          create: Array.from({ length: recurring.bags }, (_, i) => ({
            serviceId: firstService.id,
            description: `שק כביסה ${i + 1}`,
            category: 'OTHER' as any,
            quantity: 1,
            unitPrice,
            lineTotal: unitPrice,
            barcode: `${orderNumber}-${String(i + 1).padStart(2, '0')}`,
          })),
        },
      },
    });

    // Create delivery assignment if driverId is set
    if (recurring.driverId) {
      await prisma.deliveryAssignment.create({
        data: {
          tenantId,
          driverId: recurring.driverId,
          orderId: order.id,
          type: 'PICKUP',
          status: 'PENDING',
        },
      });
    }

    // Update recurring order metadata
    await prisma.recurringLaundryOrder.update({
      where: { id: recurring.id },
      data: {
        lastRunDate: new Date(),
        totalOrdersCreated: { increment: 1 },
      },
    });

    generated++;
  }

  sendSuccess(res, { generated });
}));

export default router;
