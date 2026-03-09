import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  LifeBuoy, Plus, MessageCircle, Clock, CheckCircle, AlertCircle,
  ChevronLeft, Send, X,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'פתוח',
  IN_PROGRESS: 'בטיפול',
  WAITING_FOR_CUSTOMER: 'ממתין לתגובה',
  RESOLVED: 'נפתר',
  CLOSED: 'סגור',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  WAITING_FOR_CUSTOMER: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'נמוכה', MEDIUM: 'בינונית', HIGH: 'גבוהה', URGENT: 'דחוף',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-500', MEDIUM: 'text-blue-600', HIGH: 'text-orange-600', URGENT: 'text-red-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'כללי', billing: 'חיוב', technical: 'טכני', feature_request: 'בקשת פיצ\'ר', bug: 'באג',
};

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all');

  const { data: tickets = [] } = useQuery<any[]>({
    queryKey: ['support-tickets', filter],
    queryFn: () => api.get('/support', { params: filter !== 'all' ? { status: filter } : {} })
      .then(r => r.data.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['support-ticket', selectedId],
    queryFn: () => api.get(`/support/${selectedId}`).then(r => r.data.data),
    enabled: !!selectedId,
  });

  const filters = [
    { key: 'all', label: 'הכל' },
    { key: 'OPEN', label: 'פתוחים' },
    { key: 'IN_PROGRESS', label: 'בטיפול' },
    { key: 'WAITING_FOR_CUSTOMER', label: 'ממתין' },
    { key: 'RESOLVED', label: 'נפתרו' },
  ];

  const openCount = tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <LifeBuoy className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">תמיכה</h1>
            <p className="text-sm text-gray-500">פתח קריאת תמיכה לצוות הפלטפורמה</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl hover:bg-purple-700 font-medium shadow-sm">
          <Plus className="w-4 h-4" /> קריאה חדשה
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-blue-600">{openCount}</div>
          <div className="text-sm text-gray-500">קריאות פתוחות</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-green-600">{resolvedCount}</div>
          <div className="text-sm text-gray-500">נפתרו</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-600">{tickets.length}</div>
          <div className="text-sm text-gray-500">סה"כ קריאות</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex gap-6">
        {/* Tickets List */}
        <div className={`${selectedId ? 'w-1/3' : 'w-full'} space-y-2`}>
          {tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">אין קריאות תמיכה</p>
              <button onClick={() => setShowCreate(true)}
                className="text-purple-600 hover:underline text-sm mt-2">
                פתח קריאה ראשונה
              </button>
            </div>
          ) : (
            tickets.map((t: any) => (
              <div key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-shadow ${
                  selectedId === t.id ? 'ring-2 ring-purple-500 border-purple-300' : ''
                }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono text-purple-500">{t.ticketNumber}</span>
                    <h3 className="font-medium text-gray-800 truncate">{t.subject}</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${STATUS_COLORS[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{CATEGORY_LABELS[t.category] || t.category}</span>
                  <span className={PRIORITY_COLORS[t.priority]}>{PRIORITY_LABELS[t.priority]}</span>
                  <span className="mr-auto">{new Date(t.createdAt).toLocaleDateString('he-IL')}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Ticket Detail */}
        {selectedId && detail && (
          <TicketDetail
            ticket={detail}
            onClose={() => setSelectedId(null)}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['support-ticket', selectedId] });
              queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
            }}
          />
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Ticket Detail ──────────────────────────────────────────────

function TicketDetail({ ticket, onClose, onRefresh }: { ticket: any; onClose: () => void; onRefresh: () => void }) {
  const [newMessage, setNewMessage] = useState('');

  const sendMutation = useMutation({
    mutationFn: (msg: string) => api.post(`/support/${ticket.id}/messages`, { message: msg }),
    onSuccess: () => { setNewMessage(''); onRefresh(); },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.patch(`/support/${ticket.id}/close`),
    onSuccess: onRefresh,
  });

  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];

  return (
    <div className="flex-1 bg-white rounded-xl border flex flex-col max-h-[calc(100vh-280px)]">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-purple-500">{ticket.ticketNumber}</span>
          <h2 className="font-bold text-gray-800">{ticket.subject}</h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[ticket.status]}`}>
              {STATUS_LABELS[ticket.status]}
            </span>
            <span>{CATEGORY_LABELS[ticket.category]}</span>
            <span className={PRIORITY_COLORS[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ticket.status !== 'CLOSED' && (
            <button onClick={() => closeMutation.mutate()}
              className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded">
              סגור קריאה
            </button>
          )}
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg: any, i: number) => (
          <div key={i} className={`flex ${msg.senderType === 'platform' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.senderType === 'platform'
                ? 'bg-purple-50 text-purple-900'
                : 'bg-blue-600 text-white'
            }`}>
              <div className="text-xs opacity-70 mb-1 flex items-center gap-1">
                {msg.senderType === 'platform' ? (
                  <><LifeBuoy className="w-3 h-3" /> צוות הפלטפורמה</>
                ) : (
                  <>{msg.sender}</>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
              <div className="text-[10px] opacity-50 mt-1">
                {new Date(msg.createdAt).toLocaleString('he-IL')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply input */}
      {ticket.status !== 'CLOSED' && (
        <div className="border-t px-4 py-3 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newMessage.trim()) sendMutation.mutate(newMessage.trim()); }}
            placeholder="הקלד תגובה..."
            className="flex-1 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <button onClick={() => { if (newMessage.trim()) sendMutation.mutate(newMessage.trim()); }}
            disabled={!newMessage.trim() || sendMutation.isPending}
            className="bg-purple-600 text-white p-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Create Ticket Modal ────────────────────────────────────────

function CreateTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('MEDIUM');

  const mutation = useMutation({
    mutationFn: () => api.post('/support', { subject, description, category, priority }),
    onSuccess: onCreated,
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-purple-600" /> קריאת תמיכה חדשה
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">נושא *</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="תאר בקצרה את הבעיה"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="general">כללי</option>
                <option value="billing">חיוב</option>
                <option value="technical">טכני</option>
                <option value="feature_request">בקשת פיצ'ר</option>
                <option value="bug">באג</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="LOW">נמוכה</option>
                <option value="MEDIUM">בינונית</option>
                <option value="HIGH">גבוהה</option>
                <option value="URGENT">דחוף</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="תאר את הבעיה בפירוט, כולל שלבים לשחזור אם רלוונטי"
              rows={5}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => mutation.mutate()}
              disabled={!subject.trim() || !description.trim() || mutation.isPending}
              className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-40">
              {mutation.isPending ? 'שולח...' : 'שלח קריאה'}
            </button>
            <button onClick={onClose}
              className="px-6 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 font-medium">
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
