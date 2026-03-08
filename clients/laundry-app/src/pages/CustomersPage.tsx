import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import { SkeletonGrid } from '../components/Skeleton';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/constants';
import api from '../lib/api';
import {
  Users, Search, Phone, Mail, Plus, X, UserPlus,
  Upload, Wallet, ShoppingBag, ArrowRight,
  RefreshCw, Clock, CreditCard, Filter,
  Building2, FileText, CheckCircle2, PenTool,
} from 'lucide-react';

export default function CustomersPage() {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [segment, setSegment] = useState<string>('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState('B2C');

  const segments = [
    { key: '',           label: 'הכל' },
    { key: 'VIP',        label: 'VIP' },
    { key: 'INACTIVE',   label: 'לא פעילים' },
    { key: 'NEW',        label: 'חדשים' },
    { key: 'HIGH_VALUE', label: 'ערך גבוה' },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['customers', debouncedSearch, segment],
    queryFn: () => api.get('/crm/customers', { params: { search: debouncedSearch || undefined, segment: segment || undefined, limit: 50 } }).then(r => r.data.data ?? r.data),
  });

  // Fetch counts per segment for badges
  const { data: segmentCounts } = useQuery({
    queryKey: ['customer-segment-counts'],
    queryFn: async () => {
      const keys = ['VIP', 'INACTIVE', 'NEW', 'HIGH_VALUE'];
      const results = await Promise.all(
        keys.map(s => api.get('/crm/customers', { params: { segment: s, pageSize: 1 } }).then(r => {
          const meta = r.data.meta ?? r.data;
          return { segment: s, count: meta.total ?? 0 };
        }))
      );
      return Object.fromEntries(results.map(r => [r.segment, r.count]));
    },
    staleTime: 30_000,
  });

  const customers = Array.isArray(data) ? data : data?.customers ?? [];

  // Get orders for selected customer
  const { data: customerOrders } = useQuery({
    queryKey: ['customer-orders', selectedId],
    queryFn: () => api.get('/orders', { params: { customerId: selectedId, limit: 20 } }).then(r => r.data.data),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/crm/customers', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-segment-counts'] });
      setShowNewForm(false);
      setNewName(''); setNewPhone(''); setNewEmail('');
      addToast(`לקוח ${res.data.data.name} נוצר בהצלחה`);
    },
    onError: () => addToast('שגיאה ביצירת לקוח', 'error'),
  });

  // ─── Institutional Billing State ───
  const [showInstitutionalForm, setShowInstitutionalForm] = useState(false);
  const [instBillingCycle, setInstBillingCycle] = useState<string>('MONTHLY');
  const [instCreditLimit, setInstCreditLimit] = useState<string>('');
  const [instPaymentTerms, setInstPaymentTerms] = useState<string>('30');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Fetch unbilled orders for selected customer
  const { data: unbilledData } = useQuery({
    queryKey: ['unbilled-orders', selectedId],
    queryFn: () => api.get(`/billing/unbilled/${selectedId}`).then(r => r.data.data),
    enabled: !!selectedId,
  });

  const unbilledOrders = unbilledData?.orders ?? [];
  const unbilledTotal = unbilledData?.unbilledTotal ?? 0;

  // Update customer metadata (requireSignature, etc.)
  const updateMetadataMutation = useMutation({
    mutationFn: ({ customerId, metadata }: { customerId: string; metadata: any }) =>
      api.patch(`/crm/customers/${customerId}`, { metadata }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast('הגדרת לקוח עודכנה');
    },
    onError: () => addToast('שגיאה בעדכון', 'error'),
  });

  // Toggle institutional status
  const institutionalMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/billing/customers/${selectedId}/institutional`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['unbilled-orders', selectedId] });
      setShowInstitutionalForm(false);
      addToast('סטטוס לקוח מוסדי עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס מוסדי', 'error'),
  });

  // Create consolidated invoice
  const consolidatedInvoiceMutation = useMutation({
    mutationFn: (data: { customerId: string; orderIds: string[]; notes?: string }) =>
      api.post('/billing/consolidated-invoice', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['unbilled-orders', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['customer-orders', selectedId] });
      setSelectedOrderIds(new Set());
      addToast(`חשבונית מרוכזת ${res.data.data.number} נוצרה בהצלחה`);
    },
    onError: () => addToast('שגיאה ביצירת חשבונית מרוכזת', 'error'),
  });

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectAllUnbilled = () => {
    if (selectedOrderIds.size === unbilledOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(unbilledOrders.map((o: any) => o.id)));
    }
  };

  const handleCreateConsolidatedInvoice = () => {
    if (!selectedId || selectedOrderIds.size === 0) return;
    consolidatedInvoiceMutation.mutate({
      customerId: selectedId,
      orderIds: Array.from(selectedOrderIds),
    });
  };

  const selectedCustomer = selectedId ? customers.find((c: any) => c.id === selectedId) : null;
  const orders = customerOrders?.orders ?? [];

  const repeatOrder = (order: any) => {
    const repeatData = {
      customerId: order.customerId,
      customerName: order.customer?.name,
      items: (order.items || []).map((item: any) => ({
        serviceId: item.serviceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice || item.lineTotal / (item.quantity || 1)),
      })),
    };
    sessionStorage.setItem('repeat-order', JSON.stringify(repeatData));
    navigate('/orders/new');
    addToast('פריטי ההזמנה הועתקו');
  };

  return (
    <div className="p-6 space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Users className="w-7 h-7 text-blue-600" /> לקוחות
        </h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/import')}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm">
            <Upload className="w-4 h-4" /> ייבוא
          </button>
          <button onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
            <UserPlus className="w-4 h-4" /> לקוח חדש
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או אימייל..."
          className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Segment Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        {segments.map(s => (
          <button
            key={s.key}
            onClick={() => setSegment(s.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
              segment === s.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.label}
            {s.key && segmentCounts?.[s.key] !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                segment === s.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {segmentCounts[s.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Customer List */}
        <div className={`${selectedId ? 'w-1/3' : 'w-full'} transition-all`}>
          {isLoading ? <SkeletonGrid count={6} /> : (
            <div className={`grid ${selectedId ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
              {customers.map((c: any) => (
                <div key={c.id}
                  className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow cursor-pointer ${
                    selectedId === c.id ? 'ring-2 ring-blue-400 border-blue-300' : ''
                  }`}
                  onClick={() => navigate(`/customers/${c.id}`)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800 flex items-center gap-1.5">
                        {c.name}
                        {c.isInstitutional && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">מוסדי</span>
                        )}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                        c.status === 'LEAD' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{c.status === 'ACTIVE' ? 'פעיל' : c.status === 'LEAD' ? 'ליד' : c.status}</span>
                    </div>
                    <span className="text-xs text-gray-400">{c.type}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-gray-500">
                    {c.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{c.phone}</div>}
                    {c.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{c.email}</div>}
                  </div>
                  {(c.totalOrders !== undefined || c.totalSpent !== undefined) && (
                    <div className="mt-3 pt-3 border-t flex gap-4 text-sm">
                      {c.totalOrders !== undefined && <span className="text-gray-500">הזמנות: <span className="font-medium text-gray-700">{c.totalOrders}</span></span>}
                      {c.totalSpent !== undefined && Number(c.totalSpent) > 0 && <span className="text-gray-500">{"סה\"כ:"} <span className="font-medium text-gray-700">{Number(c.totalSpent).toLocaleString()} ₪</span></span>}
                    </div>
                  )}
                </div>
              ))}
              {customers.length === 0 && (
                <p className="col-span-3 text-center text-gray-400">לא נמצאו לקוחות</p>
              )}
            </div>
          )}
        </div>

        {/* Customer Detail Panel */}
        {selectedId && selectedCustomer && (
          <div className="w-2/3 space-y-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{selectedCustomer.name}</h2>
                  <div className="flex gap-3 mt-1 text-sm text-gray-500">
                    {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selectedCustomer.phone}</span>}
                    {selectedCustomer.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selectedCustomer.email}</span>}
                  </div>
                </div>
                <button onClick={() => navigate('/customers')}
                  className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigate('/orders/new')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  <Plus className="w-3.5 h-3.5" /> הזמנה חדשה
                </button>
                {orders.length > 0 && (
                  <button onClick={() => repeatOrder(orders[0])}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200">
                    <RefreshCw className="w-3.5 h-3.5" /> חזור על הזמנה אחרונה
                  </button>
                )}
                <button onClick={() => navigate('/prepaid')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                  <Wallet className="w-3.5 h-3.5" /> מקדמה
                </button>
                <button onClick={() => {
                    setInstBillingCycle(selectedCustomer.billingCycle || 'MONTHLY');
                    setInstCreditLimit(selectedCustomer.creditLimit ? String(Number(selectedCustomer.creditLimit)) : '');
                    setInstPaymentTerms(String(selectedCustomer.paymentTerms ?? 30));
                    setShowInstitutionalForm(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                    selectedCustomer.isInstitutional
                      ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  <Building2 className="w-3.5 h-3.5" />
                  {selectedCustomer.isInstitutional ? 'לקוח מוסדי' : 'הפוך למוסדי'}
                </button>
                <button onClick={() => {
                    const currentMeta = (selectedCustomer.metadata as any) || {};
                    updateMetadataMutation.mutate({
                      customerId: selectedCustomer.id,
                      metadata: { ...currentMeta, requireSignature: !currentMeta.requireSignature },
                    });
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                    (selectedCustomer.metadata as any)?.requireSignature
                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  <PenTool className="w-3.5 h-3.5" />
                  {(selectedCustomer.metadata as any)?.requireSignature ? 'חתימה נדרשת' : 'דרוש חתימה'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                <ShoppingBag className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-gray-800">{orders.length}</div>
                <div className="text-xs text-gray-500">הזמנות</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                <CreditCard className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-gray-800">
                  {orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0).toLocaleString()} ₪
                </div>
                <div className="text-xs text-gray-500">{"סה\"כ הוצאה"}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                <Clock className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-gray-800">
                  {orders.length ? Math.round(orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0) / orders.length) : 0} ₪
                </div>
                <div className="text-xs text-gray-500">ממוצע הזמנה</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-gray-400" /> היסטוריית הזמנות
              </h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {orders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-blue-600">{order.orderNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(order.receivedAt).toLocaleDateString('he-IL')} | {order.items?.length ?? 0} פריטים
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{Number(order.total).toLocaleString()} ₪</span>
                      <button onClick={() => repeatOrder(order)}
                        title="חזור על הזמנה"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => navigate(`/orders/${order.id}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && <p className="text-center text-gray-400 text-sm py-4">אין הזמנות</p>}
              </div>
            </div>

            {/* ─── Institutional Billing Section (חיוב מוסדי) ─── */}
            {selectedCustomer.isInstitutional && (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-500" /> חיוב מוסדי
                  </h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500">
                      מחזור: <span className="font-medium text-gray-700">
                        {selectedCustomer.billingCycle === 'WEEKLY' ? 'שבועי' :
                         selectedCustomer.billingCycle === 'BIWEEKLY' ? 'דו-שבועי' : 'חודשי'}
                      </span>
                    </span>
                    {selectedCustomer.creditLimit && (
                      <span className="text-gray-500">
                        תקרה: <span className="font-medium text-gray-700">{Number(selectedCustomer.creditLimit).toLocaleString()} ₪</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Unbilled Summary */}
                <div className="flex items-center justify-between mb-3 p-3 bg-purple-50 rounded-lg">
                  <div>
                    <span className="text-sm text-purple-700 font-medium">
                      {unbilledOrders.length} הזמנות לא מחויבות
                    </span>
                    <span className="text-lg font-bold text-purple-800 mr-3">
                      {unbilledTotal.toLocaleString()} ₪
                    </span>
                  </div>
                  {unbilledOrders.length > 0 && (
                    <div className="flex gap-2">
                      <button onClick={selectAllUnbilled}
                        className="text-xs px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100">
                        {selectedOrderIds.size === unbilledOrders.length ? 'בטל בחירה' : 'בחר הכל'}
                      </button>
                      <button
                        onClick={handleCreateConsolidatedInvoice}
                        disabled={selectedOrderIds.size === 0 || consolidatedInvoiceMutation.isPending}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40">
                        <FileText className="w-3.5 h-3.5" />
                        {consolidatedInvoiceMutation.isPending ? 'יוצר...' : `צור חשבונית מרוכזת (${selectedOrderIds.size})`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Unbilled Orders List */}
                {unbilledOrders.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {unbilledOrders.map((order: any) => (
                      <label key={order.id}
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedOrderIds.has(order.id) ? 'bg-purple-50 border-purple-300' : 'hover:bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.has(order.id)}
                            onChange={() => toggleOrderSelection(order.id)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-blue-600">{order.orderNumber}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
                                {STATUS_LABELS[order.status] ?? order.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(order.receivedAt).toLocaleDateString('he-IL')} | {order.items?.length ?? 0} פריטים
                            </div>
                          </div>
                        </div>
                        <span className="font-semibold text-sm">{Number(order.total).toLocaleString()} ₪</span>
                      </label>
                    ))}
                  </div>
                )}
                {unbilledOrders.length === 0 && (
                  <div className="text-center py-6 text-gray-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                    <p className="text-sm">כל ההזמנות חויבו</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Institutional Settings Modal */}
      {showInstitutionalForm && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowInstitutionalForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-purple-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600" /> הגדרות לקוח מוסדי
              </h3>
              <button onClick={() => setShowInstitutionalForm(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">לקוח מוסדי</span>
                <button
                  onClick={() => {
                    institutionalMutation.mutate({
                      isInstitutional: !selectedCustomer.isInstitutional,
                      billingCycle: !selectedCustomer.isInstitutional ? instBillingCycle : undefined,
                      creditLimit: !selectedCustomer.isInstitutional && instCreditLimit ? Number(instCreditLimit) : null,
                      paymentTerms: !selectedCustomer.isInstitutional ? Number(instPaymentTerms) : undefined,
                    });
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    selectedCustomer.isInstitutional ? 'bg-purple-600' : 'bg-gray-300'
                  }`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    selectedCustomer.isInstitutional ? 'right-0.5' : 'left-0.5'
                  }`} />
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">מחזור חיוב</label>
                <div className="flex gap-2">
                  {[
                    { value: 'WEEKLY', label: 'שבועי' },
                    { value: 'BIWEEKLY', label: 'דו-שבועי' },
                    { value: 'MONTHLY', label: 'חודשי' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => setInstBillingCycle(opt.value)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        instBillingCycle === opt.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תקרת אשראי (₪)</label>
                <input
                  type="number" min="0" step="1000"
                  value={instCreditLimit}
                  onChange={e => setInstCreditLimit(e.target.value)}
                  placeholder="ללא הגבלה"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">ימי אשראי (נטו)</label>
                <input
                  type="number" min="0"
                  value={instPaymentTerms}
                  onChange={e => setInstPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowInstitutionalForm(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => {
                  institutionalMutation.mutate({
                    isInstitutional: true,
                    billingCycle: instBillingCycle,
                    creditLimit: instCreditLimit ? Number(instCreditLimit) : null,
                    paymentTerms: Number(instPaymentTerms),
                  });
                }}
                disabled={institutionalMutation.isPending}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {institutionalMutation.isPending ? 'שומר...' : 'שמור הגדרות'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNewForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">לקוח חדש</h3>
              <button onClick={() => setShowNewForm(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">טלפון</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">אימייל</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">סוג לקוח</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewType('B2C')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${newType === 'B2C' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    פרטי (B2C)
                  </button>
                  <button onClick={() => setNewType('B2B')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${newType === 'B2B' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    עסקי (B2B)
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowNewForm(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => createMutation.mutate({ name: newName, phone: newPhone || undefined, email: newEmail || undefined, type: newType, status: 'ACTIVE' })}
                disabled={!newName || createMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createMutation.isPending ? 'שומר...' : 'צור לקוח'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
