/**
 * Order Number Generator — מספר הזמנה אוטומטי
 * Pattern: ORD-2026-0001
 */

import { prisma } from '../../config/database';

export async function generateOrderNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;

  // Find last order number for this tenant + year
  const last = await prisma.laundryOrder.findFirst({
    where: { tenantId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });

  let seq = 1;
  if (last) {
    const lastSeq = parseInt(last.orderNumber.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export function generateItemBarcode(orderNumber: string, itemIndex: number): string {
  return `${orderNumber}-${String(itemIndex).padStart(2, '0')}`;
}
