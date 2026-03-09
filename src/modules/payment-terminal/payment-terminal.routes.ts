import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);
router.use(requireMinRole('ADMIN') as any);

// ─── List terminals ──────────────────────────────────────────
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const terminals = await prisma.paymentTerminal.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { createdAt: 'desc' },
    include: { branch: { select: { name: true } } },
  });
  sendSuccess(res, terminals);
}));

// ─── Get terminal ────────────────────────────────────────────
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const terminal = await prisma.paymentTerminal.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    include: { branch: { select: { name: true } } },
  });
  if (!terminal) return sendError(res, 'Terminal not found', 404);
  sendSuccess(res, terminal);
}));

// ─── Create terminal ─────────────────────────────────────────
const CreateTerminalSchema = z.object({
  name:       z.string().min(1),
  terminalId: z.string().min(1),
  provider:   z.enum(['PELE_CARD', 'CARDCOM', 'TRANZILA', 'MESHULAM', 'PAYPLUS', 'EMV_DIRECT', 'OTHER']),
  apiUrl:     z.string().optional(),
  apiKey:     z.string().optional(),
  apiSecret:  z.string().optional(),
  merchantId: z.string().optional(),
  currency:   z.string().default('ILS'),
  branchId:   z.string().optional(),
});

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CreateTerminalSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const terminal = await prisma.paymentTerminal.create({
    data: { ...parsed.data, tenantId: req.user!.tenantId },
  });
  sendSuccess(res, terminal, 201);
}));

// ─── Update terminal ─────────────────────────────────────────
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CreateTerminalSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const existing = await prisma.paymentTerminal.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!existing) return sendError(res, 'Terminal not found', 404);

  const updated = await prisma.paymentTerminal.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  sendSuccess(res, updated);
}));

// ─── Delete terminal ─────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.paymentTerminal.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!existing) return sendError(res, 'Terminal not found', 404);

  await prisma.paymentTerminal.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Terminal deleted' });
}));

// ─── Charge card ─────────────────────────────────────────────
const ChargeSchema = z.object({
  amount:       z.number().positive(),
  customerId:   z.string().optional(),
  orderId:      z.string().optional(),
  installments: z.number().int().min(1).max(36).default(1),
  cardType:     z.string().optional(),
  last4:        z.string().length(4).optional(),
});

router.post('/:id/charge', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = ChargeSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const terminal = await prisma.paymentTerminal.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId, isActive: true },
  });
  if (!terminal) return sendError(res, 'Terminal not found or inactive', 404);

  // Create transaction with simulated approval (real integration would call provider API)
  const approvalCode = String(Math.floor(100000 + Math.random() * 900000));
  const tx = await prisma.cardPaymentTransaction.create({
    data: {
      tenantId:     req.user!.tenantId,
      terminalId:   terminal.id,
      amount:       parsed.data.amount,
      installments: parsed.data.installments,
      customerId:   parsed.data.customerId || null,
      cardType:     parsed.data.cardType || null,
      last4:        parsed.data.last4 || null,
      approvalCode,
      status:       'APPROVED',
      paymentType:  parsed.data.installments > 1 ? 'INSTALLMENTS' : 'REGULAR',
      referenceNumber: `REF-${Date.now()}`,
    },
  });

  sendSuccess(res, tx, 201);
}));

// ─── Refund ──────────────────────────────────────────────────
const RefundSchema = z.object({
  transactionId: z.string(),
  amount:        z.number().positive().optional(),
});

router.post('/:id/refund', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = RefundSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const tx = await prisma.cardPaymentTransaction.findFirst({
    where: {
      id: parsed.data.transactionId,
      tenantId: req.user!.tenantId,
      terminalId: req.params.id,
      status: 'APPROVED',
    },
  });
  if (!tx) return sendError(res, 'Transaction not found or already refunded', 404);

  const updated = await prisma.cardPaymentTransaction.update({
    where: { id: tx.id },
    data: { status: 'REFUNDED' },
  });
  sendSuccess(res, updated);
}));

// ─── Get transactions ────────────────────────────────────────
router.get('/:id/transactions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { page = '1', limit = '50' } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const [transactions, total] = await Promise.all([
    prisma.cardPaymentTransaction.findMany({
      where: { terminalId: req.params.id, tenantId: req.user!.tenantId },
      orderBy: { transactionDate: 'desc' },
      take: Number(limit),
      skip,
      include: { customer: { select: { name: true, phone: true } } },
    }),
    prisma.cardPaymentTransaction.count({
      where: { terminalId: req.params.id, tenantId: req.user!.tenantId },
    }),
  ]);

  sendSuccess(res, { transactions, total, page: Number(page), limit: Number(limit) });
}));

// ─── Test connection ─────────────────────────────────────────
router.post('/:id/test', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const terminal = await prisma.paymentTerminal.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!terminal) return sendError(res, 'Terminal not found', 404);

  // Simulated test — in production this would ping the provider API
  sendSuccess(res, { connected: true, provider: terminal.provider, message: 'Connection successful' });
}));

export default router;
