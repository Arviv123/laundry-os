/**
 * invoice.pdf.service.ts
 *
 * Generates a professional A4 PDF for Israeli tax invoices / credit notes.
 * Uses PDFKit. Returns a Promise<Buffer>.
 *
 * Hebrew text note: PDFKit does not natively support RTL / Hebrew reshaping.
 * The text is written left-to-right with Hebrew strings — the visual result
 * is correct for most PDF viewers that handle Unicode bidirectional text.
 * For full RTL rendering, a custom font with Harfbuzz shaping would be needed.
 */

import PDFDocument from 'pdfkit';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceLineForPDF {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  productId?: string;
}

export interface InvoiceForPDF {
  id: string;
  number: string;
  invoiceType: string; // 'TAX_INVOICE' | 'CREDIT_NOTE' | 'RECEIPT' | 'COMMERCIAL'
  date: Date;
  dueDate?: Date | null;
  status: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  discountAmount?: number | null;
  notes?: string | null;
  lines: InvoiceLineForPDF[];
}

export interface TenantForPDF {
  name: string;
  vatNumber?: string | null;
  businessNumber?: string | null;
  address?: unknown; // Json field: { street, city, zip, country }
  phone?: string | null;
  email?: string | null;
}

export interface CustomerForPDF {
  name: string;
  email?: string | null;
  phone?: string | null;
  businessId?: string | null; // ח.פ. / ת.ז. — used as VAT number for B2B
  address?: unknown; // Json field
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatILS(amount: number): string {
  return `₪${amount.toFixed(2)}`;
}

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function statusHebrew(status: string): string {
  const map: Record<string, string> = {
    DRAFT:     'טיוטה',
    SENT:      'נשלח',
    PAID:      'שולם',
    OVERDUE:   'באיחור',
    CANCELLED: 'בוטל',
  };
  return map[status] ?? status;
}

function invoiceTypeHebrew(type: string): string {
  const map: Record<string, string> = {
    TAX_INVOICE: 'חשבונית מס',
    CREDIT_NOTE: 'הודעת זיכוי',
    RECEIPT:     'קבלה',
    COMMERCIAL:  'חשבונית מסחרית',
  };
  return map[type] ?? 'חשבונית';
}

function parseAddress(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const a = address as Record<string, unknown>;
  const parts: string[] = [];
  if (a['street'])  parts.push(String(a['street']));
  if (a['city'])    parts.push(String(a['city']));
  if (a['zip'])     parts.push(String(a['zip']));
  if (a['country']) parts.push(String(a['country']));
  return parts.join(', ');
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const PAGE_WIDTH  = 595.28; // A4 points
const MARGIN      = 50;
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2;

// Colours
const BLUE        = '#1a56db';
const DARK        = '#1a202c';
const GREY        = '#718096';
const LIGHT_GREY  = '#e2e8f0';
const TABLE_HDR   = '#2d3748';

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateInvoicePDF(
  invoice: InvoiceForPDF,
  tenant: TenantForPDF,
  customer: CustomerForPDF
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: {
        Title:    `${invoiceTypeHebrew(invoice.invoiceType)} ${invoice.number}`,
        Author:   tenant.name,
        Subject:  `${invoiceTypeHebrew(invoice.invoiceType)} ${invoice.number} - ${customer.name}`,
        Creator:  'חשבשבת ERP',
      }});

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // ── Write content ────────────────────────────────────────────────────────
      drawInvoice(doc, invoice, tenant, customer);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Drawing functions ────────────────────────────────────────────────────────

function drawInvoice(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceForPDF,
  tenant: TenantForPDF,
  customer: CustomerForPDF
): void {
  const titleText = invoiceTypeHebrew(invoice.invoiceType);
  const isCreditNote = invoice.invoiceType === 'CREDIT_NOTE';

  let y = MARGIN;

  // ── 1. Header bar (blue background) ──────────────────────────────────────
  doc.rect(0, 0, PAGE_WIDTH, 100).fill(BLUE);

  // Company name (top-left, white)
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(tenant.name, MARGIN, 20, { width: CONTENT_W * 0.55, align: 'left' });

  if (tenant.vatNumber) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`עוסק מורשה מס' ${tenant.vatNumber}`, MARGIN, 44, { width: CONTENT_W * 0.55, align: 'left' });
  } else if (tenant.businessNumber) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`ח.פ. ${tenant.businessNumber}`, MARGIN, 44, { width: CONTENT_W * 0.55, align: 'left' });
  }

  const tenantAddress = parseAddress(tenant.address);
  if (tenantAddress) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#cbd5e0')
      .text(tenantAddress, MARGIN, 62, { width: CONTENT_W * 0.55, align: 'left' });
  }

  // Invoice type + number (top-right, white)
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(titleText, MARGIN + CONTENT_W * 0.55, 18, { width: CONTENT_W * 0.45, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#e2e8f0')
    .text(`מספר: ${invoice.number}`, MARGIN + CONTENT_W * 0.55, 44, { width: CONTENT_W * 0.45, align: 'right' });

  y = 120;

  // ── 2. Invoice details box ────────────────────────────────────────────────
  const detailsBoxHeight = invoice.dueDate ? 80 : 65;
  doc
    .rect(MARGIN, y, CONTENT_W, detailsBoxHeight)
    .fillAndStroke('#f7fafc', LIGHT_GREY);

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11);

  const col1x = MARGIN + 12;
  const col2x = MARGIN + 150;
  const col3x = MARGIN + CONTENT_W * 0.5 + 12;
  const col4x = MARGIN + CONTENT_W * 0.5 + 150;

  // Row 1: date + status
  doc.text('תאריך:', col1x, y + 14).text('סטטוס:', col3x, y + 14);
  doc.font('Helvetica').fillColor(GREY);
  doc.text(formatDate(invoice.date), col2x, y + 14);
  doc.text(statusHebrew(invoice.status), col4x, y + 14);

  if (invoice.dueDate) {
    // Row 2: due date
    doc.fillColor(DARK).font('Helvetica-Bold');
    doc.text('תאריך פירעון:', col1x, y + 36);
    doc.font('Helvetica').fillColor(GREY);
    doc.text(formatDate(invoice.dueDate), col2x, y + 36);
  }

  // Row: invoice type label
  const typeRowY = invoice.dueDate ? y + 58 : y + 36;
  doc.fillColor(DARK).font('Helvetica-Bold');
  doc.text('סוג מסמך:', col1x, typeRowY);
  doc.font('Helvetica').fillColor(isCreditNote ? '#c53030' : BLUE);
  doc.text(titleText, col2x, typeRowY);

  y += detailsBoxHeight + 18;

  // ── 3. Customer section ───────────────────────────────────────────────────
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12);
  doc.text('לכבוד:', MARGIN, y);
  y += 16;

  doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK);
  doc.text(customer.name, MARGIN, y, { width: CONTENT_W * 0.6 });
  y += 18;

  doc.font('Helvetica').fontSize(10).fillColor(GREY);
  const customerLines: string[] = [];
  if (customer.email)      customerLines.push(`דוא"ל: ${customer.email}`);
  if (customer.phone)      customerLines.push(`טל': ${customer.phone}`);
  if (customer.businessId) customerLines.push(`ח.פ. / ע.מ.: ${customer.businessId}`);
  const customerAddress = parseAddress(customer.address);
  if (customerAddress)     customerLines.push(`כתובת: ${customerAddress}`);

  for (const line of customerLines) {
    doc.text(line, MARGIN, y, { width: CONTENT_W * 0.6 });
    y += 14;
  }

  y += 14;

  // ── 4. Line items table ───────────────────────────────────────────────────
  const colWidths = [
    CONTENT_W * 0.38, // תיאור
    CONTENT_W * 0.10, // כמות
    CONTENT_W * 0.17, // מחיר יחידה
    CONTENT_W * 0.12, // מע"מ%
    CONTENT_W * 0.23, // סה"כ
  ];
  const colX = [
    MARGIN,
    MARGIN + colWidths[0]!,
    MARGIN + colWidths[0]! + colWidths[1]!,
    MARGIN + colWidths[0]! + colWidths[1]! + colWidths[2]!,
    MARGIN + colWidths[0]! + colWidths[1]! + colWidths[2]! + colWidths[3]!,
  ];

  const ROW_H = 20;

  // Table header
  doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(TABLE_HDR);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);

  const headers = ['תיאור', 'כמות', 'מחיר יחידה', 'מע"מ%', 'סה"כ'];
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i]!, colX[i]! + 4, y + 5, {
      width: colWidths[i]! - 8,
      align: i === 0 ? 'left' : 'right',
    });
  }
  y += ROW_H;

  // Table rows
  let isOdd = true;
  for (const line of invoice.lines) {
    const rowBg = isOdd ? '#ffffff' : '#f7fafc';
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rowBg);

    // Bottom border
    doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_W, y + ROW_H).strokeColor(LIGHT_GREY).lineWidth(0.5).stroke();

    doc.fillColor(DARK).font('Helvetica').fontSize(9);

    const vatPct = `${(Number(line.vatRate) * 100).toFixed(0)}%`;

    doc.text(line.description, colX[0]! + 4, y + 6, { width: colWidths[0]! - 8, align: 'left', ellipsis: true });
    doc.text(String(Number(line.quantity)), colX[1]! + 4, y + 6, { width: colWidths[1]! - 8, align: 'right' });
    doc.text(formatILS(Number(line.unitPrice)), colX[2]! + 4, y + 6, { width: colWidths[2]! - 8, align: 'right' });
    doc.text(vatPct, colX[3]! + 4, y + 6, { width: colWidths[3]! - 8, align: 'right' });
    doc.text(formatILS(Number(line.lineTotal)), colX[4]! + 4, y + 6, { width: colWidths[4]! - 8, align: 'right' });

    y += ROW_H;
    isOdd = !isOdd;
  }

  // Outer border around table
  const tableStartY = y - (invoice.lines.length + 1) * ROW_H;
  doc.rect(MARGIN, tableStartY, CONTENT_W, y - tableStartY).strokeColor(LIGHT_GREY).lineWidth(1).stroke();

  y += 10;

  // ── 5. Totals section ─────────────────────────────────────────────────────
  const totalsX     = MARGIN + CONTENT_W * 0.55;
  const totalsW     = CONTENT_W * 0.45;
  const labelX      = totalsX;
  const amountX     = totalsX + totalsW * 0.5;
  const amountW     = totalsW * 0.5;

  // Subtotal
  doc.fillColor(GREY).font('Helvetica').fontSize(10);
  doc.text('סכום לפני מע"מ:', labelX, y, { width: totalsW * 0.5, align: 'left' });
  doc.text(formatILS(Number(invoice.subtotal)), amountX, y, { width: amountW, align: 'right' });
  y += 16;

  // Discount (if any)
  if (invoice.discountAmount && Number(invoice.discountAmount) > 0) {
    doc.fillColor('#c53030').font('Helvetica').fontSize(10);
    doc.text('הנחה:', labelX, y, { width: totalsW * 0.5, align: 'left' });
    doc.text(`(${formatILS(Number(invoice.discountAmount))})`, amountX, y, { width: amountW, align: 'right' });
    y += 16;
  }

  // VAT
  doc.fillColor(GREY).font('Helvetica').fontSize(10);
  doc.text('מע"מ (18%):', labelX, y, { width: totalsW * 0.5, align: 'left' });
  doc.text(formatILS(Number(invoice.vatAmount)), amountX, y, { width: amountW, align: 'right' });
  y += 10;

  // Divider
  doc.moveTo(totalsX, y).lineTo(totalsX + totalsW, y).strokeColor(DARK).lineWidth(1.5).stroke();
  y += 8;

  // Total (bold, highlighted)
  const totalBoxHeight = 30;
  doc.rect(totalsX, y, totalsW, totalBoxHeight).fill(isCreditNote ? '#fff5f5' : '#f0fff4');
  doc.rect(totalsX, y, totalsW, totalBoxHeight).strokeColor(isCreditNote ? '#fc8181' : '#9ae6b4').lineWidth(1).stroke();

  doc.fillColor(isCreditNote ? '#c53030' : '#1c4532').font('Helvetica-Bold').fontSize(14);
  doc.text('סה"כ לתשלום:', totalsX + 8, y + 8, { width: totalsW * 0.5, align: 'left' });
  doc.text(formatILS(Number(invoice.total)), amountX, y + 8, { width: amountW, align: 'right' });

  y += totalBoxHeight + 20;

  // ── 6. Notes ──────────────────────────────────────────────────────────────
  if (invoice.notes) {
    doc.rect(MARGIN, y, CONTENT_W, 1).fill(LIGHT_GREY);
    y += 10;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text('הערות:', MARGIN, y);
    y += 14;
    doc.fillColor(GREY).font('Helvetica').fontSize(10)
      .text(invoice.notes, MARGIN, y, { width: CONTENT_W, align: 'left' });
    y += doc.heightOfString(invoice.notes, { width: CONTENT_W }) + 10;
  }

  // ── 7. Footer ─────────────────────────────────────────────────────────────
  const footerY = 760; // near bottom of A4 (841 pt)
  doc.rect(MARGIN, footerY, CONTENT_W, 1).fill(LIGHT_GREY);

  doc.fillColor(GREY).font('Helvetica').fontSize(9);
  doc.text('תודה על עסקינו!', MARGIN, footerY + 6, { width: CONTENT_W * 0.5, align: 'left' });

  // Company contact in footer
  const footerParts: string[] = [tenant.name];
  if (tenant.phone) footerParts.push(`טל': ${tenant.phone}`);
  if (tenant.email) footerParts.push(tenant.email);
  if (tenant.vatNumber) footerParts.push(`עוסק מורשה: ${tenant.vatNumber}`);

  doc.text(footerParts.join('  |  '), MARGIN, footerY + 18, { width: CONTENT_W, align: 'center' });
}
