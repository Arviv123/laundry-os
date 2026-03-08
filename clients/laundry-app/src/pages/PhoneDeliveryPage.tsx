import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Phone, User, MapPin, Calendar, Clock, Truck, Package, Check,
  ArrowRight, ArrowLeft, Plus, Search, AlertCircle, CheckCircle2,
  Loader2, X, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import AddressAutocomplete, { type AddressValue } from '../components/AddressAutocomplete';

/* ───────── types ───────── */
interface Customer {
  id: string;
  name: string;
  phone: string;
  defaultDeliveryAddress?: { street?: string; city?: string; floor?: string; apartment?: string };
  email?: string;
  address?: { street?: string; city?: string };
  metadata?: Record<string, unknown>;
}

interface Driver {
  id: string;
  name: string;
  email?: string;
}

interface StepDef {
  label: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { label: 'לקוח', icon: User },
  { label: 'איסוף', icon: Package },
  { label: 'משלוח', icon: Truck },
  { label: 'סיכום', icon: Check },
];

const TIME_WINDOWS = [
  { value: 'morning', label: 'בוקר 8:00–12:00', range: '08:00-12:00' },
  { value: 'afternoon', label: 'צהריים 12:00–16:00', range: '12:00-16:00' },
  { value: 'evening', label: 'ערב 16:00–20:00', range: '16:00-20:00' },
];

const PRIORITY_OPTIONS = [
  { value: 'NORMAL', label: 'רגיל', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'EXPRESS', label: 'דחוף', color: 'bg-red-50 text-red-700 border-red-300' },
];

const DELIVERY_TYPES = [
  { value: 'same', label: 'אותה כתובת כמו האיסוף' },
  { value: 'different', label: 'כתובת אחרת' },
  { value: 'store', label: 'איסוף מהחנות' },
];

/* ───────── helpers ───────── */
function formatPhone(val: string): string {
  const digits = val.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function rawPhone(val: string): string {
  return val.replace(/\D/g, '');
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function formatDateHebrew(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ───────── Component ───────── */
export default function PhoneDeliveryPage() {
  const { addToast } = useToast();
  const [step, setStep] = useState(0);

  /* === Step 1: Customer === */
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '', phone: '', email: '', street: '', city: '',
  });

  /* === Step 2: Pickup === */
  const [pickup, setPickup] = useState({
    street: '',
    city: '',
    floor: '',
    apartment: '',
    date: todayStr(),
    timeWindow: 'morning',
    bags: 1,
    instructions: '',
    priority: 'NORMAL',
    isRecurring: false,
    recurringDays: [] as number[],
  });

  /* === Step 3: Delivery === */
  const [delivery, setDelivery] = useState({
    type: 'same',
    street: '',
    city: '',
    date: tomorrowStr(),
    driverNotes: '',
  });

  /* === Step 4: Submit === */
  const [driverId, setDriverId] = useState('');
  const [orderResult, setOrderResult] = useState<{ orderId: string; orderNumber: string } | null>(null);

  /* ── sync pickup address from customer (prefer defaultDeliveryAddress) ── */
  useEffect(() => {
    if (!selectedCustomer) return;
    const addr = selectedCustomer.defaultDeliveryAddress || (selectedCustomer as any).address;
    if (addr) {
      setPickup(p => ({
        ...p,
        street: addr.street || '',
        city: addr.city || '',
        floor: addr.floor || '',
        apartment: addr.apartment || '',
      }));
    }
  }, [selectedCustomer]);

  /* ── customer search query ── */
  const debouncedSearch = useDebounce(searchQuery, 350);
  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['customer-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const res = await api.get('/crm/customers', { params: { search: debouncedSearch, limit: 10 } });
      return (res.data.data ?? res.data.customers ?? res.data) as Customer[];
    },
    enabled: debouncedSearch.length >= 2 && !selectedCustomer,
  });

  /* ── create customer mutation ── */
  const createCustomerMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: newCustomer.name.trim(),
        phone: rawPhone(newCustomer.phone),
      };
      if (newCustomer.email.trim()) body.email = newCustomer.email.trim();
      if (newCustomer.street.trim() || newCustomer.city.trim()) {
        body.address = { street: newCustomer.street.trim(), city: newCustomer.city.trim() };
      }
      const res = await api.post('/crm/customers', body);
      return (res.data.customer ?? res.data) as Customer;
    },
    onSuccess: (cust) => {
      setSelectedCustomer(cust);
      setIsCreatingNew(false);
      addToast('לקוח נוצר בהצלחה', 'success');
    },
    onError: () => addToast('שגיאה ביצירת לקוח', 'error'),
  });

  /* ── drivers list ── */
  const { data: drivers } = useQuery({
    queryKey: ['delivery-drivers'],
    queryFn: async () => {
      const res = await api.get('/delivery-mgmt/drivers');
      const raw = res.data.data ?? res.data.drivers ?? res.data;
      const arr = Array.isArray(raw) ? raw : [];
      return arr.map((d: any) => ({
        id: d.id,
        name: [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || d.id,
        email: d.email,
      })) as Driver[];
    },
  });

  /* ── submit order ── */
  const submitMut = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error('No customer');

      // 1) fetch first available service to use as default
      const svcRes = await api.get('/services');
      const services = svcRes.data.data ?? svcRes.data;
      const defaultService = Array.isArray(services) && services.length > 0 ? services[0] : null;
      if (!defaultService) throw new Error('אין שירותים מוגדרים במערכת');

      // 2) create order
      const orderBody: Record<string, unknown> = {
        customerId: selectedCustomer.id,
        deliveryType: 'HOME_DELIVERY',
        priority: pickup.priority,
        source: 'PICKUP',
        notes: pickup.instructions || undefined,
        deliveryAddress: { street: pickup.street, city: pickup.city },
        items: [{
          serviceId: defaultService.id,
          description: `איסוף כביסה — ${pickup.bags} שקיות`,
          quantity: pickup.bags || 1,
        }],
      };
      const orderRes = await api.post('/orders', orderBody);
      const order = orderRes.data.data ?? orderRes.data.order ?? orderRes.data;

      // 2) build delivery address
      let deliveryAddress = { street: pickup.street, city: pickup.city };
      if (delivery.type === 'different') {
        deliveryAddress = { street: delivery.street, city: delivery.city };
      }

      // 3) parse scheduled pickup datetime
      const tw = TIME_WINDOWS.find(t => t.value === pickup.timeWindow);
      const startHour = tw ? tw.range.split('-')[0] : '08:00';
      const scheduledPickup = `${pickup.date}T${startHour}:00`;

      // 4) create pickup assignment (only if driver selected; otherwise use auto-assign)
      if (driverId) {
        await api.post('/delivery-mgmt/assignments', {
          orderId: order.id,
          driverId,
          type: 'PICKUP',
          scheduledAt: scheduledPickup,
          notes: pickup.instructions || undefined,
        });

        // 5) create delivery assignment if not store pickup
        if (delivery.type !== 'store') {
          const scheduledDelivery = `${delivery.date}T${startHour}:00`;
          await api.post('/delivery-mgmt/assignments', {
            orderId: order.id,
            driverId,
            type: 'DELIVERY',
            scheduledAt: scheduledDelivery,
            notes: delivery.driverNotes || undefined,
          });
        }
      } else {
        // Auto-assign will pick an available driver
        await api.post('/delivery-mgmt/auto-assign').catch(() => {});
      }

      // Save address as customer's default
      await api.patch(`/crm/customers/${selectedCustomer.id}`, {
        defaultDeliveryAddress: { street: pickup.street, city: pickup.city, floor: pickup.floor, apartment: pickup.apartment },
      }).catch(() => {});

      // Create recurring order if enabled
      if (pickup.isRecurring && pickup.recurringDays.length > 0) {
        let deliveryAddress = { street: pickup.street, city: pickup.city };
        if (delivery.type === 'different') {
          deliveryAddress = { street: delivery.street, city: delivery.city };
        }
        await api.post('/delivery-mgmt/recurring-orders', {
          customerId: selectedCustomer.id,
          daysOfWeek: pickup.recurringDays,
          timeWindow: pickup.timeWindow,
          pickupAddress: { street: pickup.street, city: pickup.city, floor: pickup.floor, apartment: pickup.apartment },
          deliveryAddress: delivery.type !== 'same' ? deliveryAddress : undefined,
          deliveryType: delivery.type,
          bags: pickup.bags,
          priority: pickup.priority,
          instructions: pickup.instructions || undefined,
          driverId: driverId || undefined,
        }).catch(() => {});
      }

      return { orderId: order.id, orderNumber: order.orderNumber ?? order.id.slice(-8).toUpperCase() };
    },
    onSuccess: (result) => {
      setOrderResult(result);
      addToast('ההזמנה נוצרה בהצלחה!', 'success');
    },
    onError: () => addToast('שגיאה ביצירת ההזמנה', 'error'),
  });

  /* ── validation ── */
  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!selectedCustomer;
      case 1:
        return !!(pickup.street.trim() || pickup.city.trim()) && !!pickup.date && !!pickup.timeWindow;
      case 2:
        if (delivery.type === 'different') return !!(delivery.street.trim() || delivery.city.trim()) && !!delivery.date;
        if (delivery.type === 'store') return true;
        return !!delivery.date;
      case 3:
        return true;
      default:
        return false;
    }
  }

  function handleNext() {
    if (!canProceed()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function handlePrev() {
    if (step > 0) setStep(step - 1);
  }

  function handleReset() {
    setStep(0);
    setSelectedCustomer(null);
    setSearchQuery('');
    setIsCreatingNew(false);
    setNewCustomer({ name: '', phone: '', email: '', street: '', city: '' });
    setPickup({ street: '', city: '', floor: '', apartment: '', date: todayStr(), timeWindow: 'morning', bags: 1, instructions: '', priority: 'NORMAL', isRecurring: false, recurringDays: [] });
    setDelivery({ type: 'same', street: '', city: '', date: tomorrowStr(), driverNotes: '' });
    setDriverId('');
    setOrderResult(null);
  }

  /* ═════════ RENDER ═════════ */

  // ---- Success screen ----
  if (orderResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center animate-fade-in">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce-once">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">ההזמנה נוצרה בהצלחה!</h2>
          <p className="text-gray-500 mb-4">מספר הזמנה:</p>
          <div className="bg-gray-50 rounded-xl py-3 px-6 mb-6 inline-block">
            <span className="text-2xl font-mono font-bold text-blue-700">{orderResult.orderNumber}</span>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleReset}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              הזמנה חדשה
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              חזרה לתפריט
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Phone className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">הזמנת משלוח טלפוני</h1>
            <p className="text-sm text-gray-500">קבלת הזמנת איסוף/משלוח מלקוח בטלפון</p>
          </div>
        </div>
      </div>

      {/* ── Stepper ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        done
                          ? 'bg-green-500 text-white'
                          : active
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <span className={`mt-1 text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mt-[-14px] ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Step Content ── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {step === 0 && (
          <StepCustomer
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults ?? []}
            isSearching={isSearching}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            isCreatingNew={isCreatingNew}
            setIsCreatingNew={setIsCreatingNew}
            newCustomer={newCustomer}
            setNewCustomer={setNewCustomer}
            createCustomerMut={createCustomerMut}
          />
        )}
        {step === 1 && <StepPickup pickup={pickup} setPickup={setPickup} />}
        {step === 2 && <StepDelivery delivery={delivery} setDelivery={setDelivery} pickup={pickup} />}
        {step === 3 && (
          <StepSummary
            customer={selectedCustomer!}
            pickup={pickup}
            delivery={delivery}
            drivers={drivers ?? []}
            driverId={driverId}
            setDriverId={setDriverId}
          />
        )}

        {/* ── Nav Buttons ── */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={handlePrev}
            disabled={step === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <ArrowRight className="w-4 h-4" />
            הקודם
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              הבא
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {submitMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              שלח הזמנה
            </button>
          )}
        </div>
      </div>

      {/* Success animation styles */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.5s ease-out; }
        @keyframes bounce-once { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        .animate-bounce-once { animation: bounce-once 0.6s ease-in-out; }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Sub-components for each step
   ═══════════════════════════════════════════ */

/* ── Step 1: Customer ── */
function StepCustomer({
  searchQuery, setSearchQuery, searchResults, isSearching,
  selectedCustomer, setSelectedCustomer,
  isCreatingNew, setIsCreatingNew,
  newCustomer, setNewCustomer, createCustomerMut,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: Customer[];
  isSearching: boolean;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  isCreatingNew: boolean;
  setIsCreatingNew: (v: boolean) => void;
  newCustomer: { name: string; phone: string; email: string; street: string; city: string };
  setNewCustomer: (v: { name: string; phone: string; email: string; street: string; city: string }) => void;
  createCustomerMut: ReturnType<typeof useMutation<Customer, Error, void>>;
}) {
  // If customer is selected, show summary
  if (selectedCustomer) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            לקוח נבחר
          </h3>
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setSearchQuery('');
            }}
            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            שנה לקוח
          </button>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <User className="w-4 h-4 text-blue-500" />
            {selectedCustomer.name}
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4 text-blue-500" />
            {formatPhone(selectedCustomer.phone)}
          </div>
          {selectedCustomer.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-blue-500 text-sm">@</span>
              {selectedCustomer.email}
            </div>
          )}
          {selectedCustomer.address?.street && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-blue-500" />
              {selectedCustomer.address.street}{selectedCustomer.address.city ? `, ${selectedCustomer.address.city}` : ''}
            </div>
          )}
        </div>
      </div>
    );
  }

  // If creating new customer
  if (isCreatingNew) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-600" />
            לקוח חדש
          </h3>
          <button onClick={() => setIsCreatingNew(false)} className="text-sm text-gray-500 hover:text-gray-700">
            חזרה לחיפוש
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
            <input
              type="text"
              value={newCustomer.name}
              onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="ישראל ישראלי"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">טלפון *</label>
            <input
              type="tel"
              value={formatPhone(newCustomer.phone)}
              onChange={e => setNewCustomer({ ...newCustomer, phone: rawPhone(e.target.value) })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-left dir-ltr"
              placeholder="050-000-0000"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input
              type="email"
              value={newCustomer.email}
              onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-left"
              placeholder="email@example.com"
              dir="ltr"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">רחוב</label>
              <input
                type="text"
                value={newCustomer.street}
                onChange={e => setNewCustomer({ ...newCustomer, street: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="הרצל 10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עיר</label>
              <input
                type="text"
                value={newCustomer.city}
                onChange={e => setNewCustomer({ ...newCustomer, city: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="תל אביב"
              />
            </div>
          </div>
          <button
            onClick={() => createCustomerMut.mutate()}
            disabled={!newCustomer.name.trim() || !newCustomer.phone.trim() || createCustomerMut.isPending}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {createCustomerMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            צור לקוח
          </button>
        </div>
      </div>
    );
  }

  // Search mode
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Search className="w-5 h-5 text-blue-600" />
        חיפוש לקוח
      </h3>
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-xl pr-12 pl-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="חפש לפי שם או טלפון..."
          autoFocus
        />
        {isSearching && <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin" />}
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
          {searchResults.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCustomer(c)}
              className="w-full text-right p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <div className="font-medium text-gray-900">{c.name}</div>
              <div className="text-sm text-gray-500 flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {formatPhone(c.phone)}
                </span>
                {c.address?.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {c.address.city}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="mb-1">לא נמצאו תוצאות</p>
          <p className="text-sm text-gray-400">"{searchQuery}"</p>
        </div>
      )}

      {/* Create new button */}
      <button
        onClick={() => {
          setIsCreatingNew(true);
          // Pre-fill phone if user searched by number
          if (/^\d+$/.test(rawPhone(searchQuery)) && rawPhone(searchQuery).length >= 3) {
            setNewCustomer({ ...newCustomer, phone: rawPhone(searchQuery) });
          }
        }}
        className="w-full mt-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        יצירת לקוח חדש
      </button>
    </div>
  );
}

/* ── Step 2: Pickup ── */
function StepPickup({
  pickup,
  setPickup,
}: {
  pickup: { street: string; city: string; floor: string; apartment: string; date: string; timeWindow: string; bags: number; instructions: string; priority: string; isRecurring: boolean; recurringDays: number[] };
  setPickup: React.Dispatch<React.SetStateAction<typeof pickup>>;
}) {
  const DAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  return (
    <div className="space-y-6">
      {/* Address — Nominatim Autocomplete */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <AddressAutocomplete
          value={{ street: pickup.street, city: pickup.city, floor: pickup.floor, apartment: pickup.apartment }}
          onChange={(addr: AddressValue) => setPickup(p => ({ ...p, street: addr.street, city: addr.city, floor: addr.floor || '', apartment: addr.apartment || '' }))}
          label="כתובת איסוף"
          required
        />
      </div>

      {/* Date & Time */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          מועד איסוף
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך *</label>
            <input
              type="date"
              value={pickup.date}
              min={todayStr()}
              onChange={e => setPickup(p => ({ ...p, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">חלון זמן *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TIME_WINDOWS.map(tw => (
                <button
                  key={tw.value}
                  onClick={() => setPickup(p => ({ ...p, timeWindow: tw.value }))}
                  className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    pickup.timeWindow === tw.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  {tw.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bags & Priority */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          פרטי האיסוף
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כמות שקיות / פריטים (הערכה)</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPickup(p => ({ ...p, bags: Math.max(1, p.bags - 1) }))}
                className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50"
              >
                -
              </button>
              <span className="text-2xl font-bold text-gray-900 w-12 text-center">{pickup.bags}</span>
              <button
                onClick={() => setPickup(p => ({ ...p, bags: p.bags + 1 }))}
                className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">עדיפות</label>
            <div className="flex gap-3">
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPickup(prev => ({ ...prev, priority: p.value }))}
                  className={`flex-1 py-3 rounded-xl border-2 font-medium transition-all ${
                    pickup.priority === p.value
                      ? p.value === 'EXPRESS'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הוראות מיוחדות</label>
            <textarea
              value={pickup.instructions}
              onChange={e => setPickup(p => ({ ...p, instructions: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              rows={3}
              placeholder="למשל: קומה 3, אין מעלית, להתקשר לפני..."
            />
          </div>
        </div>
      </div>

      {/* Recurring Schedule */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-purple-600" />
          הזמנה חוזרת
        </h3>
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={pickup.isRecurring}
            onChange={e => setPickup(p => ({ ...p, isRecurring: e.target.checked }))}
            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm font-medium text-gray-700">קבע כהזמנה חוזרת (מלון, מסעדה, וכו׳)</span>
        </label>
        {pickup.isRecurring && (
          <div>
            <p className="text-sm text-gray-500 mb-3">בחר את הימים בשבוע לאיסוף קבוע:</p>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_HE.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPickup(p => ({
                    ...p,
                    recurringDays: p.recurringDays.includes(i)
                      ? p.recurringDays.filter(d => d !== i)
                      : [...p.recurringDays, i],
                  }))}
                  className={`py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                    pickup.recurringDays.includes(i)
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Step 3: Delivery ── */
function StepDelivery({
  delivery,
  setDelivery,
  pickup,
}: {
  delivery: { type: string; street: string; city: string; date: string; driverNotes: string };
  setDelivery: React.Dispatch<React.SetStateAction<typeof delivery>>;
  pickup: { street: string; city: string; date: string };
}) {
  return (
    <div className="space-y-6">
      {/* Delivery type */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          סוג משלוח
        </h3>
        <div className="space-y-3">
          {DELIVERY_TYPES.map(dt => (
            <button
              key={dt.value}
              onClick={() => setDelivery(d => ({ ...d, type: dt.value }))}
              className={`w-full text-right py-4 px-5 rounded-xl border-2 font-medium transition-all ${
                delivery.type === dt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Different address */}
      {delivery.type === 'different' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <AddressAutocomplete
            value={{ street: delivery.street, city: delivery.city }}
            onChange={(addr: AddressValue) => setDelivery(d => ({ ...d, street: addr.street, city: addr.city }))}
            label="כתובת למשלוח"
            required
            showExtras={false}
          />
        </div>
      )}

      {/* Delivery date (not for store pickup) */}
      {delivery.type !== 'store' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            מועד משלוח
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך משלוח</label>
            <input
              type="date"
              value={delivery.date}
              min={pickup.date}
              onChange={e => setDelivery(d => ({ ...d, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      )}

      {/* Driver notes */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          הערות לנהג
        </h3>
        <textarea
          value={delivery.driverNotes}
          onChange={e => setDelivery(d => ({ ...d, driverNotes: e.target.value }))}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          rows={3}
          placeholder="הערות מיוחדות לנהג..."
        />
      </div>
    </div>
  );
}

/* ── Step 4: Summary ── */
function StepSummary({
  customer, pickup, delivery, drivers, driverId, setDriverId,
}: {
  customer: Customer;
  pickup: { street: string; city: string; floor: string; apartment: string; date: string; timeWindow: string; bags: number; instructions: string; priority: string; isRecurring: boolean; recurringDays: number[] };
  delivery: { type: string; street: string; city: string; date: string; driverNotes: string };
  drivers: Driver[];
  driverId: string;
  setDriverId: (v: string) => void;
}) {
  const DAYS_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const tw = TIME_WINDOWS.find(t => t.value === pickup.timeWindow);
  const dt = DELIVERY_TYPES.find(t => t.value === delivery.type);
  const deliveryAddr = delivery.type === 'same'
    ? `${pickup.street}, ${pickup.city}`
    : delivery.type === 'different'
      ? `${delivery.street}, ${delivery.city}`
      : 'איסוף מהחנות';

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Check className="w-5 h-5" />
            סיכום הזמנה
          </h3>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Customer */}
          <div className="px-6 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">לקוח</div>
            <div className="flex items-center gap-2 text-gray-900 font-medium">
              <User className="w-4 h-4 text-blue-500" />
              {customer.name}
            </div>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" />
              {formatPhone(customer.phone)}
            </div>
          </div>

          {/* Pickup */}
          <div className="px-6 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">איסוף</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <MapPin className="w-4 h-4 text-blue-500" />
                {pickup.street}, {pickup.city}
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Calendar className="w-4 h-4 text-blue-500" />
                {formatDateHebrew(pickup.date)}
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="w-4 h-4 text-blue-500" />
                {tw?.label}
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Package className="w-4 h-4 text-blue-500" />
                {pickup.bags} שקיות/פריטים
              </div>
              {pickup.priority === 'EXPRESS' && (
                <span className="inline-block mt-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                  דחוף
                </span>
              )}
              {pickup.instructions && (
                <div className="mt-2 p-3 bg-yellow-50 rounded-lg text-yellow-800 text-sm">
                  {pickup.instructions}
                </div>
              )}
            </div>
          </div>

          {/* Delivery */}
          <div className="px-6 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">משלוח</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Truck className="w-4 h-4 text-blue-500" />
                {dt?.label}
              </div>
              {delivery.type !== 'store' && (
                <>
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin className="w-4 h-4 text-blue-500" />
                    {deliveryAddr}
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    {formatDateHebrew(delivery.date)}
                  </div>
                </>
              )}
              {delivery.driverNotes && (
                <div className="mt-2 p-3 bg-yellow-50 rounded-lg text-yellow-800 text-sm">
                  {delivery.driverNotes}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recurring schedule */}
      {pickup.isRecurring && pickup.recurringDays.length > 0 && (
        <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-6">
          <h3 className="text-lg font-bold text-indigo-900 mb-3 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" />
            הזמנה חוזרת
          </h3>
          <div className="flex flex-wrap gap-2">
            {pickup.recurringDays.sort((a, b) => a - b).map(d => (
              <span key={d} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium">
                יום {DAYS_NAMES[d]}
              </span>
            ))}
          </div>
          <p className="text-sm text-indigo-600 mt-2">
            ייווצרו הזמנות אוטומטיות בימים אלו בכל שבוע
          </p>
        </div>
      )}

      {/* Driver assignment */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          שיוך נהג (אופציונלי)
        </h3>
        <select
          value={driverId}
          onChange={e => setDriverId(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
        >
          <option value="">שיוך אוטומטי (ללא בחירה)</option>
          {(Array.isArray(drivers) ? drivers : []).map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ───────── useDebounce hook ───────── */
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
