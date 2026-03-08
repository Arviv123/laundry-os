import { useState, useEffect } from 'react';
import { QrCode, Truck, User, Copy, Check, ExternalLink, Shirt } from 'lucide-react';

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=';

export default function QRLinksPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    // Detect current URL base
    const { protocol, hostname, port } = window.location;
    setBaseUrl(`${protocol}//${hostname}${port ? `:${port}` : ''}`);
  }, []);

  const links = [
    {
      id: 'driver',
      label: 'ממשק נהג',
      description: 'הנהג רואה איסופים, משלוחים וסבבים',
      path: '/delivery',
      icon: Truck,
      color: 'blue',
    },
    {
      id: 'customer',
      label: 'מעקב הזמנה (לקוח)',
      description: 'הלקוח מזין מספר הזמנה ורואה סטטוס',
      path: '/track',
      icon: User,
      color: 'green',
    },
    {
      id: 'phone-delivery',
      label: 'הזמנת משלוח טלפוני',
      description: 'טופס הזמנת איסוף ומשלוח',
      path: '/phone-delivery',
      icon: Shirt,
      color: 'purple',
    },
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const bg: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
  };
  const iconBg: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <QrCode className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">קישורים וקודי QR</h1>
          <p className="text-sm text-gray-500">שתף קישורים לממשקי נהגים ולקוחות</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {links.map(link => {
          const fullUrl = `${baseUrl}${link.path}`;
          const Icon = link.icon;
          return (
            <div key={link.id} className={`rounded-2xl border p-6 ${bg[link.color]} text-center`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${iconBg[link.color]}`}>
                <Icon className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-1">{link.label}</h2>
              <p className="text-sm text-gray-500 mb-4">{link.description}</p>

              {/* QR Code */}
              <div className="bg-white rounded-xl p-3 inline-block mx-auto mb-4 shadow-sm">
                {baseUrl ? (
                  <img
                    src={`${QR_API}${encodeURIComponent(fullUrl)}`}
                    alt={`QR: ${link.label}`}
                    className="w-48 h-48 mx-auto"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-100 rounded animate-pulse" />
                )}
              </div>

              {/* URL */}
              <div className="bg-white rounded-lg px-3 py-2 flex items-center gap-2 text-sm border">
                <code className="flex-1 text-gray-600 text-xs truncate text-left" dir="ltr">{fullUrl}</code>
                <button onClick={() => handleCopy(fullUrl, link.id)}
                  className="p-1.5 rounded hover:bg-gray-100 flex-shrink-0">
                  {copied === link.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              </div>

              {/* Open */}
              <a href={link.path} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-600 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> פתח בחלון חדש
              </a>
            </div>
          );
        })}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>טיפ:</strong> כדי שהקישורים יעבדו מכל מקום, פרוס את האפליקציה ב-Render או שנה את ה-URL לכתובת הציבורית שלך. ה-QR קודים יעבדו גם מטלפון נייד ברשת המקומית.
      </div>
    </div>
  );
}
