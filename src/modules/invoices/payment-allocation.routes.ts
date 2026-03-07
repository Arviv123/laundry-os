import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  allocatePayment,
  getPaymentAllocations,
  getInvoiceAllocations,
  getUnallocatedPayments,
  removeAllocation,
} from './payment-allocation.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Schemas ──────────────────────────────────────────────────────

const AllocationLineSchema = z.object({
  invoiceId: z.string().cuid(),
  amount:    z.number().positive(),
});

const AllocatePaymentSchema = z.object({
  paymentId:   z.string().cuid(),
  allocations: z.array(AllocationLineSchema).min(1),
});

// ─── POST / — הקצאת תשלום לחשבוניות (ACCOUNTANT+) ────────────────

router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = AllocatePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const allocations = await allocatePayment(
        req.user.tenantId,
        req.user.userId,
        parsed.data
      );
      sendSuccess(res, allocations, 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      sendError(res, msg);
    }
  })
);

// ─── GET /unallocated — תשלומים עם יתרה לא מוקצית (ACCOUNTANT+) ──

router.get(
  '/unallocated',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { customerId } = req.query;

    const results = await getUnallocatedPayments(
      req.user.tenantId,
      customerId as string | undefined
    );
    sendSuccess(res, results);
  })
);

// ─── GET /payment/:paymentId — הקצאות לפי תשלום ──────────────────

router.get(
  '/payment/:paymentId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allocations = await getPaymentAllocations(
        req.params.paymentId,
        req.user.tenantId
      );
      sendSuccess(res, allocations);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Payment not found') {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  })
);

// ─── GET /invoice/:invoiceId — הקצאות לפי חשבונית ────────────────

router.get(
  '/invoice/:invoiceId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allocations = await getInvoiceAllocations(
        req.params.invoiceId,
        req.user.tenantId
      );
      sendSuccess(res, allocations);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Invoice not found') {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  })
);

// ─── DELETE /:allocationId — מחיקת הקצאה (ADMIN+) ────────────────

router.delete(
  '/:allocationId',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await removeAllocation(req.params.allocationId, req.user.tenantId);
      sendSuccess(res, { message: 'הקצאה נמחקה בהצלחה' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Allocation not found') {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  })
);

export default router;
