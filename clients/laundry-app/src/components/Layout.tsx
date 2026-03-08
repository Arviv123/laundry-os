import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import CommandPalette from './CommandPalette';
import {
  LayoutDashboard, ShoppingBag, Shirt, Cog, Users, Truck, Wallet,
  BarChart3, WashingMachine, ScanLine, Tags, Building2, Settings,
  BookOpen, LogOut, Menu, X, ChevronDown, ChevronLeft, Search, Command,
  Upload, Award, Percent, TrendingUp, QrCode, Gift, Columns3, Banknote,
  CreditCard, Receipt as ReceiptIcon, Zap, Tag, ClipboardList, Phone, Calendar,
  Bell, RefreshCw, Radio, Landmark, DollarSign,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: 'ראשי',
    items: [
      { path: '/', label: 'דשבורד', icon: LayoutDashboard },
      { path: '/orders', label: 'הזמנות', icon: ShoppingBag },
      { path: '/orders/new', label: 'הזמנה חדשה', icon: Shirt },
      { path: '/scan', label: 'סורק', icon: QrCode },
      { path: '/workboard', label: 'לוח עבודה', icon: Columns3 },
    ],
  },
  {
    title: 'ניהול',
    items: [
      { path: '/services', label: 'שירותים', icon: Tags },
      { path: '/machines', label: 'מכונות', icon: WashingMachine },
      { path: '/delivery', label: 'הזמנות משלוח', icon: Truck },
      { path: '/delivery-mgmt', label: 'ניהול משלוחים', icon: Truck },
      { path: '/phone-delivery', label: 'הזמנת משלוח טלפוני', icon: Phone },
      { path: '/recurring-orders', label: 'הזמנות חוזרות', icon: RefreshCw },
      { path: '/tasks', label: 'משימות', icon: ClipboardList },
      { path: '/driver-diary', label: 'יומן נהגים', icon: Calendar },
      { path: '/customers', label: 'לקוחות', icon: Users },
      { path: '/prepaid', label: 'מקדמות', icon: Wallet },
      { path: '/cash-drawer', label: 'קופה', icon: Banknote },
      { path: '/payment-terminals', label: 'מסופי אשראי', icon: CreditCard },
      { path: '/price-lists', label: 'מחירונים', icon: Tag },
      { path: '/rfid', label: 'RFID', icon: Radio },
    ],
  },
  {
    title: 'שיווק',
    items: [
      { path: '/loyalty', label: 'מועדון לקוחות', icon: Award },
      { path: '/promotions', label: 'מבצעים', icon: Percent },
      { path: '/gift-cards', label: 'כרטיסי מתנה', icon: Gift },
      { path: '/automations', label: 'אוטומציות', icon: Zap },
    ],
  },
  {
    title: 'הנהלת חשבונות',
    items: [
      { path: '/accounting', label: 'חשבונאות', icon: BookOpen },
      { path: '/invoices', label: 'חשבוניות', icon: BarChart3 },
      { path: '/bank-recon', label: 'התאמות בנק', icon: Landmark },
      { path: '/cash-flow-forecast', label: 'תחזית תזרים', icon: DollarSign },
      { path: '/inventory', label: 'מלאי', icon: ScanLine },
      { path: '/reports', label: 'דוחות', icon: TrendingUp },
      { path: '/expenses', label: 'הוצאות', icon: ReceiptIcon },
    ],
  },
  {
    title: 'מערכת',
    items: [
      { path: '/branches', label: 'סניפים', icon: Building2 },
      { path: '/qr-links', label: 'קישורים ו-QR', icon: QrCode },
      { path: '/import', label: 'ייבוא נתונים', icon: Upload },
      { path: '/settings', label: 'הגדרות', icon: Settings },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(NAV_SECTIONS.map(s => [s.title, true]))
  );

  useKeyboardShortcut([
    { key: 'k', ctrl: true, handler: () => setCommandPaletteOpen(prev => !prev) },
  ]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white border-l border-gray-200 flex flex-col transition-all duration-200 shadow-sm`}>
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Shirt className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-gray-800">LaundryOS</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Quick Search Button */}
        {sidebarOpen && (
          <button onClick={() => setCommandPaletteOpen(true)}
            className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
            <Search className="w-4 h-4" />
            <span className="flex-1 text-right">חיפוש...</span>
            <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-1">
              {sidebarOpen && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
                >
                  {section.title}
                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedSections[section.title] ? '' : '-rotate-90'}`} />
                </button>
              )}
              {(expandedSections[section.title] || !sidebarOpen) && section.items.map((item) => {
                const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div className="border-t border-gray-100 p-3">
          {sidebarOpen ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium text-gray-800">{user?.email}</div>
                <div className="text-xs text-gray-400">{user?.role}</div>
              </div>
              <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500 mx-auto block">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar with Notification Bell */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-gray-100 px-6 py-2 flex items-center justify-end gap-2">
          <NotificationBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: count } = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data.data?.count ?? r.data.data ?? 0),
    refetchInterval: 30_000,
  });

  const { data: notifs } = useQuery({
    queryKey: ['notif-list'],
    queryFn: () => api.get('/notifications', { params: { limit: 10 } }).then(r => r.data.data),
    enabled: open,
  });

  const readAllMutation = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-count'] });
      queryClient.invalidateQueries({ queryKey: ['notif-list'] });
    },
  });

  const readOneMutation = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-count'] });
      queryClient.invalidateQueries({ queryKey: ['notif-list'] });
    },
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const notifList = Array.isArray(notifs?.notifications ?? notifs) ? (notifs?.notifications ?? notifs ?? []) : [];
  const unread = typeof count === 'number' ? count : 0;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <Bell className="w-5 h-5 text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h4 className="font-semibold text-sm text-gray-800">התראות</h4>
            {unread > 0 && (
              <button onClick={() => readAllMutation.mutate()}
                className="text-xs text-blue-600 hover:text-blue-800">סמן הכל כנקרא</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifList.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">אין התראות</div>
            ) : (
              notifList.map((n: any) => (
                <div key={n.id}
                  onClick={() => { if (!n.isRead) readOneMutation.mutate(n.id); }}
                  className={`px-4 py-3 border-b hover:bg-gray-50 cursor-pointer transition-colors ${!n.isRead ? 'bg-blue-50/40' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{n.title ?? n.message}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('he-IL')}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
