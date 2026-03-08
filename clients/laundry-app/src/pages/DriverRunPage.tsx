import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import {
  Truck, MapPin, Package, Navigation, CheckCircle, XCircle,
  GripVertical, Lock, Play, ArrowRight, Phone, Clock,
  Scan, PenTool, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

interface Stop {
  id: string;
  orderId: string;
  type: string;
  address: any;
  scheduledTime: string | null;
  completedTime: string | null;
  status: string;
  notes: string | null;
  signature: string | null;
  sortOrder: number;
  order: {
    id: string;
    orderNumber: string;
    customer: { id: string; name: string; phone: string | null; metadata: any } | null;
    items?: any[];
  };
}

interface Run {
  id: string;
  tenantId: string;
  driverId: string;
  date: string;
  status: string;
  isLocked: boolean;
  startedAt: string | null;
  completedAt: string | null;
  driver: { id: string; firstName: string | null; lastName: string | null } | null;
  stops: Stop[];
}

// ─── Status helpers ──────────────────────────────────────────────

const STOP_STATUS_LABELS: Record<string, string> = {
  STOP_PENDING: 'ממתין',
  ARRIVED: 'הגיע',
  STOP_COMPLETED: 'הושלם',
  FAILED: 'נכשל',
};

const STOP_STATUS_COLORS: Record<string, string> = {
  STOP_PENDING: 'bg-gray-100 text-gray-600',
  ARRIVED: 'bg-blue-100 text-blue-700',
  STOP_COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const STOP_ICON_COLORS: Record<string, string> = {
  STOP_PENDING: 'bg-gray-200 text-gray-500',
  ARRIVED: 'bg-blue-200 text-blue-600',
  STOP_COMPLETED: 'bg-green-200 text-green-600',
  FAILED: 'bg-red-200 text-red-600',
};

// ─── Main Component ──────────────────────────────────────────────

export default function DriverRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [showSignature, setShowSignature] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // ─── Queries ─────────────────────────────────────────────────

  const { data: run, isLoading } = useQuery<Run>({
    queryKey: ['delivery-run', runId],
    queryFn: () => api.get(`/delivery/runs/${runId}`).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  // ─── Mutations ───────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: () => api.patch(`/delivery/runs/${runId}/start`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] }); addToast('הסיבוב התחיל!'); },
    onError: () => addToast('שגיאה בהתחלת סיבוב', 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.patch(`/delivery/runs/${runId}/complete`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] }); addToast('הסיבוב הושלם!'); },
    onError: () => addToast('שגיאה בסיום סיבוב', 'error'),
  });

  const navigateMutation = useMutation({
    mutationFn: (stopId: string) => api.post(`/delivery/runs/${runId}/stops/${stopId}/navigate`),
    onSuccess: (res) => {
      const { wazeUrl } = res.data.data;
      window.open(wazeUrl, '_blank');
      addToast('WhatsApp נשלח ללקוח');
      queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] });
    },
    onError: () => addToast('שגיאה בניווט', 'error'),
  });

  const arriveMutation = useMutation({
    mutationFn: (stopId: string) => api.patch(`/delivery/runs/${runId}/stops/${stopId}/arrive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] }); addToast('סומן כהגעה'); },
    onError: () => addToast('שגיאה בעדכון', 'error'),
  });

  const completeStopMutation = useMutation({
    mutationFn: ({ stopId, signature, notes }: { stopId: string; signature?: string; notes?: string }) =>
      api.patch(`/delivery/runs/${runId}/stops/${stopId}`, { signature, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] });
      addToast('העצירה הושלמה');
      setShowSignature(null);
    },
    onError: (err: any) => addToast(err.response?.data?.message || 'שגיאה בהשלמת עצירה', 'error'),
  });

  const failStopMutation = useMutation({
    mutationFn: ({ stopId, notes }: { stopId: string; notes: string }) =>
      api.patch(`/delivery/runs/${runId}/stops/${stopId}`, { status: 'FAILED', notes }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] }); addToast('עצירה סומנה כנכשלת'); },
    onError: () => addToast('שגיאה', 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (stops: { stopId: string; sortOrder: number }[]) =>
      api.patch(`/delivery/runs/${runId}/reorder`, { stops }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-run', runId] }); },
    onError: () => addToast('שגיאה בשינוי סדר', 'error'),
  });

  const scanMutation = useMutation({
    mutationFn: (barcode: string) => api.post(`/delivery/runs/${runId}/scan`, { barcode }),
    onSuccess: (res) => {
      const { stop } = res.data.data;
      setHighlightedStopId(stop.id);
      addToast(`נמצאה עצירה: ${stop.order?.customer?.name || stop.orderId}`);
      setTimeout(() => setHighlightedStopId(null), 5000);
      // Scroll to stop
      document.getElementById(`stop-${stop.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    onError: () => addToast('פריט לא נמצא בסיבוב זה', 'error'),
  });

  // ─── Barcode scanner (rapid keystrokes) ──────────────────────

  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSignature) return; // Don't capture during signature
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter' && barcodeBuffer.current.length > 3) {
        scanMutation.mutate(barcodeBuffer.current);
        barcodeBuffer.current = '';
        return;
      }

      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Drag & Drop ─────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    if (run?.isLocked) return;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index || run?.isLocked) return;
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || !run || run.isLocked) return;

    const stops = [...run.stops];
    const [moved] = stops.splice(dragIndex, 1);
    stops.splice(targetIndex, 0, moved);

    reorderMutation.mutate(
      stops.map((s, i) => ({ stopId: s.id, sortOrder: i }))
    );
    setDragIndex(null);
  };

  // ─── Render ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-gray-400 animate-pulse">טוען סיבוב...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 text-center text-gray-400">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>סיבוב לא נמצא</p>
        <button onClick={() => navigate('/delivery')} className="mt-3 text-blue-600 hover:underline text-sm">
          חזור למשלוחים
        </button>
      </div>
    );
  }

  const completedStops = run.stops.filter(s => s.status === 'STOP_COMPLETED').length;
  const totalStops = run.stops.length;
  const allDone = completedStops === totalStops && totalStops > 0;
  const driverName = [run.driver?.firstName, run.driver?.lastName].filter(Boolean).join(' ');

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fadeIn max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Truck className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">סיבוב משלוחים</h1>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{driverName}</span>
                <span>•</span>
                <span>{new Date(run.date).toLocaleDateString('he-IL')}</span>
                {run.isLocked && <Lock className="w-3.5 h-3.5 text-orange-500" />}
              </div>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
            run.status === 'COMPLETED_RUN' ? 'bg-green-100 text-green-700' :
            run.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {run.status === 'COMPLETED_RUN' ? 'הושלם' : run.status === 'IN_PROGRESS' ? 'בדרך' : 'מתוכנן'}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: totalStops > 0 ? `${(completedStops / totalStops) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-sm font-bold text-gray-600">{completedStops}/{totalStops}</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          {run.status === 'PLANNED' && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium">
              <Play className="w-4 h-4" /> התחל סיבוב
            </button>
          )}
          {run.status === 'IN_PROGRESS' && allDone && (
            <button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium">
              <CheckCircle className="w-4 h-4" /> סיים סיבוב
            </button>
          )}
          <button onClick={() => { setShowScan(!showScan); setTimeout(() => scanRef.current?.focus(), 100); }}
            className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2.5 rounded-xl hover:bg-purple-200 font-medium">
            <Scan className="w-4 h-4" /> סרוק
          </button>
        </div>
      </div>

      {/* Scan input */}
      {showScan && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <label className="text-sm font-medium text-purple-700 mb-2 block">סרוק ברקוד או הקלד ידנית</label>
          <div className="flex gap-2">
            <input
              ref={scanRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && scanInput.trim()) { scanMutation.mutate(scanInput.trim()); setScanInput(''); } }}
              placeholder="ברקוד..."
              className="flex-1 border border-purple-300 rounded-lg px-3 py-2 text-base focus:ring-2 focus:ring-purple-500 outline-none"
              autoComplete="off"
            />
            <button onClick={() => { if (scanInput.trim()) { scanMutation.mutate(scanInput.trim()); setScanInput(''); } }}
              disabled={!scanInput.trim()}
              className="bg-purple-600 text-white px-4 rounded-lg hover:bg-purple-700 disabled:opacity-40">
              חפש
            </button>
          </div>
        </div>
      )}

      {/* Stops list */}
      <div className="space-y-2">
        {run.stops.map((stop, index) => (
          <StopCard
            key={stop.id}
            stop={stop}
            index={index}
            isHighlighted={highlightedStopId === stop.id}
            isLocked={run.isLocked}
            runStatus={run.status}
            onNavigate={() => navigateMutation.mutate(stop.id)}
            onArrive={() => arriveMutation.mutate(stop.id)}
            onComplete={() => {
              const requiresSig = stop.order.customer?.metadata?.requireSignature;
              if (requiresSig) {
                setShowSignature(stop.id);
              } else {
                completeStopMutation.mutate({ stopId: stop.id });
              }
            }}
            onCompleteWithSignature={() => setShowSignature(stop.id)}
            onFail={(notes) => failStopMutation.mutate({ stopId: stop.id, notes })}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          />
        ))}

        {run.stops.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">אין עצירות בסיבוב זה</p>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {showSignature && (
        <SignatureModal
          onClose={() => setShowSignature(null)}
          onConfirm={(sig) => completeStopMutation.mutate({ stopId: showSignature, signature: sig })}
          isPending={completeStopMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Stop Card Component ─────────────────────────────────────────

function StopCard({ stop, index, isHighlighted, isLocked, runStatus, onNavigate, onArrive, onComplete, onCompleteWithSignature, onFail, onDragStart, onDragOver, onDrop }: {
  stop: Stop; index: number; isHighlighted: boolean; isLocked: boolean; runStatus: string;
  onNavigate: () => void; onArrive: () => void; onComplete: () => void; onCompleteWithSignature: () => void;
  onFail: (notes: string) => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [failNotes, setFailNotes] = useState('');
  const [showFail, setShowFail] = useState(false);

  const addr = stop.address as any;
  const addressStr = [addr?.street, addr?.city].filter(Boolean).join(', ');
  const phone = stop.order.customer?.phone;
  const isActive = runStatus === 'IN_PROGRESS';
  const isDone = stop.status === 'STOP_COMPLETED' || stop.status === 'FAILED';
  const requiresSig = stop.order.customer?.metadata?.requireSignature;

  return (
    <div
      id={`stop-${stop.id}`}
      draggable={!isLocked && !isDone}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`bg-white rounded-xl border shadow-sm transition-all ${
        isHighlighted ? 'ring-2 ring-purple-500 border-purple-300' : ''
      } ${isDone ? 'opacity-70' : ''}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag handle + number */}
          <div className="flex flex-col items-center gap-1 pt-0.5">
            {!isLocked && !isDone && (
              <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
            )}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${STOP_ICON_COLORS[stop.status] || 'bg-gray-200'}`}>
              {index + 1}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {stop.type === 'PICKUP_STOP' ? (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">איסוף</span>
              ) : (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">משלוח</span>
              )}
              <span className="font-medium text-gray-800 truncate">{stop.order.customer?.name || 'לקוח'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium mr-auto ${STOP_STATUS_COLORS[stop.status]}`}>
                {STOP_STATUS_LABELS[stop.status] || stop.status}
              </span>
            </div>

            <div className="text-sm text-gray-500 flex items-center gap-1.5 mb-1">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {addressStr || 'ללא כתובת'}
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="font-mono">{stop.order.orderNumber}</span>
              {stop.scheduledTime && (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(stop.scheduledTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {stop.completedTime && (
                <span className="text-green-600">הושלם {new Date(stop.completedTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {requiresSig && <span className="flex items-center gap-0.5 text-orange-500"><PenTool className="w-3 h-3" />חתימה</span>}
            </div>
          </div>

          {/* Expand */}
          <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-gray-100 rounded">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>

        {/* Action buttons — always visible for active stops */}
        {isActive && !isDone && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {addressStr && (
              <button onClick={onNavigate}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200">
                <Navigation className="w-3.5 h-3.5" /> נווט + WhatsApp
              </button>
            )}
            {phone && (
              <button onClick={() => window.open(`tel:${phone}`, '_self')}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100">
                <Phone className="w-3.5 h-3.5" /> התקשר
              </button>
            )}
            {stop.status === 'STOP_PENDING' && (
              <button onClick={onArrive}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                <ArrowRight className="w-3.5 h-3.5" /> הגעתי
              </button>
            )}
            {(stop.status === 'ARRIVED' || stop.status === 'STOP_PENDING') && (
              <>
                {requiresSig ? (
                  <button onClick={onCompleteWithSignature}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                    <PenTool className="w-3.5 h-3.5" /> חתום ומסור
                  </button>
                ) : (
                  <button onClick={onComplete}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                    <CheckCircle className="w-3.5 h-3.5" /> הושלם
                  </button>
                )}
                <button onClick={() => setShowFail(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">
                  <XCircle className="w-3.5 h-3.5" /> נכשל
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t px-4 py-3 text-sm space-y-2 bg-gray-50 rounded-b-xl">
          {stop.order.items && stop.order.items.length > 0 && (
            <div>
              <span className="font-medium text-gray-700">פריטים ({stop.order.items.length}):</span>
              <ul className="mt-1 space-y-0.5">
                {stop.order.items.map((item: any) => (
                  <li key={item.id} className="text-gray-500 flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-500">{item.barcode}</span>
                    <span>{item.description}</span>
                    <span className="text-gray-300">x{item.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stop.notes && <div className="text-gray-500"><span className="font-medium">הערות:</span> {stop.notes}</div>}
          {addr?.floor && <div className="text-gray-500">קומה: {addr.floor}</div>}
          {addr?.apartment && <div className="text-gray-500">דירה: {addr.apartment}</div>}
          {addr?.notes && <div className="text-gray-500">הערות כתובת: {addr.notes}</div>}
        </div>
      )}

      {/* Fail modal */}
      {showFail && (
        <div className="border-t px-4 py-3 bg-red-50 rounded-b-xl">
          <textarea
            value={failNotes}
            onChange={e => setFailNotes(e.target.value)}
            placeholder="סיבת כישלון..."
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"
            rows={2}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onFail(failNotes); setShowFail(false); setFailNotes(''); }}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">
              אשר כישלון
            </button>
            <button onClick={() => { setShowFail(false); setFailNotes(''); }}
              className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Signature Pad Modal ─────────────────────────────────────────

function SignatureModal({ onClose, onConfirm, isPending }: {
  onClose: () => void; onConfirm: (signature: string) => void; isPending: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, [getPos]);

  const endDraw = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleConfirm = () => {
    const dataUrl = canvasRef.current?.toDataURL('image/png');
    if (dataUrl) onConfirm(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <PenTool className="w-5 h-5 text-blue-600" /> חתימה דיגיטלית
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <p className="text-sm text-gray-500 mb-3">חתום עם האצבע במסגרת למטה</p>

        <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden mb-3 bg-white">
          <canvas
            ref={canvasRef}
            width={360}
            height={200}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>

        <div className="flex gap-2">
          <button onClick={clearCanvas}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 font-medium">
            נקה
          </button>
          <button onClick={handleConfirm} disabled={isPending}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium">
            {isPending ? 'שומר...' : 'אשר חתימה'}
          </button>
        </div>
      </div>
    </div>
  );
}
