import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Truck,
  MapPin,
  LogOut,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import api from '../lib/api';

interface UserProfile {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  role?: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [completedToday, setCompletedToday] = useState(0);

  useEffect(() => {
    loadProfile();
    loadStats();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // Try to get profile from API
      const res = await api.get('/users/me');
      setProfile(res.data);
    } catch {
      // Fallback to stored user data
      try {
        const stored = JSON.parse(
          localStorage.getItem('courier_user') || '{}',
        );
        setProfile(stored);
      } catch {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await api.get('/orders', {
        params: { status: 'DELIVERED' },
      });
      const data = res.data;
      const orders = Array.isArray(data) ? data : data.orders || [];
      const today = new Date().toDateString();
      const todayCount = orders.filter(
        (o: any) =>
          o.createdAt && new Date(o.createdAt).toDateString() === today,
      ).length;
      setCompletedToday(todayCount);
    } catch {
      // silent
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('courier_token');
    localStorage.removeItem('courier_user');
    navigate('/login');
  };

  const displayName = (() => {
    if (!profile) return 'שליח';
    if (profile.firstName || profile.lastName) {
      return `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    }
    return profile.name || 'שליח';
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={40} className="animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Profile header */}
      <div className="bg-gradient-to-l from-green-600 to-green-700 text-white rounded-2xl p-6 text-center">
        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <User size={40} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold">{displayName}</h1>
        {profile?.email && (
          <p className="text-green-200 mt-1 flex items-center justify-center gap-1.5">
            <Mail size={14} />
            <span dir="ltr">{profile.email}</span>
          </p>
        )}
        {profile?.role && (
          <span className="inline-block mt-2 text-xs bg-white/20 px-3 py-1 rounded-full">
            {profile.role}
          </span>
        )}
      </div>

      {/* Today's Stats */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="font-bold text-gray-700 mb-4">סטטיסטיקות היום</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">
              {completedToday}
            </p>
            <p className="text-xs text-gray-500 mt-1">משלוחים שהושלמו</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <MapPin size={20} className="text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-blue-600">--</p>
            <p className="text-xs text-gray-500 mt-1">ק"מ (בקרוב)</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="font-bold text-gray-700 mb-3">פרטים</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 py-2 border-b border-gray-100">
            <Truck size={18} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">תפקיד</p>
              <p className="font-medium text-gray-700">שליח</p>
            </div>
          </div>
          {profile?.email && (
            <div className="flex items-center gap-3 py-2 border-b border-gray-100">
              <Mail size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">אימייל</p>
                <p className="font-medium text-gray-700" dir="ltr">
                  {profile.email}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors border border-red-200"
      >
        <LogOut size={20} />
        התנתק
      </button>
    </div>
  );
}
