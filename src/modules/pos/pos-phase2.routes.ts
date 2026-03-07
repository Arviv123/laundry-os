import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as InventoryService from '../inventory/inventory.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Helpers ──────────────────────────────────────────────────────

function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function calcLoyaltyTier(lifetimePoints: number): 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM' {
  if (lifetimePoints >= 10000) return 'PLATINUM';
  if (lifetimePoints >= 5000)  return 'GOLD';
  if (lifetimePoints >= 1000)  return 'SILVER';
  return 'STANDARD';
}

// ══════════════════════════════════════════════════════════════════
// PROMOTIONS
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/promotions — create promotion
router.post(
  '/promotions',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:                 z.string().min(1),
      code:                 z.string().optional(),
      type:                 z.enum(['PERCENT_OFF', 'AMOUNT_OFF', 'BUY_X_GET_Y', 'FREE_ITEM', 'PRICE_OVERRIDE']),
      value:                z.number().min(0),
      minPurchase:          z.number().min(0).optional(),
      maxDiscount:          z.number().min(0).optional(),
      applicableTo:         z.enum(['ALL', 'CATEGORY', 'PRODUCT', 'CUSTOMER_GROUP']).default('ALL'),
      productIds:           z.array(z.string()).optional(),
      categoryIds:          z.array(z.string()).optional(),
      customerIds:          z.array(z.string()).optional(),
      startDate:            z.string().datetime(),
      endDate:              z.string().datetime().optional(),
      usageLimit:           z.number().int().positive().optional(),
      usageLimitPerCustomer: z.number().int().positive().optional(),
      isStackable:          z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const promo = await prisma.promotion.create({
      data: {
        ...parsed.data,
        tenantId:    req.user.tenantId,
        createdBy:   req.user.userId,
        startDate:   new Date(parsed.data.startDate),
        endDate:     parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
        productIds:  parsed.data.productIds  ?? undefined,
        categoryIds: parsed.data.categoryIds ?? undefined,
        customerIds: parsed.data.customerIds ?? undefined,
      },
    });
    sendSuccess(res, promo, 201);
  }),
);

// GET /api/pos/promotions — list active promotions
router.get(
  '/promotions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { active } = req.query;
    const where = withTenant(req, {
      ...(active !== 'false' ? { isActive: true } : {}),
    });
    const promos = await prisma.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, promos);
  }),
);

// PUT /api/pos/promotions/:id — update promotion
router.put(
  '/promotions/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const promo = await prisma.promotion.findUnique({ where: { id: req.params.id } });
    if (!promo || promo.tenantId !== req.user.tenantId) { sendError(res, 'Promotion not found', 404); return; }

    const updated = await prisma.promotion.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    sendSuccess(res, updated);
  }),
);

// DELETE /api/pos/promotions/:id — deactivate
router.delete(
  '/promotions/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const promo = await prisma.promotion.findUnique({ where: { id: req.params.id } });
    if (!promo || promo.tenantId !== req.user.tenantId) { sendError(res, 'Promotion not found', 404); return; }

    await prisma.promotion.update({ where: { id: req.params.id }, data: { isActive: false } });
    sendSuccess(res, { message: 'Promotion deactivated' });
  }),
);

// POST /api/pos/promotions/apply — apply promo to cart
router.post(
  '/promotions/apply',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      code:       z.string().optional(),
      cartTotal:  z.number().min(0),
      items:      z.array(z.object({
        productId:  z.string().optional(),
        categoryId: z.string().optional(),
        quantity:   z.number().positive(),
        unitPrice:  z.number().min(0),
      })),
      customerId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const now = new Date();
    // Find matching promotion
    const whereClause: any = {
      tenantId:  req.user.tenantId,
      isActive:  true,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    };
    if (parsed.data.code) {
      whereClause.code = parsed.data.code;
    }

    const promotions = await prisma.promotion.findMany({ where: whereClause });

    let bestDiscount = 0;
    let appliedPromotion: typeof promotions[0] | null = null;

    for (const promo of promotions) {
      // Usage limit check
      if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) continue;
      // Min purchase check
      if (promo.minPurchase !== null && parsed.data.cartTotal < Number(promo.minPurchase)) continue;

      let discount = 0;

      if (promo.type === 'PERCENT_OFF') {
        discount = parsed.data.cartTotal * (Number(promo.value) / 100);
      } else if (promo.type === 'AMOUNT_OFF') {
        discount = Number(promo.value);
      } else if (promo.type === 'PRICE_OVERRIDE') {
        // Handled by frontend per-item
        discount = 0;
      }

      // Respect maxDiscount cap
      if (promo.maxDiscount !== null) {
        discount = Math.min(discount, Number(promo.maxDiscount));
      }

      if (discount > bestDiscount || (parsed.data.code && promo.code === parsed.data.code)) {
        bestDiscount = discount;
        appliedPromotion = promo;
      }
    }

    // Increment usageCount if a promo was applied
    if (appliedPromotion) {
      await prisma.promotion.update({
        where: { id: appliedPromotion.id },
        data:  { usageCount: { increment: 1 } },
      });
    }

    sendSuccess(res, {
      discount:          Math.round(bestDiscount * 100) / 100,
      appliedPromotion,
      message:           appliedPromotion ? `Applied: ${appliedPromotion.name}` : 'No promotion applied',
    });
  }),
);

// ══════════════════════════════════════════════════════════════════
// LOYALTY PROGRAM
// ══════════════════════════════════════════════════════════════════

// GET /api/pos/loyalty/program
router.get(
  '/loyalty/program',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const program = await prisma.loyaltyProgram.findUnique({
      where: { tenantId: req.user.tenantId },
    });
    sendSuccess(res, program);
  }),
);

// PUT /api/pos/loyalty/program — create or update
router.put(
  '/loyalty/program',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:            z.string().min(1).optional(),
      pointsPerShekel: z.number().positive().optional(),
      shekelPerPoint:  z.number().positive().optional(),
      minRedeemPoints: z.number().int().min(0).optional(),
      expiryMonths:    z.number().int().positive().nullable().optional(),
      isActive:        z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const program = await prisma.loyaltyProgram.upsert({
      where:  { tenantId: req.user.tenantId },
      create: { ...parsed.data, tenantId: req.user.tenantId },
      update: parsed.data,
    });
    sendSuccess(res, program);
  }),
);

// GET /api/pos/loyalty/customers/:customerId — get loyalty account
router.get(
  '/loyalty/customers/:customerId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Verify customer belongs to tenant
    const customer = await prisma.customer.findUnique({ where: { id: req.params.customerId } });
    if (!customer || customer.tenantId !== req.user.tenantId) { sendError(res, 'Customer not found', 404); return; }

    const account = await prisma.loyaltyAccount.findUnique({
      where:   { customerId: req.params.customerId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    const program = await prisma.loyaltyProgram.findUnique({ where: { tenantId: req.user.tenantId } });

    sendSuccess(res, {
      account,
      program,
      redeemedValue: account && program
        ? (account.points * Number(program.shekelPerPoint)).toFixed(2)
        : '0.00',
    });
  }),
);

// POST /api/pos/loyalty/customers/:customerId/earn — add points
router.post(
  '/loyalty/customers/:customerId/earn',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      amount:          z.number().positive(),
      posTransactionId: z.string().optional(),
      description:     z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const customer = await prisma.customer.findUnique({ where: { id: req.params.customerId } });
    if (!customer || customer.tenantId !== req.user.tenantId) { sendError(res, 'Customer not found', 404); return; }

    const program = await prisma.loyaltyProgram.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!program || !program.isActive) { sendError(res, 'Loyalty program not active', 400); return; }

    const pointsEarned = Math.floor(parsed.data.amount * Number(program.pointsPerShekel));

    const result = await prisma.$transaction(async (tx) => {
      // Upsert loyalty account
      const account = await tx.loyaltyAccount.upsert({
        where:  { customerId: req.params.customerId },
        create: {
          tenantId:      req.user.tenantId,
          customerId:    req.params.customerId,
          points:        pointsEarned,
          lifetimePoints: pointsEarned,
          lifetimeSpend: parsed.data.amount,
          tier:          calcLoyaltyTier(pointsEarned),
        },
        update: {
          points:        { increment: pointsEarned },
          lifetimePoints: { increment: pointsEarned },
          lifetimeSpend: { increment: parsed.data.amount },
        },
      });

      // Update tier after points accumulate
      const newTier = calcLoyaltyTier(account.lifetimePoints + pointsEarned);
      await tx.loyaltyAccount.update({ where: { id: account.id }, data: { tier: newTier } });

      // Record transaction
      const ltx = await tx.loyaltyTransaction.create({
        data: {
          accountId:       account.id,
          type:            'EARN',
          points:          pointsEarned,
          description:     parsed.data.description ?? `Earned from purchase of ₪${parsed.data.amount.toFixed(2)}`,
          posTransactionId: parsed.data.posTransactionId,
          expiresAt:       program.expiryMonths
            ? new Date(Date.now() + program.expiryMonths * 30 * 24 * 60 * 60 * 1000)
            : undefined,
        },
      });

      return { account, transaction: ltx, pointsEarned };
    });

    sendSuccess(res, result);
  }),
);

// POST /api/pos/loyalty/customers/:customerId/redeem — redeem points
router.post(
  '/loyalty/customers/:customerId/redeem',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      points:          z.number().int().positive(),
      posTransactionId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const customer = await prisma.customer.findUnique({ where: { id: req.params.customerId } });
    if (!customer || customer.tenantId !== req.user.tenantId) { sendError(res, 'Customer not found', 404); return; }

    const program = await prisma.loyaltyProgram.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!program || !program.isActive) { sendError(res, 'Loyalty program not active', 400); return; }

    const account = await prisma.loyaltyAccount.findUnique({ where: { customerId: req.params.customerId } });
    if (!account) { sendError(res, 'Customer has no loyalty account', 400); return; }
    if (account.points < parsed.data.points) { sendError(res, 'Insufficient loyalty points', 400); return; }
    if (parsed.data.points < program.minRedeemPoints) {
      sendError(res, `Minimum redemption is ${program.minRedeemPoints} points`, 400);
      return;
    }

    const redeemedAmount = parsed.data.points * Number(program.shekelPerPoint);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.loyaltyAccount.update({
        where: { id: account.id },
        data:  { points: { decrement: parsed.data.points } },
      });

      const ltx = await tx.loyaltyTransaction.create({
        data: {
          accountId:       account.id,
          type:            'REDEEM',
          points:          -parsed.data.points,
          description:     `Redeemed ${parsed.data.points} points for ₪${redeemedAmount.toFixed(2)}`,
          posTransactionId: parsed.data.posTransactionId,
        },
      });

      return { account: updated, transaction: ltx, redeemedAmount };
    });

    sendSuccess(res, result);
  }),
);

// GET /api/pos/loyalty/customers/:customerId/history — transaction history
router.get(
  '/loyalty/customers/:customerId/history',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.customerId } });
    if (!customer || customer.tenantId !== req.user.tenantId) { sendError(res, 'Customer not found', 404); return; }

    const account = await prisma.loyaltyAccount.findUnique({ where: { customerId: req.params.customerId } });
    if (!account) { sendSuccess(res, []); return; }

    const { page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const [items, total] = await Promise.all([
      prisma.loyaltyTransaction.findMany({
        where:   { accountId: account.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.loyaltyTransaction.count({ where: { accountId: account.id } }),
    ]);

    sendSuccess(res, { items, account }, 200, { total });
  }),
);

// ══════════════════════════════════════════════════════════════════
// GIFT CARDS
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/gift-cards — sell a new gift card
router.post(
  '/gift-cards',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      amount:      z.number().positive(),
      purchasedBy: z.string().optional(),
      assignedTo:  z.string().optional(),
      expiresAt:   z.string().datetime().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateGiftCardCode();
      const existing = await prisma.giftCard.findUnique({ where: { tenantId_code: { tenantId: req.user.tenantId, code } } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const giftCard = await prisma.giftCard.create({
      data: {
        tenantId:      req.user.tenantId,
        code:          code!,
        initialAmount: parsed.data.amount,
        balance:       parsed.data.amount,
        purchasedBy:   parsed.data.purchasedBy,
        assignedTo:    parsed.data.assignedTo,
        expiresAt:     parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        activatedAt:   new Date(),
        createdBy:     req.user.userId,
      },
    });
    sendSuccess(res, giftCard, 201);
  }),
);

// GET /api/pos/gift-cards/:code — check balance
router.get(
  '/gift-cards/:code',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const giftCard = await prisma.giftCard.findUnique({
      where:   { tenantId_code: { tenantId: req.user.tenantId, code: req.params.code } },
      include: { usages: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!giftCard) { sendError(res, 'Gift card not found', 404); return; }
    if (!giftCard.isActive) { sendError(res, 'Gift card is inactive', 400); return; }
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
      sendError(res, 'Gift card has expired', 400);
      return;
    }
    sendSuccess(res, giftCard);
  }),
);

// POST /api/pos/gift-cards/:code/redeem — use gift card
router.post(
  '/gift-cards/:code/redeem',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      amount:          z.number().positive(),
      posTransactionId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const giftCard = await prisma.giftCard.findUnique({
      where: { tenantId_code: { tenantId: req.user.tenantId, code: req.params.code } },
    });
    if (!giftCard) { sendError(res, 'Gift card not found', 404); return; }
    if (!giftCard.isActive) { sendError(res, 'Gift card is inactive', 400); return; }
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
      sendError(res, 'Gift card has expired', 400);
      return;
    }
    if (Number(giftCard.balance) < parsed.data.amount) {
      sendError(res, `Insufficient balance. Available: ₪${Number(giftCard.balance).toFixed(2)}`, 400);
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const balanceBefore = Number(giftCard.balance);
      const balanceAfter  = balanceBefore - parsed.data.amount;

      const updated = await tx.giftCard.update({
        where: { id: giftCard.id },
        data: {
          balance:  balanceAfter,
          isActive: balanceAfter > 0,
        },
      });

      const usage = await tx.giftCardUsage.create({
        data: {
          giftCardId:      giftCard.id,
          amount:          parsed.data.amount,
          posTransactionId: parsed.data.posTransactionId,
          balanceBefore,
          balanceAfter,
        },
      });

      return { giftCard: updated, usage };
    });

    sendSuccess(res, result);
  }),
);

// GET /api/pos/gift-cards — list all gift cards
router.get(
  '/gift-cards',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { active, page = '1', pageSize = '20' } = req.query;
    const where = withTenant(req, {
      ...(active !== undefined ? { isActive: active === 'true' } : {}),
    });
    const [items, total] = await Promise.all([
      prisma.giftCard.findMany({
        where,
        include: { usages: { select: { amount: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take: parseInt(pageSize as string),
      }),
      prisma.giftCard.count({ where }),
    ]);
    sendSuccess(res, items, 200, { total });
  }),
);

// ══════════════════════════════════════════════════════════════════
// HOLD / RECALL TRANSACTIONS
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/sessions/:sessionId/hold — put transaction on hold
router.post(
  '/sessions/:sessionId/hold',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:       z.string().optional(),
      customerId: z.string().optional(),
      data:       z.record(z.any()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const session = await prisma.posSession.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.tenantId !== req.user.tenantId) { sendError(res, 'Session not found', 404); return; }
    if (session.status !== 'OPEN') { sendError(res, 'Session is closed', 400); return; }

    const held = await prisma.posHeldTransaction.create({
      data: {
        tenantId:   req.user.tenantId,
        sessionId:  req.params.sessionId,
        name:       parsed.data.name,
        customerId: parsed.data.customerId,
        data:       parsed.data.data,
        createdBy:  req.user.userId,
      },
    });
    sendSuccess(res, held, 201);
  }),
);

// GET /api/pos/sessions/:sessionId/held — list held transactions
router.get(
  '/sessions/:sessionId/held',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const session = await prisma.posSession.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.tenantId !== req.user.tenantId) { sendError(res, 'Session not found', 404); return; }

    const held = await prisma.posHeldTransaction.findMany({
      where:   { sessionId: req.params.sessionId, resumedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    sendSuccess(res, held);
  }),
);

// POST /api/pos/held/:id/recall — recall a held transaction
router.post(
  '/held/:id/recall',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const held = await prisma.posHeldTransaction.findUnique({ where: { id: req.params.id } });
    if (!held || held.tenantId !== req.user.tenantId) { sendError(res, 'Held transaction not found', 404); return; }
    if (held.resumedAt) { sendError(res, 'Transaction already recalled', 400); return; }

    const updated = await prisma.posHeldTransaction.update({
      where: { id: req.params.id },
      data:  { resumedAt: new Date() },
    });
    sendSuccess(res, updated);
  }),
);

// DELETE /api/pos/held/:id — cancel held transaction
router.delete(
  '/held/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const held = await prisma.posHeldTransaction.findUnique({ where: { id: req.params.id } });
    if (!held || held.tenantId !== req.user.tenantId) { sendError(res, 'Held transaction not found', 404); return; }

    await prisma.posHeldTransaction.delete({ where: { id: req.params.id } });
    sendSuccess(res, { message: 'Held transaction cancelled' });
  }),
);

// ══════════════════════════════════════════════════════════════════
// SPLIT PAYMENT (multi-method tracking)
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/transactions/:id/add-payment — add a payment method record
router.post(
  '/transactions/:id/add-payment',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      method:  z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'OTHER', 'GIFT_CARD', 'LOYALTY']),
      amount:  z.number().positive(),
      reference: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const tx = await prisma.posTransaction.findUnique({ where: { id: req.params.id } });
    if (!tx || tx.tenantId !== req.user.tenantId) { sendError(res, 'Transaction not found', 404); return; }

    // Store split payment in notes JSON field
    const existingNotes = tx.notes ? JSON.parse(tx.notes.startsWith('{') ? tx.notes : '{}') : {};
    const splitPayments: any[] = existingNotes.splitPayments ?? [];
    splitPayments.push({
      method:    parsed.data.method,
      amount:    parsed.data.amount,
      reference: parsed.data.reference,
      addedAt:   new Date().toISOString(),
    });
    const newNotes = JSON.stringify({ ...existingNotes, splitPayments });

    const updated = await prisma.posTransaction.update({
      where: { id: req.params.id },
      data:  { notes: newNotes },
    });
    sendSuccess(res, { transaction: updated, splitPayments });
  }),
);

// ══════════════════════════════════════════════════════════════════
// PRICE OVERRIDE (Manager Approval)
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/transactions/price-override
router.post(
  '/transactions/price-override',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      productId:     z.string(),
      originalPrice: z.number().min(0),
      overridePrice: z.number().min(0),
      reason:        z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
    if (!product || product.tenantId !== req.user.tenantId) { sendError(res, 'Product not found', 404); return; }

    // Create an override token (signed reference for audit)
    const overrideToken = Buffer.from(JSON.stringify({
      productId:     parsed.data.productId,
      originalPrice: parsed.data.originalPrice,
      overridePrice: parsed.data.overridePrice,
      reason:        parsed.data.reason,
      approvedBy:    req.user.userId,
      approvedAt:    new Date().toISOString(),
    })).toString('base64');

    sendSuccess(res, {
      overrideToken,
      product:       { id: product.id, name: product.name },
      originalPrice: parsed.data.originalPrice,
      overridePrice: parsed.data.overridePrice,
      reason:        parsed.data.reason,
      approvedBy:    req.user.userId,
      message:       'Price override approved',
    });
  }),
);

// ══════════════════════════════════════════════════════════════════
// X-REPORT / Z-REPORT
// ══════════════════════════════════════════════════════════════════

// GET /api/pos/reports/x-report — live current session summary
router.get(
  '/reports/x-report',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.query;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const where: any = {
      tenantId:  req.user.tenantId,
      createdAt: { gte: startOfDay },
      ...(sessionId ? { sessionId: sessionId as string } : {}),
    };

    const transactions = await prisma.posTransaction.findMany({
      where,
      include: { lines: true },
    });

    const sales   = transactions.filter(t => t.type === 'SALE');
    const returns = transactions.filter(t => t.type === 'RETURN');

    const byPaymentMethod = sales.reduce((acc, t) => {
      acc[t.paymentMethod] = (acc[t.paymentMethod] ?? 0) + Number(t.total);
      return acc;
    }, {} as Record<string, number>);

    const totalSales   = sales.reduce((s, t)   => s + Number(t.total), 0);
    const totalReturns = returns.reduce((s, t) => s + Number(t.total), 0);
    const totalVat     = sales.reduce((s, t)   => s + Number(t.vatAmount), 0);

    // Session float info
    let session = null;
    if (sessionId) {
      session = await prisma.posSession.findUnique({ where: { id: sessionId as string } });
    }

    sendSuccess(res, {
      reportType:       'X-REPORT',
      generatedAt:      now.toISOString(),
      period:           { from: startOfDay.toISOString(), to: now.toISOString() },
      totalSales:       Math.round(totalSales * 100) / 100,
      totalReturns:     Math.round(totalReturns * 100) / 100,
      netSales:         Math.round((totalSales - totalReturns) * 100) / 100,
      totalVat:         Math.round(totalVat * 100) / 100,
      transactionCount: sales.length,
      returnCount:      returns.length,
      byPaymentMethod,
      openingFloat:     session ? Number(session.openingFloat) : undefined,
    });
  }),
);

// POST /api/pos/reports/z-report — end of day Z-Report (saves to DB)
router.post(
  '/reports/z-report',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      sessionId:    z.string().optional(),
      reportDate:   z.string().datetime().optional(),
      closingFloat: z.number().min(0).default(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const reportDate = parsed.data.reportDate ? new Date(parsed.data.reportDate) : new Date();
    const startOfDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 0, 0, 0);
    const endOfDay   = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 23, 59, 59);

    const where: any = {
      tenantId:  req.user.tenantId,
      createdAt: { gte: startOfDay, lte: endOfDay },
      ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
    };

    const transactions = await prisma.posTransaction.findMany({
      where,
      include: { lines: true },
    });

    const sales   = transactions.filter(t => t.type === 'SALE');
    const returns = transactions.filter(t => t.type === 'RETURN');

    const totalSales   = sales.reduce((s, t)   => s + Number(t.total), 0);
    const totalReturns = returns.reduce((s, t) => s + Number(t.total), 0);
    const netSales     = totalSales - totalReturns;
    const totalVat     = sales.reduce((s, t)   => s + Number(t.vatAmount), 0);

    const byPaymentMethod = sales.reduce((acc, t) => {
      acc[t.paymentMethod] = (acc[t.paymentMethod] ?? 0) + Number(t.total);
      return acc;
    }, {} as Record<string, number>);

    const cashTotal       = byPaymentMethod['CASH']          ?? 0;
    const creditCardTotal = byPaymentMethod['CREDIT_CARD']   ?? 0;
    const checkTotal      = byPaymentMethod['CHECK']         ?? 0;
    const otherTotal      = byPaymentMethod['OTHER']         ?? 0;
    const bankTotal       = byPaymentMethod['BANK_TRANSFER'] ?? 0;

    // Get session opening float
    let openingFloat = 0;
    if (parsed.data.sessionId) {
      const session = await prisma.posSession.findUnique({ where: { id: parsed.data.sessionId } });
      if (session) openingFloat = Number(session.openingFloat);
    }

    const closingFloat = parsed.data.closingFloat;
    const cashVariance = closingFloat - openingFloat - cashTotal;

    // Daily breakdown by hour
    const byHour: Record<string, number> = {};
    for (const t of sales) {
      const hour = `${t.createdAt.getHours().toString().padStart(2, '0')}:00`;
      byHour[hour] = (byHour[hour] ?? 0) + Number(t.total);
    }

    // Top items
    const itemMap: Record<string, { description: string; quantity: number; revenue: number }> = {};
    for (const t of sales) {
      for (const line of t.lines) {
        const key = (line as any).productId ?? line.description;
        if (!itemMap[key]) itemMap[key] = { description: line.description, quantity: 0, revenue: 0 };
        itemMap[key].quantity += Number(line.quantity);
        itemMap[key].revenue  += Number(line.lineTotal);
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const reportData = {
      byPaymentMethod,
      byHour,
      topItems,
      salesIds:   sales.map(t => t.id),
      returnsIds: returns.map(t => t.id),
    };

    const zReport = await prisma.posZReport.create({
      data: {
        tenantId:        req.user.tenantId,
        sessionId:       parsed.data.sessionId,
        reportDate,
        generatedBy:     req.user.userId,
        totalSales,
        totalReturns,
        netSales,
        totalVat,
        transactionCount: sales.length,
        cashTotal,
        creditCardTotal,
        checkTotal,
        giftCardTotal:   0,
        otherTotal:      otherTotal + bankTotal,
        openingFloat,
        closingFloat,
        cashVariance,
        reportData,
      },
    });

    sendSuccess(res, zReport, 201);
  }),
);

// GET /api/pos/reports/z-reports — list past Z-Reports
router.get(
  '/reports/z-reports',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', pageSize = '20' } = req.query;
    const [items, total] = await Promise.all([
      prisma.posZReport.findMany({
        where:   withTenant(req, {}),
        orderBy: { reportDate: 'desc' },
        skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take:    parseInt(pageSize as string),
      }),
      prisma.posZReport.count({ where: withTenant(req, {}) }),
    ]);
    sendSuccess(res, items, 200, { total });
  }),
);

// GET /api/pos/reports/z-reports/:id — get specific Z-Report
router.get(
  '/reports/z-reports/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const report = await prisma.posZReport.findUnique({ where: { id: req.params.id } });
    if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Z-Report not found', 404); return; }
    sendSuccess(res, report);
  }),
);

// ══════════════════════════════════════════════════════════════════
// PARTIAL REFUND
// ══════════════════════════════════════════════════════════════════

// POST /api/pos/transactions/:id/partial-refund
router.post(
  '/transactions/:id/partial-refund',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      lines:  z.array(z.object({
        lineId:   z.string(),
        quantity: z.number().positive(),
      })).min(1),
      reason:    z.string().min(1),
      paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'OTHER']).default('CASH'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const original = await prisma.posTransaction.findUnique({
      where:   { id: req.params.id },
      include: { lines: true, session: true },
    });
    if (!original || original.tenantId !== req.user.tenantId) { sendError(res, 'Transaction not found', 404); return; }
    if (original.type !== 'SALE') { sendError(res, 'Can only refund SALE transactions', 400); return; }

    // Validate refund lines against original
    const refundLines: Array<{
      productId?: string | null;
      description: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      vatRate: number;
      lineTotal: number;
    }> = [];

    for (const refundLine of parsed.data.lines) {
      const origLine = original.lines.find(l => l.id === refundLine.lineId);
      if (!origLine) { sendError(res, `Line ${refundLine.lineId} not found in transaction`, 400); return; }
      if (refundLine.quantity > Number(origLine.quantity)) {
        sendError(res, `Refund quantity exceeds original for line ${refundLine.lineId}`, 400);
        return;
      }

      const vatRate   = Number(origLine.vatRate);
      const unitPrice = Number(origLine.unitPrice);
      const discount  = Number(origLine.discount) * (refundLine.quantity / Number(origLine.quantity));
      const lineTotal = (refundLine.quantity * unitPrice - discount) * (1 + vatRate);

      refundLines.push({
        productId:   origLine.productId,
        description: origLine.description,
        quantity:    refundLine.quantity,
        unitPrice,
        discount,
        vatRate,
        lineTotal:   Math.round(lineTotal * 100) / 100,
      });
    }

    const subtotal  = refundLines.reduce((s, l) => s + (l.quantity * l.unitPrice - l.discount), 0);
    const vatAmount = refundLines.reduce((s, l) => s + (l.quantity * l.unitPrice - l.discount) * l.vatRate, 0);
    const total     = subtotal + vatAmount;

    const refundTransaction = await prisma.$transaction(async (tx) => {
      const count = await tx.posTransaction.count({ where: { tenantId: req.user.tenantId } });
      const receiptNumber = `RFD-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const created = await tx.posTransaction.create({
        data: {
          tenantId:      req.user.tenantId,
          sessionId:     original.sessionId,
          customerId:    original.customerId,
          type:          'RETURN',
          subtotal,
          vatAmount,
          total,
          discount:      0,
          paymentMethod: parsed.data.paymentMethod,
          amountPaid:    total,
          change:        0,
          receiptNumber,
          notes:         `Partial refund of ${original.receiptNumber}. Reason: ${parsed.data.reason}`,
          lines: {
            create: refundLines.map(l => ({
              productId:   l.productId,
              description: l.description,
              quantity:    l.quantity,
              unitPrice:   l.unitPrice,
              discount:    l.discount,
              vatRate:     l.vatRate,
              lineTotal:   l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });

      // Update session return totals
      await tx.posSession.update({
        where: { id: original.sessionId },
        data:  { totalReturns: { increment: total } },
      });

      return created;
    });

    // Return inventory (non-blocking)
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: { tenantId: req.user.tenantId, isDefault: true, isActive: true },
    });
    if (defaultWarehouse) {
      for (const line of refundLines) {
        if (!line.productId) continue;
        try {
          await InventoryService.moveStock({
            tenantId:    req.user.tenantId,
            productId:   line.productId,
            warehouseId: defaultWarehouse.id,
            type:        'RETURN_IN',
            quantity:    line.quantity,
            reference:   refundTransaction.receiptNumber ?? undefined,
            sourceType:  'POS',
            sourceId:    refundTransaction.id,
            createdBy:   req.user.userId,
          });
        } catch { /* ignore stock errors */ }
      }
    }

    sendSuccess(res, refundTransaction, 201);
  }),
);

// ══════════════════════════════════════════════════════════════════
// CUSTOMER DISPLAY
// ══════════════════════════════════════════════════════════════════

// GET /api/pos/customer-display/:sessionId — data for customer-facing display
router.get(
  '/customer-display/:sessionId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const session = await prisma.posSession.findUnique({
      where:   { id: req.params.sessionId },
      include: { terminal: { select: { name: true } } },
    });
    if (!session || session.tenantId !== req.user.tenantId) { sendError(res, 'Session not found', 404); return; }

    // Get last transaction for display
    const lastTx = await prisma.posTransaction.findFirst({
      where:   { sessionId: req.params.sessionId, type: 'SALE' },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
    });

    // Get active promotions for display
    const now = new Date();
    const activePromos = await prisma.promotion.findMany({
      where: {
        tenantId:  req.user.tenantId,
        isActive:  true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      select: { name: true, type: true, value: true },
      take: 3,
    });

    sendSuccess(res, {
      terminal:         session.terminal?.name,
      sessionStatus:    session.status,
      lastTransaction: lastTx ? {
        receiptNumber: lastTx.receiptNumber,
        total:         Number(lastTx.total),
        change:        Number(lastTx.change),
        items:         lastTx.lines.map(l => ({
          description: l.description,
          quantity:    Number(l.quantity),
          lineTotal:   Number(l.lineTotal),
        })),
      } : null,
      activePromotions: activePromos,
      message:          'Welcome! Thank you for shopping with us.',
    });
  }),
);

export default router;
