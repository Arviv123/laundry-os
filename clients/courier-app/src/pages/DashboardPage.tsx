import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Truck,
  CheckCircle,
  MapPin,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import api from '../lib/api';

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  customer?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
  };
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  createdAt?: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingPickups, setPendingPickups] = useState<Order[]>([]);
  const [inProgress, setInProgress] = useState<Order[]>([]);
  const [completedToday, setCompletedToday] = useState<Order[]>([]);

  const userName = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('courier_user') || '{}');
      return user.firstName || user.name || 'שליח';
    } catch {
      return 'שליח';
    }
  })();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pickupRes, progressRes, completedRes] = await Promise.allSettled([
        api.get('/orders', { params: { status: 'PENDING_PICKUP' } }),
        api.get('/orders', { params: { status: 'OUT_FOR_DELIVERY' } }),
        api.get('/orders', { params: { status: 'DELIVERED' } }),
      ]);

      if (pickupRes.status === 'fulfilled') {
        const data = pickupRes.value.data;
        setPendingPickups(Array.isArray(data) ? data : data.orders || []);
      }
      if (progressRes.status === 'fulfilled') {
        const data = progressRes.value.data;
        setInProgress(Array.isArray(data) ? data : data.orders || []);
      }
      if (completedRes.status === 'fulfilled') {
        const data = completedRes.value.data;
        const orders = Array.isArray(data) ? data : data.orders || [];
        // Filter to today only
        const today = new Date().toDateString();
        setCompletedToday(
          orders.filter(
            (o: Order) =>
              o.createdAt && new Date(o.createdAt).toDateString() === today,
          ),
        );
      }
    } catch {
      // errors handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const nextDelivery = pendingPickups[0] || inProgress[0];

  const getCustomerName = (order: Order) => {
    if (order.customerName) return order.customerName;
    if (order.customer) {
      return `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim();
    }
    return 'לקוח';
  };

  const getAddress = (order: Order) => {
    return order.deliveryAddress || order.customer?.address || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={40} className="animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-l from-green-600 to-green-700 text-white rounded-2xl p-5">
        <p className="text-green-200 text-sm">שלום,</p>
        <h1 className="text-2xl font-bold">{userName}</h1>
        <p className="text-green-100 text-sm mt-1">
          {new Date().toLocaleDateString('he-IL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Package size={20} className="text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {pendingPickups.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">לאיסוף</p>
        </div>

        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Truck size={20} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {inProgress.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">בדרך</p>
        </div>

        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle size={20} className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {completedToday.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">הושלמו</p>
        </div>
      </div>

      {/* Next Delivery Card */}
      {nextDelivery ? (
        <div
          className="bg-white border-2 border-green-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate(`/deliveries/${nextDelivery.id}`)}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">משלוח הבא</h3>
            <ChevronLeft size={20} className="text-gray-400" />
          </div>

          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <MapPin size={24} className="text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-800">
                {getCustomerName(nextDelivery)}
              </p>
              {getAddress(nextDelivery) && (
                <p className="text-sm text-gray-500 mt-1">
                  {getAddress(nextDelivery)}
                </p>
              )}
              <span
                className={`inline-block mt-2 text-xs px-2.5 py-1 rounded-full font-medium ${
                  nextDelivery.status === 'PENDING_PICKUP'
                    ? 'bg-orange-100 text-orange-700'
                    : nextDelivery.status === 'OUT_FOR_DELIVERY'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                }`}
              >
                {nextDelivery.status === 'PENDING_PICKUP'
                  ? 'ממתין לאיסוף'
                  : nextDelivery.status === 'OUT_FOR_DELIVERY'
                    ? 'בדרך'
                    : nextDelivery.status}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-8 text-center">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">אין משלוחים ממתינים</p>
          <p className="text-gray-400 text-sm mt-1">כל הכבוד! סיימת הכל.</p>
        </div>
      )}

      {/* Quick Actions */}
      <button
        onClick={() => navigate('/deliveries')}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        <Truck size={20} />
        צפה בכל המשלוחים
      </button>
    </div>
  );
}
