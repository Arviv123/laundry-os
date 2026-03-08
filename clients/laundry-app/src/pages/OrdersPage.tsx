import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { STATUS_LABELS, STATUS_COLORS, PAYMENT_LABELS, PAYMENT_COLORS } from '../lib/constants';
import { SkeletonTable } from '../components/Skeleton';
import api from '../lib/api';
import { Plus, Search } from 'lucide-react';

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
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status, debouncedSearch, page],
    queryFn: () => api.get('/orders', { params: { status: status || undefined, search: debouncedSearch || undefined, page, limit: 20 } }).then(r => r.data.data),
  });

  return (
    <div className="p-6 space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">הזמנות</h1>
        <Link to="/orders/new" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> הזמנה חדשה
        </Link>
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
        {isLoading ? <SkeletonTable rows={8} cols={8} /> : (
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
              </tr>
            </thead>
            <tbody>
              {data?.orders?.map((order: any) => (
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
                </tr>
              ))}
              {data?.orders?.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">אין הזמנות</td></tr>
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
    </div>
  );
}
