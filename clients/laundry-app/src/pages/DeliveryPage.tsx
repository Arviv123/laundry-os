import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Truck, Package, MapPin, Phone, Navigation, Clock,
  CheckCircle, User, ShoppingBag, ExternalLink,
} from 'lucide-react';

export default function DeliveryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'pickups' | 'deliveries' | 'runs'>('pickups');

  const { data: pending, isLoading: loadingPending } = useQuery({
    queryKey: ['delivery-pending'],
    queryFn: () => api.get('/delivery/pending').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: runs, isLoading: loadingRuns } = useQuery({
    queryKey: ['delivery-runs'],
    queryFn: () => api.get('/delivery/runs').then(r => r.data.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      api.patch(`/orders/${orderId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-pending'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-runs'] });
      addToast('סטטוס עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס', 'error'),
  });

  const pickups = pending?.pendingPickups ?? [];
  const deliveries = pending?.pendingDeliveries ?? [];
  const runsList = Array.isArray(runs) ? runs : [];

  const openNavigation = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://waze.com/ul?q=${encoded}&navigate=yes`, '_blank');
  };

  const callCustomer = (phone: string) => {
    window.open(`tel:${phone}`, '_self');
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Truck className="w-7 h-7 text-blue-600" /> משלוחים
        </h1>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg">
            <Package className="w-4 h-4 text-orange-500" />
            <span className="font-bold text-orange-700">{pickups.length}</span>
            <span className="text-orange-600">איסופים</span>
          </div>
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
            <MapPin className="w-4 h-4 text-green-500" />
            <span className="font-bold text-green-700">{deliveries.length}</span>
            <span className="text-green-600">משלוחים</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 max-w-md">
        <button onClick={() => setActiveTab('pickups')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'pickups' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
          }`}>
          <Package className="w-4 h-4" /> איסופים ({pickups.length})
        </button>
        <button onClick={() => setActiveTab('deliveries')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'deliveries' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
          }`}>
          <MapPin className="w-4 h-4" /> משלוחים ({deliveries.length})
        </button>
        <button onClick={() => setActiveTab('runs')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'runs' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
          }`}>
          <Truck className="w-4 h-4" /> סבבים ({runsList.length})
        </button>
      </div>

      {/* Pickups */}
      {activeTab === 'pickups' && (
        <div className="space-y-3">
          {loadingPending ? <p className="text-gray-400">טוען...</p> : (
            <>
              {pickups.map((order: any) => (
                <DeliveryCard key={order.id} order={order} type="pickup"
                  onNavigate={(addr) => openNavigation(addr)}
                  onCall={(phone) => callCustomer(phone)}
                  onStatusChange={(status) => statusMutation.mutate({ orderId: order.id, status })}
                  onView={() => navigate(`/orders/${order.id}`)} />
              ))}
              {pickups.length === 0 && (
                <EmptyState icon={Package} text="אין איסופים ממתינים" />
              )}
            </>
          )}
        </div>
      )}

      {/* Deliveries */}
      {activeTab === 'deliveries' && (
        <div className="space-y-3">
          {loadingPending ? <p className="text-gray-400">טוען...</p> : (
            <>
              {deliveries.map((order: any) => (
                <DeliveryCard key={order.id} order={order} type="delivery"
                  onNavigate={(addr) => openNavigation(addr)}
                  onCall={(phone) => callCustomer(phone)}
                  onStatusChange={(status) => statusMutation.mutate({ orderId: order.id, status })}
                  onView={() => navigate(`/orders/${order.id}`)} />
              ))}
              {deliveries.length === 0 && (
                <EmptyState icon={MapPin} text="אין משלוחים ממתינים" />
              )}
            </>
          )}
        </div>
      )}

      {/* Runs */}
      {activeTab === 'runs' && (
        <div className="space-y-3">
          {loadingRuns ? <p className="text-gray-400">טוען...</p> : (
            <>
              {runsList.map((run: any) => (
                <div key={run.id} className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <span className="font-medium">{run.driver?.firstName} {run.driver?.lastName}</span>
                        <div className="text-xs text-gray-400">{new Date(run.date).toLocaleDateString('he-IL')}</div>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      run.status === 'COMPLETED_RUN' ? 'bg-green-100 text-green-700' :
                      run.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {run.status === 'COMPLETED_RUN' ? 'הושלם' :
                       run.status === 'IN_PROGRESS' ? 'בדרך' :
                       run.status === 'PLANNED' ? 'מתוכנן' : run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {run.stops?.length ?? 0} עצירות</span>
                  </div>
                </div>
              ))}
              {runsList.length === 0 && (
                <EmptyState icon={Truck} text="אין סבבי משלוח" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryCard({ order, type, onNavigate, onCall, onStatusChange, onView }: {
  order: any; type: 'pickup' | 'delivery';
  onNavigate: (addr: string) => void;
  onCall: (phone: string) => void;
  onStatusChange: (status: string) => void;
  onView: () => void;
}) {
  const address = typeof order.deliveryAddress === 'object'
    ? [order.deliveryAddress?.street, order.deliveryAddress?.city].filter(Boolean).join(', ')
    : order.deliveryAddress || '';
  const phone = order.customer?.phone;

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow ${
      order.priority === 'EXPRESS' ? 'border-orange-300 bg-orange-50/30' : ''
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            type === 'pickup' ? 'bg-orange-100' : 'bg-green-100'
          }`}>
            {type === 'pickup' ? <Package className="w-5 h-5 text-orange-600" /> : <MapPin className="w-5 h-5 text-green-600" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-blue-600">{order.orderNumber}</span>
              {order.priority === 'EXPRESS' && (
                <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 rounded text-[10px] font-bold">EXPRESS</span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-800">{order.customer?.name}</p>
          </div>
        </div>
        <div className="text-left text-sm">
          <div className="font-semibold">{Number(order.total).toLocaleString()} ₪</div>
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(order.receivedAt).toLocaleDateString('he-IL')}
          </div>
        </div>
      </div>

      {address && (
        <div className="text-sm text-gray-600 mb-3 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          {address}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {phone && (
          <button onClick={() => onCall(phone)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs hover:bg-blue-100">
            <Phone className="w-3 h-3" /> התקשר
          </button>
        )}
        {address && (
          <button onClick={() => onNavigate(address)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs hover:bg-purple-100">
            <Navigation className="w-3 h-3" /> נווט (Waze)
          </button>
        )}
        <button onClick={onView}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200">
          <ExternalLink className="w-3 h-3" /> צפה
        </button>
        {type === 'delivery' && (
          <button onClick={() => onStatusChange('DELIVERED')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 mr-auto">
            <CheckCircle className="w-3 h-3" /> נמסר
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
