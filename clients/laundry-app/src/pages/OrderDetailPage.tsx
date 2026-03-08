import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABELS, STATUS_COLORS, STATUS_FLOW, NEXT_STATUS, PAYMENT_LABELS, PAYMENT_COLORS } from '../lib/constants';
import { SkeletonCard } from '../components/Skeleton';
import { ItemTicketPrintView } from '../components/ItemTicket';
import { ThermalReceiptPrintButton } from '../components/ThermalReceipt';
import api from '../lib/api';
import {
  ArrowRight, CheckCircle, Clock, Shirt, CreditCard,
  MessageCircle, Send, Printer, FileText, DollarSign,
  Phone, Banknote, Wallet, Building,
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

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then(r => r.data.data),
  });

  const advanceMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
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

        {/* Send Invoice */}
        <button onClick={() => setShowSendModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium">
          <Send className="w-4 h-4" /> שלח ללקוח
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
          <button onClick={() => advanceMutation.mutate(nextStatus)}
            disabled={advanceMutation.isPending}
            className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
            {advanceMutation.isPending ? 'מעדכן...' : `קדם ל${STATUS_LABELS[nextStatus]}`}
          </button>
        )}
      </div>

      {/* Items + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Shirt className="w-5 h-5 text-gray-400" /> פריטים ({order.items?.length})
          </h2>
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
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item: any, idx: number) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="py-2 px-2 font-mono text-xs text-blue-600">{item.barcode}</td>
                    <td className="py-2 px-2">{item.description}</td>
                    <td className="py-2 px-2 text-gray-500">{item.service?.name ?? '—'}</td>
                    <td className="py-2 px-2">{item.quantity}</td>
                    <td className="py-2 px-2">{Number(item.lineTotal).toLocaleString()} ₪</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
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

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-700 mb-4">היסטוריה</h2>
        <div className="space-y-3">
          {(Array.isArray(order.statusHistory) ? order.statusHistory : []).map((entry: any, i: number) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-blue-400" />
              <div>
                <span className="font-medium text-sm">{STATUS_LABELS[entry.status] ?? entry.status}</span>
                {entry.note && <span className="text-sm text-gray-500 mr-2">— {entry.note}</span>}
                <div className="text-xs text-gray-400">{new Date(entry.changedAt).toLocaleString('he-IL')}</div>
              </div>
            </div>
          ))}
          {(!order.statusHistory || order.statusHistory.length === 0) && (
            <p className="text-sm text-gray-400">אין היסטוריה</p>
          )}
        </div>
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
    </div>
  );
}
