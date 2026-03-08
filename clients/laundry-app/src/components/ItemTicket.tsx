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

// Generate Code128 barcode as SVG path data
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

function BarcodeSVG({ text, width = 120, height = 28 }: { text: string; width?: number; height?: number }) {
  const path = generateBarcodeSVG(text);
  const totalUnits = text.length * 11 + 35;
  return (
    <svg viewBox={`0 0 ${totalUnits} 30`} width={width} height={height}>
      <path d={path} fill="black" />
    </svg>
  );
}

/**
 * Compact garment tag — ~40mm x 30mm
 * Designed to be attached to clothing items
 */
export function ItemTicket({ customerName, orderNumber, itemNumber, barcode, description, date }: TicketProps) {
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

      {/* Row 4: Barcode */}
      <div style={{ textAlign: 'center', marginTop: '0.5mm' }}>
        <BarcodeSVG text={barcode} width={120} height={22} />
        <div style={{ fontSize: '6px', fontFamily: 'monospace', letterSpacing: '0.5px', color: '#555' }}>{barcode}</div>
      </div>
    </div>
  );
}

/**
 * Print view — opens print window with compact ticket grid
 * Tickets are arranged in a 2-column grid for label sheets
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
        @media print {
          body { margin: 0; }
        }
        body { font-family: Arial, sans-serif; margin: 0; padding: 2mm; }
        .tickets-grid { display: flex; flex-wrap: wrap; gap: 1mm; }
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
 * Auto-print tickets + receipt after order creation
 * Called automatically when a new order is created
 */
export function autoPrintOrderTickets(order: any) {
  const orderDate = new Date(order.receivedAt || new Date()).toLocaleDateString('he-IL');
  const customerName = order.customer?.name || '';
  const items = (order.items ?? []).map((item: any, idx: number) => ({
    barcode: item.barcode || `${order.orderNumber}-${String(idx + 1).padStart(2, '0')}`,
    description: item.description ?? item.service?.name ?? 'פריט',
    itemNumber: idx + 1,
  }));

  if (items.length === 0) return;

  // Build tickets HTML
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
      <div style="text-align:center;margin-top:0.5mm">
        <div style="font-size:10px;font-family:monospace;letter-spacing:1px;font-weight:bold">${item.barcode}</div>
      </div>
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
    </style></head>
    <body><div style="display:flex;flex-wrap:wrap;gap:1mm">${ticketsHtml}</div></body></html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 300);
}

export default ItemTicket;
