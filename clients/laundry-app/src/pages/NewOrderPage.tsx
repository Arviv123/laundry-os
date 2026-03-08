import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import { CATEGORY_LABELS } from '../lib/constants';
import {
  Search, Plus, Minus, X, ShoppingBag, User, Zap,
  CreditCard, Banknote, Wallet, Truck, Store, UserPlus,
} from 'lucide-react';

interface CartItem {
  serviceId: string;
  serviceName: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

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

  // Services
  const [activeCategory, setActiveCategory] = useState('ALL');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priority, setPriority] = useState<'NORMAL' | 'EXPRESS'>('NORMAL');
  const [deliveryType, setDeliveryType] = useState<'STORE_PICKUP' | 'HOME_DELIVERY'>('STORE_PICKUP');

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
  const filteredServices = activeCategory === 'ALL'
    ? serviceList.filter((s: any) => s.isActive)
    : serviceList.filter((s: any) => s.isActive && s.category === activeCategory);

  // Cart operations
  const addToCart = (service: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.serviceId === service.id);
      if (existing) {
        return prev.map(item =>
          item.serviceId === service.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        serviceId: service.id,
        serviceName: service.name,
        category: service.category,
        description: service.name,
        quantity: 1,
        unitPrice: Number(service.basePrice),
      }];
    });
  };

  const updateQuantity = (serviceId: string, delta: number) => {
    setCart(prev => prev
      .map(item => item.serviceId === serviceId
        ? { ...item, quantity: Math.max(0, item.quantity + delta) }
        : item
      )
      .filter(item => item.quantity > 0)
    );
  };

  const updateDescription = (serviceId: string, description: string) => {
    setCart(prev => prev.map(item =>
      item.serviceId === serviceId ? { ...item, description } : item
    ));
  };

  const removeFromCart = (serviceId: string) => {
    setCart(prev => prev.filter(item => item.serviceId !== serviceId));
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const expressMultiplier = priority === 'EXPRESS' ? 1.5 : 1;
  const adjustedSubtotal = subtotal * expressMultiplier;
  const vatAmount = Math.round(adjustedSubtotal * 0.18);
  const total = adjustedSubtotal + vatAmount;

  // Create order
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/orders', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      addToast(`הזמנה ${res.data.data.orderNumber} נוצרה בהצלחה!`);
      navigate(`/orders/${res.data.data.id}`);
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
      items: cart.map(item => ({
        serviceId: item.serviceId,
        description: item.description,
        category: item.category === 'WASH' ? 'OTHER' : item.category,
        quantity: item.quantity,
      })),
    });
  };

  // Close customer dropdown on outside click
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const handler = () => setShowCustomerDropdown(false);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showCustomerDropdown]);

  // Focus customer input on load
  useEffect(() => {
    customerInputRef.current?.focus();
  }, []);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* Header: Customer Selection */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <ShoppingBag className="w-6 h-6 text-blue-600 flex-shrink-0" />

          {selectedCustomer ? (
            <div className="flex items-center gap-3 flex-1">
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
                  type="text"
                  value={customerQuery}
                  onChange={e => { setCustomerQuery(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="הקלד שם או טלפון לקוח..."
                  className="w-full max-w-md pr-10 pl-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Customer Dropdown */}
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
                        <div className="text-xs text-gray-400">{c.phone}</div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">{c.type}</span>
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

              {/* New Customer Form */}
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
          {/* Category Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
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

          {/* Service Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredServices.map((service: any) => {
              const inCart = cart.find(c => c.serviceId === service.id);
              return (
                <button key={service.id} onClick={() => addToCart(service)}
                  className={`relative bg-white border-2 rounded-xl p-4 text-center transition-all duration-150 active:scale-95 ${
                    inCart ? 'border-blue-400 shadow-md ring-1 ring-blue-200' : 'border-gray-100 hover:border-blue-300 hover:shadow-sm'
                  }`}>
                  {inCart && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                      {inCart.quantity}
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
            <div className="text-center text-gray-400 py-12">אין שירותים בקטגוריה זו</div>
          )}
        </div>

        {/* Cart Panel */}
        <div className="w-80 bg-white border-r flex flex-col shadow-sm">
          {/* Cart Header */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">סל ({totalItems})</span>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">
                  נקה הכל
                </button>
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
                {cart.map(item => (
                  <div key={item.serviceId} className="bg-gray-50 rounded-lg p-3 animate-fadeIn">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{item.serviceName}</div>
                        <div className="text-xs text-gray-400">{item.unitPrice} ₪ ליחידה</div>
                      </div>
                      <button onClick={() => removeFromCart(item.serviceId)}
                        className="p-1 text-gray-300 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => updateDescription(item.serviceId, e.target.value)}
                      placeholder="תיאור פריט..."
                      className="w-full px-2 py-1 text-xs border rounded mb-2 focus:ring-1 focus:ring-blue-400"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQuantity(item.serviceId, -1)}
                          className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100 transition-colors">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.serviceId, 1)}
                          className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100 transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="font-semibold text-sm text-gray-800">
                        {(item.unitPrice * item.quantity).toLocaleString()} ₪
                      </span>
                    </div>
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
                  <span>מע"מ (18%)</span>
                  <span>{vatAmount.toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-1 border-t">
                  <span>סה"כ</span>
                  <span className="text-blue-600">{total.toLocaleString()} ₪</span>
                </div>
              </div>

              {/* Priority Toggle */}
              <div className="flex gap-2">
                <button onClick={() => setPriority('NORMAL')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    priority === 'NORMAL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  רגיל
                </button>
                <button onClick={() => setPriority('EXPRESS')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                    priority === 'EXPRESS' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  <Zap className="w-3.5 h-3.5" /> אקספרס
                </button>
              </div>

              {/* Submit Button */}
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
    </div>
  );
}
