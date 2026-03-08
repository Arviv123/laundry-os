import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Building2, Plus, MapPin, Phone, Clock, Edit2 } from 'lucide-react';

export default function BranchesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [form, setForm] = useState({ name: '', address: '', city: '', phone: '', openingHours: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data.data),
  });

  const branches = Array.isArray(data) ? data : data?.branches ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) => editingBranch
      ? api.patch(`/branches/${editingBranch.id}`, payload)
      : api.post('/branches', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setShowForm(false);
      setEditingBranch(null);
      setForm({ name: '', address: '', city: '', phone: '', openingHours: '' });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Building2 className="w-7 h-7 text-blue-600" /> סניפים
        </h1>
        <button onClick={() => { setShowForm(true); setEditingBranch(null); setForm({ name: '', address: '', city: '', phone: '', openingHours: '' }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> סניף חדש
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-700 mb-3">{editingBranch ? 'עריכת סניף' : 'סניף חדש'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input placeholder="שם סניף" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input placeholder="כתובת" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input placeholder="עיר" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input placeholder="טלפון" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input placeholder="שעות פתיחה (לדוגמה: 08:00-20:00)" value={form.openingHours}
              onChange={e => setForm({ ...form, openingHours: e.target.value })}
              className="px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => saveMutation.mutate({
              name: form.name,
              address: form.address ? { street: form.address, city: form.city } : undefined,
              phone: form.phone || undefined,
              openingHours: form.openingHours || undefined,
            })} disabled={!form.name || saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
              {saveMutation.isPending ? 'שומר...' : 'שמור'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingBranch(null); }}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">ביטול</button>
          </div>
        </div>
      )}

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="col-span-3 text-center text-gray-400">טוען...</p>}
        {branches.map((branch: any) => (
          <div key={branch.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{branch.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    branch.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{branch.isActive !== false ? 'פעיל' : 'לא פעיל'}</span>
                </div>
              </div>
              <button onClick={() => {
                setEditingBranch(branch);
                setForm({
                  name: branch.name,
                  address: branch.address?.street ?? '',
                  city: branch.address?.city ?? '',
                  phone: branch.phone ?? '',
                  openingHours: branch.openingHours ?? '',
                });
                setShowForm(true);
              }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-gray-500">
              {branch.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  {branch.address.street}{branch.address.city ? `, ${branch.address.city}` : ''}
                </div>
              )}
              {branch.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" />{branch.phone}
                </div>
              )}
              {branch.openingHours && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />{branch.openingHours}
                </div>
              )}
            </div>
          </div>
        ))}
        {!isLoading && branches.length === 0 && (
          <p className="col-span-3 text-center text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
            אין סניפים — הוסף את הסניף הראשון
          </p>
        )}
      </div>
    </div>
  );
}
