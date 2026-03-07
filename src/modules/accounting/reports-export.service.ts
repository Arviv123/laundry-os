import * as XLSX from 'xlsx';

/**
 * EXCEL EXPORT SERVICE FOR FINANCIAL REPORTS
 * Generates xlsx buffers for P&L, Balance Sheet, Trial Balance, and VAT reports.
 * Hebrew labels are used throughout (RTL-friendly column ordering: code | name | amount).
 */

// ─── Helpers ──────────────────────────────────────────────────────

function createWorkbook(sheetName: string, data: any[][]): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

function toBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function formatDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function emptyRow(): any[] {
  return [];
}

// ─── P&L Export ───────────────────────────────────────────────────

/**
 * Accepts the exact return value of ReportsService.getProfitAndLoss().
 * Shape: { period: {from, to}, revenues, expenses, totalRevenue, totalExpense, netProfit, isProfitable }
 */
export function exportPnLToExcel(data: {
  period: { from: Date | string; to: Date | string };
  revenues: Array<{ code: string; name: string; balance: number }>;
  expenses: Array<{ code: string; name: string; balance: number }>;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  isProfitable: boolean;
}): Buffer {
  const fromStr = formatDate(data.period.from);
  const toStr   = formatDate(data.period.to);

  const rows: any[][] = [
    // Title row
    ['דוח רווח והפסד', '', `${fromStr} - ${toStr}`],
    emptyRow(),
    // Column headers
    ['קוד חשבון', 'שם חשבון', 'סכום'],
    emptyRow(),
    // Revenue section header
    ['── הכנסות ──', '', ''],
  ];

  // Revenue account rows
  for (const acc of data.revenues) {
    rows.push([acc.code, acc.name, acc.balance]);
  }

  // Revenue subtotal
  rows.push(['', 'סה"כ הכנסות', data.totalRevenue]);
  rows.push(emptyRow());

  // Expense section header
  rows.push(['── הוצאות ──', '', '']);

  // Expense account rows
  for (const acc of data.expenses) {
    rows.push([acc.code, acc.name, acc.balance]);
  }

  // Expense subtotal
  rows.push(['', 'סה"כ הוצאות', data.totalExpense]);
  rows.push(emptyRow());

  // Net profit / loss
  rows.push(['', data.netProfit >= 0 ? 'רווח נקי' : 'הפסד נקי', data.netProfit]);

  const wb = createWorkbook('רווח והפסד', rows);
  return toBuffer(wb);
}

// ─── Balance Sheet Export ─────────────────────────────────────────

/**
 * Accepts the exact return value of ReportsService.getBalanceSheet().
 * Shape: { asOf, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, isBalanced }
 */
export function exportBalanceSheetToExcel(data: {
  asOf: Date | string;
  assets:      Array<{ code: string; name: string; balance: number; type: string }>;
  liabilities: Array<{ code: string; name: string; balance: number; type: string }>;
  equity:      Array<{ code: string; name: string; balance: number; type: string }>;
  totalAssets:      number;
  totalLiabilities: number;
  totalEquity:      number;
  isBalanced: boolean;
}): Buffer {
  const asOfStr = formatDate(data.asOf);

  const rows: any[][] = [
    // Title
    ['מאזן', '', `ליום ${asOfStr}`],
    emptyRow(),
    ['קוד חשבון', 'שם חשבון', 'סכום'],
    emptyRow(),

    // Assets section
    ['── נכסים ──', '', ''],
  ];

  for (const acc of data.assets) {
    rows.push([acc.code, acc.name, acc.balance]);
  }
  rows.push(['', 'סה"כ נכסים', data.totalAssets]);
  rows.push(emptyRow());

  // Liabilities section
  rows.push(['── התחייבויות ──', '', '']);
  for (const acc of data.liabilities) {
    rows.push([acc.code, acc.name, acc.balance]);
  }
  rows.push(['', 'סה"כ התחייבויות', data.totalLiabilities]);
  rows.push(emptyRow());

  // Equity section
  rows.push(['── הון עצמי ──', '', '']);
  for (const acc of data.equity) {
    rows.push([acc.code, acc.name, acc.balance]);
  }
  rows.push(['', 'סה"כ הון עצמי', data.totalEquity]);
  rows.push(emptyRow());

  // Liabilities + Equity total
  const totalLiabEquity = Math.round((data.totalLiabilities + data.totalEquity) * 100) / 100;
  rows.push(['', 'סה"כ התחייבויות + הון עצמי', totalLiabEquity]);
  rows.push(emptyRow());

  // Balance check
  rows.push(['', 'מאוזן?', data.isBalanced ? 'כן' : 'לא']);

  const wb = createWorkbook('מאזן', rows);
  return toBuffer(wb);
}

// ─── Trial Balance Export (Period — 6 columns) ────────────────────

/**
 * Accepts the return value of AccountingService.getTrialBalancePeriod().
 * Shape: { period: {from, to}, rows: [{openingDebit, openingCredit, periodDebit, periodCredit, closingDebit, closingCredit, ...}], totals, isBalanced }
 */
export function exportTrialBalancePeriodToExcel(data: {
  period: { from: Date | string; to: Date | string };
  rows: Array<{
    code: string;
    name: string;
    type: string;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  }>;
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  };
  isBalanced: boolean;
}): Buffer {
  const fromStr = formatDate(data.period.from);
  const toStr   = formatDate(data.period.to);

  const rows: any[][] = [
    ['מאזן בוחן', '', `${fromStr} - ${toStr}`, '', '', '', '', '', ''],
    emptyRow(),
    [
      'קוד חשבון', 'שם חשבון', 'סוג',
      'יתרת פתיחה חובה', 'יתרת פתיחה זכות',
      'תנועות חובה', 'תנועות זכות',
      'יתרת סגירה חובה', 'יתרת סגירה זכות',
    ],
  ];

  for (const row of data.rows) {
    rows.push([
      row.code, row.name, row.type,
      row.openingDebit,  row.openingCredit,
      row.periodDebit,   row.periodCredit,
      row.closingDebit,  row.closingCredit,
    ]);
  }

  rows.push(emptyRow());
  rows.push([
    '', 'סה"כ', '',
    data.totals.openingDebit,  data.totals.openingCredit,
    data.totals.periodDebit,   data.totals.periodCredit,
    data.totals.closingDebit,  data.totals.closingCredit,
  ]);
  rows.push(emptyRow());
  rows.push(['', 'מאוזן?', data.isBalanced ? 'כן' : 'לא', '', '', '', '', '', '']);

  const wb = createWorkbook('מאזן בוחן', rows);
  return toBuffer(wb);
}

// ─── Trial Balance Export (Simple — 4 columns) ────────────────────

/**
 * Accepts the return value of AccountingService.getTrialBalance().
 * Shape: { rows: [{code, name, type, totalDebits, totalCredits, balance, ...}], totalDebits, totalCredits, isBalanced }
 */
export function exportTrialBalanceSimpleToExcel(data: {
  rows: Array<{
    code: string;
    name: string;
    type: string;
    totalDebits: number;
    totalCredits: number;
    balance: number;
  }>;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}): Buffer {
  const rows: any[][] = [
    ['מאזן בוחן', '', '', '', '', ''],
    emptyRow(),
    ['קוד חשבון', 'שם חשבון', 'סוג', 'חובה', 'זכות', 'יתרה'],
  ];

  for (const row of data.rows) {
    rows.push([
      row.code,
      row.name,
      row.type,
      row.totalDebits,
      row.totalCredits,
      row.balance,
    ]);
  }

  rows.push(emptyRow());
  rows.push(['', 'סה"כ', '', data.totalDebits, data.totalCredits, '']);
  rows.push(emptyRow());
  rows.push(['', 'מאוזן?', '', data.isBalanced ? 'כן' : 'לא', '', '']);

  const wb = createWorkbook('מאזן בוחן', rows);
  return toBuffer(wb);
}

/**
 * Convenience wrapper — re-exported under the original name for backward compatibility.
 * Accepts either shape; routes should prefer calling the specific function above.
 * Uses `any` internally to avoid TypeScript union narrowing issues.
 */
export function exportTrialBalanceToExcel(data: any): Buffer {
  if (data && data.period !== undefined && data.totals !== undefined) {
    return exportTrialBalancePeriodToExcel(data);
  }
  return exportTrialBalanceSimpleToExcel(data);
}

// ─── VAT Report Export ────────────────────────────────────────────

/**
 * Accepts the exact return value of ReportsService.getVatReport().
 * Shape: {
 *   period,
 *   sales:     { count, subtotal, vatCollected, total, breakdown: [{date, number, customer, subtotal, vat, total}] },
 *   purchases: { count, subtotal, vatPaid,      total, breakdown: [{date, number, vendor,   subtotal, vat, total}] },
 *   summary:   { vatCollected, vatPaid, vatDue, isRefund },
 *   outputVat, inputVat, totalSales, ...
 * }
 */
export function exportVatToExcel(data: {
  period: string;
  sales: {
    count: number;
    subtotal: number;
    vatCollected: number;
    total: number;
    breakdown: Array<{
      date: Date | string;
      number: string;
      customer: string;
      subtotal: number;
      vat: number;
      total: number;
    }>;
  };
  purchases: {
    count: number;
    subtotal: number;
    vatPaid: number;
    total: number;
    breakdown: Array<{
      date: Date | string;
      number: string;
      vendor: string;
      subtotal: number;
      vat: number;
      total: number;
    }>;
  };
  summary: {
    vatCollected: number;
    vatPaid: number;
    vatDue: number;
    isRefund: boolean;
  };
  outputVat?: number;
  inputVat?:  number;
}): Buffer {
  // The workbook will have two sheets: a summary sheet and a details sheet.
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──
  const summaryRows: any[][] = [
    ['דו"ח מע"מ', '', `תקופה: ${data.period}`],
    emptyRow(),
    ['', 'עסקאות (מע"מ עסקאות)', ''],
    ['', 'מחזור עסקאות (ללא מע"מ)', data.sales.subtotal],
    ['', 'מע"מ עסקאות לתשלום',      data.sales.vatCollected],
    ['', 'סה"כ עסקאות',             data.sales.total],
    ['', 'מספר חשבוניות',           data.sales.count],
    emptyRow(),
    ['', 'תשומות (מע"מ תשומות)', ''],
    ['', 'סה"כ רכישות (ללא מע"מ)', data.purchases.subtotal],
    ['', 'מע"מ תשומות להחזר',      data.purchases.vatPaid],
    ['', 'סה"כ תשומות',             data.purchases.total],
    ['', 'מספר חשבוניות רכש',      data.purchases.count],
    emptyRow(),
    ['', 'סיכום', ''],
    ['', 'מע"מ עסקאות',   data.summary.vatCollected],
    ['', 'מע"מ תשומות',   data.summary.vatPaid],
    ['', data.summary.isRefund ? 'לזכות / להחזר' : 'לתשלום', data.summary.vatDue],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום מע"מ');

  // ── Sheet 2: Sales breakdown ──
  const salesRows: any[][] = [
    [`עסקאות - ${data.period}`],
    emptyRow(),
    ['תאריך', 'מספר חשבונית', 'לקוח', 'סכום ללא מע"מ', 'מע"מ', 'סה"כ'],
  ];

  for (const inv of data.sales.breakdown) {
    salesRows.push([
      formatDate(inv.date),
      inv.number,
      inv.customer,
      inv.subtotal,
      inv.vat,
      inv.total,
    ]);
  }

  salesRows.push(emptyRow());
  salesRows.push(['', '', 'סה"כ', data.sales.subtotal, data.sales.vatCollected, data.sales.total]);

  const wsSales = XLSX.utils.aoa_to_sheet(salesRows);
  XLSX.utils.book_append_sheet(wb, wsSales, 'עסקאות');

  // ── Sheet 3: Purchases breakdown ──
  const purchaseRows: any[][] = [
    [`תשומות - ${data.period}`],
    emptyRow(),
    ['תאריך', 'מספר חשבונית', 'ספק', 'סכום ללא מע"מ', 'מע"מ', 'סה"כ'],
  ];

  for (const bill of data.purchases.breakdown) {
    purchaseRows.push([
      formatDate(bill.date),
      bill.number,
      bill.vendor,
      bill.subtotal,
      bill.vat,
      bill.total,
    ]);
  }

  purchaseRows.push(emptyRow());
  purchaseRows.push(['', '', 'סה"כ', data.purchases.subtotal, data.purchases.vatPaid, data.purchases.total]);

  const wsPurchases = XLSX.utils.aoa_to_sheet(purchaseRows);
  XLSX.utils.book_append_sheet(wb, wsPurchases, 'תשומות');

  return toBuffer(wb);
}
