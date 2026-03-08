/**
 * Laundry Orders Routes — ראוטים להזמנות כביסה
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import {
  createOrder,
  advanceOrderStatus,
  advanceItemStatus,
  recordPayment,
  getDashboardKPIs,
  getDailySummary,
} from './orders.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Schemas ─────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  customerId: z.string().min(1),
  receivedById: z.string().optional(),
  branchId: z.string().optional(),
  priority: z.enum(['NORMAL', 'EXPRESS', 'SAME_DAY']).default('NORMAL'),
  source: z.enum(['STORE', 'PICKUP', 'ONLINE']).default('STORE'),
  deliveryType: z.enum(['STORE_PICKUP', 'HOME_DELIVERY']).default('STORE_PICKUP'),
  deliveryAddress: z.record(z.any()).optional(),
  deliveryFee: z.number().min(0).optional(),
  notes: z.string().optional(),
  specialInstructions: z.string().optional(),
  promisedAt: z.string().datetime().optional(),
  items: z.array(z.object({
    serviceId: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(['SHIRT', 'PANTS', 'DRESS', 'SUIT', 'COAT', 'BEDDING', 'CURTAIN', 'TOWEL', 'OTHER', 'WASH', 'DRY_CLEAN', 'IRON', 'FOLD', 'SPECIAL']).optional(),
    quantity: z.number().int().min(1).optional(),
    color: z.string().optional(),
    brand: z.string().optional(),
    specialNotes: z.string().optional(),
    weight: z.number().min(0).optional(),
  })).min(1),
});

const StatusSchema = z.object({
  status: z.string().min(1),
  note: z.string().optional(),
});

const PaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'PREPAID']),
});

const SignatureSchema = z.object({
  signatureData: z.string().min(1),   // base64 PNG data URL
  signedBy: z.string().min(1),        // שם החותם
});

// ─── Dashboard KPIs ──────────────────────────────────────────────

router.get('/dashboard', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const kpis = await getDashboardKPIs(req.user.tenantId);
  sendSuccess(res, kpis);
}));

// ─── Daily Summary ───────────────────────────────────────────────

router.get('/daily-summary', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const summary = await getDailySummary(req.user.tenantId, date);
  sendSuccess(res, summary);
}));

// ─── Search by Barcode ───────────────────────────────────────────

router.get('/search/barcode/:code', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await prisma.laundryOrderItem.findFirst({
    where: { barcode: req.params.code, order: { tenantId: req.user.tenantId } },
    include: { order: { include: { customer: true } }, service: true },
  });
  if (!item) return sendError(res, 'פריט לא נמצא', 404);
  sendSuccess(res, item);
}));

// ─── List Orders ─────────────────────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, customerId, priority, search, deliveryType, page = '1', limit = '20' } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { tenantId: req.user.tenantId };
  if (status) {
    const statuses = (status as string).split(',').map(s => s.trim()).filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  }
  if (customerId) where.customerId = customerId;
  if (priority) where.priority = priority;
  if (deliveryType) where.deliveryType = deliveryType;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search as string, mode: 'insensitive' } },
      { customer: { name: { contains: search as string, mode: 'insensitive' } } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.laundryOrder.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { receivedAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.laundryOrder.count({ where }),
  ]);

  sendSuccess(res, { orders, total, page: Number(page), limit: Number(limit) });
}));

// ─── Get Order Detail ────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.laundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { customer: true, items: { include: { service: true } }, branch: true },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);
  sendSuccess(res, order);
}));

// ─── Get Order Timeline ──────────────────────────────────────────

router.get('/:id/timeline', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.laundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    select: { statusHistory: true, status: true, receivedAt: true, completedAt: true, deliveredAt: true },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);
  sendSuccess(res, order);
}));

// ─── Create Order ────────────────────────────────────────────────

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = CreateOrderSchema.parse(req.body);
  const order = await createOrder({
    ...data,
    tenantId: req.user.tenantId,
    promisedAt: data.promisedAt ? new Date(data.promisedAt) : undefined,
  });
  sendSuccess(res, order, 201);
}));

// ─── Update Order ────────────────────────────────────────────────

router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { notes, specialInstructions, promisedAt, deliveryType, deliveryAddress, deliveryFee } = req.body;
  const updated = await prisma.laundryOrder.update({
    where: { id: req.params.id },
    data: {
      ...(notes !== undefined && { notes }),
      ...(specialInstructions !== undefined && { specialInstructions }),
      ...(promisedAt !== undefined && { promisedAt: new Date(promisedAt) }),
      ...(deliveryType !== undefined && { deliveryType }),
      ...(deliveryAddress !== undefined && { deliveryAddress }),
      ...(deliveryFee !== undefined && { deliveryFee }),
    },
    include: { items: true, customer: true },
  });
  sendSuccess(res, updated);
}));

// ─── Advance Order Status ────────────────────────────────────────

router.patch('/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, note } = StatusSchema.parse(req.body);
  const order = await advanceOrderStatus(
    req.params.id, req.user.tenantId, status, req.user.userId, note,
  );
  sendSuccess(res, order);
}));

// ─── Cancel Order ────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await advanceOrderStatus(
    req.params.id, req.user.tenantId, 'CANCELLED', req.user.userId, 'הזמנה בוטלה',
  );
  sendSuccess(res, order);
}));

// ─── Record Payment ──────────────────────────────────────────────

router.post('/:id/payment', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { amount, method } = PaymentSchema.parse(req.body);
  const order = await recordPayment(req.params.id, req.user.tenantId, amount, method);
  sendSuccess(res, order);
}));

// ─── Save Signature ─────────────────────────────────────────────

router.post('/:id/signature', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { signatureData, signedBy } = SignatureSchema.parse(req.body);

  const order = await prisma.laundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);

  // Append signature event to status history
  const history = Array.isArray(order.statusHistory) ? order.statusHistory as any[] : [];
  history.push({
    type: 'SIGNATURE',
    signedBy,
    signedAt: new Date(),
    note: `חתימה דיגיטלית התקבלה מ-${signedBy}`,
  });

  const updated = await prisma.laundryOrder.update({
    where: { id: order.id },
    data: {
      signatureData,
      signedBy,
      signedAt: new Date(),
      statusHistory: history,
    },
    include: { items: true, customer: true },
  });

  sendSuccess(res, updated);
}));

// ─── Get Signature ──────────────────────────────────────────────

router.get('/:id/signature', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.laundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    select: { signatureData: true, signedBy: true, signedAt: true },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);
  if (!order.signatureData) return sendError(res, 'לא נמצאה חתימה להזמנה זו', 404);
  sendSuccess(res, order);
}));

// ─── Add Item ────────────────────────────────────────────────────

router.post('/:id/items', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.laundryOrder.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { items: true },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);

  const { serviceId, description, category, quantity = 1, color, brand, specialNotes, weight } = req.body;
  const service = await prisma.laundryService.findFirst({ where: { id: serviceId, tenantId: req.user.tenantId } });
  if (!service) return sendError(res, 'שירות לא נמצא', 404);

  const unitPrice = Number(service.basePrice);
  const lineTotal = unitPrice * quantity;
  const barcode = `${order.orderNumber}-${String(order.items.length + 1).padStart(2, '0')}`;

  const item = await prisma.laundryOrderItem.create({
    data: {
      orderId: order.id, serviceId, description,
      category: category ?? 'OTHER', quantity, unitPrice, lineTotal,
      barcode, color, brand, specialNotes, weight,
      status: 'ITEM_RECEIVED',
    },
  });

  // Recalculate totals
  const allItems = await prisma.laundryOrderItem.findMany({ where: { orderId: order.id } });
  const subtotal = allItems.reduce((s, i) => s + Number(i.lineTotal), 0);
  const deliveryFee = Number(order.deliveryFee);
  const vatAmount = (subtotal + deliveryFee) * 0.18;
  const total = subtotal + deliveryFee + vatAmount;

  await prisma.laundryOrder.update({
    where: { id: order.id },
    data: { subtotal, vatAmount, total },
  });

  sendSuccess(res, item, 201);
}));

// ─── Update Item ─────────────────────────────────────────────────

router.patch('/:id/items/:itemId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { description, specialNotes, color, brand } = req.body;
  const item = await prisma.laundryOrderItem.update({
    where: { id: req.params.itemId },
    data: {
      ...(description !== undefined && { description }),
      ...(specialNotes !== undefined && { specialNotes }),
      ...(color !== undefined && { color }),
      ...(brand !== undefined && { brand }),
    },
  });
  sendSuccess(res, item);
}));

// ─── Advance Item Status ─────────────────────────────────────────

router.patch('/:id/items/:itemId/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status } = StatusSchema.parse(req.body);
  const item = await advanceItemStatus(req.params.itemId, req.params.id, status);
  sendSuccess(res, item);
}));

// ─── Delete Item ─────────────────────────────────────────────────

router.delete('/:id/items/:itemId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await prisma.laundryOrderItem.delete({ where: { id: req.params.itemId } });

  // Recalculate totals
  const order = await prisma.laundryOrder.findFirst({ where: { id: req.params.id } });
  if (order) {
    const allItems = await prisma.laundryOrderItem.findMany({ where: { orderId: order.id } });
    const subtotal = allItems.reduce((s, i) => s + Number(i.lineTotal), 0);
    const deliveryFee = Number(order.deliveryFee);
    const vatAmount = (subtotal + deliveryFee) * 0.18;
    const total = subtotal + deliveryFee + vatAmount;
    await prisma.laundryOrder.update({
      where: { id: order.id },
      data: { subtotal, vatAmount, total },
    });
  }

  sendSuccess(res, { deleted: true });
}));

export default router;
