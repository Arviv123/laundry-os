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

// ─── Helper: compute current cash balance for a session ───────────────────────

async function getSessionCashBalance(sessionId: string, tenantId: string): Promise<number> {
  const events = await prisma.cashDrawerEvent.findMany({
    where: { sessionId, tenantId },
    select: { amount: true, type: true },
  });
  // Balance = sum of all amounts (CASH_OUT and REFUND amounts are stored negative or we treat type)
  // All events store signed amounts: CASH_IN / OPEN_FLOAT / SALE positive, CASH_OUT / REFUND negative
  return events.reduce((sum, e) => sum + Number(e.amount), 0);
}

// ══════════════════════════════════════════════════════════════════
// CASH DRAWER
// ══════════════════════════════════════════════════════════════════

// GET /api/pos/drawer/balance?sessionId=
router.get('/drawer/balance', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) { sendError(res, 'sessionId is required', 400); return; }

  const session = await prisma.posSession.findFirst({
    where: withTenant(req, { id: sessionId }),
  });
  if (!session) { sendError(res, 'Session not found', 404); return; }

  const balance = await getSessionCashBalance(sessionId, req.user.tenantId);

  const lastEvent = await prisma.cashDrawerEvent.findFirst({
    where: { sessionId, tenantId: req.user.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  sendSuccess(res, {
    sessionId,
    balance,
    lastEventAt: lastEvent?.createdAt ?? null,
  });
}));

// POST /api/pos/drawer/cash-in
router.post('/drawer/cash-in', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    sessionId: z.string().cuid(),
    amount:    z.number().positive(),
    reason:    z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const session = await prisma.posSession.findFirst({
    where: withTenant(req, { id: parsed.data.sessionId, status: 'OPEN' }),
  });
  if (!session) { sendError(res, 'Open session not found', 404); return; }

  const balanceBefore = await getSessionCashBalance(parsed.data.sessionId, req.user.tenantId);
  const balanceAfter  = balanceBefore + parsed.data.amount;

  const event = await prisma.cashDrawerEvent.create({
    data: {
      tenantId:     req.user.tenantId,
      sessionId:    parsed.data.sessionId,
      type:         'CASH_IN',
      amount:       parsed.data.amount,
      reason:       parsed.data.reason,
      balanceBefore,
      balanceAfter,
      performedBy:  req.user.userId,
    },
  });

  sendSuccess(res, { event, newBalance: balanceAfter }, 201);
}));

// POST /api/pos/drawer/cash-out
router.post('/drawer/cash-out', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    sessionId: z.string().cuid(),
    amount:    z.number().positive(),
    reason:    z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const session = await prisma.posSession.findFirst({
    where: withTenant(req, { id: parsed.data.sessionId, status: 'OPEN' }),
  });
  if (!session) { sendError(res, 'Open session not found', 404); return; }

  const balanceBefore = await getSessionCashBalance(parsed.data.sessionId, req.user.tenantId);

  if (balanceBefore < parsed.data.amount) {
    sendError(res, `Insufficient cash balance. Current: ${balanceBefore.toFixed(2)} ILS`, 400);
    return;
  }

  const balanceAfter = balanceBefore - parsed.data.amount;

  const event = await prisma.cashDrawerEvent.create({
    data: {
      tenantId:     req.user.tenantId,
      sessionId:    parsed.data.sessionId,
      type:         'CASH_OUT',
      amount:       -parsed.data.amount,   // stored negative
      reason:       parsed.data.reason,
      balanceBefore,
      balanceAfter,
      performedBy:  req.user.userId,
    },
  });

  sendSuccess(res, { event, newBalance: balanceAfter }, 201);
}));

// POST /api/pos/drawer/no-sale
router.post('/drawer/no-sale', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    sessionId: z.string().cuid(),
    reason:    z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const session = await prisma.posSession.findFirst({
    where: withTenant(req, { id: parsed.data.sessionId, status: 'OPEN' }),
  });
  if (!session) { sendError(res, 'Open session not found', 404); return; }

  const balance = await getSessionCashBalance(parsed.data.sessionId, req.user.tenantId);

  const event = await prisma.cashDrawerEvent.create({
    data: {
      tenantId:     req.user.tenantId,
      sessionId:    parsed.data.sessionId,
      type:         'NO_SALE',
      amount:       0,
      reason:       parsed.data.reason ?? 'Drawer opened — no sale',
      balanceBefore: balance,
      balanceAfter:  balance,
      performedBy:  req.user.userId,
    },
  });

  sendSuccess(res, { event, message: 'Drawer opened', currentBalance: balance }, 201);
}));

// POST /api/pos/drawer/count
router.post('/drawer/count', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    sessionId:  z.string().cuid(),
    bills_200:  z.number().int().min(0).default(0),
    bills_100:  z.number().int().min(0).default(0),
    bills_50:   z.number().int().min(0).default(0),
    bills_20:   z.number().int().min(0).default(0),
    coins_10:   z.number().int().min(0).default(0),
    coins_5:    z.number().int().min(0).default(0),
    coins_2:    z.number().int().min(0).default(0),
    coins_1:    z.number().int().min(0).default(0),
    coins_050:  z.number().int().min(0).default(0),
    coins_010:  z.number().int().min(0).default(0),
    notes:      z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const session = await prisma.posSession.findFirst({
    where: withTenant(req, { id: parsed.data.sessionId }),
  });
  if (!session) { sendError(res, 'Session not found', 404); return; }

  const { bills_200, bills_100, bills_50, bills_20,
          coins_10, coins_5, coins_2, coins_1, coins_050, coins_010 } = parsed.data;

  const totalCounted =
    200 * bills_200 +
    100 * bills_100 +
     50 * bills_50  +
     20 * bills_20  +
     10 * coins_10  +
      5 * coins_5   +
      2 * coins_2   +
      1 * coins_1   +
    0.5 * coins_050 +
    0.1 * coins_010;

  const expectedAmount = await getSessionCashBalance(parsed.data.sessionId, req.user.tenantId);
  const variance       = totalCounted - expectedAmount;

  const cashCount = await prisma.cashCount.create({
    data: {
      tenantId:      req.user.tenantId,
      sessionId:     parsed.data.sessionId,
      countedBy:     req.user.userId,
      bills_200, bills_100, bills_50, bills_20,
      coins_10, coins_5, coins_2, coins_1, coins_050, coins_010,
      totalCounted,
      expectedAmount,
      variance,
      notes: parsed.data.notes,
    },
  });

  // Record a CLOSE_COUNT drawer event
  await prisma.cashDrawerEvent.create({
    data: {
      tenantId:     req.user.tenantId,
      sessionId:    parsed.data.sessionId,
      type:         'CLOSE_COUNT',
      amount:       0,
      reason:       `Cash count: expected ${expectedAmount.toFixed(2)}, counted ${totalCounted.toFixed(2)}, variance ${variance.toFixed(2)}`,
      balanceBefore: expectedAmount,
      balanceAfter:  expectedAmount,
      performedBy:  req.user.userId,
    },
  });

  sendSuccess(res, {
    cashCount,
    summary: {
      totalCounted,
      expectedAmount,
      variance,
      varianceStatus: variance === 0 ? 'BALANCED' : variance > 0 ? 'OVER' : 'SHORT',
    },
  }, 201);
}));

// GET /api/pos/drawer/history?sessionId=&from=&to=
router.get('/drawer/history', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, from, to } = req.query as Record<string, string | undefined>;
  if (!sessionId) { sendError(res, 'sessionId is required', 400); return; }

  const where: Record<string, any> = { tenantId: req.user.tenantId, sessionId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }

  const events = await prisma.cashDrawerEvent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  sendSuccess(res, events);
}));

// GET /api/pos/drawer/counts?sessionId=
router.get('/drawer/counts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) { sendError(res, 'sessionId is required', 400); return; }

  const counts = await prisma.cashCount.findMany({
    where: { tenantId: req.user.tenantId, sessionId },
    orderBy: { countedAt: 'desc' },
  });

  sendSuccess(res, counts);
}));

// ══════════════════════════════════════════════════════════════════
// CASHIER SHIFTS
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/shifts/start
router.post('/shifts/start', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    sessionId:    z.string().cuid(),
    openingFloat: z.number().min(0).default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const session = await prisma.posSession.findFirst({
    where: withTenant(req, { id: parsed.data.sessionId, status: 'OPEN' }),
  });
  if (!session) { sendError(res, 'Open session not found', 404); return; }

  // End any active shift for this cashier in this session
  await prisma.cashierShift.updateMany({
    where: {
      tenantId:  req.user.tenantId,
      sessionId: parsed.data.sessionId,
      cashierId: req.user.userId,
      status:    'ACTIVE',
    },
    data: { status: 'CLOSED', endedAt: new Date() },
  });

  const shift = await prisma.cashierShift.create({
    data: {
      tenantId:    req.user.tenantId,
      sessionId:   parsed.data.sessionId,
      cashierId:   req.user.userId,
      openingFloat: parsed.data.openingFloat,
      status:      'ACTIVE',
    },
  });

  sendSuccess(res, shift, 201);
}));

// GET /api/pos/shifts/current?sessionId=
router.get('/shifts/current', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) { sendError(res, 'sessionId is required', 400); return; }

  const shift = await prisma.cashierShift.findFirst({
    where: {
      tenantId:  req.user.tenantId,
      sessionId,
      cashierId: req.user.userId,
      status:    'ACTIVE',
    },
  });

  if (!shift) { sendError(res, 'No active shift found', 404); return; }
  sendSuccess(res, shift);
}));

// POST /api/pos/shifts/:id/handover
router.post('/shifts/:id/handover', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    handedTo:     z.string().cuid(),
    closingFloat: z.number().min(0),
    notes:        z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const shift = await prisma.cashierShift.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId, status: 'ACTIVE' },
  });
  if (!shift) { sendError(res, 'Active shift not found', 404); return; }

  // Close current shift
  const closed = await prisma.cashierShift.update({
    where: { id: req.params.id },
    data: {
      status:      'HANDED_OVER',
      endedAt:     new Date(),
      closingFloat: parsed.data.closingFloat,
      handedTo:    parsed.data.handedTo,
      notes:       parsed.data.notes,
    },
  });

  // Open new shift for next cashier
  const newShift = await prisma.cashierShift.create({
    data: {
      tenantId:    req.user.tenantId,
      sessionId:   shift.sessionId,
      cashierId:   parsed.data.handedTo,
      openingFloat: parsed.data.closingFloat,  // next cashier starts with same closing float
      status:      'ACTIVE',
    },
  });

  sendSuccess(res, { closedShift: closed, newShift });
}));

// POST /api/pos/shifts/:id/close
router.post('/shifts/:id/close', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    closingFloat: z.number().min(0),
    notes:        z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const shift = await prisma.cashierShift.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId, status: 'ACTIVE' },
  });
  if (!shift) { sendError(res, 'Active shift not found', 404); return; }

  // Calculate totals from PosTransaction in this time range for this cashier
  const txns = await prisma.posTransaction.findMany({
    where: {
      tenantId:  req.user.tenantId,
      sessionId: shift.sessionId,
      createdAt: { gte: shift.startedAt },
    },
    select: { total: true, type: true },
  });

  const totalSales   = txns.filter(t => t.type === 'SALE').reduce((s, t) => s + Number(t.total), 0);
  const totalReturns = txns.filter(t => t.type === 'RETURN').reduce((s, t) => s + Number(t.total), 0);
  const transactionCount = txns.length;

  const closed = await prisma.cashierShift.update({
    where: { id: req.params.id },
    data: {
      status:          'CLOSED',
      endedAt:         new Date(),
      closingFloat:    parsed.data.closingFloat,
      totalSales,
      totalReturns,
      transactionCount,
      notes:           parsed.data.notes,
    },
  });

  sendSuccess(res, closed);
}));

// GET /api/pos/shifts — list shifts (ACCOUNTANT+)
router.get(
  '/shifts',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId, cashierId, from, to } = req.query as Record<string, string | undefined>;

    const where: Record<string, any> = { tenantId: req.user.tenantId };
    if (sessionId)  where.sessionId  = sessionId;
    if (cashierId)  where.cashierId  = cashierId;
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to)   where.startedAt.lte = new Date(to);
    }

    const shifts = await prisma.cashierShift.findMany({
      where,
      orderBy: { startedAt: 'desc' },
    });

    sendSuccess(res, shifts);
  }),
);

// GET /api/pos/shifts/:id
router.get('/shifts/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shift = await prisma.cashierShift.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!shift) { sendError(res, 'Shift not found', 404); return; }
  sendSuccess(res, shift);
}));

// GET /api/pos/shifts/:id/summary
router.get('/shifts/:id/summary', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shift = await prisma.cashierShift.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!shift) { sendError(res, 'Shift not found', 404); return; }

  const txns = await prisma.posTransaction.findMany({
    where: {
      tenantId:  req.user.tenantId,
      sessionId: shift.sessionId,
      createdAt: {
        gte: shift.startedAt,
        ...(shift.endedAt ? { lte: shift.endedAt } : {}),
      },
    },
    include: { lines: true },
  });

  // By type
  const byType: Record<string, { count: number; amount: number }> = {};
  for (const txn of txns) {
    if (!byType[txn.type]) byType[txn.type] = { count: 0, amount: 0 };
    byType[txn.type].count++;
    byType[txn.type].amount += Number(txn.total);
  }

  // By payment method
  const byPayment: Record<string, { count: number; amount: number }> = {};
  for (const txn of txns) {
    const pm = txn.paymentMethod;
    if (!byPayment[pm]) byPayment[pm] = { count: 0, amount: 0 };
    byPayment[pm].count++;
    byPayment[pm].amount += Number(txn.total);
  }

  // Top items sold
  const itemMap: Record<string, { description: string; quantity: number; revenue: number }> = {};
  for (const txn of txns) {
    if (txn.type !== 'SALE') continue;
    for (const line of txn.lines) {
      const key = line.productId ?? line.description;
      if (!itemMap[key]) itemMap[key] = { description: line.description, quantity: 0, revenue: 0 };
      itemMap[key].quantity += Number(line.quantity);
      itemMap[key].revenue  += Number(line.lineTotal);
    }
  }
  const itemsSold = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  sendSuccess(res, {
    shift,
    byType,
    byPaymentMethod: byPayment,
    topItems:        itemsSold,
    totalTransactions: txns.length,
  });
}));

// ══════════════════════════════════════════════════════════════════
// POS ANALYTICS
// ══════════════════════════════════════════════════════════════════

// GET /api/pos/analytics/hourly?date=&terminalId=
router.get('/analytics/hourly', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { date, terminalId } = req.query as Record<string, string | undefined>;

  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Build session filter
  const sessionWhere: Record<string, any> = { tenantId: req.user.tenantId };
  if (terminalId) sessionWhere.terminalId = terminalId;

  const sessions = await prisma.posSession.findMany({
    where: sessionWhere,
    select: { id: true },
  });
  const sessionIds = sessions.map(s => s.id);

  const txns = await prisma.posTransaction.findMany({
    where: {
      tenantId:  req.user.tenantId,
      sessionId: { in: sessionIds },
      type:      'SALE',
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    select: { createdAt: true, total: true },
  });

  // Aggregate by hour
  const hours: Record<number, { count: number; amount: number }> = {};
  for (let h = 0; h < 24; h++) hours[h] = { count: 0, amount: 0 };

  for (const txn of txns) {
    const h = new Date(txn.createdAt).getHours();
    hours[h].count++;
    hours[h].amount += Number(txn.total);
  }

  const result = Array.from({ length: 24 }, (_, h) => ({
    hour:           h,
    salesCount:     hours[h].count,
    salesAmount:    hours[h].amount,
    avgTransaction: hours[h].count > 0 ? hours[h].amount / hours[h].count : 0,
  }));

  sendSuccess(res, result);
}));

// GET /api/pos/analytics/top-products?from=&to=&limit=10&terminalId=
router.get('/analytics/top-products', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { from, to, limit, terminalId } = req.query as Record<string, string | undefined>;
  const limitNum = Math.min(parseInt(limit ?? '10', 10), 100);

  const sessionWhere: Record<string, any> = { tenantId: req.user.tenantId };
  if (terminalId) sessionWhere.terminalId = terminalId;

  const sessions = await prisma.posSession.findMany({
    where: sessionWhere,
    select: { id: true },
  });
  const sessionIds = sessions.map(s => s.id);

  const txnWhere: Record<string, any> = {
    tenantId:  req.user.tenantId,
    sessionId: { in: sessionIds },
    type:      'SALE',
  };
  if (from || to) {
    txnWhere.createdAt = {};
    if (from) txnWhere.createdAt.gte = new Date(from);
    if (to)   txnWhere.createdAt.lte = new Date(to);
  }

  const txns = await prisma.posTransaction.findMany({
    where: txnWhere,
    select: { id: true, lines: true },
  });

  const productMap: Record<string, { productId: string | null; name: string; quantity: number; revenue: number; txCount: Set<string> }> = {};

  for (const txn of txns) {
    for (const line of txn.lines) {
      const key = line.productId ?? `desc:${line.description}`;
      if (!productMap[key]) {
        productMap[key] = {
          productId: line.productId,
          name:      line.description,
          quantity:  0,
          revenue:   0,
          txCount:   new Set(),
        };
      }
      productMap[key].quantity += Number(line.quantity);
      productMap[key].revenue  += Number(line.lineTotal);
      productMap[key].txCount.add(txn.id);
    }
  }

  const result = Object.values(productMap)
    .map(p => ({
      productId:        p.productId,
      name:             p.name,
      quantity:         p.quantity,
      revenue:          p.revenue,
      transactionCount: p.txCount.size,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limitNum);

  sendSuccess(res, result);
}));

// GET /api/pos/analytics/cashier-performance?from=&to= (ACCOUNTANT+)
router.get(
  '/analytics/cashier-performance',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query as Record<string, string | undefined>;

    const where: Record<string, any> = { tenantId: req.user.tenantId };
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to)   where.startedAt.lte = new Date(to);
    }

    const shifts = await prisma.cashierShift.findMany({ where });

    // Group by cashier
    const cashierMap: Record<string, { cashierId: string; totalSales: number; totalReturns: number; txCount: number; shiftCount: number }> = {};
    for (const shift of shifts) {
      if (!cashierMap[shift.cashierId]) {
        cashierMap[shift.cashierId] = { cashierId: shift.cashierId, totalSales: 0, totalReturns: 0, txCount: 0, shiftCount: 0 };
      }
      cashierMap[shift.cashierId].totalSales   += Number(shift.totalSales);
      cashierMap[shift.cashierId].totalReturns += Number(shift.totalReturns);
      cashierMap[shift.cashierId].txCount      += shift.transactionCount;
      cashierMap[shift.cashierId].shiftCount++;
    }

    const result = Object.values(cashierMap).map(c => ({
      cashierId:        c.cashierId,
      transactionCount: c.txCount,
      totalSales:       c.totalSales,
      totalReturns:     c.totalReturns,
      avgTransaction:   c.txCount > 0 ? c.totalSales / c.txCount : 0,
      returnRate:       c.totalSales > 0 ? (c.totalReturns / c.totalSales) * 100 : 0,
      shiftCount:       c.shiftCount,
    }));

    sendSuccess(res, result);
  }),
);

// GET /api/pos/analytics/payment-mix?from=&to=&terminalId=
router.get('/analytics/payment-mix', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { from, to, terminalId } = req.query as Record<string, string | undefined>;

  const sessionWhere: Record<string, any> = { tenantId: req.user.tenantId };
  if (terminalId) sessionWhere.terminalId = terminalId;

  const sessions = await prisma.posSession.findMany({
    where: sessionWhere,
    select: { id: true },
  });
  const sessionIds = sessions.map(s => s.id);

  const txnWhere: Record<string, any> = {
    tenantId:  req.user.tenantId,
    sessionId: { in: sessionIds },
    type:      'SALE',
  };
  if (from || to) {
    txnWhere.createdAt = {};
    if (from) txnWhere.createdAt.gte = new Date(from);
    if (to)   txnWhere.createdAt.lte = new Date(to);
  }

  const txns = await prisma.posTransaction.findMany({
    where:  txnWhere,
    select: { paymentMethod: true, total: true },
  });

  const methods: Record<string, { count: number; amount: number }> = {
    CASH:        { count: 0, amount: 0 },
    CREDIT_CARD: { count: 0, amount: 0 },
    CHECK:       { count: 0, amount: 0 },
    GIFT_CARD:   { count: 0, amount: 0 },
    OTHER:       { count: 0, amount: 0 },
  };

  let grandTotal = 0;
  for (const txn of txns) {
    const pm = txn.paymentMethod in methods ? txn.paymentMethod : 'OTHER';
    methods[pm].count++;
    methods[pm].amount += Number(txn.total);
    grandTotal += Number(txn.total);
  }

  const result: Record<string, { count: number; amount: number; percentage: number }> = {};
  for (const [method, data] of Object.entries(methods)) {
    result[method] = {
      ...data,
      percentage: grandTotal > 0 ? (data.amount / grandTotal) * 100 : 0,
    };
  }

  sendSuccess(res, { breakdown: result, grandTotal, transactionCount: txns.length });
}));

// GET /api/pos/analytics/returns-analysis?from=&to= (ACCOUNTANT+)
router.get(
  '/analytics/returns-analysis',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query as Record<string, string | undefined>;

    const where: Record<string, any> = { tenantId: req.user.tenantId, type: 'RETURN' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }

    const returns = await prisma.posTransaction.findMany({
      where,
      select: { total: true, lines: true },
    });

    const productMap: Record<string, { productId: string | null; name: string; returnCount: number; returnAmount: number }> = {};
    for (const txn of returns) {
      for (const line of txn.lines) {
        const key = line.productId ?? `desc:${line.description}`;
        if (!productMap[key]) {
          productMap[key] = { productId: line.productId, name: line.description, returnCount: 0, returnAmount: 0 };
        }
        productMap[key].returnCount++;
        productMap[key].returnAmount += Number(line.lineTotal);
      }
    }

    // Get total sales for each product to compute return rate
    const saleWhere: Record<string, any> = { tenantId: req.user.tenantId, type: 'SALE' };
    if (from || to) {
      saleWhere.createdAt = where.createdAt;
    }
    const sales = await prisma.posTransaction.findMany({
      where: saleWhere,
      select: { lines: true },
    });

    const salesMap: Record<string, number> = {};
    for (const txn of sales) {
      for (const line of txn.lines) {
        const key = line.productId ?? `desc:${line.description}`;
        salesMap[key] = (salesMap[key] ?? 0) + Number(line.lineTotal);
      }
    }

    const result = Object.values(productMap)
      .map(p => ({
        productId:    p.productId,
        name:         p.name,
        returnCount:  p.returnCount,
        returnAmount: p.returnAmount,
        returnRate:   salesMap[p.productId ?? `desc:${p.name}`]
          ? (p.returnAmount / salesMap[p.productId ?? `desc:${p.name}`]) * 100
          : 100,
      }))
      .sort((a, b) => b.returnAmount - a.returnAmount);

    sendSuccess(res, result);
  }),
);

// GET /api/pos/analytics/peak-hours?from=&to=&terminalId=
router.get('/analytics/peak-hours', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { from, to, terminalId } = req.query as Record<string, string | undefined>;

  const sessionWhere: Record<string, any> = { tenantId: req.user.tenantId };
  if (terminalId) sessionWhere.terminalId = terminalId;

  const sessions = await prisma.posSession.findMany({
    where: sessionWhere,
    select: { id: true },
  });
  const sessionIds = sessions.map(s => s.id);

  const txnWhere: Record<string, any> = {
    tenantId:  req.user.tenantId,
    sessionId: { in: sessionIds },
    type:      'SALE',
  };
  if (from || to) {
    txnWhere.createdAt = {};
    if (from) txnWhere.createdAt.gte = new Date(from);
    if (to)   txnWhere.createdAt.lte = new Date(to);
  }

  const txns = await prisma.posTransaction.findMany({
    where:  txnWhere,
    select: { createdAt: true, total: true },
  });

  // 7x24 grid: day-of-week (0=Sun) x hour
  const grid: number[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => []),
  );

  for (const txn of txns) {
    const d = new Date(txn.createdAt);
    const dow = d.getDay();
    const hour = d.getHours();
    grid[dow][hour].push(Number(txn.total));
  }

  const result = grid.map((dayHours, dow) => ({
    dayOfWeek: dow,
    dayName:   ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow],
    hours:     dayHours.map((amounts, hour) => ({
      hour,
      avgSales:   amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) / amounts.length : 0,
      totalSales: amounts.reduce((s, v) => s + v, 0),
      count:      amounts.length,
    })),
  }));

  sendSuccess(res, result);
}));

// GET /api/pos/analytics/summary?from=&to=
router.get('/analytics/summary', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { from, to } = req.query as Record<string, string | undefined>;

  const periodStart = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const periodEnd   = to   ? new Date(to)   : new Date();

  // Compute length of period in ms
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const prevPeriodEnd   = new Date(periodStart.getTime());
  const prevPeriodStart = new Date(periodStart.getTime() - periodMs);

  const txnWhere = (start: Date, end: Date) => ({
    tenantId:  req.user.tenantId,
    type:      'SALE' as const,
    createdAt: { gte: start, lte: end },
  });

  const [currentTxns, prevTxns] = await Promise.all([
    prisma.posTransaction.findMany({ where: txnWhere(periodStart, periodEnd), select: { total: true } }),
    prisma.posTransaction.findMany({ where: txnWhere(prevPeriodStart, prevPeriodEnd), select: { total: true } }),
  ]);

  const currentRevenue = currentTxns.reduce((s, t) => s + Number(t.total), 0);
  const prevRevenue    = prevTxns.reduce((s, t) => s + Number(t.total), 0);

  const totalTransactions   = currentTxns.length;
  const averageBasket       = totalTransactions > 0 ? currentRevenue / totalTransactions : 0;
  const growthVsPrevPeriod  = prevRevenue > 0
    ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
    : null;

  const returnTxns = await prisma.posTransaction.findMany({
    where: { ...txnWhere(periodStart, periodEnd), type: 'RETURN' },
    select: { total: true },
  });
  const totalReturns = returnTxns.reduce((s, t) => s + Number(t.total), 0);

  // Count active sessions in period
  const activeSessions = await prisma.posSession.count({
    where: {
      tenantId:  req.user.tenantId,
      openedAt:  { gte: periodStart, lte: periodEnd },
    },
  });

  sendSuccess(res, {
    period: { from: periodStart, to: periodEnd },
    totalRevenue:        currentRevenue,
    totalTransactions,
    averageBasket,
    totalReturns,
    netRevenue:          currentRevenue - totalReturns,
    growthVsPrevPeriod,
    activeSessions,
    prevPeriodRevenue:   prevRevenue,
  });
}));

export default router;
