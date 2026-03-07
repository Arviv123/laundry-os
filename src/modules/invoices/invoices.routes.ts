import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as InvoiceService from './invoices.service';
import { generateInvoicePDF } from './invoice.pdf.service';
import { sendInvoiceEmail } from '../../services/email.service';
import paymentAllocationRouter from './payment-allocation.routes';
import { requestAllocationNumber, simulateAllocationNumber, requiresAllocationNumber } from './allocation-number.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// Mount payment allocation sub-router at /invoices/allocations
// Routes: POST /, GET /payment/:id, GET /invoice/:id, GET /unallocated, DELETE /:id
router.use('/allocations', paymentAllocationRouter);

const InvoiceLineSchema = z.object({
  description:     z.string().min(1),
  sku:             z.string().optional(),
  barcode:         z.string().optional(),
  unit:            z.string().optional(),
  quantity:        z.number().positive(),
  unitPrice:       z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  vatRate:         z.number().min(0).max(1).default(0.18),
  notes:           z.string().optional(),
});

const CreateInvoiceSchema = z.object({
  customerId:      z.string().cuid(),
  date:            z.string(),
  dueDate:         z.string(),
  notes:           z.string().optional(),
  paymentTerms:    z.string().optional(),
  reference:       z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  lines:           z.array(InvoiceLineSchema).min(1),
});

// POST /invoices
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const invoice = await InvoiceService.createInvoice({
      ...parsed.data,
      date:      new Date(parsed.data.date),
      dueDate:   new Date(parsed.data.dueDate),
      tenantId:  req.user.tenantId,
      createdBy: req.user.userId,
      discountPercent: parsed.data.discountPercent,
    });

    sendSuccess(res, invoice, 201);
  })
);

// GET /invoices
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, customerId, from, to, page = '1', pageSize = '25' } = req.query;

    const where = withTenant(req, {
      ...(status     ? { status:     status as any }     : {}),
      ...(customerId ? { customerId: customerId as string } : {}),
      ...(from || to ? { date: { gte: from ? new Date(from as string) : undefined, lte: to ? new Date(to as string) : undefined } } : {}),
    });

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          _count: { select: { lines: true, payments: true } },
        },
        orderBy: { date: 'desc' },
        skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take:    parseInt(pageSize as string),
      }),
      prisma.invoice.count({ where }),
    ]);

    sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
  })
);

// GET /invoices/aging
router.get(
  '/aging',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const aging = await InvoiceService.getInvoiceAging(req.user.tenantId);
    sendSuccess(res, aging);
  })
);

// GET /invoices/:id
router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await prisma.invoice.findUnique({
      where:   { id: req.params.id },
      include: {
        customer: true,
        lines:    { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { date: 'desc' } },
      },
    });

    if (!invoice || invoice.tenantId !== req.user.tenantId) {
      sendError(res, 'Invoice not found', 404);
      return;
    }
    sendSuccess(res, invoice);
  })
);

// POST /invoices/:id/send
router.post(
  '/:id/send',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice || invoice.tenantId !== req.user.tenantId) { sendError(res, 'Invoice not found', 404); return; }
    if (invoice.status !== 'DRAFT') { sendError(res, 'Only DRAFT invoices can be sent'); return; }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data:  { status: 'SENT', sentAt: new Date() },
    });
    sendSuccess(res, updated);
  })
);

// POST /invoices/:id/pay
router.post(
  '/:id/pay',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      amount:    z.number().positive(),
      method:    z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'OTHER']),
      date:      z.string().datetime(),
      reference: z.string().optional(),
      notes:     z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const payment = await InvoiceService.recordPayment({
      invoiceId: req.params.id,
      tenantId:  req.user.tenantId,
      ...parsed.data,
      date:      new Date(parsed.data.date),
      method:    parsed.data.method as any,
      createdBy: req.user.userId,
    });

    sendSuccess(res, payment, 201);
  })
);

// POST /invoices/:id/cancel
router.post(
  '/:id/cancel',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await InvoiceService.cancelInvoice(
      req.params.id,
      req.user.tenantId,
      req.user.userId
    );
    sendSuccess(res, invoice);
  })
);

// POST /invoices/update-overdue  (cron-like trigger)
router.post(
  '/update-overdue',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await InvoiceService.updateOverdueInvoices(req.user.tenantId);
    sendSuccess(res, { updated: count, message: `${count} invoices marked as overdue` });
  })
);

// GET /invoices/:id/pdf
router.get(
  '/:id/pdf',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id:        req.params.id,
        tenantId:  req.user.tenantId,
        deletedAt: null,
      },
      include: {
        lines:    { orderBy: { sortOrder: 'asc' } },
        customer: true,
        tenant:   true,
      },
    });

    if (!invoice) {
      sendError(res, 'Invoice not found', 404);
      return;
    }

    const pdfBuffer = await generateInvoicePDF(
      {
        id:             invoice.id,
        number:         invoice.number,
        invoiceType:    invoice.invoiceType,
        date:           invoice.date,
        dueDate:        invoice.dueDate,
        status:         invoice.status,
        subtotal:       Number(invoice.subtotal),
        vatAmount:      Number(invoice.vatAmount),
        total:          Number(invoice.total),
        discountAmount: invoice.discountAmount ? Number(invoice.discountAmount) : null,
        notes:          invoice.notes,
        lines: invoice.lines.map(l => ({
          description: l.description,
          quantity:    Number(l.quantity),
          unitPrice:   Number(l.unitPrice),
          vatRate:     Number(l.vatRate),
          lineTotal:   Number(l.lineTotal),
          productId:   l.productId ?? undefined,
        })),
      },
      {
        name:           invoice.tenant.name,
        vatNumber:      invoice.tenant.vatNumber,
        businessNumber: invoice.tenant.businessNumber,
        address:        invoice.tenant.address,
        phone:          invoice.tenant.phone,
        email:          invoice.tenant.email,
      },
      {
        name:       invoice.customer.name,
        email:      invoice.customer.email,
        phone:      invoice.customer.phone,
        businessId: invoice.customer.businessId,
        address:    invoice.customer.address,
      }
    );

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="invoice-${invoice.number}.pdf"`);
    res.send(pdfBuffer);
  })
);

// POST /invoices/:id/send-email
router.post(
  '/:id/send-email',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id:        req.params.id,
        tenantId:  req.user.tenantId,
        deletedAt: null,
      },
      include: {
        lines:    { orderBy: { sortOrder: 'asc' } },
        customer: true,
        tenant:   true,
      },
    });

    if (!invoice) {
      sendError(res, 'Invoice not found', 404);
      return;
    }

    if (!invoice.customer?.email) {
      sendError(res, 'אין כתובת דוא"ל ללקוח', 400);
      return;
    }

    const pdfBuffer = await generateInvoicePDF(
      {
        id:             invoice.id,
        number:         invoice.number,
        invoiceType:    invoice.invoiceType,
        date:           invoice.date,
        dueDate:        invoice.dueDate,
        status:         invoice.status,
        subtotal:       Number(invoice.subtotal),
        vatAmount:      Number(invoice.vatAmount),
        total:          Number(invoice.total),
        discountAmount: invoice.discountAmount ? Number(invoice.discountAmount) : null,
        notes:          invoice.notes,
        lines: invoice.lines.map(l => ({
          description: l.description,
          quantity:    Number(l.quantity),
          unitPrice:   Number(l.unitPrice),
          vatRate:     Number(l.vatRate),
          lineTotal:   Number(l.lineTotal),
          productId:   l.productId ?? undefined,
        })),
      },
      {
        name:           invoice.tenant.name,
        vatNumber:      invoice.tenant.vatNumber,
        businessNumber: invoice.tenant.businessNumber,
        address:        invoice.tenant.address,
        phone:          invoice.tenant.phone,
        email:          invoice.tenant.email,
      },
      {
        name:       invoice.customer.name,
        email:      invoice.customer.email,
        phone:      invoice.customer.phone,
        businessId: invoice.customer.businessId,
        address:    invoice.customer.address,
      }
    );

    await sendInvoiceEmail({
      to:            invoice.customer.email,
      customerName:  invoice.customer.name,
      invoiceNumber: invoice.number,
      total:         Number(invoice.total),
      pdfBuffer,
    });

    if (invoice.status === 'DRAFT') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data:  { status: 'SENT', sentAt: new Date() },
      });
    }

    sendSuccess(res, { success: true, message: 'חשבונית נשלחה בדוא"ל' });
  })
);

// ─── POST /:id/allocation-number — בקשת מספר הקצאה מרשות המיסים ──────────────
router.post(
  '/:id/allocation-number',
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const invoiceId = req.params.id;
    const simulate  = req.query.simulate === 'true';  // for demo/testing

    if (simulate) {
      const fakeNum = await simulateAllocationNumber(invoiceId, tenantId);
      return sendSuccess(res, { allocationNumber: fakeNum, status: 'APPROVED', simulated: true });
    }

    const result = await requestAllocationNumber(invoiceId, tenantId);
    return sendSuccess(res, result);
  })
);

// ─── GET /:id/allocation-number — status of allocation number ─────────────────
router.get(
  '/:id/allocation-number',
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const invoice = await prisma.invoice.findFirst({
      where: { tenantId, id: req.params.id },
      select: { total: true, allocationNumber: true, allocationStatus: true, allocationRequestedAt: true },
    });
    if (!invoice) return sendError(res, 'חשבונית לא נמצאה', 404);
    return sendSuccess(res, {
      allocationNumber:      invoice.allocationNumber,
      allocationStatus:      invoice.allocationStatus,
      allocationRequestedAt: invoice.allocationRequestedAt,
      requiresAllocation:    requiresAllocationNumber(Number(invoice.total)),
    });
  })
);

export default router;
