import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { AuthenticatedRequest } from '../../shared/types/index';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  getCashFlowForecast,
  getWeeklySummary,
  getMonthlySummary,
  exportForecastXLSX,
} from './cash-flow-forecast.service';

const router = Router();

// All cash-flow routes require authentication + tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cash-flow/forecast
// Daily forecast for the next N days.
//
// Query params:
//   days           number   default 90     — forecast horizon in days
//   openingBalance number   default 0      — opening cash balance
//   format         string   json | xlsx    — response format (default json)
//
// xlsx response: Content-Type application/vnd.openxmlformats…
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/forecast',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    const horizonDays    = req.query.days           ? parseInt(req.query.days as string, 10)           : 90;
    const openingBalance = req.query.openingBalance ? parseFloat(req.query.openingBalance as string)   : 0;
    const format         = (req.query.format as string | undefined) ?? 'json';

    if (isNaN(horizonDays) || horizonDays < 1 || horizonDays > 730) {
      sendError(res, 'days must be a number between 1 and 730'); return;
    }
    if (isNaN(openingBalance)) {
      sendError(res, 'openingBalance must be a valid number'); return;
    }

    if (format === 'xlsx') {
      const buffer = await exportForecastXLSX(tenantId, horizonDays, openingBalance);
      const today  = new Date().toISOString().slice(0, 10);
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="cash-flow-forecast-${today}.xlsx"`);
      res.send(buffer);
      return;
    }

    const forecast = await getCashFlowForecast(tenantId, horizonDays, openingBalance);
    sendSuccess(res, forecast);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cash-flow/weekly
// Forecast grouped by week (Mon–Sun).
//
// Query params:
//   weeks   number   default 12   — number of weeks to project
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/weekly',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    const weeks = req.query.weeks ? parseInt(req.query.weeks as string, 10) : 12;

    if (isNaN(weeks) || weeks < 1 || weeks > 104) {
      sendError(res, 'weeks must be a number between 1 and 104'); return;
    }

    const summary = await getWeeklySummary(tenantId, weeks);
    sendSuccess(res, summary);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cash-flow/monthly
// Forecast grouped by calendar month.
//
// Query params:
//   months   number   default 6   — number of months to project
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/monthly',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;

    if (isNaN(months) || months < 1 || months > 24) {
      sendError(res, 'months must be a number between 1 and 24'); return;
    }

    const summary = await getMonthlySummary(tenantId, months);
    sendSuccess(res, summary);
  }),
);

export default router;
