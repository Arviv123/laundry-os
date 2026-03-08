import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/constants';
import { SkeletonCard } from '../components/Skeleton';
import {
  BarChart3, TrendingUp, Calendar, DollarSign, ShoppingBag,
  Users, Shirt, ArrowUpRight, ArrowDownRight, Download,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';

const RANGE_OPTIONS = [
  { key: '7d', label: '7 ימים' },
  { key: '30d', label: '30 יום' },
  { key: '90d', label: '3 חודשים' },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

export default function ReportsPage() {
  const [range, setRange] = useState('30d');

  const { data: dashboard, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data.data),
    staleTime: 60_000,
  });

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ['orders-report', range],
    queryFn: () => api.get('/orders', { params: { limit: 500 } }).then(r => r.data.data),
    staleTime: 60_000,
  });

  const isLoading = loadingDash || loadingOrders;

  // Process data for charts
  const orderList = orders?.orders ?? [];
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const now = new Date();

  // Revenue by day
  const revenueByDay: Record<string, number> = {};
  const ordersByDay: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
    revenueByDay[key] = 0;
    ordersByDay[key] = 0;
  }

  orderList.forEach((o: any) => {
    const d = new Date(o.receivedAt);
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff < days) {
      const key = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
      revenueByDay[key] = (revenueByDay[key] || 0) + Number(o.total || 0);
      ordersByDay[key] = (ordersByDay[key] || 0) + 1;
    }
  });

  const revenueChartData = Object.entries(revenueByDay).map(([date, revenue]) => ({
    date,
    revenue: Math.round(revenue),
    orders: ordersByDay[date] || 0,
  }));

  // Status breakdown (pie)
  const statusCounts: Record<string, number> = {};
  orderList.forEach((o: any) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });
  const statusPieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status,
    value: count,
    status,
  }));

  // Top services
  const serviceCounts: Record<string, { name: string; count: number; revenue: number }> = {};
  orderList.forEach((o: any) => {
    (o.items || []).forEach((item: any) => {
      const name = item.service?.name || item.description || 'אחר';
      if (!serviceCounts[name]) serviceCounts[name] = { name, count: 0, revenue: 0 };
      serviceCounts[name].count += item.quantity || 1;
      serviceCounts[name].revenue += Number(item.lineTotal || 0);
    });
  });
  const topServices = Object.values(serviceCounts)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Top customers
  const customerRevenue: Record<string, { name: string; orders: number; revenue: number }> = {};
  orderList.forEach((o: any) => {
    const name = o.customer?.name || 'אורח';
    const id = o.customerId || name;
    if (!customerRevenue[id]) customerRevenue[id] = { name, orders: 0, revenue: 0 };
    customerRevenue[id].orders++;
    customerRevenue[id].revenue += Number(o.total || 0);
  });
  const topCustomers = Object.values(customerRevenue)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // KPIs
  const totalRevenue = orderList.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const avgOrderValue = orderList.length ? totalRevenue / orderList.length : 0;
  const paidOrders = orderList.filter((o: any) => o.paymentStatus === 'PAID').length;
  const unpaidRevenue = orderList
    .filter((o: any) => o.paymentStatus !== 'PAID')
    .reduce((s: number, o: any) => s + Number(o.total || 0) - Number(o.paidAmount || 0), 0);

  if (isLoading) return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>
      <div className="grid grid-cols-2 gap-6"><SkeletonCard /><SkeletonCard /></div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-600" /> דוחות וניתוחים
        </h1>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {RANGE_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setRange(opt.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  range === opt.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}>{opt.label}</button>
            ))}
          </div>
          <ExportDropdown />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportKPI icon={DollarSign} label="הכנסות בתקופה" value={`${Math.round(totalRevenue).toLocaleString()} ₪`} color="blue" />
        <ReportKPI icon={ShoppingBag} label="הזמנות" value={String(orderList.length)} subValue={`ממוצע ${Math.round(avgOrderValue)} ₪`} color="green" />
        <ReportKPI icon={TrendingUp} label="שולמו" value={`${paidOrders}/${orderList.length}`} subValue={`${orderList.length ? Math.round(paidOrders/orderList.length*100) : 0}%`} color="emerald" />
        <ReportKPI icon={Calendar} label="חוב פתוח" value={`${Math.round(unpaidRevenue).toLocaleString()} ₪`} color="red" trend="down" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">הכנסות והזמנות לפי יום</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenueChartData.slice(-Math.min(days, 30))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: any) => [
                name === 'revenue' ? `${Number(v).toLocaleString()} ₪` : v,
                name === 'revenue' ? 'הכנסות' : 'הזמנות'
              ]} />
              <Legend formatter={(v) => v === 'revenue' ? 'הכנסות' : 'הזמנות'} />
              <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Pie */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">פילוח סטטוס</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusPieData}
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              >
                {statusPieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [v, 'הזמנות']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Services */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Shirt className="w-5 h-5 text-gray-400" /> שירותים מובילים
          </h2>
          {topServices.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topServices} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ₪`, 'הכנסות']} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-sm">אין נתונים</p>}
        </div>

        {/* Top Customers */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" /> לקוחות מובילים
          </h2>
          <div className="overflow-y-auto max-h-[280px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-gray-500 border-b">
                  <th className="text-right py-2 px-2">#</th>
                  <th className="text-right py-2 px-2">לקוח</th>
                  <th className="text-right py-2 px-2">הזמנות</th>
                  <th className="text-right py-2 px-2">הכנסות</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 px-2 font-medium">{c.name}</td>
                    <td className="py-2 px-2">{c.orders}</td>
                    <td className="py-2 px-2 font-medium text-blue-600">{Math.round(c.revenue).toLocaleString()} ₪</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topCustomers.length === 0 && <p className="text-gray-400 text-sm text-center py-4">אין נתונים</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportDropdown() {
  const [open, setOpen] = useState(false);

  const downloadFile = async (endpoint: string, filename: string) => {
    try {
      const response = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // silent
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
        <Download className="w-4 h-4" /> ייצוא
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-50 py-1">
            <button onClick={() => downloadFile('/exports/orders', `orders-${new Date().toISOString().slice(0,10)}.xlsx`)}
              className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-gray-400" /> הזמנות (Excel)
            </button>
            <button onClick={() => downloadFile('/exports/customers', `customers-${new Date().toISOString().slice(0,10)}.xlsx`)}
              className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" /> לקוחות (Excel)
            </button>
            <button onClick={() => downloadFile('/exports/invoices', `invoices-${new Date().toISOString().slice(0,10)}.xlsx`)}
              className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-400" /> חשבוניות (Excel)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReportKPI({ icon: Icon, label, value, subValue, color, trend }: {
  icon: any; label: string; value: string; subValue?: string; color: string; trend?: 'up' | 'down';
}) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-gray-800">{value}</span>
        {subValue && (
          <span className="text-sm text-gray-400 mb-0.5 flex items-center gap-0.5">
            {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5 text-green-500" />}
            {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
}
