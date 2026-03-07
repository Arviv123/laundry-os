/**
 * Prepaid Account Routes — ראוטים לחשבון מקדמה
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { getOrCreateAccount, loadBalance, useBalance, refundBalance } from './prepaid.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Get Balance ─────────────────────────────────────────────────

router.get('/:customerId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const account = await getOrCreateAccount(req.user.tenantId, req.params.customerId);
  sendSuccess(res, account);
}));

// ─── Load Balance ────────────────────────────────────────────────

router.post('/:customerId/load', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { amount, description } = z.object({
    amount: z.number().positive(),
    description: z.string().optional(),
  }).parse(req.body);

  const result = await loadBalance(req.user.tenantId, req.params.customerId, amount, description);
  sendSuccess(res, result, 201);
}));

// ─── Transaction History ─────────────────────────────────────────

router.get('/:customerId/history', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const account = await getOrCreateAccount(req.user.tenantId, req.params.customerId);
  const transactions = await prisma.prepaidTransaction.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  sendSuccess(res, { account, transactions });
}));

export default router;
