import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import api from '../lib/api';
import {
  Search, ShoppingBag, Users, Shirt, LayoutDashboard, Tags,
  WashingMachine, Truck, Wallet, BookOpen, Settings, Plus,
  ArrowLeft, Command,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ResultItem {
  id: string;
  type: 'action' | 'order' | 'customer' | 'service';
  label: string;
  subtitle?: string;
  icon: typeof Search;
  action: () => void;
}

export default function CommandPalette({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search queries
  const { data: orderResults } = useQuery({
    queryKey: ['cmd-orders', debouncedQuery],
    queryFn: () => api.get('/orders', { params: { search: debouncedQuery, limit: 5 } }).then(r => r.data.data?.orders ?? []),
    enabled: isOpen && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const { data: customerResults } = useQuery({
    queryKey: ['cmd-customers', debouncedQuery],
    queryFn: () => api.get('/crm/customers', { params: { search: debouncedQuery, limit: 5 } }).then(r => {
      const d = r.data.data;
      return Array.isArray(d) ? d : d?.customers ?? [];
    }),
    enabled: isOpen && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // Quick actions
  const quickActions: ResultItem[] = [
    { id: 'new-order', type: 'action', label: 'הזמנה חדשה', icon: Plus, action: () => { navigate('/orders/new'); onClose(); } },
    { id: 'go-orders', type: 'action', label: 'הזמנות', icon: ShoppingBag, action: () => { navigate('/orders'); onClose(); } },
    { id: 'go-dashboard', type: 'action', label: 'דשבורד', icon: LayoutDashboard, action: () => { navigate('/'); onClose(); } },
    { id: 'go-customers', type: 'action', label: 'לקוחות', icon: Users, action: () => { navigate('/customers'); onClose(); } },
    { id: 'go-services', type: 'action', label: 'שירותים', icon: Tags, action: () => { navigate('/services'); onClose(); } },
    { id: 'go-machines', type: 'action', label: 'מכונות', icon: WashingMachine, action: () => { navigate('/machines'); onClose(); } },
    { id: 'go-delivery', type: 'action', label: 'משלוחים', icon: Truck, action: () => { navigate('/delivery'); onClose(); } },
    { id: 'go-prepaid', type: 'action', label: 'מקדמות', icon: Wallet, action: () => { navigate('/prepaid'); onClose(); } },
    { id: 'go-accounting', type: 'action', label: 'הנהלת חשבונות', icon: BookOpen, action: () => { navigate('/accounting'); onClose(); } },
    { id: 'go-settings', type: 'action', label: 'הגדרות', icon: Settings, action: () => { navigate('/settings'); onClose(); } },
  ];

  const results = useMemo(() => {
    const items: ResultItem[] = [];

    if (!debouncedQuery || debouncedQuery.length < 2) {
      // Show quick actions filtered by query
      const filtered = query
        ? quickActions.filter(a => a.label.includes(query))
        : quickActions;
      items.push(...filtered);
    } else {
      // Show search results grouped by type
      if (orderResults?.length) {
        for (const o of orderResults) {
          items.push({
            id: `order-${o.id}`,
            type: 'order',
            label: o.orderNumber,
            subtitle: o.customer?.name ?? '',
            icon: ShoppingBag,
            action: () => { navigate(`/orders/${o.id}`); onClose(); },
          });
        }
      }

      if (customerResults?.length) {
        for (const c of customerResults) {
          items.push({
            id: `customer-${c.id}`,
            type: 'customer',
            label: c.name,
            subtitle: c.phone ?? c.email ?? '',
            icon: Users,
            action: () => { navigate('/customers'); onClose(); },
          });
        }
      }

      // Always show "new order" at the bottom
      items.push(quickActions[0]);
    }

    return items;
  }, [debouncedQuery, query, orderResults, customerResults]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      results[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const TYPE_LABELS: Record<string, string> = {
    action: 'ניווט',
    order: 'הזמנות',
    customer: 'לקוחות',
    service: 'שירותים',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown"
        onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 border-b">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="חיפוש הזמנות, לקוחות, ניווט..."
            className="flex-1 py-4 text-base outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              לא נמצאו תוצאות עבור "{debouncedQuery}"
            </div>
          )}
          {results.map((item, i) => {
            const Icon = item.icon;
            const showDivider = i > 0 && results[i - 1].type !== item.type;
            return (
              <div key={item.id}>
                {showDivider && <div className="h-px bg-gray-100 my-1" />}
                <button
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-right transition-colors ${
                    i === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    i === selectedIndex ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.label}</div>
                    {item.subtitle && <div className="text-xs text-gray-400 truncate">{item.subtitle}</div>}
                  </div>
                  <span className="text-[10px] text-gray-300 flex-shrink-0">
                    {TYPE_LABELS[item.type]}
                  </span>
                  {i === selectedIndex && <ArrowLeft className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50 text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">↑↓</kbd> ניווט</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Enter</kbd> בחירה</span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />K לפתיחה
          </span>
        </div>
      </div>
    </div>
  );
}
