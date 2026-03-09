import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABELS, STATUS_COLORS, STATUS_FLOW, NEXT_STATUS, PAYMENT_LABELS, PAYMENT_COLORS, ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, ITEM_STATUS_FLOW, ITEM_NEXT_STATUS } from '../lib/constants';
import { SkeletonCard } from '../components/Skeleton';
import { ItemTicketPrintView } from '../components/ItemTicket';
import { ThermalReceiptPrintButton } from '../components/ThermalReceipt';
import api from '../lib/api';
import {
  ArrowRight, CheckCircle, Clock, Shirt, CreditCard,
  MessageCircle, Send, Printer, FileText, DollarSign,
  Phone, Banknote, Wallet, Building, RefreshCw,
  Plus, Pencil, Trash2, ChevronDown, PenTool, X, Save, History,
  Truck, UserCheck, MapPin, Calendar,
} from 'lucide-react';

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');

  // Send modal
  const [showSendModal, setShowSendModal] = useState(false);

  // Status change note
  const [statusNote, setStatusNote] = useState('');
  const [showStatusNoteInput, setShowStatusNoteInput] = useState(false);

  // Item management
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState({ serviceId: '', description: '', category: '', quantity: '1', color: '', brand: '', specialNotes: '', weight: '' });
  const [itemStatusDropdown, setItemStatusDropdown] = useState<string | null>(null);

  // Driver assignment
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignType, setAssignType] = useState<'PICKUP' | 'DELIVERY'>('DELIVERY');
  const [assignScheduledAt, setAssignScheduledAt] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  // Signature
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signedBy, setSignedBy] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then(r => r.data.data),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ status, note }: { status: string; note?: string }) => api.patch(`/orders/${id}/status`, { status, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
      setStatusNote('');
      setShowStatusNoteInput(false);
      addToast('סטטוס עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס', 'error'),
  });

  const payMutation = useMutation({
    mutationFn: (data: { amount: number; method: string }) => api.post(`/orders/${id}/payment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      setShowPaymentModal(false);
      setPayAmount('');
      addToast('תשלום נקלט בהצלחה');
    },
    onError: () => addToast('שגיאה בקליטת תשלום', 'error'),
  });

  // Timeline query
  const { data: timeline } = useQuery({
    queryKey: ['order-timeline', id],
    queryFn: () => api.get(`/orders/${id}/timeline`).then(r => r.data.data),
    enabled: !!id,
  });

  // Signature query
  const { data: signature } = useQuery({
    queryKey: ['order-signature', id],
    queryFn: () => api.get(`/orders/${id}/signature`).then(r => r.data.data),
    enabled: !!id,
  });

  // Services list for add item
  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
  });
  const serviceList: any[] = Array.isArray(services) ? services : [];

  // Drivers list for assignment
  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get('/delivery-mgmt/drivers').then(r => r.data.data),
  });
  const driverList: any[] = Array.isArray(drivers) ? drivers : [];

  // Existing assignments for this order
  const { data: assignments } = useQuery({
    queryKey: ['order-assignments', id],
    queryFn: () => api.get('/delivery-mgmt/assignments', { params: { orderId: id } }).then(r => r.data.data),
    enabled: !!id,
  });
  const assignmentList: any[] = Array.isArray(assignments) ? assignments : [];

  // Create assignment
  const assignMutation = useMutation({
    mutationFn: (data: any) => api.post('/delivery-mgmt/assignments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-assignments', id] });
      setShowAssignModal(false);
      setAssignDriverId('');
      setAssignNotes('');
      setAssignScheduledAt('');
      addToast('נהג שויך להזמנה');
    },
    onError: () => addToast('שגיאה בשיוך נהג', 'error'),
  });

  // Add item
  const addItemMutation = useMutation({
    mutationFn: (data: any) => api.post(`/orders/${id}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
      setShowAddItemModal(false);
      resetItemForm();
      addToast('פריט נוסף בהצלחה');
    },
    onError: () => addToast('שגיאה בהוספת פריט', 'error'),
  });

  // Edit item
  const editItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: any }) => api.patch(`/orders/${id}/items/${itemId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      setEditingItem(null);
      resetItemForm();
      addToast('פריט עודכן');
    },
    onError: () => addToast('שגיאה בעדכון פריט', 'error'),
  });

  // Delete item
  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/orders/${id}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
      addToast('פריט נמחק');
    },
    onError: () => addToast('שגיאה במחיקת פריט', 'error'),
  });

  // Change item status
  const itemStatusMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) => api.patch(`/orders/${id}/items/${itemId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
      setItemStatusDropdown(null);
      addToast('סטטוס פריט עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס פריט', 'error'),
  });

  // Save signature
  const signatureMutation = useMutation({
    mutationFn: (data: { signatureData: string; signedBy: string }) => api.post(`/orders/${id}/signature`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-signature', id] });
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
      setShowSignatureModal(false);
      setSignedBy('');
      addToast('חתימה נשמרה');
    },
    onError: () => addToast('שגיאה בשמירת חתימה', 'error'),
  });

  const resetItemForm = () => setItemForm({ serviceId: '', description: '', category: '', quantity: '1', color: '', brand: '', specialNotes: '', weight: '' });

  // Canvas drawing helpers for signature — MUST be before any early returns
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const stopDrawing = useCallback(() => { isDrawingRef.current = false; }, []);

  // ─── Early returns (after all hooks) ────────────────────────
  if (isLoading) return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fadeIn">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <SkeletonCard /><SkeletonCard />
    </div>
  );
  if (!order) return <div className="p-6 text-center text-red-400">הזמנה לא נמצאה</div>;

  const nextStatus = NEXT_STATUS[order.status];
  const remaining = Number(order.total) - Number(order.paidAmount);
  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const isPaid = remaining <= 0;
  const orderDate = new Date(order.receivedAt).toLocaleDateString('he-IL');

  // Prepare item tickets data
  const ticketItems = (order.items ?? []).map((item: any, idx: number) => ({
    id: item.id,
    barcode: item.barcode || `${order.orderNumber}-${String(idx + 1).padStart(2, '0')}`,
    description: item.description ?? item.service?.name ?? 'פריט',
    garmentType: item.garmentType,
    itemNumber: idx + 1,
  }));

  // Repeat order
  const repeatOrder = () => {
    const repeatData = {
      customerId: order.customerId,
      customerName: order.customer?.name,
      items: (order.items || []).map((item: any) => ({
        serviceId: item.serviceId,
        description: item.description ?? item.service?.name ?? 'פריט',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice || item.lineTotal / (item.quantity || 1)),
      })),
    };
    sessionStorage.setItem('repeat-order', JSON.stringify(repeatData));
    navigate('/orders/new');
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL('image/png');
    signatureMutation.mutate({ signatureData, signedBy: signedBy || order?.customer?.name || '' });
  };

  // Open edit item
  const openEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({
      serviceId: item.serviceId || '',
      description: item.description || '',
      category: item.category || '',
      quantity: String(item.quantity || 1),
      color: item.color || '',
      brand: item.brand || '',
      specialNotes: item.specialNotes || '',
      weight: item.weight ? String(item.weight) : '',
    });
  };

  const handleSaveItem = () => {
    if (editingItem) {
      editItemMutation.mutate({ itemId: editingItem.id, data: { description: itemForm.description, specialNotes: itemForm.specialNotes, color: itemForm.color, brand: itemForm.brand } });
    } else {
      const data: any = { serviceId: itemForm.serviceId, description: itemForm.description };
      if (itemForm.category) data.category = itemForm.category;
      if (itemForm.quantity) data.quantity = Number(itemForm.quantity);
      if (itemForm.color) data.color = itemForm.color;
      if (itemForm.brand) data.brand = itemForm.brand;
      if (itemForm.specialNotes) data.specialNotes = itemForm.specialNotes;
      if (itemForm.weight) data.weight = Number(itemForm.weight);
      addItemMutation.mutate(data);
    }
  };

  // SMS / WhatsApp send
  const handleSendWhatsApp = () => {
    const phone = order.customer?.phone?.replace(/[-\s]/g, '');
    if (!phone) { addToast('אין מספר טלפון ללקוח', 'error'); return; }
    const cleanPhone = phone.startsWith('0') ? `972${phone.slice(1)}` : phone;
    const msg = encodeURIComponent(
      `שלום ${order.customer.name},\n` +
      `הזמנה ${order.orderNumber} ` +
      (isPaid
        ? `שולמה בסך ${Number(order.total).toLocaleString()} ₪.\nתודה!`
        : `בסך ${Number(order.total).toLocaleString()} ₪.\nנותר לתשלום: ${remaining.toLocaleString()} ₪`) +
      `\n\nמכבסת הניצוץ`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    setShowSendModal(false);
  };

  const handleSendSMS = () => {
    const phone = order.customer?.phone?.replace(/[-\s]/g, '');
    if (!phone) { addToast('אין מספר טלפון ללקוח', 'error'); return; }
    const msg = encodeURIComponent(
      `הזמנה ${order.orderNumber}: ` +
      (isPaid ? `שולמה ${Number(order.total).toLocaleString()} ₪` : `נותר ${remaining.toLocaleString()} ₪`) +
      ` - מכבסת הניצוץ`
    );
    window.open(`sms:${phone}?body=${msg}`, '_blank');
    setShowSendModal(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/orders')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">הזמנה {order.orderNumber}</h1>
          <p className="text-gray-500">{order.customer?.name} | {orderDate}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[order.status]}`}>
          {STATUS_LABELS[order.status]}
        </span>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${isPaid ? PAYMENT_COLORS.PAID : PAYMENT_COLORS.UNPAID}`}>
          {isPaid ? 'שולם' : 'לא שולם'}
        </span>
      </div>

      {/* Action Bar */}
      <div className="flex gap-2 flex-wrap">
        {/* Print Tickets */}
        <ItemTicketPrintView
          items={ticketItems}
          customerName={order.customer?.name ?? ''}
          orderNumber={order.orderNumber}
          date={orderDate}
        />

        {/* Print Receipt */}
        <ThermalReceiptPrintButton order={order} />

        {/* Repeat Order */}
        <button onClick={repeatOrder}
          className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium">
          <RefreshCw className="w-4 h-4" /> הזמנה חוזרת
        </button>

        {/* Send Invoice */}
        <button onClick={() => setShowSendModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium">
          <Send className="w-4 h-4" /> שלח ללקוח
        </button>

        {/* Assign Driver — always available */}
        <button onClick={() => setShowAssignModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium">
          <Truck className="w-4 h-4" /> שייך נהג
        </button>

        {/* Pay Button */}
        {!isPaid && (
          <button onClick={() => { setPayAmount(String(remaining)); setShowPaymentModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium mr-auto">
            <DollarSign className="w-4 h-4" /> גבה תשלום
          </button>
        )}
      </div>

      {/* Status Flow */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-700 mb-4">מעקב סטטוס</h2>
        <div className="flex items-center gap-1 overflow-x-auto">
          {STATUS_FLOW.map((s, i) => {
            const isDone = i <= currentIdx;
            const isCurrent = s === order.status;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  isCurrent ? 'bg-blue-100 text-blue-700 font-medium' :
                  isDone ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
                }`}>
                  {isDone && !isCurrent ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  {STATUS_LABELS[s]}
                </div>
                {i < STATUS_FLOW.length - 1 && <div className={`w-6 h-0.5 mx-1 ${i < currentIdx ? 'bg-green-300' : 'bg-gray-200'}`} />}
              </div>
            );
          })}
        </div>
        {nextStatus && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {showStatusNoteInput && (
              <input
                type="text"
                value={statusNote}
                onChange={e => setStatusNote(e.target.value)}
                placeholder="הערה (אופציונלי)..."
                className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64"
              />
            )}
            <button onClick={() => setShowStatusNoteInput(!showStatusNoteInput)}
              className="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">
              <MessageCircle className="w-4 h-4" />
            </button>
            <button onClick={() => advanceMutation.mutate({ status: nextStatus, note: statusNote || undefined })}
              disabled={advanceMutation.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
              {advanceMutation.isPending ? 'מעדכן...' : `קדם ל${STATUS_LABELS[nextStatus]}`}
            </button>
          </div>
        )}
      </div>

      {/* Driver Assignment — always available */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Truck className="w-5 h-5 text-gray-400" /> שיוך נהג
          </h2>
            <button onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium">
              <Plus className="w-4 h-4" /> שייך נהג
            </button>
          </div>

          {assignmentList.length > 0 ? (
            <div className="space-y-2">
              {assignmentList.map((a: any) => (
                <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                  a.status === 'COMPLETED' ? 'bg-green-50 border-green-200' :
                  a.status === 'IN_PROGRESS' ? 'bg-blue-50 border-blue-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      a.status === 'COMPLETED' ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <UserCheck className={`w-4 h-4 ${a.status === 'COMPLETED' ? 'text-green-600' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{a.driver?.firstName} {a.driver?.lastName}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          a.type === 'PICKUP' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                        }`}>{a.type === 'PICKUP' ? 'איסוף' : 'משלוח'}</span>
                        {a.scheduledAt && (
                          <span className="flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(a.scheduledAt).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    a.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    a.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    a.status === 'ACCEPTED' ? 'bg-cyan-100 text-cyan-700' :
                    a.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.status === 'COMPLETED' ? 'הושלם' :
                     a.status === 'IN_PROGRESS' ? 'בדרך' :
                     a.status === 'ACCEPTED' ? 'אושר' :
                     a.status === 'FAILED' ? 'נכשל' :
                     'ממתין'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">לא שויך נהג עדיין</p>
          )}
        </div>

      {/* Assign Driver Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" /> שיוך נהג
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">נהג *</label>
                <select value={assignDriverId} onChange={e => setAssignDriverId(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="">בחר נהג...</option>
                  {driverList.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סוג</label>
                <select value={assignType} onChange={e => setAssignType(e.target.value as any)}
                  className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="DELIVERY">משלוח</option>
                  <option value="PICKUP">איסוף</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מועד מתוכנן</label>
                <input type="datetime-local" value={assignScheduledAt} onChange={e => setAssignScheduledAt(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea value={assignNotes} onChange={e => setAssignNotes(e.target.value)}
                  placeholder="הערות לנהג..."
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 h-20 resize-none" />
              </div>
              <button
                onClick={() => assignMutation.mutate({
                  driverId: assignDriverId,
                  orderId: id,
                  type: assignType,
                  scheduledAt: assignScheduledAt ? new Date(assignScheduledAt).toISOString() : undefined,
                  notes: assignNotes || undefined,
                })}
                disabled={!assignDriverId || assignMutation.isPending}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {assignMutation.isPending ? 'משייך...' : <><Truck className="w-4 h-4" /> שייך נהג</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Shirt className="w-5 h-5 text-gray-400" /> פריטים ({order.items?.length})
            </h2>
            <button onClick={() => { resetItemForm(); setEditingItem(null); setShowAddItemModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> הוסף פריט
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-right py-2 px-2">#</th>
                  <th className="text-right py-2 px-2">ברקוד</th>
                  <th className="text-right py-2 px-2">תיאור</th>
                  <th className="text-right py-2 px-2">שירות</th>
                  <th className="text-right py-2 px-2">כמות</th>
                  <th className="text-right py-2 px-2">מחיר</th>
                  <th className="text-right py-2 px-2">סטטוס</th>
                  <th className="text-right py-2 px-2">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item: any, idx: number) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="py-2 px-2 font-mono text-xs text-blue-600">{item.barcode}</td>
                    <td className="py-2 px-2">
                      <div>{item.description}</div>
                      {item.color && <span className="text-xs text-gray-400">צבע: {item.color}</span>}
                      {item.brand && <span className="text-xs text-gray-400 mr-2">מותג: {item.brand}</span>}
                    </td>
                    <td className="py-2 px-2 text-gray-500">{item.service?.name ?? '—'}</td>
                    <td className="py-2 px-2">{item.quantity}</td>
                    <td className="py-2 px-2">{Number(item.lineTotal).toLocaleString()} ₪</td>
                    <td className="py-2 px-2 relative">
                      <button
                        onClick={() => setItemStatusDropdown(itemStatusDropdown === item.id ? null : item.id)}
                        className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${ITEM_STATUS_COLORS[item.status] ?? STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ITEM_STATUS_LABELS[item.status] ?? STATUS_LABELS[item.status] ?? item.status}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {itemStatusDropdown === item.id && (
                        <div className="absolute z-20 top-full mt-1 left-0 bg-white border rounded-lg shadow-lg py-1 min-w-[140px]">
                          {ITEM_STATUS_FLOW.map(s => (
                            <button key={s} onClick={() => itemStatusMutation.mutate({ itemId: item.id, status: s })}
                              className={`w-full text-right px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${item.status === s ? 'bg-blue-50 font-medium' : ''}`}>
                              <span className={`w-2 h-2 rounded-full ${ITEM_STATUS_COLORS[s]?.split(' ')[0] ?? 'bg-gray-300'}`} />
                              {ITEM_STATUS_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { openEditItem(item); setShowAddItemModal(true); }}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="ערוך">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm('למחוק פריט זה?')) deleteItemMutation.mutate(item.id); }}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="מחק">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gray-400" /> סיכום כספי
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">סכום ביניים</span>
              <span>{Number(order.subtotal).toLocaleString()} ₪</span>
            </div>
            {Number(order.deliveryFee) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">דמי משלוח</span>
                <span>{Number(order.deliveryFee).toLocaleString()} ₪</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{"מע\"מ"}</span>
              <span>{Number(order.vatAmount).toLocaleString()} ₪</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>{"סה\"כ"}</span>
              <span>{Number(order.total).toLocaleString()} ₪</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>שולם</span>
              <span>{Number(order.paidAmount).toLocaleString()} ₪</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-red-600 font-medium">
                <span>נותר</span>
                <span>{remaining.toLocaleString()} ₪</span>
              </div>
            )}
          </div>

          {remaining > 0 && (
            <button onClick={() => { setPayAmount(String(remaining)); setShowPaymentModal(true); }}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              גבה {remaining.toLocaleString()} ₪
            </button>
          )}

          {isPaid && (
            <div className="text-center py-2 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <span className="text-sm text-green-700 font-medium">ההזמנה שולמה במלואה</span>
            </div>
          )}
        </div>
      </div>

      {/* Signature Section */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <PenTool className="w-5 h-5 text-gray-400" /> חתימת לקוח
          </h2>
          {!signature && (
            <button onClick={() => setShowSignatureModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors">
              <PenTool className="w-4 h-4" /> חתום
            </button>
          )}
        </div>
        {signature ? (
          <div className="space-y-2">
            <div className="border rounded-lg p-3 bg-gray-50 flex justify-center">
              <img src={signature.signatureData} alt="חתימה" className="max-h-32" />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>נחתם ע&quot;י: {signature.signedBy}</span>
              <span>{new Date(signature.createdAt).toLocaleString('he-IL')}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">טרם נחתם</p>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-gray-400" /> ציר זמן
        </h2>
        {Array.isArray(timeline) && timeline.length > 0 ? (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute right-[9px] top-2 bottom-2 w-0.5 bg-gray-200" />
            <div className="space-y-4">
              {timeline.map((entry: any, i: number) => (
                <div key={i} className="flex items-start gap-3 relative">
                  <div className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 z-10 flex items-center justify-center ${
                    i === 0 ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-white'
                  }`}>
                    {i === 0 && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[entry.status] ?? ITEM_STATUS_COLORS[entry.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[entry.status] ?? ITEM_STATUS_LABELS[entry.status] ?? entry.status}
                      </span>
                      {entry.changedByName && (
                        <span className="text-xs text-gray-400">ע&quot;י {entry.changedByName}</span>
                      )}
                    </div>
                    {entry.note && (
                      <p className="text-sm text-gray-600 mt-1">{entry.note}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(entry.changedAt || entry.createdAt).toLocaleString('he-IL')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">אין היסטוריה</p>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800 text-lg">קליטת תשלום</h3>
              <p className="text-sm text-gray-500">הזמנה {order.orderNumber} — {order.customer?.name}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Amount */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">סכום</label>
                <div className="relative">
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="w-full px-4 py-3 border rounded-xl text-lg font-bold text-center focus:ring-2 focus:ring-blue-500" />
                  <span className="absolute left-4 top-3.5 text-gray-400">₪</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[50, 100, remaining].filter(Boolean).map(amount => (
                    <button key={amount} onClick={() => setPayAmount(String(amount))}
                      className="flex-1 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
                      {amount === remaining ? `מלא (${remaining})` : amount} ₪
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">אמצעי תשלום</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'CASH', label: 'מזומן', icon: Banknote },
                    { key: 'CREDIT', label: 'אשראי', icon: CreditCard },
                    { key: 'TRANSFER', label: 'העברה', icon: Building },
                    { key: 'PREPAID', label: 'מקדמה', icon: Wallet },
                  ].map(pm => {
                    const Icon = pm.icon;
                    return (
                      <button key={pm.key} onClick={() => setPayMethod(pm.key)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                          payMethod === pm.key
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        <Icon className="w-4 h-4" /> {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">
                ביטול
              </button>
              <button
                onClick={() => payAmount && payMutation.mutate({ amount: Number(payAmount), method: payMethod })}
                disabled={!payAmount || payMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:opacity-40">
                {payMutation.isPending ? 'מעבד...' : `גבה ${Number(payAmount || 0).toLocaleString()} ₪`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal (SMS / WhatsApp) */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowSendModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800">שליחה ללקוח</h3>
              <p className="text-sm text-gray-500">{order.customer?.name} — {order.customer?.phone}</p>
            </div>

            <div className="p-6 space-y-3">
              <button onClick={handleSendWhatsApp}
                className="w-full flex items-center gap-3 px-4 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors">
                <MessageCircle className="w-5 h-5" /> שלח בוואטסאפ
              </button>
              <button onClick={handleSendSMS}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors">
                <Phone className="w-5 h-5" /> שלח ב-SMS
              </button>
              <button onClick={() => setShowSendModal(false)}
                className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddItemModal(false); setEditingItem(null); resetItemForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">{editingItem ? 'עריכת פריט' : 'הוספת פריט'}</h3>
                <p className="text-sm text-gray-500">הזמנה {order.orderNumber}</p>
              </div>
              <button onClick={() => { setShowAddItemModal(false); setEditingItem(null); resetItemForm(); }}
                className="p-1.5 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Service (only for new items) */}
              {!editingItem && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">שירות *</label>
                  <select value={itemForm.serviceId} onChange={e => {
                    const svc = serviceList.find((s: any) => s.id === e.target.value);
                    setItemForm({ ...itemForm, serviceId: e.target.value, description: svc?.name || itemForm.description });
                  }}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="">בחר שירות...</option>
                    {serviceList.map((svc: any) => (
                      <option key={svc.id} value={svc.id}>{svc.name} — {Number(svc.price).toLocaleString()} ₪</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תיאור *</label>
                <input type="text" value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" placeholder="תיאור הפריט" />
              </div>

              {/* Quantity + Category row (only for new items) */}
              {!editingItem && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">כמות</label>
                    <input type="number" min="1" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })}
                      className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">קטגוריה</label>
                    <select value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                      className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                      <option value="">ללא</option>
                      <option value="WASH">כביסה</option>
                      <option value="DRY_CLEAN">ניקוי יבש</option>
                      <option value="IRON">גיהוץ</option>
                      <option value="FOLD">קיפול</option>
                      <option value="SPECIAL">מיוחד</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Color + Brand */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">צבע</label>
                  <input type="text" value={itemForm.color} onChange={e => setItemForm({ ...itemForm, color: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" placeholder="לבן, שחור..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">מותג</label>
                  <input type="text" value={itemForm.brand} onChange={e => setItemForm({ ...itemForm, brand: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" placeholder="Zara, H&M..." />
                </div>
              </div>

              {/* Weight (only for new items) */}
              {!editingItem && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">משקל (ק&quot;ג)</label>
                  <input type="number" step="0.1" min="0" value={itemForm.weight} onChange={e => setItemForm({ ...itemForm, weight: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" placeholder="0.0" />
                </div>
              )}

              {/* Special Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">הערות מיוחדות</label>
                <textarea value={itemForm.specialNotes} onChange={e => setItemForm({ ...itemForm, specialNotes: e.target.value })}
                  rows={2} className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 resize-none" placeholder="הערות..." />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => { setShowAddItemModal(false); setEditingItem(null); resetItemForm(); }}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">
                ביטול
              </button>
              <button onClick={handleSaveItem}
                disabled={(!editingItem && !itemForm.serviceId) || !itemForm.description || addItemMutation.isPending || editItemMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" />
                {addItemMutation.isPending || editItemMutation.isPending ? 'שומר...' : editingItem ? 'עדכן פריט' : 'הוסף פריט'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowSignatureModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">חתימת לקוח</h3>
                <p className="text-sm text-gray-500">הזמנה {order.orderNumber}</p>
              </div>
              <button onClick={() => setShowSignatureModal(false)}
                className="p-1.5 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם החותם</label>
                <input type="text" value={signedBy} onChange={e => setSignedBy(e.target.value)}
                  placeholder={order.customer?.name || 'שם מלא'}
                  className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">חתום כאן</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    width={380}
                    height={180}
                    className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <button onClick={clearCanvas}
                  className="mt-2 text-xs text-gray-500 hover:text-red-500 transition-colors">
                  נקה חתימה
                </button>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowSignatureModal(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">
                ביטול
              </button>
              <button onClick={saveSignature}
                disabled={signatureMutation.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
                <PenTool className="w-4 h-4" />
                {signatureMutation.isPending ? 'שומר...' : 'שמור חתימה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
