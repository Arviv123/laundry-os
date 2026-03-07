import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ShoppingBag, Clock, CheckCircle, DollarSign, TrendingUp, WashingMachine } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'התקבל', PROCESSING: 'בעיבוד', WASHING: 'בכביסה',
  DRYING: 'בייבוש', IRONING: 'בגיהוץ', READY: 'מוכן',
  OUT_FOR_DELIVERY: 'במשלוח', DELIVERED: 'נמסר', CANCELLED: 'בוטל',
};

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-yellow-100 text-yellow-800', PROCESSING: 'bg-blue-100 text-blue-800',
  WASHING: 'bg-cyan-100 text-cyan-800', DRYING: 'bg-orange-100 text-orange-800',
  IRONING: 'bg-purple-100 text-purple-800', READY: 'bg-green-100 text-green-800',
  OUT_FOR_DELIVERY: 'bg-indigo-100 text-indigo-800',
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data.data),
  });

  if (isLoading) return <div className="p-6 text-center text-gray-400">טוען דשבורד...</div>;
  if (!data) return <div className="p-6 text-center text-red-400">שגיאה בטעינה</div>;

  const { kpis, statusBreakdown, machineStats, recentOrders } = data;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">דשבורד</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={ShoppingBag} label="הזמנות היום" value={kpis.todayOrders} color="blue" />
        <KPICard icon={Clock} label="בעיבוד" value={kpis.pendingCount} color="yellow" />
        <KPICard icon={CheckCircle} label="מוכנים לאיסוף" value={kpis.readyCount} color="green" />
        <KPICard icon={DollarSign} label="הכנסות היום" value={`${kpis.todayRevenue.toLocaleString()} ₪`} color="emerald" />
        <KPICard icon={TrendingUp} label="הכנסות שבועיות" value={`${kpis.weekRevenue.toLocaleString()} ₪`} color="indigo" />
      </div>

      {/* Status + Machines Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">פילוח לפי סטטוס</h2>
          <div className="space-y-3">
            {statusBreakdown.map((s: any) => (
              <div key={s.status} className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
                <span className="font-semibold text-gray-800">{s.count}</span>
              </div>
            ))}
            {statusBreakdown.length === 0 && <p className="text-gray-400 text-sm">אין הזמנות פעילות</p>}
          </div>
        </div>

        {/* Machine Stats */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">מכונות</h2>
          <div className="space-y-3">
            {machineStats.map((m: any) => (
              <div key={m.status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WashingMachine className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{m.status === 'AVAILABLE' ? 'פנויות' : m.status === 'RUNNING' ? 'פעילות' : m.status === 'MAINTENANCE' ? 'בתחזוקה' : m.status}</span>
                </div>
                <span className="font-semibold">{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-800 mb-4">הזמנות אחרונות</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-right py-2 px-3">מספר</th>
                <th className="text-right py-2 px-3">לקוח</th>
                <th className="text-right py-2 px-3">סטטוס</th>
                <th className="text-right py-2 px-3">פריטים</th>
                <th className="text-right py-2 px-3">סכום</th>
                <th className="text-right py-2 px-3">תאריך</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders?.map((order: any) => (
                <tr key={order.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/orders/${order.id}`}>
                  <td className="py-2 px-3 font-mono text-blue-600">{order.orderNumber}</td>
                  <td className="py-2 px-3">{order.customer?.name ?? '—'}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">{order.items?.length ?? 0}</td>
                  <td className="py-2 px-3 font-medium">{Number(order.total).toLocaleString()} ₪</td>
                  <td className="py-2 px-3 text-gray-400">{new Date(order.receivedAt).toLocaleDateString('he-IL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600', emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
    </div>
  );
}
