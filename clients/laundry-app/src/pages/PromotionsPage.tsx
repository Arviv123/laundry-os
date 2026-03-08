import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Percent, Plus, Calendar, Tag, CheckCircle, XCircle,
  Trash2, X, ToggleLeft, ToggleRight,
} from 'lucide-react';

const DISCOUNT_TYPES: Record<string, string> = {
  PERCENT_OFF: 'אחוז הנחה',
  AMOUNT_OFF: 'סכום קבוע',
  BUY_X_GET_Y: 'קנה X קבל Y',
};

export default function PromotionsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('PERCENT_OFF');
  const [formValue, setFormValue] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  const { data: promotions, isLoading } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get('/pos/promotions').then(r => r.data.data).catch(() => []),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/pos/promotions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      resetForm();
      addToast('מבצע נוצר בהצלחה');
    },
    onError: () => addToast('שגיאה ביצירת מבצע', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/pos/promotions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      resetForm();
      addToast('מבצע עודכן');
    },
    onError: () => addToast('שגיאה בעדכון מבצע', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pos/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      addToast('מבצע הוסר');
    },
    onError: () => addToast('שגיאה בהסרת מבצע', 'error'),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingPromo(null);
    setFormName(''); setFormType('PERCENT_OFF'); setFormValue('');
    setFormMinOrder(''); setFormCode(''); setFormStartDate(''); setFormEndDate('');
  };

  const openEdit = (promo: any) => {
    setEditingPromo(promo);
    setFormName(promo.name);
    setFormType(promo.type || 'PERCENT_OFF');
    setFormValue(String(promo.value || ''));
    setFormMinOrder(String(promo.minPurchase || ''));
    setFormCode(promo.code || '');
    setFormStartDate(promo.startDate?.slice(0, 10) || '');
    setFormEndDate(promo.endDate?.slice(0, 10) || '');
    setShowForm(true);
  };

  const handleSubmit = () => {
    const payload = {
      name: formName,
      type: formType,
      value: Number(formValue),
      minPurchase: formMinOrder ? Number(formMinOrder) : undefined,
      code: formCode || undefined,
      startDate: formStartDate ? new Date(formStartDate).toISOString() : new Date().toISOString(),
      endDate: formEndDate ? new Date(formEndDate).toISOString() : undefined,
    };
    if (editingPromo) {
      updateMutation.mutate({ id: editingPromo.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const promoList = Array.isArray(promotions) ? promotions : [];
  const activePromos = promoList.filter((p: any) => p.isActive);
  const inactivePromos = promoList.filter((p: any) => !p.isActive);

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Percent className="w-7 h-7 text-purple-600" /> מבצעים והנחות
        </h1>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">
          <Plus className="w-4 h-4" /> מבצע חדש
        </button>
      </div>

      {/* Active Promotions */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" /> מבצעים פעילים ({activePromos.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePromos.map((promo: any) => (
            <PromoCard key={promo.id} promo={promo}
              onEdit={() => openEdit(promo)}
              onDelete={() => deleteMutation.mutate(promo.id)} />
          ))}
          {activePromos.length === 0 && (
            <p className="col-span-3 text-gray-400 text-sm">אין מבצעים פעילים</p>
          )}
        </div>
      </div>

      {/* Inactive Promotions */}
      {inactivePromos.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-gray-400" /> מבצעים לא פעילים ({inactivePromos.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactivePromos.map((promo: any) => (
              <PromoCard key={promo.id} promo={promo}
                onEdit={() => openEdit(promo)}
                onDelete={() => deleteMutation.mutate(promo.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={resetForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">{editingPromo ? 'עריכת מבצע' : 'מבצע חדש'}</h3>
              <button onClick={resetForm} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם המבצע *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="לדוגמה: 20% הנחה על גיהוץ"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500" autoFocus />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">סוג הנחה</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(DISCOUNT_TYPES).map(([key, label]) => (
                    <button key={key} onClick={() => setFormType(key)}
                      className={`py-2 rounded-lg text-xs font-medium ${
                        formType === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    {formType === 'PERCENT_OFF' ? 'אחוז הנחה' : 'סכום הנחה'} *
                  </label>
                  <input type="number" value={formValue} onChange={e => setFormValue(e.target.value)}
                    placeholder={formType === 'PERCENT_OFF' ? '20' : '50'}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">סכום מינימלי</label>
                  <input type="number" value={formMinOrder} onChange={e => setFormMinOrder(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">קוד קופון (אופציונלי)</label>
                <input value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())}
                  placeholder="SUMMER20"
                  className="w-full px-3 py-2 border rounded-lg font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך התחלה</label>
                  <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">תאריך סיום</label>
                  <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={resetForm}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button onClick={handleSubmit}
                disabled={!formName || !formValue || createMutation.isPending || updateMutation.isPending}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {(createMutation.isPending || updateMutation.isPending) ? 'שומר...' : (editingPromo ? 'עדכן' : 'צור מבצע')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PromoCard({ promo, onEdit, onDelete }: { promo: any; onEdit: () => void; onDelete: () => void }) {
  const isExpired = promo.endDate && new Date(promo.endDate) < new Date();
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow ${
      !promo.isActive || isExpired ? 'opacity-60' : ''
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag className={`w-5 h-5 ${promo.isActive ? 'text-purple-500' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-800">{promo.name}</h3>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-600 rounded">
            <Tag className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-gray-400" />
          <span className="font-bold text-purple-600">
            {promo.type === 'PERCENT_OFF'
              ? `${promo.value}% הנחה`
              : `${promo.value} ₪ הנחה`}
          </span>
        </div>

        {promo.minPurchase > 0 && (
          <div className="text-gray-500">מינ׳ הזמנה: {promo.minPurchase} ₪</div>
        )}

        {promo.code && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500">קופון:</span>
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{promo.code}</span>
          </div>
        )}

        {(promo.startDate || promo.endDate) && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <Calendar className="w-3 h-3" />
            {promo.startDate && new Date(promo.startDate).toLocaleDateString('he-IL')}
            {promo.startDate && promo.endDate && ' — '}
            {promo.endDate && new Date(promo.endDate).toLocaleDateString('he-IL')}
            {isExpired && <span className="text-red-500 mr-1">(פג תוקף)</span>}
          </div>
        )}
      </div>
    </div>
  );
}
