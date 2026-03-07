import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { WashingMachine, Activity, Wrench, XCircle, CheckCircle } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = { WASHER: 'מכונת כביסה', DRYER: 'מייבש', IRONER: 'מגהץ', FOLDER: 'מקפלת' };
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  AVAILABLE: { label: 'פנויה', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  RUNNING: { label: 'פעילה', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Activity },
  MAINTENANCE: { label: 'בתחזוקה', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Wrench },
  OUT_OF_SERVICE: { label: 'מושבתת', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export default function MachinesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['machines-dashboard'],
    queryFn: () => api.get('/machines/dashboard').then(r => r.data.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/machines/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['machines-dashboard'] }),
  });

  if (isLoading) return <div className="p-6 text-center text-gray-400">טוען...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <WashingMachine className="w-7 h-7 text-blue-600" /> מכונות
      </h1>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{data?.total}</div>
          <div className="text-sm text-gray-500">סה"כ</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{data?.available}</div>
          <div className="text-sm text-green-600">פנויות</div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{data?.running}</div>
          <div className="text-sm text-blue-600">פעילות</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{data?.maintenance}</div>
          <div className="text-sm text-yellow-600">בתחזוקה</div>
        </div>
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 text-center">
          <div className="text-2xl font-bold text-indigo-700">{data?.utilization}%</div>
          <div className="text-sm text-indigo-600">ניצולת</div>
        </div>
      </div>

      {/* Machine Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.machines?.map((m: any) => {
          const cfg = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.AVAILABLE;
          const Icon = cfg.icon;
          return (
            <div key={m.id} className={`bg-white rounded-xl shadow-sm border p-5 ${m.status === 'RUNNING' ? 'ring-2 ring-blue-300' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{m.name}</h3>
                  <span className="text-xs text-gray-500">{TYPE_LABELS[m.type]} {m.capacity ? `| ${m.capacity} ק"ג` : ''}</span>
                </div>
                <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                  <Icon className="w-3.5 h-3.5" /> {cfg.label}
                </span>
              </div>
              <div className="mt-3 text-sm text-gray-500">
                סייקלים: {m.totalCycles?.toLocaleString() ?? 0}
              </div>
              <div className="mt-3 flex gap-2">
                {m.status === 'AVAILABLE' && (
                  <button onClick={() => statusMutation.mutate({ id: m.id, status: 'RUNNING' })}
                    className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">הפעל</button>
                )}
                {m.status === 'RUNNING' && (
                  <button onClick={() => statusMutation.mutate({ id: m.id, status: 'AVAILABLE' })}
                    className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">סיים</button>
                )}
                {m.status !== 'MAINTENANCE' && (
                  <button onClick={() => statusMutation.mutate({ id: m.id, status: 'MAINTENANCE' })}
                    className="text-xs px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200">תחזוקה</button>
                )}
                {m.status === 'MAINTENANCE' && (
                  <button onClick={() => statusMutation.mutate({ id: m.id, status: 'AVAILABLE' })}
                    className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">החזר לשימוש</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
