import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import NewOrderPage from './pages/NewOrderPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ServicesPage from './pages/ServicesPage';
import MachinesPage from './pages/MachinesPage';
import DeliveryPage from './pages/DeliveryPage';
import CustomersPage from './pages/CustomersPage';
import PrepaidPage from './pages/PrepaidPage';
import AccountingPage from './pages/AccountingPage';
import InvoicesPage from './pages/InvoicesPage';
import InventoryPage from './pages/InventoryPage';
import BranchesPage from './pages/BranchesPage';
import SettingsPage from './pages/SettingsPage';
import ImportPage from './pages/ImportPage';
import ReportsPage from './pages/ReportsPage';
import TrackOrderPage from './pages/TrackOrderPage';
import ScanPage from './pages/ScanPage';
import LoyaltyPage from './pages/LoyaltyPage';
import PromotionsPage from './pages/PromotionsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div className="h-screen flex items-center justify-center text-gray-400">טוען...</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/track" element={<TrackOrderPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/new" element={<NewOrderPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="delivery" element={<DeliveryPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomersPage />} />
        <Route path="prepaid" element={<PrepaidPage />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="promotions" element={<PromotionsPage />} />
      </Route>
    </Routes>
  );
}
