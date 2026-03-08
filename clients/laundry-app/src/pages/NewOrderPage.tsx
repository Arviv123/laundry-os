import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import { CATEGORY_LABELS, GARMENT_CATEGORIES, GARMENT_SUB_TYPES } from '../lib/constants';
import {
  Search, Plus, Minus, X, ShoppingBag, User, Zap,
  Truck, Store, UserPlus, Tag, Star, Clock,
} from 'lucide-react';

interface CartItem {
  id: string;
  serviceId: string;
  serviceName: string;
  category: string;
  garmentType: string;
  garmentSubType: string;
  garmentLabel: string;
  customName: string;
  quantity: number;
  unitPrice: number;
}

let cartItemCounter = 0;
function nextCartId() { return `ci-${++cartItemCounter}-${Date.now()}`; }

// Favorites stored in localStorage
function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('laundry-favorites') || '[]'); } catch { return []; }
}
function saveFavorites(ids: string[]) { localStorage.setItem('laundry-favorites', JSON.stringify(ids)); }

function getRecentServices(): string[] {
  try { return JSON.parse(localStorage.getItem('laundry-recent') || '[]'); } catch { return []; }
}
function addRecentService(id: string) {
  const recent = getRecentServices().filter(r => r !== id);
  recent.unshift(id);
  localStorage.setItem('laundry-recent', JSON.stringify(recent.slice(0, 10)));
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Customer
  const [customerQuery, setCustomerQuery] = useState('');
  const debouncedCustomerQuery = useDebounce(customerQuery, 200);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const customerInputRef = useRef<HTMLInputElement>(null);

  // Services
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [serviceSearch, setServiceSearch] = useState('');
  const debouncedServiceSearch = useDebounce(serviceSearch, 100);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sub-category detail modal (only on demand)
  const [detailItem, setDetailItem] = useState<CartItem | null>(null);
  const [detailGarmentType, setDetailGarmentType] = useState('');
  const [detailSubType, setDetailSubType] = useState('');
  const [detailCustomName, setDetailCustomName] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priority, setPriority] = useState<'NORMAL' | 'EXPRESS'>('NORMAL');
  const [deliveryType, setDeliveryType] = useState<'STORE_PICKUP' | 'HOME_DELIVERY'>('STORE_PICKUP');
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CREDIT' | 'TRANSFER' | 'PREPAID'>('CASH');

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(getFavorites());

  // Data
  const { data: customerResults } = useQuery({
    queryKey: ['customer-search', debouncedCustomerQuery],
    queryFn: () => api.get('/crm/customers', { params: { search: debouncedCustomerQuery, limit: 8 } }).then(r => {
      const d = r.data.data;
      return Array.isArray(d) ? d : d?.customers ?? [];
    }),
    enabled: debouncedCustomerQuery.length >= 1 && !selectedCustomer,
  });

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
    staleTime: 5 * 60_000,
  });

  const serviceList: any[] = Array.isArray(services) ? services : [];
  const categories = ['ALL', ...Array.from(new Set(serviceList.filter(s => s.isActive).map((s: any) => s.category)))];

  // Filter services
  const filteredServices = useMemo(() => {
    let list = serviceList.filter((s: any) => s.isActive);
    if (activeCategory !== 'ALL') list = list.filter((s: any) => s.category === activeCategory);
    if (debouncedServiceSearch) {
      const q = debouncedServiceSearch.toLowerCase();
      list = list.filter((s: any) =>
        s.name.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[s.category] || '').includes(q)
      );
    }
    return list;
  }, [serviceList, activeCategory, debouncedServiceSearch]);

  // Favorite + recent services
  const favoriteServices = useMemo(() =>
    serviceList.filter(s => favorites.includes(s.id) && s.isActive),
    [serviceList, favorites]
  );
  const recentIds = getRecentServices();
  const recentServices = useMemo(() =>
    recentIds.map(id => serviceList.find((s: any) => s.id === id)).filter(Boolean).filter((s: any) => s.isActive && !favorites.includes(s.id)).slice(0, 6),
    [serviceList, recentIds, favorites]
  );

  // FAST ADD — single click, no modal
  const fastAdd = useCallback((service: any) => {
    addRecentService(service.id);
    const item: CartItem = {
      id: nextCartId(),
      serviceId: service.id,
      serviceName: service.name,
      category: service.category,
      garmentType: 'OTHER',
      garmentSubType: 'OTHER',
      garmentLabel: service.name,
      customName: service.name,
      quantity: 1,
      unitPrice: Number(service.basePrice),
    };
    setCart(prev => [...prev, item]);
  }, []);

  // Toggle favorite
  const toggleFavorite = (serviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId];
      saveFavorites(next);
      return next;
    });
  };

  // Cart ops
  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev
      .map(item => item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
      .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string) => setCart(prev => prev.filter(item => item.id !== itemId));

  // Open detail editor for a cart item
  const openItemDetail = (item: CartItem) => {
    setDetailItem(item);
    setDetailGarmentType(item.garmentType);
    setDetailSubType(item.garmentSubType);
    setDetailCustomName(item.customName);
  };

  const saveItemDetail = () => {
    if (!detailItem) return;
    const garmentCat = GARMENT_CATEGORIES.find(g => g.value === detailGarmentType);
    const subTypes = GARMENT_SUB_TYPES[detailGarmentType] ?? [];
    const subType = subTypes.find(s => s.value === detailSubType);
    const label = [detailItem.serviceName, garmentCat?.label, subType?.label].filter(Boolean).join(' - ');

    setCart(prev => prev.map(item =>
      item.id === detailItem.id ? {
        ...item,
        garmentType: detailGarmentType || 'OTHER',
        garmentSubType: detailSubType || 'OTHER',
        garmentLabel: label,
        customName: detailCustomName || label,
      } : item
    ));
    setDetailItem(null);
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const expressMultiplier = priority === 'EXPRESS' ? 1.5 : 1;
  const adjustedSubtotal = subtotal * expressMultiplier;
  const vatAmount = Math.round(adjustedSubtotal * 0.18);
  const total = adjustedSubtotal + vatAmount;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Create order
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/orders', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const order = res.data.data;
      addToast(`הזמנה ${order.orderNumber} נוצרה!`);
      navigate(`/orders/${order.id}`);
    },
    onError: (err: any) => addToast(err.response?.data?.error ?? 'שגיאה ביצירת הזמנה', 'error'),
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data: any) => api.post('/crm/customers', data),
    onSuccess: (res) => {
      const c = res.data.data;
      setSelectedCustomer(c);
      setShowNewCustomerForm(false);
      setNewCustomerName(''); setNewCustomerPhone('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast(`לקוח ${c.name} נוצר`);
    },
    onError: () => addToast('שגיאה ביצירת לקוח', 'error'),
  });

  const handleSubmit = () => {
    if (!selectedCustomer || cart.length === 0) return;
    createMutation.mutate({
      customerId: selectedCustomer.id,
      priority, deliveryType, source: 'STORE',
      paymentMethod: markAsPaid ? paymentMethod : undefined,
      markAsPaid,
      items: cart.map(item => ({
        serviceId: item.serviceId,
        description: item.customName,
        garmentType: item.garmentType,
        garmentSubType: item.garmentSubType,
        category: item.category === 'WASH' ? 'OTHER' : item.category,
        quantity: item.quantity,
      })),
    });
  };

  // Close dropdown
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const h = () => setShowCustomerDropdown(false);
    setTimeout(() => document.addEventListener('click', h), 0);
    return () => document.removeEventListener('click', h);
  }, [showCustomerDropdown]);

  useEffect(() => { customerInputRef.current?.focus(); }, []);

  // Keyboard: / focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* Header: Customer */}
      <div className="bg-white border-b px-4 py-2.5">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-5 h-5 text-blue-600 flex-shrink-0" />
          {selectedCustomer ? (
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg">
                <User className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-800 text-sm">{selectedCustomer.name}</span>
                {selectedCustomer.phone && <span className="text-xs text-blue-400">{selectedCustomer.phone}</span>}
                <button onClick={() => { setSelectedCustomer(null); setCustomerQuery(''); }}
                  className="p-0.5 hover:bg-blue-100 rounded"><X className="w-3.5 h-3.5 text-blue-400" /></button>
              </div>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setDeliveryType('STORE_PICKUP')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${deliveryType === 'STORE_PICKUP' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
                  <Store className="w-3 h-3" /> איסוף</button>
                <button onClick={() => setDeliveryType('HOME_DELIVERY')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${deliveryType === 'HOME_DELIVERY' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
                  <Truck className="w-3 h-3" /> משלוח</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative" onClick={e => e.stopPropagation()}>
              <div className="relative">
                <Search className="absolute right-3 top-2 w-4 h-4 text-gray-400" />
                <input ref={customerInputRef} type="text" value={customerQuery}
                  onChange={e => { setCustomerQuery(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="שם, טלפון או מייל לקוח..."
                  className="w-full max-w-md pr-9 pl-4 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              {showCustomerDropdown && customerQuery.length >= 1 && (
                <div className="absolute top-full mt-1 w-full max-w-md bg-white border rounded-xl shadow-xl z-20 overflow-hidden animate-slideDown">
                  {customerResults?.map((c: any) => (
                    <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-right hover:bg-blue-50">
                      <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center"><User className="w-3.5 h-3.5 text-gray-400" /></div>
                      <div className="flex-1"><div className="text-sm font-medium text-gray-800">{c.name}</div><div className="text-xs text-gray-400">{c.phone}</div></div>
                    </button>
                  ))}
                  {customerResults?.length === 0 && <div className="px-4 py-2 text-sm text-gray-400 text-center">לא נמצא</div>}
                  <button onClick={() => { setShowNewCustomerForm(true); setShowCustomerDropdown(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 border-t text-blue-600 hover:bg-blue-50 text-sm">
                    <UserPlus className="w-4 h-4" /> לקוח חדש</button>
                </div>
              )}
              {showNewCustomerForm && (
                <div className="absolute top-full mt-1 w-full max-w-md bg-white border rounded-xl shadow-xl z-20 p-4 space-y-2 animate-slideDown">
                  <div className="font-medium text-gray-700 text-sm">לקוח חדש</div>
                  <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                    placeholder="שם" className="w-full px-3 py-1.5 border rounded-lg text-sm" autoFocus />
                  <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)}
                    placeholder="טלפון" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => createCustomerMutation.mutate({ name: newCustomerName, phone: newCustomerPhone, type: 'B2C', status: 'ACTIVE' })}
                      disabled={!newCustomerName || createCustomerMutation.isPending}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40">
                      {createCustomerMutation.isPending ? 'שומר...' : 'צור'}</button>
                    <button onClick={() => setShowNewCustomerForm(false)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm">ביטול</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main: Services + Cart */}
      <div className="flex-1 flex overflow-hidden">
        {/* Services */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute right-3 top-2 w-4 h-4 text-gray-400" />
              <input ref={searchInputRef} type="text" value={serviceSearch}
                onChange={e => setServiceSearch(e.target.value)}
                placeholder={'חיפוש שירות... (/)'}
                className="w-full pr-9 pl-8 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              {serviceSearch && (
                <button onClick={() => setServiceSearch('')} className="absolute left-2 top-2"><X className="w-3.5 h-3.5 text-gray-400" /></button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto flex-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}>
                  {cat === 'ALL' ? 'הכל' : CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          </div>

          {/* Favorites */}
          {favoriteServices.length > 0 && activeCategory === 'ALL' && !debouncedServiceSearch && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5 flex items-center gap-1"><Star className="w-3 h-3" /> מועדפים</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {favoriteServices.map((s: any) => (
                  <button key={s.id} onClick={() => fastAdd(s)}
                    className="flex-shrink-0 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-center hover:bg-yellow-100 active:scale-95 transition-all min-w-[80px]">
                    <div className="text-xs font-semibold text-gray-800">{s.name}</div>
                    <div className="text-sm font-bold text-blue-600">{Number(s.basePrice)} ₪</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent */}
          {recentServices.length > 0 && activeCategory === 'ALL' && !debouncedServiceSearch && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> אחרונים</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recentServices.map((s: any) => (
                  <button key={s.id} onClick={() => fastAdd(s)}
                    className="flex-shrink-0 bg-gray-50 border rounded-lg px-3 py-2 text-center hover:bg-gray-100 active:scale-95 transition-all min-w-[80px]">
                    <div className="text-xs font-semibold text-gray-800">{s.name}</div>
                    <div className="text-sm font-bold text-blue-600">{Number(s.basePrice)} ₪</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filteredServices.map((service: any) => {
              const itemCount = cart.filter(c => c.serviceId === service.id).reduce((s, c) => s + c.quantity, 0);
              const isFav = favorites.includes(service.id);
              return (
                <button key={service.id} onClick={() => fastAdd(service)}
                  className={`relative bg-white border rounded-xl p-3 text-center transition-all duration-100 active:scale-95 ${
                    itemCount > 0 ? 'border-blue-400 shadow-md ring-1 ring-blue-200' : 'border-gray-100 hover:border-blue-200 hover:shadow-sm'}`}>
                  <button onClick={(e) => toggleFavorite(service.id, e)}
                    className="absolute top-1 left-1 p-0.5 hover:bg-gray-100 rounded z-10">
                    <Star className={`w-3 h-3 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                  </button>
                  {itemCount > 0 && (
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] flex items-center justify-center font-bold">{itemCount}</div>
                  )}
                  <div className="text-xs font-semibold text-gray-800 mb-0.5 truncate">{service.name}</div>
                  <div className="text-base font-bold text-blue-600">{Number(service.basePrice)} ₪</div>
                  <div className="text-[9px] text-gray-400 mt-0.5">{CATEGORY_LABELS[service.category] ?? service.category}</div>
                </button>
              );
            })}
          </div>

          {filteredServices.length === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">
              {debouncedServiceSearch ? `לא נמצא "${debouncedServiceSearch}"` : 'אין שירותים'}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="w-80 bg-white border-r flex flex-col shadow-sm">
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">סל ({totalItems})</span>
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-[10px] text-red-400 hover:text-red-600">נקה</button>}
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <ShoppingBag className="w-10 h-10 mb-2" />
                <span className="text-xs">לחיצה אחת = הוספה מהירה</span>
                <span className="text-[10px] mt-1">לחץ על פריט בסל לפרטים</span>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {cart.map((item) => (
                  <div key={item.id}
                    className="bg-gray-50 rounded-lg p-2 animate-fadeIn cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => openItemDetail(item)}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{item.customName}</div>
                        {item.garmentType !== 'OTHER' && (
                          <div className="text-[10px] text-blue-500 flex items-center gap-0.5">
                            <Tag className="w-2.5 h-2.5" /> {item.garmentLabel}
                          </div>
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                        className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => updateQuantity(item.id, -1)}
                          className="w-6 h-6 rounded bg-white border flex items-center justify-center hover:bg-gray-100"><Minus className="w-2.5 h-2.5" /></button>
                        <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)}
                          className="w-6 h-6 rounded bg-white border flex items-center justify-center hover:bg-gray-100"><Plus className="w-2.5 h-2.5" /></button>
                      </div>
                      <span className="font-semibold text-xs text-gray-800">{(item.unitPrice * item.quantity).toLocaleString()} ₪</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t p-3 space-y-2 bg-white">
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between text-gray-500"><span>ביניים</span><span>{subtotal.toLocaleString()} ₪</span></div>
                {priority === 'EXPRESS' && (
                  <div className="flex justify-between text-orange-500"><span>אקספרס x1.5</span><span>+{(adjustedSubtotal - subtotal).toLocaleString()} ₪</span></div>
                )}
                <div className="flex justify-between text-gray-500"><span>{"מע\"מ 18%"}</span><span>{vatAmount.toLocaleString()} ₪</span></div>
                <div className="flex justify-between font-bold text-base pt-1 border-t"><span>{"סה\"כ"}</span><span className="text-blue-600">{total.toLocaleString()} ₪</span></div>
              </div>

              <div className="flex gap-1.5">
                <button onClick={() => setPriority('NORMAL')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${priority === 'NORMAL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>רגיל</button>
                <button onClick={() => setPriority('EXPRESS')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 ${priority === 'EXPRESS' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  <Zap className="w-3 h-3" /> אקספרס</button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={markAsPaid} onChange={e => setMarkAsPaid(e.target.checked)}
                  className="w-3.5 h-3.5 text-green-600 rounded border-gray-300" />
                <span className="text-xs text-gray-700">שולם</span>
              </label>

              {markAsPaid && (
                <div className="grid grid-cols-4 gap-1">
                  {(['CASH', 'CREDIT', 'TRANSFER', 'PREPAID'] as const).map(m => (
                    <button key={m} onClick={() => setPaymentMethod(m)}
                      className={`py-1.5 rounded text-[10px] font-medium ${paymentMethod === m ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {m === 'CASH' ? 'מזומן' : m === 'CREDIT' ? 'אשראי' : m === 'TRANSFER' ? 'העברה' : 'מקדמה'}
                    </button>
                  ))}
                </div>
              )}

              <button onClick={handleSubmit}
                disabled={!selectedCustomer || cart.length === 0 || createMutation.isPending}
                className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 active:scale-[0.98] shadow-sm">
                {createMutation.isPending ? 'יוצר...' : `צור הזמנה — ${total.toLocaleString()} ₪`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Item Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{detailItem.serviceName}</h3>
                <p className="text-[10px] text-gray-400">{detailItem.unitPrice} ₪</p>
              </div>
              <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 max-h-[55vh] overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">סוג פריט</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {GARMENT_CATEGORIES.map(g => (
                    <button key={g.value} onClick={() => { setDetailGarmentType(g.value); setDetailSubType(''); }}
                      className={`px-2 py-2 rounded-lg text-xs font-medium ${detailGarmentType === g.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              {detailGarmentType && GARMENT_SUB_TYPES[detailGarmentType] && (
                <div className="animate-fadeIn">
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">תת-סוג</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {GARMENT_SUB_TYPES[detailGarmentType].map(sub => (
                      <button key={sub.value} onClick={() => setDetailSubType(sub.value)}
                        className={`px-2 py-1.5 rounded-lg text-xs ${detailSubType === sub.value ? 'bg-blue-100 text-blue-700 border-blue-300 border' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                        {sub.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">שם מותאם</label>
                <input type="text" value={detailCustomName} onChange={e => setDetailCustomName(e.target.value)}
                  placeholder="לדוגמה: חולצה כחולה..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t bg-gray-50">
              <button onClick={() => setDetailItem(null)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium">ביטול</button>
              <button onClick={saveItemDetail} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
