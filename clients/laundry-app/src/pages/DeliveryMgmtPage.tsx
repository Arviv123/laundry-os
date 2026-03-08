import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Package, MapPin, Plus, X, User, Clock, CheckCircle,
  Loader2, AlertTriangle, Zap, ChevronLeft, PenTool, Lock, Unlock,
  Route, Eye,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין', ACCEPTED: 'התקבל', IN_PROGRESS: 'בדרך',
  COMPLETED: 'הושלם', FAILED: 'נכשל',
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function DeliveryMgmtPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'assignments' | 'runs'>('assignments');

  // Fetch assignments
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['delivery-assignments'],
    queryFn: () => api.get('/delivery-mgmt/assignments').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  // Fetch drivers
  const { data: drivers = [] } = useQuery({
    queryKey: ['delivery-drivers'],
    queryFn: () => api.get('/delivery-mgmt/drivers').then(r => r.data.data).catch(() => []),
  });

  // Fetch pending delivery orders for assignment creation
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ['pending-delivery-orders'],
    queryFn: () => api.get('/orders?deliveryType=HOME_DELIVERY&status=RECEIVED,READY').then(r => r.data.data).catch(() => []),
  });

  // Create assignment
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/delivery-mgmt/assignments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['pending-delivery-orders'] });
      setShowCreate(false);
      addToast('הקצאה נוצרה בהצלחה');
    },
    onError: () => addToast('שגיאה ביצירת הקצאה', 'error'),
  });

  // Update assignment status
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/delivery-mgmt/assignments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-assignments'] });
      addToast('סטטוס עודכן');
    },
    onError: () => addToast('שגיאה בעדכון', 'error'),
  });

  // Complete assignment
  const completeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/delivery-mgmt/assignments/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-assignments'] });
      setSelectedAssignment(null);
      addToast('הקצאה הושלמה');
    },
    onError: () => addToast('שגיאה בהשלמה', 'error'),
  });

  // Auto-assign
  const autoAssignMutation = useMutation({
    mutationFn: () => api.post('/delivery-mgmt/auto-assign'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['pending-delivery-orders'] });
      const count = res.data.data?.assigned ?? 0;
      addToast(`${count} הקצאות נוצרו אוטומטית`);
    },
    onError: () => addToast('שגיאה בהקצאה אוטומטית', 'error'),
  });

  // Sign assignment
  const signMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.post(`/delivery-mgmt/assignments/${id}/sign`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-assignments'] });
      setSelectedAssignment(null);
      addToast('חתימה נשמרה');
    },
    onError: () => addToast('שגיאה בשמירת חתימה', 'error'),
  });

  // ─── Runs ──────────────────────────────────────────────────
  const { data: runs = [] } = useQuery({
    queryKey: ['delivery-runs-mgmt'],
    queryFn: () => api.get('/delivery/runs').then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const createRunMutation = useMutation({
    mutationFn: (data: any) => api.post('/delivery/runs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-runs-mgmt'] });
      setShowCreateRun(false);
      addToast('סיבוב נוצר בהצלחה');
    },
    onError: () => addToast('שגיאה ביצירת סיבוב', 'error'),
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, lock }: { id: string; lock: boolean }) =>
      api.patch(`/delivery/runs/${id}/${lock ? 'lock' : 'unlock'}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-runs-mgmt'] });
      addToast('סטטוס נעילה עודכן');
    },
    onError: () => addToast('שגיאה בעדכון נעילה', 'error'),
  });

  const pickups = assignments.filter((a: any) => a.type === 'PICKUP' && a.status !== 'COMPLETED');
  const deliveriesActive = assignments.filter((a: any) => a.type === 'DELIVERY' && a.status !== 'COMPLETED');
  const completed = assignments.filter((a: any) => a.status === 'COMPLETED');

  const getDriverName = (assignment: any) => {
    if (assignment.driver) {
      return `${assignment.driver.firstName} ${assignment.driver.lastName}`;
    }
    const driver = drivers.find((d: any) => d.id === assignment.driverId);
    return driver ? `${driver.firstName} ${driver.lastName}` : 'לא ידוע';
  };

  const getCustomerName = (assignment: any) => {
    return assignment.order?.customer?.name || 'לקוח לא ידוע';
  };

  const getAddress = (assignment: any) => {
    const addr = assignment.order?.deliveryAddress;
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    return [addr.street, addr.city].filter(Boolean).join(', ');
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Truck className="w-7 h-7 text-blue-600" /> ניהול משלוחים
        </h1>
        <div className="flex items-center gap-3">
          {activeTab === 'assignments' && (
            <>
              <button onClick={() => autoAssignMutation.mutate()} disabled={autoAssignMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
                {autoAssignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                הקצאה אוטומטית
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> הקצאה חדשה
              </button>
            </>
          )}
          {activeTab === 'runs' && (
            <button onClick={() => setShowCreateRun(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> צור סיבוב
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 max-w-xs">
        <button onClick={() => setActiveTab('assignments')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'assignments' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
          }`}>הקצאות</button>
        <button onClick={() => setActiveTab('runs')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'runs' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
          }`}>סיבובים ({runs.length})</button>
      </div>

      {/* Stats */}
      {activeTab === 'assignments' && <>
      <div className="flex gap-4 text-sm flex-wrap">
        <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg">
          <Package className="w-4 h-4 text-orange-500" />
          <span className="font-bold text-orange-700">{pickups.length}</span>
          <span className="text-orange-600">איסופים</span>
        </div>
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
          <MapPin className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-blue-700">{deliveriesActive.length}</span>
          <span className="text-blue-600">משלוחים</span>
        </div>
        <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="font-bold text-green-700">{completed.length}</span>
          <span className="text-green-600">הושלמו</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pickups Column */}
          <div>
            <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" /> לאיסוף
            </h2>
            <div className="space-y-3">
              {pickups.length === 0 ? (
                <EmptyColumn icon={Package} text="אין איסופים ממתינים" />
              ) : (
                pickups.map((assignment: any) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    driverName={getDriverName(assignment)}
                    customerName={getCustomerName(assignment)}
                    address={getAddress(assignment)}
                    onSelect={() => setSelectedAssignment(assignment)}
                    onStatusChange={(status) => updateMutation.mutate({ id: assignment.id, data: { status } })}
                    onComplete={() => completeMutation.mutate(assignment.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Deliveries Column */}
          <div>
            <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-500" /> למשלוח
            </h2>
            <div className="space-y-3">
              {deliveriesActive.length === 0 ? (
                <EmptyColumn icon={MapPin} text="אין משלוחים ממתינים" />
              ) : (
                deliveriesActive.map((assignment: any) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    driverName={getDriverName(assignment)}
                    customerName={getCustomerName(assignment)}
                    address={getAddress(assignment)}
                    onSelect={() => setSelectedAssignment(assignment)}
                    onStatusChange={(status) => updateMutation.mutate({ id: assignment.id, data: { status } })}
                    onComplete={() => completeMutation.mutate(assignment.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
      </>}

      {/* Runs Tab */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          {runs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Route className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">אין סיבובים. צור סיבוב חדש כדי להתחיל.</p>
            </div>
          ) : (
            runs.map((run: any) => {
              const completedStops = run.stops?.filter((s: any) => s.status === 'STOP_COMPLETED').length ?? 0;
              const totalStops = run.stops?.length ?? 0;
              const progress = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
              const driverName = run.driver ? `${run.driver.firstName} ${run.driver.lastName}` : 'לא מוקצה';
              return (
                <div key={run.id} className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        run.status === 'COMPLETED_RUN' ? 'bg-green-100' :
                        run.status === 'IN_PROGRESS' ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <Truck className={`w-5 h-5 ${
                          run.status === 'COMPLETED_RUN' ? 'text-green-600' :
                          run.status === 'IN_PROGRESS' ? 'text-blue-600' : 'text-gray-500'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{driverName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            run.status === 'COMPLETED_RUN' ? 'bg-green-100 text-green-700' :
                            run.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {run.status === 'COMPLETED_RUN' ? 'הושלם' : run.status === 'IN_PROGRESS' ? 'בדרך' : 'מתוכנן'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{new Date(run.date).toLocaleDateString('he-IL')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Lock toggle */}
                      <button
                        onClick={() => lockMutation.mutate({ id: run.id, lock: !run.isLocked })}
                        disabled={lockMutation.isPending}
                        title={run.isLocked ? 'פתח לעריכה' : 'נעל סיבוב'}
                        className={`p-2 rounded-lg transition-colors ${
                          run.isLocked
                            ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {run.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                      {/* View run */}
                      <button
                        onClick={() => navigate(`/delivery/run/${run.id}`)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                        title="צפה בסיבוב"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-600">{completedStops}/{totalStops}</span>
                  </div>

                  {/* Stops summary */}
                  <div className="flex flex-wrap gap-1.5">
                    {(run.stops || []).map((stop: any, i: number) => (
                      <div key={stop.id} title={`${stop.order?.customer?.name || 'לקוח'} - ${stop.status}`}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                          stop.status === 'STOP_COMPLETED' ? 'bg-green-100 text-green-700' :
                          stop.status === 'ARRIVED' ? 'bg-blue-100 text-blue-700' :
                          stop.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create Run Modal */}
      {showCreateRun && (
        <CreateRunModal
          drivers={drivers}
          orders={pendingOrders}
          onClose={() => setShowCreateRun(false)}
          onSubmit={(data) => createRunMutation.mutate(data)}
          isSubmitting={createRunMutation.isPending}
        />
      )}

      {/* Create Assignment Modal */}
      {showCreate && (
        <CreateAssignmentModal
          drivers={drivers}
          orders={pendingOrders}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Assignment Detail Drawer */}
      {selectedAssignment && (
        <AssignmentDrawer
          assignment={selectedAssignment}
          driverName={getDriverName(selectedAssignment)}
          customerName={getCustomerName(selectedAssignment)}
          address={getAddress(selectedAssignment)}
          onClose={() => setSelectedAssignment(null)}
          onStatusChange={(status) => updateMutation.mutate({ id: selectedAssignment.id, data: { status } })}
          onComplete={() => completeMutation.mutate(selectedAssignment.id)}
          onSign={(data) => signMutation.mutate({ id: selectedAssignment.id, data })}
          isSignSubmitting={signMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function EmptyColumn({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
      <Icon className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function AssignmentCard({ assignment, driverName, customerName, address, onSelect, onStatusChange, onComplete }: {
  assignment: any; driverName: string; customerName: string; address: string;
  onSelect: () => void; onStatusChange: (status: string) => void; onComplete: () => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onSelect}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-blue-600">{assignment.order?.orderNumber || '---'}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[assignment.status]}`}>
              {STATUS_LABELS[assignment.status]}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800">{customerName}</p>
        </div>
        {assignment.type === 'PICKUP' ? (
          <Package className="w-5 h-5 text-orange-400 flex-shrink-0" />
        ) : (
          <MapPin className="w-5 h-5 text-blue-400 flex-shrink-0" />
        )}
      </div>
      {address && (
        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {address}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" /> {driverName}
        </span>
        {assignment.scheduledAt && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {new Date(assignment.scheduledAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>
      <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
        {assignment.status === 'PENDING' && (
          <button onClick={() => onStatusChange('IN_PROGRESS')}
            className="flex-1 text-center py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100">
            התחל
          </button>
        )}
        {(assignment.status === 'IN_PROGRESS' || assignment.status === 'ACCEPTED') && (
          <button onClick={onComplete}
            className="flex-1 text-center py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100">
            סיים
          </button>
        )}
      </div>
    </div>
  );
}

function CreateAssignmentModal({ drivers, orders, onClose, onSubmit, isSubmitting }: {
  drivers: any[]; orders: any[]; onClose: () => void; onSubmit: (data: any) => void; isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    orderId: '',
    driverId: '',
    type: 'DELIVERY' as 'PICKUP' | 'DELIVERY',
    scheduledAt: '',
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      orderId: form.orderId,
      driverId: form.driverId,
      type: form.type,
    };
    if (form.scheduledAt) payload.scheduledAt = new Date(form.scheduledAt).toISOString();
    if (form.notes) payload.notes = form.notes;
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">הקצאה חדשה</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הזמנה *</label>
            <select value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
              <option value="">בחר הזמנה</option>
              {(Array.isArray(orders) ? orders : []).map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} - {o.customer?.name || 'לקוח'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">נהג *</label>
            <select value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
              <option value="">בחר נהג</option>
              {drivers.map((d: any) => (
                <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סוג</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="PICKUP">איסוף</option>
                <option value="DELIVERY">משלוח</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">זמן מתוכנן</label>
              <input type="datetime-local" value={form.scheduledAt}
                onChange={e => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">ביטול</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              צור הקצאה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateRunModal({ drivers, orders, onClose, onSubmit, isSubmitting }: {
  drivers: any[]; orders: any[]; onClose: () => void; onSubmit: (data: any) => void; isSubmitting: boolean;
}) {
  const [driverId, setDriverId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const ordersList = Array.isArray(orders) ? (orders as any).orders || orders : [];

  const toggleOrder = (orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stops = selectedOrders.map((orderId, i) => {
      const order = ordersList.find((o: any) => o.id === orderId);
      const addr = order?.deliveryAddress || {};
      return {
        orderId,
        type: order?.status === 'RECEIVED' ? 'PICKUP_STOP' as const : 'DELIVERY_STOP' as const,
        address: typeof addr === 'string' ? { street: addr } : addr,
        sortOrder: i,
      };
    });
    onSubmit({
      driverId,
      date: new Date(date).toISOString(),
      stops,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-600" /> צור סיבוב חדש
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">נהג *</label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
                <option value="">בחר נהג</option>
                {drivers.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              בחר הזמנות ({selectedOrders.length} נבחרו)
            </label>
            <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto">
              {ordersList.length === 0 ? (
                <p className="text-center py-4 text-gray-400 text-sm">אין הזמנות ממתינות</p>
              ) : (
                ordersList.map((order: any) => (
                  <label key={order.id}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ${
                      selectedOrders.includes(order.id) ? 'bg-blue-50' : ''
                    }`}>
                    <input type="checkbox" checked={selectedOrders.includes(order.id)}
                      onChange={() => toggleOrder(order.id)}
                      className="rounded border-gray-300 text-blue-600" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-blue-600">{order.orderNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          order.status === 'RECEIVED' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {order.status === 'RECEIVED' ? 'איסוף' : 'משלוח'}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600 truncate block">{order.customer?.name}</span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">ביטול</button>
            <button type="submit" disabled={isSubmitting || selectedOrders.length === 0 || !driverId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              צור סיבוב ({selectedOrders.length} עצירות)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignmentDrawer({ assignment, driverName, customerName, address, onClose, onStatusChange, onComplete, onSign, isSignSubmitting }: {
  assignment: any; driverName: string; customerName: string; address: string;
  onClose: () => void; onStatusChange: (status: string) => void; onComplete: () => void;
  onSign: (data: any) => void; isSignSubmitting: boolean;
}) {
  const [signedBy, setSignedBy] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-start z-50">
      <div className="bg-white w-full max-w-md shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {assignment.type === 'PICKUP' ? (
              <><Package className="w-5 h-5 text-orange-500" /> פרטי איסוף</>
            ) : (
              <><MapPin className="w-5 h-5 text-blue-500" /> פרטי משלוח</>
            )}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[assignment.status]}`}>
              {STATUS_LABELS[assignment.status]}
            </span>
            <span className="text-sm text-gray-400">
              {assignment.type === 'PICKUP' ? 'איסוף' : 'משלוח'}
            </span>
          </div>

          {/* Order Info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">פרטי הזמנה</h3>
            <div className="text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">מספר הזמנה:</span>
                <span className="font-mono text-blue-600">{assignment.order?.orderNumber || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">לקוח:</span>
                <span className="font-medium">{customerName}</span>
              </div>
              {address && (
                <div className="flex justify-between">
                  <span className="text-gray-500">כתובת:</span>
                  <span>{address}</span>
                </div>
              )}
              {assignment.order?.total && (
                <div className="flex justify-between">
                  <span className="text-gray-500">סכום:</span>
                  <span className="font-medium">{Number(assignment.order.total).toLocaleString()} ₪</span>
                </div>
              )}
            </div>
          </div>

          {/* Driver Info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">נהג</h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <span className="font-medium">{driverName}</span>
            </div>
          </div>

          {/* Schedule */}
          {assignment.scheduledAt && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">מועד מתוכנן</h3>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                {new Date(assignment.scheduledAt).toLocaleString('he-IL')}
              </div>
            </div>
          )}

          {/* Notes */}
          {assignment.notes && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">הערות</h3>
              <p className="text-sm text-gray-600">{assignment.notes}</p>
            </div>
          )}

          {/* Signature Section */}
          {assignment.status !== 'COMPLETED' && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <PenTool className="w-4 h-4" /> חתימה דיגיטלית
              </h3>
              <p className="text-xs text-gray-400">שם החותם (הלקוח/מקבל):</p>
              <input type="text" value={signedBy} onChange={e => setSignedBy(e.target.value)}
                placeholder="הזן שם מלא"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="border-2 border-dashed border-gray-300 rounded-xl h-32 flex items-center justify-center text-gray-400 text-sm">
                אזור חתימה (בפיתוח)
              </div>
              <button
                disabled={!signedBy || isSignSubmitting}
                onClick={() => onSign({ signatureData: 'placeholder-signature', signedBy })}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {isSignSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                שמור חתימה
              </button>
            </div>
          )}

          {/* Signature Display */}
          {assignment.signedBy && (
            <div className="bg-green-50 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> נחתם
              </h3>
              <p className="text-sm">חתום ע"י: {assignment.signedBy}</p>
              {assignment.signedAt && (
                <p className="text-xs text-gray-500">בתאריך: {new Date(assignment.signedAt).toLocaleString('he-IL')}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t p-4 space-y-2">
          {assignment.status === 'PENDING' && (
            <button onClick={() => onStatusChange('IN_PROGRESS')}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
              <Truck className="w-4 h-4" /> התחל נסיעה
            </button>
          )}
          {(assignment.status === 'IN_PROGRESS' || assignment.status === 'ACCEPTED') && (
            <button onClick={onComplete}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> סיים הקצאה
            </button>
          )}
          {assignment.status !== 'COMPLETED' && assignment.status !== 'FAILED' && (
            <button onClick={() => onStatusChange('FAILED')}
              className="w-full py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4" /> סמן כנכשל
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
