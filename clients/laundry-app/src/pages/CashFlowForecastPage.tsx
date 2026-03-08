import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { SkeletonCard } from '../components/Skeleton';
import {
  TrendingUp, Calendar, DollarSign, Download, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';

const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('he-IL');

type Granularity = 'daily' | 'weekly' | 'monthly';

export default function CashFlowForecastPage() {
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const [openingBalance, setOpeningBalance] = useState('0');

  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ['cf-forecast-daily', openingBalance],
    queryFn: () => api.get('/cash-flow/forecast', { params: { days: 90, openingBalance: parseFloat(openingBalance) || 0 } }).then(r => r.data.data),
    enabled: granularity === 'daily',
  });

  const { data: weekly, isLoading: loadingWeekly } = useQuery({
    queryKey: ['cf-forecast-weekly', openingBalance],
    queryFn: () => api.get('/cash-flow/weekly', { params: { weeks: 12 } }).then(r => r.data.data),
    enabled: granularity === 'weekly',
  });

  const { data: monthly, isLoading: loadingMonthly } = useQuery({
    queryKey: ['cf-forecast-monthly', openingBalance],
    queryFn: () => api.get('/cash-flow/monthly', { params: { months: 6 } }).then(r => r.data.data),
    enabled: granularity === 'monthly',
  });

  const isLoading = (granularity === 'daily' && loadingDaily) || (granularity === 'weekly' && loadingWeekly) || (granularity === 'monthly' && loadingMonthly);

  const rawData = granularity === 'daily' ? daily : granularity === 'weekly' ? weekly : monthly;
  const forecast = Array.isArray(rawData?.periods ?? rawData) ? (rawData?.periods ?? rawData ?? []) : [];

  // Compute KPIs
  const lastPeriod = forecast[forecast.length - 1];
  const endBalance = lastPeriod?.closingBalance ?? lastPeriod?.balance ?? 0;
  const totalInflows = forecast.reduce((s: number, p: any) => s + Number(p.inflows ?? p.totalInflows ?? 0), 0);
  const totalOutflows = forecast.reduce((s: number, p: any) => s + Number(p.outflows ?? p.totalOutflows ?? 0), 0);
  const lowestBalance = forecast.reduce((min: number, p: any) => Math.min(min, Number(p.closingBalance ?? p.balance ?? 0)), Infinity);

  // Chart data
  const chartData = forecast.map((p: any) => ({
    label: p.date ?? p.weekStart ?? p.month ?? p.label ?? '',
    inflows: Math.round(Number(p.inflows ?? p.totalInflows ?? 0)),
    outflows: Math.round(Number(p.outflows ?? p.totalOutflows ?? 0)),
    balance: Math.round(Number(p.closingBalance ?? p.balance ?? 0)),
  }));

  const exportXlsx = async () => {
    try {
      const response = await api.get('/cash-flow/forecast', {
        params: { days: 90, openingBalance: parseFloat(openingBalance) || 0, format: 'xlsx' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cash-flow-forecast-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // silent fail
    }
  };

  if (isLoading) return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>
      <SkeletonCard />
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <TrendingUp className="w-7 h-7 text-blue-600" /> תחזית תזרים מזומנים
        </h1>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">יתרת פתיחה:</label>
            <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
              className="w-28 px-2 py-1.5 border rounded-lg text-sm" />
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {([['daily', 'יומי'], ['weekly', 'שבועי'], ['monthly', 'חודשי']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setGranularity(key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  granularity === key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}>{label}</button>
            ))}
          </div>
          <button onClick={exportXlsx}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">יתרה צפויה</span>
          </div>
          <div className="text-2xl font-bold text-gray-800">{fmt(endBalance)} ₪</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">סה״כ כניסות</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{fmt(totalInflows)} ₪</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm text-gray-500">סה״כ יציאות</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{fmt(totalOutflows)} ₪</div>
        </div>
        <div className={`bg-white rounded-xl shadow-sm border p-5 ${lowestBalance < 0 ? 'border-red-300' : ''}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${lowestBalance < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
              <Calendar className={`w-5 h-5 ${lowestBalance < 0 ? 'text-red-600' : 'text-blue-600'}`} />
            </div>
            <span className="text-sm text-gray-500">יתרה מינימלית</span>
          </div>
          <div className={`text-2xl font-bold ${lowestBalance < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(lowestBalance === Infinity ? 0 : lowestBalance)} ₪</div>
        </div>
      </div>

      {/* Balance Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">יתרה צפויה לאורך זמן</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: any) => [
                `${Number(v).toLocaleString()} ₪`,
                name === 'balance' ? 'יתרה' : name === 'inflows' ? 'כניסות' : 'יציאות'
              ]} />
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#balanceGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Inflow/Outflow Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">כניסות מול יציאות</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: any) => [
                `${Number(v).toLocaleString()} ₪`,
                name === 'inflows' ? 'כניסות' : 'יציאות'
              ]} />
              <Legend formatter={(v) => v === 'inflows' ? 'כניסות' : 'יציאות'} />
              <Bar dataKey="inflows" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflows" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Table */}
      {forecast.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-700">פירוט תקופות ({forecast.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right px-4 py-2">תקופה</th>
                  <th className="text-right px-4 py-2">כניסות</th>
                  <th className="text-right px-4 py-2">יציאות</th>
                  <th className="text-right px-4 py-2">נטו</th>
                  <th className="text-right px-4 py-2">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((p: any, i: number) => {
                  const inflow = Number(p.inflows ?? p.totalInflows ?? 0);
                  const outflow = Number(p.outflows ?? p.totalOutflows ?? 0);
                  const net = inflow - outflow;
                  const balance = Number(p.closingBalance ?? p.balance ?? 0);
                  return (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2">{p.date ?? p.weekStart ?? p.month ?? p.label}</td>
                      <td className="px-4 py-2 text-green-600">{fmt(inflow)} ₪</td>
                      <td className="px-4 py-2 text-red-600">{fmt(outflow)} ₪</td>
                      <td className={`px-4 py-2 font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(net)} ₪</td>
                      <td className={`px-4 py-2 font-bold ${balance < 0 ? 'text-red-600' : ''}`}>{fmt(balance)} ₪</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {forecast.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">אין נתוני תחזית</p>
        </div>
      )}
    </div>
  );
}
