/**
 * WhatsApp Module Routes
 *
 * Mount at: /api/whatsapp
 *
 * All routes except POST /webhook require JWT authentication.
 * The /webhook endpoint must remain public because Meta's servers
 * call it without any Bearer token.
 *
 * Role requirements:
 *   - send/invoice, send/reminder, send/quote, send/payment-link, logs → ACCOUNTANT+
 *   - send/custom                                                       → MANAGER_LEVEL (ADMIN+)
 *   - bulk-reminders                                                    → ADMIN+
 *   - webhook                                                           → no auth (public)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate }          from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole }         from '../../middleware/rbac';
import { AuthenticatedRequest }   from '../../shared/types';
import { sendSuccess, sendError }  from '../../shared/utils/response';
import { asyncHandler }            from '../../shared/utils/asyncHandler';
import {
  sendInvoiceWhatsApp,
  sendPaymentReminder,
  sendQuoteWhatsApp,
  sendPaymentLinkWhatsApp,
  sendCustomMessage,
  sendBulkReminders,
  getWhatsAppLogs,
  handleWebhook,
} from './whatsapp.service';

const router = Router();

// ---------------------------------------------------------------------------
// POST /webhook  — Meta webhook callback (PUBLIC — no auth)
// Must be declared BEFORE the authenticate middleware is applied to the
// rest of the router, so it is reachable without a JWT.
// ---------------------------------------------------------------------------

router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    // Immediately acknowledge Meta's delivery (200 OK required within 20 s)
    res.sendStatus(200);

    // Process asynchronously — if this fails it is logged internally
    await handleWebhook(req.body);
  })
);

// Meta also does a GET request during webhook verification
router.get('/webhook', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';

  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ---------------------------------------------------------------------------
// Apply authentication + tenant isolation to all routes below this point
// ---------------------------------------------------------------------------

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ---------------------------------------------------------------------------
// POST /send/invoice/:invoiceId  — send invoice notification (ACCOUNTANT+)
// ---------------------------------------------------------------------------

router.post(
  '/send/invoice/:invoiceId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await sendInvoiceWhatsApp(req.user.tenantId, req.params.invoiceId);

    if (!result.success) {
      sendError(res, result.error ?? 'Failed to send WhatsApp message');
      return;
    }

    sendSuccess(res, { success: true, message: 'חשבונית נשלחה ב-WhatsApp' });
  })
);

// ---------------------------------------------------------------------------
// POST /send/reminder/:invoiceId  — send payment reminder (ACCOUNTANT+)
// ---------------------------------------------------------------------------

router.post(
  '/send/reminder/:invoiceId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await sendPaymentReminder(req.user.tenantId, req.params.invoiceId);

    if (!result.success) {
      sendError(res, result.error ?? 'Failed to send payment reminder');
      return;
    }

    sendSuccess(res, { success: true, message: 'תזכורת תשלום נשלחה ב-WhatsApp' });
  })
);

// ---------------------------------------------------------------------------
// POST /send/quote/:quoteId  — send quote notification (ACCOUNTANT+)
// ---------------------------------------------------------------------------

router.post(
  '/send/quote/:quoteId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await sendQuoteWhatsApp(req.user.tenantId, req.params.quoteId);

    if (!result.success) {
      sendError(res, result.error ?? 'Failed to send quote via WhatsApp');
      return;
    }

    sendSuccess(res, { success: true, message: 'הצעת מחיר נשלחה ב-WhatsApp' });
  })
);

// ---------------------------------------------------------------------------
// POST /send/payment-link/:linkId  — send payment link (ACCOUNTANT+)
// ---------------------------------------------------------------------------

router.post(
  '/send/payment-link/:linkId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await sendPaymentLinkWhatsApp(req.user.tenantId, req.params.linkId);

    if (!result.success) {
      sendError(res, result.error ?? 'Failed to send payment link via WhatsApp');
      return;
    }

    sendSuccess(res, { success: true, message: 'קישור תשלום נשלח ב-WhatsApp' });
  })
);

// ---------------------------------------------------------------------------
// POST /send/custom  — send custom message (ADMIN+)
// ---------------------------------------------------------------------------

const CustomMessageSchema = z.object({
  phone:   z.string().min(7),
  message: z.string().min(1).max(4096),
  refId:   z.string().optional(),
});

router.post(
  '/send/custom',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CustomMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const { phone, message, refId } = parsed.data;
    const result = await sendCustomMessage(req.user.tenantId, phone, message, refId);

    if (!result.success) {
      sendError(res, result.error ?? 'Failed to send custom WhatsApp message');
      return;
    }

    sendSuccess(res, { success: true, message: 'הודעה נשלחה ב-WhatsApp' });
  })
);

// ---------------------------------------------------------------------------
// POST /bulk-reminders  — send all overdue reminders (ADMIN+)
// ---------------------------------------------------------------------------

router.post(
  '/bulk-reminders',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await sendBulkReminders(req.user.tenantId);
    sendSuccess(res, stats);
  })
);

// ---------------------------------------------------------------------------
// GET /logs  — WhatsApp log history (ACCOUNTANT+)
// ---------------------------------------------------------------------------

const LogsQuerySchema = z.object({
  status:      z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED']).optional(),
  messageType: z.enum(['INVOICE', 'PAYMENT_REMINDER', 'QUOTE', 'PAYMENT_LINK', 'GENERAL']).optional(),
  phone:       z.string().optional(),
  page:        z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit:       z.string().regex(/^\d+$/).transform(Number).default('25'),
});

router.get(
  '/logs',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = LogsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const { status, messageType, phone, page, limit } = parsed.data;

    const result = await getWhatsAppLogs(req.user.tenantId, {
      status:      status as any,
      messageType: messageType as any,
      phone,
      page,
      limit,
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

export default router;
