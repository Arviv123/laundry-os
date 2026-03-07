/**
 * Notifications Router
 *
 * Mounted at: /api/notifications
 *
 * All routes require:
 *   - authenticate     — valid JWT
 *   - enforceTenantIsolation — active tenant
 *
 * User identity is taken from req.user (set by the auth middleware).
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { sendWhatsAppMessage, formatIsraeliPhone } from '../whatsapp/whatsapp.service';
import { sendEmail } from '../../services/email.service';
import { generateInvoicePDF } from '../invoices/invoice.pdf.service';

import * as NotificationsService from './notifications.service';

const router = Router();

// Apply auth and tenant guards to every route in this router
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ────────────────────────────────────────────────────────

const CreateNotificationSchema = z.object({
  userId:  z.string().cuid().optional(),
  type:    z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel),
  title:   z.string().min(1).max(255),
  body:    z.string().min(1),
  data:    z.record(z.unknown()).optional(),
});

// ─── GET /api/notifications ────────────────────────────────────────────────────
// Get the authenticated user's notifications (paginated, filterable)
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const { isRead, type, page, limit } = req.query;

    const filters: NotificationsService.GetNotificationsFilters = {};

    if (isRead !== undefined) {
      filters.isRead = isRead === 'true';
    }
    if (type) {
      const parsed = NotificationType[type as keyof typeof NotificationType];
      if (!parsed) { sendError(res, `Invalid notification type: ${type}`); return; }
      filters.type = parsed;
    }
    if (page)  { filters.page  = parseInt(page  as string, 10); }
    if (limit) { filters.limit = parseInt(limit as string, 10); }

    const result = await NotificationsService.getNotifications(tenantId, userId, filters);

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── GET /api/notifications/unread-count ──────────────────────────────────────
// Fast unread badge count — must be registered before /:id routes
router.get(
  '/unread-count',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const count = await NotificationsService.getUnreadCount(tenantId, userId);
    sendSuccess(res, { unreadCount: count });
  })
);

// ─── POST /api/notifications ───────────────────────────────────────────────────
// Create a notification programmatically (MANAGER+ only)
router.post(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateNotificationSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const notification = await NotificationsService.createNotification(
      req.user.tenantId,
      parsed.data as NotificationsService.CreateNotificationInput
    );

    sendSuccess(res, notification, 201);
  })
);

// ─── PUT /api/notifications/read-all ──────────────────────────────────────────
// Mark all notifications as read for the current user
// Must be registered BEFORE /:id/read to avoid route collision
router.put(
  '/read-all',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const updatedCount = await NotificationsService.markAllAsRead(tenantId, userId);
    sendSuccess(res, { updated: updatedCount });
  })
);

// ─── PUT /api/notifications/:id/read ──────────────────────────────────────────
// Mark a single notification as read
router.put(
  '/:id/read',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const notification = await NotificationsService.markAsRead(
      req.params.id,
      tenantId,
      userId
    );

    if (!notification) {
      sendError(res, 'Notification not found', 404);
      return;
    }

    sendSuccess(res, notification);
  })
);

// ─── DELETE /api/notifications/:id ────────────────────────────────────────────
// Delete own notification
router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const deleted = await NotificationsService.deleteNotification(
      req.params.id,
      tenantId,
      userId
    );

    if (!deleted) {
      sendError(res, 'Notification not found', 404);
      return;
    }

    sendSuccess(res, { deleted: true });
  })
);

// ─── POST /api/notifications/run-checks ───────────────────────────────────────
// Trigger all alert checks for this tenant (ADMIN only)
router.post(
  '/run-checks',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await NotificationsService.runAlertChecks(req.user.tenantId);
    sendSuccess(res, result);
  })
);

// ─── POST /api/notifications/test ─────────────────────────────────────────────
// Send a test notification to the authenticated user
router.post(
  '/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const notification = await NotificationsService.sendTestNotification(
      tenantId,
      userId
    );

    sendSuccess(res, notification, 201);
  })
);

// ─── POST /api/notifications/send-document ────────────────────────────────────
// Universal send: routes any document to WhatsApp and/or Email
// The frontend sends the pre-built message text (user can edit it in the modal)
const SendDocumentSchema = z.object({
  documentType:   z.enum(['invoice', 'quote', 'salesOrder', 'payslip', 'receipt', 'bill']),
  documentId:     z.string().min(1),
  channels:       z.array(z.enum(['whatsapp', 'email'])).min(1),
  message:        z.string().min(1),   // The actual text the user wants to send
  recipientPhone: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  subject:        z.string().optional(), // Email subject override
});

router.post(
  '/send-document',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = SendDocumentSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    const { documentType, documentId, channels, message, recipientPhone, recipientEmail, subject } = parsed.data;
    const tenantId = req.user.tenantId;

    // ── Resolve the recipient info from the document ──────────────────────────
    let resolvedPhone: string | null = recipientPhone ?? null;
    let resolvedEmail: string | null = recipientEmail ?? null;
    let documentNumber = '';
    let recipientName  = '';
    let pdfBuffer: Buffer | null = null;

    if (documentType === 'invoice' || documentType === 'receipt') {
      const inv = await prisma.invoice.findFirst({
        where: { id: documentId, tenantId, deletedAt: null },
        include: {
          customer: { select: { name: true, phone: true, email: true } },
          tenant:   { select: { name: true, vatNumber: true, businessNumber: true, address: true, phone: true, email: true } },
          lines:    true,
        },
      });
      if (!inv) { sendError(res, 'Invoice not found', 404); return; }
      documentNumber = inv.number;
      recipientName  = inv.customer?.name ?? '';
      resolvedPhone  = resolvedPhone ?? inv.customer?.phone ?? null;
      resolvedEmail  = resolvedEmail ?? inv.customer?.email ?? null;

      // Generate PDF for email attachment
      if (channels.includes('email') && resolvedEmail) {
        try {
          pdfBuffer = await generateInvoicePDF(
            {
              id: inv.id, number: inv.number, invoiceType: inv.invoiceType,
              date: inv.date, dueDate: inv.dueDate, status: inv.status,
              subtotal: Number(inv.subtotal), vatAmount: Number(inv.vatAmount),
              total: Number(inv.total), discountAmount: inv.discountAmount ? Number(inv.discountAmount) : null,
              notes: inv.notes,
              lines: inv.lines.map(l => ({
                description: l.description, quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice), vatRate: Number(l.vatRate), lineTotal: Number(l.lineTotal),
                productId: l.productId ?? undefined,
              })),
            },
            {
              name: inv.tenant?.name ?? '', vatNumber: inv.tenant?.vatNumber,
              businessNumber: inv.tenant?.businessNumber, address: inv.tenant?.address,
              phone: inv.tenant?.phone, email: inv.tenant?.email,
            },
            { name: recipientName, email: resolvedEmail }
          );
        } catch { /* PDF generation failed — send without attachment */ }
      }

    } else if (documentType === 'quote') {
      const q = await prisma.quote.findFirst({
        where: { id: documentId, tenantId },
        include: { customer: { select: { name: true, phone: true, email: true } } },
      });
      if (!q) { sendError(res, 'Quote not found', 404); return; }
      documentNumber = q.number;
      recipientName  = q.customer?.name ?? '';
      resolvedPhone  = resolvedPhone ?? q.customer?.phone ?? null;
      resolvedEmail  = resolvedEmail ?? q.customer?.email ?? null;

    } else if (documentType === 'salesOrder') {
      const so = await prisma.salesOrder.findFirst({
        where: { id: documentId, tenantId, deletedAt: null },
        include: { customer: { select: { name: true, phone: true, email: true } } },
      });
      if (!so) { sendError(res, 'Sales order not found', 404); return; }
      documentNumber = so.number;
      recipientName  = so.customer?.name ?? '';
      resolvedPhone  = resolvedPhone ?? so.customer?.phone ?? null;
      resolvedEmail  = resolvedEmail ?? so.customer?.email ?? null;

    } else if (documentType === 'payslip') {
      const ps = await (prisma as any).payslip.findFirst({
        where: { id: documentId, tenantId },
        include: { employee: { select: { firstName: true, lastName: true, personalEmail: true, phone: true } } },
      });
      if (!ps) { sendError(res, 'Payslip not found', 404); return; }
      const emp = ps.employee;
      recipientName  = emp ? `${emp.firstName} ${emp.lastName}` : '';
      resolvedPhone  = resolvedPhone ?? emp?.phone ?? null;
      resolvedEmail  = resolvedEmail ?? emp?.personalEmail ?? null;
      documentNumber = ps.period ?? '';

    } else if (documentType === 'bill') {
      const bill = await prisma.bill.findFirst({
        where: { id: documentId, tenantId, deletedAt: null },
        include: { vendor: { select: { name: true, phone: true, email: true } } },
      });
      if (!bill) { sendError(res, 'Bill not found', 404); return; }
      documentNumber = bill.number ?? '';
      recipientName  = bill.vendor?.name ?? '';
      resolvedPhone  = resolvedPhone ?? bill.vendor?.phone ?? null;
      resolvedEmail  = resolvedEmail ?? bill.vendor?.email ?? null;
    }

    // ── Send via requested channels ────────────────────────────────────────────
    const results: Record<string, { ok: boolean; messageId?: string; error?: string }> = {};

    // WhatsApp
    if (channels.includes('whatsapp')) {
      if (!resolvedPhone) {
        results.whatsapp = { ok: false, error: 'אין מספר טלפון לנמען' };
      } else {
        const phone = formatIsraeliPhone(resolvedPhone);
        const wa = await sendWhatsAppMessage({ to: phone, type: 'text', text: message });
        results.whatsapp = wa.messageId
          ? { ok: true, messageId: wa.messageId }
          : { ok: false, error: wa.error };

        // Log to WhatsAppLog table
        try {
          await prisma.whatsAppLog.create({
            data: {
              tenantId,
              phone,
              messageType: 'GENERAL',
              status: wa.messageId ? 'SENT' : 'FAILED',
              messageId: wa.messageId,
              body: message,
              refId: documentId,
              errorMsg: wa.error ?? null,
              sentAt: wa.messageId ? new Date() : null,
            },
          });
        } catch { /* log failure is non-critical */ }
      }
    }

    // Email
    if (channels.includes('email')) {
      if (!resolvedEmail) {
        results.email = { ok: false, error: 'אין כתובת מייל לנמען' };
      } else {
        const emailSubject = subject ?? `מסמך ${documentNumber} מצורף`;
        try {
          if (pdfBuffer) {
            await sendEmail({
              to: resolvedEmail,
              subject: emailSubject,
              html: `<div dir="rtl" style="font-family:Arial,sans-serif">${message.replace(/\n/g, '<br/>')}</div>`,
              attachments: [{
                filename: `${documentType}_${documentNumber}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
              }],
            });
          } else {
            await sendEmail({
              to: resolvedEmail,
              subject: emailSubject,
              html: `<div dir="rtl" style="font-family:Arial,sans-serif">${message.replace(/\n/g, '<br/>')}</div>`,
            });
          }
          results.email = { ok: true };
        } catch (err) {
          results.email = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    sendSuccess(res, { results, documentNumber, recipientName });
  })
);

export default router;
