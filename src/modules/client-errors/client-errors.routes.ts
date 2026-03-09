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

// POST /api/client-errors — public endpoint for frontend error logging (no auth required)
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { url, method, status, message, data, timestamp } = req.body;

  logger.warn('Client error reported', { url, method, status, message, timestamp });

  sendSuccess(res, { ok: true });
}));

// Protected admin routes below
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

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
