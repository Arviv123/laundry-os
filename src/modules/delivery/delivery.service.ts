/**
 * Delivery Service — שירות משלוחים
 */
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

interface CreateDeliveryRunInput {
  tenantId: string;
  driverId: string;
  date: Date;
  stops: {
    orderId: string;
    type: 'PICKUP_STOP' | 'DELIVERY_STOP';
    address: any;
    scheduledTime?: Date;
    notes?: string;
    sortOrder: number;
  }[];
}

export async function createDeliveryRun(input: CreateDeliveryRunInput) {
  const run = await prisma.deliveryRun.create({
    data: {
      tenantId: input.tenantId,
      driverId: input.driverId,
      date: input.date,
      status: 'PLANNED',
      stops: {
        create: input.stops.map(stop => ({
          orderId: stop.orderId,
          type: stop.type,
          address: stop.address,
          scheduledTime: stop.scheduledTime,
          notes: stop.notes,
          sortOrder: stop.sortOrder,
          status: 'STOP_PENDING',
        })),
      },
    },
    include: { stops: { include: { order: { include: { customer: true } } } }, driver: true },
  });

  logger.info('Delivery run created', { runId: run.id, stops: input.stops.length });
  return run;
}

export async function completeStop(
  stopId: string,
  signature?: string,
  notes?: string,
) {
  const stop = await prisma.deliveryStop.update({
    where: { id: stopId },
    data: {
      status: 'STOP_COMPLETED',
      completedTime: new Date(),
      signature,
      notes,
    },
    include: { order: true },
  });

  // If this is a delivery stop, advance order status
  if (stop.type === 'DELIVERY_STOP' && stop.order) {
    await prisma.laundryOrder.update({
      where: { id: stop.orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
  }

  // Check if all stops in run are completed
  const run = await prisma.deliveryRun.findFirst({
    where: { id: stop.deliveryRunId },
    include: { stops: true },
  });
  if (run && run.stops.every(s => s.status === 'STOP_COMPLETED')) {
    await prisma.deliveryRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED_RUN', completedAt: new Date() },
    });
  }

  logger.info('Delivery stop completed', { stopId, orderId: stop.orderId, type: stop.type });
  return stop;
}

export async function getPendingDeliveries(tenantId: string) {
  const pickup = await prisma.laundryOrder.findMany({
    where: { tenantId, source: 'PICKUP', status: 'RECEIVED' },
    include: { customer: true },
    orderBy: { receivedAt: 'asc' },
  });

  const delivery = await prisma.laundryOrder.findMany({
    where: { tenantId, deliveryType: 'HOME_DELIVERY', status: 'READY' },
    include: { customer: true },
    orderBy: { completedAt: 'asc' },
  });

  return { pendingPickups: pickup, pendingDeliveries: delivery };
}
