import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  CreateBranchSchema,
  UpdateBranchSchema,
  TransferEmployeeSchema,
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deactivateBranch,
  assignEmployee,
  unassignEmployee,
  transferEmployee,
  getBranchSummary,
  getConsolidatedReport,
} from './branches.service';

const router = Router();

// All routes require authentication and tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET / — list all branches ────────────────────────────────────────────────
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Optional filter: ?isActive=true|false
  let isActive: boolean | undefined;
  if (req.query.isActive !== undefined) {
    isActive = req.query.isActive === 'true';
  }

  const branches = await listBranches(tenantId, { isActive });
  sendSuccess(res, branches);
}));

// ─── GET /summary — stats per branch (must be before /:id) ───────────────────
router.get('/summary', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const summary = await getBranchSummary(tenantId);
  sendSuccess(res, summary);
}));

// ─── GET /consolidated-report — cross-branch financials ──────────────────────
router.get('/consolidated-report', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const FilterSchema = z.object({
    from: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid from date'),
    to:   z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid to date'),
  });

  const parsed = FilterSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const from = new Date(parsed.data.from);
  const to   = new Date(parsed.data.to);

  if (from > to) return sendError(res, '"from" must be before "to"', 400);

  const report = await getConsolidatedReport(tenantId, { from, to });
  sendSuccess(res, report);
}));

// ─── POST / — create branch (ADMIN+) ─────────────────────────────────────────
router.post('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const body = CreateBranchSchema.safeParse(req.body);
  if (!body.success) return sendError(res, body.error.message, 400);

  try {
    const branch = await createBranch(tenantId, body.data);
    sendSuccess(res, branch, 201);
  } catch (err: any) {
    sendError(res, err.message, 409);
  }
}));

// ─── GET /:id — get single branch ────────────────────────────────────────────
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const branch = await getBranch(id, tenantId);
    sendSuccess(res, branch);
  } catch (err: any) {
    sendError(res, err.message, 404);
  }
}));

// ─── PUT /:id — update branch (ADMIN+) ───────────────────────────────────────
router.put('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const body = UpdateBranchSchema.safeParse(req.body);
  if (!body.success) return sendError(res, body.error.message, 400);

  try {
    const branch = await updateBranch(id, tenantId, body.data);
    sendSuccess(res, branch);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 409;
    sendError(res, err.message, status);
  }
}));

// ─── POST /:id/deactivate — deactivate branch (ADMIN+) ───────────────────────
router.post('/:id/deactivate', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const branch = await deactivateBranch(id, tenantId);
    sendSuccess(res, branch);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 409;
    sendError(res, err.message, status);
  }
}));

// ─── POST /:id/assign/:employeeId — assign employee to branch (ADMIN+) ───────
router.post('/:id/assign/:employeeId', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id: branchId, employeeId } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const employee = await assignEmployee(branchId, employeeId, tenantId);
    sendSuccess(res, employee);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 409;
    sendError(res, err.message, status);
  }
}));

// ─── DELETE /employee/:employeeId/unassign — unassign employee ───────────────
router.delete('/employee/:employeeId/unassign', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { employeeId } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const employee = await unassignEmployee(employeeId, tenantId);
    sendSuccess(res, employee);
  } catch (err: any) {
    sendError(res, err.message, 404);
  }
}));

// ─── POST /employee/:employeeId/transfer — transfer employee between branches ─
router.post('/employee/:employeeId/transfer', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { employeeId } = req.params;
  const tenantId = req.user!.tenantId;

  const body = TransferEmployeeSchema.safeParse(req.body);
  if (!body.success) return sendError(res, body.error.message, 400);

  try {
    const employee = await transferEmployee(
      employeeId,
      body.data.fromBranchId,
      body.data.toBranchId,
      tenantId
    );
    sendSuccess(res, employee);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 409;
    sendError(res, err.message, status);
  }
}));

export default router;
