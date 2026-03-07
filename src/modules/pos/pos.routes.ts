import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as InventoryService from '../inventory/inventory.service';
import { createTransaction } from '../accounting/accounting.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Terminals ────────────────────────────────────────────────────

router.get('/terminals', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const terminals = await prisma.posTerminal.findMany({
    where:   withTenant(req, { isActive: true }),
    include: {
      sessions: { where: { status: 'OPEN' }, take: 1 },
      branch:   { select: { id: true, name: true, code: true } },
    },
  });
  sendSuccess(res, terminals);
}));

router.post('/terminals', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:           z.string().min(1),
    location:       z.string().optional(),
    branchId:       z.string().cuid().optional(),
    glCashCode:     z.string().optional(),
    glBankCode:     z.string().optional(),
    glRevenueCode:  z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Validate branchId belongs to this tenant
  if (parsed.data.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
    if (!branch || branch.tenantId !== req.user.tenantId) { sendError(res, 'Branch not found', 404); return; }
  }

  const terminal = await prisma.posTerminal.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  sendSuccess(res, terminal, 201);
}));

// PATCH /pos/terminals/:id — update terminal settings
router.patch('/terminals/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const terminal = await prisma.posTerminal.findUnique({ where: { id: req.params.id } });
  if (!terminal || terminal.tenantId !== req.user.tenantId) { sendError(res, 'Terminal not found', 404); return; }

  const schema = z.object({
    name:           z.string().min(1).optional(),
    location:       z.string().optional(),
    branchId:       z.string().cuid().nullable().optional(),
    glCashCode:     z.string().optional(),
    glBankCode:     z.string().optional(),
    glRevenueCode:  z.string().optional(),
    isActive:       z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  if (parsed.data.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
    if (!branch || branch.tenantId !== req.user.tenantId) { sendError(res, 'Branch not found', 404); return; }
  }

  const updated = await prisma.posTerminal.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  sendSuccess(res, updated);
}));

// ─── Sessions ─────────────────────────────────────────────────────

// POST /pos/sessions/open — open a new session
router.post('/sessions/open', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    terminalId:   z.string().cuid(),
    openingFloat: z.number().min(0).default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Check terminal belongs to tenant
  const terminal = await prisma.posTerminal.findUnique({ where: { id: parsed.data.terminalId } });
  if (!terminal || terminal.tenantId !== req.user.tenantId) { sendError(res, 'Terminal not found', 404); return; }

  // Check no open session on this terminal
  const openSession = await prisma.posSession.findFirst({
    where: { terminalId: parsed.data.terminalId, status: 'OPEN' },
  });
  if (openSession) { sendError(res, 'Terminal already has an open session', 400); return; }

  const session = await prisma.posSession.create({
    data: {
      tenantId:     req.user.tenantId,
      terminalId:   parsed.data.terminalId,
      openedBy:     req.user.userId,
      openingFloat: parsed.data.openingFloat,
      status:       'OPEN',
    },
    include: { terminal: { select: { name: true } } },
  });
  sendSuccess(res, session, 201);
}));

// POST /pos/sessions/:id/close — close session
router.post('/sessions/:id/close', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ closingFloat: z.number().min(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const session = await prisma.posSession.findUnique({
    where:   { id: req.params.id },
    include: { transactions: { where: { type: 'SALE' }, select: { total: true } } },
  });
  if (!session || session.tenantId !== req.user.tenantId) { sendError(res, 'Session not found', 404); return; }
  if (session.status !== 'OPEN') { sendError(res, 'Session is already closed', 400); return; }

  const totalSales   = session.transactions.reduce((s, t) => s + Number(t.total), 0);

  const updated = await prisma.posSession.update({
    where: { id: req.params.id },
    data: {
      status:       'CLOSED',
      closedBy:     req.user.userId,
      closingFloat: parsed.data.closingFloat,
      totalSales,
      closedAt:     new Date(),
    },
  });
  sendSuccess(res, updated);
}));

// GET /pos/sessions — list sessions
router.get('/sessions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { terminalId, status, page = '1', pageSize = '25' } = req.query;
  const where = withTenant(req, {
    ...(terminalId ? { terminalId: terminalId as string } : {}),
    ...(status     ? { status: status as any }           : {}),
  });
  const [items, total] = await Promise.all([
    prisma.posSession.findMany({
      where,
      include: { terminal: { select: { name: true } }, _count: { select: { transactions: true } } },
      orderBy: { openedAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.posSession.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total });
}));

// ─── Transactions (Sales) ─────────────────────────────────────────

const TransactionLineSchema = z.object({
  productId:   z.string().cuid().optional(),
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitPrice:   z.number().min(0),
  discount:    z.number().min(0).default(0),
  vatRate:     z.number().min(0).max(1).default(0.18),
});

// POST /pos/transactions — create a sale
router.post('/transactions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    sessionId:     z.string().cuid(),
    customerId:    z.string().cuid().optional(),
    type:          z.enum(['SALE', 'RETURN']).default('SALE'),
    lines:         z.array(TransactionLineSchema).min(1),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'OTHER']),
    amountPaid:    z.number().min(0),
    discount:      z.number().min(0).default(0),
    notes:         z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Validate session + fetch terminal for GL account codes
  const session = await prisma.posSession.findUnique({
    where: { id: parsed.data.sessionId },
    include: { terminal: { select: { glCashCode: true, glBankCode: true, glRevenueCode: true, name: true, branch: { select: { name: true } } } } },
  });
  if (!session || session.tenantId !== req.user.tenantId) { sendError(res, 'Session not found', 404); return; }
  if (session.status !== 'OPEN') { sendError(res, 'Session is closed', 400); return; }

  // Calculate totals
  const lines = parsed.data.lines.map(l => {
    const lineTotal = (l.quantity * l.unitPrice - l.discount) * (1 + l.vatRate);
    const vatAmount = (l.quantity * l.unitPrice - l.discount) * l.vatRate;
    return { ...l, lineTotal: Math.round(lineTotal * 100) / 100, vatAmount };
  });

  const subtotal  = lines.reduce((s, l) => s + (l.quantity * l.unitPrice - l.discount), 0);
  const vatAmount = lines.reduce((s, l) => s + l.vatAmount, 0);
  const total     = subtotal + vatAmount - parsed.data.discount;
  const change    = parsed.data.amountPaid - total;

  if (change < -0.01) { sendError(res, 'Amount paid is less than total', 400); return; }

  // Find default warehouse for stock deduction
  const defaultWarehouse = await prisma.warehouse.findFirst({
    where: { tenantId: req.user.tenantId, isDefault: true, isActive: true },
  });

  const transaction = await prisma.$transaction(async (tx) => {
    // Generate receipt number
    const count = await tx.posTransaction.count({ where: { tenantId: req.user.tenantId } });
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const created = await tx.posTransaction.create({
      data: {
        tenantId:      req.user.tenantId,
        sessionId:     parsed.data.sessionId,
        customerId:    parsed.data.customerId,
        type:          parsed.data.type,
        subtotal,
        vatAmount,
        total,
        discount:      parsed.data.discount,
        paymentMethod: parsed.data.paymentMethod,
        amountPaid:    parsed.data.amountPaid,
        change:        Math.max(0, change),
        receiptNumber,
        notes:         parsed.data.notes,
        lines: {
          create: lines.map(l => ({
            productId:   l.productId,
            description: l.description,
            quantity:    l.quantity,
            unitPrice:   l.unitPrice,
            discount:    l.discount,
            vatRate:     l.vatRate,
            lineTotal:   l.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });

    // Update session totals
    if (parsed.data.type === 'SALE') {
      await tx.posSession.update({
        where: { id: parsed.data.sessionId },
        data:  { totalSales: { increment: total } },
      });
    } else {
      await tx.posSession.update({
        where: { id: parsed.data.sessionId },
        data:  { totalReturns: { increment: total } },
      });
    }

    return created;
  });

  // ── GL journal entry (best-effort) ──────────────────────────────
  try {
    const isCash = parsed.data.paymentMethod === 'CASH';
    // Use per-terminal GL account codes if configured, otherwise use defaults
    const term       = (session as any).terminal;
    const cashCode    = term?.glCashCode    || '1100';
    const bankCode    = term?.glBankCode    || '1200';
    const revenueCode = term?.glRevenueCode || '6100';
    const branchLabel = term?.branch?.name ? ` [${term.branch.name}]` : '';

    const [cashAcc, bankAcc, revenueAcc, vatAcc] = await Promise.all([
      prisma.account.findFirst({ where: { tenantId: req.user.tenantId, code: cashCode,    isActive: true } }),
      prisma.account.findFirst({ where: { tenantId: req.user.tenantId, code: bankCode,    isActive: true } }),
      prisma.account.findFirst({ where: { tenantId: req.user.tenantId, code: revenueCode, isActive: true } }),
      prisma.account.findFirst({ where: { tenantId: req.user.tenantId, code: '3200',      isActive: true } }),
    ]);

    const debitAcc       = isCash ? cashAcc : bankAcc;
    const rSubtotal      = Math.round(subtotal  * 100) / 100;
    const rVat           = Math.round(vatAmount * 100) / 100;
    const isSale         = parsed.data.type === 'SALE';

    if (debitAcc && revenueAcc && rSubtotal > 0) {
      const glLines: { debitAccountId: string; creditAccountId: string; amount: number; description: string }[] = [
        {
          debitAccountId:  isSale ? debitAcc.id   : revenueAcc.id,
          creditAccountId: isSale ? revenueAcc.id : debitAcc.id,
          amount:          rSubtotal,
          description:     `קופה ${transaction.receiptNumber}${branchLabel} — הכנסות`,
        },
      ];

      if (vatAcc && rVat > 0.001) {
        glLines.push({
          debitAccountId:  isSale ? debitAcc.id : vatAcc.id,
          creditAccountId: isSale ? vatAcc.id   : debitAcc.id,
          amount:          rVat,
          description:     `קופה ${transaction.receiptNumber}${branchLabel} — מע"מ`,
        });
      }

      await createTransaction({
        tenantId:    req.user.tenantId,
        date:        new Date(),
        reference:   transaction.receiptNumber!,
        description: `${isSale ? 'מכירה' : 'החזר'} קופה — ${transaction.receiptNumber}${branchLabel}`,
        sourceType:  'POS',
        sourceId:    transaction.id,
        createdBy:   req.user.userId,
        lines:       glLines,
      });
    }
  } catch (glErr) {
    console.error('[POS] GL journal entry failed:', glErr);
  }

  // Update inventory (non-blocking — best effort)
  if (defaultWarehouse) {
    for (const line of lines) {
      if (!line.productId) continue;
      try {
        await InventoryService.moveStock({
          tenantId:    req.user.tenantId,
          productId:   line.productId,
          warehouseId: defaultWarehouse.id,
          type:        parsed.data.type === 'SALE' ? 'OUT' : 'RETURN_IN',
          quantity:    line.quantity,
          reference:   transaction.receiptNumber ?? undefined,
          sourceType:  'POS',
          sourceId:    transaction.id,
          createdBy:   req.user.userId,
        });
      } catch { /* insufficient stock — log but don't block */ }
    }
  }

  sendSuccess(res, transaction, 201);
}));

// GET /pos/transactions — list transactions
router.get('/transactions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, type, page = '1', pageSize = '50' } = req.query;
  const where = withTenant(req, {
    ...(sessionId ? { sessionId: sessionId as string } : {}),
    ...(type      ? { type: type as any }              : {}),
  });
  const [items, total] = await Promise.all([
    prisma.posTransaction.findMany({
      where,
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.posTransaction.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total });
}));

// GET /pos/transactions/:id
router.get('/transactions/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tx = await prisma.posTransaction.findUnique({
    where:   { id: req.params.id },
    include: { lines: { include: { transaction: false } }, session: { include: { terminal: true } } },
  });
  if (!tx || tx.tenantId !== req.user.tenantId) { sendError(res, 'Transaction not found', 404); return; }
  sendSuccess(res, tx);
}));

// ─── Monthly Summary ──────────────────────────────────────────────

router.get('/reports/monthly', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const now   = new Date();
  const year  = parseInt((req.query.year  as string) ?? String(now.getFullYear()));
  const month = parseInt((req.query.month as string) ?? String(now.getMonth() + 1));

  const from = new Date(year, month - 1, 1, 0, 0, 0);
  const to   = new Date(year, month,     0, 23, 59, 59); // last day of month

  const transactions: any[] = await (prisma.posTransaction as any).findMany({
    where: { tenantId: req.user.tenantId, createdAt: { gte: from, lte: to } },
    include: { lines: { include: { product: { select: { name: true } } } } },
  });

  const sales   = transactions.filter(t => t.type === 'SALE');
  const returns = transactions.filter(t => t.type === 'RETURN');

  const byPaymentMethod = sales.reduce((acc, t) => {
    acc[t.paymentMethod] = (acc[t.paymentMethod] ?? 0) + Number(t.total);
    return acc;
  }, {} as Record<string, number>);

  // Daily breakdown
  const byDay: Record<string, number> = {};
  for (const t of sales) {
    const day = t.createdAt.toISOString().split('T')[0];
    byDay[day] = (byDay[day] ?? 0) + Number(t.total);
  }

  // Top items
  const itemMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
  for (const t of sales) {
    for (const line of t.lines) {
      const key = (line as any).productId ?? 'unknown';
      if (!itemMap[key]) itemMap[key] = { name: (line as any).product?.name ?? key, quantity: 0, revenue: 0 };
      itemMap[key].quantity += Number(line.quantity);
      itemMap[key].revenue  += Number(line.lineTotal);
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  sendSuccess(res, {
    year, month,
    totalSales:   sales.reduce((s, t) => s + Number(t.total), 0),
    salesCount:   sales.length,
    totalReturns: returns.reduce((s, t) => s + Number(t.total), 0),
    returnsCount: returns.length,
    vatCollected: sales.reduce((s, t) => s + Number(t.vatAmount), 0),
    byPaymentMethod,
    byDay,
    topItems,
    averageSale:  sales.length ? sales.reduce((s, t) => s + Number(t.total), 0) / sales.length : 0,
  });
}));

// ─── Daily Summary ────────────────────────────────────────────────

router.get('/reports/daily', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const to   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

  const transactions = await prisma.posTransaction.findMany({
    where: { tenantId: req.user.tenantId, createdAt: { gte: from, lte: to } },
    include: { lines: { select: { quantity: true, lineTotal: true } } },
  });

  const sales   = transactions.filter(t => t.type === 'SALE');
  const returns = transactions.filter(t => t.type === 'RETURN');

  const byPaymentMethod = sales.reduce((acc, t) => {
    acc[t.paymentMethod] = (acc[t.paymentMethod] ?? 0) + Number(t.total);
    return acc;
  }, {} as Record<string, number>);

  sendSuccess(res, {
    date:       from.toISOString().split('T')[0],
    totalSales: sales.reduce((s, t) => s + Number(t.total), 0),
    salesCount: sales.length,
    totalReturns: returns.reduce((s, t) => s + Number(t.total), 0),
    returnsCount: returns.length,
    byPaymentMethod,
    vatCollected: sales.reduce((s, t) => s + Number(t.vatAmount), 0),
  });
}));

export default router;
