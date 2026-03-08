import { useRef } from 'react';

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
  // Simple Code128B encoding
  const CODE128B: Record<string, number[]> = {};
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

  for (let i = 0; i < chars.length; i++) {
    CODE128B[chars[i]] = patterns[i];
  }

  // Start code B = 104
  const startPattern = [2,1,1,4,1,2];
  const stopPattern = [2,3,3,1,1,1,2];

  let checksum = 104; // Start B value
  const allPatterns: number[][] = [startPattern];

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const idx = chars.indexOf(c);
    if (idx >= 0) {
      allPatterns.push(patterns[idx]);
      checksum += (i + 1) * idx;
    }
  }

  // Checksum
  const checksumIdx = checksum % 103;
  if (checksumIdx < patterns.length) {
    allPatterns.push(patterns[checksumIdx]);
  }
  allPatterns.push(stopPattern);

  // Convert to bars
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const pattern of allPatterns) {
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) { // bar (black)
        bars.push({ x, w: pattern[i] });
      }
      x += pattern[i];
    }
  }

  return bars.map(b => `M${b.x},0 L${b.x + b.w},0 L${b.x + b.w},40 L${b.x},40 Z`).join(' ');
}

function BarcodeSVG({ text, width = 200, height = 50 }: { text: string; width?: number; height?: number }) {
  const path = generateBarcodeSVG(text);
  // Calculate total width from the path to scale properly
  const totalUnits = text.length * 11 + 35; // approximate

  return (
    <svg viewBox={`0 0 ${totalUnits} 40`} width={width} height={height} className="mx-auto">
      <path d={path} fill="black" />
    </svg>
  );
}

export function ItemTicket({ customerName, orderNumber, itemNumber, barcode, description, garmentType, date }: TicketProps) {
  return (
    <div className="item-ticket" style={{
      width: '58mm', padding: '3mm', border: '1px dashed #999',
      fontFamily: 'Arial, sans-serif', fontSize: '10px', direction: 'rtl',
      pageBreakAfter: 'always', margin: '2mm auto',
    }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '2mm', marginBottom: '2mm' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>מכבסת הניצוץ</div>
      </div>

      <div style={{ marginBottom: '2mm' }}>
        <div><strong>לקוח:</strong> {customerName}</div>
        <div><strong>הזמנה:</strong> {orderNumber}</div>
        <div><strong>פריט:</strong> #{itemNumber}</div>
        <div><strong>תאריך:</strong> {date}</div>
      </div>

      <div style={{ textAlign: 'center', borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc', padding: '2mm 0', margin: '2mm 0' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{description}</div>
        {garmentType && <div style={{ fontSize: '9px', color: '#666' }}>{garmentType}</div>}
      </div>

      <div style={{ textAlign: 'center', padding: '2mm 0' }}>
        <BarcodeSVG text={barcode} width={180} height={40} />
        <div style={{ fontSize: '8px', fontFamily: 'monospace', marginTop: '1mm', letterSpacing: '1px' }}>{barcode}</div>
      </div>
    </div>
  );
}

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
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
      <head><title>פתקיות - ${orderNumber}</title>
      <style>
        @media print { body { margin: 0; } .item-ticket { page-break-after: always; } }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
      </style></head>
      <body>${content.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div>
      <button onClick={handlePrint}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
        הדפס פתקיות
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

export default ItemTicket;
