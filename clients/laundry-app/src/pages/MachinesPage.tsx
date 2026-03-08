import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  WashingMachine, Activity, Wrench, XCircle, CheckCircle,
  Plus, X, Timer, ShoppingBag, Zap, Settings,
} from 'lucide-react';

const TYPE_LABELS: Record<string, string> = { WASHER: 'מכונת כביסה', DRYER: 'מייבש', IRONER: 'מגהץ', FOLDER: 'מקפלת' };
const TYPE_OPTIONS = [
  { value: 'WASHER', label: 'מכונת כביסה' },
  { value: 'DRYER', label: 'מייבש' },
  { value: 'IRONER', label: 'מגהץ' },
  { value: 'FOLDER', label: 'מקפלת' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  AVAILABLE: { label: 'פנויה', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, bg: 'border-green-300' },
  RUNNING: { label: 'פעילה', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Activity, bg: 'border-blue-400 ring-2 ring-blue-200' },
  MAINTENANCE: { label: 'בתחזוקה', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Wrench, bg: 'border-yellow-300' },
  OUT_OF_SERVICE: { label: 'מושבתת', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, bg: 'border-red-300' },
};

export default function MachinesPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'queue'>('grid');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('WASHER');
  const [newCapacity, setNewCapacity] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['machines-dashboard'],
    queryFn: () => api.get('/machines/dashboard').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: orders } = useQuery({
    queryKey: ['orders-active'],
    queryFn: () => api.get('/orders', { params: { status: 'PROCESSING', limit: 100 } }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/machines/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-dashboard'] });
      addToast('סטטוס מכונה עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס', 'error'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/machines', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-dashboard'] });
      setShowCreate(false);
      setNewName('');
      setNewCapacity('');
      addToast('מכונה נוספה בהצלחה');
    },
    onError: () => addToast('שגיאה בהוספת מכונה', 'error'),
  });

  const activeOrders = orders?.orders ?? [];

  if (isLoading) return <div className="p-6 text-center text-gray-400">טוען...</div>;

  const machines = data?.machines ?? [];
  const runningMachines = machines.filter((m: any) => m.status === 'RUNNING');
  const availableMachines = machines.filter((m: any) => m.status === 'AVAILABLE');
  const otherMachines = machines.filter((m: any) => m.status !== 'RUNNING' && m.status !== 'AVAILABLE');

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <WashingMachine className="w-7 h-7 text-blue-600" /> מכונות
        </h1>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'grid' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
              }`}>רשת</button>
            <button onClick={() => setViewMode('queue')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'queue' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
              }`}>תור</button>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="w-4 h-4" /> מכונה חדשה
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard value={data?.total} label="סה״כ" color="bg-white" />
        <SummaryCard value={data?.available} label="פנויות" color="bg-green-50 border-green-200" textColor="text-green-700" />
        <SummaryCard value={data?.running} label="פעילות" color="bg-blue-50 border-blue-200" textColor="text-blue-700" />
        <SummaryCard value={data?.maintenance} label="בתחזוקה" color="bg-yellow-50 border-yellow-200" textColor="text-yellow-700" />
        <SummaryCard value={`${data?.utilization ?? 0}%`} label="ניצולת" color="bg-indigo-50 border-indigo-200" textColor="text-indigo-700" />
      </div>

      {viewMode === 'queue' ? (
        /* Queue View */
        <div className="space-y-4">
          {/* Running */}
          {runningMachines.length > 0 && (
            <div>
              <h2 className="font-semibold text-blue-700 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" /> פועלות כרגע ({runningMachines.length})
              </h2>
              <div className="space-y-2">
                {runningMachines.map((m: any) => (
                  <div key={m.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <WashingMachine className="w-6 h-6 text-blue-600 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">{m.name}</h3>
                        <span className="text-xs text-gray-500">{TYPE_LABELS[m.type]} {m.capacity ? `| ${m.capacity} ק"ג` : ''}</span>
                      </div>
                    </div>
                    {m.currentOrder && (
                      <div className="text-sm bg-white rounded-lg px-3 py-1.5 border">
                        <span className="text-gray-500">הזמנה:</span>{' '}
                        <span className="font-mono text-blue-600">{m.currentOrder.orderNumber}</span>
                      </div>
                    )}
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'AVAILABLE' })}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                      סיום סייקל
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waiting orders */}
          {activeOrders.length > 0 && (
            <div>
              <h2 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" /> הזמנות בתהליך ({activeOrders.length})
              </h2>
              <div className="space-y-2">
                {activeOrders.map((o: any) => (
                  <div key={o.id} className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm text-blue-600">{o.orderNumber}</span>
                      <p className="text-sm text-gray-600">{o.customer?.name} — {o.items?.length ?? 0} פריטים</p>
                    </div>
                    {o.priority === 'EXPRESS' && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-orange-200 text-orange-800 rounded-full text-xs font-medium">
                        <Zap className="w-3 h-3" /> אקספרס
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available */}
          {availableMachines.length > 0 && (
            <div>
              <h2 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> פנויות ({availableMachines.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {availableMachines.map((m: any) => (
                  <div key={m.id} className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <WashingMachine className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="font-medium text-gray-800">{m.name}</h3>
                        <span className="text-xs text-gray-500">{TYPE_LABELS[m.type]} {m.capacity ? `| ${m.capacity} ק"ג` : ''}</span>
                      </div>
                    </div>
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'RUNNING' })}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      הפעל
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {machines.map((m: any) => {
            const cfg = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.AVAILABLE;
            const Icon = cfg.icon;
            return (
              <div key={m.id} className={`bg-white rounded-xl shadow-sm border p-5 ${cfg.bg}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">{m.name}</h3>
                    <span className="text-xs text-gray-500">{TYPE_LABELS[m.type]} {m.capacity ? `| ${m.capacity} ק"ג` : ''}</span>
                  </div>
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                    <Icon className="w-3.5 h-3.5" /> {cfg.label}
                  </span>
                </div>

                {m.currentOrder && (
                  <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2 text-sm border border-blue-100">
                    <div className="flex items-center gap-1 text-blue-700">
                      <ShoppingBag className="w-3 h-3" />
                      <span className="font-mono text-xs">{m.currentOrder.orderNumber}</span>
                    </div>
                    <div className="text-xs text-gray-500">{m.currentOrder.customer?.name}</div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5" /> {m.totalCycles?.toLocaleString() ?? 0} סייקלים
                  </span>
                  {m.lastMaintenanceAt && (
                    <span className="text-xs text-gray-400">
                      תחזוקה: {new Date(m.lastMaintenanceAt).toLocaleDateString('he-IL')}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  {m.status === 'AVAILABLE' && (
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'RUNNING' })}
                      className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium">הפעל</button>
                  )}
                  {m.status === 'RUNNING' && (
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'AVAILABLE' })}
                      className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium">סיים</button>
                  )}
                  {m.status !== 'MAINTENANCE' && (
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'MAINTENANCE' })}
                      className="text-xs px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 font-medium">תחזוקה</button>
                  )}
                  {m.status === 'MAINTENANCE' && (
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'AVAILABLE' })}
                      className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium">החזר</button>
                  )}
                  {m.status !== 'OUT_OF_SERVICE' && (
                    <button onClick={() => statusMutation.mutate({ id: m.id, status: 'OUT_OF_SERVICE' })}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 font-medium">השבת</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {machines.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <WashingMachine className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">אין מכונות</p>
          <p className="text-sm">הוסף מכונה חדשה להתחיל</p>
        </div>
      )}

      {/* Create Machine Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">מכונה חדשה</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם מכונה *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder='לדוגמה: מכונה 1, מייבש A'
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">סוג מכונה</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPE_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => setNewType(t.value)}
                      className={`py-2.5 rounded-lg text-sm font-medium ${
                        newType === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">קיבולת (ק"ג, אופציונלי)</label>
                <input type="number" value={newCapacity} onChange={e => setNewCapacity(e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => newName && createMutation.mutate({
                  name: newName,
                  type: newType,
                  capacity: newCapacity ? Number(newCapacity) : undefined,
                })}
                disabled={!newName || createMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createMutation.isPending ? 'שומר...' : 'הוסף מכונה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ value, label, color, textColor }: { value: any; label: string; color: string; textColor?: string }) {
  return (
    <div className={`rounded-xl shadow-sm border p-4 text-center ${color}`}>
      <div className={`text-2xl font-bold ${textColor || 'text-gray-800'}`}>{value}</div>
      <div className={`text-sm ${textColor ? textColor.replace('700', '600') : 'text-gray-500'}`}>{label}</div>
    </div>
  );
}
