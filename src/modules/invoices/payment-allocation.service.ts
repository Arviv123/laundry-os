import { prisma } from '../../config/database';

// ─── Types ────────────────────────────────────────────────────────

export interface AllocationInput {
  invoiceId: string;
  amount:    number;
}

export interface AllocatePaymentInput {
  paymentId:   string;
  allocations: AllocationInput[];
}

export interface UnallocatedPaymentRow {
  paymentId:          string;
  invoiceId:          string;
  totalAmount:        number;
  allocatedAmount:    number;
  unallocatedAmount:  number;
  date:               Date;
  method:             string;
}

// Statuses that represent a fully closed invoice
// InvoiceStatus has: DRAFT | SENT | PAID | OVERDUE | CANCELLED
// There is no PARTIALLY_PAID status in the schema.
// Partial payments leave the invoice in its current status (SENT / OVERDUE).

// ─── allocatePayment ──────────────────────────────────────────────

/**
 * מקצה תשלום קיים לחשבוניות אחת או יותר.
 * - מוודא שסכום ההקצאות ≤ סכום התשלום
 * - בודק כי כל חשבונית שייכת לדייר ואינה סגורה
 * - מעדכן סטטוס חשבונית ל-PAID אם שולמה במלואה
 */
export async function allocatePayment(
  tenantId: string,
  userId:   string,
  data:     AllocatePaymentInput
) {
  const { paymentId, allocations } = data;

  // ── 1. Fetch the source payment ──────────────────────────────────
  const payment = await prisma.invoicePayment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.tenantId !== tenantId) {
    throw new Error('Payment not found');
  }

  const paymentTotal = Number(payment.amount);

  // ── 2. Validate allocation sum ───────────────────────────────────
  const allocationSum = allocations.reduce((s, a) => s + a.amount, 0);
  const roundedSum    = Math.round(allocationSum * 100) / 100;

  if (roundedSum > paymentTotal + 0.001) {
    throw new Error(
      `סכום ההקצאות (₪${roundedSum.toFixed(2)}) עולה על סכום התשלום (₪${paymentTotal.toFixed(2)})`
    );
  }

  if (allocations.length === 0) {
    throw new Error('נדרשת לפחות הקצאה אחת');
  }

  // ── 3. Fetch all target invoices ─────────────────────────────────
  const invoiceIds = allocations.map(a => a.invoiceId);
  const invoices   = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, tenantId },
  });

  // Validate each invoice
  for (const alloc of allocations) {
    const inv = invoices.find(i => i.id === alloc.invoiceId);
    if (!inv) {
      throw new Error(`חשבונית ${alloc.invoiceId} לא נמצאה`);
    }
    if (inv.status === 'PAID') {
      throw new Error(`חשבונית ${inv.number} כבר שולמה במלואה`);
    }
    if (inv.status === 'CANCELLED') {
      throw new Error(`חשבונית ${inv.number} מבוטלת`);
    }
    if (alloc.amount <= 0) {
      throw new Error(`סכום הקצאה חייב להיות חיובי עבור חשבונית ${inv.number}`);
    }
  }

  // ── 4. Execute in a transaction ──────────────────────────────────
  return prisma.$transaction(async tx => {
    const created = [];

    for (const alloc of allocations) {
      const inv = invoices.find(i => i.id === alloc.invoiceId)!;

      // Upsert: the schema has @@unique([paymentId, invoiceId])
      // We use createMany-style upsert via upsert to handle re-allocation
      const allocation = await tx.paymentAllocation.upsert({
        where: {
          paymentId_invoiceId: {
            paymentId,
            invoiceId: alloc.invoiceId,
          },
        },
        create: {
          tenantId,
          paymentId,
          invoiceId:   alloc.invoiceId,
          amount:      alloc.amount,
          allocatedBy: userId,
        },
        update: {
          amount:      alloc.amount,
          allocatedBy: userId,
          allocatedAt: new Date(),
        },
      });

      created.push(allocation);

      // ── Recalculate invoice paid total ─────────────────────────
      // Sum ALL payments on this invoice (original InvoicePayment records)
      const paymentAggregate = await tx.invoicePayment.aggregate({
        where: { invoiceId: alloc.invoiceId },
        _sum:  { amount: true },
      });

      // Plus all PaymentAllocation amounts for this invoice
      // (allocations from different payments pointing to this invoice)
      const allocAggregate = await tx.paymentAllocation.aggregate({
        where: { invoiceId: alloc.invoiceId, tenantId },
        _sum:  { amount: true },
      });

      // We determine paid status by checking if the invoice's own payment
      // or any cross-payment allocations fully cover the invoice total.
      // Strategy: use whichever total is higher (direct payments OR allocations)
      const directPaid    = Number(paymentAggregate._sum.amount ?? 0);
      const allocatedPaid = Number(allocAggregate._sum.amount  ?? 0);
      const effectivePaid = Math.max(directPaid, allocatedPaid);
      const invoiceTotal  = Number(inv.total);

      if (effectivePaid >= invoiceTotal - 0.001) {
        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data:  { status: 'PAID', paidAt: new Date() },
        });
      }
      // Partial payment: leave status as-is (SENT / OVERDUE)
      // There is no PARTIALLY_PAID status in the InvoiceStatus enum
    }

    return created;
  });
}

// ─── getPaymentAllocations ────────────────────────────────────────

/**
 * מחזיר את כל ההקצאות של תשלום מסוים.
 */
export async function getPaymentAllocations(paymentId: string, tenantId: string) {
  // Verify the payment belongs to the tenant
  const payment = await prisma.invoicePayment.findUnique({
    where: { id: paymentId },
  });
  if (!payment || payment.tenantId !== tenantId) {
    throw new Error('Payment not found');
  }

  return prisma.paymentAllocation.findMany({
    where:   { paymentId, tenantId },
    include: {
      invoice: {
        select: { number: true, total: true, status: true, dueDate: true },
      },
    },
    orderBy: { allocatedAt: 'desc' },
  });
}

// ─── getInvoiceAllocations ────────────────────────────────────────

/**
 * מחזיר את כל ההקצאות לחשבונית מסוימת.
 */
export async function getInvoiceAllocations(invoiceId: string, tenantId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.tenantId !== tenantId) {
    throw new Error('Invoice not found');
  }

  return prisma.paymentAllocation.findMany({
    where:   { invoiceId, tenantId },
    orderBy: { allocatedAt: 'desc' },
  });
}

// ─── getUnallocatedPayments ───────────────────────────────────────

/**
 * מחזיר תשלומים שיש בהם יתרה לא מוקצית.
 * אופציונלי: לסנן לפי לקוח.
 */
export async function getUnallocatedPayments(
  tenantId:   string,
  customerId?: string
): Promise<UnallocatedPaymentRow[]> {
  // Fetch all payments for this tenant (optionally filtered by customer)
  const paymentsWhere: Record<string, unknown> = { tenantId };

  if (customerId) {
    // InvoicePayment → Invoice → Customer
    paymentsWhere.invoice = { customerId };
  }

  const payments = await prisma.invoicePayment.findMany({
    where:   paymentsWhere as any,
    include: {
      invoice: { select: { customerId: true } },
    },
    orderBy: { date: 'desc' },
  });

  if (payments.length === 0) return [];

  // Fetch all allocation sums in one query
  const paymentIds = payments.map(p => p.id);
  const allocations = await prisma.paymentAllocation.groupBy({
    by:    ['paymentId'],
    where: { paymentId: { in: paymentIds }, tenantId },
    _sum:  { amount: true },
  });

  const allocMap = new Map<string, number>(
    allocations.map(a => [a.paymentId, Number(a._sum.amount ?? 0)])
  );

  const results: UnallocatedPaymentRow[] = [];

  for (const p of payments) {
    const totalAmount     = Number(p.amount);
    const allocatedAmount = allocMap.get(p.id) ?? 0;
    const unallocated     = Math.round((totalAmount - allocatedAmount) * 100) / 100;

    if (unallocated > 0.001) {
      results.push({
        paymentId:         p.id,
        invoiceId:         p.invoiceId,
        totalAmount,
        allocatedAmount,
        unallocatedAmount: unallocated,
        date:              p.date,
        method:            p.method,
      });
    }
  }

  return results;
}

// ─── removeAllocation ─────────────────────────────────────────────

/**
 * מוחק הקצאה ומחשב מחדש את סטטוס החשבונית.
 * אם החשבונית הייתה PAID, מחזיר אותה ל-SENT (או OVERDUE לפי תאריך יעד).
 */
export async function removeAllocation(allocationId: string, tenantId: string): Promise<void> {
  const allocation = await prisma.paymentAllocation.findUnique({
    where: { id: allocationId },
    include: {
      invoice: {
        select: { id: true, total: true, status: true, dueDate: true, tenantId: true },
      },
    },
  });

  if (!allocation || allocation.tenantId !== tenantId) {
    throw new Error('Allocation not found');
  }

  const invoice = allocation.invoice;

  await prisma.$transaction(async tx => {
    // Delete the allocation
    await tx.paymentAllocation.delete({ where: { id: allocationId } });

    // Recalculate how much has been paid for this invoice after removal
    const paymentAggregate = await tx.invoicePayment.aggregate({
      where: { invoiceId: invoice.id },
      _sum:  { amount: true },
    });

    const allocAggregate = await tx.paymentAllocation.aggregate({
      where: { invoiceId: invoice.id, tenantId },
      _sum:  { amount: true },
    });

    const directPaid    = Number(paymentAggregate._sum.amount ?? 0);
    const allocatedPaid = Number(allocAggregate._sum.amount  ?? 0);
    const effectivePaid = Math.max(directPaid, allocatedPaid);
    const invoiceTotal  = Number(invoice.total);

    // If previously PAID and now underpaid, revert status
    if (invoice.status === 'PAID' && effectivePaid < invoiceTotal - 0.001) {
      const today   = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = invoice.dueDate;
      dueDate.setHours(0, 0, 0, 0);

      const revertStatus = dueDate < today ? 'OVERDUE' : 'SENT';

      await tx.invoice.update({
        where: { id: invoice.id },
        data:  { status: revertStatus, paidAt: null },
      });
    }
  });
}
