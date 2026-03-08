/**
 * Delivery Notifications — עדכוני WhatsApp ללקוחות על משלוחים
 */
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { sendCustomMessage, formatIsraeliPhone } from '../whatsapp/whatsapp.service';

/**
 * שולח ללקוח הודעה שהשליח בדרך אליו
 */
export async function notifyCustomerNavigating(
  tenantId: string,
  orderId: string,
  driverName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.laundryOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { customer: true },
    });

    if (!order?.customer?.phone) {
      return { success: false, error: 'לא נמצא טלפון ללקוח' };
    }

    const msg = `שלום ${order.customer.name}, השליח ${driverName} יצא אליך! צפי הגעה בקרוב.`;
    return await sendCustomMessage(tenantId, order.customer.phone, msg, orderId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('notifyCustomerNavigating failed', { orderId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

/**
 * שולח ללקוח הודעה שההזמנה נאספה מהמכבסה
 */
export async function notifyCustomerPickedUp(
  tenantId: string,
  orderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.laundryOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { customer: true },
    });

    if (!order?.customer?.phone) {
      return { success: false, error: 'לא נמצא טלפון ללקוח' };
    }

    const msg = `שלום ${order.customer.name}, ההזמנה שלך (${order.orderNumber}) נאספה מהמכבסה ובדרך אליך!`;
    return await sendCustomMessage(tenantId, order.customer.phone, msg, orderId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('notifyCustomerPickedUp failed', { orderId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

/**
 * שולח ללקוח הודעה שההזמנה נמסרה
 */
export async function notifyCustomerDelivered(
  tenantId: string,
  orderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.laundryOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { customer: true },
    });

    if (!order?.customer?.phone) {
      return { success: false, error: 'לא נמצא טלפון ללקוח' };
    }

    const msg = `שלום ${order.customer.name}, ההזמנה שלך (${order.orderNumber}) נמסרה בהצלחה! תודה שבחרת בנו.`;
    return await sendCustomMessage(tenantId, order.customer.phone, msg, orderId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('notifyCustomerDelivered failed', { orderId, error: errMsg });
    return { success: false, error: errMsg };
  }
}
