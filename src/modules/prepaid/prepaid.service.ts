/**
 * Prepaid Account Service — שירות חשבון מקדמה
 */
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

export async function getOrCreateAccount(tenantId: string, customerId: string) {
  let account = await prisma.prepaidAccount.findFirst({
    where: { tenantId, customerId },
  });

  if (!account) {
    try {
      account = await prisma.prepaidAccount.create({
        data: {
          tenantId,
          customerId,
          balance: 0,
          totalLoaded: 0,
          totalUsed: 0,
        },
      });
    } catch (err: any) {
      // Race condition: another request created it first
      if (err.code === 'P2002') {
        account = await prisma.prepaidAccount.findFirst({
          where: { tenantId, customerId },
        });
      } else {
        throw err;
      }
    }
  }

  if (!account) throw new Error('Failed to get or create prepaid account');
  return account;
}

export async function loadBalance(
  tenantId: string,
  customerId: string,
  amount: number,
  description?: string,
) {
  const account = await getOrCreateAccount(tenantId, customerId);

  const [updated, tx] = await prisma.$transaction([
    prisma.prepaidAccount.update({
      where: { id: account.id },
      data: {
        balance: { increment: amount },
        totalLoaded: { increment: amount },
        lastLoadedAt: new Date(),
      },
    }),
    prisma.prepaidTransaction.create({
      data: {
        accountId: account.id,
        type: 'LOAD',
        amount,
        description: description ?? 'טעינת יתרה',
      },
    }),
  ]);

  logger.info('Prepaid loaded', { customerId, amount, balance: Number(account.balance) + amount });
  return { account: updated, transaction: tx };
}

export async function useBalance(
  tenantId: string,
  customerId: string,
  amount: number,
  orderId?: string,
  description?: string,
) {
  const account = await getOrCreateAccount(tenantId, customerId);
  if (Number(account.balance) < amount) {
    throw new Error(`יתרה לא מספיקה. יתרה: ${account.balance}, נדרש: ${amount}`);
  }

  const [updated, tx] = await prisma.$transaction([
    prisma.prepaidAccount.update({
      where: { id: account.id },
      data: {
        balance: { decrement: amount },
        totalUsed: { increment: amount },
      },
    }),
    prisma.prepaidTransaction.create({
      data: {
        accountId: account.id,
        type: 'USE',
        amount: -amount,
        orderId,
        description: description ?? 'ניכוי עבור הזמנה',
      },
    }),
  ]);

  logger.info('Prepaid used', { customerId, amount, orderId });
  return { account: updated, transaction: tx };
}

export async function refundBalance(
  tenantId: string,
  customerId: string,
  amount: number,
  orderId?: string,
  description?: string,
) {
  const account = await getOrCreateAccount(tenantId, customerId);

  const [updated, tx] = await prisma.$transaction([
    prisma.prepaidAccount.update({
      where: { id: account.id },
      data: {
        balance: { increment: amount },
        totalUsed: { decrement: amount },
      },
    }),
    prisma.prepaidTransaction.create({
      data: {
        accountId: account.id,
        type: 'REFUND',
        amount,
        orderId,
        description: description ?? 'החזר',
      },
    }),
  ]);

  logger.info('Prepaid refund', { customerId, amount, orderId });
  return { account: updated, transaction: tx };
}
