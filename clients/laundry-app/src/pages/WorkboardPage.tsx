import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import {
  ITEM_STATUS_FLOW, ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, ITEM_STATUS_ICONS, ITEM_NEXT_STATUS,
} from '../lib/constants';
import api from '../lib/api';
import {
  ScanLine, Keyboard, X, ChevronDown, ChevronUp, User,
  ShoppingBag, CheckCircle, AlertTriangle, Zap, Package,
} from 'lucide-react';

interface OrderItem {
  id: string;
  orderId: string;
  barcode: string;
  description: string;
  status: string;
  quantity: number;
  garmentType?: string;
  specialNotes?: string;
  service?: { name: string };
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    priority: string;
    customer?: { name: string; phone?: string };
    items?: OrderItem[];
  };
}

// Columns to show on the board (skip ITEM_DELIVERED to keep board focused)
const BOARD_COLUMNS = ['ITEM_RECEIVED', 'SORTING', 'IN_WASH', 'IN_DRY', 'IN_IRON', 'FOLDING', 'PACKED'];

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
  const [dragItem, setDragItem] = useState<OrderItem | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Fetch all active orders with items
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['workboard-orders'],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { limit: 200 } });
      return res.data.data;
    },
    refetchInterval: 15_000,
  });

  const orders = ordersData?.orders ?? [];

  // Flatten all items with their parent order info
  const allItems: OrderItem[] = [];
  orders.forEach((order: any) => {
    (order.items ?? []).forEach((item: any) => {
      allItems.push({
        ...item,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          priority: order.priority,
          customer: order.customer,
          items: order.items,
        },
      });
    });
  });

  // Group by item status
  const columnItems: Record<string, OrderItem[]> = {};
  BOARD_COLUMNS.forEach(col => { columnItems[col] = []; });
  allItems.forEach(item => {
    const status = item.status || 'ITEM_RECEIVED';
    if (columnItems[status]) {
      columnItems[status].push(item);
    }
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: string; itemId: string; status: string }) =>
      api.patch(`/orders/${orderId}/items/${itemId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workboard-orders'] });
    },
    onError: () => addToast('שגיאה בעדכון סטטוס פריט', 'error'),
  });

  // Advance item to next status
  const advanceItem = useCallback((item: OrderItem) => {
    const nextStatus = ITEM_NEXT_STATUS[item.status];
    if (!nextStatus) return;
    statusMutation.mutate({
      orderId: item.orderId,
      itemId: item.id,
      status: nextStatus,
    });
    addToast(`${item.description} → ${ITEM_STATUS_LABELS[nextStatus]}`);
  }, [statusMutation, addToast]);

  // Move item to specific status
  const moveItem = useCallback((item: OrderItem, newStatus: string) => {
    if (item.status === newStatus) return;
    statusMutation.mutate({
      orderId: item.orderId,
      itemId: item.id,
      status: newStatus,
    });
    addToast(`${item.description} → ${ITEM_STATUS_LABELS[newStatus]}`);
  }, [statusMutation, addToast]);

  // Barcode scan handler (USB scanner sends rapid keystrokes + Enter)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if focus is in manual input
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

  // Handle scan result
  const handleScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Find item by barcode in current data
    const item = allItems.find(i => i.barcode === trimmed);
    if (item) {
      advanceItem(item);
      setLastScanResult(`✅ ${item.description} → ${ITEM_STATUS_LABELS[ITEM_NEXT_STATUS[item.status] || item.status]}`);
    } else {
      // Try API search
      try {
        const res = await api.get(`/orders/search/barcode/${trimmed}`);
        const found = res.data.data;
        if (found) {
          const nextStatus = ITEM_NEXT_STATUS[found.status] || found.status;
          statusMutation.mutate({ orderId: found.orderId, itemId: found.id, status: nextStatus });
          setLastScanResult(`✅ ${found.description} → ${ITEM_STATUS_LABELS[nextStatus]}`);
          queryClient.invalidateQueries({ queryKey: ['workboard-orders'] });
        } else {
          setLastScanResult(`❌ לא נמצא: ${trimmed}`);
        }
      } catch {
        setLastScanResult(`❌ לא נמצא: ${trimmed}`);
      }
    }
    setTimeout(() => setLastScanResult(null), 4000);
  };

  // Manual scan submit
  const handleManualScan = () => {
    if (manualScan.trim()) {
      handleScan(manualScan.trim());
      setManualScan('');
    }
  };

  // Drag handlers
  const onDragStart = (item: OrderItem) => setDragItem(item);
  const onDragEnd = () => { setDragItem(null); setDragOverCol(null); };
  const onDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(col);
  };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = (col: string) => {
    if (dragItem && dragItem.status !== col) {
      moveItem(dragItem, col);
    }
    setDragItem(null);
    setDragOverCol(null);
  };

  // Order completion info
  const getOrderCompletion = (order: any) => {
    const items = order?.items ?? [];
    const packed = items.filter((i: any) => i.status === 'PACKED' || i.status === 'ITEM_DELIVERED').length;
    return { total: items.length, done: packed, allDone: packed === items.length && items.length > 0 };
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
      {/* Top Bar - Scanner */}
      <div className="bg-white border-b px-4 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-blue-600" />
          <h1 className="font-bold text-gray-800">לוח עבודה</h1>
        </div>

        {/* Manual scan input */}
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

        {/* Scan result */}
        {lastScanResult && (
          <div className={`px-3 py-1.5 rounded-lg text-sm font-medium animate-fadeIn ${
            lastScanResult.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {lastScanResult}
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3 mr-auto text-xs text-gray-500">
          {BOARD_COLUMNS.map(col => (
            <span key={col} className="flex items-center gap-1">
              <span>{ITEM_STATUS_ICONS[col]}</span>
              <span className="font-bold text-gray-700">{columnItems[col]?.length ?? 0}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-max">
          {BOARD_COLUMNS.map(col => {
            const items = columnItems[col] || [];
            const isOver = dragOverCol === col;

            return (
              <div key={col}
                className={`flex-1 min-w-[200px] max-w-[280px] flex flex-col border-l first:border-l-0 transition-colors ${
                  isOver ? 'bg-blue-50' : 'bg-gray-50'
                }`}
                onDragOver={e => onDragOver(e, col)}
                onDragLeave={onDragLeave}
                onDrop={() => onDrop(col)}
              >
                {/* Column Header */}
                <div className={`px-3 py-2.5 border-b sticky top-0 z-10 ${
                  isOver ? 'bg-blue-100' : 'bg-white'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{ITEM_STATUS_ICONS[col]}</span>
                      <span className="font-semibold text-sm text-gray-800">{ITEM_STATUS_LABELS[col]}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      items.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {items.length}
                    </span>
                  </div>
                </div>

                {/* Column Items */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.map(item => {
                    const completion = getOrderCompletion(item.order);
                    const isExpress = item.order?.priority === 'EXPRESS';
                    const isExpanded = expandedOrderId === item.orderId;

                    return (
                      <div key={item.id}
                        draggable
                        onDragStart={() => onDragStart(item)}
                        onDragEnd={onDragEnd}
                        className={`bg-white rounded-lg border shadow-sm p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                          dragItem?.id === item.id ? 'opacity-40 scale-95' : ''
                        } ${isExpress ? 'border-orange-300' : 'border-gray-200'}`}
                      >
                        {/* Order badge */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-[10px] text-blue-600 font-bold">
                            {item.order?.orderNumber}
                          </span>
                          <div className="flex items-center gap-1">
                            {isExpress && <Zap className="w-3 h-3 text-orange-500" />}
                            {completion.allDone && <CheckCircle className="w-3 h-3 text-green-500" />}
                          </div>
                        </div>

                        {/* Item description */}
                        <div className="text-xs font-medium text-gray-800 mb-1 truncate" title={item.description}>
                          {item.description}
                        </div>

                        {/* Customer */}
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-1.5">
                          <User className="w-2.5 h-2.5" />
                          <span className="truncate">{item.order?.customer?.name}</span>
                        </div>

                        {/* Barcode */}
                        <div className="font-mono text-[9px] text-gray-300 mb-1.5 truncate">
                          {item.barcode}
                        </div>

                        {/* Special notes */}
                        {item.specialNotes && (
                          <div className="text-[9px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 mb-1.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span className="truncate">{item.specialNotes}</span>
                          </div>
                        )}

                        {/* Completion progress */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <ShoppingBag className="w-2.5 h-2.5" />
                            <span className={completion.allDone ? 'text-green-600 font-bold' : ''}>
                              {completion.done}/{completion.total}
                            </span>
                          </div>
                          {ITEM_NEXT_STATUS[col] && (
                            <button
                              onClick={(e) => { e.stopPropagation(); advanceItem(item); }}
                              className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
                            >
                              {ITEM_STATUS_LABELS[ITEM_NEXT_STATUS[col]]} →
                            </button>
                          )}
                        </div>

                        {/* Expand to see order items */}
                        <button
                          onClick={() => setExpandedOrderId(isExpanded ? null : item.orderId)}
                          className="w-full mt-1.5 pt-1.5 border-t text-[9px] text-gray-400 hover:text-blue-600 flex items-center justify-center gap-0.5"
                        >
                          {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                          {isExpanded ? 'סגור' : `${completion.total} פריטים בהזמנה`}
                        </button>

                        {/* Expanded order items */}
                        {isExpanded && (
                          <div className="mt-1.5 space-y-1 animate-fadeIn">
                            {(item.order?.items ?? []).map((sibling: any) => (
                              <div key={sibling.id}
                                className={`flex items-center justify-between text-[10px] px-2 py-1 rounded ${
                                  sibling.id === item.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                                }`}
                              >
                                <span className="truncate flex-1">{sibling.description}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                                  ITEM_STATUS_COLORS[sibling.status]?.split(' ').slice(0, 2).join(' ') || 'bg-gray-100 text-gray-600'
                                }`}>
                                  {ITEM_STATUS_LABELS[sibling.status] || sibling.status}
                                </span>
                              </div>
                            ))}
                            <button
                              onClick={() => navigate(`/orders/${item.orderId}`)}
                              className="w-full text-[10px] text-blue-600 hover:text-blue-800 py-0.5"
                            >
                              פתח הזמנה ←
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {items.length === 0 && (
                    <div className="text-center py-8 text-gray-300">
                      <span className="text-2xl block mb-1">{ITEM_STATUS_ICONS[col]}</span>
                      <span className="text-[10px]">ריק</span>
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
