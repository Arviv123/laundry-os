import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Award, Star, Gift, Search, Plus, TrendingUp,
  Users, Crown, ChevronDown, X, Coins,
} from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  STANDARD: 'רגיל',
  SILVER: 'כסף',
  GOLD: 'זהב',
  PLATINUM: 'פלטינה',
};

const TIER_COLORS: Record<string, string> = {
  STANDARD: 'bg-gray-100 text-gray-700',
  SILVER: 'bg-gray-200 text-gray-800',
  GOLD: 'bg-yellow-100 text-yellow-800',
  PLATINUM: 'bg-purple-100 text-purple-800',
};

const TIER_ICONS: Record<string, string> = {
  STANDARD: '⭐',
  SILVER: '🥈',
  GOLD: '🥇',
  PLATINUM: '💎',
};

export default function LoyaltyPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showEarnModal, setShowEarnModal] = useState(false);
  const [earnAmount, setEarnAmount] = useState('');
  const [earnReason, setEarnReason] = useState('purchase');

  // Get loyalty program settings
  const { data: program } = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => api.get('/pos/loyalty/program').then(r => r.data.data).catch(() => null),
  });

  // Search customers
  const { data: customers } = useQuery({
    queryKey: ['customers-loyalty', search],
    queryFn: () => api.get('/crm/customers', { params: { search: search || undefined, limit: 20 } })
      .then(r => Array.isArray(r.data.data) ? r.data.data : r.data.data?.customers ?? []),
    enabled: true,
  });

  // Get loyalty account for selected customer
  const { data: loyaltyAccount } = useQuery({
    queryKey: ['loyalty-account', selectedCustomer?.id],
    queryFn: () => api.get(`/pos/loyalty/customers/${selectedCustomer.id}`).then(r => r.data.data).catch(() => null),
    enabled: !!selectedCustomer?.id,
  });

  // Get loyalty history for selected customer
  const { data: loyaltyHistory } = useQuery({
    queryKey: ['loyalty-history', selectedCustomer?.id],
    queryFn: () => api.get(`/pos/loyalty/customers/${selectedCustomer.id}/history`).then(r => r.data.data).catch(() => []),
    enabled: !!selectedCustomer?.id,
  });

  const earnMutation = useMutation({
    mutationFn: (data: { points: number; reason: string }) =>
      api.post(`/pos/loyalty/customers/${selectedCustomer.id}/earn`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-account', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-history', selectedCustomer?.id] });
      setShowEarnModal(false);
      setEarnAmount('');
      addToast('נקודות נוספו בהצלחה');
    },
    onError: () => addToast('שגיאה בהוספת נקודות', 'error'),
  });

  const redeemMutation = useMutation({
    mutationFn: (data: { points: number }) =>
      api.post(`/pos/loyalty/customers/${selectedCustomer.id}/redeem`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-account', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-history', selectedCustomer?.id] });
      addToast('נקודות מומשו בהצלחה');
    },
    onError: () => addToast('שגיאה במימוש נקודות', 'error'),
  });

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Award className="w-7 h-7 text-yellow-500" /> מועדון לקוחות
      </h1>

      {/* Program Info */}
      {program && (
        <div className="bg-gradient-to-l from-yellow-50 to-amber-50 rounded-xl border border-yellow-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <Crown className="w-6 h-6 text-yellow-600" />
            <h2 className="font-bold text-gray-800">{program.name || 'תוכנית נאמנות'}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block">נקודה לכל</span>
              <span className="font-bold">{program.pointsPerCurrency || 1} ₪</span>
            </div>
            <div>
              <span className="text-gray-500 block">שווי נקודה</span>
              <span className="font-bold">{program.currencyPerPoint || 0.1} ₪</span>
            </div>
            <div>
              <span className="text-gray-500 block">מינימום למימוש</span>
              <span className="font-bold">{program.minRedeemPoints || 100} נקודות</span>
            </div>
            <div>
              <span className="text-gray-500 block">תוקף נקודות</span>
              <span className="font-bold">{program.expiryMonths ? `${program.expiryMonths} חודשים` : 'ללא תוקף'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="חפש לקוח..."
                className="w-full pr-10 pl-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {(customers ?? []).map((c: any) => (
              <button key={c.id} onClick={() => setSelectedCustomer(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-right border-b hover:bg-gray-50 transition-colors ${
                  selectedCustomer?.id === c.id ? 'bg-blue-50' : ''
                }`}>
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="text-xs text-gray-400">{c.phone || c.email || ''}</div>
                </div>
              </button>
            ))}
            {customers?.length === 0 && <p className="p-4 text-center text-gray-400 text-sm">אין תוצאות</p>}
          </div>
        </div>

        {/* Customer Loyalty Details */}
        <div className="lg:col-span-2 space-y-4">
          {selectedCustomer ? (
            <>
              {/* Balance Card */}
              <div className="bg-gradient-to-l from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold">{selectedCustomer.name}</h3>
                    <p className="text-blue-200 text-sm">{selectedCustomer.phone}</p>
                  </div>
                  {loyaltyAccount?.tier && (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      loyaltyAccount.tier === 'PLATINUM' ? 'bg-purple-200 text-purple-900' :
                      loyaltyAccount.tier === 'GOLD' ? 'bg-yellow-200 text-yellow-900' :
                      loyaltyAccount.tier === 'SILVER' ? 'bg-gray-200 text-gray-900' :
                      'bg-white/20 text-white'
                    }`}>
                      {TIER_ICONS[loyaltyAccount.tier]} {TIER_LABELS[loyaltyAccount.tier] || loyaltyAccount.tier}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-blue-200 text-xs">יתרת נקודות</div>
                    <div className="text-3xl font-bold">{loyaltyAccount?.balance ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-blue-200 text-xs">נקודות שצברת</div>
                    <div className="text-xl font-bold">{loyaltyAccount?.lifetimePoints ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-blue-200 text-xs">שווי</div>
                    <div className="text-xl font-bold">{((loyaltyAccount?.balance ?? 0) * (program?.currencyPerPoint || 0.1)).toFixed(0)} ₪</div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setEarnAmount(''); setShowEarnModal(true); }}
                    className="flex-1 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium flex items-center justify-center gap-1">
                    <Plus className="w-4 h-4" /> הוסף נקודות
                  </button>
                  <button onClick={() => {
                    const pts = prompt('כמה נקודות למימוש?');
                    if (pts && Number(pts) > 0) redeemMutation.mutate({ points: Number(pts) });
                  }}
                    disabled={!loyaltyAccount?.balance}
                    className="flex-1 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1">
                    <Gift className="w-4 h-4" /> מימוש נקודות
                  </button>
                </div>
              </div>

              {/* Transaction History */}
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-gray-400" /> היסטוריית נקודות
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {(Array.isArray(loyaltyHistory) ? loyaltyHistory : []).map((tx: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          tx.type === 'EARN' ? 'bg-green-100 text-green-600' :
                          tx.type === 'REDEEM' ? 'bg-blue-100 text-blue-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {tx.type === 'EARN' ? <Plus className="w-4 h-4" /> :
                           tx.type === 'REDEEM' ? <Gift className="w-4 h-4" /> :
                           <Coins className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{tx.description || (tx.type === 'EARN' ? 'צבירה' : 'מימוש')}</div>
                          <div className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleDateString('he-IL')}</div>
                        </div>
                      </div>
                      <span className={`font-bold ${tx.type === 'EARN' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'EARN' ? '+' : '-'}{Math.abs(tx.points)}
                      </span>
                    </div>
                  ))}
                  {(!loyaltyHistory || loyaltyHistory.length === 0) && (
                    <p className="text-center text-gray-400 text-sm py-4">אין היסטוריה</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
              <Award className="w-16 h-16 text-gray-200 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-400">בחר לקוח לצפייה בנקודות</h3>
            </div>
          )}
        </div>
      </div>

      {/* Earn Points Modal */}
      {showEarnModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEarnModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">הוספת נקודות — {selectedCustomer.name}</h3>
              <button onClick={() => setShowEarnModal(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">כמות נקודות</label>
                <input type="number" value={earnAmount} onChange={e => setEarnAmount(e.target.value)}
                  placeholder="100"
                  className="w-full px-4 py-3 border rounded-xl text-lg text-center focus:ring-2 focus:ring-blue-500" autoFocus />
                <div className="flex gap-2 mt-2">
                  {[50, 100, 200, 500].map(pts => (
                    <button key={pts} onClick={() => setEarnAmount(String(pts))}
                      className="flex-1 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">{pts}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">סיבה</label>
                <select value={earnReason} onChange={e => setEarnReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg">
                  <option value="purchase">רכישה</option>
                  <option value="bonus">בונוס</option>
                  <option value="referral">המלצה</option>
                  <option value="birthday">יום הולדת</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowEarnModal(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => earnAmount && earnMutation.mutate({ points: Number(earnAmount), reason: earnReason })}
                disabled={!earnAmount || earnMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {earnMutation.isPending ? 'מעבד...' : `הוסף ${earnAmount || 0} נקודות`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
