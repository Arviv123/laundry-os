import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Wallet, Search, Plus, ArrowUpCircle, ArrowDownCircle, RotateCcw } from 'lucide-react';

export default function PrepaidPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [loadAmount, setLoadAmount] = useState('');

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers-prepaid', search],
    queryFn: () => api.get('/crm/customers', { params: { search: search || undefined, limit: 20 } }).then(r => {
      const d = r.data.data;
      return Array.isArray(d) ? d : d?.customers ?? [];
    }),
  });

  const { data: prepaidData, isLoading: loadingPrepaid } = useQuery({
    queryKey: ['prepaid', selectedCustomer?.id],
    queryFn: () => api.get(`/prepaid/${selectedCustomer.id}`).then(r => r.data.data),
    enabled: !!selectedCustomer,
  });

  const { data: history } = useQuery({
    queryKey: ['prepaid-history', selectedCustomer?.id],
    queryFn: () => api.get(`/prepaid/${selectedCustomer.id}/history`).then(r => r.data.data),
    enabled: !!selectedCustomer,
  });

  const loadMutation = useMutation({
    mutationFn: (amount: number) => api.post(`/prepaid/${selectedCustomer.id}/load`, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepaid', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['prepaid-history', selectedCustomer?.id] });
      setLoadAmount('');
    },
  });

  const TYPE_LABELS: Record<string, string> = { LOAD: 'טעינה', USE: 'שימוש', REFUND: 'זיכוי' };
  const TYPE_ICONS: Record<string, typeof Plus> = { LOAD: ArrowUpCircle, USE: ArrowDownCircle, REFUND: RotateCcw };
  const TYPE_COLORS: Record<string, string> = {
    LOAD: 'text-green-600 bg-green-50',
    USE: 'text-red-600 bg-red-50',
    REFUND: 'text-blue-600 bg-blue-50',
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Wallet className="w-7 h-7 text-blue-600" /> חשבונות מקדמה
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="relative mb-4">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לקוח..." className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {loadingCustomers && <p className="text-gray-400 text-sm">טוען...</p>}
            {customers?.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedCustomer(c)}
                className={`w-full text-right p-3 rounded-lg transition-colors ${
                  selectedCustomer?.id === c.id ? 'bg-blue-50 border-blue-200 border' : 'hover:bg-gray-50 border border-transparent'
                }`}>
                <div className="font-medium text-gray-800">{c.name}</div>
                <div className="text-xs text-gray-400">{c.phone}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Prepaid Account */}
        {selectedCustomer ? (
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{selectedCustomer.name}</h2>
                  <p className="text-sm text-gray-400">{selectedCustomer.phone} | {selectedCustomer.email}</p>
                </div>
                <div className="text-left">
                  <div className="text-sm text-gray-400">יתרה נוכחית</div>
                  <div className="text-3xl font-bold text-blue-600">
                    {loadingPrepaid ? '...' : `${Number(prepaidData?.balance ?? 0).toLocaleString()} ₪`}
                  </div>
                </div>
              </div>

              {/* Load Funds */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-sm text-gray-500 mb-1 block">טעינת סכום</label>
                  <input type="number" value={loadAmount} onChange={e => setLoadAmount(e.target.value)}
                    placeholder="הזן סכום..." className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex gap-2">
                  {[50, 100, 200, 500].map(amount => (
                    <button key={amount} onClick={() => setLoadAmount(String(amount))}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">
                      {amount} ₪
                    </button>
                  ))}
                </div>
                <button onClick={() => loadAmount && loadMutation.mutate(Number(loadAmount))}
                  disabled={!loadAmount || loadMutation.isPending}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 font-medium">
                  {loadMutation.isPending ? 'טוען...' : 'טען'}
                </button>
              </div>
              {loadMutation.isError && <p className="text-red-500 text-sm mt-2">שגיאה בטעינה</p>}
            </div>

            {/* Transaction History */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-700 mb-4">היסטוריית תנועות</h3>
              <div className="space-y-2">
                {history?.transactions?.map((tx: any) => {
                  const Icon = TYPE_ICONS[tx.type] || Plus;
                  return (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${TYPE_COLORS[tx.type]}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-700">{TYPE_LABELS[tx.type] || tx.type}</div>
                          <div className="text-xs text-gray-400">{tx.description}</div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className={`font-semibold ${tx.type === 'USE' ? 'text-red-600' : 'text-green-600'}`}>
                          {tx.type === 'USE' ? '-' : '+'}{Number(tx.amount).toLocaleString()} ₪
                        </div>
                        <div className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleDateString('he-IL')}</div>
                      </div>
                    </div>
                  );
                })}
                {(!history?.transactions || history.transactions.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-4">אין תנועות עדיין</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>בחר לקוח מהרשימה כדי לצפות בחשבון המקדמה</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
