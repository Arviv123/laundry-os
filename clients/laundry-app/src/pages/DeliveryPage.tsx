import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Truck, Package, MapPin } from 'lucide-react';

export default function DeliveryPage() {
  const { data: pending, isLoading: loadingPending } = useQuery({
    queryKey: ['delivery-pending'],
    queryFn: () => api.get('/delivery/pending').then(r => r.data.data),
  });

  const { data: runs, isLoading: loadingRuns } = useQuery({
    queryKey: ['delivery-runs'],
    queryFn: () => api.get('/delivery/runs').then(r => r.data.data),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Truck className="w-7 h-7 text-blue-600" /> משלוחים
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Pickups */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" /> ממתינים לאיסוף
          </h2>
          {loadingPending ? <p className="text-gray-400">טוען...</p> : (
            <div className="space-y-3">
              {pending?.pendingPickups?.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <div>
                    <span className="font-mono text-sm text-blue-600">{order.orderNumber}</span>
                    <p className="text-sm text-gray-600">{order.customer?.name}</p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(order.receivedAt).toLocaleDateString('he-IL')}</span>
                </div>
              ))}
              {(!pending?.pendingPickups || pending.pendingPickups.length === 0) && (
                <p className="text-sm text-gray-400">אין איסופים ממתינים</p>
              )}
            </div>
          )}
        </div>

        {/* Pending Deliveries */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-500" /> מוכנים למשלוח
          </h2>
          {loadingPending ? <p className="text-gray-400">טוען...</p> : (
            <div className="space-y-3">
              {pending?.pendingDeliveries?.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div>
                    <span className="font-mono text-sm text-blue-600">{order.orderNumber}</span>
                    <p className="text-sm text-gray-600">{order.customer?.name}</p>
                  </div>
                  <span className="text-xs text-gray-400">{order.completedAt ? new Date(order.completedAt).toLocaleDateString('he-IL') : '—'}</span>
                </div>
              ))}
              {(!pending?.pendingDeliveries || pending.pendingDeliveries.length === 0) && (
                <p className="text-sm text-gray-400">אין משלוחים ממתינים</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delivery Runs */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-700 mb-4">סבבי משלוח</h2>
        {loadingRuns ? <p className="text-gray-400">טוען...</p> : (
          <div className="space-y-3">
            {runs?.map((run: any) => (
              <div key={run.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{run.driver?.firstName} {run.driver?.lastName}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    run.status === 'COMPLETED_RUN' ? 'bg-green-100 text-green-700' :
                    run.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{run.status}</span>
                </div>
                <p className="text-sm text-gray-500">{new Date(run.date).toLocaleDateString('he-IL')} | {run.stops?.length ?? 0} עצירות</p>
              </div>
            ))}
            {(!runs || runs.length === 0) && <p className="text-sm text-gray-400">אין סבבי משלוח</p>}
          </div>
        )}
      </div>
    </div>
  );
}
