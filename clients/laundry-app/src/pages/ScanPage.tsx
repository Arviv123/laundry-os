import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/constants';
import api from '../lib/api';
import {
  ScanLine, Search, Package, Camera, X, Keyboard,
  ArrowLeft, CheckCircle,
} from 'lucide-react';

export default function ScanPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [mode, setMode] = useState<'manual' | 'camera'>('manual');
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input for barcode scanner input
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  // Listen for barcode scanner input (rapid keystrokes)
  useEffect(() => {
    let buffer = '';
    let timer: any;

    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return; // Skip if input focused
      if (e.key === 'Enter' && buffer.length >= 4) {
        setBarcode(buffer);
        handleSearch(buffer);
        buffer = '';
        return;
      }
      if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buffer = ''; }, 100);
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      clearTimeout(timer);
    };
  }, []);

  const handleSearch = async (code?: string) => {
    const searchCode = code || barcode;
    if (!searchCode.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.get(`/orders/search/barcode/${encodeURIComponent(searchCode.trim())}`);
      setResult(res.data.data);
      addToast('פריט נמצא!');
    } catch {
      try {
        // Fallback: search by order number
        const res = await api.get('/orders', { params: { search: searchCode.trim(), limit: 1 } });
        const orders = res.data.data?.orders ?? [];
        if (orders.length > 0) {
          setResult({ order: orders[0], item: null });
          addToast('הזמנה נמצאה!');
        } else {
          addToast('לא נמצא פריט עם ברקוד זה', 'error');
          setResult(null);
        }
      } catch {
        addToast('שגיאה בחיפוש', 'error');
      }
    }
    setLoading(false);
  };

  const order = result?.order;
  const item = result?.item;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <ScanLine className="w-7 h-7 text-blue-600" /> סורק ברקוד
      </h1>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button onClick={() => setMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          <Keyboard className="w-4 h-4" /> הקלדה / סורק
        </button>
        <button onClick={() => setMode('camera')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            mode === 'camera' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          <Camera className="w-4 h-4" /> מצלמה
        </button>
      </div>

      {/* Manual Input */}
      {mode === 'manual' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <p className="text-sm text-gray-500 mb-3">סרוק ברקוד עם סורק USB או הקלד את הקוד ידנית</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="ברקוד או מספר הזמנה..."
                className="w-full pr-11 pl-4 py-3 border rounded-xl text-lg focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <button onClick={() => handleSearch()} disabled={loading || !barcode.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40">
              {loading ? '...' : 'חפש'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">💡 חבר סורק ברקוד USB — הסריקה תתבצע אוטומטית</p>
        </div>
      )}

      {/* Camera Mode */}
      {mode === 'camera' && (
        <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
          <div className="bg-gray-100 rounded-xl h-64 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Camera className="w-12 h-12 mx-auto mb-2" />
              <p className="font-medium">סריקת מצלמה</p>
              <p className="text-sm mt-1">בגרסה עתידית — השתמש בסורק USB כרגע</p>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && order && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-slideDown">
          <div className="px-6 py-4 bg-green-50 border-b flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-800">
              {item ? `פריט נמצא בהזמנה ${order.orderNumber}` : `הזמנה ${order.orderNumber}`}
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* Order Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-gray-500 block">מספר הזמנה</span>
                <span className="font-mono font-bold text-blue-600">{order.orderNumber}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">לקוח</span>
                <span className="font-medium">{order.customer?.name ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">סטטוס</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">{"סה\"כ"}</span>
                <span className="font-bold">{Number(order.total).toLocaleString()} ₪</span>
              </div>
            </div>

            {/* Specific Item */}
            {item && (
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-800 mb-1">פריט שנסרק:</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">{item.description || item.service?.name}</span>
                    <span className="text-gray-500 text-sm mr-2">×{item.quantity}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1 font-mono">ברקוד: {item.barcode}</div>
              </div>
            )}

            {/* Items List */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2">כל הפריטים ({order.items?.length})</h3>
              <div className="space-y-1">
                {order.items?.map((it: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                    it.id === item?.id ? 'bg-blue-100 border border-blue-300' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{i + 1}</span>
                      <span>{it.description || it.service?.name}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[it.status] ?? 'bg-gray-100'}`}>
                      {STATUS_LABELS[it.status] ?? it.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button onClick={() => navigate(`/orders/${order.id}`)}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700">
                פתח הזמנה
              </button>
              <button onClick={() => { setResult(null); setBarcode(''); inputRef.current?.focus(); }}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                סרוק עוד
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <Package className="w-16 h-16 text-gray-200 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-400">סרוק ברקוד לחיפוש פריט</h3>
          <p className="text-sm text-gray-300 mt-1">ברקוד מודפס על תווית הפריט</p>
        </div>
      )}
    </div>
  );
}
