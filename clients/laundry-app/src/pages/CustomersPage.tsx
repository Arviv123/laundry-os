import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Users, Search, Phone, Mail } from 'lucide-react';

export default function CustomersPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get('/crm/customers', { params: { search: search || undefined, limit: 50 } }).then(r => r.data.data ?? r.data),
  });

  const customers = Array.isArray(data) ? data : data?.customers ?? [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Users className="w-7 h-7 text-blue-600" /> לקוחות
      </h1>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לקוח..." className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="col-span-3 text-center text-gray-400">טוען...</p>}
        {customers.map((c: any) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{c.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  c.status === 'LEAD' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{c.status === 'ACTIVE' ? 'פעיל' : c.status === 'LEAD' ? 'ליד' : c.status}</span>
              </div>
              <span className="text-xs text-gray-400">{c.type}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-gray-500">
              {c.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{c.phone}</div>}
              {c.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{c.email}</div>}
            </div>
            {(c.totalOrders !== undefined || c.totalSpent !== undefined) && (
              <div className="mt-3 pt-3 border-t flex gap-4 text-sm">
                {c.totalOrders !== undefined && <span className="text-gray-500">הזמנות: <span className="font-medium text-gray-700">{c.totalOrders}</span></span>}
                {c.totalSpent !== undefined && Number(c.totalSpent) > 0 && <span className="text-gray-500">סה"כ: <span className="font-medium text-gray-700">{Number(c.totalSpent).toLocaleString()} ₪</span></span>}
              </div>
            )}
          </div>
        ))}
        {customers.length === 0 && !isLoading && (
          <p className="col-span-3 text-center text-gray-400">לא נמצאו לקוחות</p>
        )}
      </div>
    </div>
  );
}
