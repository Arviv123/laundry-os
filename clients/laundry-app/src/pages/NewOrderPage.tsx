import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import { CATEGORY_LABELS, GARMENT_CATEGORIES, GARMENT_SUB_TYPES } from '../lib/constants';
import {
  Search, Plus, Minus, X, ShoppingBag, User, Zap,
  Truck, Store, UserPlus, Tag, ChevronDown,
  Printer, Receipt,
} from 'lucide-react';

interface CartItem {
  id: string; // unique cart item id
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

export default function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Customer search
  const [customerQuery, setCustomerQuery] = useState('');
  const debouncedCustomerQuery = useDebounce(customerQuery, 200);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const customerInputRef = useRef<HTMLInputElement>(null);

  // Services & items
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [serviceSearch, setServiceSearch] = useState('');
  const debouncedServiceSearch = useDebounce(serviceSearch, 150);

  // Sub-category modal
  const [pendingService, setPendingService] = useState<any>(null);
  const [selectedGarmentType, setSelectedGarmentType] = useState('');
  const [selectedSubType, setSelectedSubType] = useState('');
  const [customItemName, setCustomItemName] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priority, setPriority] = useState<'NORMAL' | 'EXPRESS'>('NORMAL');
  const [deliveryType, setDeliveryType] = useState<'STORE_PICKUP' | 'HOME_DELIVERY'>('STORE_PICKUP');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CREDIT' | 'TRANSFER' | 'PREPAID'>('CASH');
  const [markAsPaid, setMarkAsPaid] = useState(false);

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

  const serviceList = Array.isArray(services) ? services : [];
  const categories = ['ALL', 'WASH', 'DRY_CLEAN', 'IRON', 'FOLD', 'SPECIAL'];

  const filteredServices = useMemo(() => {
    let list = serviceList.filter((s: any) => s.isActive);
    if (activeCategory !== 'ALL') {
      list = list.filter((s: any) => s.category === activeCategory);
    }
    if (debouncedServiceSearch) {
      const q = debouncedServiceSearch.toLowerCase();
      list = list.filter((s: any) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [serviceList, activeCategory, debouncedServiceSearch]);

  // Open sub-category picker for a service
  const openSubCategoryPicker = (service: any) => {
    setPendingService(service);
    setSelectedGarmentType('');
    setSelectedSubType('');
    setCustomItemName('');
  };

  // Confirm adding item with sub-category
  const confirmAddItem = () => {
    if (!pendingService) return;
    const garmentCat = GARMENT_CATEGORIES.find(g => g.value === selectedGarmentType);
    const subTypes = GARMENT_SUB_TYPES[selectedGarmentType] ?? [];
    const subType = subTypes.find(s => s.value === selectedSubType);

    const label = [
      pendingService.name,
      garmentCat?.label,
      subType?.label,
    ].filter(Boolean).join(' - ');

    const item: CartItem = {
      id: nextCartId(),
      serviceId: pendingService.id,
      serviceName: pendingService.name,
      category: pendingService.category,
      garmentType: selectedGarmentType || 'OTHER',
      garmentSubType: selectedSubType || 'OTHER',
      garmentLabel: label,
      customName: customItemName || label,
      quantity: 1,
      unitPrice: Number(pendingService.basePrice),
    };

    setCart(prev => [...prev, item]);
    setPendingService(null);
  };

  // Quick add (skip sub-category for simple services)
  const quickAddToCart = (service: any) => {
    // For services with obvious garment types, open picker
    // For simple services (fold, special), add directly
    if (['FOLD', 'SPECIAL'].includes(service.category)) {
      setCart(prev => [...prev, {
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
      }]);
    } else {
      openSubCategoryPicker(service);
    }
  };

  // Cart operations
  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev
      .map(item => item.id === itemId
        ? { ...item, quantity: Math.max(0, item.quantity + delta) }
        : item
      )
      .filter(item => item.quantity > 0)
    );
  };

  const updateCustomName = (itemId: string, customName: string) => {
    setCart(prev => prev.map(item =>
      item.id === itemId ? { ...item, customName } : item
    ));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
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
      addToast(`הזמנה ${order.orderNumber} נוצרה בהצלחה!`);
      navigate(`/orders/${order.id}`);
    },
    onError: (err: any) => {
      addToast(err.response?.data?.error ?? 'שגיאה ביצירת הזמנה', 'error');
    },
  });

  // Create new customer
  const createCustomerMutation = useMutation({
    mutationFn: (data: any) => api.post('/crm/customers', data),
    onSuccess: (res) => {
      const customer = res.data.data;
      setSelectedCustomer(customer);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast(`לקוח ${customer.name} נוצר`);
    },
    onError: () => addToast('שגיאה ביצירת לקוח', 'error'),
  });

  const handleSubmit = () => {
    if (!selectedCustomer || cart.length === 0) return;
    createMutation.mutate({
      customerId: selectedCustomer.id,
      priority,
      deliveryType,
      source: 'STORE',
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

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const handler = () => setShowCustomerDropdown(false);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showCustomerDropdown]);

  useEffect(() => { customerInputRef.current?.focus(); }, []);

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* Header: Customer Selection */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <ShoppingBag className="w-6 h-6 text-blue-600 flex-shrink-0" />

          {selectedCustomer ? (
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-xl">
                <User className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-800">{selectedCustomer.name}</span>
                {selectedCustomer.phone && <span className="text-sm text-blue-500">{selectedCustomer.phone}</span>}
                <button onClick={() => { setSelectedCustomer(null); setCustomerQuery(''); }}
                  className="mr-2 p-0.5 hover:bg-blue-100 rounded">
                  <X className="w-4 h-4 text-blue-400" />
                </button>
              </div>

              {/* Delivery Type Toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setDeliveryType('STORE_PICKUP')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    deliveryType === 'STORE_PICKUP' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
                  }`}>
                  <Store className="w-3.5 h-3.5" /> איסוף
                </button>
                <button onClick={() => setDeliveryType('HOME_DELIVERY')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    deliveryType === 'HOME_DELIVERY' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
                  }`}>
                  <Truck className="w-3.5 h-3.5" /> משלוח
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative" onClick={e => e.stopPropagation()}>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  ref={customerInputRef}
                  type="text" value={customerQuery}
                  onChange={e => { setCustomerQuery(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="הקלד שם, טלפון או מייל לקוח..."
                  className="w-full max-w-md pr-10 pl-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {showCustomerDropdown && customerQuery.length >= 1 && (
                <div className="absolute top-full mt-1 w-full max-w-md bg-white border rounded-xl shadow-xl z-20 overflow-hidden animate-slideDown">
                  {customerResults?.map((c: any) => (
                    <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-blue-50 transition-colors">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{c.name}</div>
                        <div className="text-xs text-gray-400">{c.phone} {c.email && `| ${c.email}`}</div>
                      </div>
                    </button>
                  ))}
                  {customerResults?.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-400 text-center">לא נמצא לקוח</div>
                  )}
                  <button onClick={() => { setShowNewCustomerForm(true); setShowCustomerDropdown(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 border-t text-blue-600 hover:bg-blue-50 text-sm font-medium">
                    <UserPlus className="w-4 h-4" /> לקוח חדש
                  </button>
                </div>
              )}

              {showNewCustomerForm && (
                <div className="absolute top-full mt-1 w-full max-w-md bg-white border rounded-xl shadow-xl z-20 p-4 space-y-3 animate-slideDown">
                  <div className="font-medium text-gray-700 text-sm">לקוח חדש</div>
                  <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                    placeholder="שם" className="w-full px-3 py-2 border rounded-lg text-sm" autoFocus />
                  <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)}
                    placeholder="טלפון" className="w-full px-3 py-2 border rounded-lg text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => createCustomerMutation.mutate({ name: newCustomerName, phone: newCustomerPhone, type: 'B2C', status: 'ACTIVE' })}
                      disabled={!newCustomerName || createCustomerMutation.isPending}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40">
                      {createCustomerMutation.isPending ? 'שומר...' : 'צור'}
                    </button>
                    <button onClick={() => setShowNewCustomerForm(false)}
                      className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm">ביטול</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Services + Cart */}
      <div className="flex-1 flex overflow-hidden">
        {/* Services Panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Category Tabs + Service Search */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-2 overflow-x-auto flex-1 pb-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeCategory === cat
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}>
                  {cat === 'ALL' ? 'הכל' : CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
            <div className="relative w-48 flex-shrink-0">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <input type="text" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                placeholder="חיפוש שירות..."
                className="w-full pr-9 pl-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Service Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredServices.map((service: any) => {
              const itemCount = cart.filter(c => c.serviceId === service.id).reduce((s, c) => s + c.quantity, 0);
              return (
                <button key={service.id} onClick={() => quickAddToCart(service)}
                  className={`relative bg-white border-2 rounded-xl p-4 text-center transition-all duration-150 active:scale-95 ${
                    itemCount > 0 ? 'border-blue-400 shadow-md ring-1 ring-blue-200' : 'border-gray-100 hover:border-blue-300 hover:shadow-sm'
                  }`}>
                  {itemCount > 0 && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                      {itemCount}
                    </div>
                  )}
                  <div className="text-sm font-semibold text-gray-800 mb-1">{service.name}</div>
                  <div className="text-lg font-bold text-blue-600">{Number(service.basePrice)} ₪</div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {CATEGORY_LABELS[service.category] ?? service.category}
                    {service.estimatedMinutes && ` · ${service.estimatedMinutes} דק׳`}
                  </div>
                </button>
              );
            })}
          </div>

          {filteredServices.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              {debouncedServiceSearch ? `לא נמצא שירות "${debouncedServiceSearch}"` : 'אין שירותים בקטגוריה זו'}
            </div>
          )}
        </div>

        {/* Cart Panel */}
        <div className="w-96 bg-white border-r flex flex-col shadow-sm">
          {/* Cart Header */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">סל ({totalItems} פריטים)</span>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">נקה הכל</button>
              )}
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <ShoppingBag className="w-12 h-12 mb-2" />
                <span className="text-sm">לחץ על שירות להוספה</span>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {cart.map((item, idx) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-3 animate-fadeIn">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{item.serviceName}</div>
                        <div className="text-[11px] text-blue-500 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {item.garmentLabel}
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.id)}
                        className="p-1 text-gray-300 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Custom name input */}
                    <input
                      type="text" value={item.customName}
                      onChange={e => updateCustomName(item.id, e.target.value)}
                      placeholder="שם/תיאור פריט..."
                      className="w-full px-2 py-1 text-xs border rounded mb-2 focus:ring-1 focus:ring-blue-400"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQuantity(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="font-semibold text-sm text-gray-800">
                        {(item.unitPrice * item.quantity).toLocaleString()} ₪
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">פריט #{idx + 1}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout */}
          {cart.length > 0 && (
            <div className="border-t p-4 space-y-3 bg-white">
              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>סכום ביניים</span>
                  <span>{subtotal.toLocaleString()} ₪</span>
                </div>
                {priority === 'EXPRESS' && (
                  <div className="flex justify-between text-orange-500">
                    <span>תוספת אקספרס (x1.5)</span>
                    <span>+{(adjustedSubtotal - subtotal).toLocaleString()} ₪</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>{"מע\"מ (18%)"}</span>
                  <span>{vatAmount.toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-1 border-t">
                  <span>{"סה\"כ"}</span>
                  <span className="text-blue-600">{total.toLocaleString()} ₪</span>
                </div>
              </div>

              {/* Priority Toggle */}
              <div className="flex gap-2">
                <button onClick={() => setPriority('NORMAL')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    priority === 'NORMAL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                  רגיל
                </button>
                <button onClick={() => setPriority('EXPRESS')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                    priority === 'EXPRESS' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                  <Zap className="w-3.5 h-3.5" /> אקספרס
                </button>
              </div>

              {/* Payment toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={markAsPaid} onChange={e => setMarkAsPaid(e.target.checked)}
                  className="w-4 h-4 text-green-600 rounded border-gray-300" />
                <span className="text-sm text-gray-700">סמן כשולם</span>
              </label>

              {markAsPaid && (
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { key: 'CASH', label: 'מזומן', icon: '💵' },
                    { key: 'CREDIT', label: 'אשראי', icon: '💳' },
                    { key: 'TRANSFER', label: 'העברה', icon: '🏦' },
                    { key: 'PREPAID', label: 'מקדמה', icon: '👛' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => setPaymentMethod(pm.key as any)}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        paymentMethod === pm.key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                      {pm.icon} {pm.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Submit */}
              <button onClick={handleSubmit}
                disabled={!selectedCustomer || cart.length === 0 || createMutation.isPending}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-base hover:bg-green-700 disabled:opacity-40 transition-all active:scale-[0.98] shadow-sm">
                {createMutation.isPending
                  ? 'יוצר הזמנה...'
                  : `צור הזמנה — ${total.toLocaleString()} ₪`
                }
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-Category Picker Modal */}
      {pendingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPendingService(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideDown" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800">{pendingService.name} — בחר סוג פריט</h3>
              <p className="text-xs text-gray-400 mt-1">{Number(pendingService.basePrice)} ₪ | {CATEGORY_LABELS[pendingService.category] ?? pendingService.category}</p>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Garment Type */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">סוג פריט</label>
                <div className="grid grid-cols-3 gap-2">
                  {GARMENT_CATEGORIES.map(g => (
                    <button key={g.value} onClick={() => { setSelectedGarmentType(g.value); setSelectedSubType(''); }}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        selectedGarmentType === g.value
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-Type */}
              {selectedGarmentType && GARMENT_SUB_TYPES[selectedGarmentType] && (
                <div className="animate-fadeIn">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">תת-סוג</label>
                  <div className="grid grid-cols-2 gap-2">
                    {GARMENT_SUB_TYPES[selectedGarmentType].map(sub => (
                      <button key={sub.value} onClick={() => setSelectedSubType(sub.value)}
                        className={`px-3 py-2 rounded-lg text-sm transition-all ${
                          selectedSubType === sub.value
                            ? 'bg-blue-100 text-blue-700 border-blue-300 border'
                            : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}>
                        {sub.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Name */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">שם מותאם (אופציונלי)</label>
                <input type="text" value={customItemName} onChange={e => setCustomItemName(e.target.value)}
                  placeholder="לדוגמה: חולצה כחולה עם כתם..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t bg-gray-50">
              <button onClick={() => setPendingService(null)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-300">
                ביטול
              </button>
              <button onClick={confirmAddItem}
                disabled={!selectedGarmentType}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-40">
                הוסף לסל
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
