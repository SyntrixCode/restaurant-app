import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Users as UsersIcon,
  Truck,
  Receipt,
  Send,
  Smartphone,
  Check,
  X,
  StickyNote,
  CreditCard,
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
import { confirmPosentegraOrder, rejectPosentegraOrder } from '../../firebase/posentegra';
import Modal from '../../components/ui/Modal';

const APP_KAYNAKLAR = ['yemeksepeti', 'getir', 'trendyol', 'migros'];

const KAYNAK_LABELS = {
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
  migros: 'Migros',
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

  // Posentegra red modali
  const [rejectFor, setRejectFor] = useState(null); // { order }
  const [rejecting, setRejecting] = useState(false);

  const handleConfirmPosentegra = async (order) => {
    if (!confirm(`${order.paketKaynakAd || 'Posentegra'} siparişi kabul edilsin mi?`)) return;
    const t = toast.loading('Kabul ediliyor…');
    try {
      await confirmPosentegraOrder(order.id);
      toast.success('Sipariş kabul edildi, mutfağa gönderildi', { id: t });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Kabul edilemedi', { id: t });
    }
  };

  const handleRejectPosentegra = async (sebep, not) => {
    if (!rejectFor) return;
    setRejecting(true);
    const t = toast.loading('Reddediliyor…');
    try {
      await rejectPosentegraOrder(rejectFor.id, { reason: sebep, note: not });
      toast.success('Sipariş reddedildi', { id: t });
      setRejectFor(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Reddedilemedi', { id: t });
    } finally {
      setRejecting(false);
    }
  };

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
                      canReject={['admin', 'kasiyer'].includes(rol)}
                      onConfirm={() => handleConfirmPosentegra(o)}
                      onReject={() => setRejectFor(o)}
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

      <PosentegraRejectModal
        order={rejectFor}
        submitting={rejecting}
        onClose={() => setRejectFor(null)}
        onConfirm={handleRejectPosentegra}
      />
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

function PaketOrderCard({
  order,
  gecikmeEsigi,
  canPay,
  canReject,
  onConfirm,
  onReject,
  onYolaCikar,
  onAppPaid,
  onManuelPay,
}) {
  const mins = minutesSince(order.olusturmaZamani);
  const late = mins > gecikmeEsigi;
  const yolda = order.durum === 'masayaGitti';
  const appOrder = APP_KAYNAKLAR.includes(order.paketKaynak);
  // Posentegra: pid var ama henüz onaylanmamışsa "yeni gelen" — Kabul/Red gerekli
  const isPosentegra = !!order.posentegraPid;
  const needsConfirm = isPosentegra && !order.posentegraOnayli;
  const onceden = !!order.oncedenOdendi;

  const borderCls = needsConfirm
    ? 'border-amber-400 ring-2 ring-amber-200'
    : late && !yolda
      ? 'border-red-500'
      : yolda
        ? 'border-purple-400'
        : 'border-slate-200';

  return (
    <div className={`rounded-xl border-2 bg-white p-4 shadow-sm ${borderCls}`}>
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">
            {order.musteriAd || 'Paket'}
          </h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{order.paketKaynakAd || order.garsonAd}</span>
            {appOrder && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-purple-700">
                <Smartphone size={10} /> {KAYNAK_LABELS[order.paketKaynak]}
              </span>
            )}
            {needsConfirm && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                ⚡ YENİ
              </span>
            )}
            {onceden && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                <CreditCard size={10} /> Önceden Ödendi
              </span>
            )}
            {yolda && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700">
                <Truck size={10} /> Yolda
              </span>
            )}
          </p>
          {order.musteriTel && (
            <p className="mt-0.5 text-[11px] text-slate-500">📞 {order.musteriTel}</p>
          )}
          {order.musteriAdres && (
            <p className="mt-1 line-clamp-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
              📍 {order.musteriAdres}
            </p>
          )}
          {order.musteriNotu && (
            <p className="mt-1 line-clamp-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-800">
              <StickyNote size={10} className="mr-0.5 inline" /> {order.musteriNotu}
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
          {order.odemeTipi && (
            <p className="text-[10px] text-slate-500">{order.odemeTipi}</p>
          )}
        </div>
      </div>

      <ItemList items={order.items} />

      {/* Buton mantığı: önce Kabul/Red, sonra Yola Çıkar, sonra ödeme */}
      {needsConfirm ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={14} /> Kabul Et
          </button>
          <button
            onClick={onReject}
            disabled={!canReject}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            title={canReject ? '' : 'Reddetme yetkisi yok'}
          >
            <X size={14} /> Reddet
          </button>
        </div>
      ) : !yolda ? (
        <button onClick={onYolaCikar} className="btn-primary w-full text-sm">
          <Send size={14} /> Yola Çıkar
        </button>
      ) : canPay ? (
        appOrder || onceden ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onAppPaid} className="btn-primary text-sm">
              <Smartphone size={14} />{' '}
              {onceden ? 'Önceden Ödendi · Kapat' : `${KAYNAK_LABELS[order.paketKaynak]} Ödendi`}
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

const REJECT_REASONS = [
  'Ürün mevcut değil',
  'Kapanış saati geçti',
  'Adres teslimat alanı dışında',
  'Mutfak yoğun',
  'Yanlış sipariş / dublike',
  'Diğer',
];

function PosentegraRejectModal({ order, submitting, onClose, onConfirm }) {
  const [sebep, setSebep] = useState(REJECT_REASONS[0]);
  const [not, setNot] = useState('');
  useEffect(() => {
    if (order) {
      setSebep(REJECT_REASONS[0]);
      setNot('');
    }
  }, [order]);
  if (!order) return null;
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`${order.musteriAd || 'Paket'} — Siparişi Reddet`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} disabled={submitting} className="btn-secondary">
            Vazgeç
          </button>
          <button
            onClick={() => onConfirm(sebep, not)}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <X size={14} /> {submitting ? 'Reddediliyor…' : 'Reddet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ Bu sipariş <strong>{order.paketKaynakAd || 'Posentegra'}</strong> üzerinde de iptal
          edilir. Müşteriye iptal bildirimi gider.
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Sebep</label>
          <select value={sebep} onChange={(e) => setSebep(e.target.value)} className="input">
            {REJECT_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama (opsiyonel)</label>
          <textarea
            value={not}
            onChange={(e) => setNot(e.target.value)}
            rows={2}
            className="input"
            placeholder="Müşteriye iletilebilecek kısa açıklama"
          />
        </div>
      </div>
    </Modal>
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
