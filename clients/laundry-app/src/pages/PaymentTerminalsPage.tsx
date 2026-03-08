import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  CreditCard, Plus, Trash2, X, CheckCircle, XCircle, Settings2, Wifi,
  ArrowDownUp, RefreshCw,
} from 'lucide-react';

const PROVIDERS: Record<string, string> = {
  PELE_CARD: 'פלא כארד',
  CARDCOM: 'CardCom',
  TRANZILA: 'טרנזילה',
  MESHULAM: 'משולם',
  PAYPLUS: 'PayPlus',
  EMV_DIRECT: 'EMV Direct',
  OTHER: 'אחר',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  APPROVED: { label: 'אושר', color: 'bg-green-100 text-green-700' },
  PENDING: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-700' },
  DECLINED: { label: 'נדחה', color: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'זוכה', color: 'bg-purple-100 text-purple-700' },
  CANCELLED: { label: 'בוטל', color: 'bg-gray-100 text-gray-600' },
  ERROR: { label: 'שגיאה', color: 'bg-red-100 text-red-600' },
};

export default function PaymentTerminalsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('terminals');
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTerminalId, setFormTerminalId] = useState('');
  const [formProvider, setFormProvider] = useState('PELE_CARD');
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formMerchantId, setFormMerchantId] = useState('');

  const { data: terminals, isLoading } = useQuery({
    queryKey: ['payment-terminals'],
    queryFn: () => api.get('/payment-terminals').then(r => r.data.data).catch(() => []),
  });

  const { data: txData } = useQuery({
    queryKey: ['terminal-transactions', selectedTerminal],
    queryFn: () => api.get(`/payment-terminals/${selectedTerminal}/transactions`).then(r => r.data.data),
    enabled: !!selectedTerminal,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/payment-terminals', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terminals'] });
      resetForm();
      addToast('מסוף נוסף בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payment-terminals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terminals'] });
      addToast('מסוף הוסר');
    },
    onError: () => addToast('שגיאה בהסרת מסוף', 'error'),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/payment-terminals/${id}/test`),
    onSuccess: (res: any) => {
      addToast(res.data.data.connected ? 'חיבור תקין!' : 'חיבור נכשל', res.data.data.connected ? 'success' : 'error');
    },
    onError: () => addToast('בדיקת חיבור נכשלה', 'error'),
  });

  const resetForm = () => {
    setShowForm(false);
    setFormName(''); setFormTerminalId(''); setFormProvider('PELE_CARD');
    setFormApiUrl(''); setFormApiKey(''); setFormMerchantId('');
  };

  const handleSubmit = () => {
    createMutation.mutate({
      name: formName,
      terminalId: formTerminalId,
      provider: formProvider,
      apiUrl: formApiUrl || undefined,
      apiKey: formApiKey || undefined,
      merchantId: formMerchantId || undefined,
    });
  };

  const terminalList = Array.isArray(terminals) ? terminals : [];
  const txList = txData?.transactions || [];

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-indigo-600" /> מסופי אשראי
        </h1>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
          <Plus className="w-4 h-4" /> מסוף חדש
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button onClick={() => setActiveTab('terminals')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'terminals' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'}`}>
          מסופים ({terminalList.length})
        </button>
        <button onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'transactions' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'}`}>
          עסקאות
        </button>
      </div>

      {/* Terminals Tab */}
      {activeTab === 'terminals' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {terminalList.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className={`w-5 h-5 ${t.isActive ? 'text-indigo-500' : 'text-gray-400'}`} />
                  <h3 className="font-semibold text-gray-800">{t.name}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => testMutation.mutate(t.id)}
                    disabled={testMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-green-600 rounded" title="בדוק חיבור">
                    <Wifi className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { if (confirm(`למחוק את ${t.name}?`)) deleteMutation.mutate(t.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">ספק:</span>
                  <span className="font-medium">{PROVIDERS[t.provider] || t.provider}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">מזהה:</span>
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{t.terminalId}</span>
                </div>
                {t.merchantId && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">סוחר:</span>
                    <span className="text-xs">{t.merchantId}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${t.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className={t.isActive ? 'text-green-600' : 'text-gray-500'}>
                    {t.isActive ? 'פעיל' : 'לא פעיל'}
                  </span>
                </div>
              </div>
              <button onClick={() => { setSelectedTerminal(t.id); setActiveTab('transactions'); }}
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                <ArrowDownUp className="w-3 h-3" /> צפה בעסקאות
              </button>
            </div>
          ))}
          {terminalList.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-12">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>אין מסופי אשראי מוגדרים</p>
              <p className="text-sm mt-1">הוסף מסוף כדי להתחיל לקבל תשלומים בכרטיס</p>
            </div>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">עסקאות אשראי</h3>
            {terminalList.length > 0 && (
              <select value={selectedTerminal || ''} onChange={e => setSelectedTerminal(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm">
                <option value="">בחר מסוף</option>
                {terminalList.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="divide-y">
            {!selectedTerminal && (
              <p className="text-center text-gray-400 text-sm py-8">בחר מסוף כדי לראות עסקאות</p>
            )}
            {selectedTerminal && txList.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">אין עסקאות</p>
            )}
            {txList.map((tx: any) => {
              const st = STATUS_LABELS[tx.status] || { label: tx.status, color: 'bg-gray-100 text-gray-600' };
              return (
                <div key={tx.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        {tx.customer?.name || 'לקוח אנונימי'}
                        {tx.last4 && <span className="text-gray-400 mr-2">****{tx.last4}</span>}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(tx.transactionDate).toLocaleString('he-IL')}
                        {tx.installments > 1 && ` | ${tx.installments} תשלומים`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${st.color}`}>{st.label}</span>
                    <span className="font-semibold text-gray-800">{Number(tx.amount).toLocaleString()} ₪</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Terminal Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={resetForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">מסוף אשראי חדש</h3>
              <button onClick={resetForm} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם המסוף *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="קופה ראשית" className="w-full px-3 py-2 border rounded-lg" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">ספק</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(PROVIDERS).slice(0, 6).map(([key, label]) => (
                    <button key={key} onClick={() => setFormProvider(key)}
                      className={`py-2 rounded-lg text-xs font-medium ${
                        formProvider === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">מזהה מסוף *</label>
                <input value={formTerminalId} onChange={e => setFormTerminalId(e.target.value)}
                  placeholder="T-12345" className="w-full px-3 py-2 border rounded-lg font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">מזהה סוחר</label>
                  <input value={formMerchantId} onChange={e => setFormMerchantId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">API Key</label>
                  <input type="password" value={formApiKey} onChange={e => setFormApiKey(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">API URL</label>
                <input value={formApiUrl} onChange={e => setFormApiUrl(e.target.value)}
                  placeholder="https://api.provider.co.il" className="w-full px-3 py-2 border rounded-lg font-mono text-sm" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={resetForm}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button onClick={handleSubmit}
                disabled={!formName || !formTerminalId || createMutation.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createMutation.isPending ? 'שומר...' : 'הוסף מסוף'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
