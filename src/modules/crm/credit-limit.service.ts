import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

// ─── Types ────────────────────────────────────────────────────────

export interface CreditUsageResult {
  creditLimit: number | null;       // null = אשראי בלתי מוגבל
  creditUsed: number;               // סכום חשבוניות פתוחות
  creditAvailable: number | null;   // null = בלתי מוגבל
  isOverLimit: boolean;
  openInvoices: Array<{
    id: string;
    number: string;
    total: number;
    dueDate?: Date;
    status: string;
  }>;
}

export interface CreditCheckResult {
  allowed: boolean;
  message?: string;
  creditAvailable?: number;
}

export interface CustomerCreditReportRow {
  customerId: string;
  customerName: string;
  creditLimit: number | null;
  creditUsed: number;
  creditAvailable: number | null;
  isOverLimit: boolean;
  oldestInvoiceDays: number;
}

// Statuses that consume credit (open / unpaid invoices)
const OPEN_STATUSES = ['SENT', 'OVERDUE'] as const;

// ─── getCustomerCreditUsage ───────────────────────────────────────

/**
 * מחזיר את מצב האשראי הנוכחי של לקוח:
 * תקרת אשראי, כמה נצרך, כמה נותר, ורשימת חשבוניות פתוחות.
 */
export async function getCustomerCreditUsage(
  customerId: string,
  tenantId: string
): Promise<CreditUsageResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, tenantId: true, creditLimit: true },
  });

  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  const openInvoices = await prisma.invoice.findMany({
    where: {
      customerId,
      tenantId,
      status: { in: OPEN_STATUSES as unknown as ('SENT' | 'OVERDUE')[] },
    },
    select: {
      id: true,
      number: true,
      total: true,
      dueDate: true,
      status: true,
    },
    orderBy: { dueDate: 'asc' },
  });

  const creditUsed = openInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const creditLimit = customer.creditLimit !== null ? Number(customer.creditLimit) : null;
  const creditAvailable = creditLimit !== null ? Math.max(0, creditLimit - creditUsed) : null;
  const isOverLimit = creditLimit !== null ? creditUsed > creditLimit : false;

  return {
    creditLimit,
    creditUsed,
    creditAvailable,
    isOverLimit,
    openInvoices: openInvoices.map(inv => ({
      id:       inv.id,
      number:   inv.number,
      total:    Number(inv.total),
      dueDate:  inv.dueDate ?? undefined,
      status:   inv.status,
    })),
  };
}

// ─── checkCreditLimit ─────────────────────────────────────────────

/**
 * בודק האם יצירת חשבונית חדשה בסכום נתון תחרוג מתקרת האשראי של הלקוח.
 * מחזיר { allowed: true } אם אין תקרה מוגדרת.
 */
export async function checkCreditLimit(
  customerId: string,
  tenantId: string,
  newInvoiceAmount: number
): Promise<CreditCheckResult> {
  const usage = await getCustomerCreditUsage(customerId, tenantId);

  // אין תקרת אשראי → מותר תמיד
  if (usage.creditLimit === null) {
    return { allowed: true };
  }

  const totalAfterNew = usage.creditUsed + newInvoiceAmount;

  if (totalAfterNew > usage.creditLimit) {
    const overBy = totalAfterNew - usage.creditLimit;
    return {
      allowed: false,
      creditAvailable: usage.creditAvailable ?? 0,
      message: `חריגה מתקרת האשראי: ₪${overBy.toFixed(2)} מעל המותר. ` +
               `תקרת אשראי: ₪${usage.creditLimit.toFixed(2)}, ` +
               `בשימוש: ₪${usage.creditUsed.toFixed(2)}, ` +
               `זמין: ₪${(usage.creditAvailable ?? 0).toFixed(2)}.`,
    };
  }

  return {
    allowed: true,
    creditAvailable: usage.creditAvailable ?? 0,
  };
}

// ─── setCustomerCreditLimit ───────────────────────────────────────

/**
 * מגדיר (או מוחק) את תקרת האשראי של לקוח.
 * העברת null מבטלת את התקרה (אשראי בלתי מוגבל).
 */
export async function setCustomerCreditLimit(
  customerId: string,
  tenantId: string,
  creditLimit: number | null,
  paymentTermsDays?: number
) {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      creditLimit:      creditLimit !== null ? new Prisma.Decimal(creditLimit) : null,
      paymentTermsDays: paymentTermsDays !== undefined ? paymentTermsDays : existing.paymentTermsDays,
    },
  });
}

// ─── getCustomerCreditReport ──────────────────────────────────────

/**
 * דו"ח אשראי לכלל הלקוחות של הדייר (AR overview).
 * מחזיר תקרת אשראי, שימוש, זמינות, חריגות, וגיל החשבונית הפתוחה הישנה ביותר.
 */
export async function getCustomerCreditReport(
  tenantId: string
): Promise<CustomerCreditReportRow[]> {
  const customers = await prisma.customer.findMany({
    where:  { tenantId },
    select: { id: true, name: true, creditLimit: true },
    orderBy: { name: 'asc' },
  });

  const today = new Date();

  // מושך חשבוניות פתוחות לכל הלקוחות בבת אחת
  const openInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: OPEN_STATUSES as unknown as ('SENT' | 'OVERDUE')[] },
    },
    select: {
      customerId: true,
      total:      true,
      dueDate:    true,
    },
  });

  // מקבץ לפי לקוח
  const byCustomer = new Map<
    string,
    { totalUsed: number; oldestDueDate: Date | null }
  >();

  for (const inv of openInvoices) {
    const existing = byCustomer.get(inv.customerId);
    const dueDate  = inv.dueDate;

    if (!existing) {
      byCustomer.set(inv.customerId, {
        totalUsed:    Number(inv.total),
        oldestDueDate: dueDate,
      });
    } else {
      existing.totalUsed += Number(inv.total);
      if (dueDate && (!existing.oldestDueDate || dueDate < existing.oldestDueDate)) {
        existing.oldestDueDate = dueDate;
      }
    }
  }

  return customers.map(customer => {
    const data         = byCustomer.get(customer.id);
    const creditUsed   = data?.totalUsed ?? 0;
    const creditLimit  = customer.creditLimit !== null ? Number(customer.creditLimit) : null;
    const creditAvail  = creditLimit !== null ? Math.max(0, creditLimit - creditUsed) : null;
    const isOverLimit  = creditLimit !== null ? creditUsed > creditLimit : false;
    const oldestDue    = data?.oldestDueDate ?? null;
    const oldestDays   = oldestDue
      ? Math.floor((today.getTime() - oldestDue.getTime()) / 86_400_000)
      : 0;

    return {
      customerId:       customer.id,
      customerName:     customer.name,
      creditLimit,
      creditUsed,
      creditAvailable:  creditAvail,
      isOverLimit,
      oldestInvoiceDays: Math.max(0, oldestDays),
    };
  });
}
