import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Landmark, Plus, X, CheckCircle, ArrowRight, AlertTriangle, Lock,
} from 'lucide-react';

const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('he-IL');

export default function BankReconciliationPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data.data),
  });

  const { data: statements, isLoading } = useQuery({
    queryKey: ['bank-recon', yearFilter],
    queryFn: () => api.get('/bank-recon', { params: { year: yearFilter } }).then(r => r.data.data),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['bank-recon-detail', selectedId],
    queryFn: () => api.get(`/bank-recon/${selectedId}`).then(r => r.data.data),
    enabled: !!selectedId,
  });

  const clearMutation = useMutation({
    mutationFn: ({ lineId, cleared }: { lineId: string; cleared: boolean }) =>
      api.patch(`/bank-recon/lines/${lineId}/clear`, { cleared, bankStatementId: selectedId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-recon-detail', selectedId] }),
    onError: () => addToast('שגיאה בעדכון', 'error'),
  });

  const reconcileMutation = useMutation({
    mutationFn: (id: string) => api.post(`/bank-recon/${id}/reconcile`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-recon'] });
      queryClient.invalidateQueries({ queryKey: ['bank-recon-detail', selectedId] });
      addToast('התאמה הושלמה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה — הפרש חייב להיות 0', 'error'),
  });

  const statementList = Array.isArray(statements) ? statements : [];
  const bankAccounts = (accounts ?? []).filter((a: any) => a.type === 'ASSET' && (a.code?.startsWith('1') || a.name?.includes('בנק') || a.name?.includes('Bank')));

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}</div>
    </div>
  );

  // Detail view
  if (selectedId && detail) {
    const summary = detail.summary ?? {};
    const lines = detail.lines ?? [];
    const isReconciled = detail.statement?.status === 'RECONCILED';

    return (
      <div className="p-6 space-y-6 animate-fadeIn">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">התאמת בנק — {detail.statement?.period}</h1>
            <p className="text-gray-500 text-sm">חשבון: {detail.statement?.account?.code} — {detail.statement?.account?.name}</p>
          </div>
          {isReconciled ? (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> מותאם
            </span>
          ) : (
            <button onClick={() => reconcileMutation.mutate(selectedId)}
              disabled={reconcileMutation.isPending || summary.difference !== 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-40">
              <CheckCircle className="w-4 h-4" /> {reconcileMutation.isPending ? 'מתאים...' : 'סיים התאמה'}
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="text-sm text-gray-500 mb-1">יתרת פתיחה</div>
            <div className="text-xl font-bold">{fmt(detail.statement?.openingBalance)} ₪</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="text-sm text-gray-500 mb-1">יתרת סגירה (בנק)</div>
            <div className="text-xl font-bold">{fmt(detail.statement?.closingBalance)} ₪</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="text-sm text-gray-500 mb-1">סה״כ מותאם</div>
            <div className="text-xl font-bold text-green-600">{fmt(summary.clearedTotal)} ₪</div>
          </div>
          <div className={`bg-white rounded-xl shadow-sm border p-5 ${summary.difference !== 0 ? 'border-red-300' : 'border-green-300'}`}>
            <div className="text-sm text-gray-500 mb-1">הפרש</div>
            <div className={`text-xl font-bold ${summary.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
              {fmt(summary.difference)} ₪
            </div>
            {summary.difference !== 0 && (
              <div className="text-xs text-red-500 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" /> יש להתאים עד שההפרש יהיה 0
              </div>
            )}
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">תנועות ({lines.length})</h2>
            <span className="text-xs text-gray-400">
              {lines.filter((l: any) => l.cleared).length} / {lines.length} מותאמות
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-center px-3 py-2 w-10">V</th>
                  <th className="text-right px-4 py-2">תאריך</th>
                  <th className="text-right px-4 py-2">אסמכתא</th>
                  <th className="text-right px-4 py-2">תיאור</th>
                  <th className="text-right px-4 py-2">סכום</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: any) => (
                  <tr key={line.id} className={`border-t hover:bg-gray-50 ${line.cleared ? 'bg-green-50/50' : ''}`}>
                    <td className="text-center px-3 py-2">
                      <input type="checkbox" checked={!!line.cleared} disabled={isReconciled}
                        onChange={() => clearMutation.mutate({ lineId: line.id, cleared: !line.cleared })}
                        className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer disabled:cursor-not-allowed" />
                    </td>
                    <td className="px-4 py-2">{line.date ? new Date(line.date).toLocaleDateString('he-IL') : '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.reference}</td>
                    <td className="px-4 py-2">{line.description}</td>
                    <td className={`px-4 py-2 font-medium ${Number(line.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(line.amount)} ₪
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">אין תנועות בתקופה</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Landmark className="w-7 h-7 text-blue-600" /> התאמות בנק
        </h1>
        <div className="flex gap-2">
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> התאמה חדשה
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {statementList.map((stmt: any) => (
          <div key={stmt.id} onClick={() => setSelectedId(stmt.id)}
            className="bg-white rounded-xl shadow-sm border p-5 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stmt.status === 'RECONCILED' ? 'bg-green-100' : 'bg-blue-100'
                }`}>
                  {stmt.status === 'RECONCILED' ? <Lock className="w-5 h-5 text-green-600" /> : <Landmark className="w-5 h-5 text-blue-600" />}
                </div>
                <div>
                  <div className="font-medium">{stmt.account?.name ?? 'חשבון בנק'}</div>
                  <div className="text-sm text-gray-400">{stmt.period}</div>
                </div>
              </div>
              <div className="text-left">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  stmt.status === 'RECONCILED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {stmt.status === 'RECONCILED' ? 'מותאם' : 'בתהליך'}
                </span>
                <div className="text-xs text-gray-400 mt-1">
                  {stmt.clearedCount ?? 0}/{stmt.lineCount ?? 0} תנועות
                </div>
              </div>
            </div>
          </div>
        ))}
        {statementList.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">אין התאמות בנק</p>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateStatementModal
          accounts={bankAccounts}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            queryClient.invalidateQueries({ queryKey: ['bank-recon'] });
            setShowCreate(false);
            setSelectedId(id);
            addToast('התאמה נוצרה');
          }}
        />
      )}
    </div>
  );
}

function CreateStatementModal({ accounts, onClose, onCreated }: {
  accounts: any[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { addToast } = useToast();
  const [accountId, setAccountId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/bank-recon', data),
    onSuccess: (res) => onCreated(res.data?.data?.id),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !period) { addToast('נא למלא חשבון ותקופה', 'error'); return; }
    mutation.mutate({
      accountId,
      period,
      openingBalance: parseFloat(openingBalance) || 0,
      closingBalance: parseFloat(closingBalance) || 0,
      notes: notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">התאמת בנק חדשה</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">חשבון בנק</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
              <option value="">בחר חשבון...</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">תקופה</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">יתרת פתיחה</label>
              <input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="0.00" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">יתרת סגירה (בנק)</label>
              <input type="number" step="0.01" value={closingBalance} onChange={e => setClosingBalance(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">הערות</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {mutation.isPending ? 'יוצר...' : 'צור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
