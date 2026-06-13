import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import PosLayout from './components/layout/PosLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';

import AdminLogin from './pages/admin/Login';
import Dashboard from './pages/admin/Dashboard';
import Categories from './pages/admin/Categories';
import Products from './pages/admin/Products';
import Users from './pages/admin/Users';
import Printers from './pages/admin/Printers';
import AdminTables from './pages/admin/Tables';
import AdminReservations from './pages/admin/Reservations';
import AdminSettings from './pages/admin/Settings';
import AdminOrders from './pages/admin/Orders';
import AdminArchive from './pages/admin/Archive';
import AdminNotifications from './pages/admin/Notifications';
import AdminReports from './pages/admin/Reports';
import AdminCampaigns from './pages/admin/Campaigns';
import AdminCoupons from './pages/admin/Coupons';
import AdminQrCodes from './pages/admin/QrCodes';
import AdminPackages from './pages/admin/Packages';
import AdminStock from './pages/admin/Stock';
import AdminSuppliers from './pages/admin/Suppliers';
import AdminFinance from './pages/admin/Finance';
import AdminEndOfDay from './pages/admin/EndOfDay';
import AdminStaffReport from './pages/admin/StaffReport';
import AdminShifts from './pages/admin/Shifts';
import AdminCustomers from './pages/admin/Customers';
import AdminCari from './pages/admin/CariHesaplar';
import AdminAccounting from './pages/admin/Accounting';
import AdminEInvoice from './pages/admin/EInvoice';
import AdminInventory from './pages/admin/Inventory';
import AdminIngredients from './pages/admin/Ingredients';
import AdminRecipes from './pages/admin/Recipes';
import AdminPlaceholder from './pages/admin/Placeholder';

import PosLogin from './pages/pos/Login';
import PosTables from './pages/pos/Tables';
import NewOrder from './pages/pos/NewOrder';
import ActiveOrders from './pages/pos/ActiveOrders';
import Payment from './pages/pos/Payment';
import PosPackages from './pages/pos/Packages';
import PosPlaceholder from './pages/pos/Placeholder';

import CallerIdPopup from './components/CallerIdPopup';

import Menu from './pages/menu/Menu';
import CustomerDisplay from './pages/CustomerDisplay';

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const initSettings = useSettingsStore((s) => s.init);

  useEffect(() => {
    const unsubAuth = initAuth();
    const unsubSettings = initSettings();
    return () => {
      unsubAuth?.();
      unsubSettings?.();
    };
  }, [initAuth, initSettings]);

  // alakonyamutfagi.web.app → kök adres direkt genel (masasız) menüyü açar.
  // Diğer alan adlarında kök → admin girişi. Masa QR'ları (/menu/:masaId) DEĞİŞMEZ.
  const isMenuHost =
    typeof window !== 'undefined' && /alakonyamutfagi/i.test(window.location.hostname);

  return (
    <>
    <CallerIdPopup />
    <Routes>
      <Route path="/" element={isMenuHost ? <Menu /> : <Navigate to="/admin/login" replace />} />

      <Route path="/admin/login" element={<AdminLogin />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin', 'kasiyer']} fallback="/admin/login">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="categories" element={<Categories />} />
        <Route path="products" element={<Products />} />
        <Route path="printers" element={<Printers />} />
        <Route path="users" element={<Users />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="archive" element={<AdminArchive />} />
        <Route path="tables" element={<AdminTables />} />
        <Route path="reservations" element={<AdminReservations />} />
        <Route path="qr-codes" element={<AdminQrCodes />} />
        <Route path="stock" element={<AdminStock />} />
        <Route path="suppliers" element={<AdminSuppliers />} />
        <Route path="finance" element={<AdminFinance />} />
        <Route path="end-of-day" element={<AdminEndOfDay />} />
        <Route path="staff-report" element={<AdminStaffReport />} />
        <Route path="shifts" element={<AdminShifts />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="cari" element={<AdminCari />} />
        <Route path="accounting" element={<AdminAccounting />} />
        <Route path="e-invoice" element={<AdminEInvoice />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="ingredients" element={<AdminIngredients />} />
        <Route path="recipes" element={<AdminRecipes />} />
        <Route path="campaigns" element={<AdminCampaigns />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="packages" element={<AdminPackages />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="/pos/login" element={<PosLogin />} />

      <Route
        path="/pos"
        element={
          <ProtectedRoute roles={['garson', 'kasiyer', 'admin', 'kurye']} fallback="/pos/login">
            <PosLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="tables" replace />} />
        <Route path="tables" element={<PosTables />} />
        <Route path="order/new" element={<NewOrder />} />
        <Route path="orders/active" element={<ActiveOrders />} />
        <Route path="payment" element={<Payment />} />
        <Route path="packages" element={<PosPackages />} />
      </Route>

      <Route path="/menu/:masaId" element={<Menu />} />
      {/* Instagram/genel menü — masasız (garson çağır YOK). alakonyamutfagi.web.app kökü buraya eşdeğer. */}
      <Route path="/alakonyamutfagi" element={<Menu />} />
      <Route path="/menu" element={<Menu />} />

      {/* Müşteri ekranı — 2. ekranda Presentation tarafından açılır.
          Login gerektirmez; doğrudan BroadcastChannel ile state dinler. */}
      <Route path="/customer-display" element={<CustomerDisplay />} />

      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
    </>
  );
}
