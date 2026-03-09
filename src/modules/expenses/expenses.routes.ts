import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── List expense reports ────────────────────────────────────
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const reports = await prisma.expenseReport.findMany({
    where: { tenantId: req.user!.tenantId },
    include: {
      expenses: true,
      employee: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, reports);
}));

// ─── Get single report ──────────────────────────────────────
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    include: { expenses: true, employee: { select: { firstName: true, lastName: true } } },
  });
  if (!report) return sendError(res, 'Report not found', 404);
  sendSuccess(res, report);
}));

// ─── Create report ──────────────────────────────────────────
const CreateReportSchema = z.object({
  title:      z.string().min(1),
  period:     z.string().min(1),
  employeeId: z.string(),
  notes:      z.string().optional(),
});

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CreateReportSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const report = await prisma.expenseReport.create({
    data: { ...parsed.data, tenantId: req.user!.tenantId },
  });
  sendSuccess(res, report, 201);
}));

// ─── Add expense to report ──────────────────────────────────
const AddExpenseSchema = z.object({
  date:        z.string().transform(s => new Date(s)),
  category:    z.string().min(1),
  description: z.string().min(1),
  amount:      z.number().positive(),
  vatAmount:   z.number().min(0).default(0),
  receiptUrl:  z.string().optional(),
  notes:       z.string().optional(),
});

router.post('/:id/expenses', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = AddExpenseSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const report = await prisma.expenseReport.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!report) return sendError(res, 'Report not found', 404);

  const expense = await prisma.expense.create({
    data: { ...parsed.data, reportId: req.params.id, tenantId: req.user!.tenantId },
  });

  // Update report total
  await prisma.expenseReport.update({
    where: { id: req.params.id },
    data: { totalAmount: { increment: parsed.data.amount } },
  });

  sendSuccess(res, expense, 201);
}));

// ─── Delete expense ─────────────────────────────────────────
router.delete('/:reportId/expenses/:expenseId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const expense = await prisma.expense.findFirst({
    where: { id: req.params.expenseId, reportId: req.params.reportId, tenantId: req.user!.tenantId },
  });
  if (!expense) return sendError(res, 'Expense not found', 404);

  await prisma.expense.delete({ where: { id: expense.id } });
  await prisma.expenseReport.update({
    where: { id: req.params.reportId },
    data: { totalAmount: { decrement: Number(expense.amount) } },
  });
  sendSuccess(res, { message: 'Expense deleted' });
}));

// ─── Approve / Reject report (admin/accountant only) ────────
router.patch('/:id/status', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, rejectedReason } = req.body;
  if (!['APPROVED', 'REJECTED', 'SUBMITTED'].includes(status)) {
    return sendError(res, 'Invalid status', 400);
  }

  const report = await prisma.expenseReport.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!report) return sendError(res, 'Report not found', 404);

  const data: any = { status };
  if (status === 'APPROVED') {
    data.approvedBy = req.user!.userId;
    data.approvedAt = new Date();
  }
  if (status === 'REJECTED') data.rejectedReason = rejectedReason;

  const updated = await prisma.expenseReport.update({
    where: { id: req.params.id },
    data,
  });
  sendSuccess(res, updated);
}));

// ─── Delete report ──────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!report) return sendError(res, 'Report not found', 404);

  await prisma.expenseReport.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Report deleted' });
}));

export default router;
