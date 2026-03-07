/**
 * Machines Routes — ראוטים לניהול מכונות
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { getMachineDashboard, updateMachineStatus } from './machines.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const MachineSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['WASHER', 'DRYER', 'IRONER', 'FOLDER']),
  model: z.string().optional(),
  capacity: z.number().positive().optional(),
  branchId: z.string().optional(),
});

// ─── Dashboard ───────────────────────────────────────────────────

router.get('/dashboard', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const dashboard = await getMachineDashboard(req.user.tenantId);
  sendSuccess(res, dashboard);
}));

// ─── List Machines ───────────────────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, status, branchId } = req.query;
  const where: any = { tenantId: req.user.tenantId };
  if (type) where.type = type;
  if (status) where.status = status;
  if (branchId) where.branchId = branchId;

  const machines = await prisma.machine.findMany({
    where,
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, machines);
}));

// ─── Get Machine ─────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const machine = await prisma.machine.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!machine) return sendError(res, 'מכונה לא נמצאה', 404);
  sendSuccess(res, machine);
}));

// ─── Create Machine ──────────────────────────────────────────────

router.post('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = MachineSchema.parse(req.body);
  const machine = await prisma.machine.create({
    data: {
      ...data,
      tenantId: req.user.tenantId,
      status: 'AVAILABLE',
      totalCycles: 0,
    },
  });
  sendSuccess(res, machine, 201);
}));

// ─── Update Machine ──────────────────────────────────────────────

router.patch('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = MachineSchema.partial().parse(req.body);
  const machine = await prisma.machine.update({
    where: { id: req.params.id },
    data,
  });
  sendSuccess(res, machine);
}));

// ─── Change Machine Status ───────────────────────────────────────

router.patch('/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, orderId } = req.body;
  const machine = await updateMachineStatus(req.params.id, req.user.tenantId, status, orderId);
  sendSuccess(res, machine);
}));

export default router;
