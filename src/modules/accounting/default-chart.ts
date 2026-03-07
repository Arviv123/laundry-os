/**
 * ברירת מחדל של תרשים חשבונות ישראלי
 * נוצר אוטומטית עבור כל טנאנט חדש ברישום
 */

export type AccountSeed = {
  code: string; name: string; nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentCode?: string;
};

export const DEFAULT_CHART_OF_ACCOUNTS: AccountSeed[] = [
  // ── נכסים ─────────────────────────────────────────────────────────
  { code: '1000', name: 'נכסים שוטפים',         nameEn: 'Current Assets',             type: 'ASSET' },
  { code: '1100', name: 'קופה ומזומן',           nameEn: 'Cash & Petty Cash',          type: 'ASSET', parentCode: '1000' },
  { code: '1200', name: 'חשבון בנק',             nameEn: 'Bank Account',               type: 'ASSET', parentCode: '1000' },
  { code: '1210', name: 'בנק לאומי',             nameEn: 'Bank Leumi',                 type: 'ASSET', parentCode: '1200' },
  { code: '1220', name: 'בנק הפועלים',           nameEn: 'Bank Hapoalim',              type: 'ASSET', parentCode: '1200' },
  { code: '1300', name: 'לקוחות (חובות)',         nameEn: 'Accounts Receivable',        type: 'ASSET', parentCode: '1000' },
  { code: '1400', name: 'מלאי',                  nameEn: 'Inventory',                  type: 'ASSET', parentCode: '1000' },
  { code: '1500', name: 'מקדמות לספקים',          nameEn: 'Prepaid to Suppliers',       type: 'ASSET', parentCode: '1000' },
  { code: '1600', name: 'מע"מ תשומות',            nameEn: 'VAT Input',                  type: 'ASSET', parentCode: '1000' },
  { code: '2000', name: 'נכסים קבועים',           nameEn: 'Fixed Assets',               type: 'ASSET' },
  { code: '2100', name: 'ציוד',                  nameEn: 'Equipment',                  type: 'ASSET', parentCode: '2000' },
  { code: '2200', name: 'רכבים',                 nameEn: 'Vehicles',                   type: 'ASSET', parentCode: '2000' },
  { code: '2300', name: 'מחשבים ותוכנה',          nameEn: 'IT & Software',              type: 'ASSET', parentCode: '2000' },
  { code: '2900', name: 'פחת נצבר',              nameEn: 'Accumulated Depreciation',   type: 'ASSET', parentCode: '2000' },
  // ── התחייבויות ────────────────────────────────────────────────────
  { code: '3000', name: 'התחייבויות שוטפות',      nameEn: 'Current Liabilities',        type: 'LIABILITY' },
  { code: '3100', name: 'ספקים (זכאים)',           nameEn: 'Accounts Payable',           type: 'LIABILITY', parentCode: '3000' },
  { code: '3200', name: 'מע"מ לתשלום',            nameEn: 'VAT Payable',                type: 'LIABILITY', parentCode: '3000' },
  { code: '3300', name: 'ביטוח לאומי לתשלום',     nameEn: 'National Insurance Payable', type: 'LIABILITY', parentCode: '3000' },
  { code: '3400', name: 'ניכוי מס הכנסה מהמקור',  nameEn: 'Income Tax Withheld',        type: 'LIABILITY', parentCode: '3000' },
  { code: '3500', name: 'חובות שכר',              nameEn: 'Accrued Salaries',           type: 'LIABILITY', parentCode: '3000' },
  { code: '3600', name: 'מקדמות מלקוחות',          nameEn: 'Customer Advances',          type: 'LIABILITY', parentCode: '3000' },
  { code: '3700', name: 'פנסיה מעסיק לתשלום',     nameEn: 'Pension Payable',            type: 'LIABILITY', parentCode: '3000' },
  { code: '4000', name: 'התחייבויות לזמן ארוך',   nameEn: 'Long-term Liabilities',      type: 'LIABILITY' },
  { code: '4100', name: 'הלוואות לזמן ארוך',      nameEn: 'Long-term Loans',            type: 'LIABILITY', parentCode: '4000' },
  // ── הון עצמי ──────────────────────────────────────────────────────
  { code: '5000', name: 'הון עצמי',               nameEn: 'Equity',                     type: 'EQUITY' },
  { code: '5100', name: 'הון מניות',              nameEn: 'Share Capital',              type: 'EQUITY', parentCode: '5000' },
  { code: '5200', name: 'עודפים',                 nameEn: 'Retained Earnings',          type: 'EQUITY', parentCode: '5000' },
  { code: '5300', name: 'רווח השנה',              nameEn: 'Current Year Profit',        type: 'EQUITY', parentCode: '5000' },
  // ── הכנסות ────────────────────────────────────────────────────────
  { code: '6000', name: 'הכנסות',                 nameEn: 'Revenue',                    type: 'REVENUE' },
  { code: '6100', name: 'הכנסות ממכירות',          nameEn: 'Sales Revenue',              type: 'REVENUE', parentCode: '6000' },
  { code: '6200', name: 'הכנסות שירותים',          nameEn: 'Service Revenue',            type: 'REVENUE', parentCode: '6000' },
  { code: '6300', name: 'הכנסות אחרות',            nameEn: 'Other Revenue',              type: 'REVENUE', parentCode: '6000' },
  { code: '6400', name: 'הכנסות ריבית',            nameEn: 'Interest Income',            type: 'REVENUE', parentCode: '6000' },
  // ── הוצאות ────────────────────────────────────────────────────────
  { code: '7000', name: 'הוצאות',                 nameEn: 'Expenses',                   type: 'EXPENSE' },
  { code: '7100', name: 'הוצאות שכר',              nameEn: 'Salary Expenses',            type: 'EXPENSE', parentCode: '7000' },
  { code: '7110', name: 'שכר ברוטו',              nameEn: 'Gross Salary',               type: 'EXPENSE', parentCode: '7100' },
  { code: '7120', name: 'פנסיה מעסיק',             nameEn: 'Employer Pension',           type: 'EXPENSE', parentCode: '7100' },
  { code: '7130', name: 'ביטוח לאומי מעסיק',       nameEn: 'Employer NI',               type: 'EXPENSE', parentCode: '7100' },
  { code: '7140', name: 'פיצויים',                nameEn: 'Severance Pay Provision',    type: 'EXPENSE', parentCode: '7100' },
  { code: '7200', name: 'הוצאות שכירות',           nameEn: 'Rent Expenses',              type: 'EXPENSE', parentCode: '7000' },
  { code: '7300', name: 'הוצאות רכב',              nameEn: 'Vehicle Expenses',           type: 'EXPENSE', parentCode: '7000' },
  { code: '7400', name: 'הוצאות טלפון ותקשורת',   nameEn: 'Communication Expenses',     type: 'EXPENSE', parentCode: '7000' },
  { code: '7500', name: 'הוצאות פרסום ושיווק',     nameEn: 'Marketing Expenses',         type: 'EXPENSE', parentCode: '7000' },
  { code: '7600', name: 'הוצאות ספקים',            nameEn: 'Supplier Expenses',          type: 'EXPENSE', parentCode: '7000' },
  { code: '7700', name: 'הוצאות ריבית',            nameEn: 'Interest Expenses',          type: 'EXPENSE', parentCode: '7000' },
  { code: '7800', name: 'פחת',                    nameEn: 'Depreciation',               type: 'EXPENSE', parentCode: '7000' },
  { code: '7900', name: 'הוצאות אחרות',            nameEn: 'Other Expenses',             type: 'EXPENSE', parentCode: '7000' },
];

export const ISRAELI_HOLIDAYS_2026 = [
  { name: 'ראש השנה (א)',     date: new Date('2026-09-11'), isNational: true },
  { name: 'ראש השנה (ב)',     date: new Date('2026-09-12'), isNational: true },
  { name: 'יום כיפור',       date: new Date('2026-09-20'), isNational: true },
  { name: 'סוכות',           date: new Date('2026-09-25'), isNational: true },
  { name: 'שמחת תורה',       date: new Date('2026-10-02'), isNational: true },
  { name: 'פסח (א)',          date: new Date('2026-04-02'), isNational: true },
  { name: 'פסח (ז)',          date: new Date('2026-04-08'), isNational: true },
  { name: 'יום העצמאות',     date: new Date('2026-04-22'), isNational: true },
  { name: 'שבועות',          date: new Date('2026-05-22'), isNational: true },
  { name: "תשעה באב",        date: new Date('2026-07-23'), isNational: false },
];

/**
 * מאתחל את כל ברירות מחדל לטנאנט חדש:
 * - תרשים חשבונות (46 חשבונות)
 * - חגים ישראליים 2026
 * - סוגי חופשה (חופשה שנתית, מחלה, מילואים)
 */
export async function initTenantDefaults(
  tenantId: string,
  tx: Parameters<Parameters<import('@prisma/client').PrismaClient['$transaction']>[0]>[0]
): Promise<void> {
  const accountMap = new Map<string, string>(); // code → id

  // Pass 1: parent accounts (no parentCode)
  for (const acc of DEFAULT_CHART_OF_ACCOUNTS.filter(a => !a.parentCode)) {
    const r = await (tx as any).account.create({
      data: { tenantId, code: acc.code, name: acc.name, nameEn: acc.nameEn, type: acc.type },
    });
    accountMap.set(acc.code, r.id);
  }

  // Pass 2: child accounts
  for (const acc of DEFAULT_CHART_OF_ACCOUNTS.filter(a => !!a.parentCode)) {
    const r = await (tx as any).account.create({
      data: {
        tenantId, code: acc.code, name: acc.name, nameEn: acc.nameEn, type: acc.type,
        parentId: accountMap.get(acc.parentCode!),
      },
    });
    accountMap.set(acc.code, r.id);
  }

  // Israeli holidays 2026
  for (const h of ISRAELI_HOLIDAYS_2026) {
    await (tx as any).holidayCalendar.create({
      data: { tenantId, name: h.name, date: h.date, isNational: h.isNational },
    });
  }

  // Default leave types
  for (const lt of [
    { name: 'חופשה שנתית', daysPerYear: 14, isPaid: true,  requiresApproval: true },
    { name: 'מחלה',        daysPerYear: 18, isPaid: true,  requiresApproval: false },
    { name: 'מילואים',     daysPerYear: 36, isPaid: true,  requiresApproval: false },
    { name: 'אבל',         daysPerYear:  7, isPaid: true,  requiresApproval: true },
    { name: 'לידה',        daysPerYear: 84, isPaid: true,  requiresApproval: true },
  ]) {
    await (tx as any).leaveType.create({ data: { tenantId, ...lt } });
  }
}
