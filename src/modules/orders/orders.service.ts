/**
 * Laundry Orders Service — שירות הזמנות כביסה
 * Core business logic: create, status lifecycle, payment, reporting
 */

import { prisma } from '../../config/database';
import { generateOrderNumber, generateItemBarcode } from './order-number.service';
import { logger } from '../../config/logger';
import { triggerAutomations } from '../automations/automations.routes';

// ─── Status State Machine ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  RECEIVED:         ['PROCESSING', 'PENDING_PICKUP', 'PACKAGING', 'CANCELLED'],
  PENDING_PICKUP:   ['PICKED_UP', 'PROCESSING', 'CANCELLED'],
  PICKED_UP:        ['PROCESSING', 'CANCELLED'],
  PROCESSING:       ['WASHING', 'PACKAGING', 'READY', 'CANCELLED'],
  WASHING:          ['DRYING', 'PROCESSING'],
  DRYING:           ['IRONING', 'PROCESSING'],
  IRONING:          ['PACKAGING', 'READY', 'PROCESSING'],
  PACKAGING:        ['READY'],
  READY:            ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED:        [],
  CANCELLED:        [],
};

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Create Order ─────────────────────────────────────────────────────────────

interface CreateOrderInput {
  tenantId: string;
  customerId: string;
  receivedById?: string;
  branchId?: string;
  priority?: 'NORMAL' | 'EXPRESS' | 'SAME_DAY';
  source?: 'STORE' | 'PICKUP' | 'ONLINE';
  deliveryType?: 'STORE_PICKUP' | 'HOME_DELIVERY';
  deliveryAddress?: any;
  deliveryFee?: number;
  notes?: string;
  specialInstructions?: string;
  promisedAt?: Date;
  items: {
    serviceId: string;
    description: string;
    category?: string;
    quantity?: number;
    color?: string;
    brand?: string;
    specialNotes?: string;
    weight?: number;
  }[];
}

export async function createOrder(input: CreateOrderInput) {
  const orderNumber = await generateOrderNumber(input.tenantId);
  const vatRate = 0.18;

  // Get service prices
  const serviceIds = [...new Set(input.items.map(i => i.serviceId))];
  const services = await prisma.laundryService.findMany({
    where: { id: { in: serviceIds }, tenantId: input.tenantId },
  });
  const serviceMap = new Map(services.map(s => [s.id, s]));

  // Calculate line totals
  const itemsData = input.items.map((item, idx) => {
    const svc = serviceMap.get(item.serviceId);
    if (!svc) throw new Error(`שירות לא נמצא: ${item.serviceId}`);

    const qty = item.quantity ?? 1;
    let unitPrice = Number(svc.basePrice);

    // Express multiplier
    if (input.priority === 'EXPRESS' || input.priority === 'SAME_DAY') {
      unitPrice *= Number(svc.expressMultiplier);
    }

    // Weight-based override
    if (item.weight && svc.pricePerKg) {
      unitPrice = Number(svc.pricePerKg) * item.weight;
    }

    const lineTotal = unitPrice * qty;
    const barcode = generateItemBarcode(orderNumber, idx + 1);

    return {
      serviceId: item.serviceId,
      description: item.description,
      category: (item.category as any) ?? 'OTHER',
      quantity: qty,
      unitPrice,
      lineTotal,
      barcode,
      color: item.color,
      brand: item.brand,
      specialNotes: item.specialNotes,
      weight: item.weight,
      status: 'ITEM_RECEIVED' as const,
    };
  });

  const subtotal = itemsData.reduce((sum, i) => sum + i.lineTotal, 0);
  const deliveryFee = input.deliveryFee ?? 0;
  const vatAmount = (subtotal + deliveryFee) * vatRate;
  const total = subtotal + deliveryFee + vatAmount;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.laundryOrder.create({
      data: {
        tenantId: input.tenantId,
        orderNumber,
        customerId: input.customerId,
        priority: (input.priority as any) ?? 'NORMAL',
        source: (input.source as any) ?? 'STORE',
        receivedById: input.receivedById,
        branchId: input.branchId,
        notes: input.notes,
        specialInstructions: input.specialInstructions,
        promisedAt: input.promisedAt,
        subtotal,
        deliveryFee,
        vatAmount,
        total,
        deliveryType: (input.deliveryType as any) ?? 'STORE_PICKUP',
        deliveryAddress: input.deliveryAddress,
        statusHistory: [{ status: 'RECEIVED', changedAt: new Date(), changedBy: input.receivedById, note: 'הזמנה נקלטה' }],
        items: {
          create: itemsData,
        },
      },
      include: { items: true, customer: true },
    });

    // Update customer stats
    const customerUpdate: any = {
      totalOrders: { increment: 1 },
      totalSpent:  { increment: total },
    };

    // Save delivery address as customer's default if HOME_DELIVERY
    if (input.deliveryType === 'HOME_DELIVERY' && input.deliveryAddress) {
      customerUpdate.defaultDeliveryAddress = input.deliveryAddress;
    }

    await tx.customer.update({
      where: { id: input.customerId },
      data: customerUpdate,
    });

    return created;
  });

  logger.info('Order created', { orderId: order.id, orderNumber, total });
  return order;
}

// ─── Advance Order Status ─────────────────────────────────────────────────────

export async function advanceOrderStatus(
  orderId: string,
  tenantId: string,
  newStatus: string,
  userId?: string,
  note?: string,
) {
  const order = await prisma.laundryOrder.findFirst({
    where: { id: orderId, tenantId },
  });
  if (!order) throw new Error('הזמנה לא נמצאה');

  if (!isValidTransition(order.status, newStatus)) {
    throw new Error(`מעבר לא חוקי: ${order.status} → ${newStatus}`);
  }

  const history = Array.isArray(order.statusHistory) ? order.statusHistory as any[] : [];
  history.push({ status: newStatus, changedAt: new Date(), changedBy: userId, note });

  const updateData: any = {
    status: newStatus,
    statusHistory: history,
  };

  if (newStatus === 'READY') updateData.completedAt = new Date();
  if (newStatus === 'DELIVERED') updateData.deliveredAt = new Date();

  const updated = await prisma.laundryOrder.update({
    where: { id: orderId },
    data: updateData,
    include: { items: true, customer: true },
  });

  logger.info('Order status updated', { orderId, from: order.status, to: newStatus });

  // Fire marketing automations (non-blocking)
  triggerAutomations(tenantId, 'ORDER_STATUS_CHANGE', {
    newStatus,
    customerName: (updated as any).customer?.name || '',
    customerPhone: (updated as any).customer?.phone || '',
    orderNumber: updated.orderNumber,
    status: newStatus,
    total: String(updated.total),
  }).catch(() => {});

  return updated;
}

// ─── Advance Item Status ──────────────────────────────────────────────────────

export async function advanceItemStatus(
  itemId: string,
  orderId: string,
  newStatus: string,
) {
  const updated = await prisma.laundryOrderItem.update({
    where: { id: itemId },
    data: {
      status: newStatus as any,
      stageUpdatedAt: new Date(),
    },
  });
  return updated;
}

// ─── Record Payment ───────────────────────────────────────────────────────────

export async function recordPayment(
  orderId: string,
  tenantId: string,
  amount: number,
  method: string,
) {
  const order = await prisma.laundryOrder.findFirst({
    where: { id: orderId, tenantId },
  });
  if (!order) throw new Error('הזמנה לא נמצאה');

  const newPaid = Number(order.paidAmount) + amount;
  const total = Number(order.total);
  const paymentStatus = newPaid >= total ? 'FULLY_PAID' : 'PARTIALLY_PAID';

  const updated = await prisma.laundryOrder.update({
    where: { id: orderId },
    data: {
      paidAmount: newPaid,
      paymentStatus: paymentStatus as any,
    },
  });

  logger.info('Payment recorded', { orderId, amount, method, paymentStatus });
  return updated;
}

// ─── Dashboard KPIs ───────────────────────────────────────────────────────────

export async function getDashboardKPIs(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    todayOrders,
    pendingCount,
    readyCount,
    todayRevenue,
    statusCounts,
  ] = await Promise.all([
    prisma.laundryOrder.count({
      where: { tenantId, receivedAt: { gte: today, lt: tomorrow } },
    }),
    prisma.laundryOrder.count({
      where: { tenantId, status: { in: ['RECEIVED', 'PROCESSING', 'WASHING', 'DRYING', 'IRONING'] } },
    }),
    prisma.laundryOrder.count({
      where: { tenantId, status: 'READY' },
    }),
    prisma.laundryOrder.aggregate({
      where: { tenantId, receivedAt: { gte: today, lt: tomorrow }, paymentStatus: 'FULLY_PAID' },
      _sum: { total: true },
    }),
    prisma.laundryOrder.groupBy({
      by: ['status'],
      where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      _count: true,
    }),
  ]);

  return {
    todayOrders,
    pendingCount,
    readyCount,
    todayRevenue: Number(todayRevenue._sum.total ?? 0),
    statusBreakdown: statusCounts.map(s => ({ status: s.status, count: s._count })),
  };
}

// ─── Daily Summary ────────────────────────────────────────────────────────────

export async function getDailySummary(tenantId: string, date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [received, completed, revenue, itemCount] = await Promise.all([
    prisma.laundryOrder.count({
      where: { tenantId, receivedAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.laundryOrder.count({
      where: { tenantId, deliveredAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.laundryOrder.aggregate({
      where: { tenantId, receivedAt: { gte: startOfDay, lt: endOfDay } },
      _sum: { total: true },
    }),
    prisma.laundryOrderItem.count({
      where: { order: { tenantId, receivedAt: { gte: startOfDay, lt: endOfDay } } },
    }),
  ]);

  return {
    date: startOfDay.toISOString().split('T')[0],
    ordersReceived: received,
    ordersCompleted: completed,
    totalRevenue: Number(revenue._sum.total ?? 0),
    totalItems: itemCount,
  };
}
