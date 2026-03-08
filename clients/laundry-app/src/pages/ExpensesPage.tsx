import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Receipt, Plus, Trash2, X, Check, XCircle, ChevronDown,
  FileText, Calendar, DollarSign,
} from 'lucide-react';

const CATEGORIES = ['חומרי ניקוי', 'תחזוקה', 'חשמל/מים', 'שכירות', 'משכורות', 'שילוח', 'ציוד', 'שיווק', 'ביטוח', 'אחר'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'טיוטה', color: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'הוגש', color: 'bg-blue-100 text-blue-700' },
  APPROVED: { label: 'אושר', color: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'נדחה', color: 'bg-red-100 text-red-700' },
  PAID: { label: 'שולם', color: 'bg-purple-100 text-purple-700' },
};

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Report form
  const [formTitle, setFormTitle] = useState('');
  const [formPeriod, setFormPeriod] = useState(new Date().toISOString().slice(0, 7));

  // Expense form
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState(CATEGORIES[0]);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expVat, setExpVat] = useState('');

  const { data: reports, isLoading } = useQuery({
    queryKey: ['expense-reports'],
    queryFn: () => api.get('/expenses').then(r => r.data.data).catch(() => []),
  });

  const createReportMutation = useMutation({
    mutationFn: (data: any) => api.post('/expenses', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
      setShowForm(false);
      setFormTitle(''); setFormPeriod(new Date().toISOString().slice(0, 7));
      addToast('דוח הוצאות נוצר');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  const addExpenseMutation = useMutation({
    mutationFn: (data: any) => api.post(`/expenses/${selectedReport.id}/expenses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
      setShowExpenseForm(false);
      setExpDesc(''); setExpAmount(''); setExpVat('');
      addToast('הוצאה נוספה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  const deleteReportMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
      setSelectedReport(null);
      addToast('דוח נמחק');
    },
    onError: () => addToast('שגיאה במחיקה', 'error'),
  });

  const reportList = Array.isArray(reports) ? reports : [];
  const totalExpenses = reportList.reduce((s: number, r: any) => s + Number(r.totalAmount || 0), 0);

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Receipt className="w-7 h-7 text-orange-600" /> הוצאות
        </h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 text-sm">
          <Plus className="w-4 h-4" /> דוח חדש
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500">סה"כ הוצאות</div>
          <div className="text-2xl font-bold text-gray-800">{totalExpenses.toLocaleString()} ₪</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500">דוחות</div>
          <div className="text-2xl font-bold text-gray-800">{reportList.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500">ממתין לאישור</div>
          <div className="text-2xl font-bold text-orange-600">
            {reportList.filter((r: any) => r.status === 'SUBMITTED').length}
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="flex gap-6">
        <div className="w-80 space-y-2">
          {reportList.map((report: any) => {
            const st = STATUS_LABELS[report.status] || STATUS_LABELS.DRAFT;
            return (
              <div key={report.id}
                onClick={() => setSelectedReport(report)}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow ${
                  selectedReport?.id === report.id ? 'ring-2 ring-orange-500' : ''
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-800 text-sm">{report.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> {report.period}
                </div>
                <div className="text-lg font-bold text-gray-800 mt-1">
                  {Number(report.totalAmount).toLocaleString()} ₪
                </div>
              </div>
            );
          })}
          {reportList.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">אין דוחות הוצאות</p>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1">
          {selectedReport ? (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">{selectedReport.title}</h2>
                <div className="flex gap-2">
                  <button onClick={() => setShowExpenseForm(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium">
                    <Plus className="w-3 h-3" /> הוצאה
                  </button>
                  <button onClick={() => { if (confirm('למחוק?')) deleteReportMutation.mutate(selectedReport.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="divide-y">
                {(selectedReport.expenses || []).map((exp: any) => (
                  <div key={exp.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{exp.description}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{exp.category}</span>
                        {new Date(exp.date).toLocaleDateString('he-IL')}
                      </div>
                    </div>
                    <div className="font-semibold text-gray-800">{Number(exp.amount).toLocaleString()} ₪</div>
                  </div>
                ))}
                {(!selectedReport.expenses || selectedReport.expenses.length === 0) && (
                  <p className="text-center text-gray-400 text-sm py-6">אין הוצאות בדוח</p>
                )}
              </div>

              <div className="border-t pt-4 flex items-center justify-between">
                <div className="text-lg font-bold">סה"כ: {Number(selectedReport.totalAmount).toLocaleString()} ₪</div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>בחר דוח הוצאות מהרשימה</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Report Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">דוח הוצאות חדש</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">כותרת *</label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  placeholder="הוצאות חודשיות" className="w-full px-3 py-2 border rounded-lg" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תקופה</label>
                <input type="month" value={formPeriod} onChange={e => setFormPeriod(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button onClick={() => createReportMutation.mutate({
                title: formTitle,
                period: formPeriod,
                employeeId: 'system', // TODO: link to actual employee
              })}
                disabled={!formTitle || createReportMutation.isPending}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createReportMutation.isPending ? 'יוצר...' : 'צור דוח'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseForm && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowExpenseForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">הוספת הוצאה</h3>
              <button onClick={() => setShowExpenseForm(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך</label>
                <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">קטגוריה</label>
                <select value={expCategory} onChange={e => setExpCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תיאור *</label>
                <input value={expDesc} onChange={e => setExpDesc(e.target.value)}
                  placeholder="תיאור ההוצאה" className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">סכום *</label>
                  <input type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)}
                    placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">מע"מ</label>
                  <input type="number" value={expVat} onChange={e => setExpVat(e.target.value)}
                    placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowExpenseForm(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button onClick={() => addExpenseMutation.mutate({
                date: expDate,
                category: expCategory,
                description: expDesc,
                amount: Number(expAmount),
                vatAmount: Number(expVat) || 0,
              })}
                disabled={!expDesc || !expAmount || addExpenseMutation.isPending}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {addExpenseMutation.isPending ? 'שומר...' : 'הוסף'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
