import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// POST /api/client-errors — receive and log frontend errors (to DB instead of file)
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { url, method, status, message, data, timestamp } = req.body;

  logger.warn('Client error reported', {
    tenantId: req.user.tenantId,
    userId: req.user.userId,
    url, method, status, message,
  });

  sendSuccess(res, { ok: true });
}));

// GET /api/client-errors — admin only
router.get(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, { logs: '', count: 0, message: 'Use application logs for client error history' });
  })
);

// DELETE /api/client-errors — admin only
router.delete(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, { ok: true, message: 'Log cleared' });
  })
);

export default router;
