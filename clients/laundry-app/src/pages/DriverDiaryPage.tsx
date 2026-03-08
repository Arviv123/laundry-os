import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronRight, ChevronLeft, Package, Truck, User, Clock, MapPin, CheckCircle } from 'lucide-react';
import api from '../lib/api';

/* ───────── helpers ───────── */

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'];

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday = 0
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDateShort(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 5); // Sunday to Friday
  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  return [addr.street, addr.city].filter(Boolean).join(', ');
}

/* ───────── types ───────── */

interface Driver {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
}

interface Assignment {
  id: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  notes?: string;
  order: {
    id: string;
    orderNumber?: string;
    deliveryAddress?: any;
    customer: {
      id: string;
      name: string;
      phone?: string;
    };
  };
}

/* ───────── Component ───────── */

export default function DriverDiaryPage() {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [weekStart, setWeekStart] = useState(getStartOfWeek(new Date()));

  // Fetch drivers
  const { data: driversRaw } = useQuery({
    queryKey: ['diary-drivers'],
    queryFn: async () => {
      const res = await api.get('/delivery-mgmt/drivers');
      return (res.data.data ?? res.data) as Driver[];
    },
  });
  const drivers = Array.isArray(driversRaw) ? driversRaw : [];

  // Fetch diary data
  const weekEnd = addDays(weekStart, 6);
  const { data: diaryRaw, isLoading } = useQuery({
    queryKey: ['driver-diary', selectedDriverId, weekStart.toISOString()],
    queryFn: async () => {
      const res = await api.get('/delivery-mgmt/driver-diary', {
        params: {
          driverId: selectedDriverId,
          startDate: weekStart.toISOString(),
          endDate: weekEnd.toISOString(),
        },
      });
      return res.data.data ?? res.data;
    },
    enabled: !!selectedDriverId,
  });

  const assignments: Assignment[] = Array.isArray(diaryRaw?.assignments) ? diaryRaw.assignments : [];

  // Group by day (0=Sun, 1=Mon, ..., 5=Fri)
  const dayColumns = useMemo(() => {
    const cols: Assignment[][] = [[], [], [], [], [], []]; // Sun-Fri
    for (const a of assignments) {
      if (!a.scheduledAt) continue;
      const d = new Date(a.scheduledAt);
      const dayIdx = d.getDay(); // 0=Sun
      if (dayIdx >= 0 && dayIdx <= 5) {
        cols[dayIdx].push(a);
      }
    }
    // Sort each day by time
    for (const col of cols) {
      col.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
    }
    return cols;
  }, [assignments]);

  // Unassigned count (no scheduledAt)
  const unscheduled = assignments.filter(a => !a.scheduledAt);

  const driverName = (d: Driver) => [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email;

  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-700 border-green-200';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'FAILED': return 'bg-red-100 text-red-700 border-red-200';
      case 'ACCEPTED': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PENDING: 'ממתין', ACCEPTED: 'אושר', IN_PROGRESS: 'בדרך',
      COMPLETED: 'הושלם', FAILED: 'נכשל',
    };
    return map[s] || s;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">יומן נהגים</h1>
            <p className="text-sm text-gray-500">תצוגת משלוחים שבועית לכל נהג</p>
          </div>
        </div>

        {/* Driver selector */}
        <select
          value={selectedDriverId}
          onChange={e => setSelectedDriverId(e.target.value)}
          className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-w-[200px] bg-white"
        >
          <option value="">בחר נהג...</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>{driverName(d)}</option>
          ))}
        </select>
      </div>

      {/* ── Week Navigation ── */}
      <div className="flex items-center justify-center gap-4 bg-white rounded-xl shadow-sm border border-gray-200 p-3">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
        <span className="text-base font-semibold text-gray-800 min-w-[250px] text-center">
          {formatWeekRange(weekStart)}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <button
          onClick={() => setWeekStart(getStartOfWeek(new Date()))}
          className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          היום
        </button>
      </div>

      {/* ── No driver selected ── */}
      {!selectedDriverId && (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-200">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-400">בחר נהג כדי לראות את היומן</h3>
        </div>
      )}

      {/* ── Loading ── */}
      {selectedDriverId && isLoading && (
        <div className="text-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      )}

      {/* ── Weekly Grid ── */}
      {selectedDriverId && !isLoading && (
        <>
          <div className="grid grid-cols-6 gap-3">
            {DAYS_SHORT.map((day, idx) => {
              const dayDate = addDays(weekStart, idx);
              const isToday = new Date().toDateString() === dayDate.toDateString();
              const dayAssignments = dayColumns[idx];

              return (
                <div key={idx} className="flex flex-col">
                  {/* Day Header */}
                  <div className={`text-center py-2 rounded-t-xl border border-b-0 ${
                    isToday
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}>
                    <div className="text-sm font-bold">{day}</div>
                    <div className="text-xs opacity-75">{formatDateShort(dayDate)}</div>
                  </div>

                  {/* Day Column */}
                  <div className={`border border-t-0 rounded-b-xl min-h-[300px] p-2 space-y-2 ${
                    isToday ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-white'
                  }`}>
                    {dayAssignments.length === 0 && (
                      <div className="text-center text-xs text-gray-300 py-8">—</div>
                    )}
                    {dayAssignments.map(a => (
                      <AssignmentCard key={a.id} assignment={a} statusColor={statusColor} statusLabel={statusLabel} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unscheduled assignments */}
          {unscheduled.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-3">
                {unscheduled.length} הקצאות ללא תאריך מתוכנן
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {unscheduled.map(a => (
                  <div key={a.id} className="bg-white rounded-lg border border-amber-200 p-3 text-sm">
                    <div className="flex items-center gap-1.5 text-amber-700 font-medium">
                      {a.type === 'PICKUP' ? <Package className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                      {a.type === 'PICKUP' ? 'איסוף' : 'משלוח'}
                    </div>
                    <div className="text-gray-700 mt-1">{a.order.customer.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {assignments.length > 0 && (
            <div className="flex items-center gap-6 text-sm text-gray-500 justify-center">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-orange-400" />
                איסוף: {assignments.filter(a => a.type === 'PICKUP').length}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-400" />
                משלוח: {assignments.filter(a => a.type === 'DELIVERY').length}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-400" />
                הושלמו: {assignments.filter(a => a.status === 'COMPLETED').length}
              </span>
            </div>
          )}

          {/* Empty state */}
          {assignments.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              אין משלוחים מתוכננים לשבוע זה
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────── Assignment Card ───────── */

function AssignmentCard({
  assignment: a,
  statusColor,
  statusLabel,
}: {
  assignment: Assignment;
  statusColor: (s: string) => string;
  statusLabel: (s: string) => string;
}) {
  const isPickup = a.type === 'PICKUP';
  const borderColor = isPickup ? 'border-r-orange-400' : 'border-r-blue-400';

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${borderColor} border-r-[3px] p-2.5 text-xs space-y-1.5 shadow-sm hover:shadow-md transition-shadow`}>
      {/* Time + Type */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {isPickup
            ? <Package className="w-3.5 h-3.5 text-orange-500" />
            : <Truck className="w-3.5 h-3.5 text-blue-500" />
          }
          <span className={`font-semibold ${isPickup ? 'text-orange-700' : 'text-blue-700'}`}>
            {isPickup ? 'איסוף' : 'משלוח'}
          </span>
        </div>
        {a.scheduledAt && (
          <span className="flex items-center gap-0.5 text-gray-400">
            <Clock className="w-3 h-3" />
            {formatTime(a.scheduledAt)}
          </span>
        )}
      </div>

      {/* Customer */}
      <div className="font-medium text-gray-800 truncate">
        {a.order.customer.name}
      </div>

      {/* Address */}
      {a.order.deliveryAddress && (
        <div className="flex items-start gap-1 text-gray-400">
          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="truncate">{formatAddress(a.order.deliveryAddress)}</span>
        </div>
      )}

      {/* Order number */}
      <div className="text-gray-300 text-[10px]">
        #{a.order.orderNumber || a.order.id.slice(-6)}
      </div>

      {/* Status */}
      <div className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColor(a.status)}`}>
        {a.status === 'COMPLETED' && <CheckCircle className="w-2.5 h-2.5 inline ml-0.5" />}
        {statusLabel(a.status)}
      </div>
    </div>
  );
}
