/**
 * Public Order Tracking — endpoint ציבורי למעקב הזמנות (ללא JWT)
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();

const TrackSchema = z.object({
  orderNumber: z.string().min(1),
  phone: z.string().optional(),
});

// POST /api/track — public order lookup
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = TrackSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const order = await prisma.laundryOrder.findFirst({
    where: { orderNumber: parsed.data.orderNumber },
    include: {
      customer: { select: { name: true, phone: true } },
      items: {
        select: {
          description: true, quantity: true, lineTotal: true,
          status: true, service: { select: { name: true } },
        },
      },
    },
  });

  if (!order) return sendError(res, 'הזמנה לא נמצאה', 404);

  // Verify phone if provided (compare last 7 digits)
  if (parsed.data.phone && order.customer?.phone) {
    const inputDigits = parsed.data.phone.replace(/\D/g, '').slice(-7);
    const customerDigits = order.customer.phone.replace(/\D/g, '').slice(-7);
    if (inputDigits !== customerDigits) {
      return sendError(res, 'הזמנה לא נמצאה', 404);
    }
  }

  // Return limited public data only
  sendSuccess(res, {
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customer?.name,
    items: order.items,
    subtotal: order.subtotal,
    vatAmount: order.vatAmount,
    total: order.total,
    paidAmount: order.paidAmount,
    receivedAt: order.receivedAt,
    promisedAt: order.promisedAt,
    completedAt: order.completedAt,
    deliveredAt: order.deliveredAt,
  });
}));

export default router;
