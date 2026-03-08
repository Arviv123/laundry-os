import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import { SkeletonGrid } from '../components/Skeleton';
import api from '../lib/api';
import {
  Users, Search, Phone, Mail, Plus, X, UserPlus,
  Upload, Wallet, ShoppingBag, MapPin,
} from 'lucide-react';

export default function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState('B2C');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: () => api.get('/crm/customers', { params: { search: debouncedSearch || undefined, limit: 50 } }).then(r => r.data.data ?? r.data),
  });

  const customers = Array.isArray(data) ? data : data?.customers ?? [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/crm/customers', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowNewForm(false);
      setNewName(''); setNewPhone(''); setNewEmail('');
      addToast(`לקוח ${res.data.data.name} נוצר בהצלחה`);
    },
    onError: () => addToast('שגיאה ביצירת לקוח', 'error'),
  });

  return (
    <div className="p-6 space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Users className="w-7 h-7 text-blue-600" /> לקוחות
        </h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/import')}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm">
            <Upload className="w-4 h-4" /> ייבוא
          </button>
          <button onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
            <UserPlus className="w-4 h-4" /> לקוח חדש
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או אימייל..."
          className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isLoading ? <SkeletonGrid count={6} /> : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map((c: any) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/customers/${c.id}`)}>
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
                {c.totalSpent !== undefined && Number(c.totalSpent) > 0 && <span className="text-gray-500">{"סה\"כ:"} <span className="font-medium text-gray-700">{Number(c.totalSpent).toLocaleString()} ₪</span></span>}
              </div>
            )}
          </div>
        ))}
        {customers.length === 0 && (
          <p className="col-span-3 text-center text-gray-400">לא נמצאו לקוחות</p>
        )}
      </div>
      )}

      {/* New Customer Modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNewForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">לקוח חדש</h3>
              <button onClick={() => setShowNewForm(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">טלפון</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">אימייל</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">סוג לקוח</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewType('B2C')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${newType === 'B2C' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    פרטי (B2C)
                  </button>
                  <button onClick={() => setNewType('B2B')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${newType === 'B2B' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    עסקי (B2B)
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowNewForm(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => createMutation.mutate({ name: newName, phone: newPhone || undefined, email: newEmail || undefined, type: newType, status: 'ACTIVE' })}
                disabled={!newName || createMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createMutation.isPending ? 'שומר...' : 'צור לקוח'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
