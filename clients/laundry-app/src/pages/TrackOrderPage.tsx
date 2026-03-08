import { useState } from 'react';
import { STATUS_LABELS, STATUS_COLORS, STATUS_FLOW } from '../lib/constants';
import api from '../lib/api';
import { Search, CheckCircle, Clock, Package, Phone, Shirt } from 'lucide-react';

export default function TrackOrderPage() {
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTrack = async () => {
    if (!orderNumber.trim()) return;
    setLoading(true);
    setError('');
    setOrder(null);
    try {
      // Try to find order by order number via public-ish endpoint
      const res = await api.get('/orders', { params: { search: orderNumber.trim(), limit: 1 } });
      const orders = res.data.data?.orders ?? [];
      const found = orders.find((o: any) =>
        o.orderNumber === orderNumber.trim() &&
        (!phone || o.customer?.phone?.includes(phone))
      );
      if (found) {
        setOrder(found);
      } else {
        setError('הזמנה לא נמצאה. בדוק את מספר ההזמנה.');
      }
    } catch {
      setError('שגיאה בחיפוש. נסה שוב.');
    }
    setLoading(false);
  };

  const currentIdx = order ? STATUS_FLOW.indexOf(order.status) : -1;
  const isPaid = order ? Number(order.paidAmount) >= Number(order.total) : false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4" dir="rtl">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Shirt className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800">LaundryOS</h1>
        <p className="text-gray-500 mt-1">מעקב הזמנה</p>
      </div>

      {/* Search Form */}
      {!order && (
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md animate-fadeIn">
          <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">בדוק סטטוס הזמנה</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">מספר הזמנה *</label>
              <div className="relative">
                <Package className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTrack()}
                  placeholder="לדוגמה: ORD-001"
                  className="w-full pr-11 pl-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-lg"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">טלפון (אופציונלי)</label>
              <div className="relative">
                <Phone className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTrack()}
                  placeholder="050-1234567"
                  className="w-full pr-11 pl-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button onClick={handleTrack} disabled={loading || !orderNumber.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Search className="w-5 h-5" /> חפש הזמנה</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Order Result */}
      {order && (
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg animate-fadeIn">
          {/* Back */}
          <button onClick={() => { setOrder(null); setError(''); }}
            className="text-sm text-blue-600 hover:underline mb-4">← חיפוש חדש</button>

          {/* Order Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800">הזמנה {order.orderNumber}</h2>
              <p className="text-gray-500 text-sm">{order.customer?.name}</p>
            </div>
            <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${STATUS_COLORS[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>

          {/* Status Progress */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">מעקב התקדמות</h3>
            <div className="space-y-3">
              {STATUS_FLOW.map((s, i) => {
                const isDone = i <= currentIdx;
                const isCurrent = s === order.status;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCurrent ? 'bg-blue-600 text-white' :
                      isDone ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {isDone && !isCurrent ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div className={`flex-1 ${isCurrent ? 'font-bold text-blue-700' : isDone ? 'text-green-700' : 'text-gray-400'}`}>
                      {STATUS_LABELS[s]}
                    </div>
                    {isCurrent && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">כרגע</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">פריטים</h3>
            <div className="space-y-2">
              {order.items?.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium text-gray-800">{item.description || item.service?.name}</span>
                    <span className="text-gray-400 text-sm mr-2">×{item.quantity}</span>
                  </div>
                  <span className="font-medium">{Number(item.lineTotal).toLocaleString()} ₪</span>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-lg font-bold">
              <span>{"סה\"כ"}</span>
              <span>{Number(order.total).toLocaleString()} ₪</span>
            </div>
            <div className={`text-center py-2 rounded-lg ${isPaid ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
              {isPaid ? '✓ שולם במלואו' : `נותר לתשלום: ${(Number(order.total) - Number(order.paidAmount)).toLocaleString()} ₪`}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 text-sm text-gray-400">© LaundryOS — מערכת ניהול מכבסה</p>
    </div>
  );
}
