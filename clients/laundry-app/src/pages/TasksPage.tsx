import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  ClipboardList, Plus, CheckCircle, Clock, AlertTriangle, X,
  User, Calendar, Tag, Filter, Loader2, Trash2, Edit3,
} from 'lucide-react';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const CATEGORIES = ['cleaning', 'maintenance', 'delivery', 'admin', 'other'] as const;

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'נמוכה', NORMAL: 'רגילה', HIGH: 'גבוהה', URGENT: 'דחוף',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתינה', IN_PROGRESS: 'בביצוע', COMPLETED: 'הושלמה', CANCELLED: 'בוטלה',
};
const CATEGORY_LABELS: Record<string, string> = {
  cleaning: 'ניקיון', maintenance: 'תחזוקה', delivery: 'משלוח', admin: 'מנהלי', other: 'אחר',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', myTasksOnly, filterStatus, filterPriority, filterCategory],
    queryFn: async () => {
      const endpoint = myTasksOnly ? '/tasks/my' : '/tasks';
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterCategory) params.set('category', filterCategory);
      const qs = params.toString();
      const url = qs ? `${endpoint}?${qs}` : endpoint;
      return api.get(url).then(r => r.data.data);
    },
  });

  // Fetch users for assignee dropdown
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data).catch(() => []),
  });

  // Create task
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/tasks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreate(false);
      addToast('משימה נוצרה בהצלחה');
    },
    onError: () => addToast('שגיאה ביצירת משימה', 'error'),
  });

  // Update task
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTask(null);
      addToast('משימה עודכנה');
    },
    onError: () => addToast('שגיאה בעדכון משימה', 'error'),
  });

  // Complete task
  const completeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      addToast('משימה הושלמה');
    },
    onError: () => addToast('שגיאה בהשלמת משימה', 'error'),
  });

  // Delete task
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      addToast('משימה נמחקה');
    },
    onError: () => addToast('שגיאה במחיקת משימה', 'error'),
  });

  const getUserName = (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : userId;
  };

  const statusCounts = {
    all: tasks.length,
    PENDING: tasks.filter((t: any) => t.status === 'PENDING').length,
    IN_PROGRESS: tasks.filter((t: any) => t.status === 'IN_PROGRESS').length,
    COMPLETED: tasks.filter((t: any) => t.status === 'COMPLETED').length,
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <ClipboardList className="w-7 h-7 text-blue-600" /> משימות
        </h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={myTasksOnly} onChange={e => setMyTasksOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            המשימות שלי
          </label>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> משימה חדשה
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 flex-wrap">
        <StatusPill label="הכל" count={statusCounts.all} active={filterStatus === ''} onClick={() => setFilterStatus('')} />
        <StatusPill label="ממתינות" count={statusCounts.PENDING} active={filterStatus === 'PENDING'}
          onClick={() => setFilterStatus(filterStatus === 'PENDING' ? '' : 'PENDING')} color="yellow" />
        <StatusPill label="בביצוע" count={statusCounts.IN_PROGRESS} active={filterStatus === 'IN_PROGRESS'}
          onClick={() => setFilterStatus(filterStatus === 'IN_PROGRESS' ? '' : 'IN_PROGRESS')} color="blue" />
        <StatusPill label="הושלמו" count={statusCounts.COMPLETED} active={filterStatus === 'COMPLETED'}
          onClick={() => setFilterStatus(filterStatus === 'COMPLETED' ? '' : 'COMPLETED')} color="green" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">כל העדיפויות</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">כל הקטגוריות</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {tasks.map((task: any) => (
            <div key={task.id} className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow ${
              task.priority === 'URGENT' ? 'border-red-300 bg-red-50/30' :
              task.priority === 'HIGH' ? 'border-orange-200' : ''
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className={`font-semibold text-gray-800 ${task.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}`}>
                      {task.title}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PRIORITY_COLORS[task.priority]}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    {task.category && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-600">
                        {CATEGORY_LABELS[task.category] || task.category}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-gray-500 mb-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    {task.assignedTo && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {getUserName(task.assignedTo)}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(task.dueDate).toLocaleDateString('he-IL')}
                      </span>
                    )}
                    {task.orderId && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" /> הזמנה: {task.orderId.slice(-6)}
                      </span>
                    )}
                  </div>
                  {task.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">{task.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                    <button onClick={() => completeMutation.mutate(task.id)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="סמן כהושלם">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setEditingTask(task)}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" title="ערוך">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm('למחוק משימה?')) deleteMutation.mutate(task.id); }}
                    className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg" title="מחק">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <TaskModal
          title="משימה חדשה"
          users={users}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Edit Modal */}
      {editingTask && (
        <TaskModal
          title="עריכת משימה"
          users={users}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingTask.id, data })}
          isSubmitting={updateMutation.isPending}
          showStatus
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function StatusPill({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void; color?: string;
}) {
  const base = active
    ? color === 'yellow' ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
    : color === 'blue' ? 'bg-blue-100 border-blue-300 text-blue-800'
    : color === 'green' ? 'bg-green-100 border-green-300 text-green-800'
    : 'bg-blue-50 border-blue-300 text-blue-700'
    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50';

  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${base}`}>
      {label}
      <span className={`text-xs ${active ? '' : 'text-gray-400'}`}>({count})</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-400">
      <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-20" />
      <p className="text-lg font-medium mb-1">אין משימות</p>
      <p className="text-sm">צור משימה חדשה כדי להתחיל</p>
    </div>
  );
}

function TaskModal({ title, users, task, onClose, onSubmit, isSubmitting, showStatus }: {
  title: string;
  users: any[];
  task?: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
  showStatus?: boolean;
}) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignedTo: task?.assignedTo || '',
    priority: task?.priority || 'NORMAL',
    status: task?.status || 'PENDING',
    dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '',
    category: task?.category || '',
    notes: task?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      title: form.title,
      priority: form.priority,
    };
    if (form.description) payload.description = form.description;
    if (form.assignedTo) payload.assignedTo = form.assignedTo;
    if (form.dueDate) payload.dueDate = new Date(form.dueDate).toISOString();
    if (form.category) payload.category = form.category;
    if (form.notes) payload.notes = form.notes;
    if (showStatus) payload.status = form.status;
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כותרת *</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אחראי</label>
              <select value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">לא הוקצה</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">ללא</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
              <input type="datetime-local" value={form.dueDate}
                onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {showStatus && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          )}
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
              {task ? 'עדכון' : 'צור משימה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
