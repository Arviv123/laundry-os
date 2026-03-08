import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, CheckCircle } from 'lucide-react';
import api from '../lib/api';

export default function PickupRequestPage() {
  const navigate = useNavigate();
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ orderNumber: string } | null>(null);

  const handleSubmit = async () => {
    setError('');

    if (!street.trim() || !city.trim()) {
      setError('נא למלא כתובת מלאה');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/customer-portal/orders', {
        address: { street: street.trim(), city: city.trim() },
        notes: notes.trim() || undefined,
        preferredDate: preferredDate || undefined,
      });
      setSuccess({ orderNumber: res.data.orderNumber || res.data.order?.orderNumber || '' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'שגיאה ביצירת הזמנה, נסו שוב');
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 pt-20 text-center">
        <div className="bg-green-50 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-6">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">ההזמנה נוצרה בהצלחה!</h1>
        {success.orderNumber && (
          <p className="text-gray-500 mb-2">מספר הזמנה: <span className="font-bold text-gray-800">#{success.orderNumber}</span></p>
        )}
        <p className="text-gray-400 text-sm mb-8">נעדכן אותך כשהשליח בדרך</p>
        <button
          onClick={() => navigate('/orders')}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors min-h-[48px]"
        >
          צפה בהזמנות
        </button>
      </div>
    );
  }

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-1">
          <div className="bg-blue-50 rounded-full p-2">
            <Truck size={22} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">בקשת איסוף</h1>
        </div>
        <p className="text-gray-500 text-sm">מלאו את הפרטים ונשלח שליח</p>
      </div>

      <div className="px-4 pt-6 space-y-5">
        {/* Address */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="font-bold text-gray-800">כתובת לאיסוף</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">רחוב ומספר</label>
            <input
              type="text"
              placeholder="לדוגמה: הרצל 15, דירה 3"
              value={street}
              onChange={e => setStreet(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">עיר</label>
            <input
              type="text"
              placeholder="לדוגמה: תל אביב"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        {/* Preferred date */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">תאריך מועדף לאיסוף</label>
          <input
            type="date"
            min={today}
            value={preferredDate}
            onChange={e => setPreferredDate(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">הערות</label>
          <textarea
            placeholder="הוראות מיוחדות, קוד כניסה לבניין..."
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] shadow-sm"
        >
          {loading ? 'שולח בקשה...' : 'שלח בקשת איסוף'}
        </button>
      </div>
    </div>
  );
}
