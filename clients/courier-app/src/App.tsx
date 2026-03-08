import { Routes, Route, Navigate } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DeliveriesPage from './pages/DeliveriesPage';
import DeliveryDetailPage from './pages/DeliveryDetailPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('courier_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LayoutWithNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      {children}
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen shadow-lg">
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <LayoutWithNav>
                <DashboardPage />
              </LayoutWithNav>
            </ProtectedRoute>
          }
        />

        <Route
          path="/deliveries"
          element={
            <ProtectedRoute>
              <LayoutWithNav>
                <DeliveriesPage />
              </LayoutWithNav>
            </ProtectedRoute>
          }
        />

        <Route
          path="/deliveries/:id"
          element={
            <ProtectedRoute>
              <LayoutWithNav>
                <DeliveryDetailPage />
              </LayoutWithNav>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <LayoutWithNav>
                <ProfilePage />
              </LayoutWithNav>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
