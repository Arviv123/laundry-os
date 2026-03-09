/**
 * Driver Mini-App — אפליקציית נהג עצמאית למובייל
 * Route: /driver
 *
 * אפליקציה עצמאית לחלוטין — לוגין משלה, API משלה, ללא תלות במערכת הניהול.
 * נהג מתחבר עם אימייל + סיסמה + מזהה מכבסה ורואה רק את הסיבובים שלו.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Truck, MapPin, Navigation, CheckCircle, XCircle,
  Play, ArrowRight, Phone, Clock, Scan, PenTool,
  ChevronDown, ChevronUp, LogOut, RefreshCw, History,
  User, BarChart3, Calendar, Route, Mail, Lock, Building2,
} from 'lucide-react';

// ─── Standalone API (no dependency on main app auth) ────────────

const driverApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
});

function getDriverToken(): string | null {
  return localStorage.getItem('driver_token');
}

function driverHeaders() {
  const t = getDriverToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ─── Types ──────────────────────────────────────────────────────

type Tab = 'active' | 'history' | 'profile';

interface DriverUser {
  userId: string;
  email: string;
  name?: string;
  role: string;
  tenantId: string;
}

// ─── Main Component ─────────────────────────────────────────────

export default function DriverAppPage() {
  const [user, setUser] = useState<DriverUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [refreshKey, setRefreshKey] = useState(0);

  // Check saved session
  useEffect(() => {
    const saved = getDriverToken();
    const savedUser = localStorage.getItem('driver_user');
    if (saved && savedUser) {
      setToken(saved);
      try { setUser(JSON.parse(savedUser)); } catch { handleLogout(); }
    }
  }, []);

  const handleLogin = (t: string, u: DriverUser) => {
    setToken(t);
    setUser(u);
    localStorage.setItem('driver_token', t);
    localStorage.setItem('driver_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('driver_token');
    localStorage.removeItem('driver_user');
    setTab('active');
  };

  const refresh = () => setRefreshKey(k => k + 1);

  // ─── Login Screen ───────────────────────────────────────────

  if (!token || !user) {
    return <DriverLoginScreen onLogin={handleLogin} />;
  }

  // ─── App Shell ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-4 py-4 sticky top-0 z-40 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">שלום, {user.name || 'נהג'}</h1>
              <p className="text-blue-200 text-xs">{user.email}</p>
            </div>
          </div>
          <button onClick={refresh}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {tab === 'active' && <ActiveTab key={`active-${refreshKey}`} />}
        {tab === 'history' && <HistoryTab key={`history-${refreshKey}`} />}
        {tab === 'profile' && <ProfileTab user={user} onLogout={handleLogout} />}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-50">
        <div className="max-w-lg mx-auto flex justify-around">
          {[
            { id: 'active' as Tab, icon: Route, label: 'סיבובים' },
            { id: 'history' as Tab, icon: History, label: 'היסטוריה' },
            { id: 'profile' as Tab, icon: User, label: 'פרופיל' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-col items-center py-3 px-6 transition-colors ${
                tab === t.id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <t.icon className={`w-5 h-5 ${tab === t.id ? 'stroke-[2.5]' : ''}`} />
              <span className="text-[10px] mt-1 font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ─── Driver Login Screen ──────────────────────────────────────

function DriverLoginScreen({ onLogin }: { onLogin: (token: string, user: DriverUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Get tenant from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tenant');
    if (t) setTenantId(t);
  }, []);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim() || !tenantId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await driverApi.post('/users/login', {
        email: email.trim(),
        password: password.trim(),
        tenantId: tenantId.trim(),
      });
      const { token: t, user: u } = res.data.data;
      onLogin(t, u);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאת התחברות');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="mb-8 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-200">
          <Truck className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-800">LaundryOS</h1>
        <p className="text-gray-500 mt-1 text-sm">אפליקציית נהג</p>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl shadow-blue-100 p-8 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">התחברות נהג</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">מזהה מכבסה</label>
            <div className="relative">
              <Building2 className="absolute right-4 top-4 w-5 h-5 text-gray-400" />
              <input type="text" value={tenantId} onChange={e => setTenantId(e.target.value)}
                placeholder="מזהה או שם המכבסה"
                className="w-full pr-12 pl-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">אימייל</label>
            <div className="relative">
              <Mail className="absolute right-4 top-4 w-5 h-5 text-gray-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="driver@example.com"
                className="w-full pr-12 pl-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">סיסמה</label>
            <div className="relative">
              <Lock className="absolute right-4 top-4 w-5 h-5 text-gray-400" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="הזן סיסמה"
                className="w-full pr-12 pl-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50" />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-xl">{error}</p>}

          <button onClick={handleSubmit} disabled={loading || !email.trim() || !password.trim() || !tenantId.trim()}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-2xl font-bold text-lg hover:from-blue-700 hover:to-blue-900 disabled:opacity-40 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast (lightweight, no dependency on main app) ─────────

function useDriverToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const show = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  }, []);
  const Toast = msg ? (
    <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium animate-bounce ${
      msg.type === 'error' ? 'bg-red-600' : 'bg-green-600'
    }`} dir="rtl">{msg.text}</div>
  ) : null;
  return { show, Toast };
}

// ─── Active Runs Tab ──────────────────────────────────────────

function ActiveTab() {
  const { show, Toast } = useDriverToast();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await driverApi.get('/delivery/runs/my', { headers: driverHeaders() });
      const data = Array.isArray(res.data.data) ? res.data.data : [];
      setRuns(data);
      if (!activeRunId && data.length > 0) {
        const ip = data.find((r: any) => r.status === 'IN_PROGRESS');
        setActiveRunId(ip?.id || data[0]?.id);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchRuns(); const i = setInterval(fetchRuns, 15_000); return () => clearInterval(i); }, [fetchRuns]);

  const activeRun = runs.find(r => r.id === activeRunId) || null;

  const startRun = async (runId: string) => {
    try { await driverApi.patch(`/delivery/runs/${runId}/start`, {}, { headers: driverHeaders() }); show('הסיבוב התחיל!'); fetchRuns(); }
    catch { show('שגיאה', 'error'); }
  };

  const completeRun = async (runId: string) => {
    try { await driverApi.patch(`/delivery/runs/${runId}/complete`, {}, { headers: driverHeaders() }); show('הסיבוב הושלם!'); fetchRuns(); }
    catch { show('שגיאה', 'error'); }
  };

  if (loading) return <div className="p-4 text-center py-20 text-gray-400">טוען סיבובים...</div>;

  return (
    <div className="p-4 space-y-4">
      {Toast}

      {/* Today Summary */}
      <TodaySummary runs={runs} />

      {/* Run Selector */}
      {runs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {runs.map((run: any) => {
            const completed = run.stops?.filter((s: any) => s.status === 'STOP_COMPLETED').length ?? 0;
            const total = run.stops?.length ?? 0;
            return (
              <button key={run.id} onClick={() => setActiveRunId(run.id)}
                className={`flex-shrink-0 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                  activeRunId === run.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                    : 'bg-white border text-gray-600 hover:border-blue-300'
                }`}>
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4" />
                  <span>{new Date(run.date).toLocaleDateString('he-IL')}</span>
                </div>
                <div className="text-[10px] mt-1 opacity-75">{completed}/{total} עצירות</div>
              </button>
            );
          })}
        </div>
      )}

      {/* No Runs */}
      {runs.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <Truck className="w-16 h-16 mx-auto text-gray-200 mb-4" />
          <h2 className="text-lg font-bold text-gray-500 mb-2">אין סיבובים פעילים</h2>
          <p className="text-gray-400 text-sm">סיבובים שמוקצים לך יופיעו כאן</p>
        </div>
      )}

      {/* Active Run */}
      {activeRun && (
        <DriverRunView
          run={activeRun}
          onStart={() => startRun(activeRun.id)}
          onComplete={() => completeRun(activeRun.id)}
          onRefresh={fetchRuns}
          toast={show}
        />
      )}
    </div>
  );
}

// ─── Today Summary ────────────────────────────────────────────

function TodaySummary({ runs }: { runs: any[] }) {
  const totalStops = runs.reduce((acc, r) => acc + (r.stops?.length || 0), 0);
  const completedStops = runs.reduce((acc, r) => acc + (r.stops?.filter((s: any) => s.status === 'STOP_COMPLETED').length || 0), 0);
  const inProgressRuns = runs.filter(r => r.status === 'IN_PROGRESS').length;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white rounded-2xl p-3 border shadow-sm text-center">
        <p className="text-2xl font-extrabold text-blue-600">{runs.length}</p>
        <p className="text-[10px] text-gray-500 mt-1">סיבובים</p>
      </div>
      <div className="bg-white rounded-2xl p-3 border shadow-sm text-center">
        <p className="text-2xl font-extrabold text-green-600">{completedStops}/{totalStops}</p>
        <p className="text-[10px] text-gray-500 mt-1">עצירות</p>
      </div>
      <div className="bg-white rounded-2xl p-3 border shadow-sm text-center">
        <p className="text-2xl font-extrabold text-orange-600">{inProgressRuns}</p>
        <p className="text-[10px] text-gray-500 mt-1">בדרך</p>
      </div>
    </div>
  );
}

// ─── Run View ─────────────────────────────────────────────────

function DriverRunView({ run, onStart, onComplete, onRefresh, toast }: {
  run: any; onStart: () => void; onComplete: () => void;
  onRefresh: () => void; toast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [showScan, setShowScan] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [showSignature, setShowSignature] = useState<string | null>(null);
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const completedStops = run.stops?.filter((s: any) => s.status === 'STOP_COMPLETED').length ?? 0;
  const totalStops = run.stops?.length ?? 0;
  const failedStops = run.stops?.filter((s: any) => s.status === 'FAILED').length ?? 0;
  const allDone = (completedStops + failedStops) === totalStops && totalStops > 0;
  const progress = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;

  const navigate = async (stopId: string) => {
    try {
      const res = await driverApi.post(`/delivery/runs/${run.id}/stops/${stopId}/navigate`, {}, { headers: driverHeaders() });
      window.open(res.data.data.wazeUrl, '_blank');
      toast('WhatsApp נשלח ללקוח');
      onRefresh();
    } catch { toast('שגיאה', 'error'); }
  };

  const arrive = async (stopId: string) => {
    try {
      await driverApi.patch(`/delivery/runs/${run.id}/stops/${stopId}/arrive`, {}, { headers: driverHeaders() });
      toast('סומן כהגעה');
      onRefresh();
    } catch { toast('שגיאה', 'error'); }
  };

  const completeStop = async (stopId: string, signature?: string) => {
    try {
      await driverApi.patch(`/delivery/runs/${run.id}/stops/${stopId}`, { signature }, { headers: driverHeaders() });
      toast('הושלם');
      setShowSignature(null);
      onRefresh();
    } catch (err: any) { toast(err.response?.data?.error || 'שגיאה', 'error'); }
  };

  const failStop = async (stopId: string, notes: string) => {
    try {
      await driverApi.patch(`/delivery/runs/${run.id}/stops/${stopId}`, { status: 'FAILED', notes }, { headers: driverHeaders() });
      toast('סומן כנכשל');
      onRefresh();
    } catch { toast('שגיאה', 'error'); }
  };

  const scan = async (barcode: string) => {
    try {
      const res = await driverApi.post(`/delivery/runs/${run.id}/scan`, { barcode }, { headers: driverHeaders() });
      const { stop } = res.data.data;
      setHighlightedStopId(stop.id);
      toast(`נמצא: ${stop.order?.customer?.name || 'לקוח'}`);
      setTimeout(() => setHighlightedStopId(null), 5000);
      document.getElementById(`driver-stop-${stop.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { toast('פריט לא נמצא בסיבוב', 'error'); }
  };

  return (
    <>
      {/* Run Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
              <Route className="w-5 h-5 text-blue-600" />
              סיבוב משלוחים
            </h2>
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(run.date).toLocaleDateString('he-IL')}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
            run.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
            run.status === 'COMPLETED_RUN' ? 'bg-green-100 text-green-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {run.status === 'IN_PROGRESS' ? 'בדרך' : run.status === 'COMPLETED_RUN' ? 'הושלם' : 'מתוכנן'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="bg-gradient-to-r from-green-400 to-green-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm font-bold text-gray-700 min-w-[40px] text-left">{completedStops}/{totalStops}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {run.status === 'PLANNED' && (
            <button onClick={onStart}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-[0.98] transition-all">
              <Play className="w-5 h-5" /> התחל סיבוב
            </button>
          )}
          {run.status === 'IN_PROGRESS' && allDone && (
            <button onClick={onComplete}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-green-200 active:scale-[0.98] transition-all">
              <CheckCircle className="w-5 h-5" /> סיים סיבוב
            </button>
          )}
          <button onClick={() => { setShowScan(!showScan); setTimeout(() => scanRef.current?.focus(), 100); }}
            className={`flex items-center gap-2 px-5 py-3.5 rounded-xl font-medium transition-all ${
              showScan ? 'bg-purple-600 text-white shadow-lg' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            }`}>
            <Scan className="w-5 h-5" />
            <span className="text-sm">סרוק</span>
          </button>
        </div>
      </div>

      {/* Scanner */}
      {showScan && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <div className="flex gap-2">
            <input ref={scanRef} type="text" value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && scanInput.trim()) { scan(scanInput.trim()); setScanInput(''); } }}
              placeholder="סרוק ברקוד או הקלד..."
              className="flex-1 border border-purple-300 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
              autoComplete="off" />
            <button onClick={() => { if (scanInput.trim()) { scan(scanInput.trim()); setScanInput(''); } }}
              disabled={!scanInput.trim()}
              className="bg-purple-600 text-white px-5 rounded-xl hover:bg-purple-700 disabled:opacity-40 font-bold active:scale-[0.95] transition-all">
              חפש
            </button>
          </div>
        </div>
      )}

      {/* Stops List */}
      <div className="space-y-2">
        {run.stops?.map((stop: any, i: number) => (
          <DriverStopCard
            key={stop.id}
            stop={stop}
            index={i}
            isHighlighted={highlightedStopId === stop.id}
            isActive={run.status === 'IN_PROGRESS'}
            onNavigate={() => navigate(stop.id)}
            onArrive={() => arrive(stop.id)}
            onComplete={() => {
              const requiresSig = (stop.order?.customer?.metadata as any)?.requireSignature;
              if (requiresSig) { setShowSignature(stop.id); }
              else { completeStop(stop.id); }
            }}
            onSign={() => setShowSignature(stop.id)}
            onFail={(notes) => failStop(stop.id, notes)}
          />
        ))}
      </div>

      {/* Signature Modal */}
      {showSignature && (
        <SignatureModal
          onClose={() => setShowSignature(null)}
          onConfirm={(sig) => completeStop(showSignature, sig)}
        />
      )}
    </>
  );
}

// ─── Stop Card ────────────────────────────────────────────────

function DriverStopCard({ stop, index, isHighlighted, isActive, onNavigate, onArrive, onComplete, onSign, onFail }: {
  stop: any; index: number; isHighlighted: boolean; isActive: boolean;
  onNavigate: () => void; onArrive: () => void; onComplete: () => void; onSign: () => void;
  onFail: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFail, setShowFail] = useState(false);
  const [failNotes, setFailNotes] = useState('');

  const addr = stop.address as any;
  const addressStr = [addr?.street, addr?.city].filter(Boolean).join(', ');
  const phone = stop.order?.customer?.phone;
  const isDone = stop.status === 'STOP_COMPLETED' || stop.status === 'FAILED';
  const requiresSig = (stop.order?.customer?.metadata as any)?.requireSignature;

  const statusLabels: Record<string, string> = { STOP_PENDING: 'ממתין', ARRIVED: 'הגיע', STOP_COMPLETED: 'הושלם', FAILED: 'נכשל' };
  const statusColors: Record<string, string> = {
    STOP_PENDING: 'bg-gray-100 text-gray-600',
    ARRIVED: 'bg-blue-100 text-blue-700',
    STOP_COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  return (
    <div id={`driver-stop-${stop.id}`}
      className={`bg-white rounded-2xl border shadow-sm transition-all ${
        isHighlighted ? 'ring-2 ring-purple-500 shadow-purple-100' : ''
      } ${isDone ? 'opacity-60' : ''}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            stop.status === 'FAILED' ? 'bg-red-100 text-red-600' :
            isDone ? 'bg-green-100 text-green-600' :
            stop.status === 'ARRIVED' ? 'bg-blue-100 text-blue-600' :
            'bg-gray-100 text-gray-600'
          }`}>
            {isDone ? <CheckCircle className="w-5 h-5" /> :
             stop.status === 'FAILED' ? <XCircle className="w-5 h-5" /> :
             index + 1}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold ${
                stop.type === 'PICKUP_STOP' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {stop.type === 'PICKUP_STOP' ? 'איסוף' : 'משלוח'}
              </span>
              <span className="font-semibold text-gray-800 truncate">{stop.order?.customer?.name || 'לקוח'}</span>
              {requiresSig && <PenTool className="w-3.5 h-3.5 text-orange-500" />}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-1 mb-1">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {addressStr || 'ללא כתובת'}
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium ${statusColors[stop.status] || 'bg-gray-100'}`}>
                {statusLabels[stop.status] || stop.status}
              </span>
              <span className="text-xs text-gray-400 font-mono">{stop.order?.orderNumber}</span>
            </div>
          </div>

          <button onClick={() => setExpanded(!expanded)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>

        {isActive && !isDone && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {addressStr && (
              <button onClick={onNavigate}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium shadow-sm active:scale-[0.96] transition-all">
                <Navigation className="w-4 h-4" /> נווט
              </button>
            )}
            {phone && (
              <button onClick={() => window.open(`tel:${phone}`, '_self')}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">
                <Phone className="w-4 h-4" /> חייג
              </button>
            )}
            {stop.status === 'STOP_PENDING' && (
              <button onClick={onArrive}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium shadow-sm active:scale-[0.96] transition-all">
                <ArrowRight className="w-4 h-4" /> הגעתי
              </button>
            )}
            {(stop.status === 'ARRIVED' || stop.status === 'STOP_PENDING') && (
              <>
                {requiresSig ? (
                  <button onClick={onSign}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium shadow-sm active:scale-[0.96] transition-all">
                    <PenTool className="w-4 h-4" /> חתום ומסור
                  </button>
                ) : (
                  <button onClick={onComplete}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium shadow-sm active:scale-[0.96] transition-all">
                    <CheckCircle className="w-4 h-4" /> הושלם
                  </button>
                )}
                <button onClick={() => setShowFail(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
                  <XCircle className="w-4 h-4" /> נכשל
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 text-sm bg-gray-50/50 rounded-b-2xl space-y-1.5">
          {stop.order?.items?.map((item: any) => (
            <div key={item.id} className="flex items-center gap-2 text-gray-600">
              <span className="font-mono text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{item.barcode || '—'}</span>
              <span>{item.description} x{item.quantity}</span>
            </div>
          ))}
          {addr?.floor && <div className="text-gray-500">קומה: {addr.floor}</div>}
          {addr?.apartment && <div className="text-gray-500">דירה: {addr.apartment}</div>}
          {addr?.notes && <div className="text-gray-500">הערות: {addr.notes}</div>}
          {stop.notes && <div className="text-gray-500">הערת נהג: {stop.notes}</div>}
          {stop.completedTime && (
            <div className="text-green-600 text-xs">הושלם: {new Date(stop.completedTime).toLocaleTimeString('he-IL')}</div>
          )}
        </div>
      )}

      {showFail && (
        <div className="border-t px-4 py-3 bg-red-50/50 rounded-b-2xl">
          <textarea value={failNotes} onChange={e => setFailNotes(e.target.value)}
            placeholder="סיבת כישלון (למשל: לא היה בבית, כתובת שגויה)..." rows={2}
            className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onFail(failNotes); setShowFail(false); setFailNotes(''); }}
              className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold">אשר</button>
            <button onClick={() => { setShowFail(false); setFailNotes(''); }}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm">ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────

function HistoryTab() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await driverApi.get(`/delivery/runs/my/history?page=${p}&limit=15`, { headers: driverHeaders() });
      const data = res.data.data;
      setRuns(data.runs || []);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchHistory(1); }, [fetchHistory]);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-bold text-gray-800">היסטוריית סיבובים</h2>

      {loading ? (
        <div className="text-center py-16 text-gray-400">טוען...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <History className="w-14 h-14 mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">אין היסטוריה</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run: any) => {
            const completed = run.stops?.filter((s: any) => s.status === 'STOP_COMPLETED').length ?? 0;
            const failed = run.stops?.filter((s: any) => s.status === 'FAILED').length ?? 0;
            const total = run.stops?.length ?? 0;
            return (
              <div key={run.id} className="bg-white rounded-2xl border shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-800">
                      {new Date(run.date).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">הושלם</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" /> {completed} הושלמו
                  </span>
                  {failed > 0 && (
                    <span className="flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-red-500" /> {failed} נכשלו
                    </span>
                  )}
                  <span className="text-gray-400">סה"כ {total} עצירות</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button onClick={() => fetchHistory(page - 1)} disabled={page <= 1}
            className="px-4 py-2 bg-white border rounded-xl text-sm disabled:opacity-30">הקודם</button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => fetchHistory(page + 1)} disabled={page >= totalPages}
            className="px-4 py-2 bg-white border rounded-xl text-sm disabled:opacity-30">הבא</button>
        </div>
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────

function ProfileTab({ user, onLogout }: { user: DriverUser; onLogout: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    driverApi.get('/delivery/runs/my/stats', { headers: driverHeaders() })
      .then(res => setStats(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 space-y-4">
      {/* Profile Card */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <User className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">{user.name || 'נהג'}</h2>
        <p className="text-gray-500 text-sm">{user.email}</p>
        <span className="inline-block mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">נהג</span>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          סטטיסטיקות
        </h3>
        {loading ? (
          <div className="text-center py-4 text-gray-400">טוען...</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-blue-50 rounded-xl">
              <p className="text-2xl font-extrabold text-blue-600">{stats?.todayRuns ?? 0}</p>
              <p className="text-[10px] text-gray-500 mt-1">סיבובים היום</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <p className="text-2xl font-extrabold text-green-600">{stats?.totalCompletedRuns ?? 0}</p>
              <p className="text-[10px] text-gray-500 mt-1">סיבובים שהושלמו</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-xl">
              <p className="text-2xl font-extrabold text-purple-600">{stats?.totalCompletedStops ?? 0}</p>
              <p className="text-[10px] text-gray-500 mt-1">עצירות הושלמו</p>
            </div>
          </div>
        )}
      </div>

      {/* Logout */}
      <button onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-4 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-colors">
        <LogOut className="w-5 h-5" />
        התנתק
      </button>
    </div>
  );
}

// ─── Signature Modal ──────────────────────────────────────────

function SignatureModal({ onClose, onConfirm }: {
  onClose: () => void; onConfirm: (sig: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); isDrawing.current = true; lastPos.current = getPos(e);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
    lastPos.current = pos;
  }, [getPos]);

  const endDraw = useCallback(() => { isDrawing.current = false; }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2"><PenTool className="w-5 h-5 text-blue-600" /> חתימה דיגיטלית</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <p className="text-sm text-gray-500 mb-3">חתום באצבע על המסך</p>
        <div className="border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden mb-4 bg-gray-50">
          <canvas ref={canvasRef} width={360} height={200} className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => {
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }} className="flex-1 py-3.5 border rounded-xl text-gray-600 font-medium hover:bg-gray-50">נקה</button>
          <button onClick={() => { const d = canvasRef.current?.toDataURL('image/png'); if (d) onConfirm(d); }}
            className="flex-1 py-3.5 bg-green-600 text-white rounded-xl font-bold active:scale-[0.98] transition-all">
            אשר חתימה
          </button>
        </div>
      </div>
    </div>
  );
}
