import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();

// ─── Public RFID event ingestion (authenticated by reader apiKey, NOT JWT) ────
// This endpoint is defined before the JWT middleware so it stays public.
router.post(
  '/events',
  asyncHandler(async (req: Request, res: Response) => {
    const apiKey = req.headers['x-rfid-api-key'] as string | undefined;
    if (!apiKey) {
      sendError(res, 'Missing x-rfid-api-key header', 401);
      return;
    }

    const reader = await prisma.rfidReader.findFirst({
      where: { apiKey, isActive: true },
    });
    if (!reader) {
      sendError(res, 'Invalid or inactive reader API key', 401);
      return;
    }

    const schema = z.object({
      tagEpc:    z.string().min(1),
      rssi:      z.number().optional(),
      direction: z.enum(['IN', 'OUT', 'INTERNAL']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400);
      return;
    }

    const { tagEpc, rssi, direction } = parsed.data;

    // Look up tag by EPC within same tenant
    const tag = await prisma.rfidTag.findFirst({
      where: { tenantId: reader.tenantId, epc: tagEpc },
    });

    // Create the event
    const event = await prisma.rfidEvent.create({
      data: {
        tenantId:  reader.tenantId,
        readerId:  reader.id,
        tagId:     tag?.id ?? null,
        tagEpc,
        rssi:      rssi ?? null,
        direction: (direction as any) ?? 'INTERNAL',
        timestamp: new Date(),
        processed: false,
      },
    });

    // Update tag's last seen info if the tag exists
    if (tag) {
      await prisma.rfidTag.update({
        where: { id: tag.id },
        data:  {
          lastSeenAt:   new Date(),
          lastReaderId: reader.id,
        },
      });
    }

    // Also update reader lastPingAt
    await prisma.rfidReader.update({
      where: { id: reader.id },
      data:  { lastPingAt: new Date() },
    });

    sendSuccess(res, event, 201);
  }),
);

// ─── All routes below require JWT + tenant isolation ──────────────────────────
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── RFID Readers ─────────────────────────────────────────────────────────────

router.get(
  '/readers',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const readers = await prisma.rfidReader.findMany({
      where:   { tenantId: req.user.tenantId },
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, readers);
  }),
);

router.post(
  '/readers',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:       z.string().min(1),
      location:   z.string().optional(),
      readerType: z.string().optional(),
      ipAddress:  z.string().optional(),
      isActive:   z.boolean().default(true),
      metadata:   z.record(z.any()).default({}),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    const apiKey = crypto.randomBytes(32).toString('hex');

    const reader = await prisma.rfidReader.create({
      data: {
        ...parsed.data,
        tenantId: req.user.tenantId,
        apiKey,
      },
    });
    sendSuccess(res, reader, 201);
  }),
);

router.patch(
  '/readers/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:       z.string().min(1).optional(),
      location:   z.string().optional(),
      readerType: z.string().optional(),
      ipAddress:  z.string().optional(),
      isActive:   z.boolean().optional(),
      metadata:   z.record(z.any()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    const existing = await prisma.rfidReader.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Reader not found', 404); return;
    }

    const updated = await prisma.rfidReader.update({
      where: { id: req.params.id },
      data:  parsed.data,
    });
    sendSuccess(res, updated);
  }),
);

router.delete(
  '/readers/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.rfidReader.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Reader not found', 404); return;
    }
    await prisma.rfidReader.delete({ where: { id: req.params.id } });
    sendSuccess(res, { message: 'Reader deleted' });
  }),
);

// ─── RFID Tags ────────────────────────────────────────────────────────────────

router.get(
  '/tags',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type, status, search } = req.query;

    const tags = await prisma.rfidTag.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(type   ? { tagType: type as any }     : {}),
        ...(status ? { status:  status as any }   : {}),
        ...(search ? { epc: { contains: search as string, mode: 'insensitive' as any } } : {}),
      },
      include: {
        product:  { select: { name: true, sku: true } },
        employee: { select: { firstName: true, lastName: true } },
        asset:    { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, tags);
  }),
);

router.post(
  '/tags',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      epc:        z.string().min(1),
      tagType:    z.enum(['PRODUCT', 'ASSET', 'EMPLOYEE']),
      productId:  z.string().cuid().optional(),
      employeeId: z.string().cuid().optional(),
      assetId:    z.string().cuid().optional(),
      location:   z.string().optional(),
      status:     z.enum(['ACTIVE', 'LOST', 'DECOMMISSIONED']).default('ACTIVE'),
      metadata:   z.record(z.any()).default({}),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    try {
      const tag = await prisma.rfidTag.create({
        data: { ...parsed.data, tenantId: req.user.tenantId },
      });
      sendSuccess(res, tag, 201);
    } catch (err: any) {
      if (err.code === 'P2002') {
        sendError(res, `EPC ${parsed.data.epc} is already registered`, 409);
      } else {
        throw err;
      }
    }
  }),
);

router.patch(
  '/tags/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      epc:        z.string().min(1).optional(),
      tagType:    z.enum(['PRODUCT', 'ASSET', 'EMPLOYEE']).optional(),
      productId:  z.string().cuid().nullable().optional(),
      employeeId: z.string().cuid().nullable().optional(),
      assetId:    z.string().cuid().nullable().optional(),
      location:   z.string().optional(),
      status:     z.enum(['ACTIVE', 'LOST', 'DECOMMISSIONED']).optional(),
      metadata:   z.record(z.any()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    const existing = await prisma.rfidTag.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Tag not found', 404); return;
    }

    const updated = await prisma.rfidTag.update({
      where: { id: req.params.id },
      data:  parsed.data,
    });
    sendSuccess(res, updated);
  }),
);

router.delete(
  '/tags/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.rfidTag.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Tag not found', 404); return;
    }
    // Soft-decommission instead of hard delete
    const updated = await prisma.rfidTag.update({
      where: { id: req.params.id },
      data:  { status: 'DECOMMISSIONED' },
    });
    sendSuccess(res, updated);
  }),
);

// ─── RFID Events (JWT-authenticated) ─────────────────────────────────────────

router.get(
  '/events',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to, readerId, processed } = req.query;

    const events = await prisma.rfidEvent.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(readerId  ? { readerId: readerId as string } : {}),
        ...(processed !== undefined ? { processed: processed === 'true' } : {}),
        ...(from || to
          ? {
              timestamp: {
                ...(from ? { gte: new Date(from as string) } : {}),
                ...(to   ? { lte: new Date(to   as string) } : {}),
              },
            }
          : {}),
      },
      include: {
        tag:    { select: { epc: true, tagType: true } },
        reader: { select: { name: true, location: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    sendSuccess(res, events);
  }),
);

router.post(
  '/events/process',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await prisma.rfidEvent.updateMany({
      where: { tenantId: req.user.tenantId, processed: false },
      data:  { processed: true },
    });
    sendSuccess(res, { processedCount: result.count });
  }),
);

// ─── RFID Assets ──────────────────────────────────────────────────────────────

router.get(
  '/assets',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { search, status, category } = req.query;

    const assets = await prisma.rfidAsset.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(status   ? { status:   status   as any } : {}),
        ...(category ? { category: category as string } : {}),
        ...(search
          ? {
              OR: [
                { name:        { contains: search as string, mode: 'insensitive' as any } },
                { description: { contains: search as string, mode: 'insensitive' as any } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, assets);
  }),
);

router.post(
  '/assets',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:           z.string().min(1),
      description:    z.string().optional(),
      category:       z.string().optional(),
      location:       z.string().optional(),
      assignedToId:   z.string().cuid().optional(),
      value:          z.number().min(0).optional(),
      purchasedAt:    z.string().datetime().optional(),
      warrantyUntil:  z.string().datetime().optional(),
      status:         z.enum(['ACTIVE', 'DISPOSED', 'UNDER_MAINTENANCE']).default('ACTIVE'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    const asset = await prisma.rfidAsset.create({
      data: {
        ...parsed.data,
        purchasedAt:   parsed.data.purchasedAt   ? new Date(parsed.data.purchasedAt)   : undefined,
        warrantyUntil: parsed.data.warrantyUntil ? new Date(parsed.data.warrantyUntil) : undefined,
        tenantId: req.user.tenantId,
      },
    });
    sendSuccess(res, asset, 201);
  }),
);

router.patch(
  '/assets/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:           z.string().min(1).optional(),
      description:    z.string().optional(),
      category:       z.string().optional(),
      location:       z.string().optional(),
      assignedToId:   z.string().cuid().nullable().optional(),
      value:          z.number().min(0).optional(),
      purchasedAt:    z.string().datetime().optional(),
      warrantyUntil:  z.string().datetime().optional(),
      status:         z.enum(['ACTIVE', 'DISPOSED', 'UNDER_MAINTENANCE']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

    const existing = await prisma.rfidAsset.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Asset not found', 404); return;
    }

    const updated = await prisma.rfidAsset.update({
      where: { id: req.params.id },
      data:  {
        ...parsed.data,
        purchasedAt:   parsed.data.purchasedAt   ? new Date(parsed.data.purchasedAt)   : undefined,
        warrantyUntil: parsed.data.warrantyUntil ? new Date(parsed.data.warrantyUntil) : undefined,
      },
    });
    sendSuccess(res, updated);
  }),
);

router.delete(
  '/assets/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.rfidAsset.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Asset not found', 404); return;
    }
    const updated = await prisma.rfidAsset.update({
      where: { id: req.params.id },
      data:  { status: 'DISPOSED' },
    });
    sendSuccess(res, updated);
  }),
);

// ─── RFID Inventory ───────────────────────────────────────────────────────────

router.get(
  '/inventory',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;

    // Group ACTIVE PRODUCT tags by productId and count them
    const tagGroups = await prisma.rfidTag.groupBy({
      by:     ['productId'],
      where:  { tenantId, tagType: 'PRODUCT', status: 'ACTIVE', productId: { not: null } },
      _count: { id: true },
    });

    // Fetch product names
    const productIds = tagGroups
      .map((g) => g.productId)
      .filter((id): id is string => id !== null);

    const products = await prisma.product.findMany({
      where:  { id: { in: productIds }, tenantId },
      select: { id: true, name: true, sku: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const inventory = tagGroups.map((g) => ({
      productId:   g.productId,
      product:     g.productId ? productMap.get(g.productId) ?? null : null,
      activeTagCount: g._count.id,
    }));

    sendSuccess(res, inventory);
  }),
);

router.post(
  '/inventory/sync',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;

    // Find the default warehouse
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });
    if (!defaultWarehouse) {
      sendError(res, 'No default warehouse configured', 400);
      return;
    }

    // Count active PRODUCT tags grouped by productId
    const tagGroups = await prisma.rfidTag.groupBy({
      by:     ['productId'],
      where:  { tenantId, tagType: 'PRODUCT', status: 'ACTIVE', productId: { not: null } },
      _count: { id: true },
    });

    const productIds = tagGroups
      .map((g) => g.productId)
      .filter((id): id is string => id !== null);

    // Fetch current stock levels for these products in the default warehouse
    const stockLevels = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        warehouseId: defaultWarehouse.id,
        productId:   { in: productIds },
      },
      include: { product: { select: { name: true, sku: true } } },
    });
    const stockMap = new Map(stockLevels.map((s) => [s.productId, s]));

    const discrepancies: {
      productId:   string;
      productName: string;
      tagCount:    number;
      stockQty:    number;
      adjustment:  number;
    }[] = [];

    for (const group of tagGroups) {
      if (!group.productId) continue;
      const tagCount  = group._count.id;
      const stockItem = stockMap.get(group.productId);
      const stockQty  = Number(stockItem?.quantity ?? 0);

      if (tagCount !== stockQty) {
        const adjustment = tagCount - stockQty;

        // Create adjustment movement
        await prisma.stockMovement.create({
          data: {
            tenantId:    tenantId,
            productId:   group.productId,
            warehouseId: defaultWarehouse.id,
            type:        'ADJUSTMENT',
            quantity:    Math.abs(adjustment),
            reference:   'RFID_SYNC',
            notes:       `RFID sync: tag count=${tagCount}, previous stock=${stockQty}`,
            createdBy:   req.user.userId,
          },
        });

        // Upsert stock level to match tag count
        await prisma.stockLevel.upsert({
          where: {
            productId_warehouseId: {
              productId:   group.productId,
              warehouseId: defaultWarehouse.id,
            },
          },
          update: { quantity: tagCount },
          create: {
            tenantId:    tenantId,
            productId:   group.productId,
            warehouseId: defaultWarehouse.id,
            quantity:    tagCount,
          },
        });

        discrepancies.push({
          productId:   group.productId,
          productName: stockItem?.product?.name ?? group.productId,
          tagCount,
          stockQty,
          adjustment,
        });
      }
    }

    sendSuccess(res, { discrepancies, synced: discrepancies.length });
  }),
);

// ─── RFID Dashboard ───────────────────────────────────────────────────────────

router.get(
  '/dashboard',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId  = req.user.tenantId;
    const now       = new Date();
    const ago24h    = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      tagsByStatus,
      readerStats,
      recentEvents,
      lostTags,
      unregisteredEpcsRaw,
    ] = await Promise.all([
      // Tag counts by status
      prisma.rfidTag.groupBy({
        by:     ['status'],
        where:  { tenantId },
        _count: { id: true },
      }),

      // Reader active/inactive counts
      prisma.rfidReader.groupBy({
        by:     ['isActive'],
        where:  { tenantId },
        _count: { id: true },
      }),

      // Last 10 events with tag EPC and reader name
      prisma.rfidEvent.findMany({
        where:   { tenantId },
        include: {
          tag:    { select: { epc: true } },
          reader: { select: { name: true } },
        },
        orderBy: { timestamp: 'desc' },
        take:    10,
      }),

      // Active tags not seen in last 24 hours
      prisma.rfidTag.findMany({
        where: {
          tenantId,
          status:      'ACTIVE',
          lastSeenAt:  { lt: ago24h },
        },
        select: {
          id:          true,
          epc:         true,
          tagType:     true,
          location:    true,
          lastSeenAt:  true,
          product:     { select: { name: true } },
          employee:    { select: { firstName: true, lastName: true } },
          asset:       { select: { name: true } },
        },
      }),

      // Events in last 24h where tagId is null (unregistered EPCs)
      prisma.rfidEvent.findMany({
        where: {
          tenantId,
          tagId:     null,
          timestamp: { gte: ago24h },
        },
        select:  { tagEpc: true },
        distinct: ['tagEpc'],
      }),
    ]);

    const totalTags = tagsByStatus.reduce(
      (acc, g) => ({ ...acc, [g.status]: g._count.id }),
      {} as Record<string, number>,
    );

    const totalReaders = readerStats.reduce(
      (acc, g) => {
        acc[g.isActive ? 'active' : 'inactive'] = g._count.id;
        return acc;
      },
      { active: 0, inactive: 0 },
    );

    sendSuccess(res, {
      totalTags,
      totalReaders,
      recentEvents,
      lostTags,
      unregisteredEpcs: unregisteredEpcsRaw.map((e) => e.tagEpc),
    });
  }),
);

export default router;
