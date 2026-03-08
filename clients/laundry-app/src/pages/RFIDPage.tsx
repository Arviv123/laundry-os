import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Radio, Plus, X, Wifi, WifiOff, Tag, Package, User, Activity,
  RefreshCw, Trash2, AlertTriangle, CheckCircle, BarChart3,
} from 'lucide-react';

type Tab = 'dashboard' | 'readers' | 'tags' | 'assets' | 'events';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'dashboard', label: 'סקירה', icon: BarChart3 },
  { key: 'readers', label: 'קוראים', icon: Wifi },
  { key: 'tags', label: 'תגים', icon: Tag },
  { key: 'assets', label: 'נכסים', icon: Package },
  { key: 'events', label: 'אירועים', icon: Activity },
];

const TAG_TYPE_LABELS: Record<string, string> = { PRODUCT: 'מוצר', ASSET: 'נכס', EMPLOYEE: 'עובד' };
const TAG_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  DECOMMISSIONED: 'bg-red-100 text-red-700',
  LOST: 'bg-yellow-100 text-yellow-700',
};

export default function RFIDPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showCreateReader, setShowCreateReader] = useState(false);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [showCreateAsset, setShowCreateAsset] = useState(false);

  // Dashboard
  const { data: dashboard, isLoading: loadingDash } = useQuery({
    queryKey: ['rfid-dashboard'],
    queryFn: () => api.get('/rfid/dashboard').then(r => r.data.data),
    enabled: activeTab === 'dashboard',
    refetchInterval: 15_000,
  });

  // Readers
  const { data: readers, isLoading: loadingReaders } = useQuery({
    queryKey: ['rfid-readers'],
    queryFn: () => api.get('/rfid/readers').then(r => r.data.data),
    enabled: activeTab === 'readers' || activeTab === 'dashboard',
  });

  // Tags
  const [tagFilter, setTagFilter] = useState('');
  const { data: tags, isLoading: loadingTags } = useQuery({
    queryKey: ['rfid-tags', tagFilter],
    queryFn: () => api.get('/rfid/tags', { params: tagFilter ? { type: tagFilter } : {} }).then(r => r.data.data),
    enabled: activeTab === 'tags',
  });

  // Assets
  const { data: assets, isLoading: loadingAssets } = useQuery({
    queryKey: ['rfid-assets'],
    queryFn: () => api.get('/rfid/assets').then(r => r.data.data),
    enabled: activeTab === 'assets',
  });

  // Events
  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['rfid-events'],
    queryFn: () => api.get('/rfid/events').then(r => r.data.data),
    enabled: activeTab === 'events',
    refetchInterval: 10_000,
  });

  // Inventory
  const { data: inventory } = useQuery({
    queryKey: ['rfid-inventory'],
    queryFn: () => api.get('/rfid/inventory').then(r => r.data.data),
    enabled: activeTab === 'dashboard',
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/rfid/inventory/sync'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['rfid-inventory'] });
      addToast(`סנכרון הושלם — ${res.data?.data?.adjustments ?? 0} תיקונים`);
    },
    onError: () => addToast('שגיאה בסנכרון', 'error'),
  });

  const processEventsMutation = useMutation({
    mutationFn: () => api.post('/rfid/events/process'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfid-events'] });
      addToast('אירועים עובדו');
    },
    onError: () => addToast('שגיאה', 'error'),
  });

  const deleteReaderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/rfid/readers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rfid-readers'] }); addToast('קורא נמחק'); },
    onError: () => addToast('שגיאה', 'error'),
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/rfid/tags/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rfid-tags'] }); addToast('תג בוטל'); },
    onError: () => addToast('שגיאה', 'error'),
  });

  const readerList = Array.isArray(readers) ? readers : [];
  const tagList = Array.isArray(tags) ? tags : [];
  const assetList = Array.isArray(assets) ? assets : [];
  const eventList = Array.isArray(events) ? events : [];
  const inventoryList = Array.isArray(inventory) ? inventory : [];

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Radio className="w-7 h-7 text-blue-600" /> ניהול RFID
        </h1>
        <div className="flex gap-2">
          {activeTab === 'readers' && (
            <button onClick={() => setShowCreateReader(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> קורא חדש
            </button>
          )}
          {activeTab === 'tags' && (
            <button onClick={() => setShowCreateTag(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> תג חדש
            </button>
          )}
          {activeTab === 'assets' && (
            <button onClick={() => setShowCreateAsset(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> נכס חדש
            </button>
          )}
          {activeTab === 'events' && (
            <button onClick={() => processEventsMutation.mutate()}
              disabled={processEventsMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-40">
              <CheckCircle className="w-4 h-4" /> עבד אירועים
            </button>
          )}
          {activeTab === 'dashboard' && (
            <button onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-40">
              <RefreshCw className="w-4 h-4" /> סנכרן מלאי
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {loadingDash ? <p className="text-gray-400">טוען...</p> : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPI icon={Tag} label="תגים פעילים" value={dashboard?.tagsByStatus?.ACTIVE ?? 0} color="blue" />
                <KPI icon={Wifi} label="קוראים פעילים" value={dashboard?.activeReaders ?? 0} color="green" />
                <KPI icon={AlertTriangle} label="תגים אבודים" value={dashboard?.lostTags?.length ?? 0} color="red" />
                <KPI icon={Radio} label="EPCs לא רשומים" value={dashboard?.unregisteredEpcs?.length ?? 0} color="yellow" />
              </div>

              {/* Recent Events */}
              {dashboard?.recentEvents?.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <h2 className="font-semibold text-gray-700 mb-3">אירועים אחרונים</h2>
                  <div className="space-y-2">
                    {dashboard.recentEvents.slice(0, 5).map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-mono text-xs text-blue-600">{e.tagEpc}</span>
                          {e.direction && <span className="text-xs text-gray-400">({e.direction})</span>}
                        </div>
                        <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleString('he-IL')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lost Tags */}
              {dashboard?.lostTags?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <h2 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> תגים אבודים (לא נראו 24+ שעות)
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {dashboard.lostTags.map((t: any) => (
                      <div key={t.id} className="bg-white rounded-lg p-3 text-sm">
                        <span className="font-mono text-xs text-red-600">{t.epc}</span>
                        <span className="text-gray-500 mr-2">{t.name || t.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Readers Tab */}
      {activeTab === 'readers' && (
        <div className="space-y-3">
          {loadingReaders ? <p className="text-gray-400">טוען...</p> : (
            <>
              {readerList.map((reader: any) => (
                <div key={reader.id} className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        reader.isActive ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        {reader.isActive ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-gray-400" />}
                      </div>
                      <div>
                        <div className="font-medium">{reader.name}</div>
                        <div className="text-xs text-gray-400">{reader.location || 'ללא מיקום'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        reader.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>{reader.isActive ? 'פעיל' : 'כבוי'}</span>
                      <button onClick={() => { if (confirm('למחוק קורא?')) deleteReaderMutation.mutate(reader.id); }}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {reader.apiKey && (
                    <div className="mt-2 text-xs text-gray-400 font-mono bg-gray-50 rounded px-2 py-1">
                      API Key: {reader.apiKey.slice(0, 8)}...
                    </div>
                  )}
                </div>
              ))}
              {readerList.length === 0 && <EmptyState icon={Wifi} text="אין קוראי RFID" />}
            </>
          )}
        </div>
      )}

      {/* Tags Tab */}
      {activeTab === 'tags' && (
        <div className="space-y-4">
          <div className="flex gap-1">
            {[{ v: '', l: 'הכל' }, { v: 'PRODUCT', l: 'מוצרים' }, { v: 'ASSET', l: 'נכסים' }, { v: 'EMPLOYEE', l: 'עובדים' }].map(f => (
              <button key={f.v} onClick={() => setTagFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  tagFilter === f.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>{f.l}</button>
            ))}
          </div>
          {loadingTags ? <p className="text-gray-400">טוען...</p> : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-right px-4 py-2">EPC</th>
                    <th className="text-right px-4 py-2">שם</th>
                    <th className="text-right px-4 py-2">סוג</th>
                    <th className="text-right px-4 py-2">סטטוס</th>
                    <th className="text-right px-4 py-2">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {tagList.map((tag: any) => (
                    <tr key={tag.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-blue-600">{tag.epc}</td>
                      <td className="px-4 py-2">{tag.name || tag.description || '-'}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{TAG_TYPE_LABELS[tag.type] ?? tag.type}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TAG_STATUS_COLORS[tag.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {tag.status === 'ACTIVE' ? 'פעיל' : tag.status === 'DECOMMISSIONED' ? 'בוטל' : tag.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {tag.status === 'ACTIVE' && (
                          <button onClick={() => deleteTagMutation.mutate(tag.id)}
                            className="text-red-500 hover:text-red-700 text-xs">בטל</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {tagList.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">אין תגים</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assets Tab */}
      {activeTab === 'assets' && (
        <div className="space-y-3">
          {loadingAssets ? <p className="text-gray-400">טוען...</p> : (
            <>
              {assetList.map((asset: any) => (
                <div key={asset.id} className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium">{asset.name}</div>
                        <div className="text-xs text-gray-400">{asset.category || 'ללא קטגוריה'} • {asset.serialNumber || ''}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      asset.status === 'IN_USE' ? 'bg-green-100 text-green-700' :
                      asset.status === 'AVAILABLE' ? 'bg-blue-100 text-blue-700' :
                      asset.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {asset.status === 'IN_USE' ? 'בשימוש' :
                       asset.status === 'AVAILABLE' ? 'זמין' :
                       asset.status === 'MAINTENANCE' ? 'תחזוקה' :
                       asset.status === 'DISPOSED' ? 'הושלך' : asset.status}
                    </span>
                  </div>
                </div>
              ))}
              {assetList.length === 0 && <EmptyState icon={Package} text="אין נכסים" />}
            </>
          )}
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loadingEvents ? <p className="text-gray-400 p-5">טוען...</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right px-4 py-2">זמן</th>
                  <th className="text-right px-4 py-2">EPC</th>
                  <th className="text-right px-4 py-2">קורא</th>
                  <th className="text-right px-4 py-2">כיוון</th>
                  <th className="text-right px-4 py-2">RSSI</th>
                  <th className="text-right px-4 py-2">מעובד</th>
                </tr>
              </thead>
              <tbody>
                {eventList.map((ev: any) => (
                  <tr key={ev.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs">{new Date(ev.createdAt).toLocaleString('he-IL')}</td>
                    <td className="px-4 py-2 font-mono text-xs text-blue-600">{ev.tagEpc}</td>
                    <td className="px-4 py-2">{ev.reader?.name ?? ev.readerId?.slice(0, 8)}</td>
                    <td className="px-4 py-2">{ev.direction || '-'}</td>
                    <td className="px-4 py-2">{ev.rssi ?? '-'}</td>
                    <td className="px-4 py-2">
                      {ev.processed ? <CheckCircle className="w-4 h-4 text-green-500" /> : <span className="text-yellow-500 text-xs">ממתין</span>}
                    </td>
                  </tr>
                ))}
                {eventList.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">אין אירועים</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Modals */}
      {showCreateReader && (
        <CreateReaderModal onClose={() => setShowCreateReader(false)} onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['rfid-readers'] });
          setShowCreateReader(false);
          addToast('קורא נוצר');
        }} />
      )}
      {showCreateTag && (
        <CreateTagModal onClose={() => setShowCreateTag(false)} onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['rfid-tags'] });
          setShowCreateTag(false);
          addToast('תג נוצר');
        }} />
      )}
      {showCreateAsset && (
        <CreateAssetModal onClose={() => setShowCreateAsset(false)} onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['rfid-assets'] });
          setShowCreateAsset(false);
          addToast('נכס נוצר');
        }} />
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600', yellow: 'bg-yellow-50 text-yellow-600',
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

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function CreateReaderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/rfid/readers', data),
    onSuccess: () => onCreated(),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">קורא RFID חדש</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!name) return; mutation.mutate({ name, location }); }} className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">שם</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="קורא כניסה" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">מיקום</label>
            <input value={location} onChange={e => setLocation(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="כניסה ראשית" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {mutation.isPending ? 'יוצר...' : 'צור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateTagModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [epc, setEpc] = useState('');
  const [type, setType] = useState('PRODUCT');
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/rfid/tags', data),
    onSuccess: () => onCreated(),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">תג RFID חדש</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!epc) return; mutation.mutate({ epc, type, name }); }} className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">EPC</label>
            <input value={epc} onChange={e => setEpc(e.target.value)} className="w-full px-3 py-2 border rounded-lg font-mono" placeholder="E200..." />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">סוג</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2.5 border rounded-xl">
              <option value="PRODUCT">מוצר</option>
              <option value="ASSET">נכס</option>
              <option value="EMPLOYEE">עובד</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">שם/תיאור</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {mutation.isPending ? 'יוצר...' : 'צור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateAssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/rfid/assets', data),
    onSuccess: () => onCreated(),
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה', 'error'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">נכס חדש</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!name) return; mutation.mutate({ name, category, serialNumber }); }} className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">שם</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="מכונת כביסה LG" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">קטגוריה</label>
            <input value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="מכונות" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">מספר סידורי</label>
            <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
              {mutation.isPending ? 'יוצר...' : 'צור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
