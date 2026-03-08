import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABELS, STATUS_COLORS, PAYMENT_LABELS, PAYMENT_COLORS, NEXT_STATUS } from '../lib/constants';
import { SkeletonTable } from '../components/Skeleton';
import api from '../lib/api';
import { Plus, Search, ChevronLeft, CreditCard, Ban, MoreHorizontal, X } from 'lucide-react';

const STATUS_TABS = [
  { key: '', label: 'הכל' },
  { key: 'RECEIVED', label: 'התקבלו' },
  { key: 'PROCESSING', label: 'בעיבוד' },
  { key: 'WASHING', label: 'בכביסה' },
  { key: 'DRYING', label: 'בייבוש' },
  { key: 'IRONING', label: 'בגיהוץ' },
  { key: 'READY', label: 'מוכנים' },
  { key: 'DELIVERED', label: 'נמסרו' },
];

export default function OrdersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{ orderId: string; total: number; paid: number } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status, debouncedSearch, page],
    queryFn: () => api.get('/orders', { params: { status: status || undefined, search: debouncedSearch || undefined, page, limit: 20 } }).then(r => r.data.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ orderId, newStatus }: { orderId: string; newStatus: string }) =>
      api.patch(`/orders/${orderId}/status`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      addToast('סטטוס עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס', 'error'),
  });

  const payMutation = useMutation({
    mutationFn: ({ orderId, amount, method }: { orderId: string; amount: number; method: string }) =>
      api.post(`/orders/${orderId}/payment`, { amount, method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      addToast('תשלום נרשם');
      setPayModal(null);
    },
    onError: () => addToast('שגיאה ברישום תשלום', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => api.delete(`/orders/${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      addToast('הזמנה בוטלה');
      setMenuOrderId(null);
    },
    onError: () => addToast('שגיאה בביטול', 'error'),
  });

  const handleAdvanceStatus = (e: React.MouseEvent, orderId: string, currentStatus: string) => {
    e.stopPropagation();
    const next = NEXT_STATUS[currentStatus];
    if (next) {
      statusMutation.mutate({ orderId, newStatus: next });
    }
  };

  const handleOpenPayModal = (e: React.MouseEvent, order: any) => {
    e.stopPropagation();
    const total = Number(order.total || 0);
    const paid = Number(order.paidAmount || 0);
    setPayAmount(String(Math.round(total - paid)));
    setPayMethod('CASH');
    setPayModal({ orderId: order.id, total, paid });
    setMenuOrderId(null);
  };

  const handleCancel = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (confirm('בטוח לבטל את ההזמנה?')) {
      cancelMutation.mutate(orderId);
    }
  };

  // Count summary
  const orders = data?.orders ?? [];
  const totalCount = data?.total ?? 0;

  return (
    <div className="p-6 space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">הזמנות</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{totalCount} הזמנות</span>
          <Link to="/orders/new" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> הזמנה חדשה
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="חיפוש לפי מספר הזמנה או שם לקוח..."
          className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => { setStatus(tab.key); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              status === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? <SkeletonTable rows={8} cols={9} /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-gray-500">
                <th className="text-right py-3 px-4">מספר</th>
                <th className="text-right py-3 px-4">לקוח</th>
                <th className="text-right py-3 px-4">סטטוס</th>
                <th className="text-right py-3 px-4">עדיפות</th>
                <th className="text-right py-3 px-4">פריטים</th>
                <th className="text-right py-3 px-4">סכום</th>
                <th className="text-right py-3 px-4">תשלום</th>
                <th className="text-right py-3 px-4">תאריך</th>
                <th className="text-center py-3 px-4 w-24">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: any) => {
                const nextStatus = NEXT_STATUS[order.status];
                const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCELLED';
                return (
                  <tr key={order.id} className="border-t hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/orders/${order.id}`)}>
                    <td className="py-3 px-4 font-mono text-blue-600">{order.orderNumber}</td>
                    <td className="py-3 px-4">{order.customer?.name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {order.priority === 'EXPRESS' && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">אקספרס</span>}
                      {order.priority === 'SAME_DAY' && <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-xs font-medium">אותו יום</span>}
                      {order.priority === 'NORMAL' && <span className="text-gray-400 text-xs">רגיל</span>}
                    </td>
                    <td className="py-3 px-4">{order.items?.length ?? 0}</td>
                    <td className="py-3 px-4 font-medium">{Number(order.total).toLocaleString()} ₪</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${PAYMENT_COLORS[order.paymentStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                        {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400">{new Date(order.receivedAt).toLocaleDateString('he-IL')}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                        {/* Quick advance status */}
                        {nextStatus && !isTerminal && (
                          <button
                            onClick={(e) => handleAdvanceStatus(e, order.id, order.status)}
                            disabled={statusMutation.isPending}
                            title={`קדם ל: ${STATUS_LABELS[nextStatus]}`}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-30"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        )}
                        {/* Context menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOrderId(menuOrderId === order.id ? null : order.id); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {menuOrderId === order.id && (
                            <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 py-1 min-w-[160px]">
                              {order.paymentStatus !== 'PAID' && (
                                <button onClick={(e) => handleOpenPayModal(e, order)}
                                  className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                                  <CreditCard className="w-3.5 h-3.5" /> רשום תשלום
                                </button>
                              )}
                              {!isTerminal && (
                                <button onClick={(e) => handleCancel(e, order.id)}
                                  className="w-full text-right px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                  <Ban className="w-3.5 h-3.5" /> בטל הזמנה
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">אין הזמנות</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded border disabled:opacity-30">הקודם</button>
          <span className="px-3 py-1 text-sm text-gray-500">עמוד {page} מתוך {Math.ceil(data.total / 20)}</span>
          <button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded border disabled:opacity-30">הבא</button>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">רישום תשלום</h3>
              <button onClick={() => setPayModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">סה"כ הזמנה:</span>
                <span className="font-medium">{payModal.total.toLocaleString()} ₪</span>
              </div>
              {payModal.paid > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">שולם כבר:</span>
                  <span className="font-medium text-green-600">{payModal.paid.toLocaleString()} ₪</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-gray-500">יתרה לתשלום:</span>
                <span className="font-bold text-blue-600">{(payModal.total - payModal.paid).toLocaleString()} ₪</span>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">סכום</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">אמצעי תשלום</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="CASH">מזומן</option>
                  <option value="CREDIT_CARD">אשראי</option>
                  <option value="BANK_TRANSFER">העברה בנקאית</option>
                  <option value="PREPAID">מקדמה</option>
                </select>
              </div>
              <button
                onClick={() => payMutation.mutate({ orderId: payModal.orderId, amount: Number(payAmount), method: payMethod })}
                disabled={!payAmount || Number(payAmount) <= 0 || payMutation.isPending}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 font-medium"
              >
                {payMutation.isPending ? 'שומר...' : 'רשום תשלום'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close context menu on outside click */}
      {menuOrderId && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOrderId(null)} />
      )}
    </div>
  );
}
