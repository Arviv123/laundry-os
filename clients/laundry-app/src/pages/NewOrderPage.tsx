import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Trash2, ShoppingBag } from 'lucide-react';

interface OrderItem {
  serviceId: string;
  description: string;
  category: string;
  quantity: number;
  color?: string;
  brand?: string;
  specialNotes?: string;
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'EXPRESS' | 'SAME_DAY'>('NORMAL');
  const [deliveryType, setDeliveryType] = useState<'STORE_PICKUP' | 'HOME_DELIVERY'>('STORE_PICKUP');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ serviceId: '', description: '', category: 'OTHER', quantity: 1 }]);

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/crm/customers', { params: { limit: 100 } }).then(r => r.data.data ?? r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/orders', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/orders/${res.data.data.id}`);
    },
  });

  const addItem = () => setItems([...items, { serviceId: '', description: '', category: 'OTHER', quantity: 1 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      customerId,
      priority,
      deliveryType,
      notes: notes || undefined,
      items: items.filter(i => i.serviceId && i.description),
    });
  };

  const CATEGORIES = [
    { value: 'SHIRT', label: 'חולצה' }, { value: 'PANTS', label: 'מכנסיים' },
    { value: 'DRESS', label: 'שמלה' }, { value: 'SUIT', label: 'חליפה' },
    { value: 'COAT', label: 'מעיל' }, { value: 'BEDDING', label: 'מצעים' },
    { value: 'CURTAIN', label: 'וילונות' }, { value: 'TOWEL', label: 'מגבות' },
    { value: 'OTHER', label: 'אחר' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
        <ShoppingBag className="w-7 h-7 text-blue-600" /> הזמנה חדשה
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer + Priority */}
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">פרטי הזמנה</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">לקוח</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">בחר לקוח...</option>
                {(Array.isArray(customers) ? customers : customers?.customers ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">עדיפות</label>
              <select value={priority} onChange={e => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg">
                <option value="NORMAL">רגיל</option>
                <option value="EXPRESS">אקספרס</option>
                <option value="SAME_DAY">אותו יום</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">סוג מסירה</label>
              <select value={deliveryType} onChange={e => setDeliveryType(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg">
                <option value="STORE_PICKUP">איסוף מהחנות</option>
                <option value="HOME_DELIVERY">משלוח לבית</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">הערות</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border rounded-lg" placeholder="הערות כלליות..." />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">פריטים</h2>
            <button type="button" onClick={addItem} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus className="w-4 h-4" /> הוסף פריט
            </button>
          </div>

          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">שירות</label>
                <select value={item.serviceId} onChange={e => updateItem(idx, 'serviceId', e.target.value)} required
                  className="w-full px-2 py-1.5 border rounded text-sm">
                  <option value="">בחר...</option>
                  {services?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} — {Number(s.basePrice)} ₪</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">תיאור</label>
                <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} required
                  className="w-full px-2 py-1.5 border rounded text-sm" placeholder="חולצה לבנה..." />
              </div>
              <div>
                <label className="text-xs text-gray-500">קטגוריה</label>
                <select value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">כמות</label>
                <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                  className="w-full px-2 py-1.5 border rounded text-sm" />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600" disabled={items.length <= 1}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/orders')} className="px-6 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50">
            ביטול
          </button>
          <button type="submit" disabled={createMutation.isPending}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {createMutation.isPending ? 'יוצר...' : 'צור הזמנה'}
          </button>
        </div>

        {createMutation.isError && (
          <p className="text-red-500 text-sm text-center">{(createMutation.error as any)?.response?.data?.error ?? 'שגיאה'}</p>
        )}
      </form>
    </div>
  );
}
