import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Zap, Plus, Pencil, Trash2, Play, Rocket, X,
  ToggleLeft, ToggleRight, Send, Clock, Hash,
  MessageSquare, Mail, Phone, Calendar,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const TRIGGERS: Record<string, string> = {
  ORDER_STATUS_CHANGE: 'שינוי סטטוס',
  ORDER_CREATED: 'הזמנה חדשה',
  CUSTOMER_BIRTHDAY: 'יום הולדת',
  CUSTOMER_INACTIVITY: 'חוסר פעילות',
  SCHEDULED: 'מתוזמן',
};

const CHANNELS: Record<string, string> = {
  WHATSAPP: 'וואטסאפ',
  SMS: 'SMS',
  EMAIL: 'אימייל',
};

const CHANNEL_ICONS: Record<string, typeof MessageSquare> = {
  WHATSAPP: MessageSquare,
  SMS: Phone,
  EMAIL: Mail,
};

const ORDER_STATUSES: Record<string, string> = {
  RECEIVED: 'התקבלה',
  PROCESSING: 'בטיפול',
  PACKAGING: 'אריזה',
  READY: 'מוכנה',
  OUT_FOR_DELIVERY: 'במשלוח',
  DELIVERED: 'נמסרה',
};

const CAMPAIGN_STATUSES: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'טיוטה', color: 'bg-gray-100 text-gray-700' },
  SCHEDULED: { label: 'מתוזמן', color: 'bg-blue-100 text-blue-700' },
  SENDING: { label: 'שולח', color: 'bg-yellow-100 text-yellow-700' },
  SENT: { label: 'נשלח', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'בוטל', color: 'bg-red-100 text-red-700' },
};

const SEGMENTS: Record<string, string> = {
  ALL: 'כל הלקוחות',
  INACTIVE: 'לא פעילים 30 יום',
  VIP: 'לקוחות VIP',
  NEW: 'לקוחות חדשים',
};

const TEMPLATE_VARS = [
  { key: '{{customerName}}', label: 'שם לקוח' },
  { key: '{{orderNumber}}', label: 'מס\' הזמנה' },
  { key: '{{status}}', label: 'סטטוס' },
  { key: '{{total}}', label: 'סה"כ' },
  { key: '{{businessName}}', label: 'שם העסק' },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'automations' | 'campaigns'>('automations');

  // Automation state
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [editingAuto, setEditingAuto] = useState<any>(null);
  const [testAutoId, setTestAutoId] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');

  // Automation form
  const [autoName, setAutoName] = useState('');
  const [autoTrigger, setAutoTrigger] = useState('ORDER_STATUS_CHANGE');
  const [autoChannel, setAutoChannel] = useState('WHATSAPP');
  const [autoTemplate, setAutoTemplate] = useState('');
  const [autoIsActive, setAutoIsActive] = useState(true);
  const [autoCondStatus, setAutoCondStatus] = useState('READY');
  const [autoCondInactiveDays, setAutoCondInactiveDays] = useState('30');
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // Campaign state
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [confirmSendCampaign, setConfirmSendCampaign] = useState<any>(null);

  // Campaign form
  const [campName, setCampName] = useState('');
  const [campChannel, setCampChannel] = useState('WHATSAPP');
  const [campTemplate, setCampTemplate] = useState('');
  const [campSegment, setCampSegment] = useState('ALL');
  const [campScheduledAt, setCampScheduledAt] = useState('');
  const campTemplateRef = useRef<HTMLTextAreaElement>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const { data: automations, isLoading: loadingAutos } = useQuery({
    queryKey: ['automations'],
    queryFn: () => api.get('/automations').then(r => r.data.data).catch(() => []),
  });

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/automations/campaigns').then(r => r.data.data).catch(() => []),
  });

  // ─── Automation Mutations ────────────────────────────────────────────────

  const createAutoMutation = useMutation({
    mutationFn: (data: any) => api.post('/automations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      resetAutoForm();
      addToast('אוטומציה נוצרה בהצלחה');
    },
    onError: () => addToast('שגיאה ביצירת אוטומציה', 'error'),
  });

  const updateAutoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/automations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      resetAutoForm();
      addToast('אוטומציה עודכנה');
    },
    onError: () => addToast('שגיאה בעדכון אוטומציה', 'error'),
  });

  const deleteAutoMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      addToast('אוטומציה נמחקה');
    },
    onError: () => addToast('שגיאה במחיקת אוטומציה', 'error'),
  });

  const toggleAutoMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/automations/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      addToast('סטטוס אוטומציה עודכן');
    },
    onError: () => addToast('שגיאה בעדכון סטטוס', 'error'),
  });

  const testAutoMutation = useMutation({
    mutationFn: ({ id, phone }: { id: string; phone: string }) =>
      api.post(`/automations/${id}/test`, { phone }),
    onSuccess: () => {
      setTestAutoId(null);
      setTestPhone('');
      addToast('הודעת טסט נשלחה בהצלחה');
    },
    onError: () => addToast('שגיאה בשליחת הודעת טסט', 'error'),
  });

  // ─── Campaign Mutations ──────────────────────────────────────────────────

  const createCampMutation = useMutation({
    mutationFn: (data: any) => api.post('/automations/campaigns', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      resetCampaignForm();
      addToast('קמפיין נוצר בהצלחה');
    },
    onError: () => addToast('שגיאה ביצירת קמפיין', 'error'),
  });

  const deleteCampMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/automations/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('קמפיין נמחק');
    },
    onError: () => addToast('שגיאה במחיקת קמפיין', 'error'),
  });

  const sendCampMutation = useMutation({
    mutationFn: (id: string) => api.post(`/automations/campaigns/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setConfirmSendCampaign(null);
      addToast('קמפיין נשלח בהצלחה');
    },
    onError: () => addToast('שגיאה בשליחת קמפיין', 'error'),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const resetAutoForm = () => {
    setShowAutoForm(false);
    setEditingAuto(null);
    setAutoName('');
    setAutoTrigger('ORDER_STATUS_CHANGE');
    setAutoChannel('WHATSAPP');
    setAutoTemplate('');
    setAutoIsActive(true);
    setAutoCondStatus('READY');
    setAutoCondInactiveDays('30');
  };

  const resetCampaignForm = () => {
    setShowCampaignForm(false);
    setCampName('');
    setCampChannel('WHATSAPP');
    setCampTemplate('');
    setCampSegment('ALL');
    setCampScheduledAt('');
  };

  const openEditAuto = (auto: any) => {
    setEditingAuto(auto);
    setAutoName(auto.name);
    setAutoTrigger(auto.trigger);
    setAutoChannel(auto.channel);
    setAutoTemplate(auto.template || '');
    setAutoIsActive(auto.isActive);
    setAutoCondStatus(auto.conditions?.status || 'READY');
    setAutoCondInactiveDays(String(auto.conditions?.inactiveDays || 30));
    setShowAutoForm(true);
  };

  const insertVariable = (varKey: string, ref: React.RefObject<HTMLTextAreaElement | null>, setter: (v: string) => void, current: string) => {
    const el = ref.current;
    if (!el) {
      setter(current + varKey);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newVal = current.slice(0, start) + varKey + current.slice(end);
    setter(newVal);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + varKey.length;
      el.focus();
    });
  };

  const handleAutoSubmit = () => {
    const conditions: any = {};
    if (autoTrigger === 'ORDER_STATUS_CHANGE') conditions.status = autoCondStatus;
    if (autoTrigger === 'CUSTOMER_INACTIVITY') conditions.inactiveDays = Number(autoCondInactiveDays);

    const payload = {
      name: autoName,
      trigger: autoTrigger,
      channel: autoChannel,
      template: autoTemplate,
      isActive: autoIsActive,
      conditions,
    };

    if (editingAuto) {
      updateAutoMutation.mutate({ id: editingAuto.id, data: payload });
    } else {
      createAutoMutation.mutate(payload);
    }
  };

  const handleCampaignSubmit = () => {
    const payload: any = {
      name: campName,
      channel: campChannel,
      template: campTemplate,
      targetQuery: { segment: campSegment },
    };
    if (campScheduledAt) payload.scheduledAt = new Date(campScheduledAt).toISOString();
    createCampMutation.mutate(payload);
  };

  const autoList = Array.isArray(automations) ? automations : [];
  const campList = Array.isArray(campaigns) ? campaigns : [];

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <Zap className="w-7 h-7 text-orange-600" /> אוטומציות ושיווק
        </h1>
        <button
          onClick={() => activeTab === 'automations' ? (resetAutoForm(), setShowAutoForm(true)) : (resetCampaignForm(), setShowCampaignForm(true))}
          className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'automations' ? 'אוטומציה חדשה' : 'קמפיין חדש'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('automations')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'automations' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> אוטומציות</span>
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'campaigns' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <span className="flex items-center gap-2"><Rocket className="w-4 h-4" /> קמפיינים</span>
        </button>
      </div>

      {/* ─── Automations Tab ──────────────────────────────────────────────── */}
      {activeTab === 'automations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingAutos && <p className="col-span-3 text-gray-400 text-sm">טוען...</p>}
          {!loadingAutos && autoList.length === 0 && (
            <p className="col-span-3 text-gray-400 text-sm">אין אוטומציות עדיין. צור את הראשונה!</p>
          )}
          {autoList.map((auto: any) => {
            const ChIcon = CHANNEL_ICONS[auto.channel] || MessageSquare;
            return (
              <div key={auto.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">{auto.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                        {TRIGGERS[auto.trigger] || auto.trigger}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ChIcon className="w-3 h-3" />
                        {CHANNELS[auto.channel] || auto.channel}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleAutoMutation.mutate({ id: auto.id, isActive: !auto.isActive })}
                    className="flex-shrink-0"
                    title={auto.isActive ? 'כבה' : 'הפעל'}
                  >
                    {auto.isActive
                      ? <ToggleRight className="w-7 h-7 text-orange-600" />
                      : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                  </button>
                </div>

                {/* Template preview */}
                {auto.template && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 mb-3 line-clamp-2 leading-relaxed">
                    {auto.template.length > 80 ? auto.template.slice(0, 80) + '...' : auto.template}
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Send className="w-3 h-3" /> {auto.totalSent ?? 0} נשלחו
                  </span>
                  {auto.lastRunAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(auto.lastRunAt).toLocaleDateString('he-IL')}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 border-t pt-3">
                  <button onClick={() => openEditAuto(auto)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> עריכה
                  </button>
                  <button onClick={() => { setTestAutoId(auto.id); setTestPhone(''); }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                    <Play className="w-3.5 h-3.5" /> טסט
                  </button>
                  <button onClick={() => deleteAutoMutation.mutate(auto.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Campaigns Tab ────────────────────────────────────────────────── */}
      {activeTab === 'campaigns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingCampaigns && <p className="col-span-3 text-gray-400 text-sm">טוען...</p>}
          {!loadingCampaigns && campList.length === 0 && (
            <p className="col-span-3 text-gray-400 text-sm">אין קמפיינים עדיין. צור את הראשון!</p>
          )}
          {campList.map((camp: any) => {
            const statusInfo = CAMPAIGN_STATUSES[camp.status] || { label: camp.status, color: 'bg-gray-100 text-gray-700' };
            const ChIcon = CHANNEL_ICONS[camp.channel] || MessageSquare;
            const canSend = camp.status === 'DRAFT' || camp.status === 'SCHEDULED';
            const canDelete = camp.status === 'DRAFT';
            return (
              <div key={camp.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">{camp.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ChIcon className="w-3 h-3" />
                        {CHANNELS[camp.channel] || camp.channel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Counts */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-green-700">{camp.sentCount ?? 0}</div>
                    <div className="text-xs text-green-600">נשלחו</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-red-700">{camp.failedCount ?? 0}</div>
                    <div className="text-xs text-red-600">נכשלו</div>
                  </div>
                </div>

                {/* Dates */}
                <div className="space-y-1 text-xs text-gray-400 mb-3">
                  {camp.scheduledAt && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> מתוזמן: {new Date(camp.scheduledAt).toLocaleString('he-IL')}
                    </div>
                  )}
                  {camp.sentAt && (
                    <div className="flex items-center gap-1">
                      <Send className="w-3 h-3" /> נשלח: {new Date(camp.sentAt).toLocaleString('he-IL')}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 border-t pt-3">
                  {canSend && (
                    <button onClick={() => setConfirmSendCampaign(camp)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-orange-600 hover:bg-orange-50 rounded-lg transition-colors font-medium">
                      <Rocket className="w-3.5 h-3.5" /> שלח
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => deleteCampMutation.mutate(camp.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> מחק
                    </button>
                  )}
                  {!canSend && !canDelete && (
                    <span className="flex-1 text-center text-xs text-gray-300 py-1.5">---</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Automation Create/Edit Modal ─────────────────────────────────── */}
      {showAutoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={resetAutoForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-800">{editingAuto ? 'עריכת אוטומציה' : 'אוטומציה חדשה'}</h3>
              <button onClick={resetAutoForm} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם האוטומציה *</label>
                <input value={autoName} onChange={e => setAutoName(e.target.value)}
                  placeholder="לדוגמה: הודעה כשההזמנה מוכנה"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500" autoFocus />
              </div>

              {/* Trigger */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">טריגר</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TRIGGERS).map(([key, label]) => (
                    <button key={key} onClick={() => setAutoTrigger(key)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium text-right transition-colors ${
                        autoTrigger === key ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Conditions */}
              {autoTrigger === 'ORDER_STATUS_CHANGE' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">סטטוס שמפעיל</label>
                  <select value={autoCondStatus} onChange={e => setAutoCondStatus(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500">
                    {Object.entries(ORDER_STATUSES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              {autoTrigger === 'CUSTOMER_INACTIVITY' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">ימים ללא פעילות</label>
                  <input type="number" value={autoCondInactiveDays} onChange={e => setAutoCondInactiveDays(e.target.value)}
                    placeholder="30" min="1"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500" />
                </div>
              )}

              {/* Channel */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">ערוץ שליחה</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(CHANNELS).map(([key, label]) => {
                    const ChIcon = CHANNEL_ICONS[key] || MessageSquare;
                    return (
                      <button key={key} onClick={() => setAutoChannel(key)}
                        className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                          autoChannel === key ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        <ChIcon className="w-3.5 h-3.5" /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תבנית הודעה</label>
                <textarea ref={templateRef} value={autoTemplate} onChange={e => setAutoTemplate(e.target.value)}
                  placeholder="שלום {{customerName}}, ההזמנה {{orderNumber}} שלך מוכנה לאיסוף!"
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-sm resize-none" />
                <div className="flex flex-wrap gap-1 mt-2">
                  {TEMPLATE_VARS.map(v => (
                    <button key={v.key}
                      onClick={() => insertVariable(v.key, templateRef, setAutoTemplate, autoTemplate)}
                      className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs hover:bg-orange-100 transition-colors">
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <span className="text-sm font-medium text-gray-700">אוטומציה פעילה</span>
                <button onClick={() => setAutoIsActive(!autoIsActive)}>
                  {autoIsActive
                    ? <ToggleRight className="w-7 h-7 text-orange-600" />
                    : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 flex-shrink-0">
              <button onClick={resetAutoForm}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button onClick={handleAutoSubmit}
                disabled={!autoName || !autoTemplate || createAutoMutation.isPending || updateAutoMutation.isPending}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {(createAutoMutation.isPending || updateAutoMutation.isPending) ? 'שומר...' : (editingAuto ? 'עדכן' : 'צור אוטומציה')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Test Automation Dialog ───────────────────────────────────────── */}
      {testAutoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setTestAutoId(null); setTestPhone(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-slideDown"
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">שליחת הודעת טסט</h3>
              <button onClick={() => { setTestAutoId(null); setTestPhone(''); }}
                className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">מספר טלפון</label>
                <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  placeholder="050-1234567"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500" autoFocus />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => { setTestAutoId(null); setTestPhone(''); }}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => testPhone && testAutoMutation.mutate({ id: testAutoId, phone: testPhone })}
                disabled={!testPhone || testAutoMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {testAutoMutation.isPending ? 'שולח...' : 'שלח טסט'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Campaign Create Modal ────────────────────────────────────────── */}
      {showCampaignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={resetCampaignForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-800">קמפיין חדש</h3>
              <button onClick={resetCampaignForm} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם הקמפיין *</label>
                <input value={campName} onChange={e => setCampName(e.target.value)}
                  placeholder="לדוגמה: מבצע סוף שבוע"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500" autoFocus />
              </div>

              {/* Channel */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">ערוץ שליחה</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(CHANNELS).map(([key, label]) => {
                    const ChIcon = CHANNEL_ICONS[key] || MessageSquare;
                    return (
                      <button key={key} onClick={() => setCampChannel(key)}
                        className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                          campChannel === key ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        <ChIcon className="w-3.5 h-3.5" /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Segment */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">קהל יעד</label>
                <select value={campSegment} onChange={e => setCampSegment(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500">
                  {Object.entries(SEGMENTS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Template */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תבנית הודעה *</label>
                <textarea ref={campTemplateRef} value={campTemplate} onChange={e => setCampTemplate(e.target.value)}
                  placeholder="שלום {{customerName}}, יש לנו מבצע מיוחד בשבילך ב{{businessName}}!"
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-sm resize-none" />
                <div className="flex flex-wrap gap-1 mt-2">
                  {TEMPLATE_VARS.map(v => (
                    <button key={v.key}
                      onClick={() => insertVariable(v.key, campTemplateRef, setCampTemplate, campTemplate)}
                      className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs hover:bg-orange-100 transition-colors">
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scheduled At */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">תזמון שליחה (אופציונלי)</label>
                <input type="datetime-local" value={campScheduledAt} onChange={e => setCampScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500" />
                <p className="text-xs text-gray-400 mt-1">השאר ריק לשמירה כטיוטה</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 flex-shrink-0">
              <button onClick={resetCampaignForm}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button onClick={handleCampaignSubmit}
                disabled={!campName || !campTemplate || createCampMutation.isPending}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {createCampMutation.isPending ? 'יוצר...' : 'צור קמפיין'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Send Campaign Confirm Dialog ─────────────────────────────────── */}
      {confirmSendCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmSendCampaign(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-slideDown"
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">שליחת קמפיין</h3>
              <button onClick={() => setConfirmSendCampaign(null)}
                className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 text-center">
              <Rocket className="w-12 h-12 text-orange-500 mx-auto mb-3" />
              <p className="text-gray-700 font-medium mb-1">לשלוח קמפיין ל-{confirmSendCampaign.recipientCount ?? '?'} לקוחות?</p>
              <p className="text-sm text-gray-500">"{confirmSendCampaign.name}"</p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setConfirmSendCampaign(null)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
              <button
                onClick={() => sendCampMutation.mutate(confirmSendCampaign.id)}
                disabled={sendCampMutation.isPending}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                {sendCampMutation.isPending ? 'שולח...' : 'שלח עכשיו'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
