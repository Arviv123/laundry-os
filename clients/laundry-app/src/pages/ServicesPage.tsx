import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Edit2, Tags } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  WASH: 'כביסה', DRY_CLEAN: 'ניקוי יבש', IRON: 'גיהוץ', FOLD: 'קיפול', SPECIAL: 'מיוחד',
};

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editing ? api.patch(`/services/${editing.id}`, data) : api.post('/services', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['services'] }); setShowForm(false); setEditing(null); },
  });

  const [form, setForm] = useState({ name: '', category: 'WASH', basePrice: 0, expressMultiplier: 1.5, estimatedMinutes: 60 });

  const openEdit = (svc: any) => {
    setEditing(svc);
    setForm({ name: svc.name, category: svc.category, basePrice: Number(svc.basePrice), expressMultiplier: Number(svc.expressMultiplier), estimatedMinutes: svc.estimatedMinutes ?? 60 });
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', category: 'WASH', basePrice: 0, expressMultiplier: 1.5, estimatedMinutes: 60 });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Tags className="w-7 h-7 text-blue-600" /> שירותי כביסה
        </h1>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> שירות חדש
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <h2 className="font-semibold">{editing ? 'ערוך שירות' : 'שירות חדש'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-600">שם השירות</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="text-sm text-gray-600">קטגוריה</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">מחיר בסיס (₪)</label>
              <input type="number" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="text-sm text-gray-600">מכפיל אקספרס</label>
              <input type="number" step="0.1" value={form.expressMultiplier} onChange={e => setForm({ ...form, expressMultiplier: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="text-sm text-gray-600">זמן משוער (דקות)</label>
              <input type="number" value={form.estimatedMinutes} onChange={e => setForm({ ...form, estimatedMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saveMutation.isPending ? 'שומר...' : 'שמור'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-gray-600">ביטול</button>
          </div>
        </div>
      )}

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="col-span-3 text-center text-gray-400">טוען...</p>}
        {services?.map((svc: any) => (
          <div key={svc.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{svc.name}</h3>
                <span className="text-xs text-gray-500">{CATEGORY_LABELS[svc.category] ?? svc.category}</span>
              </div>
              <button onClick={() => openEdit(svc)} className="p-1.5 text-gray-400 hover:text-blue-600">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">מחיר</span><span className="font-medium">{Number(svc.basePrice)} ₪</span></div>
              <div className="flex justify-between"><span className="text-gray-500">אקספרס</span><span>x{Number(svc.expressMultiplier)}</span></div>
              {svc.estimatedMinutes && <div className="flex justify-between"><span className="text-gray-500">זמן</span><span>{svc.estimatedMinutes} דק'</span></div>}
              {svc.pricePerKg && <div className="flex justify-between"><span className="text-gray-500">לק"ג</span><span>{Number(svc.pricePerKg)} ₪</span></div>}
            </div>
            <div className="mt-3">
              <span className={`px-2 py-0.5 rounded text-xs ${svc.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {svc.isActive ? 'פעיל' : 'מושבת'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
