import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { BarChart3, Search, FileText, Plus } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלחה', PAID: 'שולמה', PARTIALLY_PAID: 'שולמה חלקית',
  OVERDUE: 'באיחור', CANCELLED: 'בוטלה', VOID: 'מבוטלת',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700', PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700',
  OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', search, statusFilter],
    queryFn: () => api.get('/invoices', {
      params: { search: search || undefined, status: statusFilter || undefined, limit: 50 },
    }).then(r => r.data.data),
  });

  const invoices = Array.isArray(data) ? data : data?.invoices ?? [];

  const statuses = ['', 'DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-600" /> חשבוניות
        </h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> חשבונית חדשה
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש חשבונית..." className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {s ? STATUS_LABELS[s] : 'הכל'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
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
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">טוען...</td></tr>
            )}
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="border-t hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-mono text-blue-600">{inv.invoiceNumber ?? inv.number}</td>
                <td className="px-4 py-3">{inv.customer?.name ?? inv.customerName ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[inv.status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABELS[inv.status] ?? inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{Number(inv.total ?? 0).toLocaleString()} ₪</td>
                <td className="px-4 py-3 text-gray-500">
                  {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('he-IL') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('he-IL') : '—'}
                </td>
              </tr>
            ))}
            {!isLoading && invoices.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                אין חשבוניות
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
