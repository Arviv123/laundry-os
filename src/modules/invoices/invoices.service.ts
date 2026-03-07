import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../../config/database';
import { createTransaction, voidTransaction } from '../accounting/accounting.service';

// ─── Helpers ──────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Auto-number generator ────────────────────────────────────────

async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { tenantId },
  });
  const seq = String(count + 1).padStart(4, '0');
  return `INV-${year}-${seq}`;
}

// ─── Create Invoice ───────────────────────────────────────────────

export interface CreateInvoiceInput {
  tenantId:       string;
  customerId:     string;
  date:           Date;
  dueDate:        Date;
  notes?:         string;
  paymentTerms?:  string;
  reference?:     string;
  discountPercent?: number;  // % הנחה כללית
  createdBy:      string;
  lines: Array<{
    description:     string;
    sku?:            string;
    barcode?:        string;
    unit?:           string;
    quantity:        number;
    unitPrice:       number;
    discountPercent?: number;  // % הנחה לשורה
    vatRate?:        number;   // default 0.18
    notes?:          string;
  }>;
}

export async function createInvoice(input: CreateInvoiceInput) {
  // Verify customer belongs to tenant
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer || customer.tenantId !== input.tenantId) {
    throw new Error('Customer not found');
  }

  // Calculate totals (with per-line and overall discounts)
  const processedLines = input.lines.map((line, idx) => {
    const vatRate       = line.vatRate ?? 0.18;
    const discountPct   = line.discountPercent ?? 0;
    const gross         = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const discountAmt   = Math.round(gross * discountPct / 100 * 100) / 100;
    const lineTotal     = Math.round((gross - discountAmt) * 100) / 100;
    return { ...line, vatRate, discountPercent: discountPct, discountAmount: discountAmt, lineTotal, sortOrder: idx };
  });

  const subtotal = processedLines.reduce((s, l) => s + l.lineTotal, 0);
  const overallDiscPct = input.discountPercent ?? 0;
  const overallDiscAmt = Math.round(subtotal * overallDiscPct / 100 * 100) / 100;
  const subtotalAfterDisc = Math.round((subtotal - overallDiscAmt) * 100) / 100;
  // Calculate VAT per-line (each line may have a different vatRate)
  const discountRatio = subtotal > 0 ? (subtotal - subtotalAfterDisc) / subtotal : 0;
  const vatAmount = processedLines.reduce((sum, line) => {
    const lineAfterDiscount = round2(line.lineTotal * (1 - discountRatio));
    return sum + round2(lineAfterDiscount * (line.vatRate ?? 0.18));
  }, 0);
  const total     = Math.round((subtotalAfterDisc + vatAmount) * 100) / 100;

  const number = await generateInvoiceNumber(input.tenantId);

  // Find required accounts (must exist from seed)
  const [arAccount, revenueAccount, vatAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '1300' } }), // לקוחות
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '6100' } }), // הכנסות מכירות
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '3200' } }), // מע"מ לתשלום
  ]);

  return prisma.$transaction(async (tx) => {
    // 1. Create the invoice
    const invoice = await tx.invoice.create({
      data: {
        tenantId:       input.tenantId,
        customerId:     input.customerId,
        number,
        date:           input.date,
        dueDate:        input.dueDate,
        notes:          input.notes,
        paymentTerms:   input.paymentTerms,
        reference:      input.reference,
        subtotal,
        discountPercent: overallDiscPct,
        discountAmount:  overallDiscAmt,
        vatAmount,
        total,
        createdBy:      input.createdBy,
        lines: {
          create: processedLines.map(l => ({
            description: l.description, sku: l.sku, barcode: l.barcode,
            unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice,
            discountPercent: l.discountPercent, discountAmount: l.discountAmount,
            vatRate: l.vatRate, lineTotal: l.lineTotal, sortOrder: l.sortOrder,
            notes: l.notes,
          })),
        },
      },
      include: { lines: true, customer: { select: { name: true } } },
    });

    // 2. Auto-create accounting journal entry (if accounts exist)
    if (!arAccount || !revenueAccount || !vatAccount) {
      console.error(`[Invoice] Missing required GL accounts for tenant ${input.tenantId}. AR:${!!arAccount} Revenue:${!!revenueAccount} VAT:${!!vatAccount}. Invoice created WITHOUT accounting entry. Run db:seed to fix.`);
    } else {
      const journalTx = await createTransaction({
        tenantId:    input.tenantId,
        date:        input.date,
        reference:   number,
        description: `חשבונית ${number} - ${customer.name}`,
        sourceType:  'INVOICE',
        sourceId:    invoice.id,
        createdBy:   input.createdBy,
        lines: [
          // Debit: AR (לקוחות חייבים) for full amount
          { debitAccountId: arAccount.id, creditAccountId: revenueAccount.id, amount: subtotal },
          // Debit: AR for VAT portion, Credit: VAT Payable
          { debitAccountId: arAccount.id, creditAccountId: vatAccount.id,     amount: vatAmount },
        ],
      });

      // Link the journal entry
      await tx.invoice.update({
        where: { id: invoice.id },
        data:  { journalTransactionId: journalTx.id },
      });
    }

    // TODO: Include tenant.vatNumber on invoice for Israeli VAT compliance
    // vatNumber is required on all tax invoices per חוק מע"מ ס' 9
    return invoice;
  });
}

// ─── Mark Invoice as Paid ─────────────────────────────────────────

export interface RecordPaymentInput {
  invoiceId: string;
  tenantId:  string;
  amount:    number;
  method:    PaymentMethod;
  date:      Date;
  reference?: string;
  notes?:    string;
  createdBy: string;
}

export async function recordPayment(input: RecordPaymentInput) {
  const invoice = await prisma.invoice.findUnique({
    where:   { id: input.invoiceId },
    include: { customer: true },
  });

  if (!invoice || invoice.tenantId !== input.tenantId) {
    throw new Error('Invoice not found');
  }
  if (invoice.status === 'CANCELLED') {
    throw new Error('Cannot pay a cancelled invoice');
  }

  // Find accounts
  const [bankAccount, arAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '1200' } }), // בנק
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '1300' } }), // לקוחות
  ]);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.invoicePayment.create({
      data: {
        invoiceId: input.invoiceId,
        tenantId:  input.tenantId,
        amount:    input.amount,
        method:    input.method,
        date:      input.date,
        reference: input.reference,
        notes:     input.notes,
        createdBy: input.createdBy,
      },
    });

    // Update invoice status
    const totalPaid = await tx.invoicePayment.aggregate({
      where: { invoiceId: input.invoiceId },
      _sum:  { amount: true },
    });

    const paidAmount = Number(totalPaid._sum.amount ?? 0);
    const newStatus: InvoiceStatus =
      paidAmount >= Number(invoice.total) ? 'PAID' : invoice.status;

    await tx.invoice.update({
      where: { id: input.invoiceId },
      data:  {
        status: newStatus,
        paidAt: newStatus === 'PAID' ? new Date() : undefined,
      },
    });

    // Auto-create accounting entry (Bank Dr, AR Cr)
    if (bankAccount && arAccount) {
      const journalTx = await createTransaction({
        tenantId:    input.tenantId,
        date:        input.date,
        reference:   `PAY-${invoice.number}`,
        description: `תשלום חשבונית ${invoice.number} - ${invoice.customer.name}`,
        sourceType:  'PAYMENT',
        sourceId:    payment.id,
        createdBy:   input.createdBy,
        lines: [
          { debitAccountId: bankAccount.id, creditAccountId: arAccount.id, amount: input.amount },
        ],
      });

      await tx.invoicePayment.update({
        where: { id: payment.id },
        data:  { journalTransactionId: journalTx.id },
      });
    }

    return payment;
  });
}

// ─── Accounts Receivable Aging ────────────────────────────────────

export async function getInvoiceAging(tenantId: string) {
  const today     = new Date();
  const overdue   = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { notIn: ['DRAFT', 'PAID', 'CANCELLED'] },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  });

  const buckets = {
    current:   { label: 'שוטף (לא פג)',   total: 0, invoices: [] as typeof overdue },
    days30:    { label: '1-30 ימים',       total: 0, invoices: [] as typeof overdue },
    days60:    { label: '31-60 ימים',      total: 0, invoices: [] as typeof overdue },
    days90:    { label: '61-90 ימים',      total: 0, invoices: [] as typeof overdue },
    over90:    { label: '90+ ימים',        total: 0, invoices: [] as typeof overdue },
  };

  for (const inv of overdue) {
    const daysPast = Math.floor((today.getTime() - inv.dueDate.getTime()) / 86_400_000);
    const amount   = Number(inv.total);

    if (daysPast <= 0)       { buckets.current.total += amount; buckets.current.invoices.push(inv); }
    else if (daysPast <= 30) { buckets.days30.total  += amount; buckets.days30.invoices.push(inv); }
    else if (daysPast <= 60) { buckets.days60.total  += amount; buckets.days60.invoices.push(inv); }
    else if (daysPast <= 90) { buckets.days90.total  += amount; buckets.days90.invoices.push(inv); }
    else                     { buckets.over90.total  += amount; buckets.over90.invoices.push(inv); }
  }

  const grandTotal = overdue.reduce((s, i) => s + Number(i.total), 0);
  return { buckets, grandTotal, asOf: today };
}

// ─── Mark overdue invoices ────────────────────────────────────────

export async function updateOverdueInvoices(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.invoice.updateMany({
    where: {
      tenantId,
      status:  'SENT',
      dueDate: { lt: today },
    },
    data: { status: 'OVERDUE' },
  });

  return result.count;
}

// ─── Cancel Invoice ───────────────────────────────────────────────

export async function cancelInvoice(
  invoiceId: string,
  tenantId: string,
  userId: string
) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.tenantId !== tenantId) throw new Error('Invoice not found');
  if (invoice.status === 'PAID') throw new Error('Cannot cancel a paid invoice');
  if (invoice.status === 'CANCELLED') throw new Error('Invoice already cancelled');

  // Reverse the accounting journal entry to keep ledger balanced
  // Required by Israeli accounting standards — cannot simply delete, must void
  if ((invoice as any).journalTransactionId) {
    await voidTransaction((invoice as any).journalTransactionId, tenantId, userId);
  }

  return prisma.invoice.update({
    where: { id: invoiceId },
    data:  { status: 'CANCELLED' },
  });
}
