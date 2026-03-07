import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Helpers ───────────────────────────────────────────────────────────────

async function recalcOrderTotals(orderId: string): Promise<void> {
  const items = await prisma.posOrderItem.findMany({
    where: { orderId, status: { not: 'CANCELLED' } },
  });

  let subtotal = 0;
  let vatAmount = 0;
  let discountAmount = 0;

  for (const item of items) {
    const qty = Number(item.quantity);
    const price = Number(item.unitPrice);
    const disc = Number(item.discount);
    const vat = Number(item.vatRate);
    const lineBase = qty * price - disc;
    subtotal += lineBase;
    discountAmount += disc;
    vatAmount += lineBase * vat;
  }

  const total = subtotal + vatAmount;

  await prisma.posOrder.update({
    where: { id: orderId },
    data: {
      subtotal,
      vatAmount,
      discountAmount,
      total,
    },
  });
}

async function generateOrderNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.posOrder.count({
    where: { tenantId },
  });
  const seq = String(count + 1).padStart(4, '0');
  return `ORD-${year}-${seq}`;
}

// ─── Floors ────────────────────────────────────────────────────────────────

// GET /pos/floors — list all floors
router.get('/floors', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const floors = await prisma.posFloor.findMany({
    where: withTenant(req, { isActive: true }),
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { tables: true } } },
  });
  sendSuccess(res, floors);
}));

// POST /pos/floors — create a floor (ADMIN+)
router.post('/floors', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:      z.string().min(1),
    sortOrder: z.number().int().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const floor = await prisma.posFloor.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, floor, 201);
}));

// PUT /pos/floors/:id — update a floor (ADMIN+)
router.put('/floors/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:      z.string().min(1).optional(),
    sortOrder: z.number().int().optional(),
    isActive:  z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const floor = await prisma.posFloor.updateMany({
    where: withTenant(req, { id: req.params.id }),
    data:  parsed.data,
  });
  sendSuccess(res, floor);
}));

// DELETE /pos/floors/:id — delete a floor only if no tables (ADMIN+)
router.delete('/floors/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tableCount = await prisma.posTable.count({
    where: { floorId: req.params.id, tenantId: req.user.tenantId },
  });
  if (tableCount > 0) {
    sendError(res, 'Cannot delete floor with existing tables', 400);
    return;
  }
  await prisma.posFloor.deleteMany({
    where: withTenant(req, { id: req.params.id }),
  });
  sendSuccess(res, { deleted: true });
}));

// ─── Tables ────────────────────────────────────────────────────────────────

// GET /pos/tables — list tables (optional ?floorId, ?status)
router.get('/tables', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { floorId, status } = req.query as Record<string, string>;
  const where: Record<string, any> = withTenant(req, { isActive: true });
  if (floorId) where.floorId = floorId;
  if (status)  where.status  = status;

  const tables = await prisma.posTable.findMany({
    where,
    include: {
      floor:        { select: { id: true, name: true } },
      currentOrder: { select: { id: true, orderNumber: true, type: true, guestsCount: true } },
    },
    orderBy: [{ floor: { sortOrder: 'asc' } }, { name: 'asc' }],
  });
  sendSuccess(res, tables);
}));

// POST /pos/tables — create a table (ADMIN+)
router.post('/tables', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:     z.string().min(1),
    floorId:  z.string().cuid().optional(),
    capacity: z.number().int().positive().default(4),
    posX:     z.number().int().default(0),
    posY:     z.number().int().default(0),
    shape:    z.enum(['rect', 'round']).default('rect'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const table = await prisma.posTable.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, table, 201);
}));

// PUT /pos/tables/:id — update a table (ADMIN+)
router.put('/tables/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:     z.string().min(1).optional(),
    floorId:  z.string().cuid().nullable().optional(),
    capacity: z.number().int().positive().optional(),
    posX:     z.number().int().optional(),
    posY:     z.number().int().optional(),
    shape:    z.enum(['rect', 'round']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  await prisma.posTable.updateMany({
    where: withTenant(req, { id: req.params.id }),
    data:  parsed.data,
  });
  sendSuccess(res, { updated: true });
}));

// DELETE /pos/tables/:id — deactivate a table (ADMIN+)
router.delete('/tables/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await prisma.posTable.updateMany({
    where: withTenant(req, { id: req.params.id }),
    data:  { isActive: false },
  });
  sendSuccess(res, { deactivated: true });
}));

// POST /pos/tables/:id/status — update table status
router.post('/tables/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'BLOCKED']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  await prisma.posTable.updateMany({
    where: withTenant(req, { id: req.params.id }),
    data:  { status: parsed.data.status },
  });
  sendSuccess(res, { updated: true });
}));

// GET /pos/floor-map — all floors with tables and current status
router.get('/floor-map', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const floors = await prisma.posFloor.findMany({
    where: withTenant(req, { isActive: true }),
    orderBy: { sortOrder: 'asc' },
    include: {
      tables: {
        where: { isActive: true },
        include: {
          currentOrder: {
            select: {
              id: true, orderNumber: true, type: true,
              guestsCount: true, createdAt: true, total: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
  });
  sendSuccess(res, floors);
}));

// ─── Orders ────────────────────────────────────────────────────────────────

// POST /pos/orders — create a new order
router.post('/orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    type:            z.enum(['DINE_IN', 'TAKEOUT', 'DELIVERY', 'DRIVE_THROUGH']).default('DINE_IN'),
    tableId:         z.string().cuid().optional(),
    sessionId:       z.string().cuid().optional(),
    customerId:      z.string().cuid().optional(),
    customerName:    z.string().optional(),
    customerPhone:   z.string().optional(),
    guestsCount:     z.number().int().positive().optional(),
    deliveryAddress: z.record(z.any()).optional(),
    deliveryNotes:   z.string().optional(),
    deliveryFee:     z.number().nonnegative().optional(),
    notes:           z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const orderNumber = await generateOrderNumber(req.user.tenantId);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.posOrder.create({
      data: {
        tenantId:    req.user.tenantId,
        orderNumber,
        openedBy:    req.user.userId,
        ...parsed.data,
      },
    });

    // Occupy the table if provided
    if (parsed.data.tableId) {
      await tx.posTable.updateMany({
        where: { id: parsed.data.tableId, tenantId: req.user.tenantId },
        data:  { status: 'OCCUPIED', currentOrderId: created.id },
      });
    }

    return created;
  });

  sendSuccess(res, order, 201);
}));

// GET /pos/orders — list orders (?type, ?status, ?tableId, ?from, ?to, ?includeItems)
router.get('/orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, status, tableId, from, to, includeItems } = req.query as Record<string, string>;
  const where: Record<string, any> = withTenant(req, {});
  if (type)    where.type    = type;
  if (status)  where.status  = status;
  if (tableId) where.tableId = tableId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }

  const orders = await prisma.posOrder.findMany({
    where,
    include: {
      table:    { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      ...(includeItems === '1'
        ? {
            items: {
              where:   { status: { not: 'CANCELLED' } },
              include: { product: { select: { id: true, name: true } } },
              orderBy: { sortOrder: 'asc' },
            },
          }
        : { _count: { select: { items: true } } }),
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, orders);
}));

// GET /pos/orders/:id — get order with items
router.get('/orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
    include: {
      table:    { select: { id: true, name: true, floor: { select: { name: true } } } },
      customer: { select: { id: true, name: true, phone: true } },
      items: {
        where:   { status: { not: 'CANCELLED' } },
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }
  sendSuccess(res, order);
}));

// PUT /pos/orders/:id — update order meta
router.put('/orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    notes:          z.string().optional(),
    deliveryAddress: z.record(z.any()).optional(),
    deliveryNotes:  z.string().optional(),
    estimatedReady: z.string().datetime().optional(),
    customerName:   z.string().optional(),
    customerPhone:  z.string().optional(),
    guestsCount:    z.number().int().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  await prisma.posOrder.updateMany({
    where: withTenant(req, { id: req.params.id, status: { not: 'PAID' } }),
    data:  parsed.data,
  });
  sendSuccess(res, { updated: true });
}));

// POST /pos/orders/:id/cancel — cancel an order
router.post('/orders/:id/cancel', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }
  if (order.status === 'PAID') { sendError(res, 'Cannot cancel a paid order', 400); return; }

  await prisma.$transaction(async (tx) => {
    await tx.posOrderItem.updateMany({
      where: { orderId: order.id },
      data:  { status: 'CANCELLED' },
    });
    await tx.posOrder.update({
      where: { id: order.id },
      data:  { status: 'CANCELLED', closedAt: new Date(), closedBy: req.user.userId },
    });
    // Free the table
    if (order.tableId) {
      await tx.posTable.updateMany({
        where: { id: order.tableId, tenantId: req.user.tenantId },
        data:  { status: 'AVAILABLE', currentOrderId: null },
      });
    }
  });

  sendSuccess(res, { cancelled: true });
}));

// ─── Order Items ───────────────────────────────────────────────────────────

// POST /pos/orders/:id/items — add item to order
router.post('/orders/:id/items', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    productId:    z.string().cuid().optional(),
    description:  z.string().min(1),
    quantity:     z.number().positive(),
    unitPrice:    z.number().nonnegative(),
    vatRate:      z.number().min(0).max(1).default(0.18),
    discount:     z.number().nonnegative().default(0),
    notes:        z.string().optional(),
    printStation: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }
  if (['PAID', 'CANCELLED', 'VOID'].includes(order.status)) {
    sendError(res, 'Cannot add items to a closed order', 400);
    return;
  }

  const { quantity, unitPrice, discount, vatRate } = parsed.data;
  const lineBase  = quantity * unitPrice - discount;
  const lineTotal = lineBase + lineBase * vatRate;

  const sortOrder = await prisma.posOrderItem.count({ where: { orderId: order.id } });

  const item = await prisma.posOrderItem.create({
    data: {
      orderId: order.id,
      ...parsed.data,
      lineTotal,
      sortOrder,
    },
  });

  await recalcOrderTotals(order.id);
  sendSuccess(res, item, 201);
}));

// PUT /pos/orders/:id/items/:itemId — update an item
router.put('/orders/:id/items/:itemId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    quantity: z.number().positive().optional(),
    notes:    z.string().optional(),
    discount: z.number().nonnegative().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const item = await prisma.posOrderItem.findFirst({
    where: { id: req.params.itemId, orderId: req.params.id },
  });
  if (!item) { sendError(res, 'Item not found', 404); return; }

  const newQty      = parsed.data.quantity  ?? Number(item.quantity);
  const newDiscount = parsed.data.discount  ?? Number(item.discount);
  const lineBase    = newQty * Number(item.unitPrice) - newDiscount;
  const lineTotal   = lineBase + lineBase * Number(item.vatRate);

  await prisma.posOrderItem.update({
    where: { id: item.id },
    data:  { ...parsed.data, lineTotal },
  });

  await recalcOrderTotals(req.params.id);
  sendSuccess(res, { updated: true });
}));

// DELETE /pos/orders/:id/items/:itemId — cancel an item
router.delete('/orders/:id/items/:itemId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await prisma.posOrderItem.updateMany({
    where: { id: req.params.itemId, orderId: req.params.id },
    data:  { status: 'CANCELLED' },
  });
  await recalcOrderTotals(req.params.id);
  sendSuccess(res, { cancelled: true });
}));

// ─── Kitchen Actions ───────────────────────────────────────────────────────

// POST /pos/orders/:id/send-to-kitchen — send pending items to kitchen
router.post('/orders/:id/send-to-kitchen', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.posOrderItem.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data:  { status: 'SENT', kitchenSentAt: now },
    });
    await tx.posOrder.update({
      where: { id: order.id },
      data:  { status: 'SENT_TO_KITCHEN' },
    });
  });

  sendSuccess(res, { sent: true });
}));

// POST /pos/orders/:id/merge/:targetOrderId — merge order into target
router.post('/orders/:id/merge/:targetOrderId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const [source, target] = await Promise.all([
    prisma.posOrder.findFirst({ where: withTenant(req, { id: req.params.id }) }),
    prisma.posOrder.findFirst({ where: withTenant(req, { id: req.params.targetOrderId }) }),
  ]);
  if (!source || !target) { sendError(res, 'Order not found', 404); return; }

  await prisma.$transaction(async (tx) => {
    // Re-parent all items from source to target
    await tx.posOrderItem.updateMany({
      where: { orderId: source.id },
      data:  { orderId: target.id },
    });
    // Cancel source order and free its table
    await tx.posOrder.update({
      where: { id: source.id },
      data:  { status: 'CANCELLED', closedAt: new Date(), closedBy: req.user.userId },
    });
    if (source.tableId) {
      await tx.posTable.updateMany({
        where: { id: source.tableId, tenantId: req.user.tenantId },
        data:  { status: 'AVAILABLE', currentOrderId: null },
      });
    }
  });

  await recalcOrderTotals(target.id);
  sendSuccess(res, { merged: true });
}));

// POST /pos/orders/:id/split — split items into a new order
router.post('/orders/:id/split', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    items: z.array(z.object({
      itemId:   z.string().cuid(),
      quantity: z.number().positive(),
    })).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
    include: { items: true },
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }

  const newOrderNumber = await generateOrderNumber(req.user.tenantId);

  const newOrder = await prisma.$transaction(async (tx) => {
    const created = await tx.posOrder.create({
      data: {
        tenantId:    req.user.tenantId,
        orderNumber: newOrderNumber,
        type:        order.type,
        sessionId:   order.sessionId,
        openedBy:    req.user.userId,
      },
    });

    for (const split of parsed.data.items) {
      const src = order.items.find((i) => i.id === split.itemId);
      if (!src) continue;

      if (split.quantity >= Number(src.quantity)) {
        // Move entire item
        await tx.posOrderItem.update({
          where: { id: src.id },
          data:  { orderId: created.id },
        });
      } else {
        // Reduce quantity on original, create new item with split qty
        const remainingQty = Number(src.quantity) - split.quantity;
        const splitLineBase  = split.quantity * Number(src.unitPrice) - (Number(src.discount) * (split.quantity / Number(src.quantity)));
        const splitLineTotal = splitLineBase + splitLineBase * Number(src.vatRate);
        const remLineBase    = remainingQty * Number(src.unitPrice) - (Number(src.discount) * (remainingQty / Number(src.quantity)));
        const remLineTotal   = remLineBase + remLineBase * Number(src.vatRate);

        await tx.posOrderItem.update({
          where: { id: src.id },
          data:  { quantity: remainingQty, lineTotal: remLineTotal },
        });
        await tx.posOrderItem.create({
          data: {
            orderId:      created.id,
            productId:    src.productId,
            description:  src.description,
            quantity:     split.quantity,
            unitPrice:    src.unitPrice,
            vatRate:      src.vatRate,
            discount:     0,
            lineTotal:    splitLineTotal,
            notes:        src.notes,
            printStation: src.printStation,
            status:       src.status,
          },
        });
      }
    }

    return created;
  });

  await Promise.all([
    recalcOrderTotals(order.id),
    recalcOrderTotals(newOrder.id),
  ]);

  sendSuccess(res, { newOrderId: newOrder.id, newOrderNumber: newOrder.orderNumber });
}));

// POST /pos/orders/:id/move-table — move order to a different table
router.post('/orders/:id/move-table', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    tableId: z.string().cuid(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }

  await prisma.$transaction(async (tx) => {
    // Free old table
    if (order.tableId) {
      await tx.posTable.updateMany({
        where: { id: order.tableId, tenantId: req.user.tenantId },
        data:  { status: 'AVAILABLE', currentOrderId: null },
      });
    }
    // Occupy new table
    await tx.posTable.updateMany({
      where: { id: parsed.data.tableId, tenantId: req.user.tenantId },
      data:  { status: 'OCCUPIED', currentOrderId: order.id },
    });
    // Update order
    await tx.posOrder.update({
      where: { id: order.id },
      data:  { tableId: parsed.data.tableId },
    });
  });

  sendSuccess(res, { moved: true });
}));

// POST /pos/orders/:id/checkout — mark order as paid
router.post('/orders/:id/checkout', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    posTransactionId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const order = await prisma.posOrder.findFirst({
    where: withTenant(req, { id: req.params.id }),
  });
  if (!order) { sendError(res, 'Order not found', 404); return; }
  if (order.status === 'PAID') { sendError(res, 'Order is already paid', 400); return; }

  await prisma.$transaction(async (tx) => {
    await tx.posOrder.update({
      where: { id: order.id },
      data: {
        status:          'PAID',
        closedAt:        new Date(),
        closedBy:        req.user.userId,
        posTransactionId: parsed.data.posTransactionId,
      },
    });
    // Free the table
    if (order.tableId) {
      await tx.posTable.updateMany({
        where: { id: order.tableId, tenantId: req.user.tenantId },
        data:  { status: 'AVAILABLE', currentOrderId: null },
      });
    }
  });

  sendSuccess(res, { paid: true });
}));

// ─── Kitchen Display System ────────────────────────────────────────────────

// GET /pos/kitchen/:stationCode — get orders for this kitchen station
router.get('/kitchen/:stationCode', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { stationCode } = req.params;

  const orders = await prisma.posOrder.findMany({
    where: {
      tenantId: req.user.tenantId,
      status:   { in: ['SENT_TO_KITCHEN', 'PARTIALLY_READY'] },
      items: {
        some: {
          status:       { in: ['SENT', 'PREPARING'] },
          printStation: stationCode.toUpperCase(),
        },
      },
    },
    include: {
      table: { select: { id: true, name: true } },
      items: {
        where: {
          status:       { in: ['SENT', 'PREPARING'] },
          printStation: stationCode.toUpperCase(),
        },
        include: { product: { select: { id: true, name: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  sendSuccess(res, orders);
}));

// POST /pos/kitchen/items/:itemId/status — update kitchen item status
router.post('/kitchen/items/:itemId/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    status: z.enum(['PENDING', 'SENT', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const item = await prisma.posOrderItem.findFirst({
    where: {
      id:    req.params.itemId,
      order: { tenantId: req.user.tenantId },
    },
  });
  if (!item) { sendError(res, 'Item not found', 404); return; }

  const updateData: Record<string, any> = { status: parsed.data.status };
  if (parsed.data.status === 'READY') {
    updateData.kitchenReadyAt = new Date();
  }

  await prisma.posOrderItem.update({
    where: { id: item.id },
    data:  updateData,
  });

  // Check if all non-cancelled items in the order are READY → update order status
  const allItems = await prisma.posOrderItem.findMany({
    where: { orderId: item.orderId, status: { not: 'CANCELLED' } },
  });
  const allReady = allItems.length > 0 && allItems.every((i) => i.status === 'READY');
  const someReady = allItems.some((i) => i.status === 'READY');

  if (allReady) {
    await prisma.posOrder.update({
      where: { id: item.orderId },
      data:  { status: 'READY' },
    });
  } else if (someReady) {
    await prisma.posOrder.update({
      where: { id: item.orderId },
      data:  { status: 'PARTIALLY_READY' },
    });
  }

  sendSuccess(res, { updated: true });
}));

// POST /pos/kitchen/stations — create a kitchen station (ADMIN+)
router.post('/kitchen/stations', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:        z.string().min(1),
    stationCode: z.string().min(1).toUpperCase(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const station = await prisma.kitchenDisplayStation.create({
    data: {
      tenantId:    req.user.tenantId,
      name:        parsed.data.name,
      stationCode: parsed.data.stationCode,
    },
  });
  sendSuccess(res, station, 201);
}));

// GET /pos/kitchen/stations — list kitchen stations
router.get('/kitchen/stations', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stations = await prisma.kitchenDisplayStation.findMany({
    where: withTenant(req, { isActive: true }),
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, stations);
}));

// DELETE /pos/kitchen/stations/:id — deactivate a station (ADMIN+)
router.delete('/kitchen/stations/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await prisma.kitchenDisplayStation.updateMany({
    where: withTenant(req, { id: req.params.id }),
    data:  { isActive: false },
  });
  sendSuccess(res, { deactivated: true });
}));

export default router;
