import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import {
  ORDER_BOARD_COLUMNS, STATUS_LABELS, STATUS_COLORS, ORDER_STATUS_ICONS, NEXT_STATUS,
} from '../lib/constants';
import api from '../lib/api';
import {
  ScanLine, Keyboard, ChevronDown, ChevronUp, User,
  ShoppingBag, CheckCircle, AlertTriangle, Zap, Package, Clock, Phone,
} from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  priority: string;
  totalAmount: number;
  createdAt: string;
  customer?: { name: string; phone?: string };
  items?: { id: string; description: string; status: string }[];
  deliveryType?: string;
  notes?: string;
}

export default function WorkboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Scanner
  const [scanBuffer, setScanBuffer] = useState('');
  const [manualScan, setManualScan] = useState('');
  const [lastScanResult, setLastScanResult] = useState<string | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Expanded order
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Drag state
  const [dragOrder, setDragOrder] = useState<Order | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Fetch all active orders
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['workboard-orders'],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { limit: 200 } });
      return res.data.data;
    },
    refetchInterval: 15_000,
  });

  const orders: Order[] = ordersData?.orders ?? [];

  // Group by order status
  const columnOrders: Record<string, Order[]> = {};
  ORDER_BOARD_COLUMNS.forEach(col => { columnOrders[col] = []; });
  orders.forEach(order => {
    const status = order.status || 'RECEIVED';
    // Map legacy statuses to board columns
    let col = status;
    if (['WASHING', 'DRYING', 'IRONING'].includes(status)) col = 'PROCESSING';
    if (status === 'PICKED_UP') col = 'PROCESSING';
    if (columnOrders[col]) {
      columnOrders[col].push(order);
    } else if (status !== 'CANCELLED') {
      columnOrders['RECEIVED']?.push(order);
    }
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      api.patch(`/orders/${orderId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workboard-orders'] });
    },
    onError: () => addToast('שגיאה בעדכון סטטוס', 'error'),
  });

  // Advance order to next status
  const advanceOrder = useCallback((order: Order) => {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;
    statusMutation.mutate({ orderId: order.id, status: nextStatus });
    addToast(`${order.orderNumber} → ${STATUS_LABELS[nextStatus]}`);
  }, [statusMutation, addToast]);

  // Move order to specific status
  const moveOrder = useCallback((order: Order, newStatus: string) => {
    if (order.status === newStatus) return;
    statusMutation.mutate({ orderId: order.id, status: newStatus });
    addToast(`${order.orderNumber} → ${STATUS_LABELS[newStatus]}`);
  }, [statusMutation, addToast]);

  // Barcode scan handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === manualInputRef.current) return;
      if (e.key === 'Enter' && scanBuffer.length >= 3) {
        handleScan(scanBuffer);
        setScanBuffer('');
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setScanBuffer(prev => prev + e.key);
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = setTimeout(() => setScanBuffer(''), 300);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [scanBuffer]);

  const handleScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const res = await api.get(`/orders/search/barcode/${trimmed}`);
      const found = res.data.data;
      if (found?.orderId) {
        const order = orders.find(o => o.id === found.orderId);
        if (order) {
          advanceOrder(order);
          setLastScanResult(`✅ הזמנה ${order.orderNumber} עודכנה`);
        }
      } else {
        setLastScanResult(`❌ לא נמצא: ${trimmed}`);
      }
    } catch {
      setLastScanResult(`❌ לא נמצא: ${trimmed}`);
    }
    setTimeout(() => setLastScanResult(null), 4000);
  };

  const handleManualScan = () => {
    if (manualScan.trim()) {
      handleScan(manualScan.trim());
      setManualScan('');
    }
  };

  // Drag handlers
  const onDragStart = (order: Order) => setDragOrder(order);
  const onDragEnd = () => { setDragOrder(null); setDragOverCol(null); };
  const onDragOver = (e: React.DragEvent, col: string) => { e.preventDefault(); setDragOverCol(col); };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = (col: string) => {
    if (dragOrder && dragOrder.status !== col) moveOrder(dragOrder, col);
    setDragOrder(null);
    setDragOverCol(null);
  };

  const getTimeAgo = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return `${mins} דק׳`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} שע׳`;
    return `${Math.floor(hrs / 24)} ימים`;
  };

  if (isLoading) return (
    <div className="h-full flex items-center justify-center text-gray-400">
      <div className="text-center">
        <Package className="w-12 h-12 mx-auto mb-3 animate-pulse" />
        <p>טוען לוח עבודה...</p>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b px-4 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-blue-600" />
          <h1 className="font-bold text-gray-800">לוח עבודה</h1>
        </div>

        <div className="flex gap-2 max-w-xs">
          <div className="relative flex-1">
            <Keyboard className="absolute right-3 top-2 w-4 h-4 text-gray-400" />
            <input
              ref={manualInputRef}
              value={manualScan}
              onChange={e => setManualScan(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualScan()}
              placeholder="סרוק ברקוד / הקלד..."
              className="w-full pr-9 pl-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <button onClick={handleManualScan}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            סרוק
          </button>
        </div>

        {lastScanResult && (
          <div className={`px-3 py-1.5 rounded-lg text-sm font-medium animate-fadeIn ${
            lastScanResult.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {lastScanResult}
          </div>
        )}

        <div className="flex gap-3 mr-auto text-xs text-gray-500">
          {ORDER_BOARD_COLUMNS.map(col => (
            <span key={col} className="flex items-center gap-1">
              <span>{ORDER_STATUS_ICONS[col]}</span>
              <span className="font-bold text-gray-700">{columnOrders[col]?.length ?? 0}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-max">
          {ORDER_BOARD_COLUMNS.map(col => {
            const colOrders = columnOrders[col] || [];
            const isOver = dragOverCol === col;

            return (
              <div key={col}
                className={`flex-1 min-w-[220px] max-w-[300px] flex flex-col border-l first:border-l-0 transition-colors ${
                  isOver ? 'bg-blue-50' : 'bg-gray-50'
                }`}
                onDragOver={e => onDragOver(e, col)}
                onDragLeave={onDragLeave}
                onDrop={() => onDrop(col)}
              >
                {/* Column Header */}
                <div className={`px-3 py-2.5 border-b sticky top-0 z-10 ${isOver ? 'bg-blue-100' : 'bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{ORDER_STATUS_ICONS[col]}</span>
                      <span className="font-semibold text-sm text-gray-800">{STATUS_LABELS[col]}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      colOrders.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {colOrders.length}
                    </span>
                  </div>
                </div>

                {/* Orders */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {colOrders.map(order => {
                    const isExpress = order.priority === 'EXPRESS';
                    const isExpanded = expandedOrderId === order.id;
                    const itemCount = order.items?.length || 0;

                    return (
                      <div key={order.id}
                        draggable
                        onDragStart={() => onDragStart(order)}
                        onDragEnd={onDragEnd}
                        className={`bg-white rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                          dragOrder?.id === order.id ? 'opacity-40 scale-95' : ''
                        } ${isExpress ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'}`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-blue-600 font-bold">
                            #{order.orderNumber}
                          </span>
                          <div className="flex items-center gap-1">
                            {isExpress && <span title="דחוף"><Zap className="w-3.5 h-3.5 text-orange-500" /></span>}
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {getTimeAgo(order.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Customer */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{order.customer?.name || 'לקוח'}</div>
                            {order.customer?.phone && (
                              <div className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                <Phone className="w-2.5 h-2.5" /> {order.customer.phone}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Amount + items */}
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-gray-500 flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3" /> {itemCount} פריטים
                          </span>
                          <span className="font-bold text-gray-800">
                            {Number(order.totalAmount || 0).toLocaleString()} ₪
                          </span>
                        </div>

                        {/* Notes */}
                        {order.notes && (
                          <div className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{order.notes}</span>
                          </div>
                        )}

                        {/* Action */}
                        <div className="flex items-center justify-between">
                          {NEXT_STATUS[col] && (
                            <button
                              onClick={(e) => { e.stopPropagation(); advanceOrder(order); }}
                              className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                            >
                              {STATUS_LABELS[NEXT_STATUS[col]]} →
                            </button>
                          )}
                          {col === 'DELIVERED' && (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> הושלם
                            </span>
                          )}
                        </div>

                        {/* Expand items */}
                        {itemCount > 0 && (
                          <>
                            <button
                              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                              className="w-full mt-2 pt-2 border-t text-[10px] text-gray-400 hover:text-blue-600 flex items-center justify-center gap-0.5"
                            >
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {isExpanded ? 'סגור' : 'צפה בפריטים'}
                            </button>

                            {isExpanded && (
                              <div className="mt-2 space-y-1 animate-fadeIn">
                                {(order.items || []).map((item: any) => (
                                  <div key={item.id}
                                    className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-gray-50"
                                  >
                                    <span className="truncate flex-1">{item.description}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                                      STATUS_COLORS[item.status]?.split(' ').slice(0, 2).join(' ') || 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {STATUS_LABELS[item.status] || item.status}
                                    </span>
                                  </div>
                                ))}
                                <button
                                  onClick={() => navigate(`/orders/${order.id}`)}
                                  className="w-full text-[10px] text-blue-600 hover:text-blue-800 py-0.5"
                                >
                                  פתח הזמנה ←
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {colOrders.length === 0 && (
                    <div className="text-center py-8 text-gray-300">
                      <span className="text-2xl block mb-1">{ORDER_STATUS_ICONS[col]}</span>
                      <span className="text-xs">ריק</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
