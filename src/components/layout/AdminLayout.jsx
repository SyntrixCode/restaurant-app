import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
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
  Calculator,
  Phone,
  CreditCard,
  FileSpreadsheet,
  FileCheck2,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import PoweredBy from '../PoweredBy';
import OfflineBanner from '../OfflineBanner';

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
  { to: '/admin/customers', label: 'Telefon Defteri', icon: Phone },
  { to: '/admin/cari', label: 'Cari Hesaplar', icon: CreditCard },
  { to: '/admin/notifications', label: 'Bildirimler', icon: Bell },
  { to: '/admin/reports', label: 'Raporlar', icon: BarChart3 },
  { to: '/admin/finance', label: 'Finans', icon: Wallet },
  { to: '/admin/accounting', label: 'Muhasebe', icon: FileSpreadsheet },
  { to: '/admin/e-invoice', label: 'E-Dönüşüm', icon: FileCheck2 },
  { to: '/admin/end-of-day', label: 'Gün Sonu (Z)', icon: Calculator },
  { to: '/admin/staff-report', label: 'Personel Raporu', icon: ClipboardList },
  { to: '/admin/shifts', label: 'Mesai Takibi', icon: CalendarClock },
  { to: '/admin/printers', label: 'Yazıcılar', icon: Printer },
  { to: '/admin/users', label: 'Kullanıcılar', icon: Users },
  { to: '/admin/settings', label: 'Ayarlar', icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, rol, logout } = useAuthStore();
  const { settings } = useSettingsStore();
  const [open, setOpen] = useState(false);

  // Rota değişince mobil çekmeceyi kapat
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* Mobil arka plan (çekmece açıkken) */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar — masaüstünde sabit, mobilde kayan çekmece */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Yönetim Paneli</p>
            <img
              src="/branding/ala-konya-logo.png"
              alt={settings.restoranAd || 'Alâ Konya Mutfağı'}
              className="mt-1 h-[4.5rem] w-auto"
            />
          </div>
          <button onClick={() => setOpen(false)} className="btn-ghost -mr-2 lg:hidden" aria-label="Kapat">
            <X size={20} />
          </button>
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
          <div className="mt-3 border-t border-slate-100 pt-3 text-center">
            <PoweredBy />
          </div>
        </div>
      </aside>

      {/* İçerik sütunu */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobil üst bar (hamburger) */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
          <button onClick={() => setOpen(true)} className="btn-ghost -ml-1" aria-label="Menü">
            <Menu size={22} />
          </button>
          <img
            src="/branding/ala-konya-logo.png"
            alt={settings.restoranAd || 'Yönetim'}
            className="h-8 w-auto"
          />
        </header>
        <main className="flex-1 overflow-y-auto">
          <OfflineBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
