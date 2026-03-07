import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';
import * as AccountingService from './accounting.service';
import * as ReportsService from './reports.service';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  exportPnLToExcel,
  exportBalanceSheetToExcel,
  exportTrialBalanceToExcel,
  exportVatToExcel,
} from './reports-export.service';

const router = Router();

// All accounting routes require authentication + tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Chart of Accounts ───────────────────────────────────────────

router.get('/accounts', async (req: AuthenticatedRequest, res: Response) => {
  const accounts = await prisma.account.findMany({
    where:   withTenant(req, { isActive: true }),
    orderBy: { code: 'asc' },
  });
  sendSuccess(res, accounts);
});

const CreateAccountSchema = z.object({
  code:     z.string().min(2).max(10),
  name:     z.string().min(1),
  nameEn:   z.string().optional(),
  type:     z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().cuid().optional(),
});

router.post(
  '/accounts',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const account = await prisma.account.create({
        data: { ...parsed.data, tenantId: req.user.tenantId },
      });
      sendSuccess(res, account, 201);
    } catch (err: any) {
      if (err.code === 'P2002') {
        sendError(res, `Account code ${parsed.data.code} already exists`);
      } else {
        throw err;
      }
    }
  }
);

// ─── Transactions ─────────────────────────────────────────────────

const TransactionLineSchema = z.object({
  debitAccountId:  z.string().cuid(),
  creditAccountId: z.string().cuid(),
  amount:          z.number().positive(),
  description:     z.string().optional(),
});

const CreateTransactionSchema = z.object({
  date:        z.string().datetime(),
  reference:   z.string().min(1),
  description: z.string().min(1),
  sourceType:  z.string().min(1),
  sourceId:    z.string().optional(),
  lines:       z.array(TransactionLineSchema).min(1),
});

router.post(
  '/transactions',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const tx = await AccountingService.createTransaction({
        ...parsed.data,
        date:     new Date(parsed.data.date),
        tenantId: req.user.tenantId,
        createdBy: req.user.userId,
      });
      sendSuccess(res, tx, 201);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

router.get('/transactions', async (req: AuthenticatedRequest, res: Response) => {
  const { status, sourceType, from, to, page, pageSize, accountId } = req.query;

  const result = await AccountingService.listTransactions(req.user.tenantId, {
    status:     status as any,
    sourceType: sourceType as string,
    from:       from ? new Date(from as string) : undefined,
    to:         to   ? new Date(to   as string) : undefined,
    accountId:  accountId as string | undefined,
    page:       page     ? parseInt(page as string)     : 1,
    pageSize:   pageSize ? parseInt(pageSize as string) : 50,
  });

  sendSuccess(res, result.items, 200, {
    total:    result.total,
    page:     result.page,
    pageSize: result.pageSize,
  });
});

// POST /transactions/:id/post
router.post(
  '/transactions/:id/post',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tx = await AccountingService.postTransaction(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, tx);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// POST /transactions/:id/void
router.post(
  '/transactions/:id/void',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tx = await AccountingService.voidTransaction(
        req.params.id,
        req.user.tenantId,
        req.user.userId
      );
      sendSuccess(res, tx);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// ─── Reports ──────────────────────────────────────────────────────

// GET /accounting/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns 6-column trial balance: opening + period movements + closing
router.get(
  '/trial-balance',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    const format = req.query.format as string;

    if (from && to) {
      // 6-column format: opening / period debits+credits / closing
      const fromDate = new Date(from as string);
      const toDate   = new Date(to   as string);
      const result = await AccountingService.getTrialBalancePeriod(
        req.user.tenantId, fromDate, toDate
      );

      if (format === 'xlsx') {
        const buffer = exportTrialBalanceToExcel(result);
        const filename = `trial-balance-${fromDate.toISOString().slice(0, 10)}-${toDate.toISOString().slice(0, 10)}.xlsx`;
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      }

      sendSuccess(res, result);
    } else {
      const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
      const result = await AccountingService.getTrialBalance(req.user.tenantId, asOf);

      if (format === 'xlsx') {
        const buffer = exportTrialBalanceToExcel(result as any);
        const filename = `trial-balance-${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      }

      sendSuccess(res, result);
    }
  }
);

// GET /accounting/accounts/:id/balance
router.get(
  '/accounts/:id/balance',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
    const result = await AccountingService.getAccountBalance(
      req.params.id,
      req.user.tenantId,
      asOf
    );
    sendSuccess(res, result);
  }
);

// GET /accounting/accounts/:id/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns כרטסת (account ledger) with running balance per transaction
router.get(
  '/accounts/:id/ledger',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!account || account.tenantId !== req.user.tenantId) {
      sendError(res, 'Account not found', 404); return;
    }

    const fromDate = from ? new Date(from as string) : new Date(new Date().getFullYear(), 0, 1);
    const toDate   = to   ? new Date(to   as string) : new Date();
    toDate.setHours(23, 59, 59, 999);

    // Opening balance = net balance before fromDate
    const openingBal = await AccountingService.getAccountBalance(
      account.id, req.user.tenantId, new Date(fromDate.getTime() - 1)
    );
    // Opening balance from the perspective of normal balance:
    // ASSET/EXPENSE: debit increases (opening = debits - credits)
    // LIABILITY/EQUITY/REVENUE: credit increases (opening = credits - debits)
    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);
    const openingBalance = isDebitNormal
      ? openingBal.totalDebits - openingBal.totalCredits
      : openingBal.totalCredits - openingBal.totalDebits;

    // Get all transaction lines for this account in the period
    const lines = await prisma.transactionLine.findMany({
      where: {
        OR: [
          { debitAccountId:  account.id },
          { creditAccountId: account.id },
        ],
        transaction: {
          tenantId: req.user.tenantId,
          status:   'POSTED',
          date:     { gte: fromDate, lte: toDate },
        },
      },
      include: {
        transaction: {
          select: { id: true, date: true, reference: true, description: true, sourceType: true },
        },
      },
      orderBy: { transaction: { date: 'asc' } },
    });

    // Build ledger lines with running balance
    let runningBalance = openingBalance;
    const ledgerLines = lines.map(line => {
      const amount      = Number(line.amount);
      const isDebitLine = line.debitAccountId === account.id;
      // For debit-normal accounts: debit = +, credit = -
      const change = isDebitNormal
        ? (isDebitLine ? amount : -amount)
        : (isDebitLine ? -amount : amount);
      runningBalance = Math.round((runningBalance + change) * 100) / 100;
      return {
        id:            line.id,
        transactionId: line.transactionId,
        date:          line.transaction.date,
        reference:     line.transaction.reference,
        description:   line.description ?? line.transaction.description,
        sourceType:    line.transaction.sourceType,
        debit:         isDebitLine ? amount : null,
        credit:        isDebitLine ? null   : amount,
        balance:       runningBalance,
      };
    });

    const periodDebits  = lines.filter(l => l.debitAccountId  === account.id).reduce((s, l) => s + Number(l.amount), 0);
    const periodCredits = lines.filter(l => l.creditAccountId === account.id).reduce((s, l) => s + Number(l.amount), 0);
    const closingBalance = runningBalance;

    sendSuccess(res, {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      period:  { from: fromDate, to: toDate },
      openingBalance: Math.round(openingBalance * 100) / 100,
      lines:  ledgerLines,
      periodDebits:  Math.round(periodDebits  * 100) / 100,
      periodCredits: Math.round(periodCredits * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
    });
  })
);

// ─── Financial Reports ────────────────────────────────────────────

// GET /accounting/reports/pl?from=2026-01-01&to=2026-03-31
router.get(
  '/reports/pl',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    if (!from || !to) { sendError(res, 'from and to dates are required'); return; }

    const result = await ReportsService.getProfitAndLoss(
      req.user.tenantId,
      new Date(from as string),
      new Date(to   as string)
    );

    const format = req.query.format as string;
    if (format === 'xlsx') {
      const buffer = exportPnLToExcel(result);
      const filename = `pl-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } else {
      sendSuccess(res, result);
    }
  })
);

// GET /accounting/reports/balance-sheet?asOf=2026-03-01
router.get(
  '/reports/balance-sheet',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : new Date();
    const result = await ReportsService.getBalanceSheet(req.user.tenantId, asOf);

    const format = req.query.format as string;
    if (format === 'xlsx') {
      const buffer = exportBalanceSheetToExcel(result);
      const filename = `balance-sheet-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } else {
      sendSuccess(res, result);
    }
  })
);

// GET /accounting/reports/vat?period=2026-02
router.get(
  '/reports/vat',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const period = req.query.period as string;
    if (!period) { sendError(res, 'period (YYYY-MM) is required'); return; }

    const result = await ReportsService.getVatReport(req.user.tenantId, period);

    const format = req.query.format as string;
    if (format === 'xlsx') {
      const buffer = exportVatToExcel(result);
      const filename = `vat-report-${period}.xlsx`;
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } else {
      sendSuccess(res, result);
    }
  })
);

// GET /accounting/reports/cash-flow?from=2026-01-01&to=2026-03-31
router.get(
  '/reports/cash-flow',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    if (!from || !to) { sendError(res, 'from and to dates are required'); return; }

    const result = await ReportsService.getCashFlowStatement(
      req.user.tenantId,
      new Date(from as string),
      new Date(to   as string)
    );
    sendSuccess(res, result);
  })
);

// ─── Integration Health Check ────────────────────────────────────
// GET /accounting/integration-health
// Returns per-module sync stats: how many source records have GL entries vs total

router.get(
  '/integration-health',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;

    const [
      totalInvoices,     glInvoices,
      totalPayments,     glPayments,
      totalBills,        glBills,
      totalBillPayments, glBillPayments,
      totalPayroll,      glPayroll,
      totalPos,          glPos,
      totalGR,           glGR,
    ] = await Promise.all([
      // Invoices
      prisma.invoice.count({ where: { tenantId } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'INVOICE' } }),
      // Invoice payments
      prisma.invoicePayment.count({ where: { tenantId } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'PAYMENT' } }),
      // Bills (vendor invoices)
      prisma.bill.count({ where: { tenantId } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'BILL' } }),
      // Bill payments
      prisma.billPayment.count({ where: { tenantId } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'BILL_PAYMENT' } }),
      // Payroll
      prisma.payrollRun.count({ where: { tenantId } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'PAYROLL' } }),
      // POS transactions (only SALE type)
      prisma.posTransaction.count({ where: { tenantId, type: 'SALE' } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'POS' } }),
      // Goods receipts
      prisma.goodsReceipt.count({ where: { tenantId } }),
      prisma.transaction.count({ where: { tenantId, sourceType: 'GR' } }),
    ]);

    const makeRow = (module: string, total: number, synced: number, description: string) => ({
      module,
      description,
      total,
      synced,
      unsynced:   Math.max(0, total - synced),
      syncRate:   total > 0 ? Math.round((Math.min(synced, total) / total) * 100) : 100,
      status:     total === 0 ? 'OK'
                : synced >= total ? 'OK'
                : synced === 0    ? 'ERROR'
                :                   'WARNING',
    });

    const rows = [
      makeRow('invoices',     totalInvoices,     glInvoices,     'חשבוניות → הנה"ח'),
      makeRow('payments',     totalPayments,     glPayments,     'תשלומים → הנה"ח'),
      makeRow('bills',        totalBills,        glBills,        'חשבוניות ספק → הנה"ח'),
      makeRow('bill-payments',totalBillPayments, glBillPayments, 'תשלומים לספקים → הנה"ח'),
      makeRow('payroll',      totalPayroll,      glPayroll,      'שכר → הנה"ח'),
      makeRow('pos',          totalPos,          glPos,          'קופה → הנה"ח'),
      makeRow('goods-receipt',totalGR,           glGR,           'קבלת סחורה → הנה"ח'),
    ];

    const overallStatus = rows.some(r => r.status === 'ERROR')   ? 'ERROR'
                        : rows.some(r => r.status === 'WARNING') ? 'WARNING'
                        :                                          'OK';

    sendSuccess(res, { overallStatus, modules: rows });
  })
);

export default router;
