import { prisma } from '../../config/database';
import * as XLSX from 'xlsx';

/**
 * LEDGER CARDS (כרטסות) SERVICE
 *
 * A כרטסת is a fundamental Israeli accounting document that shows all
 * transactions affecting a specific account/customer/vendor/employee
 * with an opening balance, running balance per entry, and closing balance.
 */

// ─── Core Types ───────────────────────────────────────────────────

export interface LedgerLine {
  date: Date;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  transactionId: string;
  documentType?: string;   // INVOICE | PAYMENT | JOURNAL | PAYROLL | BILL | etc.
  documentId?: string;
}

export interface LedgerCard {
  entityType: 'ACCOUNT' | 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE';
  entityId: string;
  entityName: string;
  entityCode?: string;
  accountCode?: string;
  currency: string;
  periodFrom: Date;
  periodTo: Date;
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  lines: LedgerLine[];
}

export interface AccountSummary {
  id: string;
  code: string;
  name: string;
  type: string;
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  lineCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

/**
 * Determine if an account type has a natural debit balance.
 * ASSET and EXPENSE accounts increase with debits.
 * LIABILITY, EQUITY, REVENUE accounts increase with credits.
 */
function isDebitNormal(accountType: string): boolean {
  return accountType === 'ASSET' || accountType === 'EXPENSE';
}

// ─── Account Ledger ───────────────────────────────────────────────

/**
 * Returns a כרטסת for a single chart-of-accounts account.
 * Opening balance = net position of all POSTED transactions before `from` date.
 * Lines = all POSTED transaction lines within [from, to], with running balance.
 */
export async function getAccountLedger(
  tenantId: string,
  accountId: string,
  from: Date,
  to: Date
): Promise<LedgerCard> {
  // 1. Verify account belongs to tenant
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, code: true, name: true, type: true, tenantId: true },
  });

  if (!account || account.tenantId !== tenantId) {
    throw new Error('Account not found');
  }

  // 2. Opening balance = all posted debits/credits before `from`
  const openingDate = new Date(from.getTime() - 1); // 1ms before period start

  const [obDebitAgg, obCreditAgg] = await Promise.all([
    prisma.transactionLine.aggregate({
      where: {
        debitAccountId: accountId,
        transaction: { tenantId, status: 'POSTED', date: { lte: openingDate } },
      },
      _sum: { amount: true },
    }),
    prisma.transactionLine.aggregate({
      where: {
        creditAccountId: accountId,
        transaction: { tenantId, status: 'POSTED', date: { lte: openingDate } },
      },
      _sum: { amount: true },
    }),
  ]);

  const obDebits  = Number(obDebitAgg._sum.amount  ?? 0);
  const obCredits = Number(obCreditAgg._sum.amount ?? 0);
  const debitNormal = isDebitNormal(account.type);
  const openingBalance = debitNormal
    ? r2(obDebits - obCredits)
    : r2(obCredits - obDebits);

  // 3. Period transaction lines
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const rawLines = await prisma.transactionLine.findMany({
    where: {
      OR: [
        { debitAccountId:  accountId },
        { creditAccountId: accountId },
      ],
      transaction: {
        tenantId,
        status: 'POSTED',
        date: { gte: from, lte: toEnd },
      },
    },
    include: {
      transaction: {
        select: {
          id: true,
          date: true,
          reference: true,
          description: true,
          sourceType: true,
          sourceId: true,
        },
      },
    },
    orderBy: [
      { transaction: { date: 'asc' } },
      { sortOrder: 'asc' },
    ],
  });

  // 4. Build ledger lines with running balance
  let runningBalance = openingBalance;
  let totalDebits  = 0;
  let totalCredits = 0;

  const lines: LedgerLine[] = rawLines.map(line => {
    const amount      = Number(line.amount);
    const isDebitLine = line.debitAccountId === accountId;

    const debit  = isDebitLine ? amount : 0;
    const credit = isDebitLine ? 0 : amount;

    // For debit-normal accounts: debit = +, credit = -
    const change = debitNormal
      ? (isDebitLine ? amount : -amount)
      : (isDebitLine ? -amount : amount);

    runningBalance = r2(runningBalance + change);
    totalDebits  += debit;
    totalCredits += credit;

    return {
      date:          line.transaction.date,
      reference:     line.transaction.reference,
      description:   line.description ?? line.transaction.description,
      debit,
      credit,
      balance:       runningBalance,
      transactionId: line.transactionId,
      documentType:  line.transaction.sourceType,
      documentId:    line.transaction.sourceId ?? undefined,
    };
  });

  return {
    entityType:     'ACCOUNT',
    entityId:       account.id,
    entityName:     account.name,
    entityCode:     account.code,
    accountCode:    account.code,
    currency:       'ILS',
    periodFrom:     from,
    periodTo:       toEnd,
    openingBalance,
    closingBalance: runningBalance,
    totalDebits:    r2(totalDebits),
    totalCredits:   r2(totalCredits),
    lines,
  };
}

// ─── Customer Ledger ──────────────────────────────────────────────

/**
 * Returns a כרטסת for a customer.
 * Shows all invoices (as debits — receivables increase) and
 * payments (as credits — receivables decrease), with running balance.
 */
export async function getCustomerLedger(
  tenantId: string,
  customerId: string,
  from: Date,
  to: Date
): Promise<LedgerCard> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, businessId: true, tenantId: true },
  });

  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  // Opening balance: invoices issued before `from` minus payments received before `from`
  const openingDate = new Date(from.getTime() - 1);

  const [obInvoices, obPayments] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        tenantId,
        customerId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        date: { lte: openingDate },
        deletedAt: null,
      },
      _sum: { total: true },
    }),
    prisma.invoicePayment.aggregate({
      where: {
        tenantId,
        invoice: { customerId, deletedAt: null },
        date: { lte: openingDate },
      },
      _sum: { amount: true },
    }),
  ]);

  const obInvTotal = Number(obInvoices._sum.total  ?? 0);
  const obPayTotal = Number(obPayments._sum.amount ?? 0);
  const openingBalance = r2(obInvTotal - obPayTotal);

  // Period invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      customerId,
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      date: { gte: from, lte: toEnd },
      deletedAt: null,
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      number: true,
      date: true,
      total: true,
      invoiceType: true,
      reference: true,
    },
  });

  // Period payments
  const payments = await prisma.invoicePayment.findMany({
    where: {
      tenantId,
      invoice: { customerId, deletedAt: null },
      date: { gte: from, lte: toEnd },
    },
    orderBy: { date: 'asc' },
    include: {
      invoice: { select: { number: true } },
    },
  });

  // Merge and sort by date
  type RawEntry = {
    sortKey: Date;
    line: LedgerLine;
  };

  const entries: RawEntry[] = [];

  for (const inv of invoices) {
    const amount = Number(inv.total);
    // Credit notes reduce receivables (credit side)
    const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';
    entries.push({
      sortKey: inv.date,
      line: {
        date:          inv.date,
        reference:     inv.number,
        description:   isCreditNote ? `זיכוי ${inv.number}` : `חשבונית ${inv.number}`,
        debit:         isCreditNote ? 0 : amount,
        credit:        isCreditNote ? amount : 0,
        balance:       0, // filled below
        transactionId: inv.id,
        documentType:  isCreditNote ? 'CREDIT_NOTE' : 'INVOICE',
        documentId:    inv.id,
      },
    });
  }

  for (const pay of payments) {
    const amount = Number(pay.amount);
    entries.push({
      sortKey: pay.date,
      line: {
        date:          pay.date,
        reference:     pay.reference ?? pay.invoice.number,
        description:   `תשלום ע"ח ${pay.invoice.number}`,
        debit:         0,
        credit:        amount,
        balance:       0,
        transactionId: pay.id,
        documentType:  'PAYMENT',
        documentId:    pay.invoiceId,
      },
    });
  }

  entries.sort((a, b) => a.sortKey.getTime() - b.sortKey.getTime());

  let runningBalance = openingBalance;
  let totalDebits  = 0;
  let totalCredits = 0;

  const lines: LedgerLine[] = entries.map(({ line }) => {
    runningBalance = r2(runningBalance + line.debit - line.credit);
    totalDebits  += line.debit;
    totalCredits += line.credit;
    return { ...line, balance: runningBalance };
  });

  return {
    entityType:     'CUSTOMER',
    entityId:       customer.id,
    entityName:     customer.name,
    entityCode:     customer.businessId ?? undefined,
    currency:       'ILS',
    periodFrom:     from,
    periodTo:       toEnd,
    openingBalance,
    closingBalance: runningBalance,
    totalDebits:    r2(totalDebits),
    totalCredits:   r2(totalCredits),
    lines,
  };
}

// ─── Vendor Ledger ────────────────────────────────────────────────

/**
 * Returns a כרטסת for a vendor.
 * Bills increase payables (credit side), payments decrease payables (debit side).
 */
export async function getVendorLedger(
  tenantId: string,
  vendorId: string,
  from: Date,
  to: Date
): Promise<LedgerCard> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, businessId: true, tenantId: true },
  });

  if (!vendor || vendor.tenantId !== tenantId) {
    throw new Error('Vendor not found');
  }

  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const openingDate = new Date(from.getTime() - 1);

  // Opening balance: bills before period minus payments before period
  const [obBills, obPayments] = await Promise.all([
    prisma.bill.aggregate({
      where: {
        tenantId,
        vendorId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        date: { lte: openingDate },
        deletedAt: null,
      },
      _sum: { total: true },
    }),
    prisma.billPayment.aggregate({
      where: {
        tenantId,
        bill: { vendorId, deletedAt: null },
        date: { lte: openingDate },
      },
      _sum: { amount: true },
    }),
  ]);

  const obBillTotal = Number(obBills._sum.total    ?? 0);
  const obPayTotal  = Number(obPayments._sum.amount ?? 0);
  // Payables: bills = credit (we owe), payments = debit (we paid)
  // Opening balance from vendor perspective: positive = we still owe
  const openingBalance = r2(obBillTotal - obPayTotal);

  // Period bills
  const bills = await prisma.bill.findMany({
    where: {
      tenantId,
      vendorId,
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      date: { gte: from, lte: toEnd },
      deletedAt: null,
    },
    orderBy: { date: 'asc' },
    select: { id: true, number: true, date: true, total: true, vendorRef: true },
  });

  // Period bill payments
  const billPayments = await prisma.billPayment.findMany({
    where: {
      tenantId,
      bill: { vendorId, deletedAt: null },
      date: { gte: from, lte: toEnd },
    },
    orderBy: { date: 'asc' },
    include: { bill: { select: { number: true } } },
  });

  type RawEntry = { sortKey: Date; line: LedgerLine };
  const entries: RawEntry[] = [];

  for (const bill of bills) {
    const amount = Number(bill.total);
    entries.push({
      sortKey: bill.date,
      line: {
        date:          bill.date,
        reference:     bill.number,
        description:   `חשבונית ספק ${bill.vendorRef ?? bill.number}`,
        debit:         0,
        credit:        amount,   // bill = we owe more (credit = payable increases)
        balance:       0,
        transactionId: bill.id,
        documentType:  'BILL',
        documentId:    bill.id,
      },
    });
  }

  for (const pay of billPayments) {
    const amount = Number(pay.amount);
    entries.push({
      sortKey: pay.date,
      line: {
        date:          pay.date,
        reference:     pay.reference ?? pay.bill.number,
        description:   `תשלום לספק ע"ח ${pay.bill.number}`,
        debit:         amount,   // payment = we paid (debit = payable decreases)
        credit:        0,
        balance:       0,
        transactionId: pay.id,
        documentType:  'PAYMENT',
        documentId:    pay.billId,
      },
    });
  }

  entries.sort((a, b) => a.sortKey.getTime() - b.sortKey.getTime());

  let runningBalance = openingBalance;
  let totalDebits  = 0;
  let totalCredits = 0;

  const lines: LedgerLine[] = entries.map(({ line }) => {
    // Vendor ledger: credit = more owed (+), debit = paid (-)
    runningBalance = r2(runningBalance + line.credit - line.debit);
    totalDebits  += line.debit;
    totalCredits += line.credit;
    return { ...line, balance: runningBalance };
  });

  return {
    entityType:     'VENDOR',
    entityId:       vendor.id,
    entityName:     vendor.name,
    entityCode:     vendor.businessId ?? undefined,
    currency:       'ILS',
    periodFrom:     from,
    periodTo:       toEnd,
    openingBalance,
    closingBalance: runningBalance,
    totalDebits:    r2(totalDebits),
    totalCredits:   r2(totalCredits),
    lines,
  };
}

// ─── Employee Ledger ──────────────────────────────────────────────

/**
 * Returns a כרטסת for an employee — showing all payslips (salary runs).
 * Each payslip appears as a debit (gross) with credits for deductions.
 */
export async function getEmployeeLedger(
  tenantId: string,
  employeeId: string,
  from: Date,
  to: Date
): Promise<LedgerCard> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idNumber: true,
      tenantId: true,
    },
  });

  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('Employee not found');
  }

  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  // Opening balance: sum of net salary paid before period
  const openingDate = new Date(from.getTime() - 1);
  const obAgg = await prisma.payslip.aggregate({
    where: {
      tenantId,
      employeeId,
      deletedAt: null,
      payrollRun: { status: 'PAID', paidAt: { lte: openingDate } },
    },
    _sum: { netSalary: true },
  });
  const openingBalance = r2(Number(obAgg._sum.netSalary ?? 0));

  // Period payslips
  const payslips = await prisma.payslip.findMany({
    where: {
      tenantId,
      employeeId,
      deletedAt: null,
      payrollRun: {
        status: { in: ['APPROVED', 'PAID'] },
        // Filter by payroll period (YYYY-MM) overlapping the date range
      },
      createdAt: { gte: from, lte: toEnd },
    },
    include: {
      payrollRun: { select: { period: true, status: true, paidAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let runningBalance = openingBalance;
  let totalDebits  = 0;
  let totalCredits = 0;

  const lines: LedgerLine[] = payslips.map(slip => {
    const gross = Number(slip.grossSalary);
    const net   = Number(slip.netSalary);
    const deductions = r2(gross - net);

    // Line shows gross salary as debit (expense to employer), net as running balance
    totalDebits  += gross;
    totalCredits += deductions;
    runningBalance = r2(runningBalance + net);

    return {
      date:          slip.payrollRun.paidAt ?? slip.createdAt,
      reference:     `PAYROLL-${slip.payrollRun.period}`,
      description:   `שכר ${slip.payrollRun.period} — ברוטו ${gross.toLocaleString('he-IL')} נטו ${net.toLocaleString('he-IL')}`,
      debit:         gross,
      credit:        deductions,
      balance:       runningBalance,
      transactionId: slip.id,
      documentType:  'PAYROLL',
      documentId:    slip.payrollRunId,
    };
  });

  return {
    entityType:     'EMPLOYEE',
    entityId:       employee.id,
    entityName:     `${employee.firstName} ${employee.lastName}`,
    entityCode:     employee.idNumber,
    currency:       'ILS',
    periodFrom:     from,
    periodTo:       toEnd,
    openingBalance,
    closingBalance: runningBalance,
    totalDebits:    r2(totalDebits),
    totalCredits:   r2(totalCredits),
    lines,
  };
}

// ─── List Account Ledgers (Summary) ──────────────────────────────

/**
 * Returns a summary (no lines) of all accounts with activity in the period.
 */
export async function listAccountLedgers(
  tenantId: string,
  filters: {
    from: Date;
    to: Date;
    type?: string;
    search?: string;
  }
): Promise<{ accounts: AccountSummary[] }> {
  const { from, to, type, search } = filters;

  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);
  const openingDate = new Date(from.getTime() - 1);

  const accounts = await prisma.account.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(type   ? { type: type as any } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  });

  const summaries: AccountSummary[] = [];

  for (const acc of accounts) {
    const debitNormal = isDebitNormal(acc.type);

    // Opening balance
    const [obD, obC] = await Promise.all([
      prisma.transactionLine.aggregate({
        where: {
          debitAccountId: acc.id,
          transaction: { tenantId, status: 'POSTED', date: { lte: openingDate } },
        },
        _sum: { amount: true },
      }),
      prisma.transactionLine.aggregate({
        where: {
          creditAccountId: acc.id,
          transaction: { tenantId, status: 'POSTED', date: { lte: openingDate } },
        },
        _sum: { amount: true },
      }),
    ]);

    const obDebits  = Number(obD._sum.amount ?? 0);
    const obCredits = Number(obC._sum.amount ?? 0);
    const openingBalance = debitNormal
      ? r2(obDebits - obCredits)
      : r2(obCredits - obDebits);

    // Period movements
    const [pD, pC] = await Promise.all([
      prisma.transactionLine.aggregate({
        where: {
          debitAccountId: acc.id,
          transaction: { tenantId, status: 'POSTED', date: { gte: from, lte: toEnd } },
        },
        _sum: { amount: true },
      }),
      prisma.transactionLine.aggregate({
        where: {
          creditAccountId: acc.id,
          transaction: { tenantId, status: 'POSTED', date: { gte: from, lte: toEnd } },
        },
        _sum: { amount: true },
      }),
    ]);

    const periodDebits  = r2(Number(pD._sum.amount ?? 0));
    const periodCredits = r2(Number(pC._sum.amount ?? 0));

    // Count lines
    const lineCount = await prisma.transactionLine.count({
      where: {
        OR: [
          { debitAccountId:  acc.id },
          { creditAccountId: acc.id },
        ],
        transaction: { tenantId, status: 'POSTED', date: { gte: from, lte: toEnd } },
      },
    });

    const closingBalance = debitNormal
      ? r2(openingBalance + periodDebits - periodCredits)
      : r2(openingBalance + periodCredits - periodDebits);

    // Only include accounts with any activity
    if (openingBalance !== 0 || periodDebits !== 0 || periodCredits !== 0) {
      summaries.push({
        id:             acc.id,
        code:           acc.code,
        name:           acc.name,
        type:           acc.type,
        openingBalance,
        periodDebits,
        periodCredits,
        closingBalance,
        lineCount,
      });
    }
  }

  return { accounts: summaries };
}

// ─── Excel Export (Single Ledger) ────────────────────────────────

/**
 * Exports a single LedgerCard to an XLSX buffer.
 * Hebrew column headers, RTL-friendly layout, alternating row colors.
 */
export function exportLedgerXLSX(
  ledgerCard: LedgerCard,
  tenantName?: string
): Buffer {
  const wb = XLSX.utils.book_new();

  const fromStr = formatDate(ledgerCard.periodFrom);
  const toStr   = formatDate(ledgerCard.periodTo);

  const rows: any[][] = [];

  // Title block
  rows.push([tenantName ?? '', '', '', '', '', '']);
  rows.push([
    `כרטסת: ${ledgerCard.entityName}`,
    '',
    ledgerCard.entityCode ? `קוד: ${ledgerCard.entityCode}` : '',
    '',
    '',
    '',
  ]);
  rows.push([`תקופה: ${fromStr} — ${toStr}`, '', '', '', '', '']);
  rows.push([]); // blank row

  // Column headers (Hebrew)
  rows.push(['תאריך', 'אסמכתא', 'תיאור', 'חובה', 'זכות', 'יתרה']);

  // Opening balance row
  rows.push([
    fromStr,
    '',
    'יתרת פתיחה',
    '',
    '',
    ledgerCard.openingBalance,
  ]);

  // Data rows
  for (const line of ledgerCard.lines) {
    rows.push([
      formatDate(line.date),
      line.reference,
      line.description,
      line.debit  || '',
      line.credit || '',
      line.balance,
    ]);
  }

  // Totals row
  rows.push([]); // blank
  rows.push([
    '',
    '',
    'סה"כ תנועות',
    ledgerCard.totalDebits,
    ledgerCard.totalCredits,
    '',
  ]);

  // Closing balance
  rows.push([
    toStr,
    '',
    'יתרת סגירה',
    '',
    '',
    ledgerCard.closingBalance,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 12 },  // date
    { wch: 16 },  // reference
    { wch: 40 },  // description
    { wch: 14 },  // debit
    { wch: 14 },  // credit
    { wch: 16 },  // balance
  ];

  // Sheet name: entity name truncated to 31 chars (Excel limit)
  const sheetName = ledgerCard.entityName.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─── Excel Export (All Account Ledgers) ──────────────────────────

/**
 * Exports all account ledgers to a multi-sheet XLSX.
 * One sheet per account, plus a summary sheet.
 */
export async function exportAllLedgersXLSX(
  tenantId: string,
  filters: {
    from: Date;
    to: Date;
    type?: string;
    search?: string;
  },
  tenantName?: string
): Promise<Buffer> {
  const { accounts } = await listAccountLedgers(tenantId, filters);
  const wb = XLSX.utils.book_new();

  const fromStr = formatDate(filters.from);
  const toStr   = formatDate(filters.to);

  // Summary sheet
  const summaryRows: any[][] = [
    [tenantName ?? '', '', '', '', '', '', ''],
    [`כרטסות — כל החשבונות`, '', `תקופה: ${fromStr} — ${toStr}`, '', '', '', ''],
    [],
    ['קוד', 'שם חשבון', 'סוג', 'יתרת פתיחה', 'חובה', 'זכות', 'יתרת סגירה'],
  ];

  for (const acc of accounts) {
    summaryRows.push([
      acc.code,
      acc.name,
      acc.type,
      acc.openingBalance,
      acc.periodDebits,
      acc.periodCredits,
      acc.closingBalance,
    ]);
  }

  summaryRows.push([]);
  const totals = accounts.reduce(
    (s, a) => ({
      openingBalance: s.openingBalance + a.openingBalance,
      periodDebits:   s.periodDebits   + a.periodDebits,
      periodCredits:  s.periodCredits  + a.periodCredits,
      closingBalance: s.closingBalance + a.closingBalance,
    }),
    { openingBalance: 0, periodDebits: 0, periodCredits: 0, closingBalance: 0 }
  );
  summaryRows.push([
    '',
    'סה"כ',
    '',
    r2(totals.openingBalance),
    r2(totals.periodDebits),
    r2(totals.periodCredits),
    r2(totals.closingBalance),
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 8 }, { wch: 35 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום');

  // One sheet per account
  for (const acc of accounts) {
    try {
      const ledger = await getAccountLedger(tenantId, acc.id, filters.from, filters.to);
      const rows: any[][] = [
        [`${acc.code} — ${acc.name}`, '', '', '', '', ''],
        [`תקופה: ${fromStr} — ${toStr}`, '', '', '', '', ''],
        [],
        ['תאריך', 'אסמכתא', 'תיאור', 'חובה', 'זכות', 'יתרה'],
        [fromStr, '', 'יתרת פתיחה', '', '', ledger.openingBalance],
      ];

      for (const line of ledger.lines) {
        rows.push([
          formatDate(line.date),
          line.reference,
          line.description,
          line.debit  || '',
          line.credit || '',
          line.balance,
        ]);
      }

      rows.push([]);
      rows.push(['', '', 'יתרת סגירה', '', '', ledger.closingBalance]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      ];
      // Sheet name must be <= 31 chars and unique
      const sheetName = `${acc.code}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    } catch {
      // Skip accounts that fail (shouldn't happen in normal flow)
    }
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
