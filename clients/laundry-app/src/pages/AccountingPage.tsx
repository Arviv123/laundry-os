import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  BookOpen, TrendingUp, TrendingDown, Scale, FileText, DollarSign,
  Plus, X, ChevronLeft, Coins, ReceiptText, Landmark, ClipboardList,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────
type Tab = 'trial-balance' | 'pl' | 'balance-sheet' | 'vat' | 'cash-flow' | 'accounts';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'trial-balance', label: 'מאזן בוחן', icon: Scale },
  { key: 'pl', label: 'רווח והפסד', icon: TrendingUp },
  { key: 'balance-sheet', label: 'מאזן', icon: Landmark },
  { key: 'vat', label: 'דוח מע״מ', icon: ReceiptText },
  { key: 'cash-flow', label: 'מזומנים', icon: Coins },
  { key: 'accounts', label: 'חשבונות', icon: ClipboardList },
];

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'נכס' },
  { value: 'LIABILITY', label: 'התחייבות' },
  { value: 'EQUITY', label: 'הון עצמי' },
  { value: 'REVENUE', label: 'הכנסה' },
  { value: 'EXPENSE', label: 'הוצאה' },
];

const TYPE_COLORS: Record<string, string> = {
  ASSET: 'bg-blue-100 text-blue-700',
  LIABILITY: 'bg-orange-100 text-orange-700',
  EQUITY: 'bg-purple-100 text-purple-700',
  REVENUE: 'bg-green-100 text-green-700',
  EXPENSE: 'bg-red-100 text-red-700',
};

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'נכס', LIABILITY: 'התחייבות', EQUITY: 'הון', REVENUE: 'הכנסה', EXPENSE: 'הוצאה',
};

// ─── Helpers ──────────────────────────────────────────────────────
const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('he-IL');
const today = () => new Date().toISOString().split('T')[0];
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const currentMonth = () => new Date().toISOString().slice(0, 7);

// ─── Main Component ──────────────────────────────────────────────
export default function AccountingPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('trial-balance');
  const [period, setPeriod] = useState<'month' | 'year'>('year');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);

  // ─── Date ranges based on period selector ──────────────────────
  const dateRange = useMemo(() => {
    const now = new Date();
    const from = period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      : startOfYear();
    return { from, to: today() };
  }, [period]);

  // ─── Queries ───────────────────────────────────────────────────
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data.data),
  });

  const { data: trialBalance, isLoading: loadingTB } = useQuery({
    queryKey: ['trial-balance', dateRange],
    queryFn: () => api.get('/accounting/trial-balance', { params: dateRange }).then(r => r.data.data),
    enabled: activeTab === 'trial-balance',
  });

  const { data: pl, isLoading: loadingPL } = useQuery({
    queryKey: ['pl', dateRange],
    queryFn: () => api.get('/accounting/reports/pl', { params: dateRange }).then(r => r.data.data),
    enabled: activeTab === 'pl',
  });

  const { data: balanceSheet, isLoading: loadingBS } = useQuery({
    queryKey: ['balance-sheet'],
    queryFn: () => api.get('/accounting/reports/balance-sheet', { params: { asOf: today() } }).then(r => r.data.data),
    enabled: activeTab === 'balance-sheet',
  });

  const { data: vat, isLoading: loadingVat } = useQuery({
    queryKey: ['vat', currentMonth()],
    queryFn: () => api.get('/accounting/reports/vat', { params: { period: currentMonth() } }).then(r => r.data.data),
    enabled: activeTab === 'vat',
  });

  const { data: cashFlow, isLoading: loadingCF } = useQuery({
    queryKey: ['cash-flow', dateRange],
    queryFn: () => api.get('/accounting/reports/cash-flow', { params: dateRange }).then(r => r.data.data),
    enabled: activeTab === 'cash-flow',
  });

  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['ledger', ledgerAccountId, dateRange],
    queryFn: () => api.get(`/accounting/accounts/${ledgerAccountId}/ledger`, { params: dateRange }).then(r => r.data.data),
    enabled: !!ledgerAccountId,
  });

  // ─── KPI from P&L quick query (always) ────────────────────────
  const { data: plKpi } = useQuery({
    queryKey: ['pl-kpi', dateRange],
    queryFn: () => api.get('/accounting/reports/pl', { params: dateRange }).then(r => r.data.data),
  });
  const totalRevenue = plKpi?.totalRevenue ?? plKpi?.revenue?.total ?? 0;
  const totalExpenses = plKpi?.totalExpenses ?? plKpi?.expenses?.total ?? 0;
  const netIncome = plKpi?.netIncome ?? (totalRevenue - totalExpenses);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-blue-600" /> הנהלת חשבונות
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowJournalModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> פקודת יומן
          </button>
          {[{ v: 'month' as const, l: 'חודש נוכחי' }, { v: 'year' as const, l: 'שנה נוכחית' }].map(p => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'הכנסות', value: totalRevenue, color: 'green', icon: TrendingUp },
          { label: 'הוצאות', value: totalExpenses, color: 'red', icon: TrendingDown },
          { label: 'רווח נקי', value: netIncome, color: netIncome >= 0 ? 'green' : 'red', icon: Scale },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 bg-${kpi.color}-100 rounded-lg flex items-center justify-center`}>
                <kpi.icon className={`w-5 h-5 text-${kpi.color}-600`} />
              </div>
              <span className="text-sm text-gray-500">{kpi.label}</span>
            </div>
            <div className={`text-2xl font-bold text-${kpi.color}-600`}>{fmt(kpi.value)} ₪</div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setLedgerAccountId(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Ledger View (overlay on any tab) */}
      {ledgerAccountId && (
        <LedgerView
          data={ledgerData}
          loading={loadingLedger}
          onClose={() => setLedgerAccountId(null)}
        />
      )}

      {/* Tab Content */}
      {!ledgerAccountId && (
        <>
          {activeTab === 'trial-balance' && (
            <TrialBalanceTab data={trialBalance} loading={loadingTB} onAccountClick={setLedgerAccountId} />
          )}
          {activeTab === 'pl' && <PLTab data={pl} loading={loadingPL} />}
          {activeTab === 'balance-sheet' && <BalanceSheetTab data={balanceSheet} loading={loadingBS} />}
          {activeTab === 'vat' && <VatTab data={vat} loading={loadingVat} />}
          {activeTab === 'cash-flow' && <CashFlowTab data={cashFlow} loading={loadingCF} />}
          {activeTab === 'accounts' && (
            <AccountsTab
              accounts={accounts ?? []}
              onCreateClick={() => setShowAccountModal(true)}
              onAccountClick={setLedgerAccountId}
            />
          )}
        </>
      )}

      {/* Modals */}
      {showAccountModal && (
        <CreateAccountModal
          accounts={accounts ?? []}
          onClose={() => setShowAccountModal(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setShowAccountModal(false);
            addToast('חשבון נוצר בהצלחה');
          }}
        />
      )}
      {showJournalModal && (
        <JournalEntryModal
          accounts={accounts ?? []}
          onClose={() => setShowJournalModal(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
            queryClient.invalidateQueries({ queryKey: ['pl'] });
            queryClient.invalidateQueries({ queryKey: ['pl-kpi'] });
            setShowJournalModal(false);
            addToast('פקודת יומן נוצרה בהצלחה');
          }}
        />
      )}
    </div>
  );
}

// ─── Loading Placeholder ──────────────────────────────────────────
function Loading() {
  return <p className="text-center text-gray-400 py-8">טוען...</p>;
}

// ─── Trial Balance Tab ────────────────────────────────────────────
function TrialBalanceTab({ data, loading, onAccountClick }: { data: any; loading: boolean; onAccountClick: (id: string) => void }) {
  if (loading) return <Loading />;
  const rows = data?.accounts ?? data ?? [];
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700">מאזן בוחן</h2>
        <span className="text-xs text-gray-400">{rows.length} חשבונות</span>
      </div>
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
            {rows.map((acc: any) => (
              <tr key={acc.code || acc.id} className="border-t hover:bg-blue-50 cursor-pointer"
                onClick={() => acc.id && onAccountClick(acc.id)}>
                <td className="px-4 py-2 font-mono text-blue-600">{acc.code}</td>
                <td className="px-4 py-2">{acc.name}</td>
                <td className="px-4 py-2">{fmt(acc.debit ?? acc.totalDebits)}</td>
                <td className="px-4 py-2">{fmt(acc.credit ?? acc.totalCredits)}</td>
                <td className="px-4 py-2 font-medium">{fmt(acc.balance ?? acc.closingBalance)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">אין נתונים</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── P&L Tab ──────────────────────────────────────────────────────
function PLTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return <p className="text-center text-gray-400 py-8">אין נתונים</p>;
  const revenueItems = data.revenue?.items ?? data.revenue ?? [];
  const expenseItems = data.expenses?.items ?? data.expenses ?? [];
  const totalRev = data.totalRevenue ?? data.revenue?.total ?? 0;
  const totalExp = data.totalExpenses ?? data.expenses?.total ?? 0;
  const net = data.netIncome ?? (totalRev - totalExp);
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-700">דוח רווח והפסד</h2>
      </div>
      <div className="p-5 space-y-4">
        <Section title="הכנסות" items={revenueItems} total={totalRev} color="green" />
        <Section title="הוצאות" items={expenseItems} total={totalExp} color="red" />
        <div className="border-t-2 border-gray-300 pt-3 flex justify-between text-lg font-bold">
          <span>רווח נקי</span>
          <span className={net >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(net)} ₪</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, total, color }: { title: string; items: any[]; total: number; color: string }) {
  return (
    <div>
      <h3 className={`font-semibold text-${color}-700 mb-2`}>{title}</h3>
      {Array.isArray(items) && items.map((item: any, i: number) => (
        <div key={i} className="flex justify-between py-1 px-2 text-sm hover:bg-gray-50 rounded">
          <span className="text-gray-600">{item.name ?? item.code}</span>
          <span>{fmt(item.total ?? item.balance ?? item.amount)} ₪</span>
        </div>
      ))}
      <div className={`flex justify-between py-1 px-2 font-semibold text-${color}-600 border-t mt-1`}>
        <span>סה״כ {title}</span>
        <span>{fmt(total)} ₪</span>
      </div>
    </div>
  );
}

// ─── Balance Sheet Tab ────────────────────────────────────────────
function BalanceSheetTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return <p className="text-center text-gray-400 py-8">אין נתונים</p>;
  const assets = data.assets?.items ?? data.assets ?? [];
  const liabilities = data.liabilities?.items ?? data.liabilities ?? [];
  const equity = data.equity?.items ?? data.equity ?? [];
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-700">מאזן</h2>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <BSSection title="נכסים" items={assets} total={data.totalAssets ?? data.assets?.total} color="blue" />
        </div>
        <div className="space-y-4">
          <BSSection title="התחייבויות" items={liabilities} total={data.totalLiabilities ?? data.liabilities?.total} color="orange" />
          <BSSection title="הון עצמי" items={equity} total={data.totalEquity ?? data.equity?.total} color="purple" />
        </div>
      </div>
    </div>
  );
}

function BSSection({ title, items, total, color }: { title: string; items: any[]; total: number; color: string }) {
  return (
    <div>
      <h3 className={`font-semibold text-${color}-700 mb-2 text-base`}>{title}</h3>
      {Array.isArray(items) && items.map((item: any, i: number) => (
        <div key={i} className="flex justify-between py-1 px-2 text-sm hover:bg-gray-50 rounded">
          <span className="text-gray-600">{item.name ?? item.code}</span>
          <span>{fmt(item.total ?? item.balance)} ₪</span>
        </div>
      ))}
      <div className={`flex justify-between py-1 px-2 font-semibold text-${color}-600 border-t mt-1`}>
        <span>סה״כ</span>
        <span>{fmt(total)} ₪</span>
      </div>
    </div>
  );
}

// ─── VAT Tab ──────────────────────────────────────────────────────
function VatTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return <p className="text-center text-gray-400 py-8">אין נתונים</p>;
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-700">דוח מע״מ — {data.period ?? currentMonth()}</h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label='מע״מ עסקאות (חייב)' value={data.outputVat ?? data.salesVat ?? 0} color="red" />
          <KpiCard label='מע״מ תשומות (ניכוי)' value={data.inputVat ?? data.purchaseVat ?? 0} color="green" />
          <KpiCard label='לתשלום / להחזר' value={data.netVat ?? data.vatPayable ?? 0}
            color={(data.netVat ?? data.vatPayable ?? 0) > 0 ? 'red' : 'green'} />
        </div>
        {data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right px-4 py-2">תאריך</th>
                  <th className="text-right px-4 py-2">תיאור</th>
                  <th className="text-right px-4 py-2">סכום לפני מע״מ</th>
                  <th className="text-right px-4 py-2">מע״מ</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t: any, i: number) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{t.date ? new Date(t.date).toLocaleDateString('he-IL') : '-'}</td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2">{fmt(t.amount)} ₪</td>
                    <td className="px-4 py-2">{fmt(t.vat)} ₪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold text-${color}-600`}>{fmt(value)} ₪</div>
    </div>
  );
}

// ─── Cash Flow Tab ────────────────────────────────────────────────
function CashFlowTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return <p className="text-center text-gray-400 py-8">אין נתונים</p>;
  const sections = [
    { key: 'operating', title: 'פעילות שוטפת', color: 'blue' },
    { key: 'investing', title: 'פעילות השקעה', color: 'purple' },
    { key: 'financing', title: 'פעילות מימון', color: 'orange' },
  ];
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-700">דוח תזרים מזומנים</h2>
      </div>
      <div className="p-5 space-y-4">
        {sections.map(s => {
          const sectionData = data[s.key];
          if (!sectionData) return null;
          const items = sectionData.items ?? sectionData ?? [];
          const total = sectionData.total ?? 0;
          return (
            <div key={s.key}>
              <h3 className={`font-semibold text-${s.color}-700 mb-2`}>{s.title}</h3>
              {Array.isArray(items) && items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between py-1 px-2 text-sm hover:bg-gray-50 rounded">
                  <span className="text-gray-600">{item.name ?? item.description}</span>
                  <span>{fmt(item.amount ?? item.total)} ₪</span>
                </div>
              ))}
              <div className={`flex justify-between py-1 px-2 font-semibold text-${s.color}-600 border-t mt-1`}>
                <span>סה״כ {s.title}</span>
                <span>{fmt(total)} ₪</span>
              </div>
            </div>
          );
        })}
        {data.netChange !== undefined && (
          <div className="border-t-2 border-gray-300 pt-3 flex justify-between text-lg font-bold">
            <span>שינוי נקי במזומנים</span>
            <span className={data.netChange >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(data.netChange)} ₪</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Accounts Tab ─────────────────────────────────────────────────
function AccountsTab({ accounts, onCreateClick, onAccountClick }: {
  accounts: any[]; onCreateClick: () => void; onAccountClick: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const filtered = accounts.filter((a: any) =>
    !filter || a.type === filter
  );
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700">תרשים חשבונות ({accounts.length})</h2>
        <button onClick={onCreateClick}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> חשבון חדש
        </button>
      </div>
      <div className="px-5 py-3 flex gap-1 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!filter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          הכל
        </button>
        {ACCOUNT_TYPES.map(t => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-right px-4 py-2">קוד</th>
              <th className="text-right px-4 py-2">שם חשבון</th>
              <th className="text-right px-4 py-2">סוג</th>
              <th className="text-right px-4 py-2">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((acc: any) => (
              <tr key={acc.id} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => onAccountClick(acc.id)}>
                <td className="px-4 py-2 font-mono text-blue-600">{acc.code}</td>
                <td className="px-4 py-2">{acc.name}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[acc.type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {TYPE_LABELS[acc.type] ?? acc.type}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button className="text-blue-600 hover:underline text-xs"
                    onClick={(e) => { e.stopPropagation(); onAccountClick(acc.id); }}>
                    כרטסת
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">אין חשבונות</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ledger View ──────────────────────────────────────────────────
function LedgerView({ data, loading, onClose }: { data: any; loading: boolean; onClose: () => void }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-5 py-4 border-b bg-blue-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 hover:bg-blue-100 rounded">
            <ChevronLeft className="w-5 h-5 text-blue-600" />
          </button>
          <h2 className="font-semibold text-blue-800">
            כרטסת: {data?.account?.code} — {data?.account?.name}
          </h2>
        </div>
        {data && (
          <div className="text-sm text-blue-600">
            יתרת פתיחה: {fmt(data.openingBalance)} ₪ | יתרת סגירה: {fmt(data.closingBalance)} ₪
          </div>
        )}
      </div>
      {loading ? <Loading /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-right px-4 py-2">תאריך</th>
                <th className="text-right px-4 py-2">אסמכתא</th>
                <th className="text-right px-4 py-2">תיאור</th>
                <th className="text-right px-4 py-2">חובה</th>
                <th className="text-right px-4 py-2">זכות</th>
                <th className="text-right px-4 py-2">יתרה</th>
              </tr>
            </thead>
            <tbody>
              {(data?.lines ?? []).map((line: any) => (
                <tr key={line.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{line.date ? new Date(line.date).toLocaleDateString('he-IL') : '-'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{line.reference}</td>
                  <td className="px-4 py-2">{line.description}</td>
                  <td className="px-4 py-2 text-red-600">{line.debit ? fmt(line.debit) : ''}</td>
                  <td className="px-4 py-2 text-green-600">{line.credit ? fmt(line.credit) : ''}</td>
                  <td className="px-4 py-2 font-medium">{fmt(line.balance)}</td>
                </tr>
              ))}
              {(data?.lines ?? []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">אין תנועות בתקופה</td></tr>
              )}
            </tbody>
          </table>
          {data && (
            <div className="px-5 py-3 bg-gray-50 border-t flex gap-6 text-sm">
              <span>סה״כ חובה: <b className="text-red-600">{fmt(data.periodDebits)} ₪</b></span>
              <span>סה״כ זכות: <b className="text-green-600">{fmt(data.periodCredits)} ₪</b></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Account Modal ─────────────────────────────────────────
function CreateAccountModal({ accounts, onClose, onCreated }: {
  accounts: any[]; onClose: () => void; onCreated: () => void;
}) {
  const { addToast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('ASSET');
  const [parentId, setParentId] = useState('');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/accounting/accounts', data),
    onSuccess: () => onCreated(),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ביצירת חשבון', 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) { addToast('נא למלא קוד ושם', 'error'); return; }
    mutation.mutate({ code, name, type, parentId: parentId || undefined });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-lg">חשבון חדש</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">קוד חשבון</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="1010"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם חשבון</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="קופה ראשית"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוג</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
              {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">חשבון אב (אופציונלי)</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
              <option value="">ללא</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={mutation.isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
            {mutation.isPending ? 'יוצר...' : 'צור חשבון'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Journal Entry Modal ──────────────────────────────────────────
interface JournalLine {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  description: string;
}

function JournalEntryModal({ accounts, onClose, onCreated }: {
  accounts: any[]; onClose: () => void; onCreated: () => void;
}) {
  const { addToast } = useToast();
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { debitAccountId: '', creditAccountId: '', amount: '', description: '' },
  ]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/accounting/transactions', data),
    onSuccess: () => onCreated(),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ביצירת פקודה', 'error'),
  });

  const updateLine = (idx: number, field: keyof JournalLine, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, { debitAccountId: '', creditAccountId: '', amount: '', description: '' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !reference || !description) {
      addToast('נא למלא תאריך, אסמכתא ותיאור', 'error'); return;
    }
    const validLines = lines.filter(l => l.debitAccountId && l.creditAccountId && parseFloat(l.amount) > 0);
    if (validLines.length === 0) {
      addToast('נא להוסיף לפחות שורה אחת תקינה', 'error'); return;
    }
    for (const l of validLines) {
      if (l.debitAccountId === l.creditAccountId) {
        addToast('חשבון חובה וזכות לא יכולים להיות זהים', 'error'); return;
      }
    }

    mutation.mutate({
      date: new Date(date).toISOString(),
      reference,
      description,
      sourceType: 'MANUAL',
      lines: validLines.map(l => ({
        debitAccountId: l.debitAccountId,
        creditAccountId: l.creditAccountId,
        amount: parseFloat(l.amount),
        description: l.description || undefined,
      })),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-lg">פקודת יומן חדשה</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אסמכתא</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="JV-001"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור הפקודה"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">שורות</label>
              <button type="button" onClick={addLine}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                <Plus className="w-3.5 h-3.5" /> הוסף שורה
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 rounded-lg p-3">
                  <div className="col-span-4">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">חשבון חובה</label>}
                    <select value={line.debitAccountId} onChange={e => updateLine(idx, 'debitAccountId', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
                      <option value="">בחר חשבון...</option>
                      {accounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">חשבון זכות</label>}
                    <select value={line.creditAccountId} onChange={e => updateLine(idx, 'creditAccountId', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
                      <option value="">בחר חשבון...</option>
                      {accounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">סכום</label>}
                    <input type="number" step="0.01" min="0" value={line.amount}
                      onChange={e => updateLine(idx, 'amount', e.target.value)} placeholder="0.00"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-left text-sm font-medium text-gray-600">
              סה״כ: <span className="text-blue-700">{fmt(totalAmount)} ₪</span>
            </div>
          </div>

          <button type="submit" disabled={mutation.isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
            {mutation.isPending ? 'יוצר...' : 'צור פקודת יומן'}
          </button>
        </form>
      </div>
    </div>
  );
}
