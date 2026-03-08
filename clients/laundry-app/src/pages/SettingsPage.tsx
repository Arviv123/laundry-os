import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Settings, Building2, User, Bell, Palette, Save, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('business');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenants/current').then(r => r.data.data),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
  });

  const [businessForm, setBusinessForm] = useState<any>({});

  const updateTenantMutation = useMutation({
    mutationFn: (data: any) => api.patch('/tenants/current', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] }),
  });

  const tabs = [
    { id: 'business', label: 'פרטי עסק', icon: Building2 },
    { id: 'users', label: 'משתמשים', icon: User },
    { id: 'notifications', label: 'התראות', icon: Bell },
    { id: 'appearance', label: 'תצוגה', icon: Palette },
    { id: 'security', label: 'אבטחה', icon: Shield },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Settings className="w-7 h-7 text-blue-600" /> הגדרות
      </h1>

      <div className="flex gap-6">
        {/* Sidebar Tabs */}
        <div className="w-48 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
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
              {updateTenantMutation.isSuccess && <p className="text-green-600 text-sm">נשמר בהצלחה!</p>}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">משתמשים ותפקידים</h2>
              <div className="space-y-3">
                <div className="p-4 border rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">{user?.email}</div>
                    <div className="text-sm text-gray-400">המשתמש הנוכחי</div>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">{user?.role}</span>
                </div>
                <p className="text-sm text-gray-400">ניהול משתמשים מתקדם — בקרוב</p>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">הגדרות התראות</h2>
              <div className="space-y-3">
                {[
                  { key: 'orderReady', label: 'הזמנה מוכנה', desc: 'שלח הודעה ללקוח כשההזמנה מוכנה' },
                  { key: 'deliveryUpdate', label: 'עדכון משלוח', desc: 'עדכן לקוח על סטטוס משלוח' },
                  { key: 'lowStock', label: 'מלאי נמוך', desc: 'התראה כשמלאי חומרים יורד מתחת למינימום' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium text-gray-800">{item.label}</div>
                      <div className="text-sm text-gray-400">{item.desc}</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                ))}
              </div>
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
              <div className="space-y-3">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
