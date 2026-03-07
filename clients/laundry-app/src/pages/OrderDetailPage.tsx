import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { ArrowRight, CheckCircle, Clock, Shirt, CreditCard } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'התקבל', PROCESSING: 'בעיבוד', WASHING: 'בכביסה',
  DRYING: 'בייבוש', IRONING: 'בגיהוץ', READY: 'מוכן',
  OUT_FOR_DELIVERY: 'במשלוח', DELIVERED: 'נמסר', CANCELLED: 'בוטל',
};

const STATUS_FLOW = ['RECEIVED', 'PROCESSING', 'WASHING', 'DRYING', 'IRONING', 'READY', 'DELIVERED'];

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-yellow-100 text-yellow-800', PROCESSING: 'bg-blue-100 text-blue-800',
  WASHING: 'bg-cyan-100 text-cyan-800', DRYING: 'bg-orange-100 text-orange-800',
  IRONING: 'bg-purple-100 text-purple-800', READY: 'bg-green-100 text-green-800',
  OUT_FOR_DELIVERY: 'bg-indigo-100 text-indigo-800', DELIVERED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-800',
};

const NEXT_STATUS: Record<string, string> = {
  RECEIVED: 'PROCESSING', PROCESSING: 'WASHING', WASHING: 'DRYING',
  DRYING: 'IRONING', IRONING: 'READY', READY: 'DELIVERED',
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then(r => r.data.data),
  });

  const advanceMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
  });

  const payMutation = useMutation({
    mutationFn: (data: { amount: number; method: string }) => api.post(`/orders/${id}/payment`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
  });

  if (isLoading) return <div className="p-6 text-center text-gray-400">טוען...</div>;
  if (!order) return <div className="p-6 text-center text-red-400">הזמנה לא נמצאה</div>;

  const nextStatus = NEXT_STATUS[order.status];
  const remaining = Number(order.total) - Number(order.paidAmount);
  const currentIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/orders')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">הזמנה {order.orderNumber}</h1>
          <p className="text-gray-500">{order.customer?.name} | {new Date(order.receivedAt).toLocaleDateString('he-IL')}</p>
        </div>
        <span className={`mr-auto px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[order.status]}`}>
          {STATUS_LABELS[order.status]}
        </span>
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
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
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
          <button
            onClick={() => advanceMutation.mutate(nextStatus)}
            disabled={advanceMutation.isPending}
            className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-right py-2">ברקוד</th>
                <th className="text-right py-2">תיאור</th>
                <th className="text-right py-2">שירות</th>
                <th className="text-right py-2">כמות</th>
                <th className="text-right py-2">מחיר</th>
                <th className="text-right py-2">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="py-2 font-mono text-xs text-blue-600">{item.barcode}</td>
                  <td className="py-2">{item.description}</td>
                  <td className="py-2 text-gray-500">{item.service?.name ?? '—'}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2">{Number(item.lineTotal).toLocaleString()} ₪</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-xs">{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gray-400" /> סיכום כספי
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">סכום ביניים</span><span>{Number(order.subtotal).toLocaleString()} ₪</span></div>
            {Number(order.deliveryFee) > 0 && <div className="flex justify-between"><span className="text-gray-500">דמי משלוח</span><span>{Number(order.deliveryFee).toLocaleString()} ₪</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">מע"מ</span><span>{Number(order.vatAmount).toLocaleString()} ₪</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>סה"כ</span><span>{Number(order.total).toLocaleString()} ₪</span></div>
            <div className="flex justify-between text-green-600"><span>שולם</span><span>{Number(order.paidAmount).toLocaleString()} ₪</span></div>
            {remaining > 0 && <div className="flex justify-between text-red-600"><span>נותר</span><span>{remaining.toLocaleString()} ₪</span></div>}
          </div>

          {remaining > 0 && (
            <button
              onClick={() => payMutation.mutate({ amount: remaining, method: 'CASH' })}
              disabled={payMutation.isPending}
              className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              {payMutation.isPending ? 'מעבד...' : `גבה ${remaining.toLocaleString()} ₪`}
            </button>
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
        </div>
      </div>
    </div>
  );
}
