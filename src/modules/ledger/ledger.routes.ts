import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { AuthenticatedRequest } from '../../shared/types';
import { prisma } from '../../config/database';
import * as LedgerService from './ledger.service';

const router = Router();

// All ledger routes require authentication and tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Default date helpers ─────────────────────────────────────────

function getDefaultFrom(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1); // Jan 1st of current year
}

function getDefaultTo(): Date {
  return new Date(); // today
}

function parseDates(
  fromStr: string | undefined,
  toStr:   string | undefined
): { from: Date; to: Date } {
  const from = fromStr ? new Date(fromStr) : getDefaultFrom();
  const to   = toStr   ? new Date(toStr)   : getDefaultTo();
  return { from, to };
}

// ─── GET /api/ledger/accounts ─────────────────────────────────────
// List summary of all accounts with activity in period

router.get(
  '/accounts',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );
    const type   = req.query.type   as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await LedgerService.listAccountLedgers(
      req.user.tenantId,
      { from, to, type, search }
    );
    sendSuccess(res, result);
  })
);

// ─── GET /api/ledger/accounts/:accountId ──────────────────────────
// Full ledger card for a single account

router.get(
  '/accounts/:accountId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    try {
      const ledger = await LedgerService.getAccountLedger(
        req.user.tenantId,
        req.params.accountId,
        from,
        to
      );
      sendSuccess(res, ledger);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  })
);

// ─── GET /api/ledger/accounts/:accountId/export ───────────────────
// Export single account ledger as XLSX

router.get(
  '/accounts/:accountId/export',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    let ledger: LedgerService.LedgerCard;
    try {
      ledger = await LedgerService.getAccountLedger(
        req.user.tenantId,
        req.params.accountId,
        from,
        to
      );
    } catch (err: any) {
      sendError(res, err.message, 404);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true },
    });

    const buffer = LedgerService.exportLedgerXLSX(ledger, tenant?.name);
    const filename = `ledger-${ledger.entityCode ?? ledger.entityId}-rtl.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

// ─── GET /api/ledger/customers/:customerId ────────────────────────
// Full ledger card for a customer (חשבון לקוח)

router.get(
  '/customers/:customerId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    try {
      const ledger = await LedgerService.getCustomerLedger(
        req.user.tenantId,
        req.params.customerId,
        from,
        to
      );
      sendSuccess(res, ledger);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  })
);

// ─── GET /api/ledger/customers/:customerId/export ─────────────────

router.get(
  '/customers/:customerId/export',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    let ledger: LedgerService.LedgerCard;
    try {
      ledger = await LedgerService.getCustomerLedger(
        req.user.tenantId,
        req.params.customerId,
        from,
        to
      );
    } catch (err: any) {
      sendError(res, err.message, 404);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true },
    });

    const buffer = LedgerService.exportLedgerXLSX(ledger, tenant?.name);
    const filename = `ledger-customer-${req.params.customerId}-rtl.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

// ─── GET /api/ledger/vendors/:vendorId ────────────────────────────
// Full ledger card for a vendor (חשבון ספק)

router.get(
  '/vendors/:vendorId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    try {
      const ledger = await LedgerService.getVendorLedger(
        req.user.tenantId,
        req.params.vendorId,
        from,
        to
      );
      sendSuccess(res, ledger);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  })
);

// ─── GET /api/ledger/vendors/:vendorId/export ─────────────────────

router.get(
  '/vendors/:vendorId/export',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    let ledger: LedgerService.LedgerCard;
    try {
      ledger = await LedgerService.getVendorLedger(
        req.user.tenantId,
        req.params.vendorId,
        from,
        to
      );
    } catch (err: any) {
      sendError(res, err.message, 404);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true },
    });

    const buffer = LedgerService.exportLedgerXLSX(ledger, tenant?.name);
    const filename = `ledger-vendor-${req.params.vendorId}-rtl.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

// ─── GET /api/ledger/employees/:employeeId ────────────────────────
// Full ledger card for an employee (כרטסת עובד — payroll history)
// Minimum role: HR_MANAGER (or own employee via EMPLOYEE role)

router.get(
  '/employees/:employeeId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    // EMPLOYEE role can only view their own ledger
    const roleHierarchy = ['EMPLOYEE', 'SALESPERSON', 'HR_MANAGER', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'];
    const userRoleIdx   = roleHierarchy.indexOf(req.user.role);
    const hrManagerIdx  = roleHierarchy.indexOf('HR_MANAGER');

    if (userRoleIdx < hrManagerIdx) {
      // Employee-level: verify they're viewing their own record
      const emp = await prisma.employee.findFirst({
        where: { id: req.params.employeeId, tenantId: req.user.tenantId },
        select: { userId: true },
      });
      if (!emp || emp.userId !== req.user.userId) {
        sendError(res, 'Forbidden - insufficient permissions', 403);
        return;
      }
    }

    try {
      const ledger = await LedgerService.getEmployeeLedger(
        req.user.tenantId,
        req.params.employeeId,
        from,
        to
      );
      sendSuccess(res, ledger);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  })
);

// ─── GET /api/ledger/employees/:employeeId/export ─────────────────

router.get(
  '/employees/:employeeId/export',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );

    let ledger: LedgerService.LedgerCard;
    try {
      ledger = await LedgerService.getEmployeeLedger(
        req.user.tenantId,
        req.params.employeeId,
        from,
        to
      );
    } catch (err: any) {
      sendError(res, err.message, 404);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true },
    });

    const buffer = LedgerService.exportLedgerXLSX(ledger, tenant?.name);
    const filename = `ledger-employee-${req.params.employeeId}-rtl.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

// ─── GET /api/ledger/export-all ───────────────────────────────────
// Export all account ledgers to a multi-sheet XLSX (ADMIN/ACCOUNTANT only)

router.get(
  '/export-all',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = parseDates(
      req.query.from as string | undefined,
      req.query.to   as string | undefined
    );
    const type   = req.query.type   as string | undefined;
    const search = req.query.search as string | undefined;

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true },
    });

    const buffer = await LedgerService.exportAllLedgersXLSX(
      req.user.tenantId,
      { from, to, type, search },
      tenant?.name
    );

    const fromStr = from.toISOString().slice(0, 10);
    const toStr   = to.toISOString().slice(0, 10);
    const filename = `all-ledgers-${fromStr}-${toStr}-rtl.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

export default router;
