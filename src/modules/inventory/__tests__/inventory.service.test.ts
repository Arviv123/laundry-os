/**
 * Inventory Service Unit Tests
 * Tests stock calculation logic (pure functions — no DB required).
 */

import { describe, it, expect } from 'vitest';

// ─── Stock Level Calculation Logic ───────────────────────────────

describe('Stock Level Calculations', () => {

  function isLowStock(quantity: number, reorderPoint: number | null): boolean {
    if (reorderPoint === null) return false;
    return quantity <= reorderPoint;
  }

  function availableStock(quantity: number, reserved: number): number {
    return Math.max(quantity - reserved, 0);
  }

  it('quantity > reorderPoint → not low stock', () => {
    expect(isLowStock(100, 20)).toBe(false);
  });

  it('quantity = reorderPoint → low stock (trigger reorder)', () => {
    expect(isLowStock(20, 20)).toBe(true);
  });

  it('quantity < reorderPoint → low stock', () => {
    expect(isLowStock(5, 20)).toBe(true);
  });

  it('null reorderPoint → never low stock', () => {
    expect(isLowStock(0, null)).toBe(false);
  });

  it('available stock = quantity − reserved', () => {
    expect(availableStock(100, 30)).toBe(70);
  });

  it('available stock never goes negative', () => {
    expect(availableStock(10, 50)).toBe(0); // over-reserved situation
  });

  it('zero reserved → full quantity available', () => {
    expect(availableStock(200, 0)).toBe(200);
  });
});

// ─── Stock Movement Delta ─────────────────────────────────────────

describe('Stock Movement Delta', () => {
  type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN_IN' | 'RETURN_OUT';

  function movementDelta(type: MovementType, quantity: number): number {
    const INBOUND_TYPES: MovementType[] = ['IN', 'RETURN_IN'];
    const OUTBOUND_TYPES: MovementType[] = ['OUT', 'RETURN_OUT'];
    if (INBOUND_TYPES.includes(type))  return +quantity;
    if (OUTBOUND_TYPES.includes(type)) return -quantity;
    return 0; // TRANSFER and ADJUSTMENT handled separately
  }

  it('IN movement adds to stock', () => {
    expect(movementDelta('IN', 50)).toBe(50);
  });

  it('OUT movement subtracts from stock', () => {
    expect(movementDelta('OUT', 30)).toBe(-30);
  });

  it('RETURN_IN (customer return) adds to stock', () => {
    expect(movementDelta('RETURN_IN', 5)).toBe(5);
  });

  it('RETURN_OUT (vendor return) subtracts from stock', () => {
    expect(movementDelta('RETURN_OUT', 10)).toBe(-10);
  });

  it('TRANSFER has zero direct delta (handled separately)', () => {
    expect(movementDelta('TRANSFER', 20)).toBe(0);
  });

  it('ADJUSTMENT has zero direct delta (handled separately)', () => {
    expect(movementDelta('ADJUSTMENT', 100)).toBe(0);
  });
});

// ─── Stock Valuation (Weighted Average Cost) ─────────────────────

describe('Stock Valuation (ערך מלאי)', () => {
  interface StockItem { quantity: number; costPrice: number }

  function calcStockValue(items: StockItem[]): { totalUnits: number; totalValue: number; weightedAvgCost: number } {
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    const totalValue = items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
    return {
      totalUnits,
      totalValue,
      weightedAvgCost: totalUnits > 0 ? totalValue / totalUnits : 0,
    };
  }

  it('single product: value = quantity × cost', () => {
    const result = calcStockValue([{ quantity: 100, costPrice: 50 }]);
    expect(result.totalValue).toBe(5_000);
    expect(result.weightedAvgCost).toBe(50);
  });

  it('multiple products: total value sums correctly', () => {
    const result = calcStockValue([
      { quantity: 100, costPrice: 50 },  // 5,000
      { quantity: 200, costPrice: 25 },  // 5,000
      { quantity: 50,  costPrice: 100 }, // 5,000
    ]);
    expect(result.totalValue).toBe(15_000);
    expect(result.totalUnits).toBe(350);
  });

  it('weighted average cost: (Σ qty × cost) / Σ qty', () => {
    const result = calcStockValue([
      { quantity: 100, costPrice: 10 }, // 1,000
      { quantity: 100, costPrice: 20 }, // 2,000
    ]);
    // avg = 3,000 / 200 = 15
    expect(result.weightedAvgCost).toBe(15);
  });

  it('zero inventory → zero weighted average cost', () => {
    const result = calcStockValue([{ quantity: 0, costPrice: 50 }]);
    expect(result.weightedAvgCost).toBe(0);
    expect(result.totalValue).toBe(0);
  });

  it('empty inventory → zeros', () => {
    const result = calcStockValue([]);
    expect(result.totalUnits).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.weightedAvgCost).toBe(0);
  });
});

// ─── Purchase Order Receive Logic ─────────────────────────────────

describe('Purchase Order — Receive Logic', () => {
  type POStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

  function calcPOStatus(lines: Array<{ quantity: number; receivedQty: number }>): POStatus {
    const totalOrdered  = lines.reduce((s, l) => s + l.quantity, 0);
    const totalReceived = lines.reduce((s, l) => s + l.receivedQty, 0);

    if (totalReceived === 0)              return 'SENT';
    if (totalReceived >= totalOrdered)    return 'RECEIVED';
    return 'PARTIALLY_RECEIVED';
  }

  it('nothing received → SENT', () => {
    const status = calcPOStatus([
      { quantity: 10, receivedQty: 0 },
      { quantity: 5,  receivedQty: 0 },
    ]);
    expect(status).toBe('SENT');
  });

  it('all received → RECEIVED', () => {
    const status = calcPOStatus([
      { quantity: 10, receivedQty: 10 },
      { quantity: 5,  receivedQty: 5 },
    ]);
    expect(status).toBe('RECEIVED');
  });

  it('partial receive → PARTIALLY_RECEIVED', () => {
    const status = calcPOStatus([
      { quantity: 10, receivedQty: 6 },
      { quantity: 5,  receivedQty: 0 },
    ]);
    expect(status).toBe('PARTIALLY_RECEIVED');
  });

  it('over-received treated as fully received', () => {
    // Edge case: received more than ordered
    const status = calcPOStatus([
      { quantity: 10, receivedQty: 12 },
    ]);
    expect(status).toBe('RECEIVED');
  });
});
