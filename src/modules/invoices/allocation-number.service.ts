/**
 * Allocation Number Service — מספר הקצאה מרשות המיסים
 *
 * The Israeli Tax Authority requires an allocation number for B2B invoices
 * issued to VAT-registered businesses when the invoice amount exceeds the
 * configured threshold (was 25,000 NIS in 2024, to be reduced over time).
 *
 * API docs: https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/api/v1/
 */

import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

// Threshold: invoices above this amount to VAT-registered businesses require allocation number
const ALLOCATION_THRESHOLD_NIS = 25_000;

// ─── Tax Authority API Types ──────────────────────────────────────────────────

interface AllocationRequest {
  AccountingDocumentNumber: string;   // Invoice number
  AccountingDocumentDate:   string;   // YYYY-MM-DD
  BranchID:                 string;   // Vendor business ID (ח.פ)
  CustomerVATId:            string;   // Customer ח.פ (blank if individual)
  TotalDocumentAmount:      number;   // Total including VAT
  VATAmount:                number;   // VAT amount only
  DocumentLines:            { Description: string; Quantity: number; UnitPrice: number; TotalLine: number }[];
}

interface AllocationResponse {
  AllocationNumber: string;
  Status:           string;
  ErrorCode?:       string;
  ErrorMessage?:    string;
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

export function requiresAllocationNumber(totalNIS: number): boolean {
  return totalNIS >= ALLOCATION_THRESHOLD_NIS;
}

export async function requestAllocationNumber(invoiceId: string, tenantId: string): Promise<{
  allocationNumber: string | null;
  status: string;
  error?: string;
}> {
  // Fetch invoice with lines and customer
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: invoiceId },
    include: {
      customer: { select: { name: true, businessId: true } },
      lines:    true,
    },
  });

  if (!invoice) throw new Error('חשבונית לא נמצאה');

  const total = Number(invoice.total);
  if (!requiresAllocationNumber(total)) {
    // Below threshold — mark as not required
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { allocationStatus: 'NOT_REQUIRED', allocationRequestedAt: new Date() },
    });
    return { allocationNumber: null, status: 'NOT_REQUIRED' };
  }

  // Get tenant settings for Tax Authority API key
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true, businessNumber: true },
  });

  const settings = (tenant?.settings as any) ?? {};
  const apiToken = settings.taxAuthorityToken as string | undefined;
  const vendorBusinessId = (settings.businessId as string) ?? tenant?.businessNumber ?? '';

  if (!apiToken) {
    throw new Error('לא הוגדר טוקן API של רשות המיסים. עדכן בהגדרות → רשות המיסים');
  }

  const apiUrl = process.env.TAX_AUTHORITY_API_URL
    ?? 'https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/api/v1/';

  // Build request body
  const body: AllocationRequest = {
    AccountingDocumentNumber: invoice.number,
    AccountingDocumentDate:   invoice.date.toISOString().split('T')[0],
    BranchID:                 vendorBusinessId,
    CustomerVATId:            invoice.customer.businessId ?? '',
    TotalDocumentAmount:      total,
    VATAmount:                Number(invoice.vatAmount),
    DocumentLines: invoice.lines.map(l => ({
      Description: l.description,
      Quantity:    Number(l.quantity),
      UnitPrice:   Number(l.unitPrice),
      TotalLine:   Number(l.lineTotal),
    })),
  };

  try {
    // Mark as pending
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { allocationStatus: 'PENDING', allocationRequestedAt: new Date() },
    });

    logger.info('Requesting allocation number', { invoiceId, invoiceNumber: invoice.number });

    const response = await fetch(`${apiUrl}AllocationNumber`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let result: AllocationResponse;

    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`תשובה לא תקינה מרשות המיסים: ${responseText.slice(0, 200)}`);
    }

    if (!response.ok || result.ErrorCode) {
      const errMsg = result.ErrorMessage ?? `שגיאה ${response.status}`;
      logger.error('Tax authority allocation error', { invoiceId, error: errMsg, code: result.ErrorCode });

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { allocationStatus: 'REJECTED' },
      });

      return { allocationNumber: null, status: 'REJECTED', error: errMsg };
    }

    const allocationNumber = result.AllocationNumber;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { allocationNumber, allocationStatus: 'APPROVED' },
    });

    logger.info('Allocation number received', { invoiceId, allocationNumber });
    return { allocationNumber, status: 'APPROVED' };

  } catch (err: any) {
    // On network error — mark as error
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { allocationStatus: 'REJECTED' },
    }).catch(() => {});

    throw err;
  }
}

/**
 * Simulate allocation for testing (when no API token is configured).
 * Returns a fake allocation number for development/demo purposes.
 */
export async function simulateAllocationNumber(invoiceId: string, tenantId: string): Promise<string> {
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { tenantId, id: invoiceId } });
  const fakeNum = `SIM${Date.now().toString().slice(-8)}`;
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { allocationNumber: fakeNum, allocationStatus: 'APPROVED', allocationRequestedAt: new Date() },
  });
  logger.warn('Simulated allocation number (no real API)', { invoiceId, fakeNum });
  return fakeNum;
}
