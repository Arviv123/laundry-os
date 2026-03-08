import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Banknote, Play, Square, ArrowDownCircle, ArrowUpCircle,
  Calculator, History, Clock, ChevronDown, RefreshCw, X,
  DollarSign, TrendingUp, AlertCircle,
} from 'lucide-react';

const DENOMINATIONS = [
  { value: 200, label: '200 ₪', type: 'bill' },
  { value: 100, label: '100 ₪', type: 'bill' },
  { value: 50, label: '50 ₪', type: 'bill' },
  { value: 20, label: '20 ₪', type: 'bill' },
  { value: 10, label: '10 ₪', type: 'coin' },
  { value: 5, label: '5 ₪', type: 'coin' },
  { value: 2, label: '2 ₪', type: 'coin' },
  { value: 1, label: '1 ₪', type: 'coin' },
  { value: 0.5, label: '50 אג׳', type: 'coin' },
  { value: 0.1, label: '10 אג׳', type: 'coin' },
];

export default function CashDrawerPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('shift');
  const [openingFloat, setOpeningFloat] = useState('0');
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [showCashIn, setShowCashIn] = useState(false);
  const [showCashOut, setShowCashOut] = useState(false);
  const [countDenoms, setCountDenoms] = useState<Record<number, number>>({});

  // Get terminals
  const { data: terminals } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn: () => api.get('/pos/terminals').then(r => r.data.data).catch(() => []),
  });

  const [selectedTerminal, setSelectedTerminal] = useState('');

  // Auto-select first terminal
  useEffect(() => {
    if (terminals?.length > 0 && !selectedTerminal) {
      setSelectedTerminal(terminals[0].id);
    }
  }, [terminals, selectedTerminal]);

  // Get current session for selected terminal
  const { data: currentSession, isLoading: sessionLoading } = useQuery({
    queryKey: ['pos-current-session', selectedTerminal],
    queryFn: async () => {
      if (!selectedTerminal) return null;
      // Find open sessions for this terminal
      const res = await api.get('/pos/sessions', { params: { terminalId: selectedTerminal, status: 'OPEN' } });
      const sessions = res.data.data || [];
      return sessions.length > 0 ? sessions[0] : null;
    },
    enabled: !!selectedTerminal,
  });

  // Get drawer balance
  const { data: drawerBalance } = useQuery({
    queryKey: ['drawer-balance', currentSession?.id],
    queryFn: () => api.get('/pos/drawer/balance', { params: { sessionId: currentSession.id } }).then(r => r.data.data),
    enabled: !!currentSession?.id,
  });

  // Get drawer history
  const { data: drawerHistory } = useQuery({
    queryKey: ['drawer-history', currentSession?.id],
    queryFn: () => api.get('/pos/drawer/history', { params: { sessionId: currentSession.id } }).then(r => r.data.data).catch(() => []),
    enabled: !!currentSession?.id,
  });

  // Get shift history
  const { data: shiftHistory } = useQuery({
    queryKey: ['shift-history'],
    queryFn: () => api.get('/pos/shifts').then(r => r.data.data).catch(() => []),
  });

  // Open session
  const openSessionMutation = useMutation({
    mutationFn: () => api.post('/pos/sessions/open', {
      terminalId: selectedTerminal,
      openingFloat: Number(openingFloat),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-current-session'] });
      setShowOpenShift(false);
      setOpeningFloat('0');
      addToast('משמרת נפתחה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בפתיחת משמרת', 'error'),
  });

  // Close session
  const closeSessionMutation = useMutation({
    mutationFn: () => api.post(`/pos/sessions/${currentSession.id}/close`, {
      closingFloat: drawerBalance?.balance ?? 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-current-session'] });
      queryClient.invalidateQueries({ queryKey: ['shift-history'] });
      addToast('משמרת נסגרה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בסגירת משמרת', 'error'),
  });

  // Cash in
  const cashInMutation = useMutation({
    mutationFn: () => api.post('/pos/drawer/cash-in', {
      sessionId: currentSession.id,
      amount: Number(cashAmount),
      reason: cashReason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawer-balance'] });
      queryClient.invalidateQueries({ queryKey: ['drawer-history'] });
      setCashAmount(''); setCashReason(''); setShowCashIn(false);
      addToast('כניסת מזומן נרשמה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  // Cash out
  const cashOutMutation = useMutation({
    mutationFn: () => api.post('/pos/drawer/cash-out', {
      sessionId: currentSession.id,
      amount: Number(cashAmount),
      reason: cashReason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawer-balance'] });
      queryClient.invalidateQueries({ queryKey: ['drawer-history'] });
      setCashAmount(''); setCashReason(''); setShowCashOut(false);
      addToast('יציאת מזומן נרשמה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  // Cash count
  const cashCountMutation = useMutation({
    mutationFn: () => {
      return api.post('/pos/drawer/count', {
        sessionId: currentSession.id,
        bills_200: countDenoms[200] || 0,
        bills_100: countDenoms[100] || 0,
        bills_50: countDenoms[50] || 0,
        bills_20: countDenoms[20] || 0,
        coins_10: countDenoms[10] || 0,
        coins_5: countDenoms[5] || 0,
        coins_2: countDenoms[2] || 0,
        coins_1: countDenoms[1] || 0,
        coins_050: countDenoms[0.5] || 0,
        coins_010: countDenoms[0.1] || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawer-balance'] });
      setCountDenoms({});
      addToast('ספירת קופה נשמרה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  const countTotal = DENOMINATIONS.reduce((sum, d) => sum + d.value * (countDenoms[d.value] || 0), 0);
  const terminalList = Array.isArray(terminals) ? terminals : [];
  const historyList = Array.isArray(drawerHistory) ? drawerHistory : [];
  const shiftList = Array.isArray(shiftHistory) ? shiftHistory : [];

  const sessionDuration = currentSession?.openedAt
    ? Math.floor((Date.now() - new Date(currentSession.openedAt).getTime()) / 60000)
    : 0;

  const tabs = [
    { id: 'shift', label: 'משמרת', icon: Play },
    { id: 'events', label: 'אירועי קופה', icon: ArrowDownCircle },
    { id: 'count', label: 'ספירת קופה', icon: Calculator },
    { id: 'history', label: 'היסטוריה', icon: History },
  ];

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Banknote className="w-7 h-7 text-green-600" /> קופה
        </h1>

        {terminalList.length > 1 && (
          <select value={selectedTerminal} onChange={e => setSelectedTerminal(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm">
            {terminalList.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Status Bar */}
      {currentSession ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <div>
              <div className="font-semibold text-green-800">משמרת פעילה</div>
              <div className="text-sm text-green-600 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                {Math.floor(sessionDuration / 60)}:{String(sessionDuration % 60).padStart(2, '0')} שעות
                | פתיחה: {new Date(currentSession.openedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <div className="text-sm text-gray-500">יתרה נוכחית</div>
              <div className="text-2xl font-bold text-green-700">
                {Number(drawerBalance?.balance ?? currentSession.openingFloat ?? 0).toLocaleString('he-IL')} ₪
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <Banknote className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">אין משמרת פעילה</p>
          {terminalList.length === 0 ? (
            <p className="text-sm text-amber-600 flex items-center gap-2 justify-center">
              <AlertCircle className="w-4 h-4" /> יש ליצור קופה/טרמינל לפני פתיחת משמרת
            </p>
          ) : (
            <button onClick={() => setShowOpenShift(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium">
              <Play className="w-5 h-5" /> פתח משמרת
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      {currentSession && (
        <>
          <div className="flex gap-2 border-b">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* ═══ Active Shift Tab ═══ */}
          {activeTab === 'shift' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="מזומן פתיחה" value={`${Number(currentSession.openingFloat).toLocaleString()} ₪`} icon={DollarSign} color="blue" />
              <StatCard label={'סה"כ מכירות'} value={`${Number(currentSession.totalSales || 0).toLocaleString()} ₪`} icon={TrendingUp} color="green" />
              <StatCard label={'סה"כ החזרים'} value={`${Number(currentSession.totalReturns || 0).toLocaleString()} ₪`} icon={RefreshCw} color="red" />

              <div className="md:col-span-3 flex gap-3">
                <button onClick={() => setShowCashIn(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium">
                  <ArrowDownCircle className="w-4 h-4" /> כניסת מזומן
                </button>
                <button onClick={() => setShowCashOut(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium">
                  <ArrowUpCircle className="w-4 h-4" /> יציאת מזומן
                </button>
                <button onClick={() => api.post('/pos/drawer/no-sale', { sessionId: currentSession.id }).then(() => addToast('מגירה נפתחה'))}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
                  <Banknote className="w-4 h-4" /> פתיחת מגירה (ללא מכירה)
                </button>
                <div className="flex-1" />
                <button onClick={() => { if (confirm('סגור משמרת?')) closeSessionMutation.mutate(); }}
                  disabled={closeSessionMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-40">
                  <Square className="w-4 h-4" /> סגור משמרת
                </button>
              </div>
            </div>
          )}

          {/* ═══ Events Tab ═══ */}
          {activeTab === 'events' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">אירועי קופה</h3>
                <div className="flex gap-2">
                  <button onClick={() => setShowCashIn(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                    <ArrowDownCircle className="w-3 h-3" /> כניסה
                  </button>
                  <button onClick={() => setShowCashOut(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium">
                    <ArrowUpCircle className="w-3 h-3" /> יציאה
                  </button>
                </div>
              </div>
              <div className="divide-y">
                {historyList.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">אין אירועים במשמרת הנוכחית</p>
                )}
                {historyList.map((ev: any) => (
                  <div key={ev.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      {ev.type === 'CASH_IN' && <ArrowDownCircle className="w-5 h-5 text-green-500" />}
                      {ev.type === 'CASH_OUT' && <ArrowUpCircle className="w-5 h-5 text-red-500" />}
                      {ev.type === 'NO_SALE' && <Banknote className="w-5 h-5 text-gray-400" />}
                      {ev.type === 'SALE' && <DollarSign className="w-5 h-5 text-blue-500" />}
                      {!['CASH_IN', 'CASH_OUT', 'NO_SALE', 'SALE'].includes(ev.type) && <Banknote className="w-5 h-5 text-gray-400" />}
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {ev.type === 'CASH_IN' ? 'כניסת מזומן' : ev.type === 'CASH_OUT' ? 'יציאת מזומן' : ev.type === 'NO_SALE' ? 'פתיחת מגירה' : ev.type}
                        </div>
                        {ev.reason && <div className="text-xs text-gray-400">{ev.reason}</div>}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className={`font-semibold text-sm ${ev.type === 'CASH_IN' || ev.type === 'SALE' ? 'text-green-600' : 'text-red-600'}`}>
                        {ev.type === 'CASH_OUT' ? '-' : '+'}{Number(ev.amount).toLocaleString()} ₪
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(ev.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Cash Count Tab ═══ */}
          {activeTab === 'count' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">ספירת מזומנים</h3>
              <p className="text-sm text-gray-500">הזן את כמות כל עובר לסוחר בקופה</p>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {DENOMINATIONS.map(d => (
                  <div key={d.value} className={`border rounded-lg p-3 text-center ${d.type === 'bill' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className={`font-bold text-lg ${d.type === 'bill' ? 'text-green-700' : 'text-amber-700'}`}>{d.label}</div>
                    <input type="number" min={0}
                      value={countDenoms[d.value] || ''}
                      onChange={e => setCountDenoms({ ...countDenoms, [d.value]: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full mt-2 px-2 py-1.5 border rounded text-center text-sm" />
                    <div className="text-xs text-gray-500 mt-1">
                      {((countDenoms[d.value] || 0) * d.value).toLocaleString()} ₪
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div>
                  <div className="text-sm text-gray-500">סה"כ ספירה</div>
                  <div className="text-3xl font-bold text-gray-800">{countTotal.toLocaleString('he-IL')} ₪</div>
                  {drawerBalance && (
                    <div className={`text-sm mt-1 ${countTotal - Number(drawerBalance.balance) === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      פער: {(countTotal - Number(drawerBalance.balance)).toLocaleString('he-IL')} ₪
                    </div>
                  )}
                </div>
                <button onClick={() => cashCountMutation.mutate()}
                  disabled={countTotal === 0 || cashCountMutation.isPending}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium disabled:opacity-40">
                  <Calculator className="w-5 h-5" /> שמור ספירה
                </button>
              </div>
            </div>
          )}

          {/* ═══ History Tab ═══ */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-3 border-b">
                <h3 className="font-semibold text-gray-800">היסטוריית משמרות</h3>
              </div>
              <div className="divide-y">
                {shiftList.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">אין היסטוריה</p>
                )}
                {shiftList.map((shift: any) => (
                  <div key={shift.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                    <div>
                      <div className="font-medium text-gray-800">
                        {new Date(shift.openedAt).toLocaleDateString('he-IL')}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(shift.openedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                        {shift.closedAt && ` — ${new Date(shift.closedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-800">{Number(shift.totalSales || 0).toLocaleString()} ₪</div>
                      <div className={`text-xs px-2 py-0.5 rounded-full ${
                        shift.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>{shift.status === 'OPEN' ? 'פתוח' : 'סגור'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Open Shift Modal */}
      {showOpenShift && (
        <Modal onClose={() => setShowOpenShift(false)} title="פתיחת משמרת">
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">מזומן פתיחה (₪)</label>
              <input type="number" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)}
                min={0} step={10}
                className="w-full px-3 py-2 border rounded-lg text-lg" autoFocus />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
            <button onClick={() => setShowOpenShift(false)}
              className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button onClick={() => openSessionMutation.mutate()}
              disabled={openSessionMutation.isPending}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {openSessionMutation.isPending ? 'פותח...' : 'פתח משמרת'}
            </button>
          </div>
        </Modal>
      )}

      {/* Cash In Modal */}
      {showCashIn && (
        <Modal onClose={() => setShowCashIn(false)} title="כניסת מזומן">
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">סכום (₪)</label>
              <input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                min={0} className="w-full px-3 py-2 border rounded-lg text-lg" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">סיבה</label>
              <input value={cashReason} onChange={e => setCashReason(e.target.value)}
                placeholder="לדוגמה: עודף מהבנק" className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
            <button onClick={() => setShowCashIn(false)}
              className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button onClick={() => cashInMutation.mutate()}
              disabled={!cashAmount || cashInMutation.isPending}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {cashInMutation.isPending ? 'שומר...' : 'הוסף'}
            </button>
          </div>
        </Modal>
      )}

      {/* Cash Out Modal */}
      {showCashOut && (
        <Modal onClose={() => setShowCashOut(false)} title="יציאת מזומן">
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">סכום (₪)</label>
              <input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                min={0} className="w-full px-3 py-2 border rounded-lg text-lg" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">סיבה</label>
              <input value={cashReason} onChange={e => setCashReason(e.target.value)}
                placeholder="לדוגמה: הפקדה לבנק" className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
            <button onClick={() => setShowCashOut(false)}
              className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button onClick={() => cashOutMutation.mutate()}
              disabled={!cashAmount || cashOutMutation.isPending}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {cashOutMutation.isPending ? 'שומר...' : 'הוצא'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm text-gray-500">{label}</div>
          <div className="text-xl font-bold text-gray-800">{value}</div>
        </div>
      </div>
    </div>
  );
}
