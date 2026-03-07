/**
 * WhatsApp Business API Service
 *
 * Wraps the Meta WhatsApp Cloud API for the ERP backend.
 *
 * Behaviour when WHATSAPP_TOKEN is not set:
 *   - A warning is logged once at startup.
 *   - Every send call returns { messageId: null, error: 'WhatsApp not configured' }.
 *   - No errors are thrown — the caller decides how to handle degraded mode.
 *
 * All public functions never throw; they return a result object or boolean.
 * WhatsAppLog records are created for every attempted send.
 */

import { WhatsAppMessageType, WhatsAppStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WHATSAPP_TOKEN       = process.env.WHATSAPP_TOKEN       ?? '';
const WHATSAPP_PHONE_ID    = process.env.WHATSAPP_PHONE_ID    ?? '';
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v18.0';

if (!WHATSAPP_TOKEN) {
  logger.warn('WHATSAPP_TOKEN not set — WhatsApp sending disabled');
}

const API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template';
  text?: string;
  template?: {
    name: string;
    language: string;
    components?: any[];
  };
}

export interface SendResult {
  messageId: string | null;
  error?: string;
}

export interface BulkReminderResult {
  sent: number;
  failed: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// formatIsraeliPhone
// ---------------------------------------------------------------------------

/**
 * Converts an Israeli phone number to international E.164 format without '+'.
 * Examples:
 *   "050-123-4567"  → "972501234567"
 *   "0501234567"    → "972501234567"
 *   "+972501234567" → "972501234567"
 *   "972501234567"  → "972501234567"
 */
export function formatIsraeliPhone(phone: string): string {
  // Strip spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, '');

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Already has country code
  if (cleaned.startsWith('972')) {
    return cleaned;
  }

  // Local format: starts with 0
  if (cleaned.startsWith('0')) {
    return '972' + cleaned.slice(1);
  }

  // Assume Israeli mobile without leading 0 (e.g., "501234567")
  return '972' + cleaned;
}

// ---------------------------------------------------------------------------
// sendWhatsAppMessage — core send function
// ---------------------------------------------------------------------------

export async function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<SendResult> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return { messageId: null, error: 'WhatsApp not configured' };
  }

  // Build the request body
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: msg.to,
    type: msg.type,
  };

  if (msg.type === 'text' && msg.text) {
    body.text = { body: msg.text };
  }

  if (msg.type === 'template' && msg.template) {
    body.template = {
      name: msg.template.name,
      language: { code: msg.template.language },
      ...(msg.template.components ? { components: msg.template.components } : {}),
    };
  }

  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.json() as any;

    if (!response.ok) {
      const errMsg = responseBody?.error?.message ?? `HTTP ${response.status}`;
      logger.error('sendWhatsAppMessage: API error', {
        to: msg.to,
        status: response.status,
        error: errMsg,
      });
      return { messageId: null, error: errMsg };
    }

    const messageId: string = responseBody?.messages?.[0]?.id ?? null;
    logger.info('sendWhatsAppMessage: sent', { to: msg.to, messageId });
    return { messageId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendWhatsAppMessage: network error', { to: msg.to, error: errMsg });
    return { messageId: null, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Internal helper — create WhatsAppLog
// ---------------------------------------------------------------------------

async function createLog(opts: {
  tenantId:    string;
  phone:       string;
  messageType: WhatsAppMessageType;
  status:      WhatsAppStatus;
  messageId?:  string | null;
  body?:       string;
  refId?:      string;
  errorMsg?:   string;
}): Promise<void> {
  try {
    await prisma.whatsAppLog.create({
      data: {
        tenantId:    opts.tenantId,
        phone:       opts.phone,
        messageType: opts.messageType,
        status:      opts.status,
        messageId:   opts.messageId ?? null,
        body:        opts.body     ?? null,
        refId:       opts.refId    ?? null,
        errorMsg:    opts.errorMsg ?? null,
        sentAt:      opts.status === 'SENT' ? new Date() : null,
      },
    });
  } catch (err) {
    logger.error('createLog: failed to persist WhatsAppLog', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Helper — format currency
// ---------------------------------------------------------------------------

function formatILS(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  });
}

// ---------------------------------------------------------------------------
// sendInvoiceWhatsApp
// ---------------------------------------------------------------------------

export async function sendInvoiceWhatsApp(
  tenantId:  string,
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where:   { id: invoiceId },
      include: {
        customer: true,
        lines:    true,
        tenant:   { select: { name: true } },
      },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      return { success: false, error: 'Invoice not found' };
    }

    if (!invoice.customer?.phone) {
      return { success: false, error: 'לא קיים מספר טלפון ללקוח' };
    }

    const phone       = formatIsraeliPhone(invoice.customer.phone);
    const total       = formatILS(Number(invoice.total));
    const dueDate     = invoice.dueDate ? formatDate(invoice.dueDate) : 'לא צוין';
    const companyName = invoice.tenant?.name ?? '';

    // Fetch payment link if one exists for this invoice
    let paymentUrl = '';
    const paymentLink = await prisma.paymentLink.findFirst({
      where:   { invoiceId, tenantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (paymentLink) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.example.com';
      paymentUrl = `\nלתשלום ופרטים: ${frontendUrl}/pay/${paymentLink.token}`;
    }

    const messageText =
      `שלום ${invoice.customer.name},\n` +
      `חשבונית מספר ${invoice.number} על סך ₪${total} נשלחה לך.\n` +
      `תאריך פרעון: ${dueDate}` +
      paymentUrl +
      `\n${companyName}`;

    const result = await sendWhatsAppMessage({
      to:   phone,
      type: 'text',
      text: messageText,
    });

    const status: WhatsAppStatus = result.messageId ? 'SENT' : 'FAILED';

    await createLog({
      tenantId,
      phone,
      messageType: 'INVOICE',
      status,
      messageId:   result.messageId,
      body:        messageText,
      refId:       invoiceId,
      errorMsg:    result.error,
    });

    return result.messageId
      ? { success: true }
      : { success: false, error: result.error };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendInvoiceWhatsApp: unexpected error', { invoiceId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// sendPaymentReminder
// ---------------------------------------------------------------------------

export async function sendPaymentReminder(
  tenantId:  string,
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where:   { id: invoiceId },
      include: { customer: true },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      return { success: false, error: 'Invoice not found' };
    }

    if (invoice.status !== 'OVERDUE') {
      return { success: false, error: `חשבונית אינה OVERDUE (סטטוס: ${invoice.status})` };
    }

    if (!invoice.customer?.phone) {
      return { success: false, error: 'לא קיים מספר טלפון ללקוח' };
    }

    const phone = formatIsraeliPhone(invoice.customer.phone);
    const total = formatILS(Number(invoice.total));

    const messageText =
      `תזכורת: חשבונית ${invoice.number} על סך ₪${total} פגה. נא לשלם בהקדם.`;

    const result = await sendWhatsAppMessage({
      to:   phone,
      type: 'text',
      text: messageText,
    });

    const status: WhatsAppStatus = result.messageId ? 'SENT' : 'FAILED';

    await createLog({
      tenantId,
      phone,
      messageType: 'PAYMENT_REMINDER',
      status,
      messageId:   result.messageId,
      body:        messageText,
      refId:       invoiceId,
      errorMsg:    result.error,
    });

    return result.messageId
      ? { success: true }
      : { success: false, error: result.error };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendPaymentReminder: unexpected error', { invoiceId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// sendQuoteWhatsApp
// ---------------------------------------------------------------------------

export async function sendQuoteWhatsApp(
  tenantId: string,
  quoteId:  string
): Promise<{ success: boolean; error?: string }> {
  try {
    const quote = await prisma.quote.findUnique({
      where:   { id: quoteId },
      include: { customer: true },
    });

    if (!quote || quote.tenantId !== tenantId) {
      return { success: false, error: 'Quote not found' };
    }

    if (!quote.customer?.phone) {
      return { success: false, error: 'לא קיים מספר טלפון ללקוח' };
    }

    const phone      = formatIsraeliPhone(quote.customer.phone);
    const total      = formatILS(Number(quote.total));
    const expiryDate = formatDate(quote.expiryDate);

    const messageText =
      `שלום ${quote.customer.name}, ` +
      `הצעת מחיר מספר ${quote.number} על סך ₪${total} בתוקף עד ${expiryDate}.`;

    const result = await sendWhatsAppMessage({
      to:   phone,
      type: 'text',
      text: messageText,
    });

    const status: WhatsAppStatus = result.messageId ? 'SENT' : 'FAILED';

    await createLog({
      tenantId,
      phone,
      messageType: 'QUOTE',
      status,
      messageId:   result.messageId,
      body:        messageText,
      refId:       quoteId,
      errorMsg:    result.error,
    });

    return result.messageId
      ? { success: true }
      : { success: false, error: result.error };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendQuoteWhatsApp: unexpected error', { quoteId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// sendPaymentLinkWhatsApp
// ---------------------------------------------------------------------------

export async function sendPaymentLinkWhatsApp(
  tenantId:      string,
  paymentLinkId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const paymentLink = await prisma.paymentLink.findUnique({
      where:   { id: paymentLinkId },
      include: {
        invoice: {
          include: { customer: true },
        },
      },
    });

    if (!paymentLink || paymentLink.tenantId !== tenantId) {
      return { success: false, error: 'Payment link not found' };
    }

    const customer = paymentLink.invoice?.customer;
    if (!customer?.phone) {
      return { success: false, error: 'לא קיים מספר טלפון ללקוח' };
    }

    const phone       = formatIsraeliPhone(customer.phone);
    const amount      = formatILS(Number(paymentLink.amount));
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.example.com';
    const publicUrl   = `${frontendUrl}/pay/${paymentLink.token}`;

    const messageText =
      `שלום ${customer.name},\n` +
      `קישור לתשלום על סך ₪${amount}: ${publicUrl}`;

    const result = await sendWhatsAppMessage({
      to:   phone,
      type: 'text',
      text: messageText,
    });

    const status: WhatsAppStatus = result.messageId ? 'SENT' : 'FAILED';

    await createLog({
      tenantId,
      phone,
      messageType: 'PAYMENT_LINK',
      status,
      messageId:   result.messageId,
      body:        messageText,
      refId:       paymentLinkId,
      errorMsg:    result.error,
    });

    return result.messageId
      ? { success: true }
      : { success: false, error: result.error };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendPaymentLinkWhatsApp: unexpected error', { paymentLinkId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// sendCustomMessage
// ---------------------------------------------------------------------------

export async function sendCustomMessage(
  tenantId: string,
  phone:    string,
  message:  string,
  refId?:   string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formattedPhone = formatIsraeliPhone(phone);

    const result = await sendWhatsAppMessage({
      to:   formattedPhone,
      type: 'text',
      text: message,
    });

    const status: WhatsAppStatus = result.messageId ? 'SENT' : 'FAILED';

    await createLog({
      tenantId,
      phone:       formattedPhone,
      messageType: 'GENERAL',
      status,
      messageId:   result.messageId,
      body:        message,
      refId,
      errorMsg:    result.error,
    });

    return result.messageId
      ? { success: true }
      : { success: false, error: result.error };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendCustomMessage: unexpected error', { phone, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// getWhatsAppLogs
// ---------------------------------------------------------------------------

export interface WhatsAppLogFilters {
  status?:      WhatsAppStatus;
  messageType?: WhatsAppMessageType;
  phone?:       string;
  page?:        number;
  limit?:       number;
}

export async function getWhatsAppLogs(
  tenantId: string,
  filters:  WhatsAppLogFilters = {}
) {
  const { status, messageType, phone, page = 1, limit = 25 } = filters;

  const where: Record<string, unknown> = { tenantId };
  if (status)      where.status      = status;
  if (messageType) where.messageType = messageType;
  if (phone)       where.phone       = { contains: phone };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.whatsAppLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.whatsAppLog.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ---------------------------------------------------------------------------
// sendBulkReminders
// ---------------------------------------------------------------------------

export async function sendBulkReminders(tenantId: string): Promise<BulkReminderResult> {
  const result: BulkReminderResult = { sent: 0, failed: 0, errors: [] };

  try {
    // Fetch all OVERDUE invoices that have a customer with a phone number
    const overdueInvoices = await prisma.invoice.findMany({
      where:   { tenantId, status: 'OVERDUE' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });

    // For each invoice, check whether a reminder was already sent in the last 24 h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const invoice of overdueInvoices) {
      if (!invoice.customer?.phone) {
        result.failed++;
        result.errors.push(`Invoice ${invoice.number}: לא קיים מספר טלפון ללקוח`);
        continue;
      }

      // Check for a recent reminder log
      const recentLog = await prisma.whatsAppLog.findFirst({
        where: {
          tenantId,
          refId:       invoice.id,
          messageType: 'PAYMENT_REMINDER',
          status:      { in: ['SENT', 'DELIVERED', 'READ'] },
          sentAt:      { gte: twentyFourHoursAgo },
        },
      });

      if (recentLog) {
        // Skip — already reminded in last 24 h
        continue;
      }

      const sendResult = await sendPaymentReminder(tenantId, invoice.id);
      if (sendResult.success) {
        result.sent++;
      } else {
        result.failed++;
        result.errors.push(`Invoice ${invoice.number}: ${sendResult.error ?? 'Unknown error'}`);
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('sendBulkReminders: unexpected error', { tenantId, error: errMsg });
    result.errors.push(errMsg);
  }

  return result;
}

// ---------------------------------------------------------------------------
// handleWebhook
// ---------------------------------------------------------------------------

/**
 * Processes Meta webhook callbacks for message status updates.
 * Updates WhatsAppLog rows to DELIVERED or READ based on the incoming
 * status event from Meta's servers.
 *
 * Expected body shape from Meta:
 * {
 *   entry: [{
 *     changes: [{
 *       value: {
 *         statuses: [{ id: "wamid...", status: "delivered"|"read", ... }]
 *       }
 *     }]
 *   }]
 * }
 */
export async function handleWebhook(body: any): Promise<void> {
  try {
    const statusEvent = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    if (!statusEvent) {
      // Verify token handshake or other payload shape — nothing to update
      return;
    }

    const wamid: string | undefined   = statusEvent.id;
    const rawStatus: string | undefined = statusEvent.status;

    if (!wamid || !rawStatus) {
      return;
    }

    // Map Meta status strings to our enum
    const statusMap: Record<string, WhatsAppStatus> = {
      delivered: 'DELIVERED',
      read:      'READ',
      sent:      'SENT',
      failed:    'FAILED',
    };

    const newStatus = statusMap[rawStatus.toLowerCase()];
    if (!newStatus) {
      return;
    }

    // Find the log by WhatsApp message ID
    const log = await prisma.whatsAppLog.findFirst({
      where: { messageId: wamid },
    });

    if (!log) {
      logger.warn('handleWebhook: no WhatsAppLog found for messageId', { wamid });
      return;
    }

    await prisma.whatsAppLog.update({
      where: { id: log.id },
      data:  {
        status:      newStatus,
        deliveredAt: newStatus === 'DELIVERED' || newStatus === 'READ' ? new Date() : undefined,
      },
    });

    logger.info('handleWebhook: status updated', { wamid, newStatus });
  } catch (err) {
    logger.error('handleWebhook: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Never throw from webhook handler
  }
}
