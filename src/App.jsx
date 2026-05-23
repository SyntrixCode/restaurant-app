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
import AdminPlaceholder from './pages/admin/Placeholder';

import PosLogin from './pages/pos/Login';
import PosTables from './pages/pos/Tables';
import NewOrder from './pages/pos/NewOrder';
import ActiveOrders from './pages/pos/ActiveOrders';
import Payment from './pages/pos/Payment';
import PosPlaceholder from './pages/pos/Placeholder';

import Menu from './pages/menu/Menu';

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

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

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
        <Route path="stock" element={<AdminPlaceholder title="Stok Yönetimi" phase="Faz 10 detay, Faz 1 basit" />} />
        <Route path="campaigns" element={<AdminPlaceholder title="Kampanyalar" phase="Faz 7" />} />
        <Route path="coupons" element={<AdminPlaceholder title="Kupon Kodları" phase="Faz 7" />} />
        <Route path="packages" element={<AdminPlaceholder title="Paket Servis" phase="Faz 8" />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="finance" element={<AdminPlaceholder title="Finans & Kasa" phase="Faz 11" />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="/pos/login" element={<PosLogin />} />

      <Route
        path="/pos"
        element={
          <ProtectedRoute roles={['garson', 'kasiyer', 'admin']} fallback="/pos/login">
            <PosLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="tables" replace />} />
        <Route path="tables" element={<PosTables />} />
        <Route path="order/new" element={<NewOrder />} />
        <Route path="orders/active" element={<ActiveOrders />} />
        <Route path="payment" element={<Payment />} />
        <Route path="packages" element={<PosPlaceholder title="Paket Servis (POS)" phase="Faz 8" />} />
      </Route>

      <Route path="/menu/:masaId" element={<Menu />} />

      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}
