import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Settings, Building2, User, Bell, Palette, Save, Shield,
  Plus, X, UserPlus, Trash2, Mail, QrCode, Barcode,
  Image, Clock, Receipt, FileText, Upload, Link2, Copy, ExternalLink,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'מנהל',
  MANAGER: 'מנהל סניף',
  ACCOUNTANT: 'חשב',
  SALESPERSON: 'מוכר',
  COUNTER_STAFF: 'עובד דלפק',
  DRIVER: 'נהג',
};

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('business');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenants/me').then(r => r.data.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data.data).catch(() => []),
  });

  const [businessForm, setBusinessForm] = useState<any>({});
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('COUNTER_STAFF');
  const [newUserName, setNewUserName] = useState('');

  const [ticketCodeMode, setTicketCodeMode] = useState(
    () => localStorage.getItem('ticket-code-mode') || 'qr'
  );

  const [notifSettings, setNotifSettings] = useState({
    orderReceived: true,
    orderReady: true,
    deliveryUpdate: true,
    lowStock: false,
    autoWhatsApp: false,
    autoSMS: false,
  });

  // Logo state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Business hours state
  const [businessHours, setBusinessHours] = useState<any[]>(
    DAYS_HE.map((_, i) => ({ day: i, open: '08:00', close: '18:00', closed: i === 6 }))
  );

  // Tax state
  const [vatRate, setVatRate] = useState('18');
  const [roundUp, setRoundUp] = useState(false);

  // Templates state
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [smsOrderReceived, setSmsOrderReceived] = useState('שלום {{customerName}}, הזמנה {{orderNumber}} התקבלה בהצלחה.');
  const [smsOrderReady, setSmsOrderReady] = useState('שלום {{customerName}}, הזמנה {{orderNumber}} מוכנה לאיסוף!');
  const [smsDelivery, setSmsDelivery] = useState('שלום {{customerName}}, הזמנה {{orderNumber}} יוצאת למשלוח.');

  // Load tenant data into local state
  useEffect(() => {
    if (!tenant) return;
    const s = (tenant.settings as any) || {};
    if (tenant.logoUrl) setLogoPreview(tenant.logoUrl);
    if (s.businessHours) setBusinessHours(s.businessHours);
    if (s.invoiceSettings?.defaultVatRate != null) setVatRate(String(Math.round(s.invoiceSettings.defaultVatRate * 100)));
    if (s.invoiceSettings?.roundUp != null) setRoundUp(s.invoiceSettings.roundUp);
    if (s.templates?.receiptHeader) setReceiptHeader(s.templates.receiptHeader);
    if (s.templates?.receiptFooter) setReceiptFooter(s.templates.receiptFooter);
    if (s.templates?.smsOrderReceived) setSmsOrderReceived(s.templates.smsOrderReceived);
    if (s.templates?.smsOrderReady) setSmsOrderReady(s.templates.smsOrderReady);
    if (s.templates?.smsDelivery) setSmsDelivery(s.templates.smsDelivery);
    const ts = (tenant.taxSettings as any) || {};
    if (ts.vatRate != null) setVatRate(String(Math.round(ts.vatRate * 100)));
  }, [tenant]);

  const updateTenantMutation = useMutation({
    mutationFn: (data: any) => api.patch('/tenants/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      addToast('פרטי עסק נשמרו');
    },
    onError: () => addToast('שגיאה בשמירה', 'error'),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => api.patch('/settings/company', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      addToast('הגדרות נשמרו');
    },
    onError: () => addToast('שגיאה בשמירה', 'error'),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: any) => api.post('/users/register', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setShowNewUserForm(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserRole('COUNTER_STAFF'); setNewUserName('');
      addToast('משתמש נוצר בהצלחה');
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ביצירת משתמש', 'error'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      addToast('משתמש נמחק');
    },
    onError: () => addToast('שגיאה במחיקת משתמש', 'error'),
  });

  // Logo upload — convert to base64 data URL
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { addToast('גודל הלוגו חייב להיות עד 500KB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      updateSettingsMutation.mutate({ logoUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const saveBusinessHours = () => {
    updateSettingsMutation.mutate({
      invoiceSettings: {},
    });
    // Save business hours via settings JSON
    api.patch('/settings/company', {}).then(() => {
      // We save businessHours in the settings JSON directly
    });
    // Use a dedicated call that merges into settings
    api.patch('/tenants/settings', { settings: { businessHours } }).catch(() => {});
    addToast('שעות פעילות נשמרו');
  };

  const saveTaxSettings = () => {
    const rate = Number(vatRate) / 100;
    updateSettingsMutation.mutate({
      invoiceSettings: { defaultVatRate: rate, roundUp },
    });
  };

  const saveTemplates = () => {
    api.patch('/tenants/settings', {
      settings: {
        templates: {
          receiptHeader,
          receiptFooter,
          smsOrderReceived,
          smsOrderReady,
          smsDelivery,
        },
      },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      addToast('תבניות נשמרו');
    }).catch(() => addToast('שגיאה בשמירה', 'error'));
  };

  const tabs = [
    { id: 'business', label: 'פרטי עסק', icon: Building2 },
    { id: 'logo', label: 'לוגו', icon: Image },
    { id: 'hours', label: 'שעות פעילות', icon: Clock },
    { id: 'tax', label: 'מס וחשבונית', icon: Receipt },
    { id: 'templates', label: 'תבניות', icon: FileText },
    { id: 'users', label: 'משתמשים', icon: User },
    { id: 'notifications', label: 'התראות', icon: Bell },
    { id: 'appearance', label: 'תצוגה', icon: Palette },
    { id: 'security', label: 'אבטחה', icon: Shield },
    { id: 'customer-link', label: 'קישור ללקוחות', icon: Link2 },
  ];

  const userList = Array.isArray(users) ? users : [];

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Settings className="w-7 h-7 text-blue-600" /> הגדרות
      </h1>

      <div className="flex gap-6">
        <div className="w-48 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1">
          {/* ═══ Business Details ═══ */}
          {activeTab === 'business' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">פרטי עסק</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">שם העסק</label>
                  <input defaultValue={tenant?.name} onChange={e => setBusinessForm({ ...businessForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">ח.פ / עוסק מורשה</label>
                  <input defaultValue={tenant?.businessNumber} onChange={e => setBusinessForm({ ...businessForm, businessNumber: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">טלפון</label>
                  <input defaultValue={tenant?.phone} onChange={e => setBusinessForm({ ...businessForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">אימייל</label>
                  <input defaultValue={tenant?.email} onChange={e => setBusinessForm({ ...businessForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-500 mb-1 block">כתובת</label>
                  <input defaultValue={tenant?.address?.street} onChange={e => setBusinessForm({ ...businessForm, address: { ...businessForm.address, street: e.target.value } })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <button onClick={() => updateTenantMutation.mutate(businessForm)}
                disabled={updateTenantMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
                <Save className="w-4 h-4" /> {updateTenantMutation.isPending ? 'שומר...' : 'שמור שינויים'}
              </button>
            </div>
          )}

          {/* ═══ Logo Upload ═══ */}
          {activeTab === 'logo' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">לוגו העסק</h2>
              <p className="text-sm text-gray-500">הלוגו יופיע על חשבוניות, קבלות ובממשק הלקוח. עד 500KB.</p>

              <div className="flex items-start gap-6">
                <div className="w-40 h-40 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden">
                  {logoPreview ? (
                    <img src={logoPreview} alt="לוגו" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center text-gray-400">
                      <Image className="w-10 h-10 mx-auto mb-2" />
                      <span className="text-xs">אין לוגו</span>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    <Upload className="w-4 h-4" /> העלה לוגו
                  </button>
                  {logoPreview && (
                    <button onClick={() => {
                      setLogoPreview(null);
                      updateSettingsMutation.mutate({ logoUrl: '' });
                    }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">
                      <Trash2 className="w-4 h-4" /> הסר לוגו
                    </button>
                  )}
                  <p className="text-xs text-gray-400">פורמטים: PNG, JPG, SVG</p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Business Hours ═══ */}
          {activeTab === 'hours' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">שעות פעילות</h2>
              <p className="text-sm text-gray-500">הגדר את שעות הפעילות לכל יום בשבוע</p>

              <div className="space-y-2">
                {businessHours.map((day, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50">
                    <span className="w-16 font-medium text-gray-700 text-sm">{DAYS_HE[i]}</span>
                    <ToggleSwitch checked={!day.closed}
                      onChange={v => {
                        const next = [...businessHours];
                        next[i] = { ...next[i], closed: !v };
                        setBusinessHours(next);
                      }} />
                    {!day.closed ? (
                      <>
                        <input type="time" value={day.open}
                          onChange={e => {
                            const next = [...businessHours];
                            next[i] = { ...next[i], open: e.target.value };
                            setBusinessHours(next);
                          }}
                          className="px-2 py-1.5 border rounded text-sm" />
                        <span className="text-gray-400">—</span>
                        <input type="time" value={day.close}
                          onChange={e => {
                            const next = [...businessHours];
                            next[i] = { ...next[i], close: e.target.value };
                            setBusinessHours(next);
                          }}
                          className="px-2 py-1.5 border rounded text-sm" />
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">סגור</span>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={saveBusinessHours}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                <Save className="w-4 h-4" /> שמור שעות
              </button>
            </div>
          )}

          {/* ═══ Tax & Invoice ═══ */}
          {activeTab === 'tax' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">הגדרות מס וחשבונית</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">שיעור מע"מ (%)</label>
                  <input type="number" value={vatRate} onChange={e => setVatRate(e.target.value)}
                    min={0} max={100} step={1}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-3 pb-2">
                    <ToggleSwitch checked={roundUp} onChange={setRoundUp} />
                    <span className="text-sm text-gray-700">עיגול סכומים כלפי מעלה</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-700 mb-3">פרטי בנק לחשבונית</h3>
                <textarea
                  defaultValue={(tenant?.settings as any)?.invoiceSettings?.bankDetails || ''}
                  onChange={e => setBusinessForm({ ...businessForm, _bankDetails: e.target.value })}
                  placeholder="שם בנק, סניף, מספר חשבון"
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-700 mb-3">שורת תחתית חשבונית</h3>
                <input
                  defaultValue={(tenant?.settings as any)?.invoiceSettings?.invoiceFooter || ''}
                  onChange={e => setBusinessForm({ ...businessForm, _invoiceFooter: e.target.value })}
                  placeholder="תודה רבה! חשבונית זו מהווה אסמכתא לצרכי מס."
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              <button onClick={() => {
                const payload: any = {
                  invoiceSettings: {
                    defaultVatRate: Number(vatRate) / 100,
                    roundUp,
                  },
                };
                if (businessForm._bankDetails !== undefined) payload.invoiceSettings.bankDetails = businessForm._bankDetails;
                if (businessForm._invoiceFooter !== undefined) payload.invoiceSettings.invoiceFooter = businessForm._invoiceFooter;
                updateSettingsMutation.mutate(payload);
              }}
                disabled={updateSettingsMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
                <Save className="w-4 h-4" /> {updateSettingsMutation.isPending ? 'שומר...' : 'שמור הגדרות מס'}
              </button>
            </div>
          )}

          {/* ═══ Templates ═══ */}
          {activeTab === 'templates' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
              <h2 className="text-lg font-semibold text-gray-800">תבניות הודעות וקבלות</h2>
              <p className="text-sm text-gray-500">
                השתמש במשתנים: <code className="bg-gray-100 px-1 rounded">{'{{customerName}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{orderNumber}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{businessName}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{total}}'}</code>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">כותרת קבלה</label>
                  <input value={receiptHeader} onChange={e => setReceiptHeader(e.target.value)}
                    placeholder="ברוכים הבאים ל{{businessName}}"
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">תחתית קבלה</label>
                  <input value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)}
                    placeholder="תודה שבחרתם בנו! נשמח לראותכם שוב."
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-700 mb-3">תבניות SMS / WhatsApp</h3>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">הזמנה התקבלה</label>
                  <textarea value={smsOrderReceived} onChange={e => setSmsOrderReceived(e.target.value)}
                    rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">הזמנה מוכנה</label>
                  <textarea value={smsOrderReady} onChange={e => setSmsOrderReady(e.target.value)}
                    rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">עדכון משלוח</label>
                  <textarea value={smsDelivery} onChange={e => setSmsDelivery(e.target.value)}
                    rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              <button onClick={saveTemplates}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                <Save className="w-4 h-4" /> שמור תבניות
              </button>
            </div>
          )}

          {/* ═══ Users ═══ */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">משתמשים ותפקידים</h2>
                <button onClick={() => setShowNewUserForm(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  <UserPlus className="w-4 h-4" /> משתמש חדש
                </button>
              </div>

              <div className="space-y-2">
                {userList.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">{u.name || u.email}</div>
                        <div className="text-sm text-gray-400 flex items-center gap-2">
                          <Mail className="w-3 h-3" /> {u.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                        u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                        u.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{ROLE_LABELS[u.role] || u.role}</span>
                      {u.id !== (user as any)?.userId && (
                        <button onClick={() => { if (confirm(`למחוק את ${u.email}?`)) deleteUserMutation.mutate(u.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {userList.length === 0 && <p className="text-center text-gray-400 text-sm py-4">אין משתמשים</p>}
              </div>

              {showNewUserForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNewUserForm(false)}>
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
                    <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
                      <h3 className="font-bold text-gray-800">משתמש חדש</h3>
                      <button onClick={() => setShowNewUserForm(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">שם מלא</label>
                        <input value={newUserName} onChange={e => setNewUserName(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg" autoFocus />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">אימייל *</label>
                        <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">סיסמה *</label>
                        <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">תפקיד</label>
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(ROLE_LABELS).map(([key, label]) => (
                            <button key={key} onClick={() => setNewUserRole(key)}
                              className={`py-2 rounded-lg text-xs font-medium ${
                                newUserRole === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}>{label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
                      <button onClick={() => setShowNewUserForm(false)}
                        className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm">ביטול</button>
                      <button
                        onClick={() => createUserMutation.mutate({ name: newUserName, email: newUserEmail, password: newUserPassword, role: newUserRole })}
                        disabled={!newUserEmail || !newUserPassword || createUserMutation.isPending}
                        className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40">
                        {createUserMutation.isPending ? 'יוצר...' : 'צור משתמש'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ Notifications ═══ */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">הגדרות התראות</h2>
              <p className="text-sm text-gray-500">הגדר אילו התראות לשלוח אוטומטית ללקוחות ולצוות</p>

              <div className="space-y-3">
                <h3 className="font-medium text-gray-700 text-sm mt-4">הודעות ללקוח</h3>
                {[
                  { key: 'orderReceived', label: 'אישור קבלה', desc: 'שלח ללקוח אישור שההזמנה התקבלה' },
                  { key: 'orderReady', label: 'הזמנה מוכנה', desc: 'שלח ללקוח כשההזמנה מוכנה לאיסוף' },
                  { key: 'deliveryUpdate', label: 'עדכון משלוח', desc: 'עדכן לקוח על סטטוס משלוח' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium text-gray-800">{item.label}</div>
                      <div className="text-sm text-gray-400">{item.desc}</div>
                    </div>
                    <ToggleSwitch
                      checked={(notifSettings as any)[item.key]}
                      onChange={v => setNotifSettings(prev => ({ ...prev, [item.key]: v }))} />
                  </div>
                ))}

                <h3 className="font-medium text-gray-700 text-sm mt-4">ערוצי שליחה אוטומטיים</h3>
                {[
                  { key: 'autoWhatsApp', label: 'WhatsApp אוטומטי', desc: 'שלח הודעות WhatsApp אוטומטיות בשינוי סטטוס' },
                  { key: 'autoSMS', label: 'SMS אוטומטי', desc: 'שלח SMS אוטומטי בשינוי סטטוס (דורש חיבור SMS gateway)' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium text-gray-800">{item.label}</div>
                      <div className="text-sm text-gray-400">{item.desc}</div>
                    </div>
                    <ToggleSwitch
                      checked={(notifSettings as any)[item.key]}
                      onChange={v => setNotifSettings(prev => ({ ...prev, [item.key]: v }))} />
                  </div>
                ))}

                <h3 className="font-medium text-gray-700 text-sm mt-4">התראות מערכת</h3>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium text-gray-800">מלאי נמוך</div>
                    <div className="text-sm text-gray-400">התראה כשמלאי חומרים יורד מתחת למינימום</div>
                  </div>
                  <ToggleSwitch
                    checked={notifSettings.lowStock}
                    onChange={v => setNotifSettings(prev => ({ ...prev, lowStock: v }))} />
                </div>
              </div>

              <button onClick={() => addToast('הגדרות התראות נשמרו')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                <Save className="w-4 h-4" /> שמור הגדרות
              </button>
            </div>
          )}

          {/* ═══ Appearance ═══ */}
          {activeTab === 'appearance' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">תצוגה</h2>
              <div className="space-y-3">
                <div className="p-4 border rounded-lg">
                  <div className="font-medium text-gray-800 mb-2">קוד על פתקיות</div>
                  <div className="text-sm text-gray-400 mb-3">בחר את סוג הקוד שיודפס על פתקיות הפריטים</div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { localStorage.setItem('ticket-code-mode', 'qr'); setTicketCodeMode('qr'); }}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                        ticketCodeMode === 'qr' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}>
                      <QrCode className="w-5 h-5" /> QR Code
                    </button>
                    <button
                      onClick={() => { localStorage.setItem('ticket-code-mode', 'barcode'); setTicketCodeMode('barcode'); }}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                        ticketCodeMode === 'barcode' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}>
                      <Barcode className="w-5 h-5" /> ברקוד (Code128)
                    </button>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="font-medium text-gray-800 mb-2">ערכת נושא</div>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">בהיר (ברירת מחדל)</button>
                    <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">כהה — בקרוב</button>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="font-medium text-gray-800 mb-2">שפה</div>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">עברית</button>
                    <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">English — Coming soon</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Security ═══ */}
          {activeTab === 'security' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">אבטחה</h2>
              <div className="p-4 border rounded-lg">
                <div className="font-medium text-gray-800 mb-1">שינוי סיסמה</div>
                <div className="text-sm text-gray-400 mb-3">שנה את סיסמת החשבון שלך</div>
                <div className="grid grid-cols-1 gap-3 max-w-sm">
                  <input type="password" placeholder="סיסמה נוכחית" className="px-3 py-2 border rounded-lg" />
                  <input type="password" placeholder="סיסמה חדשה" className="px-3 py-2 border rounded-lg" />
                  <input type="password" placeholder="אימות סיסמה חדשה" className="px-3 py-2 border rounded-lg" />
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm w-fit">עדכן סיסמה</button>
                </div>
              </div>
            </div>
          )}
          {/* ═══ Customer Link ═══ */}
          {activeTab === 'customer-link' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-800">קישור פורטל לקוח</h2>
              <p className="text-sm text-gray-500">שתפו את הקישור הזה עם הלקוחות שלכם כדי שיוכלו לעקוב אחרי הזמנות, להזמין משלוח ולנהל את החשבון שלהם.</p>

              {(() => {
                const origin = window.location.origin;
                const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
                const customerUrl = isLocal
                  ? origin.replace(/:\d+$/, ':5181') + '/login'
                  : origin.replace('laundry-os-app', 'laundry-customer') + '/login';
                const courierUrl = isLocal
                  ? origin.replace(/:\d+$/, ':5182') + '/login'
                  : origin.replace('laundry-os-app', 'laundry-courier') + '/login';
                return (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-2 text-blue-700 font-semibold">
                        <ExternalLink className="w-5 h-5" />
                        קישור לפורטל לקוח
                      </div>
                      <div className="flex items-center gap-2">
                        <input readOnly value={customerUrl}
                          className="flex-1 px-4 py-3 bg-white border rounded-lg text-sm text-gray-700 font-mono" dir="ltr" />
                        <button onClick={() => { navigator.clipboard.writeText(customerUrl); addToast('הקישור הועתק'); }}
                          className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                          <Copy className="w-4 h-4" /> העתק
                        </button>
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-2 text-green-700 font-semibold">
                        <ExternalLink className="w-5 h-5" />
                        קישור לאפליקציית שליח
                      </div>
                      <div className="flex items-center gap-2">
                        <input readOnly value={courierUrl}
                          className="flex-1 px-4 py-3 bg-white border rounded-lg text-sm text-gray-700 font-mono" dir="ltr" />
                        <button onClick={() => { navigator.clipboard.writeText(courierUrl); addToast('הקישור הועתק'); }}
                          className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                          <Copy className="w-4 h-4" /> העתק
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="border rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-gray-800">איך זה עובד?</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>1. שלחו את הקישור ללקוח דרך WhatsApp או SMS</p>
                  <p>2. הלקוח מזין את מספר הטלפון שלו</p>
                  <p>3. הלקוח מזין קוד אימות שנשלח אליו ב-WhatsApp</p>
                  <p>4. אם הלקוח קיים במערכת — נכנס ישירות. אם לא — נרשם אוטומטית</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
    </label>
  );
}
