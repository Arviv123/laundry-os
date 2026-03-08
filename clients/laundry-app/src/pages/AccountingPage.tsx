import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { BookOpen, TrendingUp, TrendingDown, Scale, FileText, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AccountingPage() {
  const [period, setPeriod] = useState('month');

  const { data: trialBalance, isLoading: loadingTB } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: () => api.get('/accounting/trial-balance').then(r => r.data.data),
  });

  const { data: pl } = useQuery({
    queryKey: ['pl', period],
    queryFn: () => {
      const now = new Date();
      const startDate = period === 'month'
        ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        : new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];
      return api.get('/accounting/reports/profit-loss', { params: { startDate, endDate } }).then(r => r.data.data);
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data.data),
  });

  const totalRevenue = pl?.totalRevenue ?? pl?.revenue?.total ?? 0;
  const totalExpenses = pl?.totalExpenses ?? pl?.expenses?.total ?? 0;
  const netIncome = pl?.netIncome ?? (totalRevenue - totalExpenses);

  const quickLinks = [
    { path: '/accounting/transactions', label: 'יומן תנועות', icon: FileText, color: 'bg-blue-50 text-blue-600' },
    { path: '/accounting/trial-balance', label: 'מאזן בוחן', icon: Scale, color: 'bg-purple-50 text-purple-600' },
    { path: '/accounting/pl', label: 'רווח והפסד', icon: TrendingUp, color: 'bg-green-50 text-green-600' },
    { path: '/accounting/balance-sheet', label: 'מאזן', icon: DollarSign, color: 'bg-orange-50 text-orange-600' },
    { path: '/accounting/vat', label: 'דוח מע"מ', icon: FileText, color: 'bg-red-50 text-red-600' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-blue-600" /> הנהלת חשבונות
        </h1>
        <div className="flex gap-2">
          {[{ v: 'month', l: 'חודש נוכחי' }, { v: 'year', l: 'שנה נוכחית' }].map(p => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">הכנסות</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{Number(totalRevenue).toLocaleString()} ₪</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm text-gray-500">הוצאות</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{Number(totalExpenses).toLocaleString()} ₪</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Scale className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">רווח נקי</span>
          </div>
          <div className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {Number(netIncome).toLocaleString()} ₪
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {quickLinks.map(link => (
          <Link key={link.path} to={link.path}
            className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow text-center">
            <div className={`w-12 h-12 rounded-xl mx-auto mb-2 flex items-center justify-center ${link.color}`}>
              <link.icon className="w-6 h-6" />
            </div>
            <div className="text-sm font-medium text-gray-700">{link.label}</div>
          </Link>
        ))}
      </div>

      {/* Trial Balance Preview */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-700 mb-4">מאזן בוחן — תקציר</h2>
        {loadingTB ? <p className="text-gray-400">טוען...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right px-4 py-2">קוד</th>
                  <th className="text-right px-4 py-2">שם חשבון</th>
                  <th className="text-right px-4 py-2">חובה</th>
                  <th className="text-right px-4 py-2">זכות</th>
                  <th className="text-right px-4 py-2">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {(trialBalance?.accounts ?? trialBalance ?? []).slice(0, 10).map((acc: any) => (
                  <tr key={acc.code || acc.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-blue-600">{acc.code}</td>
                    <td className="px-4 py-2">{acc.name}</td>
                    <td className="px-4 py-2">{Number(acc.debit ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-2">{Number(acc.credit ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-2 font-medium">{Number(acc.balance ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(trialBalance?.accounts ?? trialBalance ?? []).length > 10 && (
              <Link to="/accounting/trial-balance" className="text-blue-600 text-sm hover:underline block mt-3 text-center">
                הצג הכל →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Chart of Accounts */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-700 mb-4">תרשים חשבונות ({accounts?.length ?? 0})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {(accounts ?? []).map((acc: any) => (
            <div key={acc.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{acc.code}</span>
                <span className="text-gray-700">{acc.name}</span>
              </div>
              <span className="text-xs text-gray-400">{acc.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
