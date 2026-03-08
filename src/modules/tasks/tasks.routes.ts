/**
 * Tasks Routes — ראוטים למשימות עובדים
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

const CreateTaskSchema = z.object({
  title: z.string().min(1, 'כותרת חובה'),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueDate: z.string().datetime().optional(),
  category: z.string().optional(),
  orderId: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  category: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── GET /my — My Tasks ─────────────────────────────────────────

router.get('/my', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tasks = await prisma.employeeTask.findMany({
    where: {
      tenantId: req.user.tenantId,
      assignedTo: req.user.userId,
    },
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ],
  });
  sendSuccess(res, tasks);
}));

// ─── GET / — List Tasks ─────────────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, assignedTo, priority, category } = req.query;

  const where: any = { tenantId: req.user.tenantId };
  if (status) where.status = status;
  if (assignedTo) where.assignedTo = assignedTo;
  if (priority) where.priority = priority;
  if (category) where.category = category;

  const tasks = await prisma.employeeTask.findMany({
    where,
    orderBy: [
      { createdAt: 'desc' },
    ],
  });
  sendSuccess(res, tasks);
}));

// ─── POST / — Create Task ───────────────────────────────────────

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = CreateTaskSchema.parse(req.body);

  const task = await prisma.employeeTask.create({
    data: {
      tenantId: req.user.tenantId,
      title: data.title,
      description: data.description,
      assignedTo: data.assignedTo,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      category: data.category,
      orderId: data.orderId,
      notes: data.notes,
      createdBy: req.user.userId,
    },
  });
  sendSuccess(res, task, 201);
}));

// ─── PATCH /:id — Update Task ───────────────────────────────────

router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = UpdateTaskSchema.parse(req.body);

  const existing = await prisma.employeeTask.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'משימה לא נמצאה', 404);

  const updateData: any = { ...data };
  if (data.dueDate !== undefined) {
    updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }
  // If status changes to COMPLETED, set completedAt
  if (data.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
    updateData.completedAt = new Date();
  }

  const task = await prisma.employeeTask.update({
    where: { id: req.params.id },
    data: updateData,
  });
  sendSuccess(res, task);
}));

// ─── PATCH /:id/complete — Mark Task Completed ──────────────────

router.patch('/:id/complete', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.employeeTask.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'משימה לא נמצאה', 404);

  const task = await prisma.employeeTask.update({
    where: { id: req.params.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  sendSuccess(res, task);
}));

// ─── DELETE /:id — Delete Task ──────────────────────────────────

router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.employeeTask.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!existing) return sendError(res, 'משימה לא נמצאה', 404);

  await prisma.employeeTask.delete({ where: { id: req.params.id } });
  sendSuccess(res, { deleted: true });
}));

export default router;
