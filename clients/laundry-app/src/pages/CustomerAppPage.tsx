/**
 * Customer Mini-App — אפליקציית לקוח מלאה למובייל
 * Route: /customer-app
 *
 * לקוח מתחבר עם OTP ויש לו ממשק מלא: הזמנות, בקשת איסוף, היסטוריה, פרופיל.
 * ללא גישה לממשק הניהול.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Shirt, Phone, CheckCircle, Clock, Package, ArrowRight, LogOut, RefreshCw,
  Plus, Home, History, User, MapPin, CalendarDays, FileText, Wallet,
  ChevronRight, Search, Filter, Truck, X,
} from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, STATUS_FLOW } from '../lib/constants';

const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
});

type Tab = 'home' | 'new-order' | 'history' | 'profile';

export default function CustomerAppPage() {
  const [step, setStep] = useState<'login' | 'otp' | 'app'>('login');
  const [phone, setPhone] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('home');

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // Check for saved session
  useEffect(() => {
    const saved = localStorage.getItem('customer_token');
    const savedSlug = localStorage.getItem('customer_tenant');
    if (saved) {
      setToken(saved);
      if (savedSlug) setTenantSlug(savedSlug);
      setStep('app');
      fetchMe(saved);
    }
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tenant');
    if (t) setTenantSlug(t);
  }, []);

  const fetchMe = async (t: string) => {
    try {
      const res = await publicApi.get('/customer-auth/me', { headers: { Authorization: `Bearer ${t}` } });
      setCustomer(res.data.data);
    } catch {
      localStorage.removeItem('customer_token');
      localStorage.removeItem('customer_tenant');
      setToken(null);
      setStep('login');
    }
  };

  const sendOtp = async () => {
    if (!phone.trim() || !tenantSlug.trim()) return;
    setLoading(true); setError('');
    try {
      await publicApi.post('/customer-auth/send-otp', { phone: phone.trim(), tenantSlug: tenantSlug.trim() });
      setStep('otp');
    } catch {
      setError('שגיאה בשליחת קוד אימות');
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await publicApi.post('/customer-auth/verify-otp', {
        phone: phone.trim(), tenantSlug: tenantSlug.trim(), code: otpCode.trim(),
      });
      const { token: t, customer: c } = res.data.data;
      setToken(t); setCustomer(c);
      localStorage.setItem('customer_token', t);
      localStorage.setItem('customer_tenant', tenantSlug.trim());
      setStep('app');
    } catch {
      setError('קוד אימות שגוי או פג תוקף');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_tenant');
    setToken(null); setCustomer(null);
    setStep('login'); setOtpCode(''); setTab('home');
  };

  // ─── Login / OTP Screen ───────────────────────────────────────

  if (step === 'login' || step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center p-4 safe-area" dir="rtl">
        <div className="mb-8 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-200">
            <Shirt className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800">LaundryOS</h1>
          <p className="text-gray-500 mt-1 text-sm">ניהול כביסה חכם — פורטל לקוח</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl shadow-blue-100 p-8 w-full max-w-md">
          {step === 'login' ? (
            <>
              <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">התחברות</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">שם המכבסה</label>
                  <input type="text" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)}
                    placeholder="למשל: מכבסת השכונה"
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">מספר טלפון</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-4 w-5 h-5 text-gray-400" />
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendOtp()}
                      placeholder="050-1234567"
                      className="w-full pr-12 pl-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50 text-lg" />
                  </div>
                </div>
                {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-xl">{error}</p>}
                <button onClick={sendOtp} disabled={loading || !phone.trim() || !tenantSlug.trim()}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
                  {loading ? 'שולח...' : 'שלח קוד אימות'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">הזן קוד אימות</h2>
              <p className="text-sm text-gray-500 text-center mb-6">נשלח ב-WhatsApp למספר {phone}</p>
              <div className="space-y-4">
                <input type="text" value={otpCode} onChange={e => setOtpCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && verifyOtp()}
                  placeholder="------" maxLength={6}
                  className="w-full text-center text-4xl font-mono tracking-[0.5em] py-5 border-2 border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                  autoFocus />
                {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-xl">{error}</p>}
                <button onClick={verifyOtp} disabled={loading || !otpCode.trim()}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
                  {loading ? 'מאמת...' : 'אמת קוד'}
                </button>
                <button onClick={() => { setStep('login'); setError(''); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">חזרה</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── App Shell ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-40 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Shirt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">שלום{customer?.name && customer.name !== 'לקוח חדש' ? `, ${customer.name}` : ''}</h1>
              <p className="text-blue-200 text-xs">{customer?.phone}</p>
            </div>
          </div>
          <button onClick={() => token && fetchMe(token)}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {tab === 'home' && <HomeTab token={token!} authHeaders={authHeaders} customer={customer} onTabChange={setTab} />}
        {tab === 'new-order' && <NewOrderTab token={token!} authHeaders={authHeaders} onSuccess={() => setTab('home')} />}
        {tab === 'history' && <HistoryTab token={token!} authHeaders={authHeaders} />}
        {tab === 'profile' && <ProfileTab customer={customer} token={token!} authHeaders={authHeaders} onLogout={handleLogout} onRefresh={() => token && fetchMe(token)} />}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-50 safe-area-bottom">
        <div className="max-w-lg mx-auto flex justify-around">
          {[
            { id: 'home' as Tab, icon: Home, label: 'ראשי' },
            { id: 'new-order' as Tab, icon: Plus, label: 'הזמנה חדשה' },
            { id: 'history' as Tab, icon: History, label: 'היסטוריה' },
            { id: 'profile' as Tab, icon: User, label: 'פרופיל' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-col items-center py-3 px-4 transition-colors ${
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

// ─── Home Tab ─────────────────────────────────────────────────

function HomeTab({ token, authHeaders, customer, onTabChange }: {
  token: string; authHeaders: () => any; customer: any; onTabChange: (t: Tab) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [prepaid, setPrepaid] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      publicApi.get('/customer-auth/orders?limit=5', { headers: authHeaders() }),
      publicApi.get('/customer-auth/prepaid', { headers: authHeaders() }),
    ]).then(([ordersRes, prepaidRes]) => {
      setOrders(ordersRes.data.data?.orders || []);
      setPrepaid(prepaidRes.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  if (selectedOrder) {
    return <OrderDetail order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

  const activeOrders = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
  const balance = Number(prepaid?.balance || 0);

  return (
    <div className="p-4 space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">הזמנות פעילות</span>
          </div>
          <p className="text-3xl font-extrabold text-gray-800">{activeOrders.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">יתרת מקדמה</span>
          </div>
          <p className="text-3xl font-extrabold text-gray-800">{balance > 0 ? `${balance.toLocaleString()} ₪` : '—'}</p>
        </div>
      </div>

      {/* Quick Action */}
      <button onClick={() => onTabChange('new-order')}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-4 flex items-center gap-4 shadow-lg shadow-blue-100 active:scale-[0.98] transition-transform">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <Truck className="w-6 h-6" />
        </div>
        <div className="text-right flex-1">
          <p className="font-bold text-lg">הזמן איסוף</p>
          <p className="text-blue-200 text-sm">נגיע לאסוף את הכביסה מהבית</p>
        </div>
        <ChevronRight className="w-5 h-5 text-blue-200" />
      </button>

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-3">הזמנות פעילות</h2>
          <div className="space-y-2">
            {activeOrders.map(order => (
              <OrderCard key={order.id} order={order} onSelect={() => setSelectedOrder(order)} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">הזמנות אחרונות</h2>
          <button onClick={() => onTabChange('history')} className="text-sm text-blue-600 font-medium">הכל</button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-400">טוען...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border">
            <Package className="w-14 h-14 mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">אין הזמנות עדיין</p>
            <p className="text-gray-400 text-sm mt-1">הזמן איסוף כדי להתחיל</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status)).slice(0, 3).map(order => (
              <OrderCard key={order.id} order={order} onSelect={() => setSelectedOrder(order)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────

function OrderCard({ order, onSelect }: { order: any; onSelect: () => void }) {
  const itemCount = order.items?.length || 0;
  return (
    <div onClick={onSelect}
      className="bg-white rounded-2xl border shadow-sm p-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.98]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm text-blue-600 font-medium">{order.orderNumber}</span>
        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[order.status] || order.status}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {new Date(order.receivedAt).toLocaleDateString('he-IL')}
          </span>
          {itemCount > 0 && (
            <span className="text-gray-400">{itemCount} פריטים</span>
          )}
        </div>
        <span className="font-bold text-gray-800">
          {Number(order.total) > 0 ? `${Number(order.total).toLocaleString()} ₪` : '—'}
        </span>
      </div>
    </div>
  );
}

// ─── New Order Tab ────────────────────────────────────────────

function NewOrderTab({ token, authHeaders, onSuccess }: {
  token: string; authHeaders: () => any; onSuccess: () => void;
}) {
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!street.trim() || !city.trim()) { setError('נא למלא כתובת'); return; }
    setLoading(true); setError('');
    try {
      await publicApi.post('/customer-auth/orders', {
        address: { street: street.trim(), city: city.trim(), floor: floor.trim() || undefined, apartment: apartment.trim() || undefined },
        notes: notes.trim() || undefined,
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
      }, { headers: authHeaders() });
      setSuccess(true);
      setTimeout(onSuccess, 2000);
    } catch {
      setError('שגיאה בשליחת הבקשה');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">הבקשה נשלחה!</h2>
        <p className="text-gray-500 text-center">נגיע לאסוף את הכביסה בהקדם. תקבל עדכון ב-WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">בקשת איסוף</h2>
        <p className="text-sm text-gray-500">מלא את הכתובת ונגיע לאסוף</p>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 text-blue-600 font-bold mb-1">
          <MapPin className="w-5 h-5" />
          <span>כתובת איסוף</span>
        </div>

        <div>
          <label className="text-sm text-gray-600 mb-1 block">רחוב ומספר *</label>
          <input type="text" value={street} onChange={e => setStreet(e.target.value)}
            placeholder="למשל: הרצל 15"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
        </div>
        <div>
          <label className="text-sm text-gray-600 mb-1 block">עיר *</label>
          <input type="text" value={city} onChange={e => setCity(e.target.value)}
            placeholder="למשל: תל אביב"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">קומה</label>
            <input type="text" value={floor} onChange={e => setFloor(e.target.value)} placeholder="3"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">דירה</label>
            <input type="text" value={apartment} onChange={e => setApartment(e.target.value)} placeholder="7"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 text-blue-600 font-bold mb-1">
          <CalendarDays className="w-5 h-5" />
          <span>מועד מועדף</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">תאריך</label>
            <input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">שעה</label>
            <select value={preferredTime} onChange={e => setPreferredTime(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50">
              <option value="">לא משנה</option>
              <option value="08:00-10:00">08:00-10:00</option>
              <option value="10:00-12:00">10:00-12:00</option>
              <option value="12:00-14:00">12:00-14:00</option>
              <option value="14:00-16:00">14:00-16:00</option>
              <option value="16:00-18:00">16:00-18:00</option>
              <option value="18:00-20:00">18:00-20:00</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex items-center gap-2 text-blue-600 font-bold mb-3">
          <FileText className="w-5 h-5" />
          <span>הערות</span>
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="הוראות מיוחדות, סוגי פריטים, וכו׳..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 resize-none" />
      </div>

      {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-xl">{error}</p>}

      <button onClick={handleSubmit} disabled={loading || !street.trim() || !city.trim()}
        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg disabled:opacity-40 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
        {loading ? 'שולח...' : 'שלח בקשת איסוף'}
      </button>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────

function HistoryTab({ token, authHeaders }: { token: string; authHeaders: () => any }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchOrders = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '15' });
      if (filterStatus) params.set('status', filterStatus);
      const res = await publicApi.get(`/customer-auth/orders?${params}`, { headers: authHeaders() });
      const data = res.data.data;
      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {}
    setLoading(false);
  }, [filterStatus, token]);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  if (selectedOrder) {
    return <OrderDetail order={selectedOrder} onBack={() => { setSelectedOrder(null); fetchOrders(page); }} />;
  }

  const filtered = searchTerm
    ? orders.filter(o => o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.notes?.includes(searchTerm))
    : orders;

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-bold text-gray-800">היסטוריית הזמנות</h2>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש..."
            className="w-full pr-10 pl-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">הכל</option>
          {STATUS_FLOW.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
          <option value="CANCELLED">בוטל</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border">
          <Package className="w-14 h-14 mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">אין הזמנות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => (
            <OrderCard key={order.id} order={order} onSelect={() => setSelectedOrder(order)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button onClick={() => fetchOrders(page - 1)} disabled={page <= 1}
            className="px-4 py-2 bg-white border rounded-xl text-sm disabled:opacity-30">הקודם</button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => fetchOrders(page + 1)} disabled={page >= totalPages}
            className="px-4 py-2 bg-white border rounded-xl text-sm disabled:opacity-30">הבא</button>
        </div>
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────

function ProfileTab({ customer, token, authHeaders, onLogout, onRefresh }: {
  customer: any; token: string; authHeaders: () => any; onLogout: () => void; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer?.name || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(customer?.name || '');
    setEmail(customer?.email || '');
  }, [customer]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await publicApi.patch('/customer-auth/profile',
        { name: name.trim() || undefined, email: email.trim() || undefined },
        { headers: authHeaders() });
      setEditing(false);
      onRefresh();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Profile Card */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <User className="w-10 h-10 text-blue-600" />
        </div>
        {editing ? (
          <div className="space-y-3 text-right">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">שם</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">אימייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50">
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 py-3 border rounded-xl text-gray-600">ביטול</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-800">{customer?.name || 'לקוח'}</h2>
            <p className="text-gray-500">{customer?.phone}</p>
            {customer?.email && <p className="text-gray-400 text-sm">{customer.email}</p>}
            <button onClick={() => setEditing(true)}
              className="mt-4 px-6 py-2 border border-blue-200 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50">
              ערוך פרטים
            </button>
          </>
        )}
      </div>

      {/* Info Cards */}
      <div className="bg-white rounded-2xl border shadow-sm divide-y">
        <div className="p-4 flex items-center gap-3">
          <Phone className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-500">טלפון</p>
            <p className="font-medium text-gray-800">{customer?.phone || '—'}</p>
          </div>
        </div>
        <div className="p-4 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-500">יתרת מקדמה</p>
            <p className="font-medium text-gray-800">—</p>
          </div>
        </div>
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

// ─── Order Detail ─────────────────────────────────────────────

function OrderDetail({ order, onBack }: { order: any; onBack: () => void }) {
  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const isPaid = Number(order.paidAmount || 0) >= Number(order.total);
  const total = Number(order.total);

  return (
    <div className="pb-20" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-40">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-xl">
            <ArrowRight className="w-5 h-5 rotate-180" />
          </button>
          <div>
            <h1 className="font-bold">הזמנה {order.orderNumber}</h1>
            <p className="text-blue-200 text-xs">{new Date(order.receivedAt).toLocaleDateString('he-IL')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Status Tracker */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800">מעקב הזמנה</h2>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${STATUS_COLORS[order.status] || 'bg-gray-100'}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          <div className="relative">
            {STATUS_FLOW.map((s, i) => {
              const isDone = i <= currentIdx;
              const isCurrent = s === order.status;
              const isLast = i === STATUS_FLOW.length - 1;
              return (
                <div key={s} className="flex gap-3 relative">
                  {/* Vertical line */}
                  {!isLast && (
                    <div className={`absolute right-[15px] top-8 w-0.5 h-6 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                    isCurrent ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' :
                    isDone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isDone && !isCurrent ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <div className={`pb-6 ${isCurrent ? 'font-bold text-blue-700' : isDone ? 'text-green-700' : 'text-gray-400'}`}>
                    <p className="text-sm">{STATUS_LABELS[s] || s}</p>
                    {isCurrent && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full animate-pulse">כרגע</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Items */}
        {order.items && order.items.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h3 className="font-bold text-gray-800 mb-3">פריטים ({order.items.length})</h3>
            <div className="space-y-2">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <span className="font-medium text-gray-800">{item.description || item.service?.name || 'פריט'}</span>
                    <span className="text-gray-400 text-sm mr-2">x{item.quantity}</span>
                  </div>
                  <span className="font-medium text-gray-700">
                    {Number(item.lineTotal) > 0 ? `${Number(item.lineTotal).toLocaleString()} ₪` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment */}
        {total > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="flex justify-between text-lg font-bold mb-3">
              <span>{"סה\"כ"}</span>
              <span>{total.toLocaleString()} ₪</span>
            </div>
            <div className={`text-center py-3 rounded-xl font-medium ${isPaid ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
              {isPaid ? 'שולם במלואו' : `נותר: ${(total - Number(order.paidAmount || 0)).toLocaleString()} ₪`}
            </div>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h3 className="font-bold text-gray-800 mb-2">הערות</h3>
            <p className="text-gray-600 text-sm">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
