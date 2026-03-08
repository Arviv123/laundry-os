import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Banknote, Coins, ArrowDownCircle, ArrowUpCircle,
  Clock, DollarSign, Calculator, History, CreditCard, Receipt,
  Lock, Unlock, Printer, TrendingUp, TrendingDown, RefreshCw,
  X, Check, ChevronDown, ChevronUp,
  Play, AlertCircle, FileText,
  Wallet, ArrowRight, BarChart3, Calendar,
} from 'lucide-react';

// ─── Israeli Denominations ─────────────────────────────────────────────────
const BILLS = [
  { key: 'bills_200', value: 200, label: '200 ₪', color: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
  { key: 'bills_100', value: 100, label: '100 ₪', color: 'bg-amber-100 border-amber-300 text-amber-800' },
  { key: 'bills_50', value: 50, label: '50 ₪', color: 'bg-purple-100 border-purple-300 text-purple-800' },
  { key: 'bills_20', value: 20, label: '20 ₪', color: 'bg-sky-100 border-sky-300 text-sky-800' },
];
const COIN_DENOMS = [
  { key: 'coins_10', value: 10, label: '10 ₪', color: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
  { key: 'coins_5', value: 5, label: '5 ₪', color: 'bg-zinc-100 border-zinc-300 text-zinc-700' },
  { key: 'coins_2', value: 2, label: '2 ₪', color: 'bg-zinc-100 border-zinc-300 text-zinc-700' },
  { key: 'coins_1', value: 1, label: '1 ₪', color: 'bg-zinc-100 border-zinc-300 text-zinc-700' },
  { key: 'coins_050', value: 0.5, label: '50 אג׳', color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { key: 'coins_010', value: 0.1, label: '10 אג׳', color: 'bg-orange-50 border-orange-200 text-orange-700' },
];
const ALL_DENOMS = [...BILLS, ...COIN_DENOMS];

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCurrency = (n: number) => `${fmt(n)} ₪`;

const EVENT_LABELS: Record<string, string> = {
  CASH_IN: 'כניסת מזומן',
  CASH_OUT: 'יציאת מזומן',
  NO_SALE: 'פתיחת מגירה',
  SALE: 'מכירה',
  RETURN: 'החזר',
  REFUND: 'זיכוי',
  OPEN_FLOAT: 'מזומן פתיחה',
  CLOSE_COUNT: 'ספירת סגירה',
};

const EVENT_COLORS: Record<string, string> = {
  CASH_IN: 'bg-green-100 text-green-700',
  CASH_OUT: 'bg-red-100 text-red-700',
  NO_SALE: 'bg-gray-100 text-gray-600',
  SALE: 'bg-blue-100 text-blue-700',
  RETURN: 'bg-orange-100 text-orange-700',
  REFUND: 'bg-orange-100 text-orange-700',
  OPEN_FLOAT: 'bg-indigo-100 text-indigo-700',
  CLOSE_COUNT: 'bg-purple-100 text-purple-700',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן',
  CREDIT_CARD: 'אשראי',
  CHECK: 'המחאה',
  GIFT_CARD: 'כרטיס מתנה',
  BANK_TRANSFER: 'העברה בנקאית',
  OTHER: 'אחר',
};

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: '#22c55e',
  CREDIT_CARD: '#3b82f6',
  CHECK: '#f59e0b',
  GIFT_CARD: '#a855f7',
  BANK_TRANSFER: '#06b6d4',
  OTHER: '#6b7280',
};

type TabId = 'shift' | 'count' | 'events' | 'history' | 'payments' | 'reports' | 'close';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function CashDrawerPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('shift');
  const [showCashIn, setShowCashIn] = useState(false);
  const [showCashOut, setShowCashOut] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('ALL');
  const [expandedShift, setExpandedShift] = useState<string | null>(null);

  // ─── Terminal & Session ──────────────────────────────────────────────
  const { data: terminals } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn: () => api.get('/pos/terminals').then(r => r.data.data).catch(() => []),
  });
  const terminalList = Array.isArray(terminals) ? terminals : [];
  const [selectedTerminal, setSelectedTerminal] = useState('');

  useEffect(() => {
    if (terminalList.length > 0 && !selectedTerminal) {
      setSelectedTerminal(terminalList[0].id);
    }
  }, [terminalList, selectedTerminal]);

  // Get current open session for selected terminal
  const { data: currentSession, isLoading: sessionLoading } = useQuery({
    queryKey: ['pos-current-session', selectedTerminal],
    queryFn: async () => {
      if (!selectedTerminal) return null;
      const res = await api.get('/pos/sessions', { params: { terminalId: selectedTerminal, status: 'OPEN' } });
      const sessions = res.data.data || [];
      return sessions.length > 0 ? sessions[0] : null;
    },
    enabled: !!selectedTerminal,
    refetchInterval: 30000,
  });

  // Get active cashier shift
  const { data: activeShift } = useQuery({
    queryKey: ['pos-active-shift', currentSession?.id],
    queryFn: () => api.get('/pos/shifts/current', { params: { sessionId: currentSession!.id } }).then(r => r.data.data).catch(() => null),
    enabled: !!currentSession?.id,
  });

  // Get drawer balance
  const { data: drawerBalance } = useQuery({
    queryKey: ['drawer-balance', currentSession?.id],
    queryFn: () => api.get('/pos/drawer/balance', { params: { sessionId: currentSession!.id } }).then(r => r.data.data),
    enabled: !!currentSession?.id,
    refetchInterval: 15000,
  });

  // Get drawer history (events)
  const { data: drawerHistory } = useQuery({
    queryKey: ['drawer-history', currentSession?.id],
    queryFn: () => api.get('/pos/drawer/history', { params: { sessionId: currentSession!.id } }).then(r => r.data.data).catch(() => []),
    enabled: !!currentSession?.id,
  });

  // Get shift history
  const { data: shiftHistory } = useQuery({
    queryKey: ['shift-history'],
    queryFn: () => api.get('/pos/shifts').then(r => r.data.data).catch(() => []),
  });

  // Get payment mix analytics
  const { data: paymentMix } = useQuery({
    queryKey: ['payment-mix'],
    queryFn: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return api.get('/pos/analytics/payment-mix', { params: { from: today.toISOString() } }).then(r => r.data.data).catch(() => null);
    },
    enabled: activeTab === 'payments',
  });

  // Get analytics summary
  const { data: analyticsSummary } = useQuery({
    queryKey: ['analytics-summary-today'],
    queryFn: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return api.get('/pos/analytics/summary', { params: { from: today.toISOString() } }).then(r => r.data.data).catch(() => null);
    },
    enabled: activeTab === 'payments',
  });

  // Get shift detail/summary for expanded shift
  const { data: shiftSummary } = useQuery({
    queryKey: ['shift-summary', expandedShift],
    queryFn: () => api.get(`/pos/shifts/${expandedShift}/summary`).then(r => r.data.data).catch(() => null),
    enabled: !!expandedShift,
  });

  const historyList = Array.isArray(drawerHistory) ? drawerHistory : [];
  const shiftList = Array.isArray(shiftHistory) ? shiftHistory : [];
  const balance = Number(drawerBalance?.balance ?? currentSession?.openingFloat ?? 0);

  // ─── Shift Timer ─────────────────────────────────────────────────────
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const shiftStart = activeShift?.startedAt ?? currentSession?.openedAt;
  const sessionDurationMs = shiftStart ? now - new Date(shiftStart).getTime() : 0;
  const sessionHours = Math.floor(sessionDurationMs / 3600000);
  const sessionMinutes = Math.floor((sessionDurationMs % 3600000) / 60000);
  const sessionSeconds = Math.floor((sessionDurationMs % 60000) / 1000);

  // ─── Invalidation helper ─────────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pos-current-session'] });
    queryClient.invalidateQueries({ queryKey: ['drawer-balance'] });
    queryClient.invalidateQueries({ queryKey: ['drawer-history'] });
    queryClient.invalidateQueries({ queryKey: ['pos-active-shift'] });
    queryClient.invalidateQueries({ queryKey: ['shift-history'] });
    queryClient.invalidateQueries({ queryKey: ['payment-mix'] });
    queryClient.invalidateQueries({ queryKey: ['analytics-summary-today'] });
  }, [queryClient]);

  // ─── Mutations ────────────────────────────────────────────────────────

  // Open session + start shift
  const openSessionMutation = useMutation({
    mutationFn: async (openingFloat: number) => {
      const sessionRes = await api.post('/pos/sessions/open', { terminalId: selectedTerminal, openingFloat });
      const session = sessionRes.data.data;
      await api.post('/pos/shifts/start', { sessionId: session.id, openingFloat });
      return session;
    },
    onSuccess: () => {
      invalidateAll();
      addToast('משמרת נפתחה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בפתיחת משמרת', 'error'),
  });

  // Cash In
  const cashInMutation = useMutation({
    mutationFn: (data: { amount: number; reason: string }) =>
      api.post('/pos/drawer/cash-in', { sessionId: currentSession!.id, ...data }),
    onSuccess: () => {
      invalidateAll();
      setShowCashIn(false);
      addToast('כניסת מזומן נרשמה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ברישום כניסת מזומן', 'error'),
  });

  // Cash Out
  const cashOutMutation = useMutation({
    mutationFn: (data: { amount: number; reason: string }) =>
      api.post('/pos/drawer/cash-out', { sessionId: currentSession!.id, ...data }),
    onSuccess: () => {
      invalidateAll();
      setShowCashOut(false);
      addToast('יציאת מזומן נרשמה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ברישום יציאת מזומן', 'error'),
  });

  // No Sale (open drawer)
  const noSaleMutation = useMutation({
    mutationFn: () => api.post('/pos/drawer/no-sale', { sessionId: currentSession!.id }),
    onSuccess: () => {
      invalidateAll();
      addToast('מגירת הקופה נפתחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  // Cash Count
  const cashCountMutation = useMutation({
    mutationFn: (denomCounts: Record<string, number>) =>
      api.post('/pos/drawer/count', { sessionId: currentSession!.id, ...denomCounts }),
    onSuccess: () => {
      invalidateAll();
      addToast('ספירת קופה נשמרה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בשמירת ספירה', 'error'),
  });

  // Close shift
  const closeShiftMutation = useMutation({
    mutationFn: async (data: { closingFloat: number; notes: string }) => {
      // Close the cashier shift first
      if (activeShift?.id) {
        await api.post(`/pos/shifts/${activeShift.id}/close`, data);
      }
      // Then close the session
      await api.post(`/pos/sessions/${currentSession!.id}/close`, { closingFloat: data.closingFloat });
    },
    onSuccess: () => {
      invalidateAll();
      setActiveTab('shift');
      addToast('משמרת נסגרה בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה בסגירת משמרת', 'error'),
  });

  // ─── Tab Config ──────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: any; requiresSession?: boolean }[] = [
    { id: 'shift', label: 'משמרת', icon: Clock },
    { id: 'count', label: 'ספירת קופה', icon: Calculator, requiresSession: true },
    { id: 'events', label: 'אירועים', icon: Receipt, requiresSession: true },
    { id: 'history', label: 'היסטוריית משמרות', icon: History },
    { id: 'payments', label: 'תשלומים', icon: CreditCard },
    { id: 'reports', label: 'דוחות X/Z', icon: FileText },
    ...(currentSession ? [{ id: 'close' as TabId, label: 'סגירת משמרת', icon: Lock, requiresSession: true }] : []),
  ];

  // ─── Filtered Events ─────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (eventFilter === 'ALL') return historyList;
    return historyList.filter((e: any) => e.type === eventFilter);
  }, [historyList, eventFilter]);

  const eventTypes = useMemo(() => {
    const types = new Set(historyList.map((e: any) => e.type));
    return ['ALL', ...Array.from(types)];
  }, [historyList]);

  // ─── Loading ──────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 animate-fadeIn">
      {/* ─── Dark Header ────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-l from-gray-900 via-gray-800 to-gray-900 text-white px-6 py-5">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <Banknote className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">ניהול קופה ותשלומים</h1>
              <p className="text-gray-400 text-sm">מערכת קופה מרכזית</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Terminal selector */}
            {terminalList.length > 1 && (
              <select
                value={selectedTerminal}
                onChange={e => setSelectedTerminal(e.target.value)}
                className="bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                {terminalList.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}

            {/* Shift status indicator */}
            <div className="flex items-center gap-3">
              {currentSession ? (
                <>
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                  <div className="text-left">
                    <div className="text-green-400 text-sm font-semibold">משמרת פעילה</div>
                    <div className="text-gray-400 text-xs font-mono">
                      {String(sessionHours).padStart(2, '0')}:{String(sessionMinutes).padStart(2, '0')}:{String(sessionSeconds).padStart(2, '0')}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 bg-red-400 rounded-full" />
                  <span className="text-red-400 text-sm font-semibold">אין משמרת</span>
                </>
              )}
            </div>

            {/* Current balance badge */}
            {currentSession && (
              <div className="bg-gray-700/50 border border-gray-600 rounded-xl px-5 py-2 text-center">
                <div className="text-gray-400 text-xs">יתרה בקופה</div>
                <div className="text-2xl font-bold text-green-400 font-mono">
                  {fmtCurrency(balance)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-white border rounded-xl p-1.5 mb-6 shadow-sm overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const disabled = tab.requiresSession && !currentSession;
            return (
              <button
                key={tab.id}
                onClick={() => !disabled && setActiveTab(tab.id)}
                disabled={disabled}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? tab.id === 'close'
                      ? 'bg-red-600 text-white shadow-md'
                      : 'bg-blue-600 text-white shadow-md'
                    : disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ═══ Tab 1: Shift Management ═══ */}
        {activeTab === 'shift' && (
          <ShiftTab
            currentSession={currentSession}
            activeShift={activeShift}
            balance={balance}
            sessionHours={sessionHours}
            sessionMinutes={sessionMinutes}
            sessionSeconds={sessionSeconds}
            terminalList={terminalList}
            selectedTerminal={selectedTerminal}
            openSessionMutation={openSessionMutation}
            noSaleMutation={noSaleMutation}
            onCashIn={() => setShowCashIn(true)}
            onCashOut={() => setShowCashOut(true)}
            onCloseShift={() => setActiveTab('close')}
          />
        )}

        {/* ═══ Tab 2: Cash Counting ═══ */}
        {activeTab === 'count' && currentSession && (
          <CashCountTab
            expectedBalance={balance}
            cashCountMutation={cashCountMutation}
          />
        )}

        {/* ═══ Tab 3: Events Log ═══ */}
        {activeTab === 'events' && currentSession && (
          <EventsTab
            events={filteredEvents}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            eventTypes={eventTypes}
          />
        )}

        {/* ═══ Tab 4: Shift History ═══ */}
        {activeTab === 'history' && (
          <ShiftHistoryTab
            shifts={shiftList}
            expandedShift={expandedShift}
            setExpandedShift={setExpandedShift}
            shiftSummary={shiftSummary}
          />
        )}

        {/* ═══ Tab 5: Payments Overview ═══ */}
        {activeTab === 'payments' && (
          <PaymentsTab
            paymentMix={paymentMix}
            analyticsSummary={analyticsSummary}
          />
        )}

        {/* ═══ Tab 6: Reports X/Z ═══ */}
        {activeTab === 'reports' && (
          <XZReportsTab sessionId={currentSession?.id} />
        )}

        {/* ═══ Tab 7: Close Shift ═══ */}
        {activeTab === 'close' && currentSession && (
          <CloseShiftTab
            currentSession={currentSession}
            activeShift={activeShift}
            balance={balance}
            historyList={historyList}
            closeShiftMutation={closeShiftMutation}
            onCancel={() => setActiveTab('shift')}
          />
        )}
      </div>

      {/* ─── Modals ──────────────────────────────────────────────────── */}
      {showCashIn && (
        <CashModal
          type="in"
          onClose={() => setShowCashIn(false)}
          onSubmit={(amount, reason) => cashInMutation.mutate({ amount, reason })}
          isPending={cashInMutation.isPending}
          maxAmount={undefined}
        />
      )}

      {showCashOut && (
        <CashModal
          type="out"
          onClose={() => setShowCashOut(false)}
          onSubmit={(amount, reason) => cashOutMutation.mutate({ amount, reason })}
          isPending={cashOutMutation.isPending}
          maxAmount={balance}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: SHIFT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
function ShiftTab({
  currentSession, activeShift, balance,
  sessionHours, sessionMinutes, sessionSeconds,
  terminalList, selectedTerminal,
  openSessionMutation, noSaleMutation,
  onCashIn, onCashOut, onCloseShift,
}: any) {
  const [openingFloat, setOpeningFloat] = useState('200');
  const [showOpenForm, setShowOpenForm] = useState(false);

  // Quick amounts for opening float
  const quickAmounts = [0, 100, 200, 300, 500, 1000];

  if (!currentSession) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        {terminalList.length === 0 ? (
          <div className="text-center">
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-12 h-12 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">אין קופה/טרמינל מוגדר</h2>
            <p className="text-gray-500">יש ליצור טרמינל לפני פתיחת משמרת</p>
          </div>
        ) : !showOpenForm ? (
          <div className="text-center">
            <div className="w-32 h-32 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Unlock className="w-16 h-16 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">אין משמרת פעילה</h2>
            <p className="text-gray-500 mb-8">פתח משמרת חדשה כדי להתחיל לעבוד</p>
            <button
              onClick={() => setShowOpenForm(true)}
              className="inline-flex items-center gap-3 px-10 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 text-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <Play className="w-6 h-6" />
              פתיחת משמרת
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border p-8 w-full max-w-lg">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Banknote className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">פתיחת משמרת חדשה</h2>
              <p className="text-gray-500 text-sm mt-1">הזן את סכום מזומן הפתיחה בקופה</p>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">מזומן פתיחה (₪)</label>
            <input
              type="number"
              value={openingFloat}
              onChange={e => setOpeningFloat(e.target.value)}
              min={0}
              step={10}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-2xl font-bold text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
              autoFocus
            />

            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {quickAmounts.map(amt => (
                <button
                  key={amt}
                  onClick={() => setOpeningFloat(String(amt))}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    openingFloat === String(amt)
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {amt === 0 ? 'ללא' : fmtCurrency(amt)}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowOpenForm(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => openSessionMutation.mutate(Number(openingFloat) || 0)}
                disabled={openSessionMutation.isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {openSessionMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <><Play className="w-5 h-5" /> פתח משמרת</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active session view
  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="מזומן פתיחה"
          value={fmtCurrency(Number(currentSession.openingFloat || 0))}
          icon={DollarSign}
          color="blue"
        />
        <StatCard
          label="יתרה נוכחית"
          value={fmtCurrency(balance)}
          icon={Wallet}
          color="green"
          highlight
        />
        <StatCard
          label='סה"כ מכירות'
          value={fmtCurrency(Number(currentSession.totalSales || 0))}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="זמן משמרת"
          value={`${String(sessionHours).padStart(2, '0')}:${String(sessionMinutes).padStart(2, '0')}:${String(sessionSeconds).padStart(2, '0')}`}
          icon={Clock}
          color="purple"
          mono
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-blue-600" />
          פעולות מהירות
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={onCashIn}
            className="flex flex-col items-center gap-2 p-4 bg-green-50 border-2 border-green-200 rounded-xl hover:bg-green-100 hover:border-green-300 transition-all group"
          >
            <ArrowDownCircle className="w-8 h-8 text-green-600 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-green-700">הכנסת מזומן</span>
          </button>

          <button
            onClick={onCashOut}
            className="flex flex-col items-center gap-2 p-4 bg-red-50 border-2 border-red-200 rounded-xl hover:bg-red-100 hover:border-red-300 transition-all group"
          >
            <ArrowUpCircle className="w-8 h-8 text-red-600 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-red-700">הוצאת מזומן</span>
          </button>

          <button
            onClick={() => noSaleMutation.mutate()}
            disabled={noSaleMutation.isPending}
            className="flex flex-col items-center gap-2 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 hover:border-gray-300 transition-all group disabled:opacity-50"
          >
            <Unlock className="w-8 h-8 text-gray-500 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-gray-600">פתיחת מגירה</span>
          </button>

          <button
            onClick={onCloseShift}
            className="flex flex-col items-center gap-2 p-4 bg-orange-50 border-2 border-orange-200 rounded-xl hover:bg-orange-100 hover:border-orange-300 transition-all group"
          >
            <Lock className="w-8 h-8 text-orange-600 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-orange-700">סגירת משמרת</span>
          </button>
        </div>
      </div>

      {/* Shift Details */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          פרטי משמרת
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <InfoRow label="פתיחה" value={(activeShift?.startedAt ?? currentSession.openedAt) ? new Date(activeShift?.startedAt ?? currentSession.openedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '-'} />
          <InfoRow label="מזומן פתיחה" value={fmtCurrency(Number(activeShift?.openingFloat ?? currentSession.openingFloat ?? 0))} />
          <InfoRow label="יתרה נוכחית" value={fmtCurrency(balance)} valueClass="text-green-600 font-bold" />
          <InfoRow label='סה"כ מכירות' value={fmtCurrency(Number(currentSession.totalSales || 0))} valueClass="text-blue-600" />
          <InfoRow label='סה"כ החזרים' value={fmtCurrency(Number(currentSession.totalReturns || 0))} valueClass="text-red-600" />
          <InfoRow label="טרמינל" value={currentSession.terminal?.name || '-'} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: CASH COUNTING
// ═══════════════════════════════════════════════════════════════════════════
function CashCountTab({ expectedBalance, cashCountMutation }: {
  expectedBalance: number;
  cashCountMutation: any;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const updateCount = (key: string, val: number) => {
    setCounts(prev => ({ ...prev, [key]: Math.max(0, val) }));
  };

  const total = useMemo(() => {
    return ALL_DENOMS.reduce((sum, d) => sum + d.value * (counts[d.key] || 0), 0);
  }, [counts]);

  const variance = total - expectedBalance;
  const varianceStatus = variance === 0 ? 'balanced' : variance > 0 ? 'over' : 'short';

  const handleSave = () => {
    const payload: Record<string, number> = {};
    for (const d of ALL_DENOMS) {
      payload[d.key] = counts[d.key] || 0;
    }
    cashCountMutation.mutate(payload);
  };

  const handleClear = () => setCounts({});

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label='סה"כ ספירה' value={fmtCurrency(total)} icon={Calculator} color="blue" highlight />
        <StatCard label="צפוי לפי מערכת" value={fmtCurrency(expectedBalance)} icon={DollarSign} color="gray" />
        <div className={`bg-white rounded-2xl shadow-sm border-2 p-4 flex items-center gap-4 ${
          varianceStatus === 'balanced' ? 'border-green-300' : 'border-red-300'
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            varianceStatus === 'balanced' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {varianceStatus === 'balanced'
              ? <Check className="w-6 h-6 text-green-600" />
              : varianceStatus === 'over'
              ? <TrendingUp className="w-6 h-6 text-red-600" />
              : <TrendingDown className="w-6 h-6 text-red-600" />
            }
          </div>
          <div>
            <div className="text-sm text-gray-500">פער</div>
            <div className={`text-2xl font-bold ${
              varianceStatus === 'balanced' ? 'text-green-600' : 'text-red-600'
            }`}>
              {variance > 0 ? '+' : ''}{fmtCurrency(variance)}
            </div>
            <div className={`text-xs font-medium ${
              varianceStatus === 'balanced' ? 'text-green-500' : 'text-red-500'
            }`}>
              {varianceStatus === 'balanced' ? 'מאוזן' : varianceStatus === 'over' ? 'עודף' : 'חוסר'}
            </div>
          </div>
        </div>
      </div>

      {/* Bills */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-green-600" />
          שטרות
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {BILLS.map(d => (
            <DenominationInput
              key={d.key}
              denom={d}
              count={counts[d.key] || 0}
              onChange={val => updateCount(d.key, val)}
            />
          ))}
        </div>
      </div>

      {/* Coins */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Coins className="w-5 h-5 text-yellow-600" />
          מטבעות
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {COIN_DENOMS.map(d => (
            <DenominationInput
              key={d.key}
              denom={d}
              count={counts[d.key] || 0}
              onChange={val => updateCount(d.key, val)}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border p-6">
        <div>
          <div className="text-sm text-gray-500">סה"כ נספר</div>
          <div className="text-3xl font-bold text-gray-800">{fmtCurrency(total)}</div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> אפס ספירה
          </button>
          <button
            onClick={handleSave}
            disabled={total === 0 || cashCountMutation.isPending}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {cashCountMutation.isPending ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <><Check className="w-5 h-5" /> שמור ספירה</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: EVENTS LOG
// ═══════════════════════════════════════════════════════════════════════════
function EventsTab({ events, eventFilter, setEventFilter, eventTypes }: any) {
  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-600">סינון:</span>
        {eventTypes.map((type: string) => (
          <button
            key={type}
            onClick={() => setEventFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              eventFilter === type
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'ALL' ? 'הכל' : EVENT_LABELS[type] || type}
          </button>
        ))}
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">שעה</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">סוג</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">סכום</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">יתרה אחרי</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">סיבה / הערה</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-12">
                  <Receipt className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>אין אירועים במשמרת הנוכחית</p>
                </td>
              </tr>
            )}
            {events.map((ev: any) => (
              <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm text-gray-700 font-mono">
                  {new Date(ev.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${EVENT_COLORS[ev.type] || 'bg-gray-100 text-gray-600'}`}>
                    {ev.type === 'CASH_IN' && <ArrowDownCircle className="w-3 h-3" />}
                    {ev.type === 'CASH_OUT' && <ArrowUpCircle className="w-3 h-3" />}
                    {ev.type === 'NO_SALE' && <Unlock className="w-3 h-3" />}
                    {ev.type === 'SALE' && <DollarSign className="w-3 h-3" />}
                    {EVENT_LABELS[ev.type] || ev.type}
                  </span>
                </td>
                <td className="px-6 py-3">
                  {Number(ev.amount) !== 0 ? (
                    <span className={`text-sm font-bold ${Number(ev.amount) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(ev.amount) > 0 ? '+' : ''}{fmtCurrency(Number(ev.amount))}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600 font-mono">
                  {fmtCurrency(Number(ev.balanceAfter ?? 0))}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate">
                  {ev.reason || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4: SHIFT HISTORY
// ═══════════════════════════════════════════════════════════════════════════
function ShiftHistoryTab({ shifts, expandedShift, setExpandedShift, shiftSummary }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        <StatCard
          label='סה"כ משמרות'
          value={String(shifts.length)}
          icon={History}
          color="blue"
        />
        <StatCard
          label='סה"כ מכירות'
          value={fmtCurrency(shifts.reduce((s: number, sh: any) => s + Number(sh.totalSales || 0), 0))}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="ממוצע למשמרת"
          value={fmtCurrency(shifts.length > 0 ? shifts.reduce((s: number, sh: any) => s + Number(sh.totalSales || 0), 0) / shifts.length : 0)}
          icon={BarChart3}
          color="purple"
        />
        <StatCard
          label='סה"כ עסקאות'
          value={String(shifts.reduce((s: number, sh: any) => s + (sh.transactionCount || 0), 0))}
          icon={Receipt}
          color="amber"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {shifts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">אין היסטוריית משמרות</p>
          </div>
        )}

        {shifts.map((shift: any) => {
          const isExpanded = expandedShift === shift.id;
          const isActive = shift.status === 'ACTIVE';
          const startTime = new Date(shift.startedAt);
          const endTime = shift.endedAt ? new Date(shift.endedAt) : null;
          const durationMs = endTime ? endTime.getTime() - startTime.getTime() : Date.now() - startTime.getTime();
          const durationHours = Math.floor(durationMs / 3600000);
          const durationMinutes = Math.floor((durationMs % 3600000) / 60000);

          return (
            <div key={shift.id} className="border-b last:border-b-0">
              <button
                onClick={() => setExpandedShift(isExpanded ? null : shift.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-right"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                  <div>
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {startTime.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {startTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      {endTime ? ` - ${endTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ' (פעיל)'}
                      <span className="text-gray-400">({durationHours}:{String(durationMinutes).padStart(2, '0')} שעות)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-left">
                    <div className="text-sm text-gray-500">מכירות</div>
                    <div className="font-bold text-gray-800">{fmtCurrency(Number(shift.totalSales || 0))}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm text-gray-500">עסקאות</div>
                    <div className="font-bold text-gray-800">{shift.transactionCount || 0}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    isActive ? 'bg-green-100 text-green-700' : shift.status === 'HANDED_OVER' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isActive ? 'פעיל' : shift.status === 'HANDED_OVER' ? 'הועבר' : 'סגור'}
                  </span>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="px-6 pb-6 bg-gray-50 border-t">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                    <InfoRow label="מזומן פתיחה" value={fmtCurrency(Number(shift.openingFloat || 0))} />
                    <InfoRow label="מזומן סגירה" value={shift.closingFloat != null ? fmtCurrency(Number(shift.closingFloat)) : '-'} />
                    <InfoRow label='סה"כ מכירות' value={fmtCurrency(Number(shift.totalSales || 0))} valueClass="text-green-600" />
                    <InfoRow label='סה"כ החזרים' value={fmtCurrency(Number(shift.totalReturns || 0))} valueClass="text-red-600" />
                  </div>

                  {/* Shift summary breakdown */}
                  {shiftSummary && (
                    <div className="mt-4 space-y-3">
                      {shiftSummary.byPaymentMethod && Object.keys(shiftSummary.byPaymentMethod).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">לפי אמצעי תשלום:</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(shiftSummary.byPaymentMethod).map(([method, data]: [string, any]) => (
                              <div key={method} className="bg-white rounded-lg px-3 py-2 border text-sm">
                                <span className="text-gray-500">{PAYMENT_METHOD_LABELS[method] || method}: </span>
                                <span className="font-bold">{fmtCurrency(data.amount)}</span>
                                <span className="text-gray-400 mr-1">({data.count})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {shiftSummary.topItems && shiftSummary.topItems.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">פריטים מובילים:</h4>
                          <div className="flex flex-wrap gap-2">
                            {shiftSummary.topItems.slice(0, 5).map((item: any, i: number) => (
                              <div key={i} className="bg-white rounded-lg px-3 py-2 border text-sm">
                                <span className="text-gray-700">{item.description}</span>
                                <span className="text-gray-400 mr-2">x{item.quantity}</span>
                                <span className="font-bold text-green-600">{fmtCurrency(item.revenue)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {shift.notes && (
                    <div className="mt-3 text-sm text-gray-600 bg-white rounded-lg p-3 border">
                      <span className="font-medium">הערות: </span>{shift.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 5: PAYMENTS OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════
function PaymentsTab({ paymentMix, analyticsSummary }: any) {
  const breakdown = paymentMix?.breakdown || {};
  const grandTotal = paymentMix?.grandTotal || 0;
  const txCount = paymentMix?.transactionCount || 0;

  const summary = analyticsSummary || {};

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="מכירות היום"
          value={fmtCurrency(summary.totalRevenue || 0)}
          icon={TrendingUp}
          color="green"
          highlight
        />
        <StatCard
          label="עסקאות היום"
          value={String(summary.totalTransactions || 0)}
          icon={Receipt}
          color="blue"
        />
        <StatCard
          label="סל ממוצע"
          value={fmtCurrency(summary.averageBasket || 0)}
          icon={BarChart3}
          color="purple"
        />
        <StatCard
          label="הכנסה נטו"
          value={fmtCurrency(summary.netRevenue || 0)}
          icon={DollarSign}
          color="emerald"
        />
      </div>

      {/* Payment Method Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visual Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            אמצעי תשלום
          </h3>

          {grandTotal === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CreditCard className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>אין נתוני תשלום להיום</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(breakdown).map(([method, data]: [string, any]) => {
                const pct = grandTotal > 0 ? (data.amount / grandTotal) * 100 : 0;
                if (data.count === 0) return null;
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: PAYMENT_METHOD_COLORS[method] || '#6b7280' }}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {PAYMENT_METHOD_LABELS[method] || method}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-bold">{fmtCurrency(data.amount)}</span>
                        <span className="text-gray-400 mr-2">({data.count} עסקאות)</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(pct, 1)}%`,
                          backgroundColor: PAYMENT_METHOD_COLORS[method] || '#6b7280',
                        }}
                      />
                    </div>
                    <div className="text-left text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Circular breakdown (CSS-only) */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            חלוקה אחוזית
          </h3>

          {grandTotal === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>אין נתונים</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* Simple donut using conic-gradient */}
              <div className="relative w-48 h-48 mb-6">
                <div
                  className="w-full h-full rounded-full"
                  style={{
                    background: (() => {
                      const entries = Object.entries(breakdown).filter(([_, d]: any) => d.count > 0);
                      if (entries.length === 0) return '#e5e7eb';
                      let cumulativePct = 0;
                      const stops = entries.map(([method, data]: [string, any]) => {
                        const pct = (data.amount / grandTotal) * 100;
                        const start = cumulativePct;
                        cumulativePct += pct;
                        return `${PAYMENT_METHOD_COLORS[method] || '#6b7280'} ${start}% ${cumulativePct}%`;
                      });
                      return `conic-gradient(${stops.join(', ')})`;
                    })(),
                  }}
                />
                <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold text-gray-800">{fmtCurrency(grandTotal)}</div>
                  <div className="text-xs text-gray-500">{txCount} עסקאות</div>
                </div>
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 w-full">
                {Object.entries(breakdown).map(([method, data]: [string, any]) => {
                  if (data.count === 0) return null;
                  return (
                    <div key={method} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PAYMENT_METHOD_COLORS[method] || '#6b7280' }} />
                      <span className="text-gray-600">{PAYMENT_METHOD_LABELS[method] || method}</span>
                      <span className="font-bold text-gray-800 mr-auto">{((data.amount / grandTotal) * 100).toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Growth / Comparison */}
      {summary.growthVsPrevPeriod != null && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            השוואה לתקופה קודמת
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-sm text-gray-500 mb-1">תקופה נוכחית</div>
              <div className="text-2xl font-bold text-gray-800">{fmtCurrency(summary.totalRevenue || 0)}</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-sm text-gray-500 mb-1">תקופה קודמת</div>
              <div className="text-2xl font-bold text-gray-800">{fmtCurrency(summary.prevPeriodRevenue || 0)}</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-sm text-gray-500 mb-1">שינוי</div>
              <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${
                summary.growthVsPrevPeriod >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {summary.growthVsPrevPeriod >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {summary.growthVsPrevPeriod >= 0 ? '+' : ''}{summary.growthVsPrevPeriod.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 6: CLOSE SHIFT
// ═══════════════════════════════════════════════════════════════════════════
function CloseShiftTab({
  currentSession, activeShift, balance, historyList,
  closeShiftMutation, onCancel,
}: any) {
  const [step, setStep] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  const countTotal = useMemo(() => {
    return ALL_DENOMS.reduce((sum, d) => sum + d.value * (counts[d.key] || 0), 0);
  }, [counts]);

  const variance = countTotal - balance;
  const varianceStatus = Math.abs(variance) < 0.01 ? 'balanced' : variance > 0 ? 'over' : 'short';

  // Event summaries
  const cashInTotal = historyList
    .filter((e: any) => e.type === 'CASH_IN')
    .reduce((s: number, e: any) => s + Math.abs(Number(e.amount)), 0);
  const cashOutTotal = historyList
    .filter((e: any) => e.type === 'CASH_OUT')
    .reduce((s: number, e: any) => s + Math.abs(Number(e.amount)), 0);
  const salesTotal = historyList
    .filter((e: any) => e.type === 'SALE')
    .reduce((s: number, e: any) => s + Number(e.amount), 0);

  const handleClose = () => {
    closeShiftMutation.mutate({
      closingFloat: countTotal > 0 ? countTotal : balance,
      notes: notes || undefined,
    });
  };

  const printSummary = () => {
    const printContent = `
      <html dir="rtl">
      <head><title>סיכום משמרת</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;max-width:400px;margin:0 auto}
      h1{font-size:18px;text-align:center;border-bottom:2px solid #000;padding-bottom:10px}
      .row{display:flex;justify-content:space-between;padding:4px 0}
      .bold{font-weight:bold}
      .divider{border-top:1px dashed #ccc;margin:10px 0}
      .total{font-size:16px;font-weight:bold;border-top:2px solid #000;padding-top:8px;margin-top:8px}
      </style></head>
      <body>
      <h1>סיכום משמרת</h1>
      <div class="row"><span>תאריך:</span><span>${new Date().toLocaleDateString('he-IL')}</span></div>
      <div class="row"><span>שעת פתיחה:</span><span>${new Date(activeShift?.startedAt || currentSession.openedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="row"><span>שעת סגירה:</span><span>${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="divider"></div>
      <div class="row"><span>מזומן פתיחה:</span><span>${fmtCurrency(Number(currentSession.openingFloat || 0))}</span></div>
      <div class="row"><span>סה"כ מכירות:</span><span>${fmtCurrency(salesTotal)}</span></div>
      <div class="row"><span>כניסות מזומן:</span><span>${fmtCurrency(cashInTotal)}</span></div>
      <div class="row"><span>יציאות מזומן:</span><span>${fmtCurrency(cashOutTotal)}</span></div>
      <div class="divider"></div>
      <div class="row bold"><span>יתרה צפויה:</span><span>${fmtCurrency(balance)}</span></div>
      <div class="row bold"><span>נספר בפועל:</span><span>${fmtCurrency(countTotal)}</span></div>
      <div class="row bold" style="color:${varianceStatus === 'balanced' ? 'green' : 'red'}"><span>פער:</span><span>${variance > 0 ? '+' : ''}${fmtCurrency(variance)}</span></div>
      ${notes ? `<div class="divider"></div><div class="row"><span>הערות:</span><span>${notes}</span></div>` : ''}
      </body></html>
    `;
    const win = window.open('', '', 'width=400,height=600');
    if (win) {
      win.document.write(printContent);
      win.document.close();
      win.print();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Step Indicator */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => setStep(s)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step === s
                    ? 'bg-blue-600 text-white scale-110'
                    : step > s
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {step > s ? <Check className="w-5 h-5" /> : s}
              </button>
              {s < 4 && (
                <div className={`w-12 h-0.5 mx-1 ${step > s ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 mt-2 text-xs text-gray-500">
          <span className={step === 1 ? 'text-blue-600 font-bold' : ''}>ספירת מזומן</span>
          <span className={step === 2 ? 'text-blue-600 font-bold' : ''}>סיכום מערכת</span>
          <span className={step === 3 ? 'text-blue-600 font-bold' : ''}>בדיקת פערים</span>
          <span className={step === 4 ? 'text-blue-600 font-bold' : ''}>אישור וסגירה</span>
        </div>
      </div>

      {/* Step 1: Cash Count */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">שלב 1: ספירת מזומן בקופה</h3>
            <p className="text-sm text-gray-500 mb-6">ספרו את כל השטרות והמטבעות בקופה</p>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-green-600" /> שטרות
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {BILLS.map(d => (
                  <DenominationInput
                    key={d.key}
                    denom={d}
                    count={counts[d.key] || 0}
                    onChange={val => setCounts(prev => ({ ...prev, [d.key]: Math.max(0, val) }))}
                    compact
                  />
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Coins className="w-4 h-4 text-yellow-600" /> מטבעות
              </h4>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {COIN_DENOMS.map(d => (
                  <DenominationInput
                    key={d.key}
                    denom={d}
                    count={counts[d.key] || 0}
                    onChange={val => setCounts(prev => ({ ...prev, [d.key]: Math.max(0, val) }))}
                    compact
                  />
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">סה"כ נספר</div>
                <div className="text-3xl font-bold text-gray-800">{fmtCurrency(countTotal)}</div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                המשך <ArrowRight className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: System Summary */}
      {step === 2 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
          <h3 className="text-lg font-bold text-gray-800 mb-2">שלב 2: סיכום מערכת</h3>
          <p className="text-sm text-gray-500 mb-4">נתונים מחושבים אוטומטית מהמערכת</p>

          <div className="grid grid-cols-2 gap-4">
            <SummaryRow label="מזומן פתיחה" value={Number(currentSession.openingFloat || 0)} icon={DollarSign} color="blue" />
            <SummaryRow label='סה"כ מכירות (מזומן)' value={salesTotal} icon={TrendingUp} color="green" />
            <SummaryRow label='סה"כ כניסות מזומן' value={cashInTotal} icon={ArrowDownCircle} color="green" />
            <SummaryRow label='סה"כ יציאות מזומן' value={cashOutTotal} icon={ArrowUpCircle} color="red" />
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold text-gray-800">יתרה צפויה (לפי מערכת)</div>
              <div className="text-3xl font-bold text-blue-600">{fmtCurrency(balance)}</div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200">
              חזור
            </button>
            <button onClick={() => setStep(3)} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2">
              המשך <ArrowRight className="w-5 h-5 rotate-180" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Variance */}
      {step === 3 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
          <h3 className="text-lg font-bold text-gray-800 mb-2">שלב 3: בדיקת פערים</h3>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-sm text-blue-600 mb-1">צפוי (מערכת)</div>
              <div className="text-2xl font-bold text-blue-700">{fmtCurrency(balance)}</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-sm text-gray-500 mb-1">נספר בפועל</div>
              <div className="text-2xl font-bold text-gray-800">{fmtCurrency(countTotal)}</div>
            </div>
            <div className={`text-center p-4 rounded-xl ${
              varianceStatus === 'balanced' ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <div className={`text-sm mb-1 ${varianceStatus === 'balanced' ? 'text-green-600' : 'text-red-600'}`}>
                פער
              </div>
              <div className={`text-2xl font-bold ${varianceStatus === 'balanced' ? 'text-green-700' : 'text-red-700'}`}>
                {variance > 0 ? '+' : ''}{fmtCurrency(variance)}
              </div>
              <div className={`text-xs mt-1 font-semibold ${varianceStatus === 'balanced' ? 'text-green-500' : 'text-red-500'}`}>
                {varianceStatus === 'balanced' ? 'מאוזן' : varianceStatus === 'over' ? 'עודף בקופה' : 'חוסר בקופה'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">הערות לסגירת משמרת</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="הערות, הסברים לפער, אירועים מיוחדים..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl resize-none h-24 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
            />
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200">
              חזור
            </button>
            <button onClick={() => setStep(4)} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2">
              המשך <ArrowRight className="w-5 h-5 rotate-180" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm & Close */}
      {step === 4 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
          <div className="text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              varianceStatus === 'balanced' ? 'bg-green-100' : 'bg-amber-100'
            }`}>
              <Lock className={`w-10 h-10 ${varianceStatus === 'balanced' ? 'text-green-600' : 'text-amber-600'}`} />
            </div>
            <h3 className="text-xl font-bold text-gray-800">אישור סגירת משמרת</h3>
            <p className="text-gray-500 text-sm mt-1">אנא בדקו את הנתונים לפני הסגירה</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">מזומן פתיחה</span><span className="font-medium">{fmtCurrency(Number(currentSession.openingFloat || 0))}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">מכירות</span><span className="font-medium text-green-600">{fmtCurrency(salesTotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">כניסות מזומן</span><span className="font-medium text-green-600">{fmtCurrency(cashInTotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">יציאות מזומן</span><span className="font-medium text-red-600">{fmtCurrency(cashOutTotal)}</span></div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold"><span>יתרה צפויה</span><span>{fmtCurrency(balance)}</span></div>
            <div className="flex justify-between text-sm font-bold"><span>נספר בפועל</span><span>{fmtCurrency(countTotal)}</span></div>
            <div className={`flex justify-between text-sm font-bold ${varianceStatus === 'balanced' ? 'text-green-600' : 'text-red-600'}`}>
              <span>פער</span>
              <span>{variance > 0 ? '+' : ''}{fmtCurrency(variance)}</span>
            </div>
            {notes && (
              <div className="border-t pt-2 text-sm"><span className="text-gray-500">הערות: </span>{notes}</div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200">
              ביטול
            </button>
            <button
              onClick={printSummary}
              className="py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 flex items-center gap-2"
            >
              <Printer className="w-5 h-5" /> הדפסה
            </button>
            <button
              onClick={handleClose}
              disabled={closeShiftMutation.isPending}
              className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {closeShiftMutation.isPending ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <><Lock className="w-5 h-5" /> סגור משמרת</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Denomination Input ──────────────────────────────────────────────────
function DenominationInput({ denom, count, onChange, compact }: {
  denom: { key: string; value: number; label: string; color: string };
  count: number;
  onChange: (val: number) => void;
  compact?: boolean;
}) {
  const subtotal = count * denom.value;
  return (
    <div className={`border-2 rounded-xl text-center transition-all ${denom.color} ${count > 0 ? 'ring-2 ring-blue-300 shadow-md' : ''} ${compact ? 'p-2' : 'p-4'}`}>
      <div className={`font-bold ${compact ? 'text-base' : 'text-xl'}`}>{denom.label}</div>
      <div className="flex items-center justify-center gap-1 mt-2">
        <button
          onClick={() => onChange(count - 1)}
          className="w-7 h-7 rounded-lg bg-white/60 hover:bg-white text-gray-600 flex items-center justify-center text-lg font-bold border"
          disabled={count <= 0}
        >
          -
        </button>
        <input
          type="number"
          min={0}
          value={count || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          placeholder="0"
          className={`${compact ? 'w-12' : 'w-16'} px-1 py-1 border-2 rounded-lg text-center font-bold bg-white/80 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition-colors`}
        />
        <button
          onClick={() => onChange(count + 1)}
          className="w-7 h-7 rounded-lg bg-white/60 hover:bg-white text-gray-600 flex items-center justify-center text-lg font-bold border"
        >
          +
        </button>
      </div>
      {subtotal > 0 && (
        <div className={`font-semibold mt-1 ${compact ? 'text-xs' : 'text-sm'} opacity-80`}>
          = {fmtCurrency(subtotal)}
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, highlight, mono }: {
  label: string;
  value: string;
  icon: any;
  color: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue:    { bg: 'bg-blue-50', icon: 'text-blue-600 bg-blue-100', border: 'border-blue-200' },
    green:   { bg: 'bg-green-50', icon: 'text-green-600 bg-green-100', border: 'border-green-200' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600 bg-emerald-100', border: 'border-emerald-200' },
    red:     { bg: 'bg-red-50', icon: 'text-red-600 bg-red-100', border: 'border-red-200' },
    purple:  { bg: 'bg-purple-50', icon: 'text-purple-600 bg-purple-100', border: 'border-purple-200' },
    amber:   { bg: 'bg-amber-50', icon: 'text-amber-600 bg-amber-100', border: 'border-amber-200' },
    gray:    { bg: 'bg-gray-50', icon: 'text-gray-600 bg-gray-100', border: 'border-gray-200' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border p-4 ${highlight ? `ring-2 ring-offset-1 ${c.border.replace('border', 'ring')}` : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-gray-500 truncate">{label}</div>
          <div className={`text-xl font-bold text-gray-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Info Row ────────────────────────────────────────────────────────────
function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${valueClass || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// ─── Summary Row (for close shift) ──────────────────────────────────────
function SummaryRow({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgMap[color] || 'bg-gray-100'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-lg font-bold text-gray-800">{fmtCurrency(value)}</div>
      </div>
    </div>
  );
}

// ─── Cash In/Out Modal ──────────────────────────────────────────────────
function CashModal({ type, onClose, onSubmit, isPending, maxAmount }: {
  type: 'in' | 'out';
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => void;
  isPending: boolean;
  maxAmount?: number;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const isIn = type === 'in';
  const title = isIn ? 'הכנסת מזומן' : 'הוצאת מזומן';
  const quickAmounts = [20, 50, 100, 200, 500];
  const reasons = isIn
    ? ['עודף מהבנק', 'פתיחת קופה', 'מלאי עודף', 'תיקון טעות']
    : ['הפקדה לבנק', 'תשלום לספק', 'הוצאה שוטפת', 'משיכת עודף'];

  const handleSubmit = () => {
    const num = Number(amount);
    if (!num || num <= 0) {
      setError('יש להזין סכום חיובי');
      return;
    }
    if (maxAmount !== undefined && num > maxAmount) {
      setError(`הסכום המקסימלי הוא ${fmtCurrency(maxAmount)}`);
      return;
    }
    setError('');
    onSubmit(num, reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${isIn ? 'bg-green-600' : 'bg-red-600'} text-white`}>
          <div className="flex items-center gap-3">
            {isIn ? <ArrowDownCircle className="w-6 h-6" /> : <ArrowUpCircle className="w-6 h-6" />}
            <h3 className="font-bold text-lg">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">סכום (₪)</label>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              min={0}
              placeholder="0.00"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-2xl font-bold text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
              autoFocus
            />
            {maxAmount !== undefined && (
              <div className="text-xs text-gray-400 mt-1 text-center">מקסימום: {fmtCurrency(maxAmount)}</div>
            )}
          </div>

          {/* Quick Amounts */}
          <div className="flex flex-wrap gap-2">
            {quickAmounts.map(qa => (
              <button
                key={qa}
                onClick={() => { setAmount(String(qa)); setError(''); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  amount === String(qa) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {fmtCurrency(qa)}
              </button>
            ))}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">סיבה</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="הזן סיבה..."
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reasons.map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    reason === r ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={!amount || isPending}
            className={`flex-1 py-3 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              isIn ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isPending ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>{isIn ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />} {isIn ? 'הכנס' : 'הוצא'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   X/Z REPORTS TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function XZReportsTab({ sessionId }: { sessionId?: string }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showZConfirm, setShowZConfirm] = useState(false);
  const [zListOpen, setZListOpen] = useState(false);

  // Fetch X-Report (live)
  const { data: xReport, isLoading: xLoading, refetch: refetchX } = useQuery({
    queryKey: ['x-report', sessionId],
    queryFn: async () => {
      const res = await api.get('/pos/reports/x-report', { params: { sessionId } });
      return res.data.data ?? res.data;
    },
  });

  // Fetch past Z-Reports
  const { data: zReportsRaw, isLoading: zLoading } = useQuery({
    queryKey: ['z-reports'],
    queryFn: async () => {
      const res = await api.get('/pos/reports/z-reports');
      return res.data.data ?? res.data;
    },
    enabled: zListOpen,
  });
  const zReports = Array.isArray(zReportsRaw) ? zReportsRaw : [];

  // Generate Z-Report
  const zMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/pos/reports/z-report', {
        sessionId,
        reportDate: new Date().toISOString(),
        closingFloat: 0,
      });
      return res.data.data ?? res.data;
    },
    onSuccess: () => {
      addToast('דוח Z נוצר בהצלחה', 'success');
      setShowZConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['z-reports'] });
    },
    onError: () => addToast('שגיאה ביצירת דוח Z', 'error'),
  });

  return (
    <div className="space-y-6">
      {/* ── X-Report (Live) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <h3 className="font-bold text-lg">דוח X — סיכום חי</h3>
          </div>
          <button onClick={() => refetchX()} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 rounded-lg text-sm flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
        </div>

        {xLoading ? (
          <div className="p-8 text-center text-gray-400">טוען דוח X...</div>
        ) : xReport ? (
          <div className="p-6 space-y-4">
            <div className="text-xs text-gray-400 text-left">
              {xReport.generatedAt ? new Date(xReport.generatedAt).toLocaleString('he-IL') : ''}
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 rounded-xl p-4 text-center border border-green-200">
                <div className="text-2xl font-bold text-green-700">{fmtCurrency(xReport.totalSales ?? 0)}</div>
                <div className="text-xs text-green-600 mt-1">סה״כ מכירות</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center border border-red-200">
                <div className="text-2xl font-bold text-red-700">{fmtCurrency(xReport.totalReturns ?? 0)}</div>
                <div className="text-xs text-red-600 mt-1">החזרות</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-200">
                <div className="text-2xl font-bold text-blue-700">{fmtCurrency(xReport.netSales ?? 0)}</div>
                <div className="text-xs text-blue-600 mt-1">מכירות נטו</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 text-center border border-purple-200">
                <div className="text-2xl font-bold text-purple-700">{fmtCurrency(xReport.totalVat ?? 0)}</div>
                <div className="text-xs text-purple-600 mt-1">מע״מ</div>
              </div>
            </div>

            {/* Counts */}
            <div className="flex gap-6 text-sm text-gray-600 justify-center">
              <span>עסקאות: <strong>{xReport.transactionCount ?? 0}</strong></span>
              <span>החזרות: <strong>{xReport.returnCount ?? 0}</strong></span>
              {xReport.openingFloat !== undefined && (
                <span>מזומן פתיחה: <strong>{fmtCurrency(xReport.openingFloat)}</strong></span>
              )}
            </div>

            {/* Payment methods breakdown */}
            {xReport.byPaymentMethod && Object.keys(xReport.byPaymentMethod).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">פירוט לפי אמצעי תשלום</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(xReport.byPaymentMethod).map(([method, amount]) => (
                    <div key={method} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border">
                      <span className="text-sm text-gray-600">{PAYMENT_METHOD_LABELS[method] ?? method}</span>
                      <span className="font-semibold text-gray-800">{fmtCurrency(amount as number)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">אין נתונים להצגה</div>
        )}
      </div>

      {/* ── Z-Report (End of Day) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <h3 className="font-bold text-lg">דוח Z — סגירת יום</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setZListOpen(!zListOpen)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 rounded-lg text-sm flex items-center gap-1">
              <History className="w-4 h-4" /> היסטוריה
            </button>
            <button onClick={() => setShowZConfirm(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm flex items-center gap-1 font-medium">
              <Lock className="w-4 h-4" /> הפק דוח Z
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            דוח Z סוגר את היום ומייצר סיכום סופי. לאחר הפקה לא ניתן לשנות את הנתונים.
          </p>

          {/* Z-Report confirm dialog */}
          {showZConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
                <AlertCircle className="w-5 h-5" />
                האם להפיק דוח Z לסגירת יום?
              </div>
              <p className="text-sm text-red-600 mb-3">פעולה זו תיצור דוח סופי ותנעל את הנתונים.</p>
              <div className="flex gap-2">
                <button onClick={() => zMutation.mutate()}
                  disabled={zMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50">
                  {zMutation.isPending ? 'מפיק...' : 'אישור — הפק דוח Z'}
                </button>
                <button onClick={() => setShowZConfirm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
                  ביטול
                </button>
              </div>
            </div>
          )}

          {/* Past Z-Reports list */}
          {zListOpen && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">דוחות Z קודמים</h4>
              {zLoading ? (
                <div className="text-center py-4 text-gray-400">טוען...</div>
              ) : zReports.length === 0 ? (
                <div className="text-center py-4 text-gray-400">אין דוחות Z קודמים</div>
              ) : (
                <div className="space-y-2">
                  {zReports.map((zr: any) => (
                    <div key={zr.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border">
                      <div>
                        <div className="font-medium text-gray-800">
                          {zr.reportDate ? new Date(zr.reportDate).toLocaleDateString('he-IL') : zr.id.slice(-8)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {zr.createdAt ? new Date(zr.createdAt).toLocaleString('he-IL') : ''}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-gray-900">{fmtCurrency(Number(zr.netSales ?? zr.totalSales ?? 0))}</div>
                        <div className="text-xs text-gray-400">{zr.transactionCount ?? 0} עסקאות</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
