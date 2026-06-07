import { useEffect, useState, useMemo } from 'react';
import {
  Bell,
  AlertTriangle,
  Package,
  Clock,
  CalendarClock,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { watchCollection, where } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { minutesSince, formatDate } from '../../utils/format';

export default function AdminNotifications() {
  const [activeOrders, setActiveOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [reservations, setReservations] = useState([]);
  const { settings } = useSettingsStore();
  const [, setNow] = useState(Date.now());

  // Tick every 30 sec to refresh "minutes since"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      watchCollection(
        'orders',
        setActiveOrders,
        where('durum', 'in', ['aktif', 'hazirlandi']),
      ),
    [],
  );
  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(
    () =>
      watchCollection('reservations', setReservations, where('durum', '==', 'aktif')),
    [],
  );

  const gecikmeEsigi = settings.gecikmeEsigiDk || 15;
  const dusukStokEsigi = settings.dusukStokEsigi || 5;
  const ayarlar = settings.bildirimAyarlari || {};

  const lateOrders = useMemo(() => {
    if (!ayarlar.gecikme) return [];
    return activeOrders
      .filter((o) => minutesSince(o.olusturmaZamani) > gecikmeEsigi)
      .sort((a, b) => minutesSince(b.olusturmaZamani) - minutesSince(a.olusturmaZamani));
  }, [activeOrders, gecikmeEsigi, ayarlar.gecikme]);

  const lowStockItems = useMemo(() => {
    if (!ayarlar.dusukStok) return [];
    return products
      .filter((p) => p.aktif)
      .filter((p) => p.stokTakipli !== false) // takipsiz ürünler (pide/kebap) uyarı vermez
      .filter((p) => {
        const esik = p.dusukStokEsigi ?? dusukStokEsigi;
        return p.stok <= esik;
      })
      .sort((a, b) => a.stok - b.stok);
  }, [products, dusukStokEsigi, ayarlar.dusukStok]);

  const upcomingReservations = useMemo(() => {
    if (!ayarlar.rezervasyon) return [];
    const now = Date.now();
    const limit = now + 2 * 60 * 60 * 1000; // 2 saat
    return reservations
      .filter((r) => {
        if (!r.zamanISO) return false;
        const t = new Date(r.zamanISO).getTime();
        return t >= now && t <= limit;
      })
      .sort((a, b) => new Date(a.zamanISO) - new Date(b.zamanISO));
  }, [reservations, ayarlar.rezervasyon]);

  const totalAlerts =
    lateOrders.length + lowStockItems.length + upcomingReservations.length;

  return (
    <div className="p-8">
      <PageHeader
        title="Bildirimler"
        subtitle="Dikkat gerektiren olaylar — ayarlar sayfasından açıp kapatabilirsin"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="Toplam Uyarı"
          value={totalAlerts}
          color={totalAlerts > 0 ? 'red' : 'green'}
          icon={Bell}
        />
        <StatCard
          label="Geciken Sipariş"
          value={lateOrders.length}
          color={lateOrders.length > 0 ? 'red' : 'green'}
          icon={Clock}
        />
        <StatCard
          label="Düşük Stok"
          value={lowStockItems.length}
          color={lowStockItems.length > 0 ? 'amber' : 'green'}
          icon={Package}
        />
        <StatCard
          label="Yaklaşan Rezervasyon"
          value={upcomingReservations.length}
          color="blue"
          icon={CalendarClock}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Geciken siparişler */}
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <Clock size={14} className="text-red-500" />
            Geciken Siparişler ({gecikmeEsigi}+ dk)
          </h3>
          {!ayarlar.gecikme ? (
            <p className="py-6 text-center text-xs italic text-slate-400">
              Bildirim devre dışı (Ayarlar'dan aç)
            </p>
          ) : lateOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Geciken sipariş yok ✓
            </p>
          ) : (
            <ul className="space-y-2">
              {lateOrders.map((o) => (
                <li
                  key={o.id}
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{o.masaAd}</p>
                      <p className="text-xs text-slate-600">{o.garsonAd}</p>
                    </div>
                    <div className="flex items-center gap-1 font-bold text-red-700">
                      <AlertTriangle size={14} />
                      {minutesSince(o.olusturmaZamani)} dk
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Düşük stok */}
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <Package size={14} className="text-amber-500" />
            Düşük Stok (≤ {dusukStokEsigi})
          </h3>
          {!ayarlar.dusukStok ? (
            <p className="py-6 text-center text-xs italic text-slate-400">
              Bildirim devre dışı
            </p>
          ) : lowStockItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Tüm stoklar yeterli ✓
            </p>
          ) : (
            <ul className="space-y-2">
              {lowStockItems.slice(0, 20).map((p) => (
                <li
                  key={p.id}
                  className={`rounded-lg border p-3 text-sm ${
                    p.stok === 0
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{p.ad}</p>
                      <p className="text-xs text-slate-500">{p.categoryAd}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        p.stok === 0
                          ? 'bg-red-200 text-red-800'
                          : 'bg-amber-200 text-amber-800'
                      }`}
                    >
                      {p.stok === 0 ? 'Tükendi' : `${p.stok} kaldı`}
                    </span>
                  </div>
                </li>
              ))}
              {lowStockItems.length > 20 && (
                <li className="text-center text-xs text-slate-400">
                  + {lowStockItems.length - 20} ürün daha
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Yaklaşan rezervasyonlar */}
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <CalendarClock size={14} className="text-blue-500" />
            Yaklaşan Rezervasyonlar (≤ 2 saat)
          </h3>
          {!ayarlar.rezervasyon ? (
            <p className="py-6 text-center text-xs italic text-slate-400">
              Bildirim devre dışı
            </p>
          ) : upcomingReservations.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Yakında rezervasyon yok
            </p>
          ) : (
            <ul className="space-y-2">
              {upcomingReservations.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{r.musteriAd}</p>
                      <p className="text-xs text-slate-600">
                        {r.masaAd} · {r.kisiSayisi} kişi
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-700">{r.saat}</p>
                      <p className="text-[10px] text-slate-500">{r.tarih}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
        <p>
          💡 Bildirim kategorilerini açıp kapatmak için{' '}
          <a href="/admin/settings" className="text-blue-700 hover:underline">
            Ayarlar → Bildirimler
          </a>{' '}
          sayfasını kullan.
        </p>
        <p className="mt-1">
          Bu sayfa Firestore'dan canlı veri okur ve her 30 saniyede bir geçen süreleri yeniler.
          Push bildirim (ses/popup) için Cloud Functions gerekir — şimdilik bu pasif liste.
        </p>
      </div>
    </div>
  );
}
