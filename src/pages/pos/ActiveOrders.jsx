import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Users as UsersIcon,
  Truck,
  Receipt,
  Send,
  Smartphone,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { watchCollection, where, orderBy } from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, minutesSince, formatAdet } from '../../utils/format';
import { updateOrderStatus } from '../../firebase/orders';
import { recordPayment } from '../../firebase/payments';
import { awardLoyaltyPoints, computeEarnedPoints } from '../../firebase/customers';

const APP_KAYNAKLAR = ['yemeksepeti', 'getir', 'trendyol'];

const KAYNAK_LABELS = {
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
};

export default function ActiveOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [, setTick] = useState(0); // canlı süre güncellemesi için
  const { user, profile, rol } = useAuthStore();
  const { settings } = useSettingsStore();
  const gecikmeEsigi = settings.gecikmeEsigiDk || 15;
  const canPay = ['kasiyer', 'admin'].includes(rol);

  // Her 30 sn'de bir yeniden render → süreler canlı güncellenir, gecikme alarmı otomatik tetiklenir
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      watchCollection(
        'orders',
        setOrders,
        where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']),
        orderBy('olusturmaZamani', 'desc'),
      ),
    [],
  );

  const visible = useMemo(() => {
    let list = orders;
    if (rol === 'garson') list = list.filter((o) => o.garsonId === user?.uid);
    return list;
  }, [orders, rol, user]);

  const masaOrders = visible.filter((o) => !o.paketMi);
  const paketOrders = visible.filter((o) => o.paketMi);

  const handleYolaCikar = async (order) => {
    try {
      await updateOrderStatus(order.id, 'masayaGitti');
      toast.success(`${order.musteriAd || 'Paket'} yola çıkarıldı`);
    } catch (err) {
      console.error(err);
      toast.error('Durum güncellenemedi');
    }
  };

  const handleAppPaid = async (order) => {
    if (!canPay) {
      toast.error('Ödeme yetkisi yok');
      return;
    }
    const appLabel = KAYNAK_LABELS[order.paketKaynak] || 'Uygulama';
    if (!confirm(`${appLabel} üzerinden ödeme alındı olarak işaretlensin mi?\n\nSipariş arşivlenecek.`))
      return;
    try {
      await recordPayment({
        orderId: order.id,
        kasiyerId: user.uid,
        kasiyerAd: profile?.ad || 'Kasiyer',
        payments: [
          {
            tutar: order.toplam,
            yontem: 'uygulama',
            kartTipi: appLabel,
          },
        ],
        fisBasildi: false,
      });
      // Sadakat puanı (paket + telefon + program aktif)
      if (settings?.sadakatAktif && order.musteriTel) {
        const earned = computeEarnedPoints(order.toplam, settings);
        if (earned > 0) {
          awardLoyaltyPoints({ tel: order.musteriTel, tutar: order.toplam, settings })
            .then(() => toast.success(`+${earned} sadakat puanı`))
            .catch((e) => console.warn('Puan eklenemedi:', e));
        }
      }
      toast.success(`${appLabel} üzerinden ödendi olarak arşivlendi`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Arşivlenemedi');
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Açık Siparişler
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            {visible.length}
          </span>
        </h2>
        <p className="text-xs text-slate-500">
          {rol === 'garson' ? 'Sadece sizin siparişleriniz' : 'Tüm açık siparişler'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Receipt size={40} />
            <p>Açık sipariş yok.</p>
          </div>
        ) : (
          <>
            {masaOrders.length > 0 && (
              <Section title="Masa Siparişleri" count={masaOrders.length}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {masaOrders.map((o) => (
                    <MasaOrderCard
                      key={o.id}
                      order={o}
                      gecikmeEsigi={gecikmeEsigi}
                      canPay={canPay}
                      onPay={() => navigate(`/pos/payment?orderId=${o.id}`)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {paketOrders.length > 0 && (
              <Section title="Paket Siparişleri" count={paketOrders.length} icon={Truck}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paketOrders.map((o) => (
                    <PaketOrderCard
                      key={o.id}
                      order={o}
                      gecikmeEsigi={gecikmeEsigi}
                      canPay={canPay}
                      onYolaCikar={() => handleYolaCikar(o)}
                      onAppPaid={() => handleAppPaid(o)}
                      onManuelPay={() => navigate(`/pos/payment?orderId=${o.id}`)}
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, icon: Icon, children }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {Icon && <Icon size={14} />}
        <span>{title}</span>
        <span className="rounded-full bg-slate-200 px-1.5 text-slate-700">{count}</span>
      </div>
      {children}
    </div>
  );
}

function MasaOrderCard({ order, gecikmeEsigi, canPay, onPay }) {
  const mins = minutesSince(order.olusturmaZamani);
  const late = mins > gecikmeEsigi;
  const critical = mins > gecikmeEsigi * 2; // 2 katı → kritik

  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 shadow-sm transition ${
        critical
          ? 'animate-pulse border-red-600 bg-red-50/40 ring-2 ring-red-300'
          : late
            ? 'border-red-500'
            : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-slate-900">{order.masaAd}</h3>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span>{order.garsonAd}</span>
            {order.kisiSayisi != null && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700">
                <UsersIcon size={10} /> {order.kisiSayisi}
              </span>
            )}
            <span>· #{order.id.slice(0, 6)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${late ? 'text-red-600' : 'text-slate-700'}`}>
            {late && <AlertTriangle size={14} className="mr-1 inline" />}
            <Clock size={12} className="mr-1 inline" />
            {mins} dk
            {critical && <span className="ml-1 text-xs font-bold uppercase">GECİKTİ!</span>}
          </p>
          <p className="text-base font-bold text-slate-900">{formatTL(order.toplam)}</p>
        </div>
      </div>

      <ItemList items={order.items} />

      {canPay && (
        <button onClick={onPay} className="btn-primary w-full text-sm">
          Ödeme Al
        </button>
      )}
    </div>
  );
}

function PaketOrderCard({ order, gecikmeEsigi, canPay, onYolaCikar, onAppPaid, onManuelPay }) {
  const mins = minutesSince(order.olusturmaZamani);
  const late = mins > gecikmeEsigi;
  const yolda = order.durum === 'masayaGitti';
  const appOrder = APP_KAYNAKLAR.includes(order.paketKaynak);

  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 shadow-sm ${
        late && !yolda
          ? 'border-red-500'
          : yolda
            ? 'border-purple-400'
            : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">
            {order.musteriAd || 'Paket'}
          </h3>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span>{order.garsonAd}</span>
            {appOrder && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-purple-700">
                <Smartphone size={10} /> {KAYNAK_LABELS[order.paketKaynak]}
              </span>
            )}
            {yolda && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700">
                <Truck size={10} /> Yolda
              </span>
            )}
          </p>
          {order.musteriAdres && (
            <p className="mt-1 line-clamp-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
              📍 {order.musteriAdres}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${late && !yolda ? 'text-red-600' : 'text-slate-700'}`}>
            {late && !yolda && <AlertTriangle size={14} className="mr-1 inline" />}
            <Clock size={12} className="mr-1 inline" />
            {mins} dk
          </p>
          <p className="text-base font-bold text-slate-900">{formatTL(order.toplam)}</p>
        </div>
      </div>

      <ItemList items={order.items} />

      {/* Buton mantığı: aktif → Yola Çıkar; yolda → ödeme seçenekleri */}
      {!yolda ? (
        <button onClick={onYolaCikar} className="btn-primary w-full text-sm">
          <Send size={14} /> Yola Çıkar
        </button>
      ) : canPay ? (
        appOrder ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onAppPaid} className="btn-primary text-sm">
              <Smartphone size={14} /> {KAYNAK_LABELS[order.paketKaynak]} Ödendi
            </button>
            <button onClick={onManuelPay} className="btn-secondary text-sm">
              Manuel Ödeme
            </button>
          </div>
        ) : (
          <button onClick={onManuelPay} className="btn-primary w-full text-sm">
            Ödemeyi Al (Kurye Döndü)
          </button>
        )
      ) : (
        <p className="rounded-lg bg-purple-50 py-2 text-center text-xs text-purple-700">
          Yolda · ödeme yetkisi yok
        </p>
      )}
    </div>
  );
}

function ItemList({ items }) {
  return (
    <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto text-sm">
      {(items || []).map((it, idx) => (
        <li key={idx} className="flex justify-between text-slate-700">
          <span>
            <strong>{formatAdet(it.adet)}×</strong> {it.ad}
            {it.notlar && <em className="ml-1 text-xs text-slate-400">({it.notlar})</em>}
          </span>
        </li>
      ))}
    </ul>
  );
}
