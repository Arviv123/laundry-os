import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { getAuditLogs } from './audit.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// GET /audit?entityType=EMPLOYEE&entityId=xxx&from=2026-01-01
router.get(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { entityType, entityId, userId, action, from, to, page, pageSize } = req.query;

    const result = await getAuditLogs(req.user.tenantId, {
      entityType: entityType as string,
      entityId:   entityId   as string,
      userId:     userId     as string,
      action:     action     as any,
      from:       from ? new Date(from as string) : undefined,
      to:         to   ? new Date(to   as string) : undefined,
      page:       page     ? parseInt(page     as string) : 1,
      pageSize:   pageSize ? parseInt(pageSize as string) : 50,
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.pageSize,
    });
  })
);

export default router;
