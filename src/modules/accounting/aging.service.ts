import { prisma } from '../../config/database';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AgingBucket {
  current: number;    // 0–30 days
  days31_60: number;  // 31–60 days
  days61_90: number;  // 61–90 days
  days91_120: number; // 91–120 days
  over120: number;    // 121+ days
  total: number;
}

export interface CustomerAgingRow {
  customerId: string;
  customerName: string;
  phone?: string;
  email?: string;
  buckets: AgingBucket;
  oldestInvoiceDate: Date;
  invoiceCount: number;
}

export interface VendorAgingRow {
  vendorId: string;
  vendorName: string;
  phone?: string;
  email?: string;
  buckets: AgingBucket;
  oldestBillDate: Date;
  billCount: number;
}

export interface AgingSummary {
  ar: {
    total: number;
    current: number;
    overdue30: number;
    overdue60: number;
    overdue90: number;
    overdue120plus: number;
  };
  ap: {
    total: number;
    current: number;
    overdue30: number;
    overdue60: number;
    overdue90: number;
    overdue120plus: number;
  };
  netPosition: number; // ar.total - ap.total
  asOfDate: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Calculate days between two dates (positive if asOf > refDate, i.e. past due).
 */
function daysDiff(refDate: Date, asOf: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((asOf.getTime() - refDate.getTime()) / msPerDay);
}

/**
 * Classify a number of days into an aging bucket key.
 */
function bucketKey(days: number): keyof Omit<AgingBucket, 'total'> {
  if (days <= 30)  return 'current';
  if (days <= 60)  return 'days31_60';
  if (days <= 90)  return 'days61_90';
  if (days <= 120) return 'days91_120';
  return 'over120';
}

function emptyBucket(): AgingBucket {
  return { current: 0, days31_60: 0, days61_90: 0, days91_120: 0, over120: 0, total: 0 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// AR Aging — Accounts Receivable
// ─────────────────────────────────────────────

/**
 * Returns aging of outstanding customer invoices grouped by customer.
 * Considers invoices with status SENT or OVERDUE where dueDate <= asOfDate
 * OR status is OVERDUE (regardless of dueDate).
 */
export async function getARAgingReport(
  tenantId: string,
  asOfDate?: Date,
): Promise<CustomerAgingRow[]> {
  const asOf = asOfDate ?? new Date();

  // Fetch all open receivable invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: ['SENT', 'OVERDUE'] },
    },
    include: {
      customer: {
        select: { id: true, name: true, phone: true, email: true },
      },
      payments: {
        select: { amount: true },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  // Internal accumulator type allows null from Prisma
  type CustomerAcc = {
    customerId: string;
    customerName: string;
    phone: string | null;
    email: string | null;
    buckets: AgingBucket;
    oldestInvoiceDate: Date;
    invoiceCount: number;
  };

  const customerMap = new Map<string, CustomerAcc>();

  for (const inv of invoices) {
    // Outstanding = total - sum of payments already applied
    const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = round2(Number(inv.total) - paid);
    if (outstanding <= 0) continue; // fully paid — skip

    const daysOverdue = daysDiff(inv.dueDate, asOf);
    const bucket      = bucketKey(Math.max(daysOverdue, 0));

    if (!customerMap.has(inv.customerId)) {
      customerMap.set(inv.customerId, {
        customerId:        inv.customerId,
        customerName:      inv.customer.name,
        phone:             inv.customer.phone,
        email:             inv.customer.email,
        buckets:           emptyBucket(),
        oldestInvoiceDate: inv.dueDate,
        invoiceCount:      0,
      });
    }

    const row = customerMap.get(inv.customerId)!;
    row.buckets[bucket]  = round2(row.buckets[bucket] + outstanding);
    row.buckets.total    = round2(row.buckets.total   + outstanding);
    row.invoiceCount    += 1;
    if (inv.dueDate < row.oldestInvoiceDate) {
      row.oldestInvoiceDate = inv.dueDate;
    }
  }

  // Sort: most overdue first, then by total descending
  return [...customerMap.values()]
    .sort((a, b) => {
      if (b.buckets.over120 !== a.buckets.over120) return b.buckets.over120 - a.buckets.over120;
      return b.buckets.total - a.buckets.total;
    })
    .map(r => ({
      ...r,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
    }));
}

// ─────────────────────────────────────────────
// AP Aging — Accounts Payable
// ─────────────────────────────────────────────

/**
 * Returns aging of outstanding vendor bills grouped by vendor.
 * Considers bills with status POSTED, PARTIALLY_PAID, or OVERDUE.
 */
export async function getAPAgingReport(
  tenantId: string,
  asOfDate?: Date,
): Promise<VendorAgingRow[]> {
  const asOf = asOfDate ?? new Date();

  const bills = await prisma.bill.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    include: {
      vendor: {
        select: { id: true, name: true, phone: true, email: true },
      },
      payments: {
        select: { amount: true },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  // Internal accumulator type allows null from Prisma
  type VendorAcc = {
    vendorId: string;
    vendorName: string;
    phone: string | null;
    email: string | null;
    buckets: AgingBucket;
    oldestBillDate: Date;
    billCount: number;
  };

  const vendorMap = new Map<string, VendorAcc>();

  for (const bill of bills) {
    const paid        = bill.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = round2(Number(bill.total) - paid);
    if (outstanding <= 0) continue;

    const daysOverdue = daysDiff(bill.dueDate, asOf);
    const bucket      = bucketKey(Math.max(daysOverdue, 0));

    if (!vendorMap.has(bill.vendorId)) {
      vendorMap.set(bill.vendorId, {
        vendorId:       bill.vendorId,
        vendorName:     bill.vendor.name,
        phone:          bill.vendor.phone,
        email:          bill.vendor.email,
        buckets:        emptyBucket(),
        oldestBillDate: bill.dueDate,
        billCount:      0,
      });
    }

    const row = vendorMap.get(bill.vendorId)!;
    row.buckets[bucket] = round2(row.buckets[bucket] + outstanding);
    row.buckets.total   = round2(row.buckets.total   + outstanding);
    row.billCount      += 1;
    if (bill.dueDate < row.oldestBillDate) {
      row.oldestBillDate = bill.dueDate;
    }
  }

  return [...vendorMap.values()]
    .sort((a, b) => {
      if (b.buckets.over120 !== a.buckets.over120) return b.buckets.over120 - a.buckets.over120;
      return b.buckets.total - a.buckets.total;
    })
    .map(r => ({
      ...r,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
    }));
}

// ─────────────────────────────────────────────
// Combined Aging Summary
// ─────────────────────────────────────────────

export async function getAgingSummary(
  tenantId: string,
  asOfDate?: Date,
): Promise<AgingSummary> {
  const asOf = asOfDate ?? new Date();

  const [arRows, apRows] = await Promise.all([
    getARAgingReport(tenantId, asOf),
    getAPAgingReport(tenantId, asOf),
  ]);

  function sumBuckets(rows: Array<{ buckets: AgingBucket }>) {
    const acc = emptyBucket();
    for (const r of rows) {
      acc.current    = round2(acc.current    + r.buckets.current);
      acc.days31_60  = round2(acc.days31_60  + r.buckets.days31_60);
      acc.days61_90  = round2(acc.days61_90  + r.buckets.days61_90);
      acc.days91_120 = round2(acc.days91_120 + r.buckets.days91_120);
      acc.over120    = round2(acc.over120    + r.buckets.over120);
      acc.total      = round2(acc.total      + r.buckets.total);
    }
    return acc;
  }

  const arTotals = sumBuckets(arRows);
  const apTotals = sumBuckets(apRows);

  return {
    ar: {
      total:         arTotals.total,
      current:       arTotals.current,
      overdue30:     arTotals.days31_60,
      overdue60:     arTotals.days61_90,
      overdue90:     arTotals.days91_120,
      overdue120plus: arTotals.over120,
    },
    ap: {
      total:         apTotals.total,
      current:       apTotals.current,
      overdue30:     apTotals.days31_60,
      overdue60:     apTotals.days61_90,
      overdue90:     apTotals.days91_120,
      overdue120plus: apTotals.over120,
    },
    netPosition: round2(arTotals.total - apTotals.total),
    asOfDate:    formatDate(asOf),
  };
}

// ─────────────────────────────────────────────
// XLSX Export helpers
// ─────────────────────────────────────────────

const HEADER_AR = [
  'שם לקוח',
  'טלפון',
  'שוטף (0-30)',
  '31-60 יום',
  '61-90 יום',
  '91-120 יום',
  'מעל 120 יום',
  'סה"כ חוב',
  'מספר חשבוניות',
  'תאריך חשבונית ישנה ביותר',
];

const HEADER_AP = [
  'שם ספק',
  'טלפון',
  'שוטף (0-30)',
  '31-60 יום',
  '61-90 יום',
  '91-120 יום',
  'מעל 120 יום',
  'סה"כ חוב',
  'מספר חשבוניות',
  'תאריך חשבונית ישנה ביותר',
];

function addBoldHeader(ws: XLSX.WorkSheet, headerRow: number, colCount: number): void {
  for (let c = 0; c < colCount; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: headerRow, c });
    if (ws[cellRef]) {
      ws[cellRef].s = { font: { bold: true } };
    }
  }
}

function buildARRows(rows: CustomerAgingRow[]): any[][] {
  const data: any[][] = [
    [`דוח גיל חוב - לקוחות`, '', '', '', '', '', '', '', '', ''],
    [],
    HEADER_AR,
  ];

  for (const row of rows) {
    data.push([
      row.customerName,
      row.phone ?? '',
      row.buckets.current,
      row.buckets.days31_60,
      row.buckets.days61_90,
      row.buckets.days91_120,
      row.buckets.over120,
      row.buckets.total,
      row.invoiceCount,
      formatDate(row.oldestInvoiceDate),
    ]);
  }

  // Totals row
  const totals = rows.reduce(
    (acc, r) => ({
      current:    round2(acc.current    + r.buckets.current),
      days31_60:  round2(acc.days31_60  + r.buckets.days31_60),
      days61_90:  round2(acc.days61_90  + r.buckets.days61_90),
      days91_120: round2(acc.days91_120 + r.buckets.days91_120),
      over120:    round2(acc.over120    + r.buckets.over120),
      total:      round2(acc.total      + r.buckets.total),
    }),
    emptyBucket(),
  );

  data.push([]);
  data.push([
    'סה"כ',
    '',
    totals.current,
    totals.days31_60,
    totals.days61_90,
    totals.days91_120,
    totals.over120,
    totals.total,
    '',
    '',
  ]);

  return data;
}

function buildAPRows(rows: VendorAgingRow[]): any[][] {
  const data: any[][] = [
    [`דוח גיל חוב - ספקים`, '', '', '', '', '', '', '', '', ''],
    [],
    HEADER_AP,
  ];

  for (const row of rows) {
    data.push([
      row.vendorName,
      row.phone ?? '',
      row.buckets.current,
      row.buckets.days31_60,
      row.buckets.days61_90,
      row.buckets.days91_120,
      row.buckets.over120,
      row.buckets.total,
      row.billCount,
      formatDate(row.oldestBillDate),
    ]);
  }

  const totals = rows.reduce(
    (acc, r) => ({
      current:    round2(acc.current    + r.buckets.current),
      days31_60:  round2(acc.days31_60  + r.buckets.days31_60),
      days61_90:  round2(acc.days61_90  + r.buckets.days61_90),
      days91_120: round2(acc.days91_120 + r.buckets.days91_120),
      over120:    round2(acc.over120    + r.buckets.over120),
      total:      round2(acc.total      + r.buckets.total),
    }),
    emptyBucket(),
  );

  data.push([]);
  data.push([
    'סה"כ',
    '',
    totals.current,
    totals.days31_60,
    totals.days61_90,
    totals.days91_120,
    totals.over120,
    totals.total,
    '',
    '',
  ]);

  return data;
}

// ─────────────────────────────────────────────
// XLSX Export — AR
// ─────────────────────────────────────────────

export async function exportARAgingXLSX(
  tenantId: string,
  asOfDate?: Date,
): Promise<Buffer> {
  const rows  = await getARAgingReport(tenantId, asOfDate);
  const data  = buildARRows(rows);

  const ws = XLSX.utils.aoa_to_sheet(data);
  addBoldHeader(ws, 2, HEADER_AR.length); // row index 2 = header row

  // Set column widths (approximate)
  ws['!cols'] = [
    { wch: 30 }, // שם לקוח
    { wch: 16 }, // טלפון
    { wch: 14 }, // שוטף
    { wch: 14 }, // 31-60
    { wch: 14 }, // 61-90
    { wch: 14 }, // 91-120
    { wch: 14 }, // מעל 120
    { wch: 14 }, // סה"כ
    { wch: 12 }, // מספר חשבוניות
    { wch: 18 }, // תאריך
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'דוח גיל חוב - לקוחות');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─────────────────────────────────────────────
// XLSX Export — AP
// ─────────────────────────────────────────────

export async function exportAPAgingXLSX(
  tenantId: string,
  asOfDate?: Date,
): Promise<Buffer> {
  const rows = await getAPAgingReport(tenantId, asOfDate);
  const data = buildAPRows(rows);

  const ws = XLSX.utils.aoa_to_sheet(data);
  addBoldHeader(ws, 2, HEADER_AP.length);

  ws['!cols'] = [
    { wch: 30 }, // שם ספק
    { wch: 16 }, // טלפון
    { wch: 14 }, // שוטף
    { wch: 14 }, // 31-60
    { wch: 14 }, // 61-90
    { wch: 14 }, // 91-120
    { wch: 14 }, // מעל 120
    { wch: 14 }, // סה"כ
    { wch: 12 }, // מספר חשבוניות
    { wch: 18 }, // תאריך
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'דוח גיל חוב - ספקים');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
