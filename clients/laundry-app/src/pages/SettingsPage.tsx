import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Settings, Building2, User, Bell, Palette, Save, Shield,
  Plus, X, UserPlus, Trash2, Mail,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'מנהל',
  MANAGER: 'מנהל סניף',
  ACCOUNTANT: 'חשב',
  SALESPERSON: 'מוכר',
  COUNTER_STAFF: 'עובד דלפק',
  DRIVER: 'נהג',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('business');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenants/current').then(r => r.data.data),
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

  const [notifSettings, setNotifSettings] = useState({
    orderReceived: true,
    orderReady: true,
    deliveryUpdate: true,
    lowStock: false,
    autoWhatsApp: false,
    autoSMS: false,
  });

  const updateTenantMutation = useMutation({
    mutationFn: (data: any) => api.patch('/tenants/current', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      addToast('פרטי עסק נשמרו');
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

  const tabs = [
    { id: 'business', label: 'פרטי עסק', icon: Building2 },
    { id: 'users', label: 'משתמשים', icon: User },
    { id: 'notifications', label: 'התראות', icon: Bell },
    { id: 'appearance', label: 'תצוגה', icon: Palette },
    { id: 'security', label: 'אבטחה', icon: Shield },
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

          {activeTab === 'appearance' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">תצוגה</h2>
              <div className="space-y-3">
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
