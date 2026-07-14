import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Users as UsersIcon,
  Truck,
  Receipt,
  Send,
  Plus,
  Smartphone,
  Check,
  X,
  StickyNote,
  CreditCard,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { watchCollection, where, orderBy, patchDoc, serverTimestamp } from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, minutesSince, formatAdet } from '../../utils/format';
import { updateOrderStatus, cancelActiveOrder } from '../../firebase/orders';
import { platformAd, platformKuryeAd } from '../../utils/platform';
import { isIminPrinterAvailable, printReceipt, buildPaketFisiLines } from '../../plugins/iminPrinter';
import { recordPayment } from '../../firebase/payments';
import { awardLoyaltyPoints, computeEarnedPoints } from '../../firebase/customers';
import { confirmPosentegraOrder, rejectPosentegraOrder, fetchPosentegraReasons } from '../../firebase/posentegra';
import Modal from '../../components/ui/Modal';
import KitchenTicket from '../../components/KitchenTicket';

const APP_KAYNAKLAR = ['yemeksepeti', 'getir', 'trendyol', 'migros'];

const KAYNAK_LABELS = {
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
  migros: 'Migros',
};

// Paket siparişleri iki gruba ayrılır:
//  - "Online Paketler": platform (Getir/Yemeksepeti/Trendyol/Migros) veya Posentegra siparişleri
//  - "Dış Paket": Paket Servis ekranından girilen manuel / telefon siparişleri
const PAKET_GRUP_TANIMI = [
  { key: 'dis', baslik: 'Dış Paket' },
  { key: 'online', baslik: 'Online Paketler' },
];
const paketOnlineMi = (o) => APP_KAYNAKLAR.includes(o.paketKaynak) || !!o.posentegraPid;

export default function ActiveOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [, setTick] = useState(0); // canlı süre güncellemesi için
  const [aktifTab, setAktifTab] = useState('dis'); // seçili paket kategorisi
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

  const paketOrders = visible.filter((o) => o.paketMi);
  const isKurye = rol === 'kurye';

  // Paket siparişlerini tipe göre gruplara böl — boş gruplar sekmelerde/listede atlanır
  const paketGruplari = PAKET_GRUP_TANIMI.map((g) => ({ ...g, list: [] }));
  paketOrders.forEach((o) => paketGruplari[paketOnlineMi(o) ? 1 : 0].list.push(o));

  // Sabit kategori sekmeleri — her paket tipi (siparişi olsa da olmasa da) her zaman görünür.
  const seciliGrup = paketGruplari.find((g) => g.key === aktifTab) || paketGruplari[0];
  // Kurye sadece KENDİSİNE atanmış "yolda" paketleri görür
  const kuryeYoldaOrders = paketOrders.filter(
    (o) => o.durum === 'masayaGitti' && o.kuryeId === user?.uid,
  );

  // Aktif kuryeler — Yola Çıkar modalında listelenir
  const [kuryeler, setKuryeler] = useState([]);
  useEffect(
    () =>
      watchCollection(
        'users',
        setKuryeler,
        where('rol', '==', 'kurye'),
        where('aktif', '==', true),
      ),
    [],
  );

  const [teslimFor, setTeslimFor] = useState(null); // { order }
  const [yolaCikarFor, setYolaCikarFor] = useState(null); // { order }

  // Posentegra red modali
  const [rejectFor, setRejectFor] = useState(null); // { order }
  const [rejecting, setRejecting] = useState(false);
  // Mutfak fişi (Posentegra kabul sonrası açılır, otomatik basar)
  const [kitchenTicket, setKitchenTicket] = useState(null);

  /**
   * PAKET FİŞİ — TABLETİN KENDİ yazıcısından basılır, paketin üzerine zımbalanır.
   * Mutfak fişlerinden ayrıdır: onlar ürün bazında ağdaki istasyonlara (fırın/çorba)
   * bölünür; bu fiş siparişin TAMAMINI tek sayfada verir (kurye/müşteri kontrolü için).
   * Yazıcı yoksa (web/tablet değil) sessizce atlanır — sipariş akışını asla bozmaz.
   */
  const printPaketFisi = async (order) => {
    try {
      if (!(await isIminPrinterAvailable())) return;
      const lines = buildPaketFisiLines({
        order,
        items: order.items || [],
        platformAd: platformAd(order),
        settings,
      });
      await printReceipt({ lines, cut: true, feedLines: 3 });
    } catch (err) {
      console.warn('Paket fişi basılamadı:', err?.message || err);
      toast('Paket fişi basılamadı (tablet yazıcısı)', { icon: '🖨️' });
    }
  };

  const handleConfirmPosentegra = async (order) => {
    if (!confirm(`${platformAd(order) || 'Posentegra'} siparişi kabul edilsin mi?`)) return;
    const t = toast.loading('Kabul ediliyor…');
    try {
      await confirmPosentegraOrder(order.id);
      toast.success('Sipariş kabul edildi, mutfağa gönderildi', { id: t });
      // Pakete zımbalanacak fiş — tabletin kendi yazıcısından (mutfak fişlerinden ayrı)
      printPaketFisi(order);
      // Mutfak fişini otomatik bas — KitchenTicket modal kendi yazıcı yönlendirmesini yapar
      setKitchenTicket({
        order: {
          id: order.id,
          masaAd: order.masaAd || `Paket - ${platformAd(order) || 'Posentegra'}`,
          kisiSayisi: null,
          garsonAd: platformAd(order) || order.garsonAd || 'Posentegra',
          paketMi: true,
          paketKaynakAd: order.paketKaynakAd || null,
        },
        items: (order.items || []).map((it) => ({
          ad: it.ad,
          adet: it.adet,
          notlar: it.notlar,
          categoryId: it.categoryId || null,
          yaziciIds: Array.isArray(it.yaziciIds) ? it.yaziciIds : [],
        })),
      });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Kabul edilemedi', { id: t });
    }
  };

  /**
   * Paket siparişini İPTAL et (ciroya girmez).
   * Önce platforma (Posentegra) bildirmeyi dener — eski/kapanmış siparişlerde bu API
   * hata verir. O durumda kullanıcıya sorup YEREL iptal yapar; böylece sipariş
   * "Aktif Siparişler"de takılı kalmaz.
   */
  const handleIptalPaket = async (order) => {
    const sebep = prompt('İptal sebebi (zorunlu):', 'Platformda iptal / teslim edilmedi');
    if (!sebep || !sebep.trim()) return;

    // İptal başarılı olunca mutfağa İPTAL fişi bas (mutfak yapmayı durdursun).
    const printIptalFisi = () =>
      setKitchenTicket({
        order: {
          id: order.id,
          masaAd: order.masaAd,
          garsonAd: order.garsonAd,
          paketMi: order.paketMi,
          paketKaynak: order.paketKaynak,
          paketKaynakAd: order.paketKaynakAd,
        },
        items: order.items || [],
        isCancellation: true,
        cancellationReason: sebep.trim(),
      });

    const t = toast.loading('İptal ediliyor…');
    let platformOk = false;
    if (order.posentegraPid) {
      try {
        await rejectPosentegraOrder(order.id, { reason: '', note: sebep.trim() });
        platformOk = true;
      } catch (err) {
        console.warn('Posentegra iptali başarısız:', err?.message);
      }
    }

    if (platformOk) {
      toast.success('Sipariş iptal edildi (platforma da bildirildi)', { id: t });
      printIptalFisi();
      return; // posentegraReject order'ı zaten 'iptal'e aldı
    }

    // Platforma ulaşılamadı → yerel iptal teklifi
    toast.dismiss(t);
    const yerel = confirm(
      `${platformAd(order) || 'Platform'} tarafına iptal bildirilemedi ` +
        `(sipariş eski/kapanmış olabilir).\n\n` +
        `Yine de sistemden İPTAL edilsin mi?\n` +
        `• Sipariş listeden düşer\n• Ciroya GİRMEZ\n• Platform tarafı etkilenmez`,
    );
    if (!yerel) return;

    const t2 = toast.loading('Yerel olarak iptal ediliyor…');
    try {
      await cancelActiveOrder({
        orderId: order.id,
        sebep: sebep.trim(),
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Personel',
      });
      toast.success('Sipariş iptal edildi (ciroya girmedi)', { id: t2 });
      printIptalFisi();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'İptal edilemedi', { id: t2 });
    }
  };

  const handleRejectPosentegra = async (sebepId, not, sebepAdi) => {
    if (!rejectFor) return;
    setRejecting(true);
    const t = toast.loading('Reddediliyor…');
    try {
      await rejectPosentegraOrder(rejectFor.id, { reason: sebepId, reasonName: sebepAdi, note: not });
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
    // Platform kuryesi (Getir/YS vb. kendi kuryesi) — bizden kurye atanmıyor,
    // direkt durumu masayaGitti'ye çek, sayaç otomatik başlar.
    if (order.teslimatTipi === 'platform') {
      const t = toast.loading('Yola çıkarılıyor…');
      try {
        await patchDoc('orders', order.id, {
          durum: 'masayaGitti',
          masayaGittiZamani: serverTimestamp(),
        });
        toast.success(`${platformKuryeAd(order)} teslim ediyor`, { id: t });
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'İşlem başarısız', { id: t });
      }
      return;
    }
    // Restoran kuryesi → kurye seçim modalı
    if (kuryeler.length === 0) {
      toast.error('Aktif kurye yok. Admin → Kullanıcılar\'dan kurye tanımlayın.');
      return;
    }
    setYolaCikarFor(order);
  };

  const handleAssignKurye = async (kurye) => {
    if (!yolaCikarFor) return;
    const order = yolaCikarFor;
    const t = toast.loading('Yola çıkarılıyor…');
    try {
      // updateOrderStatus durum + timestamp; kurye atamasını ek alanlarla birlikte yazıyoruz
      await patchDoc('orders', order.id, {
        durum: 'masayaGitti',
        masayaGittiZamani: serverTimestamp(),
        kuryeId: kurye.id,
        kuryeAd: kurye.ad,
      });
      toast.success(`${kurye.ad} → ${order.musteriAd || 'Paket'}`, { id: t });
      setYolaCikarFor(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Atanamadı', { id: t });
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
      <div className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-700">
            {isKurye ? 'Siparişlerim' : 'Paket Siparişleri'}
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              {isKurye ? kuryeYoldaOrders.length : paketOrders.length}
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            {isKurye
              ? 'Sana atanan teslimatlar'
              : rol === 'garson'
                ? 'Sadece sizin paket siparişleriniz'
                : 'Paket servis & platform siparişleri'}
          </p>
        </div>

        {/* KATEGORİ SEKMELERİ — sabit; her paket tipi her zaman görünür */}
        {!isKurye && (
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2">
            {paketGruplari.map((g) => {
              const aktif = seciliGrup.key === g.key;
              return (
                <button
                  key={g.key}
                  onClick={() => setAktifTab(g.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
                    aktif
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {g.baslik}
                  <span
                    className={`rounded-full px-1.5 text-xs ${
                      aktif ? 'bg-white/25 text-white' : 'bg-white text-slate-500'
                    }`}
                  >
                    {g.list.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isKurye ? (
          kuryeYoldaOrders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <Truck size={40} />
              <p>Teslim edilecek paket yok.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {kuryeYoldaOrders.map((o) => (
                <KuryeOrderCard
                  key={o.id}
                  order={o}
                  onTeslim={() => {
                    const ad = o.musteriAd || 'Müşteri';
                    const adres = o.musteriAdres ? `\n${o.musteriAdres}` : '';
                    if (!confirm(`${ad} siparişi teslim edildi mi?${adres}\n\nOnaylarsan ödeme adımına geçilir.`)) {
                      return;
                    }
                    setTeslimFor(o);
                  }}
                />
              ))}
            </div>
          )
        ) : seciliGrup.list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Truck size={40} />
            <p>Bu kategoride paket yok.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {seciliGrup.list.map((o) => (
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
                onIptal={() => handleIptalPaket(o)}
                onDuzenle={() =>
                  navigate(`/pos/order/new?orderId=${o.id}&masa=${encodeURIComponent(o.masaAd || 'Paket')}`)
                }
              />
            ))}
          </div>
        )}
      </div>

      <PosentegraRejectModal
        order={rejectFor}
        submitting={rejecting}
        onClose={() => setRejectFor(null)}
        onConfirm={handleRejectPosentegra}
      />

      <KitchenTicket
        open={!!kitchenTicket}
        onClose={() => setKitchenTicket(null)}
        order={kitchenTicket?.order}
        items={kitchenTicket?.items}
        isCancellation={kitchenTicket?.isCancellation}
        cancellationReason={kitchenTicket?.cancellationReason}
      />

      <KuryeSelectModal
        order={yolaCikarFor}
        kuryeler={kuryeler}
        onClose={() => setYolaCikarFor(null)}
        onSelect={handleAssignKurye}
      />

      <KuryeTeslimModal
        order={teslimFor}
        onClose={() => setTeslimFor(null)}
        onConfirm={async (yontem) => {
          if (!teslimFor) return;
          const t = toast.loading('Teslim ediliyor…');
          try {
            await recordPayment({
              orderId: teslimFor.id,
              kasiyerId: user.uid,
              kasiyerAd: profile?.ad || 'Kurye',
              payments: [
                {
                  tutar: teslimFor.toplam,
                  yontem,
                  kartTipi:
                    yontem === 'uygulama'
                      ? platformAd(teslimFor) || 'Uygulama'
                      : yontem === 'kart'
                        ? 'Banka Kartı'
                        : null,
                },
              ],
              fisBasildi: false,
            });
            // Sadakat puanı (paket + telefon + program aktif)
            if (settings?.sadakatAktif && teslimFor.musteriTel) {
              const earned = computeEarnedPoints(teslimFor.toplam, settings);
              if (earned > 0) {
                awardLoyaltyPoints({
                  tel: teslimFor.musteriTel,
                  tutar: teslimFor.toplam,
                  settings,
                }).catch((e) => console.warn('Puan eklenemedi:', e));
              }
            }
            toast.success('Sipariş teslim edildi', { id: t });
            setTeslimFor(null);
          } catch (err) {
            console.error(err);
            toast.error(err.message || 'Teslim alınamadı', { id: t });
          }
        }}
      />
    </div>
  );
}

// Saniye granular canlı sayaç — sadece kendi state'inde güncellenir, parent re-render etmez
function LiveTimer({ from, className = '' }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!from) return null;
  // Firestore Timestamp veya Date — ikisini de destekle
  const start = from?.toMillis ? from.toMillis() : from?.seconds ? from.seconds * 1000 : new Date(from).getTime();
  if (!start || isNaN(start)) return null;
  const totalSec = Math.max(0, Math.floor((now - start) / 1000));
  const dk = Math.floor(totalSec / 60);
  const sn = totalSec % 60;
  return (
    <span className={className}>
      {dk} dk {String(sn).padStart(2, '0')} sn
    </span>
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
  const critical = mins > gecikmeEsigi * 2;

  // Durum-bilinçli aksent şeridi + dış halka
  const accentCls = critical ? 'bg-red-600' : late ? 'bg-orange-500' : 'bg-blue-500';
  const wrapperCls = critical
    ? 'ring-2 ring-red-300 animate-pulse'
    : late
      ? 'ring-2 ring-orange-200'
      : '';

  return (
    <div className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md ${wrapperCls}`}>
      {/* Üst aksent şeridi — durum rengi */}
      <div className={`h-1 w-full ${accentCls}`} />

      {/* HEADER: masa adı + tutar */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold leading-tight text-slate-900">
            {order.masaAd}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {order.garsonAd} · #{order.id.slice(0, 6)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`flex items-center justify-end gap-1 text-xs font-medium ${
              critical ? 'text-red-700' : late ? 'text-orange-600' : 'text-slate-500'
            }`}
          >
            {(late || critical) && <AlertTriangle size={12} />}
            <Clock size={12} /> {mins} dk
          </p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{formatTL(order.toplam)}</p>
        </div>
      </div>

      {/* ROZETLER ŞERİDİ */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        {order.kisiSayisi != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            <UsersIcon size={11} /> {order.kisiSayisi} Kişi
          </span>
        )}
        {critical ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
            🚨 KRİTİK GECİKME
          </span>
        ) : late ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
            ⏰ Gecikti
          </span>
        ) : null}
      </div>

      {/* ÜRÜNLER — boşluğu doldurur */}
      <div className="flex-1 border-t border-slate-100 px-4 py-3">
        <ItemList items={order.items} />
      </div>

      {/* AKSİYON — kartın dibinde sabit */}
      {canPay && (
        <div className="mt-auto border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <button
            onClick={onPay}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-700 active:scale-95"
          >
            <CreditCard size={15} /> Ödeme Al
          </button>
        </div>
      )}
    </div>
  );
}

// Platform → marka rengi (üst aksent şeridi + badge)
const PLATFORM_THEME = {
  yemeksepeti: { accent: 'bg-red-500', badge: 'bg-red-50 text-red-700' },
  getir: { accent: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700' },
  trendyol: { accent: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700' },
  migros: { accent: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  manuel: { accent: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700' },
  telefon: { accent: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
  diger: { accent: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700' },
};

/**
 * Platform (Trendyol/Yemeksepeti) müşterinin GERÇEK numarasını vermez — maskeli bir
 * "aktarma hattı" gönderir: santral no + sipariş dahilisi.
 *   clientPhoneNumber : "0212 365 34 03 11356836601"   (gösterim)
 *   contactPhoneNumber: "02123653403,,11356836601"     (ÇEVİRİLEBİLİR — ,, = bekleme)
 * `,,` ile arayınca santral açılır ve dahili otomatik tuşlanır → müşteriye bağlanır.
 * Bu yüzden tel: linkinde ham `contactPhoneNumber` kullanılmalı.
 */
function dialHref(order) {
  const raw = order?.posentegraRaw?.client?.contactPhoneNumber;
  const tel = String(raw || order?.musteriTel || '').replace(/\s+/g, '');
  return tel ? `tel:${tel}` : null;
}

/**
 * Platform KENDİ kuryesiyle teslim ediyorsa (deliveryType=1) müşteri adresini MASKELER:
 * tüm alanlar platform adına eşitlenir → "Trendyol Yemek, No: Trendyol Yemek, Kat: ...".
 * Bunu adres sanıp göstermek kafa karıştırıyor; tespit edip anlamlı mesaj gösteriyoruz.
 */
function isMaskedAddress(adres, platformAd) {
  if (!adres || !platformAd) return false;
  const p = platformAd.toLocaleLowerCase('tr');
  const kalan = adres
    .toLocaleLowerCase('tr')
    .split(p)
    .join(' ')
    .replace(/no:|kat:|daire:|blok:|kapı:/g, '')
    .replace(/[,()\-.\s]/g, '');
  return kalan.length === 0;
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
  onIptal,
  onDuzenle,
}) {
  const mins = minutesSince(order.olusturmaZamani);
  const late = mins > gecikmeEsigi;
  const yolda = order.durum === 'masayaGitti';
  const yoldaMins = yolda && order.masayaGittiZamani ? minutesSince(order.masayaGittiZamani) : null;
  const appOrder = APP_KAYNAKLAR.includes(order.paketKaynak);
  const isPosentegra = !!order.posentegraPid;
  // Dış Paket = Paket Servis ekranından girilen manuel sipariş (platform/posentegra değil).
  // Bunlarda kurye "Yola Çıkar" akışı yerine doğrudan kasada "Ödeme Al" yapılır.
  const disPaket = !isPosentegra && !appOrder;
  const needsConfirm = isPosentegra && !order.posentegraOnayli;
  // Platform kuryesi (Getir Kuryesi vb.) bu siparişi teslim edecek → bizden kurye atamayız
  const platformDelivery = order.teslimatTipi === 'platform';
  const onceden = !!order.oncedenOdendi;
  const theme = PLATFORM_THEME[order.paketKaynak] || PLATFORM_THEME.diger;
  // Platform kendi kuryesiyle teslim ederken adresi maskeler ("Trendyol Yemek, No: Trendyol Yemek...")
  const maskeliAdres = isMaskedAddress(order.musteriAdres, order.paketKaynakAd);

  // Kart çerçevesi durum-bilinçli
  const wrapperCls = needsConfirm
    ? 'ring-2 ring-amber-300 shadow-amber-100'
    : late && !yolda
      ? 'ring-2 ring-red-300'
      : '';

  return (
    <div className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md ${wrapperCls}`}>
      {/* Üst aksent şeridi — platform rengi */}
      <div className={`h-1 w-full ${theme.accent}`} />

      {/* HEADER: müşteri adı + tutar */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold leading-tight text-slate-900">
            {order.musteriAd || 'Paket'}
          </h3>
          {order.musteriTel && (
            <a
              href={dialHref(order) || undefined}
              title={
                isPosentegra
                  ? 'Platform aktarma hattı — arayınca santral seni müşteriye bağlar (dahili otomatik tuşlanır)'
                  : undefined
              }
              className="mt-0.5 inline-block text-xs font-medium text-blue-600 hover:underline"
            >
              📞 {order.musteriTel}
              {isPosentegra && (
                <span className="ml-1 text-[10px] font-normal text-slate-400">(aktarma hattı)</span>
              )}
            </a>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`flex items-center justify-end gap-1 text-xs font-medium ${late && !yolda ? 'text-red-600' : 'text-slate-500'}`}
          >
            {late && !yolda && <AlertTriangle size={12} />}
            <Clock size={12} /> {mins} dk
          </p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{formatTL(order.toplam)}</p>
          {order.odemeTipi && (
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{order.odemeTipi}</p>
          )}
        </div>
      </div>

      {/* ROZETLER ŞERİDİ */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        {appOrder && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${theme.badge}`}>
            <Smartphone size={11} /> {KAYNAK_LABELS[order.paketKaynak]}
          </span>
        )}
        {needsConfirm && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            ⚡ YENİ
          </span>
        )}
        {onceden ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CreditCard size={11} /> Önceden Ödendi
          </span>
        ) : (
          yolda && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              💵 Kapıda Ödeme
            </span>
          )
        )}
        {yolda && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
            <Truck size={11} /> Yolda{order.kuryeAd ? ` · ${order.kuryeAd}` : ''}
          </span>
        )}
        {platformDelivery && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${theme.badge}`}>
            🛵 {platformKuryeAd(order)}
          </span>
        )}
      </div>

      {/* Adres MASKELİ (platform kendi kuryesiyle teslim ediyor) → çöp metin yerine açıklama */}
      {maskeliAdres && (
        <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs leading-snug text-slate-600">
            🛵 <strong>Adres gizli</strong> — {platformAd(order) || 'Platform'} kendi kuryesiyle
            teslim ediyor, müşteri adresini paylaşmıyor.
          </p>
          {order.musteriNotu && (
            <p className="mt-2 rounded-md bg-white px-2 py-1 text-xs italic text-slate-700">
              <StickyNote size={11} className="mr-1 inline" />
              {order.musteriNotu}
            </p>
          )}
        </div>
      )}

      {/* ADRES BLOĞU — harita butonu sadece kuryede gösterilir */}
      {order.musteriAdres && !maskeliAdres && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="line-clamp-2 text-xs leading-snug text-amber-900">
            <span className="mr-1">📍</span>
            {order.musteriAdres}
          </p>
          {order.musteriNotu && (
            <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs italic text-slate-700">
              <StickyNote size={11} className="mr-1 inline" />
              {order.musteriNotu}
            </p>
          )}
        </div>
      )}

      {/* ÜRÜNLER — boşluğu doldurur, böylece aksiyonlar dibe yapışır */}
      <div className="flex-1 border-t border-slate-100 px-4 py-3">
        <ItemList items={order.items} />
      </div>

      {/* AKSİYONLAR — kartın dibinde sabit */}
      <div className="mt-auto border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        {needsConfirm ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 active:scale-95"
            >
              <Check size={15} /> Kabul Et
            </button>
            <button
              onClick={onReject}
              disabled={!canReject}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              title={canReject ? '' : 'Reddetme yetkisi yok'}
            >
              <X size={15} /> Reddet
            </button>
          </div>
        ) : !yolda ? (
          // Sipariş henüz yola çıkmadı — önce düzenleme (ürün ekle/çıkar), sonra "Yola Çıkar".
          // Platform için kurye seçim modalı açılmıyor (handleYolaCikar içinde bypass var)
          <div className="space-y-2">
            {onDuzenle && !order.posentegraPid && (
              <button
                onClick={onDuzenle}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 active:scale-95"
              >
                <Plus size={15} /> Sipariş Ekle / Düzenle
              </button>
            )}
            {/* Yola Çıkar — tüm paketlerde, mevcut kurye atama akışı */}
            <button
              onClick={onYolaCikar}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-700 active:scale-95"
            >
              <Send size={15} /> Yola Çıkar
            </button>
            {/* Ödeme Al — sadece Dış Paket (Paket Servis) siparişlerinde, normal ödeme akışı */}
            {disPaket && canPay && (
              <button
                onClick={onManuelPay}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 active:scale-95"
              >
                <CreditCard size={15} /> Ödeme Al
              </button>
            )}
          </div>
        ) : platformDelivery ? (
          // Yola çıktı + platform kuryesi → pasif gösterge + canlı sayaç + manuel kapat butonu
          <div className="space-y-2">
            <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
              🛵 {platformKuryeAd(order)} Teslim Ediyor
              {order.masayaGittiZamani && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-xs text-amber-900 tabular-nums">
                  <Clock size={11} />
                  <LiveTimer from={order.masayaGittiZamani} />
                </span>
              )}
            </div>
            {canPay && (
              <button
                onClick={onAppPaid}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 active:scale-95"
                title={`${platformAd(order) || 'Platform'} uygulamasından teslim edildi gördüysen tıkla`}
              >
                <Check size={13} /> Teslim Edildi · Siparişi Kapat
              </button>
            )}
          </div>
        ) : canPay ? (
          onceden ? (
            // Önceden ödenmiş (app içi) — para zaten alınmış, tek aksiyon: tamamla
            <button
              onClick={onAppPaid}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 active:scale-95"
            >
              <Check size={15} /> Teslim Edildi · Siparişi Kapat
            </button>
          ) : (
            // Kapıda ödeme — kurye teslim edince sipariş otomatik düşer, sadece durum gösterimi
            <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-50 px-4 py-2.5 text-sm font-semibold text-purple-700">
              <Truck size={15} /> Kurye Yolda
              {order.masayaGittiZamani && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-xs tabular-nums">
                  <Clock size={11} />
                  <LiveTimer from={order.masayaGittiZamani} />
                </span>
              )}
            </div>
          )
        ) : (
          <p className="rounded-lg bg-purple-50 py-2 text-center text-xs font-medium text-purple-700">
            Yolda · ödeme yetkisi yok
          </p>
        )}

        {/* İPTAL — kabul edilmiş ama teslim edilmeyen/takılı kalan paket siparişleri için.
            Önce platforma bildirilir; ulaşılamazsa (eski sipariş) yerel iptal önerilir.
            İptal edilen sipariş CİROYA GİRMEZ. */}
        {canReject && !needsConfirm && onIptal && (
          <button
            onClick={onIptal}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 active:scale-95"
            title="Siparişi iptal et — ciroya girmez, listeden düşer"
          >
            <X size={13} /> İptal Et
          </button>
        )}
      </div>
    </div>
  );
}

// Onaylanmamış siparişler için yerel sebep listesi — Posentegra'ya gitmediği için ID gerekli değil
const LOCAL_REJECT_REASONS = [
  'Ürün mevcut değil',
  'Kapanış saati geçti',
  'Adres teslimat alanı dışında',
  'Mutfak yoğun',
  'Yanlış sipariş / dublike',
  'Diğer',
];

function PosentegraRejectModal({ order, submitting, onClose, onConfirm }) {
  const [reasons, setReasons] = useState([]);
  const [sebepId, setSebepId] = useState('');
  const [yerelSebep, setYerelSebep] = useState(LOCAL_REJECT_REASONS[0]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [not, setNot] = useState('');

  // Sipariş henüz onaylanmamışsa Posentegra'ya gitmiyoruz, yerel liste yeterli
  const onaylanmis = !!order?.posentegraOnayli;

  useEffect(() => {
    if (!order) return;
    setNot('');
    setSebepId('');
    setHata(null);
    setYerelSebep(LOCAL_REJECT_REASONS[0]);
    if (!onaylanmis) return; // onaylanmamış → reasons çağrısı yapma
    setYukleniyor(true);
    fetchPosentegraReasons(order.id)
      .then((list) => {
        setReasons(list || []);
        const first = list?.[0];
        if (first) setSebepId(first.id || first._id || '');
      })
      .catch((err) => {
        console.error('[posentegraReasons] hata', err);
        setHata(err.message || 'Sebepler yüklenemedi');
      })
      .finally(() => setYukleniyor(false));
  }, [order, onaylanmis]);

  if (!order) return null;
  const seciliSebep = reasons.find((r) => (r.id || r._id) === sebepId);
  const submitDisabled = onaylanmis
    ? submitting || !sebepId || yukleniyor
    : submitting || !yerelSebep;

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
            onClick={() =>
              onaylanmis
                ? onConfirm(sebepId, not, seciliSebep?.name)
                : onConfirm('', not, yerelSebep)
            }
            disabled={submitDisabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <X size={14} /> {submitting ? 'Reddediliyor…' : 'Reddet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ Bu sipariş <strong>{platformAd(order) || 'Posentegra'}</strong> üzerinde de iptal
          edilir. Müşteriye iptal bildirimi gider.
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Sebep</label>
          {onaylanmis ? (
            yukleniyor ? (
              <div className="input flex items-center text-slate-500">
                Sebepler yükleniyor…
              </div>
            ) : hata ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                ⚠ {hata}
              </div>
            ) : reasons.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                Sebep listesi boş döndü. Posentegra paneline bakman gerekebilir.
              </div>
            ) : (
              <select
                value={sebepId}
                onChange={(e) => setSebepId(e.target.value)}
                className="input"
              >
                {reasons.map((r) => {
                  const id = r.id || r._id;
                  const name = r.name || r.title || r.label || id;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            )
          ) : (
            <select
              value={yerelSebep}
              onChange={(e) => setYerelSebep(e.target.value)}
              className="input"
            >
              {LOCAL_REJECT_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
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

// Google Maps yol tarifi linki — GPS varsa kesin koordinat, yoksa adres metni
function mapsUrl(order) {
  const k = order?.musteriKonum;
  if (k?.lat != null && k?.lon != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${k.lat},${k.lon}`;
  }
  const adres = order?.musteriAdres || '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adres)}`;
}

function KuryeSelectModal({ order, kuryeler, onClose, onSelect }) {
  if (!order) return null;
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`${order.musteriAd || 'Paket'} → Hangi kurye?`}
      size="sm"
      footer={
        <button onClick={onClose} className="btn-secondary">İptal</button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Bu paketi teslim edecek kuryeyi seç. Kurye girişinde sadece kendi siparişlerini görür.
        </p>
        <div className="space-y-2">
          {kuryeler.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Aktif kurye yok. Önce admin'den kurye tanımla.
            </p>
          ) : (
            kuryeler.map((k) => (
              <button
                key={k.id}
                onClick={() => onSelect(k)}
                className="flex w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50 active:scale-95"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                    {k.ad?.[0]?.toUpperCase() || 'K'}
                  </span>
                  <span className="font-semibold text-slate-900">{k.ad}</span>
                </span>
                <Send size={18} className="text-blue-500" />
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function KuryeOrderCard({ order, onTeslim }) {
  const mins = minutesSince(order.olusturmaZamani);
  const onceden = !!order.oncedenOdendi;
  const theme = PLATFORM_THEME[order.paketKaynak] || PLATFORM_THEME.diger;

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Üst aksent şeridi — platform rengi */}
      <div className={`h-1 w-full ${theme.accent}`} />

      {/* HEADER: müşteri adı + tutar */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold leading-tight text-slate-900">
            {order.musteriAd || 'Paket'}
          </h3>
          {order.musteriTel && (
            <a
              href={`tel:${order.musteriTel}`}
              className="mt-0.5 inline-block text-sm font-semibold text-blue-600 hover:underline"
            >
              📞 {order.musteriTel}
            </a>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1 text-xs font-medium text-slate-500">
            <Clock size={12} /> {mins} dk
          </p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{formatTL(order.toplam)}</p>
        </div>
      </div>

      {/* ROZETLER ŞERİDİ */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        {platformAd(order) && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${theme.badge}`}>
            <Smartphone size={11} /> {platformAd(order)}
          </span>
        )}
        {onceden ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CreditCard size={11} /> Önceden Ödendi
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            💵 Kapıda Ödeme
          </span>
        )}
      </div>

      {/* ADRES BLOĞU + HARİTA (sadece kurye) */}
      {order.musteriAdres && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-sm leading-snug text-amber-900">
            <span className="mr-1">📍</span>
            {order.musteriAdres}
          </p>
          {order.musteriNotu && (
            <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs italic text-slate-700">
              <StickyNote size={11} className="mr-1 inline" />
              {order.musteriNotu}
            </p>
          )}
          <a
            href={mapsUrl(order)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
          >
            🗺️ Haritada Göster
          </a>
        </div>
      )}

      {/* ÜRÜNLER — boşluğu doldurur, böylece aksiyon dibe yapışır */}
      <div className="flex-1 border-t border-slate-100 px-4 py-3">
        <ItemList items={order.items} />
      </div>

      {/* AKSİYON — kartın dibinde sabit */}
      <div className="mt-auto border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <button
          onClick={onTeslim}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-base font-bold text-white shadow hover:bg-emerald-700 active:scale-95"
        >
          <Check size={18} /> Teslim Ettim
        </button>
      </div>
    </div>
  );
}

function KuryeTeslimModal({ order, onClose, onConfirm }) {
  const [yontem, setYontem] = useState(null);
  useEffect(() => {
    if (order) {
      // Önceden ödendiyse default 'uygulama', değilse 'nakit'
      setYontem(order.oncedenOdendi ? 'uygulama' : 'nakit');
    }
  }, [order]);
  if (!order) return null;
  const onceden = !!order.oncedenOdendi;
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`${order.musteriAd || 'Paket'} — Teslim Et`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Vazgeç</button>
          <button
            onClick={() => yontem && onConfirm(yontem)}
            disabled={!yontem}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check size={16} /> Onayla ({formatTL(order.toplam)})
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={`rounded-lg p-3 text-sm ${onceden ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          {onceden ? (
            <>
              ✓ Bu sipariş <strong>{platformAd(order)}</strong> üzerinden{' '}
              <strong>önceden ödenmiş</strong>. Müşteriden para almıyorsun, sadece teslim et.
            </>
          ) : (
            <>
              💰 Müşteriden <strong>{formatTL(order.toplam)}</strong> tahsil et.{' '}
              Hangi yöntemle aldıysan aşağıdan seç. Nakit aldıysan restorana dönünce kasiyere teslim et.
            </>
          )}
        </div>

        {!onceden && (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Ödeme Yöntemi</label>
            <div className="grid grid-cols-3 gap-2">
              <YontemButton
                active={yontem === 'nakit'}
                icon="💵"
                label="Nakit"
                onClick={() => setYontem('nakit')}
              />
              <YontemButton
                active={yontem === 'kart'}
                icon="💳"
                label="Kart"
                onClick={() => setYontem('kart')}
              />
              <YontemButton
                active={yontem === 'yemekKarti'}
                icon="🍴"
                label="Yemek Kartı"
                onClick={() => setYontem('yemekKarti')}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function YontemButton({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border-2 py-3 text-xs font-semibold transition ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      {label}
    </button>
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
