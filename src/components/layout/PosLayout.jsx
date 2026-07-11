import { useEffect, useState } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LogOut, ShoppingCart, Truck, Grid3x3, ClipboardList, Settings as SettingsIcon, Timer } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useIdleLogout } from '../../hooks/useIdleLogout';
import { useSettingsStore } from '../../store/settingsStore';
import PoweredBy from '../PoweredBy';
import WaiterCallAlert from '../WaiterCallAlert';
import ShiftButton from '../ShiftButton';
import OfflineBanner from '../OfflineBanner';
import PosDeviceSettingsModal from '../PosDeviceSettingsModal';
import UpdateBanner from '../UpdateBanner';
import {
  checkCustomerDisplayAvailable,
  startCustomerDisplay,
  pushToCustomerDisplay,
} from '../../plugins/customerDisplay';
import { useNewOrderAlert } from '../../hooks/useNewOrderAlert';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { warmupAudio } from '../../utils/sound';

export default function PosLayout() {
  const navigate = useNavigate();
  const { profile, rol, logout } = useAuthStore();
  const { settings } = useSettingsStore();
  const isKasiyer = rol === 'kasiyer' || rol === 'admin';
  const isKurye = rol === 'kurye';
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);

  // Yeni sipariş ses bildirimi (mutfak/kasa için)
  useNewOrderAlert();
  // Admin yeni sürüm onayladıysa diğer tabletler sessizce indirsin
  useAutoUpdate();

  // Müşteri ekranını (varsa) başlat + ses sistemini uyandır
  useEffect(() => {
    warmupAudio();
    (async () => {
      const available = await checkCustomerDisplayAvailable();
      if (available) {
        await startCustomerDisplay();
        // Başlangıçta idle ekranı
        pushToCustomerDisplay({ mode: 'idle' });
      }
    })();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/pos/login');
  };

  // Garson 2 dk işlem yapmazsa otomatik çıkış (mutfak/kasa/kurye ekranları etkilenmez)
  const IDLE_MS = 120000;
  const idleEnabled = rol === 'garson';
  const remainingMs = useIdleLogout({
    timeoutMs: IDLE_MS,
    enabled: idleEnabled,
    onTimeout: async () => {
      toast('2 dk işlem yapılmadı — otomatik çıkış', { icon: '⏱️' });
      await handleLogout();
    },
  });
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const idleMM = Math.floor(remainingSec / 60);
  const idleSS = String(remainingSec % 60).padStart(2, '0');
  const idleLow = remainingMs <= 30000;

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <OfflineBanner />
      <WaiterCallAlert />
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <img
            src="/branding/ala-konya-logo.png"
            alt={settings.restoranAd || 'Alâ Konya Mutfağı'}
            className="h-[3.75rem] w-auto"
          />
          <span className="text-sm text-slate-500">
            {profile?.ad} <span className="font-medium text-blue-600">({rol})</span>
          </span>
          {idleEnabled && (
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums transition ${
                idleLow ? 'animate-pulse bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
              }`}
              title="İşlem yapılmazsa otomatik çıkış yapılır"
            >
              <Timer size={15} />
              Oto. çıkış {idleMM}:{idleSS}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-1">
          {!isKurye && <PosNavLink to="/pos/tables" icon={Grid3x3} label="Masalar" />}
          <PosNavLink
            to="/pos/orders/active"
            icon={ClipboardList}
            label={isKurye ? 'Teslimat Bekleyen' : 'Aktif Siparişler'}
          />
          {isKasiyer && (
            <PosNavLink to="/pos/packages" icon={Truck} label="Paket Servis" />
          )}
          <ShiftButton />
          <button
            onClick={() => setDeviceSettingsOpen(true)}
            className="btn-ghost"
            title="Bu cihazın yazıcı ayarları"
          >
            <SettingsIcon size={16} />
          </button>
          <button onClick={handleLogout} className="btn-ghost">
            <LogOut size={16} /> Çıkış
          </button>
        </nav>
      </header>
      <PosDeviceSettingsModal open={deviceSettingsOpen} onClose={() => setDeviceSettingsOpen(false)} />
      {/* Yeni sürüm uyarısı — garson/kasiyer de kendi tabletini güncelleyebilsin
          (admin'e gerek kalmadan). Güncelleme yoksa null döner, boşluk yapmaz. */}
      <div className="px-4 pt-3 [&:empty]:hidden">
        <UpdateBanner to="/pos/tables" />
      </div>
      <main className="flex-1 overflow-y-auto">
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
