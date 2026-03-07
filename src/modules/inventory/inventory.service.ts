import { StockMovementType } from '@prisma/client';
import { prisma } from '../../config/database';

/**
 * INVENTORY SERVICE
 * Manages stock levels, movements and product catalog.
 * Every stock movement updates StockLevel atomically.
 */

// ─── Move Stock ───────────────────────────────────────────────────

export interface StockMoveInput {
  tenantId:    string;
  productId:   string;
  warehouseId: string;
  type:        StockMovementType;
  quantity:    number;          // always positive
  unitCost?:   number;
  reference?:  string;
  sourceType?: string;
  sourceId?:   string;
  notes?:      string;
  createdBy:   string;
}

export async function moveStock(input: StockMoveInput) {
  const { tenantId, productId, warehouseId, type, quantity } = input;

  if (quantity <= 0) throw new Error('Quantity must be positive');

  // Verify product belongs to tenant
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.tenantId !== tenantId) throw new Error('Product not found');
  if (product.isService) throw new Error('Cannot move stock for service products');

  const isInbound = ['IN', 'RETURN_IN', 'TRANSFER'].includes(type);
  // For TRANSFER & OUT, check sufficient stock
  if (!isInbound || type === 'TRANSFER') {
    const level = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    const available = Number(level?.quantity ?? 0) - Number(level?.reservedQuantity ?? 0);
    if (type === 'OUT' || type === 'RETURN_OUT') {
      if (available < quantity) {
        throw new Error(`Insufficient stock: available ${available}, requested ${quantity}`);
      }
    }
  }

  const delta = isInbound ? quantity : -quantity;

  return prisma.$transaction(async (tx) => {
    // Upsert stock level
    await tx.stockLevel.upsert({
      where:  { productId_warehouseId: { productId, warehouseId } },
      create: { tenantId, productId, warehouseId, quantity: delta },
      update: { quantity: { increment: delta } },
    });

    // Record movement
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        productId,
        warehouseId,
        type,
        quantity,
        unitCost:   input.unitCost,
        totalCost:  input.unitCost ? input.unitCost * quantity : undefined,
        reference:  input.reference,
        sourceType: input.sourceType,
        sourceId:   input.sourceId,
        notes:      input.notes,
        createdBy:  input.createdBy,
      },
    });

    return movement;
  });
}

// ─── Get Stock Levels ─────────────────────────────────────────────

export async function getStockLevels(
  tenantId: string,
  filters: { warehouseId?: string; productId?: string; lowStock?: boolean } = {}
) {
  const levels = await prisma.stockLevel.findMany({
    where: {
      tenantId,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId   ? { productId:   filters.productId }   : {}),
    },
    include: {
      product:   { select: { sku: true, name: true, unitOfMeasure: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  });

  if (filters.lowStock) {
    return levels.filter(l =>
      l.reorderPoint !== null &&
      Number(l.quantity) <= Number(l.reorderPoint)
    );
  }

  return levels;
}

// ─── Stock Valuation (FIFO simplified - avg cost) ─────────────────

export async function getStockValuation(tenantId: string, warehouseId?: string) {
  const levels = await prisma.stockLevel.findMany({
    where: {
      tenantId,
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: { product: true },
  });

  // Get avg unit cost from last IN movements
  const valuations = await Promise.all(levels.map(async (level) => {
    const lastIn = await prisma.stockMovement.aggregate({
      where: {
        tenantId,
        productId: level.productId,
        type: 'IN',
        unitCost: { not: null },
      },
      _avg: { unitCost: true },
    });

    const avgCost = Number(lastIn._avg.unitCost ?? 0);
    const qty     = Number(level.quantity);

    return {
      productId:   level.productId,
      productName: level.product.name,
      sku:         level.product.sku,
      quantity:    qty,
      avgUnitCost: avgCost,
      totalValue:  Math.round(qty * avgCost * 100) / 100,
    };
  }));

  const grandTotal = valuations.reduce((s, v) => s + v.totalValue, 0);
  return { valuations, grandTotal: Math.round(grandTotal * 100) / 100 };
}

// ─── Stock Adjustment ─────────────────────────────────────────────

export async function adjustStock(
  tenantId: string,
  productId: string,
  warehouseId: string,
  newQuantity: number,
  reason: string,
  userId: string
) {
  const level = await prisma.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });

  const currentQty = Number(level?.quantity ?? 0);
  const diff       = newQuantity - currentQty;

  if (diff === 0) return { message: 'No adjustment needed', diff: 0 };

  return moveStock({
    tenantId,
    productId,
    warehouseId,
    type:      'ADJUSTMENT',
    quantity:  Math.abs(diff),
    notes:     reason,
    createdBy: userId,
  });
}
