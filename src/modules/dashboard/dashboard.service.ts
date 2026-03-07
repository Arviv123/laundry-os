/**
 * Dashboard Service — שירות דשבורד
 * Laundry-specific KPIs and analytics
 */
import { prisma } from '../../config/database';

export async function getLaundryDashboard(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    todayOrders,
    pendingCount,
    readyCount,
    todayRevenue,
    weekRevenue,
    statusBreakdown,
    machineStats,
    topServices,
    recentOrders,
  ] = await Promise.all([
    // Today's orders
    prisma.laundryOrder.count({
      where: { tenantId, receivedAt: { gte: today, lt: tomorrow } },
    }),

    // In-process orders
    prisma.laundryOrder.count({
      where: { tenantId, status: { in: ['RECEIVED', 'PROCESSING', 'WASHING', 'DRYING', 'IRONING'] } },
    }),

    // Ready for pickup/delivery
    prisma.laundryOrder.count({
      where: { tenantId, status: 'READY' },
    }),

    // Today's revenue
    prisma.laundryOrder.aggregate({
      where: { tenantId, receivedAt: { gte: today, lt: tomorrow }, paymentStatus: { in: ['FULLY_PAID', 'PARTIALLY_PAID'] } },
      _sum: { paidAmount: true },
    }),

    // Week revenue
    prisma.laundryOrder.aggregate({
      where: { tenantId, receivedAt: { gte: weekAgo, lt: tomorrow }, paymentStatus: { in: ['FULLY_PAID', 'PARTIALLY_PAID'] } },
      _sum: { paidAmount: true },
    }),

    // Status breakdown
    prisma.laundryOrder.groupBy({
      by: ['status'],
      where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      _count: true,
    }),

    // Machine utilization
    prisma.machine.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    }),

    // Top services (last 30 days)
    prisma.laundryOrderItem.groupBy({
      by: ['serviceId'],
      where: { order: { tenantId, receivedAt: { gte: weekAgo } } },
      _count: true,
      _sum: { lineTotal: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: 5,
    }),

    // Recent orders
    prisma.laundryOrder.findMany({
      where: { tenantId },
      include: { customer: true, items: true },
      orderBy: { receivedAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    kpis: {
      todayOrders,
      pendingCount,
      readyCount,
      todayRevenue: Number(todayRevenue._sum.paidAmount ?? 0),
      weekRevenue: Number(weekRevenue._sum.paidAmount ?? 0),
    },
    statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count })),
    machineStats: machineStats.map(m => ({ status: m.status, count: m._count })),
    topServices,
    recentOrders,
  };
}
