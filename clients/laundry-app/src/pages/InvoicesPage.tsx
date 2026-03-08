import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  FileText, Search, Plus, X, Send, CreditCard, Ban,
  Download, Trash2, AlertTriangle, DollarSign, Clock,
  ChevronDown, Receipt,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלחה', PAID: 'שולמה', PARTIALLY_PAID: 'שולמה חלקית',
  OVERDUE: 'באיחור', CANCELLED: 'בוטלה', VOID: 'מבוטלת',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700', PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700',
  OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500',
  VOID: 'bg-gray-100 text-gray-400',
};
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'מזומן' },
  { value: 'BANK_TRANSFER', label: 'העברה' },
  { value: 'CREDIT_CARD', label: 'אשראי' },
  { value: 'CHECK', label: "צ'ק" },
  { value: 'OTHER', label: 'אחר' },
];
const VAT_RATE = 0.18;
const STATUSES = ['', 'DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'];

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

// ─── Component ────────────────────────────────────────
export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // List state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  // ─── Queries ──────────────────────────────────────
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['invoices', debouncedSearch, statusFilter],
    queryFn: () =>
      api.get('/invoices', {
        params: {
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          limit: 100,
        },
      }).then(r => r.data.data),
  });

  const invoices = useMemo(() => {
    if (Array.isArray(invoicesData)) return invoicesData;
    return invoicesData?.invoices ?? [];
  }, [invoicesData]);

  // Detail query
  const { data: invoiceDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['invoice-detail', selectedInvoiceId],
    queryFn: () =>
      api.get(`/invoices/${selectedInvoiceId}`).then(r => r.data.data),
    enabled: !!selectedInvoiceId,
  });

  // ─── Summary Stats ───────────────────────────────
  const stats = useMemo(() => {
    const total = invoices.length;
    const unpaidTotal = invoices
      .filter((inv: any) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status))
      .reduce((sum: number, inv: any) => sum + Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0), 0);
    const overdueCount = invoices.filter((inv: any) => inv.status === 'OVERDUE').length;
    return { total, unpaidTotal, overdueCount };
  }, [invoices]);

  // ─── Mutations ────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-detail', selectedInvoiceId] });
      addToast('החשבונית נשלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בשליחה', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-detail', selectedInvoiceId] });
      addToast('החשבונית בוטלה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בביטול', 'error'),
  });

  const payMutation = useMutation({
    mutationFn: (data: { id: string; payload: any }) =>
      api.post(`/invoices/${data.id}/pay`, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-detail', selectedInvoiceId] });
      setShowPayment(false);
      addToast('תשלום נרשם בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ברישום תשלום', 'error'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/invoices', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setShowCreate(false);
      addToast('חשבונית נוצרה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ביצירת חשבונית', 'error'),
  });

  // PDF download
  const handleDownloadPdf = async (id: string) => {
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      addToast('שגיאה בהורדת PDF', 'error');
    }
  };

  // ─── Render ───────────────────────────────────────
  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Receipt className="w-7 h-7 text-blue-600" /> חשבוניות
        </h1>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> חשבונית חדשה
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500">סה"כ חשבוניות</div>
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500">יתרה לגבייה</div>
          <div className="text-2xl font-bold text-blue-600">{stats.unpaidTotal.toLocaleString()} ₪</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> באיחור
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.overdueCount}</div>
        </div>
      </div>

      {/* Search + Status Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי מספר, לקוח..."
            className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {s ? STATUS_LABELS[s] : 'הכל'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-right px-4 py-3 text-gray-500 font-medium">מספר</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">לקוח</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">סכום</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">תאריך</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">תאריך פירעון</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">טוען...</td></tr>
            )}
            {invoices.map((inv: any) => (
              <tr key={inv.id}
                onClick={() => setSelectedInvoiceId(inv.id)}
                className="border-t hover:bg-blue-50/40 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-mono text-blue-600 font-medium">
                  {inv.invoiceNumber ?? inv.number ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-800">
                  {inv.customer?.name ?? inv.customerName ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABELS[inv.status] ?? inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-800">
                  {Number(inv.total ?? 0).toLocaleString()} ₪
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {inv.issueDate || inv.date
                    ? new Date(inv.issueDate ?? inv.date).toLocaleDateString('he-IL')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('he-IL') : '—'}
                </td>
              </tr>
            ))}
            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  אין חשבוניות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ───────── Invoice Detail Modal ───────── */}
      {selectedInvoiceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedInvoiceId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-slideDown"
            onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="p-12 text-center text-gray-400">טוען פרטי חשבונית...</div>
            ) : invoiceDetail ? (
              <>
                {/* Header */}
                <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between sticky top-0 rounded-t-2xl">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-gray-800 text-lg">
                      חשבונית {invoiceDetail.invoiceNumber ?? invoiceDetail.number ?? ''}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoiceDetail.status] ?? 'bg-gray-100'}`}>
                      {STATUS_LABELS[invoiceDetail.status] ?? invoiceDetail.status}
                    </span>
                  </div>
                  <button onClick={() => setSelectedInvoiceId(null)}
                    className="p-1.5 hover:bg-gray-200 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Info */}
                <div className="px-6 py-4 grid grid-cols-2 gap-4 border-b">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">לקוח</div>
                    <div className="text-sm font-medium text-gray-800">
                      {invoiceDetail.customer?.name ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">תאריך הנפקה</div>
                    <div className="text-sm text-gray-700">
                      {invoiceDetail.issueDate || invoiceDetail.date
                        ? new Date(invoiceDetail.issueDate ?? invoiceDetail.date).toLocaleDateString('he-IL')
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">תאריך פירעון</div>
                    <div className="text-sm text-gray-700">
                      {invoiceDetail.dueDate ? new Date(invoiceDetail.dueDate).toLocaleDateString('he-IL') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">תנאי תשלום</div>
                    <div className="text-sm text-gray-700">
                      {invoiceDetail.paymentTerms ? `נטו ${invoiceDetail.paymentTerms} ימים` : '—'}
                    </div>
                  </div>
                </div>

                {/* Lines */}
                <div className="px-6 py-4 border-b">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">שורות חשבונית</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs">
                        <th className="text-right pb-2">תיאור</th>
                        <th className="text-right pb-2 w-20">כמות</th>
                        <th className="text-right pb-2 w-24">מחיר יחידה</th>
                        <th className="text-right pb-2 w-24">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(invoiceDetail.lines) ? invoiceDetail.lines : []).map((line: any, i: number) => (
                        <tr key={line.id ?? i} className="border-t">
                          <td className="py-2 text-gray-800">{line.description}</td>
                          <td className="py-2 text-gray-600">{line.quantity}</td>
                          <td className="py-2 text-gray-600">{Number(line.unitPrice).toLocaleString()} ₪</td>
                          <td className="py-2 font-medium text-gray-800">
                            {(Number(line.quantity) * Number(line.unitPrice)).toLocaleString()} ₪
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals */}
                  <div className="mt-4 pt-3 border-t space-y-1 text-sm">
                    {invoiceDetail.subtotal != null && (
                      <div className="flex justify-between text-gray-500">
                        <span>סכום ביניים</span>
                        <span>{Number(invoiceDetail.subtotal).toLocaleString()} ₪</span>
                      </div>
                    )}
                    {invoiceDetail.discount != null && Number(invoiceDetail.discount) > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>הנחה</span>
                        <span>-{Number(invoiceDetail.discount).toLocaleString()} ₪</span>
                      </div>
                    )}
                    {invoiceDetail.vatAmount != null && (
                      <div className="flex justify-between text-gray-500">
                        <span>מע"מ (18%)</span>
                        <span>{Number(invoiceDetail.vatAmount).toLocaleString()} ₪</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-800 text-base pt-1">
                      <span>סה"כ</span>
                      <span>{Number(invoiceDetail.total ?? 0).toLocaleString()} ₪</span>
                    </div>
                    {invoiceDetail.paidAmount != null && Number(invoiceDetail.paidAmount) > 0 && (
                      <div className="flex justify-between text-green-600 font-medium">
                        <span>שולם</span>
                        <span>{Number(invoiceDetail.paidAmount).toLocaleString()} ₪</span>
                      </div>
                    )}
                    {invoiceDetail.balance != null && Number(invoiceDetail.balance) > 0 && (
                      <div className="flex justify-between text-red-600 font-medium">
                        <span>יתרה לתשלום</span>
                        <span>{Number(invoiceDetail.balance).toLocaleString()} ₪</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {invoiceDetail.notes && (
                  <div className="px-6 py-3 border-b">
                    <div className="text-xs text-gray-400 mb-1">הערות</div>
                    <div className="text-sm text-gray-700">{invoiceDetail.notes}</div>
                  </div>
                )}

                {/* Payment History */}
                {Array.isArray(invoiceDetail.payments) && invoiceDetail.payments.length > 0 && (
                  <div className="px-6 py-4 border-b">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-gray-400" /> היסטוריית תשלומים
                    </h4>
                    <div className="space-y-2">
                      {invoiceDetail.payments.map((pmt: any, i: number) => (
                        <div key={pmt.id ?? i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <div className="text-sm font-medium text-gray-800">
                              {Number(pmt.amount).toLocaleString()} ₪
                            </div>
                            <div className="text-xs text-gray-400 flex items-center gap-2">
                              <span>{PAYMENT_METHODS.find(m => m.value === pmt.method)?.label ?? pmt.method}</span>
                              <span>{pmt.date ? new Date(pmt.date).toLocaleDateString('he-IL') : ''}</span>
                              {pmt.reference && <span>| {pmt.reference}</span>}
                            </div>
                            {pmt.notes && <div className="text-xs text-gray-400 mt-0.5">{pmt.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="px-6 py-4 flex flex-wrap gap-2 sticky bottom-0 bg-white rounded-b-2xl">
                  {invoiceDetail.status === 'DRAFT' && (
                    <button onClick={() => sendMutation.mutate(invoiceDetail.id)}
                      disabled={sendMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                      <Send className="w-4 h-4" />
                      {sendMutation.isPending ? 'שולח...' : 'שלח'}
                    </button>
                  )}
                  {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoiceDetail.status) && (
                    <button onClick={() => setShowPayment(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
                      <DollarSign className="w-4 h-4" /> רשום תשלום
                    </button>
                  )}
                  {!['CANCELLED', 'VOID', 'PAID'].includes(invoiceDetail.status) && (
                    <button onClick={() => {
                      if (confirm('לבטל את החשבונית?')) cancelMutation.mutate(invoiceDetail.id);
                    }}
                      disabled={cancelMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-medium hover:bg-red-200 disabled:opacity-40">
                      <Ban className="w-4 h-4" />
                      {cancelMutation.isPending ? 'מבטל...' : 'בטל'}
                    </button>
                  )}
                  <button onClick={() => handleDownloadPdf(invoiceDetail.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                    <Download className="w-4 h-4" /> PDF
                  </button>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-gray-400">לא נמצאה חשבונית</div>
            )}
          </div>
        </div>
      )}

      {/* ───────── Create Invoice Modal ───────── */}
      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onSubmit={data => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}

      {/* ───────── Payment Recording Modal ───────── */}
      {showPayment && selectedInvoiceId && invoiceDetail && (
        <PaymentModal
          invoice={invoiceDetail}
          onClose={() => setShowPayment(false)}
          onSubmit={payload => payMutation.mutate({ id: invoiceDetail.id, payload })}
          isPending={payMutation.isPending}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Create Invoice Modal
// ─────────────────────────────────────────────────────
function CreateInvoiceModal({
  onClose, onSubmit, isPending,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustSearch = useDebounce(customerSearch, 300);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [notes, setNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');

  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);

  // Customer search
  const { data: customersData } = useQuery({
    queryKey: ['crm-customers-search', debouncedCustSearch],
    queryFn: () =>
      api.get('/crm/customers', { params: { search: debouncedCustSearch, limit: 10 } })
        .then(r => r.data.data),
    enabled: debouncedCustSearch.length >= 1,
  });
  const customers = Array.isArray(customersData)
    ? customersData
    : customersData?.customers ?? [];

  // Auto-calculate due date from payment terms
  const handleTermsChange = (val: string) => {
    setPaymentTerms(val);
    if (date && val) {
      const d = new Date(date);
      d.setDate(d.getDate() + Number(val));
      setDueDate(d.toISOString().slice(0, 10));
    }
  };

  // Line management
  const updateLine = (idx: number, field: keyof InvoiceLine, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };
  const addLine = () => setLines(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Calculations
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discountAmount = subtotal * (Number(discountPercent) / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * VAT_RATE;
  const total = afterDiscount + vatAmount;

  const canSubmit = customerId && date && dueDate && lines.some(l => l.description && l.unitPrice > 0);

  const handleSubmit = () => {
    onSubmit({
      customerId,
      date,
      dueDate,
      paymentTerms: Number(paymentTerms) || undefined,
      notes: notes || undefined,
      discountPercent: Number(discountPercent) || undefined,
      lines: lines.filter(l => l.description).map(l => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-slideDown"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between sticky top-0 rounded-t-2xl z-10">
          <h3 className="font-bold text-gray-800 text-lg">חשבונית חדשה</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Customer Selector */}
          <div className="relative">
            <label className="text-sm font-medium text-gray-700 mb-1 block">לקוח *</label>
            {customerId ? (
              <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-blue-50">
                <span className="text-sm font-medium text-blue-700 flex-1">{customerName}</span>
                <button onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerSearch(''); }}
                  className="p-0.5 hover:bg-blue-100 rounded">
                  <X className="w-3.5 h-3.5 text-blue-500" />
                </button>
              </div>
            ) : (
              <>
                <input
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustDropdown(true); }}
                  onFocus={() => setShowCustDropdown(true)}
                  placeholder="חפש לקוח..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                {showCustDropdown && customers.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {customers.map((c: any) => (
                      <button key={c.id}
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerName(c.name);
                          setShowCustDropdown(false);
                          setCustomerSearch('');
                        }}
                        className="w-full text-right px-4 py-2.5 hover:bg-blue-50 text-sm flex items-center justify-between border-b last:border-b-0">
                        <span className="font-medium text-gray-800">{c.name}</span>
                        {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Dates + Terms */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">תנאי תשלום (ימים)</label>
              <input type="number" value={paymentTerms}
                onChange={e => handleTermsChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" min="0" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך פירעון *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">שורות חשבונית</label>
              <button onClick={addLine}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3.5 h-3.5" /> הוסף שורה
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <input
                    value={line.description}
                    onChange={e => updateLine(idx, 'description', e.target.value)}
                    placeholder="תיאור"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number" min="1"
                    value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', Number(e.target.value) || 1)}
                    className="w-20 px-3 py-2 border rounded-lg text-sm text-center"
                    placeholder="כמות"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={line.unitPrice || ''}
                    onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value) || 0)}
                    className="w-28 px-3 py-2 border rounded-lg text-sm"
                    placeholder="מחיר יחידה"
                  />
                  <div className="w-24 py-2 text-sm font-medium text-gray-700 text-center">
                    {(line.quantity * line.unitPrice).toLocaleString()} ₪
                  </div>
                  <button onClick={() => removeLine(idx)}
                    disabled={lines.length <= 1}
                    className="p-2 text-gray-300 hover:text-red-500 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Discount + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">הנחה (%)</label>
              <input type="number" min="0" max="100" step="0.5"
                value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">הערות</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="הערות לחשבונית..."
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>סכום ביניים</span>
              <span>{subtotal.toLocaleString()} ₪</span>
            </div>
            {Number(discountPercent) > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>הנחה ({discountPercent}%)</span>
                <span>-{discountAmount.toLocaleString()} ₪</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>מע"מ (18%)</span>
              <span>{Math.round(vatAmount).toLocaleString()} ₪</span>
            </div>
            <div className="flex justify-between font-bold text-gray-800 text-base pt-1 border-t">
              <span>סה"כ לתשלום</span>
              <span>{Math.round(total).toLocaleString()} ₪</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 sticky bottom-0 rounded-b-2xl">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">
            ביטול
          </button>
          <button onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
            {isPending ? 'יוצר חשבונית...' : 'צור חשבונית'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Payment Recording Modal
// ─────────────────────────────────────────────────────
function PaymentModal({
  invoice, onClose, onSubmit, isPending,
}: {
  invoice: any;
  onClose: () => void;
  onSubmit: (payload: any) => void;
  isPending: boolean;
}) {
  const balance = Number(invoice.balance ?? invoice.total ?? 0) - Number(invoice.paidAmount ?? 0);
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [method, setMethod] = useState('CASH');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const handleSubmit = () => {
    onSubmit({
      amount: Number(amount),
      method,
      date: payDate,
      reference: reference || undefined,
      notes: payNotes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-green-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" /> רישום תשלום
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">חשבונית</span>
              <span className="font-medium">{invoice.invoiceNumber ?? invoice.number}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-gray-500">סה"כ חשבונית</span>
              <span className="font-medium">{Number(invoice.total).toLocaleString()} ₪</span>
            </div>
            {balance > 0 && (
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">יתרה</span>
                <span className="font-bold text-red-600">{balance.toLocaleString()} ₪</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">סכום תשלום *</label>
            <input type="number" min="0" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">אמצעי תשלום</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500">
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך תשלום</label>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">אסמכתא</label>
            <input value={reference} onChange={e => setReference(e.target.value)}
              placeholder="מספר העברה, מספר צ'ק..."
              className="w-full px-3 py-2 border rounded-lg" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">הערות</label>
            <input value={payNotes} onChange={e => setPayNotes(e.target.value)}
              placeholder="הערות..."
              className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">
            ביטול
          </button>
          <button onClick={handleSubmit}
            disabled={!amount || Number(amount) <= 0 || isPending}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
            {isPending ? 'שומר...' : 'רשום תשלום'}
          </button>
        </div>
      </div>
    </div>
  );
}
