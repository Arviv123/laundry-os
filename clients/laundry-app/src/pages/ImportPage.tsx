import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import { Upload, FileSpreadsheet, Users, Tags, Package, CheckCircle, AlertCircle, Download } from 'lucide-react';

type ImportType = 'customers' | 'services' | 'pricelist';

const IMPORT_CONFIG: Record<ImportType, {
  label: string;
  icon: typeof Users;
  description: string;
  columns: string[];
  example: string[][];
  endpoint: string;
}> = {
  customers: {
    label: 'לקוחות',
    icon: Users,
    description: 'ייבוא רשימת לקוחות מקובץ CSV',
    columns: ['שם', 'טלפון', 'אימייל', 'סוג (B2C/B2B)', 'כתובת'],
    example: [
      ['name', 'phone', 'email', 'type', 'address'],
      ['ישראל ישראלי', '050-1234567', 'israel@mail.com', 'B2C', 'הרצל 1 תל אביב'],
      ['מכבסת השכונה', '03-9876543', 'info@laundry.co.il', 'B2B', 'רוטשילד 5 רמת גן'],
    ],
    endpoint: '/crm/customers/import',
  },
  services: {
    label: 'שירותים / פריטים',
    icon: Tags,
    description: 'ייבוא שירותים או סוגי פריטים',
    columns: ['שם', 'קטגוריה (WASH/DRY_CLEAN/IRON/FOLD/SPECIAL)', 'מחיר בסיס', 'זמן (דקות)', 'פעיל (true/false)'],
    example: [
      ['name', 'category', 'basePrice', 'estimatedMinutes', 'isActive'],
      ['כביסה חולצה', 'WASH', '15', '30', 'true'],
      ['ניקוי יבש חליפה', 'DRY_CLEAN', '65', '120', 'true'],
      ['גיהוץ מכנסיים', 'IRON', '20', '15', 'true'],
    ],
    endpoint: '/services/import',
  },
  pricelist: {
    label: 'מחירון',
    icon: Package,
    description: 'עדכון מחירון שירותים מקובץ CSV',
    columns: ['שם שירות', 'מחיר חדש'],
    example: [
      ['serviceName', 'basePrice'],
      ['כביסה חולצה', '18'],
      ['ניקוי יבש חליפה', '70'],
    ],
    endpoint: '/services/update-prices',
  },
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

function generateCSVTemplate(type: ImportType): string {
  const config = IMPORT_CONFIG[type];
  return config.example.map(row => row.join(',')).join('\n');
}

export default function ImportPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeType, setActiveType] = useState<ImportType>('customers');
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [importResult, setImportResult] = useState<{ success: number; errors: number; messages: string[] } | null>(null);

  const importMutation = useMutation({
    mutationFn: (data: { type: ImportType; records: Record<string, string>[] }) =>
      api.post(IMPORT_CONFIG[data.type].endpoint, { records: data.records }),
    onSuccess: (res) => {
      const result = res.data.data ?? { success: parsedData.length, errors: 0, messages: [] };
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      addToast(`ייבוא הושלם: ${result.success ?? parsedData.length} רשומות`);
    },
    onError: (err: any) => {
      addToast(err.response?.data?.error ?? 'שגיאה בייבוא', 'error');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const data = parseCSV(text);
      setParsedData(data);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDownloadTemplate = () => {
    const csv = generateCSVTemplate(activeType);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-${activeType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (parsedData.length === 0) return;
    importMutation.mutate({ type: activeType, records: parsedData });
  };

  const config = IMPORT_CONFIG[activeType];
  const Icon = config.icon;

  return (
    <div className="p-6 space-y-6 animate-fadeIn max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
        <Upload className="w-7 h-7 text-blue-600" /> ייבוא נתונים
      </h1>

      {/* Type Tabs */}
      <div className="flex gap-3">
        {(Object.entries(IMPORT_CONFIG) as [ImportType, typeof config][]).map(([key, cfg]) => {
          const TabIcon = cfg.icon;
          return (
            <button key={key} onClick={() => { setActiveType(key); setParsedData([]); setFileName(''); setImportResult(null); }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeType === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}>
              <TabIcon className="w-4 h-4" /> {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-start gap-3 mb-4">
          <Icon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-800">{config.description}</h2>
            <p className="text-sm text-gray-500 mt-1">העלה קובץ CSV עם העמודות הבאות:</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {config.columns.map(col => (
            <span key={col} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">{col}</span>
          ))}
        </div>

        <button onClick={handleDownloadTemplate}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
          <Download className="w-4 h-4" /> הורד קובץ תבנית לדוגמה
        </button>
      </div>

      {/* File Upload */}
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} className="hidden" />

        {!fileName ? (
          <div onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">לחץ כאן להעלאת קובץ CSV</p>
            <p className="text-xs text-gray-400 mt-1">או גרור קובץ לכאן</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                <span className="font-medium text-gray-800">{fileName}</span>
                <span className="text-sm text-gray-400">({parsedData.length} רשומות)</span>
              </div>
              <button onClick={() => { setParsedData([]); setFileName(''); setImportResult(null); }}
                className="text-sm text-red-400 hover:text-red-600">בחר קובץ אחר</button>
            </div>

            {/* Preview Table */}
            {parsedData.length > 0 && (
              <div className="overflow-x-auto border rounded-lg mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-2 px-3 text-right text-gray-500">#</th>
                      {Object.keys(parsedData[0]).map(key => (
                        <th key={key} className="py-2 px-3 text-right text-gray-500">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="py-2 px-3">{val}</td>
                        ))}
                      </tr>
                    ))}
                    {parsedData.length > 10 && (
                      <tr><td colSpan={Object.keys(parsedData[0]).length + 1} className="py-2 px-3 text-center text-gray-400 text-xs">
                        ...ועוד {parsedData.length - 10} רשומות
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Import Button */}
            <button onClick={handleImport}
              disabled={parsedData.length === 0 || importMutation.isPending}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40 transition-all">
              {importMutation.isPending ? 'מייבא...' : `ייבא ${parsedData.length} רשומות`}
            </button>
          </div>
        )}
      </div>

      {/* Result */}
      {importResult && (
        <div className={`rounded-xl border p-5 animate-fadeIn ${importResult.errors > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {importResult.errors > 0 ? (
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            <span className="font-semibold text-gray-800">
              ייבוא הושלם: {importResult.success} הצלחות
              {importResult.errors > 0 && `, ${importResult.errors} שגיאות`}
            </span>
          </div>
          {importResult.messages?.length > 0 && (
            <ul className="text-sm text-gray-600 space-y-1 mt-2">
              {importResult.messages.map((msg, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-gray-400">•</span> {msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
