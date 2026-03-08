import { useRef } from 'react';

interface ReceiptItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ReceiptProps {
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  paymentMethod?: string;
  isPaid: boolean;
  receiptNumber?: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן',
  CREDIT: 'אשראי',
  TRANSFER: 'העברה בנקאית',
  PREPAID: 'מקדמה',
  CHECK: 'שיק',
};

export function ThermalReceipt({
  businessName = 'מכבסת הניצוץ',
  businessPhone = '03-1234567',
  businessAddress = 'רחוב הרצל 1, תל אביב',
  orderNumber,
  customerName,
  customerPhone,
  date,
  items,
  subtotal,
  vatAmount,
  total,
  paidAmount,
  paymentMethod,
  isPaid,
  receiptNumber,
}: ReceiptProps) {
  return (
    <div className="thermal-receipt" style={{
      width: '80mm', padding: '3mm', fontFamily: 'Arial, sans-serif',
      fontSize: '11px', direction: 'rtl', margin: '0 auto',
      backgroundColor: 'white', color: 'black',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{businessName}</div>
        <div style={{ fontSize: '9px', color: '#555' }}>{businessAddress}</div>
        <div style={{ fontSize: '9px', color: '#555' }}>טל: {businessPhone}</div>
      </div>

      <div style={{ borderTop: '1px dashed #333', margin: '2mm 0' }} />

      {/* Document Type */}
      <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 'bold', margin: '2mm 0' }}>
        {isPaid ? (receiptNumber ? `קבלה מס׳ ${receiptNumber}` : 'קבלה') : 'תעודת משלוח'}
      </div>

      <div style={{ borderTop: '1px dashed #333', margin: '2mm 0' }} />

      {/* Order Info */}
      <div style={{ marginBottom: '3mm' }}>
        <div><strong>הזמנה:</strong> {orderNumber}</div>
        <div><strong>לקוח:</strong> {customerName}</div>
        {customerPhone && <div><strong>טלפון:</strong> {customerPhone}</div>}
        <div><strong>תאריך:</strong> {date}</div>
      </div>

      <div style={{ borderTop: '1px dashed #333', margin: '2mm 0' }} />

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #999' }}>
            <th style={{ textAlign: 'right', padding: '1mm 0' }}>פריט</th>
            <th style={{ textAlign: 'center', padding: '1mm 0' }}>כמות</th>
            <th style={{ textAlign: 'left', padding: '1mm 0' }}>מחיר</th>
            <th style={{ textAlign: 'left', padding: '1mm 0' }}>סה"כ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px dotted #ddd' }}>
              <td style={{ padding: '1mm 0', maxWidth: '30mm', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</td>
              <td style={{ textAlign: 'center', padding: '1mm 0' }}>{item.quantity}</td>
              <td style={{ textAlign: 'left', padding: '1mm 0' }}>{item.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'left', padding: '1mm 0' }}>{item.lineTotal.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #333', margin: '2mm 0' }} />

      {/* Totals */}
      <div style={{ fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>סכום ביניים:</span>
          <span>{subtotal.toLocaleString()} ₪</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{"מע\"מ (18%):"}</span>
          <span>{vatAmount.toLocaleString()} ₪</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', marginTop: '2mm', borderTop: '1px solid #333', paddingTop: '2mm' }}>
          <span>{"סה\"כ לתשלום:"}</span>
          <span>{total.toLocaleString()} ₪</span>
        </div>
      </div>

      {/* Payment Info */}
      {isPaid && (
        <div style={{ marginTop: '3mm', borderTop: '1px dashed #333', paddingTop: '2mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>שולם:</span>
            <span>{paidAmount.toLocaleString()} ₪</span>
          </div>
          {paymentMethod && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>אמצעי תשלום:</span>
              <span>{PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}</span>
            </div>
          )}
        </div>
      )}

      {!isPaid && (
        <div style={{ textAlign: 'center', marginTop: '3mm', padding: '2mm', border: '1px solid #999', fontSize: '12px', fontWeight: 'bold' }}>
          לא שולם
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #333', marginTop: '3mm', paddingTop: '2mm', textAlign: 'center', fontSize: '9px', color: '#666' }}>
        <div>תודה שבחרת ב{businessName}!</div>
        <div>נשמח לשרת אותך שוב</div>
      </div>
    </div>
  );
}

export function ThermalReceiptPrintButton({ order, className }: { order: any; className?: string }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'width=320,height=700');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
      <head><title>קבלה - ${order.orderNumber}</title>
      <style>
        @media print { @page { margin: 0; size: 80mm auto; } body { margin: 0; } }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        table { width: 100%; border-collapse: collapse; }
      </style></head>
      <body>${content.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 200);
  };

  const items = (order.items ?? []).map((item: any) => ({
    description: item.description ?? item.service?.name ?? 'פריט',
    quantity: item.quantity ?? 1,
    unitPrice: Number(item.unitPrice ?? 0),
    lineTotal: Number(item.lineTotal ?? 0),
  }));

  const isPaid = Number(order.paidAmount) >= Number(order.total);

  return (
    <div>
      <button onClick={handlePrint}
        className={className || "flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="6" rx="2"/><path d="M17 14v7H7v-7"/><path d="M17 3H7v3h10V3z"/></svg>
        הדפס קבלה
      </button>
      <div ref={printRef} className="hidden">
        <ThermalReceipt
          orderNumber={order.orderNumber}
          customerName={order.customer?.name ?? ''}
          customerPhone={order.customer?.phone}
          date={new Date(order.receivedAt).toLocaleDateString('he-IL')}
          items={items}
          subtotal={Number(order.subtotal ?? 0)}
          vatAmount={Number(order.vatAmount ?? 0)}
          total={Number(order.total ?? 0)}
          paidAmount={Number(order.paidAmount ?? 0)}
          paymentMethod={order.paymentMethod}
          isPaid={isPaid}
        />
      </div>
    </div>
  );
}

export default ThermalReceipt;
