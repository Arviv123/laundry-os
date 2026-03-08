import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shirt, ArrowLeft } from 'lucide-react';
import api from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tenantSlug = 'laundry-demo-tenant';

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 10) {
      setPhone(formatPhone(raw));
    }
  };

  const handleSendOtp = async () => {
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('נא להזין מספר טלפון תקין');
      return;
    }
    setLoading(true);
    try {
      await api.post('/customer-auth/send-otp', { phone: digits, tenantSlug });
      setStep('otp');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'שגיאה בשליחת קוד, נסו שוב');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    if (code.length < 4) {
      setError('נא להזין קוד אימות');
      return;
    }
    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const res = await api.post('/customer-auth/verify-otp', {
        phone: digits,
        tenantSlug,
        code,
      });
      const data = res.data.data || res.data;
      localStorage.setItem('customer_token', data.token);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'קוד שגוי, נסו שוב');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Blue gradient header */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-500 text-white pt-16 pb-12 px-6 text-center rounded-b-3xl">
        <div className="flex justify-center mb-4">
          <div className="bg-white/20 rounded-full p-4">
            <Shirt size={40} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-1">מכבסה</h1>
        <p className="text-blue-100 text-sm">פורטל לקוח</p>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pt-8 max-w-md mx-auto w-full">
        {step === 'phone' ? (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-2">התחברות</h2>
            <p className="text-gray-500 text-sm mb-6">
              הזינו את מספר הטלפון שלכם ונשלח קוד אימות
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              מספר טלפון
            </label>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="050-123-4567"
              value={phone}
              onChange={handlePhoneChange}
              className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl text-center tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              dir="ltr"
            />

            {error && (
              <p className="text-red-500 text-sm mt-3 text-center">{error}</p>
            )}

            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {loading ? 'שולח...' : 'שלח קוד'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { setStep('phone'); setCode(''); setError(''); }}
              className="flex items-center gap-1 text-blue-600 text-sm mb-4 hover:text-blue-700"
            >
              <ArrowLeft size={16} />
              חזרה
            </button>

            <h2 className="text-xl font-bold text-gray-800 mb-2">אימות קוד</h2>
            <p className="text-gray-500 text-sm mb-6">
              הזינו את קוד האימות שקיבלתם
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              קוד אימות
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="5252"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-4 text-2xl border border-gray-300 rounded-xl text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              dir="ltr"
            />

            {error && (
              <p className="text-red-500 text-sm mt-3 text-center">{error}</p>
            )}

            <button
              onClick={handleVerifyOtp}
              disabled={loading}
              className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {loading ? 'מאמת...' : 'אימות'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
