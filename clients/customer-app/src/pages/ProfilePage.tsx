import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Mail, LogOut } from 'lucide-react';
import api from '../lib/api';

interface Profile {
  name: string;
  phone: string;
  email?: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/customer-auth/me');
        setProfile(res.data);
      } catch {
        // handle error silently
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-500 text-white px-6 pt-12 pb-10 rounded-b-3xl text-center">
        <div className="bg-white/20 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
          <User size={36} className="text-white" />
        </div>
        <h1 className="text-xl font-bold">{profile?.name || 'לקוח'}</h1>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Profile Info Card */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="font-bold text-gray-800">פרטים אישיים</h2>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 rounded-lg p-2.5">
              <User size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">שם</p>
              <p className="text-sm font-medium text-gray-800">{profile?.name || '-'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 rounded-lg p-2.5">
              <Phone size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">טלפון</p>
              <p className="text-sm font-medium text-gray-800 dir-ltr" dir="ltr">
                {profile?.phone || '-'}
              </p>
            </div>
          </div>

          {profile?.email && (
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 rounded-lg p-2.5">
                <Mail size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">אימייל</p>
                <p className="text-sm font-medium text-gray-800" dir="ltr">
                  {profile.email}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-white text-red-600 py-4 rounded-xl border border-red-200 font-semibold hover:bg-red-50 active:bg-red-100 transition-colors min-h-[48px]"
        >
          <LogOut size={18} />
          התנתק
        </button>
      </div>
    </div>
  );
}
