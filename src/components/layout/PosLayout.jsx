import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { LogOut, ShoppingCart, Truck, Grid3x3, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import PoweredBy from '../PoweredBy';

export default function PosLayout() {
  const navigate = useNavigate();
  const { profile, rol, logout } = useAuthStore();
  const { settings } = useSettingsStore();
  const isKasiyer = rol === 'kasiyer' || rol === 'admin';

  const handleLogout = async () => {
    await logout();
    navigate('/pos/login');
  };

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-900">
            {settings.restoranAd || 'Restoran POS'}
          </h1>
          <span className="text-sm text-slate-500">
            {profile?.ad} <span className="font-medium text-blue-600">({rol})</span>
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <PosNavLink to="/pos/tables" icon={Grid3x3} label="Masalar" />
          <PosNavLink to="/pos/orders/active" icon={ClipboardList} label="Aktif Siparişler" />
          {isKasiyer && (
            <PosNavLink to="/pos/packages" icon={Truck} label="Paket Servis" />
          )}
          <button onClick={handleLogout} className="btn-ghost">
            <LogOut size={16} /> Çıkış
          </button>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-1.5 text-center">
        <PoweredBy />
      </footer>
    </div>
  );
}

function PosNavLink({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
          isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}
