/**
 * Notifications Service
 *
 * Handles creation, retrieval, deduplication, and business-alert generation
 * for the ERP notification system.
 *
 * Supported alert checks (run per-tenant):
 *   - INVOICE_OVERDUE       — invoices whose status is OVERDUE
 *   - INVOICE_DUE_SOON      — invoices due within 3 days (status=SENT)
 *   - LOW_STOCK             — stock levels below reorderPoint
 *   - TRAINING_EXPIRING     — employee training certificates expiring within 30 days
 *
 * Deduplication: each alert type checks whether an identical notification
 * (same type + same refId in the `data` JSON field) was already created in
 * the last 24 hours before inserting a new one.
 */

import { Prisma, NotificationChannel, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { sendEmail } from '../../services/email.service';
import { logger } from '../../config/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId?:  string;
  type:     NotificationType;
  channel:  NotificationChannel;
  title:    string;
  body:     string;
  data?:    Record<string, unknown>;
}

export interface GetNotificationsFilters {
  isRead?: boolean;
  type?:   NotificationType;
  page?:   number;
  limit?:  number;
}

export interface RunAlertChecksResult {
  overdueInvoices:    number;
  dueSoonInvoices:    number;
  lowStockProducts:   number;
  expiringTrainings:  number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ISO date string formatted for Hebrew display — e.g. 05/03/2026 */
function formatDate(d: Date): string {
  return d.toLocaleDateString('he-IL', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  });
}

/**
 * Check whether a notification with the given type + refId already exists for
 * this tenant within the last 24 hours (deduplication guard).
 */
async function isDuplicate(
  tenantId: string,
  type:     NotificationType,
  refId:    string
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);

  const existing = await prisma.notification.findFirst({
    where: {
      tenantId,
      type,
      data:      { path: ['refId'], equals: refId },
      createdAt: { gte: since },
    },
  });

  return existing !== null;
}

/**
 * Get all ADMIN and MANAGER-level user IDs for a tenant.
 * We use these as the recipients of automated alert notifications.
 */
async function getAdminAndManagerUserIds(tenantId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role:     { in: ['ADMIN', 'SUPER_ADMIN'] },
    },
    select: { id: true },
  });
  return users.map(u => u.id);
}

/**
 * Internal helper: create a single Notification record and optionally dispatch
 * an email if channel is EMAIL or BOTH.
 */
async function insertNotification(
  tenantId: string,
  input:    CreateNotificationInput
): Promise<void> {
  const { userId, type, channel, title, body, data } = input;

  const notification = await prisma.notification.create({
    data: {
      tenantId,
      userId,
      type,
      channel,
      title,
      body,
      data:   data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
      sentAt: channel !== 'IN_APP' ? new Date() : null,
    },
  });

  // Send email when channel requires it
  if (channel === 'EMAIL' || channel === 'BOTH') {
    // Resolve recipient email address
    let toEmail: string | null = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true },
      });
      toEmail = user?.email ?? null;
    }

    if (toEmail) {
      await sendEmail({
        to:      toEmail,
        subject: title,
        html:    `<div dir="rtl" style="font-family:Arial,sans-serif">`
               + `<h2>${title}</h2><p>${body}</p>`
               + `<hr/><small>מערכת חשבשבת ERP — הודעה אוטומטית</small></div>`,
      });
    } else {
      logger.warn('notifications.service: email requested but no recipient email found', {
        notificationId: notification.id,
        userId,
      });
    }
  }
}

// ─── Public Service Functions ─────────────────────────────────────────────────

/**
 * Create a notification record. If channel = EMAIL | BOTH, also sends email.
 */
export async function createNotification(
  tenantId: string,
  input:    CreateNotificationInput
) {
  const { userId, type, channel, title, body, data } = input;

  const notification = await prisma.notification.create({
    data: {
      tenantId,
      userId,
      type,
      channel,
      title,
      body,
      data:   data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
      sentAt: channel !== 'IN_APP' ? new Date() : null,
    },
  });

  // Fire email if needed
  if (channel === 'EMAIL' || channel === 'BOTH') {
    let toEmail: string | null = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true },
      });
      toEmail = user?.email ?? null;
    }

    if (toEmail) {
      await sendEmail({
        to:      toEmail,
        subject: title,
        html:    `<div dir="rtl" style="font-family:Arial,sans-serif">`
               + `<h2>${title}</h2><p>${body}</p>`
               + `<hr/><small>מערכת חשבשבת ERP — הודעה אוטומטית</small></div>`,
      });
    }
  }

  return notification;
}

/**
 * Return a paginated, most-recent-first list of notifications for a user.
 */
export async function getNotifications(
  tenantId: string,
  userId:   string,
  filters:  GetNotificationsFilters = {}
) {
  const { isRead, type, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationWhereInput = {
    tenantId,
    userId,
    ...(isRead !== undefined ? { isRead } : {}),
    ...(type                 ? { type }   : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, total, page, limit };
}

/**
 * Mark a single notification as read. Verifies ownership (tenantId + userId).
 */
export async function markAsRead(
  id:       string,
  tenantId: string,
  userId:   string
) {
  const notification = await prisma.notification.findFirst({
    where: { id, tenantId, userId },
  });

  if (!notification) return null;

  return prisma.notification.update({
    where: { id },
    data:  { isRead: true },
  });
}

/**
 * Mark all notifications as read for the given user in this tenant.
 */
export async function markAllAsRead(tenantId: string, userId: string) {
  const result = await prisma.notification.updateMany({
    where:  { tenantId, userId, isRead: false },
    data:   { isRead: true },
  });
  return result.count;
}

/**
 * Fast unread count query for badge display.
 */
export async function getUnreadCount(
  tenantId: string,
  userId:   string
): Promise<number> {
  return prisma.notification.count({
    where: { tenantId, userId, isRead: false },
  });
}

/**
 * Delete a notification. Verifies ownership (tenantId + userId).
 */
export async function deleteNotification(
  id:       string,
  tenantId: string,
  userId:   string
): Promise<boolean> {
  const notification = await prisma.notification.findFirst({
    where: { id, tenantId, userId },
  });

  if (!notification) return false;

  await prisma.notification.delete({ where: { id } });
  return true;
}

// ─── Alert Generators ─────────────────────────────────────────────────────────

/**
 * Run all business-rule alert checks for a tenant.
 *
 * Each check:
 *   1. Queries the relevant data.
 *   2. Deduplicates against notifications already created in the last 24 h.
 *   3. Creates one notification per ADMIN/SUPER_ADMIN user per alert item.
 *
 * Returns counts of new notifications generated per category.
 */
export async function runAlertChecks(
  tenantId: string
): Promise<RunAlertChecksResult> {
  const result: RunAlertChecksResult = {
    overdueInvoices:   0,
    dueSoonInvoices:   0,
    lowStockProducts:  0,
    expiringTrainings: 0,
  };

  const adminUserIds = await getAdminAndManagerUserIds(tenantId);
  if (adminUserIds.length === 0) {
    logger.info('runAlertChecks: no admin users found for tenant', { tenantId });
    return result;
  }

  // ── 1. INVOICE_OVERDUE ──────────────────────────────────────────────────────
  try {
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status:    'OVERDUE',
        dueDate:   { lt: new Date() },
        deletedAt: null,
      },
      include: { customer: { select: { name: true } } },
    });

    for (const invoice of overdueInvoices) {
      const refId = invoice.id;
      if (await isDuplicate(tenantId, 'INVOICE_OVERDUE', refId)) continue;

      const title = `חשבונית פגה - ${invoice.customer.name}`;
      const body  = `חשבונית #${invoice.number} על סך ₪${Number(invoice.total).toLocaleString('he-IL')} פגה תוקף ב-${formatDate(invoice.dueDate)}`;
      const data  = { refId, invoiceId: invoice.id, invoiceNumber: invoice.number, customerId: invoice.customerId };

      for (const userId of adminUserIds) {
        await insertNotification(tenantId, {
          userId,
          type:    'INVOICE_OVERDUE',
          channel: 'BOTH',
          title,
          body,
          data,
        });
        result.overdueInvoices++;
      }
    }
  } catch (err) {
    logger.error('runAlertChecks: INVOICE_OVERDUE check failed', { tenantId, err });
  }

  // ── 2. INVOICE_DUE_SOON ─────────────────────────────────────────────────────
  try {
    const now         = new Date();
    const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000);

    const dueSoonInvoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status:    'SENT',
        dueDate:   { gte: now, lte: threeDaysOut },
        deletedAt: null,
      },
      include: { customer: { select: { name: true } } },
    });

    for (const invoice of dueSoonInvoices) {
      const refId = invoice.id;
      if (await isDuplicate(tenantId, 'INVOICE_DUE_SOON', refId)) continue;

      const title = `חשבונית מתקרבת לפרעון - ${invoice.customer.name}`;
      const body  = `חשבונית #${invoice.number} על סך ₪${Number(invoice.total).toLocaleString('he-IL')} פגה ב-${formatDate(invoice.dueDate)} (בעוד 3 ימים)`;
      const data  = { refId, invoiceId: invoice.id, invoiceNumber: invoice.number, customerId: invoice.customerId };

      for (const userId of adminUserIds) {
        await insertNotification(tenantId, {
          userId,
          type:    'INVOICE_DUE_SOON',
          channel: 'IN_APP',
          title,
          body,
          data,
        });
        result.dueSoonInvoices++;
      }
    }
  } catch (err) {
    logger.error('runAlertChecks: INVOICE_DUE_SOON check failed', { tenantId, err });
  }

  // ── 3. LOW_STOCK ─────────────────────────────────────────────────────────────
  try {
    const lowStockLevels = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        reorderPoint: { not: null },
      },
      include: { product: { select: { id: true, name: true } } },
    });

    // Filter in JS: quantity <= reorderPoint (both are Decimal, compare as numbers)
    const alertLevels = lowStockLevels.filter(
      sl => sl.reorderPoint !== null && Number(sl.quantity) <= Number(sl.reorderPoint)
    );

    for (const sl of alertLevels) {
      const refId = sl.productId;
      if (await isDuplicate(tenantId, 'LOW_STOCK', refId)) continue;

      const title = `מלאי נמוך - ${sl.product.name}`;
      const body  = `מלאי: ${Number(sl.quantity)} יחידות (נקודת הזמנה מחדש: ${Number(sl.reorderPoint)})`;
      const data  = { refId, productId: sl.productId, warehouseId: sl.warehouseId, quantity: Number(sl.quantity), reorderPoint: Number(sl.reorderPoint) };

      for (const userId of adminUserIds) {
        await insertNotification(tenantId, {
          userId,
          type:    'LOW_STOCK',
          channel: 'IN_APP',
          title,
          body,
          data,
        });
        result.lowStockProducts++;
      }
    }
  } catch (err) {
    logger.error('runAlertChecks: LOW_STOCK check failed', { tenantId, err });
  }

  // ── 4. TRAINING_EXPIRING ────────────────────────────────────────────────────
  try {
    const now        = new Date();
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);

    const expiringTrainings = await prisma.employeeTraining.findMany({
      where: {
        tenantId,
        expiresAt: { gte: now, lte: thirtyDays },
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        course:   { select: { name: true } },
      },
    });

    for (const et of expiringTrainings) {
      const refId = et.id;
      if (await isDuplicate(tenantId, 'TRAINING_EXPIRING', refId)) continue;

      const employeeName = `${et.employee.firstName} ${et.employee.lastName}`;
      const expiresAt    = et.expiresAt!;

      const title = `תעודה פגה בקרוב - ${employeeName}`;
      const body  = `תעודת קורס '${et.course.name}' של ${employeeName} פגה ב-${formatDate(expiresAt)}`;
      const data  = { refId, employeeTrainingId: et.id, employeeId: et.employeeId, courseId: et.courseId, expiresAt: expiresAt.toISOString() };

      for (const userId of adminUserIds) {
        await insertNotification(tenantId, {
          userId,
          type:    'TRAINING_EXPIRING',
          channel: 'IN_APP',
          title,
          body,
          data,
        });
        result.expiringTrainings++;
      }
    }
  } catch (err) {
    logger.error('runAlertChecks: TRAINING_EXPIRING check failed', { tenantId, err });
  }

  logger.info('runAlertChecks: completed', { tenantId, result });
  return result;
}

/**
 * Create a GENERAL test notification for the requesting user.
 */
export async function sendTestNotification(tenantId: string, userId: string) {
  return createNotification(tenantId, {
    userId,
    type:    'GENERAL',
    channel: 'IN_APP',
    title:   'הודעת בדיקה',
    body:    'זוהי הודעת בדיקה ממערכת ההתראות של חשבשבת ERP. המערכת פעילה ותקינה.',
    data:    { test: true, sentAt: new Date().toISOString() },
  });
}
