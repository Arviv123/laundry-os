import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, Package, Check } from 'lucide-react';
import api from '../lib/api';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'התקבל',
  PROCESSING: 'בטיפול',
  PACKAGING: 'באריזה',
  READY: 'מוכן',
  OUT_FOR_DELIVERY: 'בדרך אליך',
  DELIVERED: 'נמסר',
};

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  PACKAGING: 'bg-purple-100 text-purple-800',
  READY: 'bg-green-100 text-green-800',
  OUT_FOR_DELIVERY: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-gray-100 text-gray-600',
};

const STATUS_ORDER = ['RECEIVED', 'PROCESSING', 'PACKAGING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

interface StatusHistoryEntry {
  status: string;
  timestamp: string;
  note?: string;
}

interface OrderItem {
  id: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  notes?: string;
  items: OrderItem[];
  statusHistory: StatusHistoryEntry[];
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await api.get(`/customer-portal/orders/${id}`);
        setOrder(res.data);
      } catch {
        setError('לא ניתן לטעון את ההזמנה');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto px-4 pt-12 text-center">
        <p className="text-red-500 mb-4">{error || 'הזמנה לא נמצאה'}</p>
        <Link to="/orders" className="text-blue-600">חזרה להזמנות</Link>
      </div>
    );
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(order.status);

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <Link to="/orders" className="flex items-center gap-1 text-blue-600 text-sm mb-3">
          <ArrowRight size={16} />
          חזרה להזמנות
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">
            הזמנה #{order.orderNumber}
          </h1>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
        <p className="text-gray-400 text-sm mt-1">
          {new Date(order.createdAt).toLocaleDateString('he-IL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4 pb-4">
        {/* Status Timeline */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-4">מעקב סטטוס</h2>
          <div className="space-y-0">
            {STATUS_ORDER.map((status, index) => {
              const historyEntry = order.statusHistory?.find(h => h.status === status);
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;
              const isLast = index === STATUS_ORDER.length - 1;

              return (
                <div key={status} className="flex gap-3">
                  {/* Timeline dot and line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 ring-4 ring-blue-100'
                        : isCompleted
                        ? 'bg-blue-600'
                        : 'bg-gray-200'
                    }`}>
                      {isCompleted && <Check size={14} className="text-white" />}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-8 ${
                        isCompleted && index < currentStatusIndex ? 'bg-blue-600' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>

                  {/* Status info */}
                  <div className={`pb-6 ${!isCompleted ? 'opacity-40' : ''}`}>
                    <p className={`font-medium text-sm ${isCurrent ? 'text-blue-600' : 'text-gray-800'}`}>
                      {STATUS_LABELS[status]}
                    </p>
                    {historyEntry && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(historyEntry.timestamp).toLocaleDateString('he-IL', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Items */}
        {order.items && order.items.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h2 className="font-bold text-gray-800 mb-3">פריטים</h2>
            <div className="space-y-3">
              {order.items.map(item => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-50 rounded-lg p-2">
                      <Package size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.serviceName}</p>
                      <p className="text-xs text-gray-400">x{item.quantity}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">
                    {item.totalPrice?.toFixed(2)} &#8362;
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="border-t border-gray-100 mt-4 pt-4 flex items-center justify-between">
              <span className="font-bold text-gray-800">סה"כ</span>
              <span className="font-bold text-lg text-blue-600">
                {order.totalAmount?.toFixed(2)} &#8362;
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h2 className="font-bold text-gray-800 mb-2">הערות</h2>
            <p className="text-sm text-gray-600">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
