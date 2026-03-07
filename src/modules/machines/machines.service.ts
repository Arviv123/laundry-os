/**
 * Machines Service — שירות ניהול מכונות
 */
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

export async function getMachineDashboard(tenantId: string) {
  const machines = await prisma.machine.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });

  const total = machines.length;
  const available = machines.filter(m => m.status === 'AVAILABLE').length;
  const running = machines.filter(m => m.status === 'RUNNING').length;
  const maintenance = machines.filter(m => m.status === 'MAINTENANCE').length;
  const outOfService = machines.filter(m => m.status === 'OUT_OF_SERVICE').length;

  return {
    total,
    available,
    running,
    maintenance,
    outOfService,
    utilization: total > 0 ? Math.round((running / total) * 100) : 0,
    machines,
  };
}

export async function updateMachineStatus(
  machineId: string,
  tenantId: string,
  newStatus: string,
  orderId?: string,
) {
  const machine = await prisma.machine.findFirst({
    where: { id: machineId, tenantId },
  });
  if (!machine) throw new Error('מכונה לא נמצאה');

  const data: any = { status: newStatus };
  if (newStatus === 'RUNNING' && orderId) {
    data.currentOrderId = orderId;
  }
  if (newStatus === 'AVAILABLE') {
    data.currentOrderId = null;
    if (machine.status === 'RUNNING') {
      data.totalCycles = { increment: 1 };
    }
  }
  if (newStatus === 'MAINTENANCE') {
    data.lastMaintenanceAt = new Date();
    data.currentOrderId = null;
  }

  const updated = await prisma.machine.update({
    where: { id: machineId },
    data,
  });

  logger.info('Machine status updated', { machineId, from: machine.status, to: newStatus });
  return updated;
}
