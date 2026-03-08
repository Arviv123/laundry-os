import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Phone,
  Navigation,
  Package,
  CheckCircle,
  Truck,
  Clock,
  Loader2,
  User,
  FileText,
} from 'lucide-react';
import api from '../lib/api';

interface OrderItem {
  id: string;
  name?: string;
  serviceName?: string;
  quantity?: number;
  price?: number;
}

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  customer?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  totalAmount?: number;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
  statusHistory?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין',
  PENDING_PICKUP: 'ממתין לאיסוף',
  PICKED_UP: 'נאסף',
  IN_PROCESS: 'בעבודה',
  READY: 'מוכן',
  OUT_FOR_DELIVERY: 'בדרך למשלוח',
  DELIVERED: 'נמסר',
  CANCELLED: 'בוטל',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  PENDING_PICKUP: 'bg-orange-100 text-orange-700',
  PICKED_UP: 'bg-yellow-100 text-yellow-700',
  IN_PROCESS: 'bg-indigo-100 text-indigo-700',
  READY: 'bg-purple-100 text-purple-700',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/orders/${id}`);
      setOrder(res.data);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      await api.patch(`/orders/${order.id}/status`, { status: newStatus });
      await loadOrder();
    } catch {
      // handled by interceptor
    } finally {
      setUpdating(false);
    }
  };

  const getCustomerName = (o: Order) => {
    if (o.customerName) return o.customerName;
    if (o.customer) {
      return `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim();
    }
    return 'לקוח';
  };

  const getPhone = (o: Order) => o.customerPhone || o.customer?.phone || '';
  const getAddress = (o: Order) =>
    o.deliveryAddress || o.customer?.address || '';

  const openNavigation = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      '_blank',
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={40} className="animate-spin text-green-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-4 text-center py-20">
        <Package size={48} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">הזמנה לא נמצאה</p>
        <button
          onClick={() => navigate('/deliveries')}
          className="mt-4 text-green-600 font-medium"
        >
          חזרה למשלוחים
        </button>
      </div>
    );
  }

  const name = getCustomerName(order);
  const phone = getPhone(order);
  const address = getAddress(order);

  return (
    <div className="p-4 space-y-4">
      {/* Back button + order number */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/deliveries')}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowRight size={22} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">
            הזמנה #{order.orderNumber || order.id.slice(-6)}
          </h1>
          <span
            className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${
              STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'
            }`}
          >
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
      </div>

      {/* Customer Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-gray-700 flex items-center gap-2">
          <User size={18} className="text-green-600" />
          פרטי לקוח
        </h3>

        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-lg">{name}</p>

          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2 text-green-600 hover:text-green-700 py-2 px-3 bg-green-50 rounded-xl w-fit"
            >
              <Phone size={18} />
              <span className="font-medium" dir="ltr">
                {phone}
              </span>
            </a>
          )}

          {address && (
            <div className="flex items-start gap-2">
              <MapPin
                size={18}
                className="text-gray-400 mt-0.5 flex-shrink-0"
              />
              <span className="text-gray-600">{address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigate Button */}
      {address && (
        <button
          onClick={() => openNavigation(address)}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-white border-2 border-green-600 text-green-600 rounded-xl font-bold text-lg hover:bg-green-50 transition-colors"
        >
          <Navigation size={22} />
          נווט לכתובת
        </button>
      )}

      {/* Items List */}
      {order.items && order.items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-3">
            <FileText size={18} className="text-green-600" />
            פריטים
          </h3>
          <div className="space-y-2">
            {order.items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <span className="text-gray-700">
                  {item.name || item.serviceName || `פריט ${idx + 1}`}
                </span>
                <div className="flex items-center gap-3 text-sm">
                  {item.quantity && (
                    <span className="text-gray-500">x{item.quantity}</span>
                  )}
                  {item.price != null && (
                    <span className="font-medium text-gray-800">
                      {item.price.toFixed(2)} ₪
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {order.totalAmount != null && (
            <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-gray-200">
              <span className="font-bold text-gray-700">סה"כ</span>
              <span className="font-bold text-lg text-green-600">
                {order.totalAmount.toFixed(2)} ₪
              </span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
          <h3 className="font-bold text-yellow-800 text-sm mb-1">הערות</h3>
          <p className="text-yellow-700 text-sm">{order.notes}</p>
        </div>
      )}

      {/* Status History */}
      {order.statusHistory && order.statusHistory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-3">
            <Clock size={18} className="text-green-600" />
            היסטוריית סטטוס
          </h3>
          <div className="space-y-3">
            {order.statusHistory.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-700 text-sm">
                    {STATUS_LABELS[entry.status] || entry.status}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(entry.timestamp).toLocaleString('he-IL')}
                  </p>
                  {entry.note && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {entry.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pb-4">
        {order.status === 'PENDING_PICKUP' && (
          <button
            onClick={() => updateStatus('PICKED_UP')}
            disabled={updating}
            className="w-full flex items-center justify-center gap-2 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-bold text-lg transition-colors"
          >
            {updating ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <CheckCircle size={22} />
            )}
            אספתי
          </button>
        )}

        {order.status === 'READY' && (
          <button
            onClick={() => updateStatus('OUT_FOR_DELIVERY')}
            disabled={updating}
            className="w-full flex items-center justify-center gap-2 py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl font-bold text-lg transition-colors"
          >
            {updating ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <Truck size={22} />
            )}
            יצאתי למשלוח
          </button>
        )}

        {order.status === 'OUT_FOR_DELIVERY' && (
          <button
            onClick={() => updateStatus('DELIVERED')}
            disabled={updating}
            className="w-full flex items-center justify-center gap-2 py-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl font-bold text-lg transition-colors"
          >
            {updating ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <CheckCircle size={22} />
            )}
            נמסר ללקוח
          </button>
        )}

        {/* Call button (always available if phone exists) */}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            <Phone size={20} />
            התקשר ללקוח
          </a>
        )}
      </div>
    </div>
  );
}
