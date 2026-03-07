import { UserRole } from '@prisma/client';
import { Request } from 'express';

// ─── Authenticated Request ───────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: {
    userId:     string;
    employeeId?: string; // set for mobile-only (PIN) sessions
    tenantId:   string;
    role:       UserRole;
    email:      string;
  };
}

// ─── Platform Admin Request ──────────────────────────────────────
export interface PlatformAdminRequest extends Request {
  platformAdmin: {
    adminId: string;
    email:   string;
    name:    string;
  };
}

// ─── API Response Wrapper ────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

// ─── Pagination ──────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ─── Payroll Calculation Types ───────────────────────────────────
export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface PayslipCalculation {
  // ── Income components ──────────────────────────────────────────
  baseSalary:        number;   // שכר יסוד
  overtimePay125:    number;   // שע"נ 125% (2 שעות ראשונות)
  overtimePay150:    number;   // שע"נ 150% (שבת/חג/מעל 2 שעות)
  travelAllowance:   number;   // דמי נסיעה — פטור ממס הכנסה
  recuperationPay:   number;   // דמי הבראה חודשיים (1/12 מהשנתי)
  bonusAmount:       number;   // בונוס / תשלומים מיוחדים
  carBenefit:        number;   // שווי רכב צמוד (2.48% ממחירון / 12)

  grossSalary:       number;   // ברוטו כולל (בסיס + שעות נוספות + בונוס + הבראה + רכב)
  grossForNI:        number;   // בסיס לחישוב ב.ל. (כולל נסיעות + רכב)
  taxableIncome:     number;   // הכנסה חייבת במס (כולל עודף קרן השתלמות מעל תקרה)

  // ── Employee deductions ────────────────────────────────────────
  incomeTax:                  number;  // מס הכנסה
  taxCreditsAmount:           number;  // זיכוי מס (ערך נקודות זיכוי)
  nationalInsuranceEmployee:  number;  // ביטוח לאומי עובד
  healthInsuranceEmployee:    number;  // ביטוח בריאות (מס בריאות)
  pensionEmployee:            number;  // פנסיה עובד
  trainingFundEmployee:       number;  // קרן השתלמות — ניכוי מעובד
  totalDeductions:            number;  // סה"כ ניכויים
  netSalary:                  number;  // שכר נטו לתשלום

  // ── Employer costs ─────────────────────────────────────────────
  pensionEmployer:            number;  // פנסיה מעסיק
  severancePay:               number;  // פיצויים
  nationalInsuranceEmployer:  number;  // ביטוח לאומי מעסיק
  trainingFundEmployer:       number;  // קרן השתלמות — הפרשת מעסיק
  totalEmployerCost:          number;  // עלות מעסיק כוללת

  // ── Legal checks ───────────────────────────────────────────────
  minimumWageOk:   boolean;  // האם שכר מעל מינימום חוקי?
  minimumWage:     number;   // שכר מינימום 2026

  // ── Accruals (informational) ───────────────────────────────────
  vacationAccruedDays:  number;  // ימי חופשה שנצברו החודש
  sickLeaveAccruedDays: number;  // ימי מחלה שנצברו = תמיד 1.5

  // ── Pro-rata (partial month) ───────────────────────────────────
  isPartialMonth:      boolean;   // האם חודש חלקי?
  effectiveBaseSalary: number;    // שכר יסוד אחרי יחסי
  partialMonthDays?:   number;
  workDaysInMonth?:    number;

  // ── Sick leave deduction ───────────────────────────────────────
  sickLeaveDeduction:  number;    // ניכוי ימי מחלה (₪) — 0/50/100%
  sickDaysUsed:        number;    // ימי מחלה בפועל

  // ── Reporting fields (for Form 126 / payroll reports) ─────────
  miluimDays:      number;  // ימי מילואים
  sickDays:        number;  // ימי מחלה לדיווח
  unpaidLeaveDays: number;  // ימי חופשה ללא תשלום

  // ── Breakdown detail ───────────────────────────────────────────
  taxBracketBreakdown: Array<{
    min: number;
    max: number | null;
    rate: number;
    taxableAmount: number;
    taxAmount: number;
  }>;
}

// ─── Double-Entry Types ──────────────────────────────────────────
export interface JournalEntry {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description?: string;
}

export interface CreateTransactionInput {
  tenantId: string;
  date: Date;
  reference: string;
  description: string;
  sourceType: string;
  sourceId?: string;
  lines: JournalEntry[];
  createdBy: string;
}
