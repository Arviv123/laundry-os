import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, ShoppingBag, ChevronLeft } from 'lucide-react';
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

interface Profile {
  name: string;
  phone: string;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, ordersRes] = await Promise.all([
          api.get('/customer-auth/me'),
          api.get('/customer-portal/orders'),
        ]);
        setProfile(profileRes.data);
        setOrders(ordersRes.data.orders || ordersRes.data || []);
      } catch {
        // If token is invalid, redirect to login
        localStorage.removeItem('customer_token');
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const activeOrders = orders.filter(o => o.status !== 'DELIVERED');
  const recentOrders = orders.slice(0, 3);

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
      <div className="bg-gradient-to-b from-blue-600 to-blue-500 text-white px-6 pt-12 pb-8 rounded-b-3xl">
        <p className="text-blue-100 text-sm">שלום,</p>
        <h1 className="text-2xl font-bold">{profile?.name || 'לקוח יקר'}</h1>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Active orders count */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">הזמנות פעילות</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                {activeOrders.length}
              </p>
            </div>
            <div className="bg-blue-50 rounded-full p-3">
              <ShoppingBag size={28} className="text-blue-600" />
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/pickup"
            className="bg-blue-600 text-white rounded-2xl p-5 flex flex-col items-center gap-2 active:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle size={28} />
            <span className="font-semibold text-sm">הזמנה חדשה</span>
          </Link>
          <Link
            to="/orders"
            className="bg-white text-gray-800 rounded-2xl p-5 flex flex-col items-center gap-2 border border-gray-100 active:bg-gray-50 transition-colors shadow-sm"
          >
            <ShoppingBag size={28} className="text-blue-600" />
            <span className="font-semibold text-sm">ההזמנות שלי</span>
          </Link>
        </div>

        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">הזמנות אחרונות</h2>
              <Link to="/orders" className="text-blue-600 text-sm flex items-center gap-1">
                הכל
                <ChevronLeft size={16} />
              </Link>
            </div>

            <div className="space-y-3">
              {recentOrders.map(order => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="block bg-white rounded-xl p-4 border border-gray-100 shadow-sm active:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">
                      #{order.orderNumber}
                    </span>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{new Date(order.createdAt).toLocaleDateString('he-IL')}</span>
                    <span>{order.totalAmount?.toFixed(2)} &#8362;</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {orders.length === 0 && (
          <div className="text-center py-12">
            <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">אין הזמנות עדיין</p>
            <p className="text-gray-400 text-sm mt-1">הזמינו איסוף כביסה ראשון!</p>
          </div>
        )}
      </div>
    </div>
  );
}
