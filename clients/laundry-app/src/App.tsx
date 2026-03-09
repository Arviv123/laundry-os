import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import GiftCardsPage from './pages/GiftCardsPage';
import WorkboardPage from './pages/WorkboardPage';
import CashDrawerPage from './pages/CashDrawerPage';
import PaymentTerminalsPage from './pages/PaymentTerminalsPage';
import ExpensesPage from './pages/ExpensesPage';
import AutomationsPage from './pages/AutomationsPage';
import PriceListsPage from './pages/PriceListsPage';
import TasksPage from './pages/TasksPage';
import DeliveryMgmtPage from './pages/DeliveryMgmtPage';
import PhoneDeliveryPage from './pages/PhoneDeliveryPage';
import DriverDiaryPage from './pages/DriverDiaryPage';
import QRLinksPage from './pages/QRLinksPage';
import DriverRunPage from './pages/DriverRunPage';
import RecurringOrdersPage from './pages/RecurringOrdersPage';
import BankReconciliationPage from './pages/BankReconciliationPage';
import CashFlowForecastPage from './pages/CashFlowForecastPage';
import RFIDPage from './pages/RFIDPage';
import SupportPage from './pages/SupportPage';
import DriverAppPage from './pages/DriverAppPage';
import CustomerAppPage from './pages/CustomerAppPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="h-screen flex items-center justify-center text-gray-400">טוען...</div>;
  if (!token) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/track" element={<TrackOrderPage />} />
      <Route path="/driver" element={<ProtectedRoute><DriverAppPage /></ProtectedRoute>} />
      <Route path="/customer-app" element={<CustomerAppPage />} />
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
        <Route path="gift-cards" element={<GiftCardsPage />} />
        <Route path="workboard" element={<WorkboardPage />} />
        <Route path="cash-drawer" element={<CashDrawerPage />} />
        <Route path="payment-terminals" element={<PaymentTerminalsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="price-lists" element={<PriceListsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="delivery-mgmt" element={<DeliveryMgmtPage />} />
        <Route path="phone-delivery" element={<PhoneDeliveryPage />} />
        <Route path="driver-diary" element={<DriverDiaryPage />} />
        <Route path="qr-links" element={<QRLinksPage />} />
        <Route path="delivery/run/:runId" element={<DriverRunPage />} />
        <Route path="recurring-orders" element={<RecurringOrdersPage />} />
        <Route path="bank-recon" element={<BankReconciliationPage />} />
        <Route path="cash-flow-forecast" element={<CashFlowForecastPage />} />
        <Route path="rfid" element={<RFIDPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
