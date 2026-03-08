import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronLeft } from 'lucide-react';
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

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await api.get('/customer-portal/orders');
        setOrders(res.data.orders || res.data || []);
      } catch {
        // handle error silently
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800">ההזמנות שלי</h1>
        <p className="text-gray-500 text-sm mt-1">{orders.length} הזמנות</p>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">אין הזמנות עדיין</p>
            <Link
              to="/pickup"
              className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold"
            >
              הזמנה ראשונה
            </Link>
          </div>
        ) : (
          orders.map(order => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="block bg-white rounded-xl p-4 border border-gray-100 shadow-sm active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 rounded-full p-2">
                    <ShoppingBag size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 block">
                      #{order.orderNumber}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                </div>
                <ChevronLeft size={18} className="text-gray-400" />
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
                <div className="text-left">
                  {order.itemCount != null && (
                    <span className="text-xs text-gray-400 ml-3">{order.itemCount} פריטים</span>
                  )}
                  <span className="font-semibold text-gray-800">
                    {order.totalAmount?.toFixed(2)} &#8362;
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
