import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Bank Statements (Reconciliation Sessions) ────────────────────

// GET /bank-recon — list all statements for tenant
router.get('/', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { accountId, year } = req.query;

  const where = withTenant(req, {
    ...(accountId ? { accountId: accountId as string } : {}),
    ...(year      ? { period: { startsWith: year as string } } : {}),
  });

  const statements = await prisma.bankStatement.findMany({
    where,
    include: { account: { select: { code: true, name: true } } },
    orderBy: { period: 'desc' },
  });

  // Enrich with cleared/uncleared counts
  const enriched = await Promise.all(statements.map(async (s) => {
    const lines = await prisma.transactionLine.findMany({
      where: { bankStatementId: s.id },
      select: { cleared: true, amount: true, debitAccountId: true, creditAccountId: true },
    });
    const cleared = lines.filter(l => l.cleared).length;
    return { ...s, lineCount: lines.length, clearedCount: cleared };
  }));

  sendSuccess(res, enriched);
}));

// POST /bank-recon — create a new reconciliation session
router.post('/', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    accountId:      z.string().cuid(),
    period:         z.string().regex(/^\d{4}-\d{2}$/),
    openingBalance: z.number().default(0),
    closingBalance: z.number(),
    notes:          z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Verify account belongs to tenant
  const account = await prisma.account.findUnique({ where: { id: parsed.data.accountId } });
  if (!account || account.tenantId !== req.user.tenantId) { sendError(res, 'Account not found', 404); return; }

  try {
    const statement = await prisma.bankStatement.create({
      data: {
        tenantId:       req.user.tenantId,
        accountId:      parsed.data.accountId,
        period:         parsed.data.period,
        openingBalance: parsed.data.openingBalance,
        closingBalance: parsed.data.closingBalance,
        notes:          parsed.data.notes,
        createdBy:      req.user.userId,
      },
      include: { account: { select: { code: true, name: true } } },
    });
    sendSuccess(res, statement, 201);
  } catch (err: any) {
    if (err.code === 'P2002') sendError(res, 'הכנה להתאמה לתקופה זו כבר קיימת', 409);
    else throw err;
  }
}));

// GET /bank-recon/:id — get statement with all GL transactions for that account+period
router.get('/:id', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const statement = await prisma.bankStatement.findUnique({
    where:   { id: req.params.id },
    include: { account: { select: { id: true, code: true, name: true } } },
  });
  if (!statement || statement.tenantId !== req.user.tenantId) { sendError(res, 'Statement not found', 404); return; }

  // Get all GL transaction lines for this account in this period
  const [year, month] = statement.period.split('-').map(Number);
  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 0, 23, 59, 59);

  const glLines = await prisma.transactionLine.findMany({
    where: {
      OR: [
        { debitAccountId: statement.accountId },
        { creditAccountId: statement.accountId },
      ],
      transaction: {
        tenantId: req.user.tenantId,
        status:   'POSTED',
        date:     { gte: from, lte: to },
      },
    },
    include: {
      transaction: { select: { id: true, date: true, reference: true, description: true, sourceType: true } },
    },
    orderBy: { transaction: { date: 'asc' } },
  });

  // Compute amounts relative to this bank account (debit = money in, credit = money out for ASSET)
  const enriched = glLines.map(line => {
    const isDebit  = line.debitAccountId  === statement.accountId;
    const isCredit = line.creditAccountId === statement.accountId;
    const amount   = Number(line.amount);
    // For bank (ASSET): debit increases balance, credit decreases balance
    const netAmount = isDebit ? amount : isCredit ? -amount : 0;
    return {
      id:            line.id,
      date:          line.transaction.date,
      reference:     line.transaction.reference,
      description:   line.description ?? line.transaction.description,
      sourceType:    line.transaction.sourceType,
      amount:        netAmount,
      cleared:       line.cleared,
      clearedAt:     line.clearedAt,
      bankStatementId: line.bankStatementId,
      transactionId: line.transactionId,
    };
  });

  // Compute reconciliation summary
  const clearedLines  = enriched.filter(l => l.cleared && l.bankStatementId === statement.id);
  const clearedSum    = clearedLines.reduce((s, l) => s + l.amount, 0);
  const computedBalance = Number(statement.openingBalance) + clearedSum;
  const difference    = Number(statement.closingBalance) - computedBalance;

  sendSuccess(res, {
    statement: {
      ...statement,
      openingBalance: Number(statement.openingBalance),
      closingBalance: Number(statement.closingBalance),
    },
    glLines:       enriched,
    summary: {
      openingBalance:  Number(statement.openingBalance),
      closingBalance:  Number(statement.closingBalance),
      clearedCount:    clearedLines.length,
      clearedSum:      Math.round(clearedSum * 100) / 100,
      computedBalance: Math.round(computedBalance * 100) / 100,
      difference:      Math.round(difference * 100) / 100,
      isReconciled:    Math.abs(difference) < 0.01,
    },
  });
}));

// PATCH /bank-recon/lines/:lineId/clear — toggle cleared status
router.patch('/lines/:lineId/clear', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    cleared:         z.boolean(),
    bankStatementId: z.string().cuid(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Verify statement belongs to tenant
  const statement = await prisma.bankStatement.findUnique({ where: { id: parsed.data.bankStatementId } });
  if (!statement || statement.tenantId !== req.user.tenantId) { sendError(res, 'Statement not found', 404); return; }
  if (statement.status === 'RECONCILED') { sendError(res, 'Cannot modify a reconciled statement', 400); return; }

  // Verify the GL line exists and belongs to this tenant (via its transaction)
  const line = await prisma.transactionLine.findUnique({
    where:   { id: req.params.lineId },
    include: { transaction: { select: { tenantId: true } } },
  });
  if (!line || line.transaction.tenantId !== req.user.tenantId) { sendError(res, 'Transaction line not found', 404); return; }

  const updated = await prisma.transactionLine.update({
    where: { id: req.params.lineId },
    data: {
      cleared:         parsed.data.cleared,
      clearedAt:       parsed.data.cleared ? new Date() : null,
      bankStatementId: parsed.data.cleared ? parsed.data.bankStatementId : null,
    },
  });

  sendSuccess(res, { id: updated.id, cleared: updated.cleared, clearedAt: updated.clearedAt });
}));

// POST /bank-recon/:id/reconcile — mark statement as reconciled (only if difference = 0)
router.post('/:id/reconcile', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const statement = await prisma.bankStatement.findUnique({ where: { id: req.params.id } });
  if (!statement || statement.tenantId !== req.user.tenantId) { sendError(res, 'Statement not found', 404); return; }
  if (statement.status === 'RECONCILED') { sendError(res, 'Already reconciled', 400); return; }

  const updated = await prisma.bankStatement.update({
    where: { id: req.params.id },
    data:  { status: 'RECONCILED', reconciledAt: new Date() },
  });
  sendSuccess(res, updated);
}));

export default router;
