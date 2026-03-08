import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Gift, Plus, Search, CreditCard, DollarSign, X,
  Copy, CheckCircle, XCircle, Clock, ArrowDownCircle,
} from 'lucide-react';

export default function GiftCardsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showRedeem, setShowRedeem] = useState<any>(null);
  const [searchCode, setSearchCode] = useState('');
  const [checkedCard, setCheckedCard] = useState<any>(null);

  // Create form
  const [createAmount, setCreateAmount] = useState('');
  const [createExpiry, setCreateExpiry] = useState('');

  // Redeem form
  const [redeemAmount, setRedeemAmount] = useState('');

  const { data: giftCards, isLoading } = useQuery({
    queryKey: ['gift-cards'],
    queryFn: () => api.get('/pos/gift-cards').then(r => r.data.data).catch(() => []),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/pos/gift-cards', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      setShowCreate(false);
      setCreateAmount('');
      setCreateExpiry('');
      const card = res.data.data;
      addToast(`כרטיס מתנה ${card.code} נוצר בהצלחה!`);
    },
    onError: () => addToast('שגיאה ביצירת כרטיס מתנה', 'error'),
  });

  const redeemMutation = useMutation({
    mutationFn: ({ code, amount }: { code: string; amount: number }) =>
      api.post(`/pos/gift-cards/${code}/redeem`, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      setShowRedeem(null);
      setRedeemAmount('');
      setCheckedCard(null);
      addToast('כרטיס מתנה מומש בהצלחה');
    },
    onError: () => addToast('שגיאה במימוש כרטיס מתנה', 'error'),
  });

  const checkBalance = async () => {
    if (!searchCode.trim()) return;
    try {
      const res = await api.get(`/pos/gift-cards/${searchCode.trim()}`);
      setCheckedCard(res.data.data);
    } catch {
      addToast('כרטיס מתנה לא נמצא', 'error');
      setCheckedCard(null);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    addToast('קוד הועתק');
  };

  const cardList = Array.isArray(giftCards) ? giftCards : [];
  const activeCards = cardList.filter((c: any) => c.isActive && Number(c.balance) > 0);
  const emptyCards = cardList.filter((c: any) => c.isActive && Number(c.balance) <= 0);
  const inactiveCards = cardList.filter((c: any) => !c.isActive);

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Gift className="w-7 h-7 text-pink-600" /> כרטיסי מתנה
        </h1>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 text-sm">
          <Plus className="w-4 h-4" /> כרטיס חדש
        </button>
      </div>

      {/* Balance Check */}
      <div className="bg-gradient-to-l from-pink-50 to-rose-50 rounded-xl border border-pink-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Search className="w-5 h-5 text-pink-500" /> בדיקת יתרה
        </h2>
        <div className="flex gap-2 max-w-md">
          <input value={searchCode} onChange={e => setSearchCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && checkBalance()}
            placeholder="הקלד קוד כרטיס..."
            className="flex-1 px-4 py-2 border rounded-lg font-mono focus:ring-2 focus:ring-pink-500" />
          <button onClick={checkBalance}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm">
            בדוק
          </button>
        </div>
        {checkedCard && (
          <div className="mt-4 bg-white rounded-lg border p-4 max-w-md animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono font-bold text-lg">{checkedCard.code}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                checkedCard.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {checkedCard.isActive ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 block">יתרה</span>
                <span className="font-bold text-xl text-pink-600">{Number(checkedCard.balance).toLocaleString()} ₪</span>
              </div>
              <div>
                <span className="text-gray-500 block">סכום מקורי</span>
                <span className="font-bold">{Number(checkedCard.initialAmount).toLocaleString()} ₪</span>
              </div>
            </div>
            {Number(checkedCard.balance) > 0 && checkedCard.isActive && (
              <button onClick={() => { setShowRedeem(checkedCard); setRedeemAmount(''); }}
                className="mt-3 w-full py-2 bg-pink-600 text-white rounded-lg text-sm hover:bg-pink-700">
                מימוש
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI icon={Gift} label="סה״כ כרטיסים" value={String(cardList.length)} color="pink" />
        <KPI icon={CheckCircle} label="פעילים עם יתרה" value={String(activeCards.length)} color="green" />
        <KPI icon={DollarSign} label="יתרה כוללת"
          value={`${activeCards.reduce((s: number, c: any) => s + Number(c.balance), 0).toLocaleString()} ₪`}
          color="blue" />
        <KPI icon={CreditCard} label="נמכרו בסה״כ"
          value={`${cardList.reduce((s: number, c: any) => s + Number(c.initialAmount), 0).toLocaleString()} ₪`}
          color="purple" />
      </div>

      {/* Active Cards */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" /> כרטיסים פעילים ({activeCards.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeCards.map((card: any) => (
            <GiftCardItem key={card.id} card={card}
              onCopy={() => copyCode(card.code)}
              onRedeem={() => { setShowRedeem(card); setRedeemAmount(''); }} />
          ))}
          {activeCards.length === 0 && <p className="col-span-3 text-gray-400 text-sm">אין כרטיסים פעילים</p>}
        </div>
      </div>

      {/* Used Up Cards */}
      {emptyCards.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-gray-400" /> כרטיסים מנוצלים ({emptyCards.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {emptyCards.map((card: any) => (
              <GiftCardItem key={card.id} card={card} onCopy={() => copyCode(card.code)} />
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">כרטיס מתנה חדש</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">סכום *</label>
                <input type="number" value={createAmount} onChange={e => setCreateAmount(e.target.value)}
                  placeholder="500"
                  className="w-full px-4 py-3 border rounded-xl text-lg text-center focus:ring-2 focus:ring-pink-500" autoFocus />
                <div className="flex gap-2 mt-2">
                  {[100, 200, 500, 1000].map(amt => (
                    <button key={amt} onClick={() => setCreateAmount(String(amt))}
                      className={`flex-1 py-1.5 rounded-lg text-sm ${
                        createAmount === String(amt) ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{amt} ₪</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך תפוגה (אופציונלי)</label>
                <input type="date" value={createExpiry} onChange={e => setCreateExpiry(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => createAmount && createMutation.mutate({
                  amount: Number(createAmount),
                  expiresAt: createExpiry ? new Date(createExpiry).toISOString() : undefined,
                })}
                disabled={!createAmount || createMutation.isPending}
                className="flex-1 py-2.5 bg-pink-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createMutation.isPending ? 'יוצר...' : `צור כרטיס ${Number(createAmount || 0).toLocaleString()} ₪`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redeem Modal */}
      {showRedeem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowRedeem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">מימוש כרטיס מתנה</h3>
                <p className="text-sm text-gray-500 font-mono">{showRedeem.code}</p>
              </div>
              <button onClick={() => setShowRedeem(null)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-pink-50 rounded-lg p-4 text-center">
                <div className="text-sm text-gray-500">יתרה נוכחית</div>
                <div className="text-3xl font-bold text-pink-600">{Number(showRedeem.balance).toLocaleString()} ₪</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">סכום לניכוי</label>
                <input type="number" value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 border rounded-xl text-lg text-center focus:ring-2 focus:ring-pink-500" autoFocus />
                <div className="flex gap-2 mt-2">
                  {[50, 100, Number(showRedeem.balance)].filter(v => v <= Number(showRedeem.balance) && v > 0).map(amt => (
                    <button key={amt} onClick={() => setRedeemAmount(String(amt))}
                      className="flex-1 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                      {amt === Number(showRedeem.balance) ? `מלא (${amt})` : amt} ₪
                    </button>
                  ))}
                </div>
              </div>
              {redeemAmount && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>יתרה לאחר מימוש:</span>
                    <span className="font-bold">{(Number(showRedeem.balance) - Number(redeemAmount)).toLocaleString()} ₪</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowRedeem(null)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => redeemAmount && redeemMutation.mutate({ code: showRedeem.code, amount: Number(redeemAmount) })}
                disabled={!redeemAmount || Number(redeemAmount) <= 0 || Number(redeemAmount) > Number(showRedeem.balance) || redeemMutation.isPending}
                className="flex-1 py-2.5 bg-pink-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {redeemMutation.isPending ? 'מעבד...' : `ממש ${Number(redeemAmount || 0).toLocaleString()} ₪`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GiftCardItem({ card, onCopy, onRedeem }: { card: any; onCopy: () => void; onRedeem?: () => void }) {
  const balance = Number(card.balance);
  const initial = Number(card.initialAmount);
  const usedPct = initial > 0 ? Math.round(((initial - balance) / initial) * 100) : 0;
  const isExpired = card.expiresAt && new Date(card.expiresAt) < new Date();

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow ${
      balance <= 0 || isExpired ? 'opacity-60' : ''
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gift className={`w-5 h-5 ${balance > 0 ? 'text-pink-500' : 'text-gray-400'}`} />
          <span className="font-mono font-bold text-sm">{card.code}</span>
        </div>
        <button onClick={onCopy} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="העתק קוד">
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">יתרה</span>
          <span className={`font-bold ${balance > 0 ? 'text-pink-600' : 'text-gray-400'}`}>{balance.toLocaleString()} ₪</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">סכום מקורי</span>
          <span>{initial.toLocaleString()} ₪</span>
        </div>

        {/* Usage bar */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-pink-500 rounded-full transition-all" style={{ width: `${100 - usedPct}%` }} />
        </div>

        {card.expiresAt && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {isExpired ? (
              <span className="text-red-500">פג תוקף {new Date(card.expiresAt).toLocaleDateString('he-IL')}</span>
            ) : (
              <span>בתוקף עד {new Date(card.expiresAt).toLocaleDateString('he-IL')}</span>
            )}
          </div>
        )}

        <div className="text-xs text-gray-400">
          נוצר: {new Date(card.createdAt).toLocaleDateString('he-IL')}
        </div>
      </div>

      {onRedeem && balance > 0 && !isExpired && (
        <button onClick={onRedeem}
          className="mt-3 w-full py-2 bg-pink-50 text-pink-600 rounded-lg text-sm font-medium hover:bg-pink-100 flex items-center justify-center gap-1">
          <ArrowDownCircle className="w-4 h-4" /> מימוש
        </button>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const bg: Record<string, string> = {
    pink: 'bg-pink-50 text-pink-600', green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
    </div>
  );
}
