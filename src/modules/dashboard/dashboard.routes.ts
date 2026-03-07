/**
 * Dashboard Routes — ראוטים לדשבורד
 */
import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { getLaundryDashboard } from './dashboard.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Full Dashboard ──────────────────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const dashboard = await getLaundryDashboard(req.user.tenantId);
  sendSuccess(res, dashboard);
}));

export default router;
