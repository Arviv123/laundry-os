import { prisma } from '../../config/database';

/**
 * FINANCIAL REPORTS SERVICE
 * P&L, Balance Sheet, VAT (מע"מ) report
 */

// ─── Profit & Loss ────────────────────────────────────────────────

export async function getProfitAndLoss(
  tenantId: string,
  from: Date,
  to: Date
) {
  const accounts = await prisma.account.findMany({
    where:   { tenantId, type: { in: ['REVENUE', 'EXPENSE'] }, isActive: true },
    orderBy: { code: 'asc' },
  });

  const accountIds = accounts.map(a => a.id);

  // Get all posted lines in this period
  const lines = await prisma.transactionLine.findMany({
    where: {
      transaction: {
        tenantId,
        status: 'POSTED',
        date:   { gte: from, lte: to },
      },
      OR: [
        { debitAccountId:  { in: accountIds } },
        { creditAccountId: { in: accountIds } },
      ],
    },
    include: { transaction: { select: { date: true } } },
  });

  // Build balance per account
  const balanceMap = new Map<string, number>();
  for (const line of lines) {
    const debitAcc  = balanceMap.get(line.debitAccountId)  ?? 0;
    const creditAcc = balanceMap.get(line.creditAccountId) ?? 0;
    balanceMap.set(line.debitAccountId,  debitAcc  + Number(line.amount));
    balanceMap.set(line.creditAccountId, creditAcc - Number(line.amount));
  }

  const revenues: Array<{ id: string; code: string; name: string; balance: number }> = [];
  const expenses: Array<{ id: string; code: string; name: string; balance: number }> = [];

  for (const acc of accounts) {
    const raw = balanceMap.get(acc.id) ?? 0;
    // Revenue: credit-nature → positive is credit balance (negate debit-offset)
    const balance = acc.type === 'REVENUE' ? -raw : raw;

    if (balance === 0) continue;

    if (acc.type === 'REVENUE') revenues.push({ id: acc.id, code: acc.code, name: acc.name, balance });
    else                        expenses.push({ id: acc.id, code: acc.code, name: acc.name, balance });
  }

  const totalRevenue = revenues.reduce((s, a) => s + a.balance, 0);
  const totalExpense = expenses.reduce((s, a) => s + a.balance, 0);
  const netProfit    = totalRevenue - totalExpense;

  return {
    period: { from, to },
    revenues,
    expenses,
    totalRevenue: round2(totalRevenue),
    totalExpense: round2(totalExpense),
    netProfit:    round2(netProfit),
    isProfitable: netProfit >= 0,
  };
}

// ─── Balance Sheet ────────────────────────────────────────────────

export async function getBalanceSheet(tenantId: string, asOf: Date) {
  const accounts = await prisma.account.findMany({
    where:   { tenantId, type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, isActive: true },
    orderBy: { code: 'asc' },
  });

  const results = await Promise.all(
    accounts.map(async (acc) => {
      const [debitSum, creditSum] = await Promise.all([
        prisma.transactionLine.aggregate({
          where: {
            debitAccountId: acc.id,
            transaction: { tenantId, status: 'POSTED', date: { lte: asOf } },
          },
          _sum: { amount: true },
        }),
        prisma.transactionLine.aggregate({
          where: {
            creditAccountId: acc.id,
            transaction: { tenantId, status: 'POSTED', date: { lte: asOf } },
          },
          _sum: { amount: true },
        }),
      ]);

      const debits  = Number(debitSum._sum.amount  ?? 0);
      const credits = Number(creditSum._sum.amount ?? 0);
      // Assets: debit-nature (debits increase balance)
      // Liabilities/Equity: credit-nature
      const balance = acc.type === 'ASSET'
        ? debits - credits
        : credits - debits;

      return { id: acc.id, code: acc.code, name: acc.name, type: acc.type, balance: round2(balance) };
    })
  );

  const assets      = results.filter(a => a.type === 'ASSET'     && a.balance !== 0);
  const liabilities = results.filter(a => a.type === 'LIABILITY'  && a.balance !== 0);
  const equity      = results.filter(a => a.type === 'EQUITY'     && a.balance !== 0);

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.balance, 0);
  const balanceDifference = Math.abs(totalAssets - (totalLiabilities + totalEquity));
  const isBalanced        = balanceDifference < 0.01;

  if (!isBalanced) {
    console.error(
      `BALANCE SHEET UNBALANCED: Assets=${round2(totalAssets)}, ` +
      `Liab+Equity=${round2(totalLiabilities + totalEquity)}, ` +
      `Diff=${round2(balanceDifference)}`
    );
  }

  return {
    asOf,
    assets,      totalAssets:      round2(totalAssets),
    liabilities, totalLiabilities: round2(totalLiabilities),
    equity,      totalEquity:      round2(totalEquity),
    isBalanced,
    balanceDifference: round2(balanceDifference),
    checksum:     round2(totalAssets - totalLiabilities - totalEquity),
  };
}

// ─── VAT Report (דו"ח מע"מ - טופס 83) ────────────────────────────

export async function getVatReport(tenantId: string, period: string) {
  // period = "2026-02" (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Period must be YYYY-MM');
  }

  const [y, m] = period.split('-').map(Number);
  const from   = new Date(y, m - 1, 1);
  const to     = new Date(y, m,     0, 23, 59, 59);

  // Sales invoices in period (עסקאות)
  const salesInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ['SENT', 'PAID'] },
      date:   { gte: from, lte: to },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });

  // VAT Account (3200) balance = VAT collected
  const vatAccount = await prisma.account.findFirst({
    where: { tenantId, code: '3200' },
  });

  const vatInputAccount = await prisma.account.findFirst({
    where: { tenantId, code: '1600' },
  });

  const salesTotals = salesInvoices.reduce(
    (acc, inv) => ({
      subtotal:  acc.subtotal  + Number(inv.subtotal),
      vatAmount: acc.vatAmount + Number(inv.vatAmount),
      total:     acc.total     + Number(inv.total),
    }),
    { subtotal: 0, vatAmount: 0, total: 0 }
  );

  // תשומות — Purchase bills (Input VAT)
  const purchaseBills = await prisma.bill.findMany({
    where: {
      tenantId,
      status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
      date:   { gte: from, lte: to },
    },
    include: { vendor: { select: { name: true, vatNumber: true } } },
    orderBy: { date: 'asc' },
  });

  const purchaseTotals = purchaseBills.reduce(
    (acc, bill) => ({
      subtotal:  acc.subtotal  + Number(bill.subtotal),
      vatAmount: acc.vatAmount + Number(bill.vatAmount),
      total:     acc.total     + Number(bill.total),
    }),
    { subtotal: 0, vatAmount: 0, total: 0 }
  );

  const vatDue = salesTotals.vatAmount - purchaseTotals.vatAmount;

  return {
    period,
    reportDate: new Date(),
    // עסקאות (Output VAT)
    sales: {
      count:        salesInvoices.length,
      subtotal:     round2(salesTotals.subtotal),
      vatCollected: round2(salesTotals.vatAmount),
      total:        round2(salesTotals.total),
      breakdown:    salesInvoices.map(inv => ({
        date:     inv.date,
        number:   inv.number,
        customer: inv.customer.name,
        subtotal: Number(inv.subtotal),
        vat:      Number(inv.vatAmount),
        total:    Number(inv.total),
      })),
    },
    // תשומות (Input VAT)
    purchases: {
      count:    purchaseBills.length,
      subtotal: round2(purchaseTotals.subtotal),
      vatPaid:  round2(purchaseTotals.vatAmount),
      total:    round2(purchaseTotals.total),
      breakdown: purchaseBills.map(bill => ({
        date:     bill.date,
        number:   bill.number,
        vendor:   bill.vendor.name,
        subtotal: Number(bill.subtotal),
        vat:      Number(bill.vatAmount),
        total:    Number(bill.total),
      })),
    },
    // סיכום
    summary: {
      vatCollected: round2(salesTotals.vatAmount),
      vatPaid:      round2(purchaseTotals.vatAmount),
      vatDue:       round2(vatDue),
      isRefund:     vatDue < 0,
    },
    // Legacy fields for backward compat
    outputVat:            round2(salesTotals.vatAmount),
    inputVat:             round2(purchaseTotals.vatAmount),
    totalSales:           round2(salesTotals.subtotal),
    salesTransactions:    salesInvoices.map(inv => ({
      reference: inv.number, description: inv.customer.name, amount: Number(inv.subtotal),
    })),
    purchaseTransactions: purchaseBills.map(bill => ({
      reference: bill.number, description: bill.vendor.name, amount: Number(bill.subtotal),
    })),
  };
}

// ─── Cash Flow Statement (IAS 7 — Direct Method) ──────────────────

export async function getCashFlowStatement(tenantId: string, from: Date, to: Date) {
  // Bank/cash accounts (ASSET type, code 1100–1299)
  const bankAccounts = await prisma.account.findMany({
    where: { tenantId, type: 'ASSET', code: { gte: '1100', lt: '1300' }, isActive: true },
  });
  const bankIds = bankAccounts.map(a => a.id);

  // All POSTED transactions in period
  const transactions = await prisma.transaction.findMany({
    where: { tenantId, status: 'POSTED', date: { gte: from, lte: to } },
    include: {
      lines: true,
    },
    orderBy: { date: 'asc' },
  });

  // Classify each transaction by its cash impact
  const flows: Array<{
    date: Date; description: string; reference: string;
    amount: number; category: 'operating' | 'investing' | 'financing'; sourceType: string;
  }> = [];

  for (const tx of transactions) {
    // Sum cash impact (debit bank = inflow, credit bank = outflow)
    let cashAmount = 0;
    for (const line of tx.lines) {
      const amt = Number(line.amount);
      if (bankIds.includes(line.debitAccountId))  cashAmount += amt;
      if (bankIds.includes(line.creditAccountId)) cashAmount -= amt;
    }
    if (cashAmount === 0) continue;

    // Classify
    let category: 'operating' | 'investing' | 'financing' = 'operating';
    if (['ASSET_PURCHASE', 'ASSET_SALE', 'INVESTMENT'].includes(tx.sourceType)) category = 'investing';
    if (['LOAN', 'EQUITY', 'DIVIDEND', 'LOAN_REPAYMENT'].includes(tx.sourceType))  category = 'financing';

    flows.push({
      date:        tx.date,
      description: tx.description,
      reference:   tx.reference,
      amount:      round2(cashAmount),
      category,
      sourceType:  tx.sourceType,
    });
  }

  const operating = flows.filter(f => f.category === 'operating');
  const investing  = flows.filter(f => f.category === 'investing');
  const financing  = flows.filter(f => f.category === 'financing');

  const operatingNet = round2(operating.reduce((s, f) => s + f.amount, 0));
  const investingNet  = round2(investing.reduce((s, f)  => s + f.amount, 0));
  const financingNet  = round2(financing.reduce((s, f)  => s + f.amount, 0));
  const netCashChange = round2(operatingNet + investingNet + financingNet);

  // Opening cash balance (sum bank accounts up to `from`)
  const openingData = await Promise.all(bankIds.map(async id => {
    const [dr, cr] = await Promise.all([
      prisma.transactionLine.aggregate({
        where: { debitAccountId: id, transaction: { tenantId, status: 'POSTED', date: { lt: from } } },
        _sum: { amount: true },
      }),
      prisma.transactionLine.aggregate({
        where: { creditAccountId: id, transaction: { tenantId, status: 'POSTED', date: { lt: from } } },
        _sum: { amount: true },
      }),
    ]);
    return Number(dr._sum.amount ?? 0) - Number(cr._sum.amount ?? 0);
  }));
  const openingCash  = round2(openingData.reduce((s, v) => s + v, 0));
  const closingCash  = round2(openingCash + netCashChange);

  return {
    period:     { from, to },
    openingCash,
    operating:  { flows: operating,  net: operatingNet },
    investing:  { flows: investing,   net: investingNet },
    financing:  { flows: financing,   net: financingNet },
    netCashChange,
    closingCash,
  };
}

// ─── Utility ──────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
