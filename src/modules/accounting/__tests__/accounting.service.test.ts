/**
 * Accounting Service Unit Tests
 * Tests double-entry validation logic (pure functions — no DB required).
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror validation logic from accounting.service.ts ───────────

interface JournalEntry {
  debitAccountId:  string;
  creditAccountId: string;
  amount:          number;
  description?:    string;
}

function validateDoubleEntry(lines: JournalEntry[]): void {
  if (!lines || lines.length === 0) {
    throw new Error('Transaction must have at least one journal line');
  }

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  for (const line of lines) {
    if (line.amount <= 0) {
      throw new Error(`Amount must be positive: ${line.amount}`);
    }
    if (line.debitAccountId === line.creditAccountId) {
      throw new Error('Debit and Credit accounts cannot be the same');
    }
  }

  if (totalAmount <= 0) {
    throw new Error('Total transaction amount must be positive');
  }
}

describe('Double-Entry Bookkeeping Validation', () => {

  it('valid single journal line passes validation', () => {
    expect(() =>
      validateDoubleEntry([{
        debitAccountId:  'acc-1300', // AR
        creditAccountId: 'acc-5100', // Revenue
        amount:          1_000,
      }])
    ).not.toThrow();
  });

  it('valid multi-line journal passes validation', () => {
    expect(() =>
      validateDoubleEntry([
        { debitAccountId: 'acc-1300', creditAccountId: 'acc-5100', amount: 1_000 },
        { debitAccountId: 'acc-1300', creditAccountId: 'acc-3200', amount: 180 },
      ])
    ).not.toThrow();
  });

  it('empty lines array throws error', () => {
    expect(() => validateDoubleEntry([])).toThrow('at least one journal line');
  });

  it('amount of zero throws error', () => {
    expect(() =>
      validateDoubleEntry([{
        debitAccountId: 'acc-A', creditAccountId: 'acc-B', amount: 0,
      }])
    ).toThrow('Amount must be positive');
  });

  it('negative amount throws error', () => {
    expect(() =>
      validateDoubleEntry([{
        debitAccountId: 'acc-A', creditAccountId: 'acc-B', amount: -500,
      }])
    ).toThrow('Amount must be positive');
  });

  it('same debit and credit account throws error', () => {
    expect(() =>
      validateDoubleEntry([{
        debitAccountId: 'same-acc', creditAccountId: 'same-acc', amount: 1_000,
      }])
    ).toThrow('Debit and Credit accounts cannot be the same');
  });

  it('different accounts pass account identity check', () => {
    expect(() =>
      validateDoubleEntry([{
        debitAccountId: 'acc-A', creditAccountId: 'acc-B', amount: 1_000,
      }])
    ).not.toThrow();
  });
});

// ─── VAT Calculation Logic ────────────────────────────────────────

describe('VAT Calculations (מע"מ)', () => {
  const VAT_RATE = 0.18; // 18% Israeli VAT

  function calcVat(subtotal: number, rate = VAT_RATE) {
    const vatAmount = subtotal * rate;
    const total     = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
  }

  it('18% VAT on 1,000 ₪ = 180 ₪', () => {
    const { vatAmount } = calcVat(1_000);
    expect(vatAmount).toBeCloseTo(180, 2);
  });

  it('total = subtotal × 1.18', () => {
    const { total } = calcVat(5_000);
    expect(total).toBeCloseTo(5_000 * 1.18, 2);
  });

  it('zero subtotal → zero VAT', () => {
    const { vatAmount, total } = calcVat(0);
    expect(vatAmount).toBe(0);
    expect(total).toBe(0);
  });

  it('VAT-exempt (rate 0) passes correctly', () => {
    const { vatAmount, total } = calcVat(1_000, 0);
    expect(vatAmount).toBe(0);
    expect(total).toBe(1_000);
  });

  it('invoice line totals sum correctly', () => {
    const lines = [
      { qty: 2, unitPrice: 100 },
      { qty: 5, unitPrice: 50 },
      { qty: 1, unitPrice: 200 },
    ];

    const subtotal  = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const vatAmount = subtotal * VAT_RATE;
    const total     = subtotal + vatAmount;

    // 200 + 250 + 200 = 650 subtotal
    expect(subtotal).toBe(650);
    expect(vatAmount).toBeCloseTo(117, 2);
    expect(total).toBeCloseTo(767, 2);
  });
});

// ─── Accounts Payable Aging Buckets ──────────────────────────────

describe('AP Aging Buckets (גיל חובות)', () => {
  function getAgingBucket(dueDate: Date, today: Date): string {
    const daysPast = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
    if (daysPast <= 0)        return 'current';
    if (daysPast <= 30)       return 'days30';
    if (daysPast <= 60)       return 'days60';
    if (daysPast <= 90)       return 'days90';
    return 'over90';
  }

  const today = new Date('2026-03-01');

  it('due today → current', () => {
    expect(getAgingBucket(new Date('2026-03-01'), today)).toBe('current');
  });

  it('due tomorrow → current (not yet past)', () => {
    expect(getAgingBucket(new Date('2026-03-02'), today)).toBe('current');
  });

  it('1 day past due → days30', () => {
    expect(getAgingBucket(new Date('2026-02-28'), today)).toBe('days30');
  });

  it('30 days past due → days30', () => {
    expect(getAgingBucket(new Date('2026-01-30'), today)).toBe('days30');
  });

  it('31 days past due → days60', () => {
    expect(getAgingBucket(new Date('2026-01-29'), today)).toBe('days60');
  });

  it('60 days past due → days60', () => {
    expect(getAgingBucket(new Date('2025-12-31'), today)).toBe('days60');
  });

  it('61 days past due → days90', () => {
    expect(getAgingBucket(new Date('2025-12-30'), today)).toBe('days90');
  });

  it('91 days past due → over90', () => {
    expect(getAgingBucket(new Date('2025-11-30'), today)).toBe('over90');
  });
});
