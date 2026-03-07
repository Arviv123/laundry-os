/**
 * Email Service — שירות שליחת מיילים
 * Uses Resend API
 */
import { Resend } from 'resend';
import { logger } from '../config/logger';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}) {
  if (!resend) {
    logger.warn('Email service not configured (missing RESEND_API_KEY)', { to: options.to, subject: options.subject });
    return null;
  }

  try {
    const result = await resend.emails.send({
      from: options.from ?? 'LaundryOS <noreply@laundry-os.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    logger.info('Email sent', { to: options.to, subject: options.subject });
    return result;
  } catch (error) {
    logger.error('Failed to send email', { error, to: options.to });
    throw error;
  }
}

export async function sendInvoiceEmail(options: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  total: number;
  pdfBuffer: Buffer;
}) {
  return sendEmail({
    to: options.to,
    subject: `חשבונית ${options.invoiceNumber} — LaundryOS`,
    html: `<div dir="rtl"><p>שלום ${options.customerName},</p><p>מצורפת חשבונית מספר ${options.invoiceNumber} על סך ${options.total.toFixed(2)} ₪.</p><p>תודה,<br/>LaundryOS</p></div>`,
  });
}

export async function sendNotificationEmail(options: {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}) {
  return sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
