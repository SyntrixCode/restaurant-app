import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Archive,
  Tags,
  Package,
  Grid3x3,
  Boxes,
  Megaphone,
  Truck,
  Bell,
  BarChart3,
  Wallet,
  Users,
  Settings,
  Printer,
  LogOut,
  CalendarClock,
  QrCode,
  Truck as TruckIcon,
  ClipboardList,
  Wheat,
  ChefHat,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/orders', label: 'Sipariş Yönetimi', icon: ShoppingCart },
  { to: '/admin/archive', label: 'Arşiv', icon: Archive },
  { to: '/admin/categories', label: 'Kategoriler', icon: Tags },
  { to: '/admin/products', label: 'Ürünler', icon: Package },
  { to: '/admin/tables', label: 'Masalar', icon: Grid3x3 },
  { to: '/admin/reservations', label: 'Rezervasyonlar', icon: CalendarClock },
  { to: '/admin/qr-codes', label: 'QR Kodları', icon: QrCode },
  { to: '/admin/stock', label: 'Stok', icon: Boxes },
  { to: '/admin/inventory', label: 'Sayım', icon: ClipboardList },
  { to: '/admin/ingredients', label: 'Malzemeler', icon: Wheat },
  { to: '/admin/recipes', label: 'Reçeteler', icon: ChefHat },
  { to: '/admin/suppliers', label: 'Tedarikçiler', icon: TruckIcon },
  { to: '/admin/campaigns', label: 'Kampanyalar', icon: Megaphone },
  { to: '/admin/coupons', label: 'Kupon Kodları', icon: Megaphone },
  { to: '/admin/packages', label: 'Paket Servis', icon: Truck },
  { to: '/admin/notifications', label: 'Bildirimler', icon: Bell },
  { to: '/admin/reports', label: 'Raporlar', icon: BarChart3 },
  { to: '/admin/finance', label: 'Finans', icon: Wallet },
  { to: '/admin/printers', label: 'Yazıcılar', icon: Printer },
  { to: '/admin/users', label: 'Kullanıcılar', icon: Users },
  { to: '/admin/settings', label: 'Ayarlar', icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, rol, logout } = useAuthStore();
  const { settings } = useSettingsStore();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-full bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Yönetim Paneli</p>
          <h1 className="truncate text-lg font-bold text-slate-900">
            {settings.restoranAd || 'Restoran POS'}
          </h1>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 px-1 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">{user?.email}</p>
            <p>Rol: {rol}</p>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start">
            <LogOut size={16} />
            <span>Çıkış</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
