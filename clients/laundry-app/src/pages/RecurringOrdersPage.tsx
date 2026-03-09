import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  RefreshCw, Plus, X, Pause, Play, Trash2, Calendar, Clock,
  User, MapPin, Package, Truck, Zap,
} from 'lucide-react';

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const TIME_WINDOWS = [
  { value: 'morning', label: 'בוקר (08:00-12:00)' },
  { value: 'afternoon', label: 'צהריים (12:00-17:00)' },
  { value: 'evening', label: 'ערב (17:00-21:00)' },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'פעיל',
  PAUSED: 'מושהה',
  CANCELLED: 'בוטל',
};

export default function RecurringOrdersPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['recurring-orders', statusFilter],
    queryFn: () => api.get('/recurring-orders', { params: statusFilter ? { status: statusFilter } : {} }).then(r => r.data.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => api.get('/crm/customers', { params: { limit: 500 } }).then(r => r.data.data),
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get('/delivery-mgmt/drivers').then(r => r.data.data),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/recurring-orders/${id}/pause`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recurring-orders'] }); addToast('הזמנה הושהתה'); },
    onError: () => addToast('שגיאה', 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/recurring-orders/${id}/resume`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recurring-orders'] }); addToast('הזמנה הופעלה'); },
    onError: () => addToast('שגיאה', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recurring-orders/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recurring-orders'] }); addToast('הזמנה בוטלה'); },
    onError: () => addToast('שגיאה', 'error'),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/recurring-orders/generate'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
      const count = res.data?.data?.created ?? 0;
      addToast(`נוצרו ${count} הזמנות להיום`);
    },
    onError: () => addToast('שגיאה ביצירת הזמנות', 'error'),
  });

  const orderList = Array.isArray(orders) ? orders : [];
  const customerList = Array.isArray(customers?.customers ?? customers) ? (customers?.customers ?? customers ?? []) : [];
  const driverList = Array.isArray(drivers) ? drivers : [];

  const activeCount = orderList.filter((o: any) => o.status === 'ACTIVE').length;
  const pausedCount = orderList.filter((o: any) => o.status === 'PAUSED').length;

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}</div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <RefreshCw className="w-7 h-7 text-blue-600" /> הזמנות חוזרות
        </h1>
        <div className="flex gap-2">
          <button onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-40">
            <Zap className="w-4 h-4" /> {generateMutation.isPending ? 'מייצר...' : 'צור הזמנות להיום'}
          </button>
          <button onClick={() => { setEditingId(null); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> הזמנה חוזרת חדשה
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">סה״כ הזמנות</span>
          </div>
          <div className="text-2xl font-bold text-gray-800">{orderList.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Play className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">פעילות</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{activeCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
              <Pause className="w-5 h-5 text-yellow-600" />
            </div>
            <span className="text-sm text-gray-500">מושהות</span>
          </div>
          <div className="text-2xl font-bold text-yellow-600">{pausedCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 max-w-md">
        {[{ v: '', l: `הכל (${orderList.length})` }, { v: 'ACTIVE', l: `פעיל (${activeCount})` }, { v: 'PAUSED', l: `מושהה (${pausedCount})` }].map(f => (
          <button key={f.v} onClick={() => setStatusFilter(f.v)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statusFilter === f.v ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
            }`}>{f.l}</button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {orderList.map((order: any) => {
          const addr = typeof order.pickupAddress === 'object'
            ? [order.pickupAddress?.street, order.pickupAddress?.city].filter(Boolean).join(', ')
            : order.pickupAddress || '';
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{order.customer?.name || 'לקוח'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                    {order.customer?.phone && (
                      <p className="text-xs text-gray-400">{order.customer.phone}</p>
                    )}
                  </div>
                </div>
                <div className="text-left text-sm">
                  <div className="text-xs text-gray-400">נוצרו {order.totalOrdersCreated ?? 0} הזמנות</div>
                  {order.lastRunDate && (
                    <div className="text-xs text-gray-400">אחרון: {new Date(order.lastRunDate).toLocaleDateString('he-IL')}</div>
                  )}
                </div>
              </div>

              {/* Days */}
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div className="flex gap-1">
                  {[0,1,2,3,4,5,6].map(day => (
                    <span key={day} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      order.daysOfWeek?.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                    }`}>{DAY_LABELS[day]}</span>
                  ))}
                </div>
                {order.timeWindow && (
                  <span className="text-xs text-gray-500 flex items-center gap-1 mr-2">
                    <Clock className="w-3 h-3" />
                    {TIME_WINDOWS.find(tw => tw.value === order.timeWindow)?.label ?? order.timeWindow}
                  </span>
                )}
              </div>

              {/* Details */}
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                {addr && (
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {addr}</span>
                )}
                {order.bags && (
                  <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {order.bags} שקיות</span>
                )}
                {order.priority === 'EXPRESS' && (
                  <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 rounded text-[10px] font-bold">EXPRESS</span>
                )}
                {order.driver && (
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {order.driver.firstName} {order.driver.lastName}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {order.status === 'ACTIVE' && (
                  <button onClick={() => pauseMutation.mutate(order.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-xs hover:bg-yellow-100">
                    <Pause className="w-3 h-3" /> השהה
                  </button>
                )}
                {order.status === 'PAUSED' && (
                  <button onClick={() => resumeMutation.mutate(order.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs hover:bg-green-100">
                    <Play className="w-3 h-3" /> הפעל
                  </button>
                )}
                <button onClick={() => { setEditingId(order.id); setShowCreate(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs hover:bg-blue-100">
                  עריכה
                </button>
                {order.status !== 'CANCELLED' && (
                  <button onClick={() => { if (confirm('לבטל הזמנה חוזרת זו?')) deleteMutation.mutate(order.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs hover:bg-red-100 mr-auto">
                    <Trash2 className="w-3 h-3" /> בטל
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {orderList.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">אין הזמנות חוזרות</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <RecurringOrderModal
          editId={editingId}
          customers={customerList}
          drivers={driverList}
          onClose={() => { setShowCreate(false); setEditingId(null); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
            setShowCreate(false);
            setEditingId(null);
            addToast(editingId ? 'הזמנה עודכנה' : 'הזמנה חוזרת נוצרה');
          }}
        />
      )}
    </div>
  );
}

function RecurringOrderModal({ editId, customers, drivers, onClose, onSaved }: {
  editId: string | null; customers: any[]; drivers: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { addToast } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [timeWindow, setTimeWindow] = useState('morning');
  const [pickupStreet, setPickupStreet] = useState('');
  const [pickupCity, setPickupCity] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryType, setDeliveryType] = useState('BOTH');
  const [bags, setBags] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [instructions, setInstructions] = useState('');
  const [driverId, setDriverId] = useState('');

  // Load existing data if editing
  const { data: existing } = useQuery({
    queryKey: ['recurring-order', editId],
    queryFn: () => api.get(`/recurring-orders/${editId}`).then(r => r.data.data),
    enabled: !!editId,
  });

  useEffect(() => {
    if (existing) {
      setCustomerId(existing.customerId || '');
      setDaysOfWeek(existing.daysOfWeek || []);
      setTimeWindow(existing.timeWindow || 'morning');
      const pa = existing.pickupAddress || {};
      setPickupStreet(pa.street || '');
      setPickupCity(pa.city || '');
      const da = existing.deliveryAddress || {};
      setDeliveryStreet(da.street || '');
      setDeliveryCity(da.city || '');
      setDeliveryType(existing.deliveryType || 'BOTH');
      setBags(existing.bags?.toString() || '');
      setPriority(existing.priority || 'NORMAL');
      setInstructions(existing.instructions || '');
      setDriverId(existing.driverId || '');
    }
  }, [existing]);

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const mutation = useMutation({
    mutationFn: (data: any) => editId ? api.patch(`/recurring-orders/${editId}`, data) : api.post('/recurring-orders', data),
    onSuccess: () => onSaved(),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || daysOfWeek.length === 0) {
      addToast('נא לבחור לקוח ולפחות יום אחד', 'error');
      return;
    }
    mutation.mutate({
      customerId,
      daysOfWeek,
      timeWindow,
      pickupAddress: { street: pickupStreet, city: pickupCity },
      deliveryAddress: { street: deliveryStreet, city: deliveryCity },
      deliveryType,
      bags: bags ? parseInt(bags) : undefined,
      priority,
      instructions: instructions || undefined,
      driverId: driverId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between sticky top-0 z-10">
          <h3 className="font-bold text-gray-800">{editId ? 'עריכת הזמנה חוזרת' : 'הזמנה חוזרת חדשה'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer */}
          <div>
            <label className="text-sm text-gray-500 mb-1 block">לקוח</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
              <option value="">בחר לקוח...</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Days of Week */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">ימי איסוף</label>
            <div className="flex gap-2">
              {[0,1,2,3,4,5,6].map(day => (
                <button key={day} type="button" onClick={() => toggleDay(day)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    daysOfWeek.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>{DAY_LABELS[day]}</button>
              ))}
            </div>
          </div>

          {/* Time Window */}
          <div>
            <label className="text-sm text-gray-500 mb-1 block">חלון זמן</label>
            <select value={timeWindow} onChange={e => setTimeWindow(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
              {TIME_WINDOWS.map(tw => <option key={tw.value} value={tw.value}>{tw.label}</option>)}
            </select>
          </div>

          {/* Addresses */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">כתובת איסוף - רחוב</label>
              <input value={pickupStreet} onChange={e => setPickupStreet(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="הרצל 15" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">עיר</label>
              <input value={pickupCity} onChange={e => setPickupCity(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="תל אביב" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">כתובת מסירה - רחוב</label>
              <input value={deliveryStreet} onChange={e => setDeliveryStreet(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="דיזנגוף 50" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">עיר</label>
              <input value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="תל אביב" />
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">סוג</label>
              <select value={deliveryType} onChange={e => setDeliveryType(e.target.value)}
                className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
                <option value="BOTH">איסוף + מסירה</option>
                <option value="PICKUP">איסוף בלבד</option>
                <option value="DELIVERY">מסירה בלבד</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">שקיות</label>
              <input type="number" min="1" value={bags} onChange={e => setBags(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg" placeholder="1" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">עדיפות</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
                <option value="NORMAL">רגיל</option>
                <option value="EXPRESS">אקספרס</option>
              </select>
            </div>
          </div>

          {/* Driver */}
          <div>
            <label className="text-sm text-gray-500 mb-1 block">נהג (אופציונלי)</label>
            <select value={driverId} onChange={e => setDriverId(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
              <option value="">הקצאה אוטומטית</option>
              {drivers.map((d: any) => (
                <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
              ))}
            </select>
          </div>

          {/* Instructions */}
          <div>
            <label className="text-sm text-gray-500 mb-1 block">הערות</label>
            <textarea rows={2} value={instructions} onChange={e => setInstructions(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="הערות מיוחדות..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {mutation.isPending ? 'שומר...' : editId ? 'עדכן' : 'צור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
