import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  getARAgingReport,
  getAPAgingReport,
  getAgingSummary,
  exportARAgingXLSX,
  exportAPAgingXLSX,
} from './aging.service';

const router = Router();

// All aging routes require authentication + tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function parseAsOfDate(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─────────────────────────────────────────────
// GET /api/aging/ar
// Query params:
//   asOfDate  — ISO date string (default: today)
//   format    — "json" | "xlsx" (default: json)
// ─────────────────────────────────────────────
router.get(
  '/ar',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const asOf     = parseAsOfDate(req.query.asOfDate);
    const format   = req.query.format as string | undefined;

    if (format === 'xlsx') {
      try {
        const buffer   = await exportARAgingXLSX(tenantId, asOf);
        const dateStr  = (asOf ?? new Date()).toISOString().slice(0, 10);
        const filename = `aging-ar-${dateStr}.xlsx`;
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (err: any) {
        sendError(res, err.message ?? 'Failed to generate XLSX');
      }
      return;
    }

    const rows = await getARAgingReport(tenantId, asOf);
    sendSuccess(res, rows, 200, {
      count:     rows.length,
      asOfDate:  (asOf ?? new Date()).toISOString().slice(0, 10),
    } as any);
  }),
);

// ─────────────────────────────────────────────
// GET /api/aging/ap
// Query params:
//   asOfDate  — ISO date string (default: today)
//   format    — "json" | "xlsx" (default: json)
// ─────────────────────────────────────────────
router.get(
  '/ap',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const asOf     = parseAsOfDate(req.query.asOfDate);
    const format   = req.query.format as string | undefined;

    if (format === 'xlsx') {
      try {
        const buffer   = await exportAPAgingXLSX(tenantId, asOf);
        const dateStr  = (asOf ?? new Date()).toISOString().slice(0, 10);
        const filename = `aging-ap-${dateStr}.xlsx`;
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (err: any) {
        sendError(res, err.message ?? 'Failed to generate XLSX');
      }
      return;
    }

    const rows = await getAPAgingReport(tenantId, asOf);
    sendSuccess(res, rows, 200, {
      count:    rows.length,
      asOfDate: (asOf ?? new Date()).toISOString().slice(0, 10),
    } as any);
  }),
);

// ─────────────────────────────────────────────
// GET /api/aging/summary
// Query params:
//   asOfDate  — ISO date string (default: today)
// ─────────────────────────────────────────────
router.get(
  '/summary',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const asOf     = parseAsOfDate(req.query.asOfDate);

    const summary = await getAgingSummary(tenantId, asOf);
    sendSuccess(res, summary);
  }),
);

export default router;
