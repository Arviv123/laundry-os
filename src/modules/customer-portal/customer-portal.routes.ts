/**
 * Customer Portal Routes — פורטל לקוח
 * Self-service: order tracking, request pickup
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

// ─── My Orders ───────────────────────────────────────────────────

router.get('/orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Find customer linked to this user
  const customer = await prisma.customer.findFirst({
    where: { tenantId: req.user.tenantId, email: req.user.email },
  });
  if (!customer) return sendError(res, 'לקוח לא נמצא', 404);

  const orders = await prisma.laundryOrder.findMany({
    where: { customerId: customer.id, tenantId: req.user.tenantId },
    include: { items: true },
    orderBy: { receivedAt: 'desc' },
    take: 50,
  });
  sendSuccess(res, orders);
}));

// ─── Order Tracking ──────────────────────────────────────────────

router.get('/orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findFirst({
    where: { tenantId: req.user.tenantId, email: req.user.email },
  });
  if (!customer) return sendError(res, 'לקוח לא נמצא', 404);

  const order = await prisma.laundryOrder.findFirst({
    where: { id: req.params.id, customerId: customer.id },
    include: { items: { include: { service: true } } },
  });
  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);
  sendSuccess(res, order);
}));

// ─── Request Pickup ──────────────────────────────────────────────

router.post('/orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findFirst({
    where: { tenantId: req.user.tenantId, email: req.user.email },
  });
  if (!customer) return sendError(res, 'לקוח לא נמצא', 404);

  const { address, notes, preferredDate } = z.object({
    address: z.record(z.any()),
    notes: z.string().optional(),
    preferredDate: z.string().datetime().optional(),
  }).parse(req.body);

  // Create a pickup request (minimal order, items added on arrival)
  const orderNumber = `ORD-${new Date().getFullYear()}-PICK-${Date.now().toString(36).toUpperCase()}`;

  const order = await prisma.laundryOrder.create({
    data: {
      tenantId: req.user.tenantId,
      orderNumber,
      customerId: customer.id,
      status: 'RECEIVED',
      priority: 'NORMAL',
      source: 'ONLINE',
      deliveryType: 'HOME_DELIVERY',
      deliveryAddress: address,
      notes: notes ?? 'בקשת איסוף מהלקוח',
      promisedAt: preferredDate ? new Date(preferredDate) : undefined,
      subtotal: 0,
      deliveryFee: 0,
      vatAmount: 0,
      total: 0,
      statusHistory: [{ status: 'RECEIVED', changedAt: new Date(), note: 'בקשת איסוף מהפורטל' }],
    },
  });

  sendSuccess(res, order, 201);
}));

// ─── My Prepaid Balance ──────────────────────────────────────────

router.get('/prepaid', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findFirst({
    where: { tenantId: req.user.tenantId, email: req.user.email },
  });
  if (!customer) return sendError(res, 'לקוח לא נמצא', 404);

  const account = await prisma.prepaidAccount.findFirst({
    where: { customerId: customer.id },
  });
  sendSuccess(res, account ?? { balance: 0 });
}));

export default router;
