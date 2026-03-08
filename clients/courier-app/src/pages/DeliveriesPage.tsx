import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Truck,
  MapPin,
  Phone,
  Navigation,
  CheckCircle,
  ChevronLeft,
  Loader2,
  RefreshCw,
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
  totalAmount?: number;
  createdAt?: string;
}

type Tab = 'pickup' | 'delivery';

export default function DeliveriesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('pickup');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const [pickupRes, deliveryRes] = await Promise.allSettled([
        api.get('/orders', { params: { status: 'PENDING_PICKUP' } }),
        api.get('/orders', {
          params: { status: 'READY,OUT_FOR_DELIVERY' },
        }),
      ]);

      if (pickupRes.status === 'fulfilled') {
        const data = pickupRes.value.data;
        setPickupOrders(Array.isArray(data) ? data : data.orders || []);
      }
      if (deliveryRes.status === 'fulfilled') {
        const data = deliveryRes.value.data;
        setDeliveryOrders(Array.isArray(data) ? data : data.orders || []);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      await loadOrders();
    } catch {
      // handled by interceptor
    } finally {
      setUpdating(null);
    }
  };

  const getCustomerName = (order: Order) => {
    if (order.customerName) return order.customerName;
    if (order.customer) {
      return `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim();
    }
    return 'לקוח';
  };

  const getPhone = (order: Order) => {
    return order.customerPhone || order.customer?.phone || '';
  };

  const getAddress = (order: Order) => {
    return order.deliveryAddress || order.customer?.address || '';
  };

  const openNavigation = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      '_blank',
    );
  };

  const renderOrderCard = (order: Order) => {
    const name = getCustomerName(order);
    const phone = getPhone(order);
    const address = getAddress(order);

    return (
      <div
        key={order.id}
        className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm"
      >
        {/* Header row */}
        <div
          className="flex items-center justify-between mb-3 cursor-pointer"
          onClick={() => navigate(`/deliveries/${order.id}`)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-400">
              #{order.orderNumber || order.id.slice(-6)}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                order.status === 'PENDING_PICKUP'
                  ? 'bg-orange-100 text-orange-700'
                  : order.status === 'READY'
                    ? 'bg-purple-100 text-purple-700'
                    : order.status === 'OUT_FOR_DELIVERY'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.status === 'PENDING_PICKUP'
                ? 'ממתין לאיסוף'
                : order.status === 'READY'
                  ? 'מוכן'
                  : order.status === 'OUT_FOR_DELIVERY'
                    ? 'בדרך'
                    : order.status}
            </span>
          </div>
          <ChevronLeft size={18} className="text-gray-400" />
        </div>

        {/* Customer info */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-800">{name}</span>
          </div>
          {phone && (
            <div className="flex items-center gap-2">
              <Phone size={16} className="text-gray-400 flex-shrink-0" />
              <a
                href={`tel:${phone}`}
                className="text-sm text-green-600 hover:underline"
                dir="ltr"
              >
                {phone}
              </a>
            </div>
          )}
          {address && (
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-600">{address}</span>
            </div>
          )}
          {order.notes && (
            <p className="text-xs text-gray-400 bg-gray-50 p-2 rounded-lg">
              {order.notes}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {/* Navigate button */}
          {address && (
            <button
              onClick={() => openNavigation(address)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-2 border-green-600 text-green-600 rounded-xl font-medium text-sm hover:bg-green-50 transition-colors"
            >
              <Navigation size={16} />
              נווט
            </button>
          )}

          {/* Status action buttons */}
          {order.status === 'PENDING_PICKUP' && (
            <button
              onClick={() => updateStatus(order.id, 'PICKED_UP')}
              disabled={updating === order.id}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-medium text-sm transition-colors"
            >
              {updating === order.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              אספתי
            </button>
          )}

          {order.status === 'READY' && (
            <button
              onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')}
              disabled={updating === order.id}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl font-medium text-sm transition-colors"
            >
              {updating === order.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Truck size={16} />
              )}
              יצאתי למשלוח
            </button>
          )}

          {order.status === 'OUT_FOR_DELIVERY' && (
            <button
              onClick={() => updateStatus(order.id, 'DELIVERED')}
              disabled={updating === order.id}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl font-medium text-sm transition-colors"
            >
              {updating === order.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              נמסר
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">משלוחים</h1>
        <button
          onClick={loadOrders}
          disabled={loading}
          className="p-2 text-gray-500 hover:text-green-600 transition-colors"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('pickup')}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'pickup'
              ? 'bg-white text-orange-600 shadow-sm'
              : 'text-gray-500'
          }`}
        >
          <Package size={16} />
          לאיסוף ({pickupOrders.length})
        </button>
        <button
          onClick={() => setTab('delivery')}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'delivery'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-500'
          }`}
        >
          <Truck size={16} />
          למשלוח ({deliveryOrders.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={36} className="animate-spin text-green-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {tab === 'pickup' ? (
            pickupOrders.length > 0 ? (
              pickupOrders.map(renderOrderCard)
            ) : (
              <div className="text-center py-12">
                <Package size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">אין הזמנות לאיסוף</p>
              </div>
            )
          ) : deliveryOrders.length > 0 ? (
            deliveryOrders.map(renderOrderCard)
          ) : (
            <div className="text-center py-12">
              <Truck size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">אין הזמנות למשלוח</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
