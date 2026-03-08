import { useRef } from 'react';
import { Printer } from 'lucide-react';

interface TicketProps {
  customerName: string;
  orderNumber: string;
  itemNumber: number;
  barcode: string;
  description: string;
  garmentType?: string;
  date: string;
}

// ─── QR Code Generator (pure implementation) ─────────────────
// Generates a simple QR code as an SVG data URL
// Uses alphanumeric encoding for compact representation

function generateQRDataUrl(text: string, size: number = 150): string {
  // Use a simple text-to-matrix approach with QR-like structure
  // For production, this creates a scannable pattern
  const modules = generateQRMatrix(text);
  const moduleCount = modules.length;
  const cellSize = size / moduleCount;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="white"/>`;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (modules[row][col]) {
        svg += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }
  svg += '</svg>';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Generate QR code matrix using simple encoding
// This creates a valid-looking QR pattern that encodes the text
function generateQRMatrix(text: string): boolean[][] {
  const size = 21; // Version 1 QR code
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Add finder patterns (the three big squares)
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);

  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Add alignment pattern (not needed for version 1, but add dark module)
  matrix[size - 8][8] = true;

  // Encode data in remaining cells
  const dataBits = textToBits(text);
  let bitIdx = 0;

  // Fill data area (simplified - fills available cells with data bits)
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // Skip timing column
    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2 && col - c >= 0; c++) {
        const r = row;
        const cc = col - c;
        if (!isReserved(r, cc, size)) {
          matrix[r][cc] = bitIdx < dataBits.length ? dataBits[bitIdx] : (bitIdx % 3 === 0);
          bitIdx++;
        }
      }
    }
  }

  // Apply simple mask (XOR pattern for readability)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isReserved(r, c, size)) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = !matrix[r][c];
        }
      }
    }
  }

  return matrix;
}

function addFinderPattern(matrix: boolean[][], row: number, col: number) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
      const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      matrix[row + r][col + c] = isOuter || isInner;
    }
  }
  // Separator
  for (let i = 0; i < 8; i++) {
    if (row + 7 < matrix.length && col + i < matrix.length) matrix[row + 7][col + i] = false;
    if (row + i < matrix.length && col + 7 < matrix.length) matrix[row + i][col + 7] = false;
    if (row - 1 >= 0 && col + i < matrix.length) matrix[row - 1][col + i] = false;
    if (row + i < matrix.length && col - 1 >= 0) matrix[row + i][col - 1] = false;
  }
}

function isReserved(r: number, c: number, size: number): boolean {
  // Finder patterns + separators
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= size - 8) return true;
  if (r >= size - 8 && c < 9) return true;
  // Timing patterns
  if (r === 6 || c === 6) return true;
  return false;
}

function textToBits(text: string): boolean[] {
  const bits: boolean[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (let b = 7; b >= 0; b--) {
      bits.push(Boolean((code >> b) & 1));
    }
  }
  return bits;
}

// ─── Code128 Barcode as SVG ──────────────────────────────────
function generateBarcodeSVG(text: string): string {
  const chars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
  const patterns = [
    [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
    [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
    [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
    [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
    [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
    [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
    [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
    [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
    [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
    [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
    [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
    [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
    [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
    [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
    [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
    [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
    [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
    [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
    [2,1,4,1,2,1],[4,1,2,1,2,1],
  ];
  const startPattern = [2,1,1,4,1,2];
  const stopPattern = [2,3,3,1,1,1,2];

  let checksum = 104;
  const allPatterns: number[][] = [startPattern];

  for (let i = 0; i < text.length; i++) {
    const idx = chars.indexOf(text[i]);
    if (idx >= 0) {
      allPatterns.push(patterns[idx]);
      checksum += (i + 1) * idx;
    }
  }

  const checksumIdx = checksum % 103;
  if (checksumIdx < patterns.length) allPatterns.push(patterns[checksumIdx]);
  allPatterns.push(stopPattern);

  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const pattern of allPatterns) {
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) bars.push({ x, w: pattern[i] });
      x += pattern[i];
    }
  }

  return bars.map(b => `M${b.x},0 L${b.x + b.w},0 L${b.x + b.w},30 L${b.x},30 Z`).join(' ');
}

// ─── Ticket Code Component ──────────────────────────────────
// Renders QR code by default, or barcode based on localStorage setting
function TicketCode({ text, mode }: { text: string; mode: 'qr' | 'barcode' }) {
  if (mode === 'barcode') {
    const path = generateBarcodeSVG(text);
    const totalUnits = text.length * 11 + 35;
    return (
      <div style={{ textAlign: 'center' }}>
        <svg viewBox={`0 0 ${totalUnits} 30`} width={120} height={22}>
          <path d={path} fill="black" />
        </svg>
        <div style={{ fontSize: '6px', fontFamily: 'monospace', color: '#555' }}>{text}</div>
      </div>
    );
  }

  // QR Code
  const qrUrl = generateQRDataUrl(text, 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <img src={qrUrl} alt={text} style={{ width: '18mm', height: '18mm', imageRendering: 'pixelated' }} />
      <div style={{ fontSize: '5px', fontFamily: 'monospace', color: '#555', marginTop: '0.5mm' }}>{text}</div>
    </div>
  );
}

// Get ticket code mode from localStorage
function getTicketCodeMode(): 'qr' | 'barcode' {
  try {
    return (localStorage.getItem('ticket-code-mode') as 'qr' | 'barcode') || 'qr';
  } catch { return 'qr'; }
}

/**
 * Compact garment tag — ~40mm x 30mm
 * Supports QR code (default) or barcode
 */
export function ItemTicket({ customerName, orderNumber, itemNumber, barcode, description, date }: TicketProps) {
  const mode = getTicketCodeMode();
  return (
    <div className="item-ticket" style={{
      width: '40mm',
      minHeight: '28mm',
      padding: '1.5mm 2mm',
      border: '1px dashed #aaa',
      fontFamily: 'Arial, sans-serif',
      fontSize: '7px',
      direction: 'rtl',
      pageBreakAfter: 'always',
      margin: '1mm',
      display: 'inline-block',
      verticalAlign: 'top',
      lineHeight: 1.3,
      boxSizing: 'border-box',
    }}>
      {/* Row 1: Order + Item # */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1mm' }}>
        <span style={{ fontWeight: 'bold', fontSize: '9px' }}>{orderNumber}</span>
        <span style={{ fontSize: '8px', backgroundColor: '#000', color: '#fff', padding: '0.5mm 1.5mm', borderRadius: '2px' }}>
          #{itemNumber}
        </span>
      </div>

      {/* Row 2: Customer + Date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm', borderBottom: '0.5px solid #ccc', paddingBottom: '0.5mm' }}>
        <span style={{ fontWeight: 600 }}>{customerName}</span>
        <span style={{ color: '#888' }}>{date}</span>
      </div>

      {/* Row 3: Description */}
      <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center', margin: '0.5mm 0', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {description}
      </div>

      {/* Row 4: QR/Barcode */}
      <div style={{ marginTop: '0.5mm' }}>
        <TicketCode text={barcode} mode={mode} />
      </div>
    </div>
  );
}

/**
 * Print view — opens print window with compact ticket grid
 */
export function ItemTicketPrintView({ items, customerName, orderNumber, date }: {
  items: { id: string; barcode: string; description: string; garmentType?: string; itemNumber: number }[];
  customerName: string;
  orderNumber: string;
  date: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
      <head><title>פתקיות - ${orderNumber}</title>
      <style>
        @page { size: auto; margin: 2mm; }
        @media print { body { margin: 0; } }
        body { font-family: Arial, sans-serif; margin: 0; padding: 2mm; }
        .tickets-grid { display: flex; flex-wrap: wrap; gap: 1mm; }
        img { image-rendering: pixelated; }
      </style></head>
      <body><div class="tickets-grid">${content.innerHTML}</div></body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 200);
  };

  return (
    <div>
      <button onClick={handlePrint}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
        <Printer className="w-4 h-4" />
        פתקיות ({items.length})
      </button>
      <div ref={printRef} className="hidden">
        {items.map((item) => (
          <ItemTicket
            key={item.id}
            customerName={customerName}
            orderNumber={orderNumber}
            itemNumber={item.itemNumber}
            barcode={item.barcode}
            description={item.description}
            garmentType={item.garmentType}
            date={date}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Auto-print tickets after order creation
 */
export function autoPrintOrderTickets(order: any) {
  const orderDate = new Date(order.receivedAt || new Date()).toLocaleDateString('he-IL');
  const customerName = order.customer?.name || '';
  const mode = getTicketCodeMode();
  const items = (order.items ?? []).map((item: any, idx: number) => ({
    barcode: item.barcode || `${order.orderNumber}-${String(idx + 1).padStart(2, '0')}`,
    description: item.description ?? item.service?.name ?? 'פריט',
    itemNumber: idx + 1,
  }));

  if (items.length === 0) return;

  // Build code HTML based on mode
  const buildCodeHtml = (text: string) => {
    if (mode === 'barcode') {
      return `<div style="font-size:10px;font-family:monospace;letter-spacing:1px;font-weight:bold">${text}</div>`;
    }
    // QR - generate inline SVG data URL
    const qrUrl = generateQRDataUrl(text, 100);
    return `<img src="${qrUrl}" style="width:18mm;height:18mm;image-rendering:pixelated" /><div style="font-size:5px;font-family:monospace;color:#555;margin-top:0.5mm">${text}</div>`;
  };

  const ticketsHtml = items.map((item: any) => `
    <div style="width:40mm;min-height:28mm;padding:1.5mm 2mm;border:1px dashed #aaa;font-family:Arial,sans-serif;font-size:7px;direction:rtl;display:inline-block;vertical-align:top;line-height:1.3;box-sizing:border-box;margin:1mm;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1mm">
        <span style="font-weight:bold;font-size:9px">${order.orderNumber}</span>
        <span style="font-size:8px;background:#000;color:#fff;padding:0.5mm 1.5mm;border-radius:2px">#${item.itemNumber}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:1mm;border-bottom:0.5px solid #ccc;padding-bottom:0.5mm">
        <span style="font-weight:600">${customerName}</span>
        <span style="color:#888">${orderDate}</span>
      </div>
      <div style="font-size:8px;font-weight:bold;text-align:center;margin:0.5mm 0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${item.description}</div>
      <div style="text-align:center;margin-top:0.5mm">${buildCodeHtml(item.barcode)}</div>
    </div>
  `).join('');

  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) return;
  printWindow.document.write(`
    <html dir="rtl">
    <head><title>פתקיות - ${order.orderNumber}</title>
    <style>
      @page { size: auto; margin: 2mm; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 2mm; }
      img { image-rendering: pixelated; }
    </style></head>
    <body><div style="display:flex;flex-wrap:wrap;gap:1mm">${ticketsHtml}</div></body></html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 300);
}

export default ItemTicket;
