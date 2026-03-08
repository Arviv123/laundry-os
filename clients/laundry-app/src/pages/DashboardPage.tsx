import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABELS, STATUS_COLORS, STATUS_BG } from '../lib/constants';
import { SkeletonKPI, SkeletonCard, SkeletonTable } from '../components/Skeleton';
import api from '../lib/api';
import { ShoppingBag, Clock, CheckCircle, DollarSign, TrendingUp, WashingMachine } from 'lucide-react';

function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);

  useEffect(() => {
    const start = ref.current;
    const diff = value - start;
    if (diff === 0) { setDisplay(value); return; }
    const duration = 600;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(animate);
      else ref.current = value;
    }
    requestAnimationFrame(animate);
  }, [value]);

  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><SkeletonCard /><SkeletonCard /></div>
      <SkeletonTable rows={5} cols={6} />
    </div>
  );

  if (!data) return <div className="p-6 text-center text-red-400">שגיאה בטעינה</div>;

  const { kpis, statusBreakdown, machineStats, recentOrders } = data;
  const totalActive = statusBreakdown.reduce((s: number, b: any) => s + b.count, 0) || 1;

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-gray-800">דשבורד</h1>

      {/* KPI Cards — clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={ShoppingBag} label="הזמנות היום" value={kpis.todayOrders} color="blue"
          onClick={() => navigate('/orders')} />
        <KPICard icon={Clock} label="בעיבוד" value={kpis.pendingCount} color="yellow"
          onClick={() => navigate('/orders?status=PROCESSING')} />
        <KPICard icon={CheckCircle} label="מוכנים לאיסוף" value={kpis.readyCount} color="green"
          onClick={() => navigate('/orders?status=READY')} />
        <KPICard icon={DollarSign} label="הכנסות היום" value={kpis.todayRevenue} isCurrency color="emerald" />
        <KPICard icon={TrendingUp} label="הכנסות שבועיות" value={kpis.weekRevenue} isCurrency color="indigo" />
      </div>

      {/* Status + Machines Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown with bar */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">פילוח לפי סטטוס</h2>
          {statusBreakdown.length > 0 && (
            <div className="flex rounded-full overflow-hidden h-4 mb-4">
              {statusBreakdown.map((s: any) => (
                <div key={s.status} className={`${STATUS_BG[s.status] ?? 'bg-gray-400'} transition-all duration-500`}
                  style={{ width: `${(s.count / totalActive) * 100}%` }}
                  title={`${STATUS_LABELS[s.status]}: ${s.count}`} />
              ))}
            </div>
          )}
          <div className="space-y-2">
            {statusBreakdown.map((s: any) => (
              <button key={s.status} onClick={() => navigate(`/orders?status=${s.status}`)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
                <span className="font-semibold text-gray-800">{s.count}</span>
              </button>
            ))}
            {statusBreakdown.length === 0 && <p className="text-gray-400 text-sm">אין הזמנות פעילות</p>}
          </div>
        </div>

        {/* Machine Stats */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">מכונות</h2>
          <div className="space-y-3">
            {machineStats.map((m: any) => {
              const label = m.status === 'AVAILABLE' ? 'פנויות' : m.status === 'RUNNING' ? 'פעילות' : m.status === 'MAINTENANCE' ? 'בתחזוקה' : m.status;
              const color = m.status === 'AVAILABLE' ? 'text-green-600' : m.status === 'RUNNING' ? 'text-blue-600' : 'text-yellow-600';
              return (
                <div key={m.status} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate('/machines')}>
                  <div className="flex items-center gap-2">
                    <WashingMachine className={`w-4 h-4 ${color}`} />
                    <span className="text-sm text-gray-600">{label}</span>
                  </div>
                  <span className="font-semibold">{m.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">הזמנות אחרונות</h2>
          <button onClick={() => navigate('/orders')} className="text-sm text-blue-600 hover:underline">הצג הכל →</button>
        </div>
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
                <tr key={order.id} className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/orders/${order.id}`)}>
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

function KPICard({ icon: Icon, label, value, color, isCurrency, onClick }: {
  icon: any; label: string; value: number; color: string; isCurrency?: boolean; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600', emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 transition-all duration-200 ${
      onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
    }`} onClick={onClick}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">
        <AnimatedNumber value={Number(value) || 0} suffix={isCurrency ? ' ₪' : ''} />
      </div>
    </div>
  );
}
