import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { ScanLine, Search, Plus, Package, AlertTriangle, Edit2 } from 'lucide-react';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState({ name: '', sku: '', quantity: '', minQuantity: '', unitPrice: '', category: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', search],
    queryFn: () => api.get('/inventory/products', { params: { search: search || undefined, limit: 100 } }).then(r => r.data.data),
  });

  const items = Array.isArray(data) ? data : data?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) => editingItem
      ? api.patch(`/inventory/products/${editingItem.id}`, payload)
      : api.post('/inventory/products', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setShowForm(false);
      setEditingItem(null);
      setForm({ name: '', sku: '', quantity: '', minQuantity: '', unitPrice: '', category: '' });
    },
  });

  const lowStockItems = items.filter((item: any) => item.quantity <= (item.minQuantity ?? 0));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <ScanLine className="w-7 h-7 text-blue-600" /> מלאי חומרים
        </h1>
        <button onClick={() => { setShowForm(true); setEditingItem(null); setForm({ name: '', sku: '', quantity: '', minQuantity: '', unitPrice: '', category: '' }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> פריט חדש
        </button>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-amber-800">התראת מלאי נמוך</div>
            <div className="text-sm text-amber-600 mt-1">
              {lowStockItems.map((i: any) => i.name).join(', ')} — מתחת למינימום
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש פריט..." className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-700 mb-3">{editingItem ? 'עריכת פריט' : 'פריט חדש'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input placeholder="שם פריט" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input placeholder={'מק"ט (SKU)'} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input type="number" placeholder="כמות" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input type="number" placeholder="מינימום" value={form.minQuantity} onChange={e => setForm({ ...form, minQuantity: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input type="number" placeholder="מחיר יחידה" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="px-3 py-2 border rounded-lg">
              <option value="">קטגוריה</option>
              <option value="DETERGENT">חומר ניקוי</option>
              <option value="PACKAGING">אריזה</option>
              <option value="EQUIPMENT">ציוד</option>
              <option value="OTHER">אחר</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => saveMutation.mutate({
              name: form.name, sku: form.sku || undefined,
              quantity: Number(form.quantity) || 0,
              minQuantity: Number(form.minQuantity) || 0,
              unitPrice: Number(form.unitPrice) || 0,
              category: form.category || undefined,
            })} disabled={!form.name || saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
              {saveMutation.isPending ? 'שומר...' : 'שמור'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingItem(null); }}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">ביטול</button>
          </div>
        </div>
      )}

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="col-span-3 text-center text-gray-400">טוען...</p>}
        {items.map((item: any) => {
          const isLow = item.quantity <= (item.minQuantity ?? 0);
          return (
            <div key={item.id} className={`bg-white rounded-xl shadow-sm border p-5 ${isLow ? 'border-amber-300' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{item.name}</h3>
                  {item.sku && <span className="text-xs text-gray-400 font-mono">{item.sku}</span>}
                </div>
                <button onClick={() => {
                  setEditingItem(item);
                  setForm({
                    name: item.name, sku: item.sku ?? '',
                    quantity: String(item.quantity), minQuantity: String(item.minQuantity ?? 0),
                    unitPrice: String(item.unitPrice ?? 0), category: item.category ?? '',
                  });
                  setShowForm(true);
                }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400" />
                  <span className={`text-lg font-bold ${isLow ? 'text-amber-600' : 'text-gray-800'}`}>{item.quantity}</span>
                  {item.minQuantity > 0 && (
                    <span className="text-xs text-gray-400">/ מינ׳ {item.minQuantity}</span>
                  )}
                </div>
                {item.unitPrice > 0 && (
                  <span className="text-sm text-gray-500">{Number(item.unitPrice).toLocaleString()} ₪</span>
                )}
              </div>
              {isLow && (
                <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> מלאי נמוך
                </div>
              )}
            </div>
          );
        })}
        {!isLoading && items.length === 0 && (
          <p className="col-span-3 text-center text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
            אין פריטי מלאי
          </p>
        )}
      </div>
    </div>
  );
}
