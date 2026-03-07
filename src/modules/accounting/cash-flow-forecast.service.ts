import { prisma } from '../../config/database';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CashFlowDay {
  date: string;                // ISO date YYYY-MM-DD
  expectedInflows: number;     // from open invoices due that day
  expectedOutflows: number;    // from open bills due that day
  netFlow: number;             // inflows - outflows
  runningBalance: number;      // cumulative from opening balance
}

export interface CashFlowForecast {
  openingBalance: number;
  days: CashFlowDay[];
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netFlow: number;
    closingBalance: number;
    lowestBalance: number;        // minimum running balance (cash crunch detector)
    lowestBalanceDate: string;
  };
  generatedAt: string;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  inflows: number;
  outflows: number;
  net: number;
}

export interface MonthlySummary {
  month: string;     // YYYY-MM
  inflows: number;
  outflows: number;
  net: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for a Date object (local-date string). */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns midnight (start of day) for a date offset from today by `offsetDays`. */
function dayOffset(from: Date, offsetDays: number): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** Round a Decimal/number to 2dp. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Given a RecurringInvoice's frequency and nextRunDate, project all occurrence
 * dates within [from, to] (inclusive). Returns an array of Date objects.
 */
function projectRecurringDates(
  frequency: string,
  nextRunDate: Date,
  endDate: Date | null,
  from: Date,
  to: Date,
): Date[] {
  const occurrences: Date[] = [];

  // How many days to advance per step
  const stepDays: Record<string, number> = {
    DAILY:     1,
    WEEKLY:    7,
    MONTHLY:   0,   // handled separately
    QUARTERLY: 0,   // handled separately
    YEARLY:    0,   // handled separately
  };

  let current = new Date(nextRunDate);
  current.setUTCHours(0, 0, 0, 0);

  const effectiveTo = endDate && endDate < to ? endDate : to;

  // Safety: iterate at most 500 times to avoid infinite loops
  let guard = 0;
  while (current <= effectiveTo && guard < 500) {
    guard++;
    if (current >= from) {
      occurrences.push(new Date(current));
    }

    // Advance to next occurrence
    if (frequency === 'DAILY') {
      current.setUTCDate(current.getUTCDate() + stepDays.DAILY);
    } else if (frequency === 'WEEKLY') {
      current.setUTCDate(current.getUTCDate() + stepDays.WEEKLY);
    } else if (frequency === 'MONTHLY') {
      current.setUTCMonth(current.getUTCMonth() + 1);
    } else if (frequency === 'QUARTERLY') {
      current.setUTCMonth(current.getUTCMonth() + 3);
    } else if (frequency === 'YEARLY') {
      current.setUTCFullYear(current.getUTCFullYear() + 1);
    } else {
      break; // unknown frequency — stop
    }
  }

  return occurrences;
}

/**
 * Compute the total amount of a RecurringInvoice (sum of lines * vatRate).
 * vatRate stored as whole number (e.g. 17 = 17%). Lines are quantity * unitPrice.
 */
function recurringInvoiceTotal(ri: {
  vatRate: { toNumber: () => number } | number;
  lines: Array<{
    quantity: { toNumber: () => number } | number;
    unitPrice: { toNumber: () => number } | number;
  }>;
}): number {
  const vatRate =
    typeof ri.vatRate === 'object' ? ri.vatRate.toNumber() : Number(ri.vatRate);
  const subtotal = ri.lines.reduce((sum, line) => {
    const qty =
      typeof line.quantity === 'object' ? line.quantity.toNumber() : Number(line.quantity);
    const price =
      typeof line.unitPrice === 'object' ? line.unitPrice.toNumber() : Number(line.unitPrice);
    return sum + qty * price;
  }, 0);
  return r2(subtotal * (1 + vatRate / 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// getCashFlowForecast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a day-by-day cash-flow forecast for the next `horizonDays` days.
 *
 * Expected inflows  — SENT + OVERDUE invoices whose dueDate falls in window.
 * Expected outflows — POSTED + OVERDUE bills whose dueDate falls in window.
 * Recurring inflows — ACTIVE RecurringInvoices projected into the window.
 */
export async function getCashFlowForecast(
  tenantId: string,
  horizonDays = 90,
  openingBalance = 0,
): Promise<CashFlowForecast> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizonEnd = dayOffset(today, horizonDays);

  // ── 1. Open invoices (expected inflows) ──────────────────────────────────
  const openInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status:    { in: ['SENT', 'OVERDUE'] },
      dueDate:   { gte: today, lte: horizonEnd },
      deletedAt: null,
    },
    select: { dueDate: true, total: true },
  });

  // ── 2. Open bills (expected outflows) ────────────────────────────────────
  const openBills = await prisma.bill.findMany({
    where: {
      tenantId,
      status:    { in: ['POSTED', 'OVERDUE'] },
      dueDate:   { gte: today, lte: horizonEnd },
      deletedAt: null,
    },
    select: { dueDate: true, total: true },
  });

  // ── 3. Recurring invoices (projected inflows) ─────────────────────────────
  const recurringInvoices = await prisma.recurringInvoice.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      // Only fetch those whose nextRunDate is before horizon ends and not expired
      OR: [
        { endDate: null },
        { endDate: { gte: today } },
      ],
      nextRunDate: { lte: horizonEnd },
    },
    select: {
      frequency:   true,
      nextRunDate: true,
      endDate:     true,
      vatRate:     true,
      lines: {
        select: { quantity: true, unitPrice: true },
      },
    },
  });

  // ── 4. Build day map ──────────────────────────────────────────────────────
  //   key: YYYY-MM-DD  value: { inflows, outflows }
  const dayMap = new Map<string, { inflows: number; outflows: number }>();

  // Initialise every day in the window
  for (let i = 0; i <= horizonDays; i++) {
    dayMap.set(toDateStr(dayOffset(today, i)), { inflows: 0, outflows: 0 });
  }

  // Populate inflows from invoices
  for (const inv of openInvoices) {
    const key = toDateStr(new Date(inv.dueDate));
    const entry = dayMap.get(key);
    if (entry) {
      entry.inflows = r2(entry.inflows + Number(inv.total));
    }
  }

  // Populate outflows from bills
  for (const bill of openBills) {
    const key = toDateStr(new Date(bill.dueDate));
    const entry = dayMap.get(key);
    if (entry) {
      entry.outflows = r2(entry.outflows + Number(bill.total));
    }
  }

  // Populate inflows from recurring invoices
  for (const ri of recurringInvoices) {
    const amount = recurringInvoiceTotal(ri as any);
    const occurrences = projectRecurringDates(
      ri.frequency as string,
      new Date(ri.nextRunDate),
      ri.endDate ? new Date(ri.endDate) : null,
      today,
      horizonEnd,
    );
    for (const occ of occurrences) {
      const key = toDateStr(occ);
      const entry = dayMap.get(key);
      if (entry) {
        entry.inflows = r2(entry.inflows + amount);
      }
    }
  }

  // ── 5. Build ordered day array with running balance ───────────────────────
  const sortedKeys = Array.from(dayMap.keys()).sort();
  let runningBalance = openingBalance;
  let lowestBalance = openingBalance;
  let lowestBalanceDate = sortedKeys[0] ?? toDateStr(today);

  const days: CashFlowDay[] = sortedKeys.map((dateStr) => {
    const { inflows, outflows } = dayMap.get(dateStr)!;
    const netFlow = r2(inflows - outflows);
    runningBalance = r2(runningBalance + netFlow);

    if (runningBalance < lowestBalance) {
      lowestBalance = runningBalance;
      lowestBalanceDate = dateStr;
    }

    return {
      date:              dateStr,
      expectedInflows:   r2(inflows),
      expectedOutflows:  r2(outflows),
      netFlow:           r2(netFlow),
      runningBalance:    r2(runningBalance),
    };
  });

  // ── 6. Summary ────────────────────────────────────────────────────────────
  const totalInflows  = r2(days.reduce((s, d) => s + d.expectedInflows,  0));
  const totalOutflows = r2(days.reduce((s, d) => s + d.expectedOutflows, 0));
  const netFlow       = r2(totalInflows - totalOutflows);
  const closingBalance = r2(openingBalance + netFlow);

  return {
    openingBalance: r2(openingBalance),
    days,
    summary: {
      totalInflows,
      totalOutflows,
      netFlow,
      closingBalance,
      lowestBalance:     r2(lowestBalance),
      lowestBalanceDate,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklySummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups the forecast into ISO-weeks. Returns up to `weeks` weeks starting today.
 */
export async function getWeeklySummary(
  tenantId: string,
  weeks = 12,
): Promise<WeeklySummary[]> {
  const horizonDays = weeks * 7;
  const forecast = await getCashFlowForecast(tenantId, horizonDays, 0);

  const weekMap = new Map<string, WeeklySummary>();

  for (const day of forecast.days) {
    const d = new Date(day.date);
    // ISO week start = this Monday
    const dayOfWeek = d.getUTCDay(); // 0 = Sun
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + daysToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const weekKey = toDateStr(monday);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekStart: toDateStr(monday),
        weekEnd:   toDateStr(sunday),
        inflows:   0,
        outflows:  0,
        net:       0,
      });
    }
    const entry = weekMap.get(weekKey)!;
    entry.inflows  = r2(entry.inflows  + day.expectedInflows);
    entry.outflows = r2(entry.outflows + day.expectedOutflows);
    entry.net      = r2(entry.inflows  - entry.outflows);
  }

  return Array.from(weekMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(0, weeks);
}

// ─────────────────────────────────────────────────────────────────────────────
// getMonthlySummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups the forecast into calendar months. Returns up to `months` months.
 */
export async function getMonthlySummary(
  tenantId: string,
  months = 6,
): Promise<MonthlySummary[]> {
  // We need enough days to cover `months` full calendar months.
  // Use a generous buffer: months * 31 days.
  const horizonDays = months * 31;
  const forecast = await getCashFlowForecast(tenantId, horizonDays, 0);

  const monthMap = new Map<string, MonthlySummary>();

  for (const day of forecast.days) {
    const monthKey = day.date.slice(0, 7); // YYYY-MM
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { month: monthKey, inflows: 0, outflows: 0, net: 0 });
    }
    const entry = monthMap.get(monthKey)!;
    entry.inflows  = r2(entry.inflows  + day.expectedInflows);
    entry.outflows = r2(entry.outflows + day.expectedOutflows);
    entry.net      = r2(entry.inflows  - entry.outflows);
  }

  return Array.from(monthMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(0, months);
}

// ─────────────────────────────────────────────────────────────────────────────
// exportForecastXLSX
// ─────────────────────────────────────────────────────────────────────────────

/** XLSX cell address helper (0-indexed col, 0-indexed row). */
function cellAddress(col: number, row: number): string {
  // col 0→A, 1→B, …
  const colLetter = String.fromCharCode(65 + col);
  return `${colLetter}${row + 1}`;
}

/**
 * Generates an Excel workbook with two sheets:
 *   Sheet 1 "תחזית יומית" — day-by-day forecast, negative balances highlighted in red.
 *   Sheet 2 "סיכום שבועי"  — weekly grouping.
 */
export async function exportForecastXLSX(
  tenantId: string,
  horizonDays = 90,
  openingBalance = 0,
): Promise<Buffer> {
  const [forecast, weekly] = await Promise.all([
    getCashFlowForecast(tenantId, horizonDays, openingBalance),
    getWeeklySummary(tenantId, Math.ceil(horizonDays / 7)),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: תחזית יומית ──────────────────────────────────────────────────
  const dailyHeaders = ['תאריך', 'תקבולים צפויים', 'תשלומים צפויים', 'תזרים נטו', 'יתרה מצטברת'];

  const dailyRows: any[][] = [
    [`תחזית תזרים מזומנים — ${forecast.days[0]?.date ?? ''} עד ${forecast.days[forecast.days.length - 1]?.date ?? ''}`],
    [`יתרה פתיחה: ${forecast.openingBalance.toLocaleString('he-IL', { minimumFractionDigits: 2 })}`],
    [],
    dailyHeaders,
  ];

  const headerRowIndex = 3; // 0-based row index of the header row
  const dataStartRow   = 4; // 0-based row where data begins

  for (const day of forecast.days) {
    dailyRows.push([
      day.date,
      day.expectedInflows,
      day.expectedOutflows,
      day.netFlow,
      day.runningBalance,
    ]);
  }

  // Summary rows
  dailyRows.push([]);
  dailyRows.push(['סיכום', '', '', '', '']);
  dailyRows.push(['סה"כ תקבולים',  forecast.summary.totalInflows]);
  dailyRows.push(['סה"כ תשלומים',  forecast.summary.totalOutflows]);
  dailyRows.push(['תזרים נטו',      forecast.summary.netFlow]);
  dailyRows.push(['יתרת סגירה',     forecast.summary.closingBalance]);
  dailyRows.push(['יתרה מינימלית',  forecast.summary.lowestBalance]);
  dailyRows.push(['תאריך יתרה מינימלית', forecast.summary.lowestBalanceDate]);

  const wsDaily = XLSX.utils.aoa_to_sheet(dailyRows);

  // Apply red fill to cells in column E (runningBalance, col index 4) where value < 0
  // XLSX.js supports cell styles only in the "pro" (xlsx-style / exceljs) variant.
  // Using the built-in SheetJS we attach styles via the cell object directly.
  const redFill = {
    patternType: 'solid',
    fgColor: { rgb: 'FFFF0000' },
    bgColor: { rgb: 'FFFF0000' },
  };
  const whiteFont = { color: { rgb: 'FFFFFFFF' }, bold: true };

  for (let i = 0; i < forecast.days.length; i++) {
    const rowIndex = dataStartRow + i;
    const day = forecast.days[i];
    if (day.runningBalance < 0) {
      const addr = cellAddress(4, rowIndex); // column E = index 4
      if (wsDaily[addr]) {
        wsDaily[addr].s = { fill: redFill, font: whiteFont };
      }
    }
  }

  // Column widths
  wsDaily['!cols'] = [
    { wch: 14 }, // תאריך
    { wch: 18 }, // תקבולים צפויים
    { wch: 18 }, // תשלומים צפויים
    { wch: 14 }, // תזרים נטו
    { wch: 18 }, // יתרה מצטברת
  ];

  XLSX.utils.book_append_sheet(wb, wsDaily, 'תחזית יומית');

  // ── Sheet 2: סיכום שבועי ──────────────────────────────────────────────────
  const weeklyRows: any[][] = [
    ['סיכום שבועי — תחזית תזרים מזומנים'],
    [],
    ['שבוע מ', 'שבוע עד', 'תקבולים', 'תשלומים', 'נטו'],
  ];

  for (const week of weekly) {
    weeklyRows.push([
      week.weekStart,
      week.weekEnd,
      week.inflows,
      week.outflows,
      week.net,
    ]);
  }

  // Weekly totals
  const weeklyTotalInflows  = r2(weekly.reduce((s, w) => s + w.inflows,  0));
  const weeklyTotalOutflows = r2(weekly.reduce((s, w) => s + w.outflows, 0));
  const weeklyTotalNet      = r2(weeklyTotalInflows - weeklyTotalOutflows);
  weeklyRows.push([]);
  weeklyRows.push(['', 'סה"כ', weeklyTotalInflows, weeklyTotalOutflows, weeklyTotalNet]);

  const wsWeekly = XLSX.utils.aoa_to_sheet(weeklyRows);
  wsWeekly['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, wsWeekly, 'סיכום שבועי');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer;
}
