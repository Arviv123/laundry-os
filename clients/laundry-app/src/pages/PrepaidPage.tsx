import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import { SkeletonCard } from '../components/Skeleton';
import api from '../lib/api';
import {
  Wallet, Search, Plus, ArrowUpCircle, ArrowDownCircle, RotateCcw,
  CreditCard, Banknote, User, X, History,
} from 'lucide-react';

export default function PrepaidPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [loadAmount, setLoadAmount] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [loadMethod, setLoadMethod] = useState('CASH');

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers-prepaid', debouncedSearch],
    queryFn: () => api.get('/crm/customers', { params: { search: debouncedSearch || undefined, limit: 20 } }).then(r => {
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
    mutationFn: (data: { amount: number; method: string }) =>
      api.post(`/prepaid/${selectedCustomer.id}/load`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepaid', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['prepaid-history', selectedCustomer?.id] });
      setLoadAmount('');
      setShowLoadModal(false);
      addToast('יתרה נטענה בהצלחה');
    },
    onError: () => addToast('שגיאה בטעינת יתרה', 'error'),
  });

  const balance = Number(prepaidData?.balance ?? 0);

  const TYPE_LABELS: Record<string, string> = { LOAD: 'טעינה', USE: 'שימוש', REFUND: 'זיכוי' };
  const TYPE_ICONS: Record<string, typeof Plus> = { LOAD: ArrowUpCircle, USE: ArrowDownCircle, REFUND: RotateCcw };
  const TYPE_COLORS: Record<string, string> = {
    LOAD: 'text-green-600 bg-green-50',
    USE: 'text-red-600 bg-red-50',
    REFUND: 'text-blue-600 bg-blue-50',
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Wallet className="w-7 h-7 text-blue-600" /> כרטיסיות מקדמה
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="relative mb-4">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לקוח..."
              className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-2 max-h-[65vh] overflow-y-auto">
            {loadingCustomers && <SkeletonCard />}
            {customers?.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedCustomer(c)}
                className={`w-full text-right p-3 rounded-lg transition-colors ${
                  selectedCustomer?.id === c.id ? 'bg-blue-50 border-blue-200 border' : 'hover:bg-gray-50 border border-transparent'
                }`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.phone}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Prepaid Account */}
        {selectedCustomer ? (
          <div className="lg:col-span-2 space-y-4">
            {/* Balance Card */}
            <div className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">{selectedCustomer.name}</h2>
                  <p className="text-blue-200 text-sm">{selectedCustomer.phone} | כרטיסיית מקדמה</p>
                </div>
                <Wallet className="w-10 h-10 text-blue-300" />
              </div>
              <div className="mb-6">
                <div className="text-sm text-blue-200 mb-1">יתרה נוכחית</div>
                <div className="text-4xl font-bold">
                  {loadingPrepaid ? '...' : `${balance.toLocaleString()} ₪`}
                </div>
              </div>
              <button onClick={() => setShowLoadModal(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-white/20 backdrop-blur rounded-xl text-white font-medium hover:bg-white/30 transition-colors">
                <Plus className="w-5 h-5" /> טען כרטיסייה
              </button>
            </div>

            {/* Quick Load Buttons */}
            <div className="grid grid-cols-4 gap-3">
              {[50, 100, 200, 500].map(amount => (
                <button key={amount}
                  onClick={() => { setLoadAmount(String(amount)); setShowLoadModal(true); }}
                  className="bg-white rounded-xl shadow-sm border p-4 text-center hover:shadow-md transition-all hover:-translate-y-0.5">
                  <div className="text-lg font-bold text-blue-600">{amount} ₪</div>
                  <div className="text-xs text-gray-400">טעינה מהירה</div>
                </button>
              ))}
            </div>

            {/* Transaction History */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-400" /> היסטוריית תנועות
              </h3>
              <div className="space-y-2">
                {history?.transactions?.map((tx: any) => {
                  const Icon = TYPE_ICONS[tx.type] || Plus;
                  return (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${TYPE_COLORS[tx.type]}`}>
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
                  <p className="text-sm text-gray-400 text-center py-8">
                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    אין תנועות עדיין
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">בחר לקוח מהרשימה</p>
              <p className="text-sm">כדי לצפות בכרטיסיית המקדמה ולטעון יתרה</p>
            </div>
          </div>
        )}
      </div>

      {/* Load Modal */}
      {showLoadModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowLoadModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">טעינת כרטיסייה</h3>
                <p className="text-sm text-gray-500">{selectedCustomer.name}</p>
              </div>
              <button onClick={() => setShowLoadModal(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">סכום לטעינה</label>
                <div className="relative">
                  <input type="number" value={loadAmount} onChange={e => setLoadAmount(e.target.value)}
                    className="w-full px-4 py-3 border rounded-xl text-lg font-bold text-center focus:ring-2 focus:ring-blue-500"
                    placeholder="0" autoFocus />
                  <span className="absolute left-4 top-3.5 text-gray-400">₪</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[50, 100, 200, 500, 1000].map(amount => (
                    <button key={amount} onClick={() => setLoadAmount(String(amount))}
                      className={`flex-1 py-1.5 rounded-lg text-sm ${
                        loadAmount === String(amount) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {amount}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">אמצעי תשלום</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'CASH', label: 'מזומן', icon: Banknote },
                    { key: 'CREDIT', label: 'אשראי', icon: CreditCard },
                  ].map(pm => {
                    const Icon = pm.icon;
                    return (
                      <button key={pm.key} onClick={() => setLoadMethod(pm.key)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                          loadMethod === pm.key
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        <Icon className="w-4 h-4" /> {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>יתרה נוכחית:</span>
                  <span className="font-medium">{balance.toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between text-blue-700 font-bold mt-1">
                  <span>יתרה לאחר טעינה:</span>
                  <span>{(balance + Number(loadAmount || 0)).toLocaleString()} ₪</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowLoadModal(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => loadAmount && loadMutation.mutate({ amount: Number(loadAmount), method: loadMethod })}
                disabled={!loadAmount || Number(loadAmount) <= 0 || loadMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:opacity-40">
                {loadMutation.isPending ? 'טוען...' : `טען ${Number(loadAmount || 0).toLocaleString()} ₪`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
