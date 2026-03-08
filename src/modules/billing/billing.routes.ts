/**
 * Institutional Billing Routes — חיוב מוסדי (חשבוניות מרוכזות)
 *
 * Enables hotels, hospitals, and businesses to accumulate orders on a "tab"
 * and receive consolidated monthly invoices.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { createInvoice } from '../invoices/invoices.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Schemas ─────────────────────────────────────────────────────

const InstitutionalSchema = z.object({
  isInstitutional: z.boolean(),
  billingCycle:    z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  creditLimit:     z.number().min(0).nullable().optional(),
  paymentTerms:    z.number().int().min(0).optional(),
});

const ConsolidatedInvoiceSchema = z.object({
  customerId: z.string().min(1),
  orderIds:   z.array(z.string().min(1)).min(1),
  notes:      z.string().optional(),
});

// ─── GET /billing/unbilled/:customerId ───────────────────────────
// Get all laundry orders for a customer that haven't been billed yet

router.get(
  '/unbilled/:customerId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { customerId } = req.params;
    const tenantId = req.user.tenantId;

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      sendError(res, 'לקוח לא נמצא', 404);
      return;
    }

    const unbilledOrders = await prisma.laundryOrder.findMany({
      where: {
        tenantId,
        customerId,
        invoiceId: null,
        status: { not: 'CANCELLED' },
      },
      include: {
        items: { include: { service: true } },
        deliveryStops: true,
      },
      orderBy: { receivedAt: 'asc' },
    });

    const unbilledTotal = unbilledOrders.reduce(
      (sum, o) => sum + Number(o.total),
      0,
    );

    sendSuccess(res, {
      customer: {
        id: customer.id,
        name: customer.name,
        isInstitutional: customer.isInstitutional,
        billingCycle: customer.billingCycle,
        creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
        paymentTerms: customer.paymentTerms,
      },
      orders: unbilledOrders,
      unbilledTotal,
      orderCount: unbilledOrders.length,
    });
  }),
);

// ─── POST /billing/consolidated-invoice ──────────────────────────
// Create a consolidated invoice from multiple orders

router.post(
  '/consolidated-invoice',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = ConsolidatedInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const { customerId, orderIds, notes } = parsed.data;
    const tenantId = req.user.tenantId;

    // Verify customer belongs to tenant and is institutional
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      sendError(res, 'לקוח לא נמצא', 404);
      return;
    }

    // Fetch the specified orders — must all belong to this customer + tenant and be unbilled
    const orders = await prisma.laundryOrder.findMany({
      where: {
        id: { in: orderIds },
        tenantId,
        customerId,
        invoiceId: null,
        status: { not: 'CANCELLED' },
      },
      include: { items: { include: { service: true } } },
    });

    if (orders.length === 0) {
      sendError(res, 'לא נמצאו הזמנות לחיוב', 400);
      return;
    }

    if (orders.length !== orderIds.length) {
      const foundIds = new Set(orders.map(o => o.id));
      const missing = orderIds.filter(id => !foundIds.has(id));
      sendError(
        res,
        `${missing.length} הזמנות לא נמצאו או כבר חויבו: ${missing.join(', ')}`,
        400,
      );
      return;
    }

    // Build invoice lines from all order items
    const invoiceLines = orders.flatMap(order =>
      order.items.map(item => ({
        description: `${item.description} (הזמנה ${order.orderNumber})`,
        quantity:    item.quantity,
        unitPrice:   Number(item.unitPrice),
        vatRate:     0.18,
      })),
    );

    // Add delivery fees as separate lines if applicable
    for (const order of orders) {
      const fee = Number(order.deliveryFee);
      if (fee > 0) {
        invoiceLines.push({
          description: `דמי משלוח (הזמנה ${order.orderNumber})`,
          quantity:    1,
          unitPrice:   fee,
          vatRate:     0.18,
        });
      }
    }

    // Calculate due date based on customer's payment terms
    const paymentTermsDays = customer.paymentTerms ?? customer.paymentTermsDays ?? 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);

    // Build a reference string listing all order numbers
    const orderNumbers = orders.map(o => o.orderNumber).join(', ');

    // Create the consolidated invoice via the existing invoice service
    const invoice = await createInvoice({
      tenantId,
      customerId,
      date: new Date(),
      dueDate,
      notes: notes
        ? `${notes}\n\nהזמנות: ${orderNumbers}`
        : `חשבונית מרוכזת — הזמנות: ${orderNumbers}`,
      paymentTerms: `נטו ${paymentTermsDays} יום`,
      reference: orderNumbers,
      createdBy: req.user.userId,
      lines: invoiceLines,
    });

    // Link each order to the new invoice
    await prisma.laundryOrder.updateMany({
      where: { id: { in: orderIds } },
      data: { invoiceId: invoice.id },
    });

    sendSuccess(res, invoice, 201);
  }),
);

// ─── PATCH /billing/customers/:id/institutional ──────────────────
// Toggle institutional status and set billing parameters

router.patch(
  '/customers/:id/institutional',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = InstitutionalSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const existing = await prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      sendError(res, 'לקוח לא נמצא', 404);
      return;
    }

    const updateData: Record<string, any> = {
      isInstitutional: parsed.data.isInstitutional,
    };

    if (parsed.data.isInstitutional) {
      // Set billing parameters when enabling institutional
      if (parsed.data.billingCycle !== undefined) updateData.billingCycle = parsed.data.billingCycle;
      if (parsed.data.creditLimit !== undefined)  updateData.creditLimit = parsed.data.creditLimit;
      if (parsed.data.paymentTerms !== undefined) updateData.paymentTerms = parsed.data.paymentTerms;
    } else {
      // Clear billing parameters when disabling
      updateData.billingCycle = null;
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    sendSuccess(res, updated);
  }),
);

// ─── GET /billing/institutional-customers ────────────────────────
// List all institutional customers with their unbilled totals

router.get(
  '/institutional-customers',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;

    const customers = await prisma.customer.findMany({
      where: { tenantId, isInstitutional: true },
      orderBy: { name: 'asc' },
    });

    // For each institutional customer, calculate unbilled total
    const results = await Promise.all(
      customers.map(async (c) => {
        const unbilledOrders = await prisma.laundryOrder.findMany({
          where: {
            tenantId,
            customerId: c.id,
            invoiceId: null,
            status: { not: 'CANCELLED' },
          },
          select: { total: true },
        });

        const unbilledTotal = unbilledOrders.reduce(
          (sum, o) => sum + Number(o.total),
          0,
        );

        return {
          ...c,
          creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
          unbilledTotal,
          unbilledOrderCount: unbilledOrders.length,
        };
      }),
    );

    sendSuccess(res, results);
  }),
);

export default router;
