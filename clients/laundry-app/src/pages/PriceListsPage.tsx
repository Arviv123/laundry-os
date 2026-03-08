import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Tag, Plus, Trash2, Users, Check, X, Save, ChevronLeft } from 'lucide-react';

export default function PriceListsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editingPrices, setEditingPrices] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', isDefault: false });
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  // ─── Queries ──────────────────────────────────────────────────

  const { data: priceLists, isLoading } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.get('/price-lists').then(r => r.data.data),
  });

  const { data: selectedPriceList, isLoading: detailLoading } = useQuery({
    queryKey: ['price-lists', selectedId],
    queryFn: () => api.get(`/price-lists/${selectedId}`).then(r => r.data.data),
    enabled: !!selectedId,
  });

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['crm-customers'],
    queryFn: () => api.get('/crm/customers').then(r => {
      const d = r.data.data;
      return Array.isArray(d) ? d : d?.items ?? [];
    }),
    enabled: showAssign,
  });

  // ─── Mutations ────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/price-lists', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      setShowCreate(false);
      setCreateForm({ name: '', description: '', isDefault: false });
      setSelectedId(res.data.data.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/price-lists/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists', selectedId] });
    },
  });

  const replaceItemsMutation = useMutation({
    mutationFn: ({ id, items }: { id: string; items: any[] }) => api.put(`/price-lists/${id}/items`, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists', selectedId] });
      setEditingPrices(false);
      setPriceEdits({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/price-lists/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      setSelectedId(null);
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, customerIds }: { id: string; customerIds: string[] }) =>
      api.post(`/price-lists/${id}/assign`, { customerIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      setShowAssign(false);
      setSelectedCustomerIds([]);
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────

  const handleStartEditPrices = () => {
    const edits: Record<string, string> = {};
    if (selectedPriceList?.items) {
      for (const item of selectedPriceList.items) {
        edits[item.serviceId] = String(Number(item.price));
      }
    }
    setPriceEdits(edits);
    setEditingPrices(true);
  };

  const handleSavePrices = () => {
    if (!selectedId) return;
    const items = Object.entries(priceEdits)
      .filter(([, price]) => price !== '' && Number(price) > 0)
      .map(([serviceId, price]) => ({ serviceId, price: Number(price) }));
    replaceItemsMutation.mutate({ id: selectedId, items });
  };

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // ─── Render ───────────────────────────────────────────────────

  const detail = selectedPriceList;
  const allServices: any[] = services ?? [];

  return (
    <div className="flex h-full">
      {/* ─── Left Panel: Price Lists ──────────────────────────── */}
      <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" /> מחירונים
            </h1>
            <button onClick={() => setShowCreate(true)}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-center text-gray-400">טוען...</p>}
          {priceLists?.map((pl: any) => (
            <button key={pl.id} onClick={() => { setSelectedId(pl.id); setEditingPrices(false); }}
              className={`w-full text-right p-4 border-b border-gray-50 hover:bg-blue-50 transition-colors ${
                selectedId === pl.id ? 'bg-blue-50 border-r-2 border-r-blue-600' : ''
              }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">{pl.name}</span>
                <div className="flex items-center gap-1">
                  {pl.isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">ברירת מחדל</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    pl.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {pl.isActive ? 'פעיל' : 'מושבת'}
                  </span>
                </div>
              </div>
              {pl.description && (
                <p className="text-xs text-gray-500 mt-1 truncate">{pl.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>{pl._count?.items ?? 0} שירותים</span>
                <span>{pl._count?.customers ?? 0} לקוחות</span>
              </div>
            </button>
          ))}
          {!isLoading && (!priceLists || priceLists.length === 0) && (
            <p className="p-4 text-center text-gray-400 text-sm">אין מחירונים. צור מחירון חדש.</p>
          )}
        </div>
      </div>

      {/* ─── Right Panel: Detail ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {!selectedId && !showCreate && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Tag className="w-12 h-12 mb-3" />
            <p>בחר מחירון מהרשימה או צור חדש</p>
          </div>
        )}

        {/* ─── Create Modal ────────────────────────────────────── */}
        {showCreate && (
          <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">מחירון חדש</h2>
            <div>
              <label className="text-sm text-gray-600">שם המחירון</label>
              <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder='לדוגמה: "סטנדרטי", "מלון", "VIP"'
                className="w-full px-3 py-2 border rounded-lg mt-1 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm text-gray-600">תיאור</label>
              <input value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="תיאור קצר (אופציונלי)"
                className="w-full px-3 py-2 border rounded-lg mt-1 focus:ring-2 focus:ring-blue-500" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={createForm.isDefault}
                onChange={e => setCreateForm({ ...createForm, isDefault: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">הגדר כמחירון ברירת מחדל</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button onClick={() => createMutation.mutate(createForm)}
                disabled={!createForm.name || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                {createMutation.isPending ? 'יוצר...' : 'צור מחירון'}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm">ביטול</button>
            </div>
          </div>
        )}

        {/* ─── Price List Detail ──────────────────────────────── */}
        {selectedId && !showCreate && (
          <>
            {detailLoading ? (
              <p className="text-center text-gray-400">טוען...</p>
            ) : detail ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">{detail.name}</h2>
                      {detail.description && <p className="text-sm text-gray-500 mt-1">{detail.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        {detail.isDefault && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">ברירת מחדל</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          detail.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {detail.isActive ? 'פעיל' : 'מושבת'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {detail.isActive ? (
                        <button onClick={() => updateMutation.mutate({ id: detail.id, data: { isActive: false } })}
                          className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                          השבת
                        </button>
                      ) : (
                        <button onClick={() => updateMutation.mutate({ id: detail.id, data: { isActive: true } })}
                          className="px-3 py-1.5 text-sm border border-green-200 text-green-600 rounded-lg hover:bg-green-50">
                          הפעל
                        </button>
                      )}
                      <button onClick={() => {
                        if (confirm('למחוק את המחירון? הלקוחות המשויכים יבוטלו.')) {
                          deleteMutation.mutate(detail.id);
                        }
                      }}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Prices Table */}
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">מחירי שירותים</h3>
                    {!editingPrices ? (
                      <button onClick={handleStartEditPrices}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        ערוך מחירים
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={handleSavePrices} disabled={replaceItemsMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                          <Save className="w-3.5 h-3.5" />
                          {replaceItemsMutation.isPending ? 'שומר...' : 'שמור'}
                        </button>
                        <button onClick={() => { setEditingPrices(false); setPriceEdits({}); }}
                          className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                          ביטול
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600">
                          <th className="text-right px-4 py-3 font-medium">שירות</th>
                          <th className="text-right px-4 py-3 font-medium">קטגוריה</th>
                          <th className="text-right px-4 py-3 font-medium">מחיר בסיס</th>
                          <th className="text-right px-4 py-3 font-medium">מחיר מחירון</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editingPrices ? (
                          // Editing mode — show all services
                          allServices.filter((s: any) => s.isActive).map((svc: any) => (
                            <tr key={svc.id} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-800">{svc.name}</td>
                              <td className="px-4 py-3 text-gray-500">{categoryLabel(svc.category)}</td>
                              <td className="px-4 py-3 text-gray-500">{Number(svc.basePrice)} &#8362;</td>
                              <td className="px-4 py-3">
                                <input type="number" step="0.01" min="0"
                                  value={priceEdits[svc.id] ?? ''}
                                  onChange={e => setPriceEdits({ ...priceEdits, [svc.id]: e.target.value })}
                                  placeholder="—"
                                  className="w-28 px-2 py-1 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                              </td>
                            </tr>
                          ))
                        ) : (
                          // View mode — show only items with prices
                          detail.items?.length > 0 ? (
                            detail.items.map((item: any) => (
                              <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-800">{item.service?.name}</td>
                                <td className="px-4 py-3 text-gray-500">{categoryLabel(item.service?.category)}</td>
                                <td className="px-4 py-3 text-gray-500">{Number(item.service?.basePrice)} &#8362;</td>
                                <td className="px-4 py-3 font-semibold text-blue-700">{Number(item.price)} &#8362;</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                                לא הוגדרו מחירים. לחץ "ערוך מחירים" כדי להתחיל.
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Assigned Customers */}
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      לקוחות משויכים ({detail.customers?.length ?? 0})
                    </h3>
                    <button onClick={() => { setShowAssign(true); setSelectedCustomerIds([]); }}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      שייך לקוחות
                    </button>
                  </div>

                  {detail.customers?.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                      {detail.customers.map((c: any) => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-800">{c.name}</span>
                            {c.phone && <span className="text-sm text-gray-400 mr-3">{c.phone}</span>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>{statusLabel(c.status)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-8 text-center text-gray-400 text-sm">אין לקוחות משויכים למחירון זה.</p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ─── Assign Customers Modal ─────────────────────────── */}
        {showAssign && selectedId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800">שייך לקוחות למחירון</h3>
                <button onClick={() => setShowAssign(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {!customers ? (
                  <p className="p-4 text-center text-gray-400">טוען לקוחות...</p>
                ) : customers.length === 0 ? (
                  <p className="p-4 text-center text-gray-400">אין לקוחות</p>
                ) : (
                  customers.map((c: any) => {
                    const isSelected = selectedCustomerIds.includes(c.id);
                    const alreadyAssigned = detail?.customers?.some((dc: any) => dc.id === c.id);
                    return (
                      <button key={c.id} onClick={() => !alreadyAssigned && toggleCustomer(c.id)}
                        disabled={alreadyAssigned}
                        className={`w-full text-right flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                          alreadyAssigned ? 'bg-gray-50 opacity-50 cursor-not-allowed' :
                          isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                        }`}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected || alreadyAssigned ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {(isSelected || alreadyAssigned) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 text-sm">{c.name}</div>
                          {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                        </div>
                        {alreadyAssigned && <span className="text-[10px] text-gray-400">כבר משויך</span>}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500">נבחרו: {selectedCustomerIds.length}</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowAssign(false)}
                    className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">ביטול</button>
                  <button
                    onClick={() => assignMutation.mutate({ id: selectedId, customerIds: selectedCustomerIds })}
                    disabled={selectedCustomerIds.length === 0 || assignMutation.isPending}
                    className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {assignMutation.isPending ? 'משייך...' : 'שייך'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  WASH: 'כביסה',
  DRY_CLEAN: 'ניקוי יבש',
  IRON: 'גיהוץ',
  FOLD: 'קיפול',
  SPECIAL: 'מיוחד',
};

function categoryLabel(cat?: string) {
  return cat ? CATEGORY_LABELS[cat] ?? cat : '';
}

function statusLabel(s?: string) {
  switch (s) {
    case 'ACTIVE': return 'פעיל';
    case 'INACTIVE': return 'לא פעיל';
    case 'LEAD': return 'ליד';
    case 'BLOCKED': return 'חסום';
    default: return s ?? '';
  }
}
