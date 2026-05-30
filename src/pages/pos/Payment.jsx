import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wallet,
  CreditCard,
  UtensilsCrossed,
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  Printer,
  Megaphone,
  Tag,
  X,
  Check,
  List,
  LayoutGrid,
  Gift,
} from 'lucide-react';
import { watchDoc, watchCollection, patchDoc } from '../../firebase/firestore';
import { formatTL, minutesSince, formatAdet } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { recordPayment } from '../../firebase/payments';
import {
  awardLoyaltyPoints,
  adjustLoyaltyPoints,
  computeEarnedPoints,
  normalizePhone,
} from '../../firebase/customers';
import { pickBestDiscount, isCouponValid, isCampaignActive } from '../../utils/discount';
import {
  computeOrderTotals,
  toKurus,
  fromKurus,
  applyDiscountRatio,
  remainingQty,
} from '../../utils/paymentMath';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import ReceiptPreview from '../../components/ReceiptPreview';
import CardPaymentModal from '../../components/CardPaymentModal';
import SplitReceiptModal from '../../components/SplitReceiptModal';
import PaymentSummaryModal from '../../components/PaymentSummaryModal';
import { pushToCustomerDisplay } from '../../plugins/customerDisplay';

const YEMEK_KARTI_TIPLERI = ['Multinet', 'Sodexo', 'Ticket', 'Setcard', 'Edenred', 'Metropol', 'Diğer'];

export default function Payment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const { user, profile, rol } = useAuthStore();
  const { settings } = useSettingsStore();
  const [order, setOrder] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [payments, setPayments] = useState([]); // [{yontem, tutar, kartTipi?}]
  const [fisBas, setFisBas] = useState(settings.otomatikFisBas !== false);
  const [submitting, setSubmitting] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [change, setChange] = useState(0);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [manualDiscount, setManualDiscount] = useState(null); // { tipi: 'yuzde'|'sabit', deger:number, aciklama:string }
  const [manualDiscountModal, setManualDiscountModal] = useState(false);
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null); // sadakat müşteri doc'u
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(null); // { puan, tl } kullanılan puan

  const [cashModal, setCashModal] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [mealModal, setMealModal] = useState(false);

  // Madde 5+6: Ürün-bazlı ödeme. Her item için adet-tabanlı durum:
  //   { selectedQty, ikramQty, paidQty }
  // selectedQty + ikramQty + paidQty <= item.adet (totalQty)
  const [itemStates, setItemStates] = useState([]);

  // Ödenmiş ürünleri listeden gizle/göster
  const [showPaid, setShowPaid] = useState(false);

  // Network yazıcı tercihi
  const [networkPrinters, setNetworkPrinters] = useState([]);
  useEffect(() => watchCollection('printers', setNetworkPrinters), []);
  const activePrinter = networkPrinters.find((p) => p.aktif && p.ip);
  // Liste / Kutular görünüm tercihi (cihaz başına saklı)
  const [itemViewMode, setItemViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    return localStorage.getItem('syntrixpos.paymentItemView') || 'list';
  });
  const setViewMode = (mode) => {
    setItemViewMode(mode);
    try { localStorage.setItem('syntrixpos.paymentItemView', mode); } catch {}
  };

  useEffect(() => {
    if (order?.items && order.items.length > 0 && itemStates.length !== order.items.length) {
      // Order ilk yüklendiğinde her item için default state oluştur
      setItemStates(
        order.items.map((it) => ({
          selectedQty: 0,
          // Tüm satır ikram işaretliyse (önceki kayıt) ikramQty=totalQty say
          ikramQty: it.ikram ? Number(it.adet) || 0 : 0,
          paidQty: 0,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items?.length]);

  /**
   * Belirli satırdan ne kadar seçim yapacağını ayarlar.
   * mode='inc' (+1), 'dec' (-1), 'all' (kalan tüm), 'clear' (0), 'toggle' (none→all veya all→0)
   * Yarım porsiyonlu (non-integer adet) satırlar atomik: ya 0 ya hepsi.
   */
  const adjustSelectedQty = (i, mode) => {
    setItemStates((arr) => {
      const next = [...arr];
      const it = order.items[i];
      if (!it) return arr;
      const totalQty = Number(it.adet) || 0;
      const s = next[i] || { selectedQty: 0, ikramQty: 0, paidQty: 0 };
      const rem = remainingQty(totalQty, s);
      const isAtomic = !Number.isInteger(totalQty); // 1.5 vs gibi

      let newSel = s.selectedQty;
      if (mode === 'inc') {
        if (isAtomic) newSel = totalQty - s.ikramQty - s.paidQty; // tümü
        else newSel = Math.min(s.selectedQty + 1, s.selectedQty + rem);
      } else if (mode === 'dec') {
        newSel = Math.max(0, s.selectedQty - 1);
      } else if (mode === 'all') {
        newSel = s.selectedQty + rem;
      } else if (mode === 'clear') {
        newSel = 0;
      } else if (mode === 'toggle') {
        if (s.selectedQty > 0) newSel = 0;
        else newSel = isAtomic ? totalQty - s.ikramQty - s.paidQty : s.selectedQty + rem;
      }
      next[i] = { ...s, selectedQty: newSel };
      return next;
    });
  };

  /**
   * İkram adetini ayarlar. Boş seçim'den (selectedQty) öncelik alır.
   * Tek tık tüm uygun olanları ikram'a alır; tekrar tık kaldırır.
   */
  const toggleItemIkram = (i) => {
    setItemStates((arr) => {
      const next = [...arr];
      const it = order.items[i];
      if (!it) return arr;
      const totalQty = Number(it.adet) || 0;
      const s = next[i] || { selectedQty: 0, ikramQty: 0, paidQty: 0 };

      if (s.ikramQty > 0) {
        // Tümünü kaldır
        next[i] = { ...s, ikramQty: 0 };
      } else {
        // Henüz ödenmemiş tüm adetleri ikram yap
        const availableForIkram = totalQty - s.paidQty;
        next[i] = { ...s, ikramQty: availableForIkram, selectedQty: 0 };
      }
      return next;
    });
  };

  // Parça fiş için açılan slip modal — { items, payment }
  const [splitSlip, setSplitSlip] = useState(null);
  // Ödeme tamamlandıktan sonra gösterilen özet modal
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Birden fazla recordPayment çağrısını engelle
  const [finalized, setFinalized] = useState(false);

  /**
   * Seçili adetleri "ödendi" işaretler ve parça fiş modal'ını açar.
   * Sadece ödenen tutar seçilen net tutarı karşılıyorsa (1 kuruş tolerans).
   */
  const markSelectedAsPaid = (paymentEntry) => {
    const paidKurus = toKurus(paymentEntry.tutar || 0);
    const requiredKurus = totals.selectedNetKurus;
    if (paidKurus + 1 >= requiredKurus) {
      // Hangi item'lardan kaç adet ödendi — parça fiş için (item klonları)
      const justPaidItems = [];
      (order.items || []).forEach((it, i) => {
        const sel = itemStates[i]?.selectedQty || 0;
        if (sel > 0) {
          justPaidItems.push({ ...it, adet: sel });
        }
      });
      // selectedQty → paidQty'ye taşı
      setItemStates((arr) =>
        arr.map((s) => ({
          ...s,
          paidQty: (s.paidQty || 0) + (s.selectedQty || 0),
          selectedQty: 0,
        })),
      );
      if (justPaidItems.length > 0) {
        setSplitSlip({ items: justPaidItems, payment: paymentEntry });
      }
    } else {
      const eksikTL = fromKurus(requiredKurus - paidKurus);
      toast.error(
        `Eksik ödeme — ${formatTL(eksikTL)} daha alın, ürünler ödendi sayılmadı`,
        { duration: 5000 },
      );
    }
  };

  const unmarkPaid = (i) => {
    setItemStates((arr) => {
      const next = [...arr];
      next[i] = { ...next[i], paidQty: 0 };
      return next;
    });
  };

  useEffect(() => {
    if (!orderId) {
      navigate('/pos/tables', { replace: true });
      return;
    }
    return watchDoc('orders', orderId, (data) => {
      if (!data) {
        toast.error('Sipariş bulunamadı');
        navigate('/pos/tables', { replace: true });
        return;
      }
      setOrder(data);
    });
  }, [orderId]);

  useEffect(() => watchCollection('campaigns', setCampaigns), []);
  useEffect(() => watchCollection('coupons', setCoupons), []);

  // Sadakat: paket siparişte müşteri telefonuna göre puan bakiyesini izle
  useEffect(() => {
    if (!settings?.sadakatAktif || !order?.paketMi) {
      setLoyaltyCustomer(null);
      return;
    }
    const id = normalizePhone(order.musteriTel);
    if (!id || id.length < 7) {
      setLoyaltyCustomer(null);
      return;
    }
    return watchDoc('customers', id, setLoyaltyCustomer);
  }, [settings?.sadakatAktif, order?.paketMi, order?.musteriTel]);

  // Müşteri ekranına canlı sipariş + tutar gönder
  useEffect(() => {
    if (!order) return;
    const remainingTL = order.items
      ? itemStates.reduce((sum, s, i) => {
          const it = order.items[i];
          if (!it || !s) return sum;
          const total = Number(it.adet) || 0;
          const consumed = (s.paidQty || 0) + (s.ikramQty || 0);
          const remaining = total - consumed;
          if (remaining <= 0) return sum;
          return sum + (Number(it.fiyat) || 0) * remaining;
        }, 0)
      : 0;
    pushToCustomerDisplay({
      mode: 'payment',
      order: {
        masaAd: order.masaAd,
        items: (order.items || []).map((it, i) => ({
          ad: it.ad,
          adet: it.adet,
          fiyat: it.fiyat,
          notlar: it.notlar,
          ikram: !!(itemStates[i]?.ikramQty > 0),
        })),
        araToplam: order.araToplam,
        indirim: 0, // payment ekranı kendi indirim/manuel discount'unu hesaplar
        toplam: remainingTL > 0 ? remainingTL : (order.toplam || order.araToplam),
      },
      payment: {
        kalan: remainingTL,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items, itemStates]);

  // Auto-finalize useEffect — early return'lerden ÖNCE olmalı (hooks order kuralı).
  // İçinde order/items/itemStates güvenlik kontrolleri var, koşul yetersizse atlar.
  const handleCompleteRef = useRef(null);
  useEffect(() => {
    if (!order || !order.items || finalized || submitting || splitSlip) return;
    if (payments.length === 0 || itemStates.length === 0) return;
    const allConsumed = (order.items || []).every((it, i) => {
      const s = itemStates[i];
      if (!s) return false;
      const total = Number(it.adet) || 0;
      return (s.paidQty || 0) + (s.ikramQty || 0) >= total;
    });
    if (!allConsumed) return;
    const t = setTimeout(() => {
      if (handleCompleteRef.current) handleCompleteRef.current();
    }, 400);
    return () => clearTimeout(t);
  }, [finalized, submitting, splitSlip, payments.length, itemStates, order?.id, handleCompleteRef]);

  if (!['kasiyer', 'admin'].includes(rol)) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Ödeme alma yetkiniz yok. Kasiyer veya admin gerekli.
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Sipariş yükleniyor...
      </div>
    );
  }

  // ── Tüm para hesapları paymentMath.js'te (kuruş-int aritmetik + testli) ──
  // Otomatik indirim hesaplayıcı (kampanya / kupon) — paymentMath'e callback
  const computeAutoDiscount = (subtotalKurus) => {
    const subtotalTL = fromKurus(subtotalKurus);
    const result = pickBestDiscount({
      subtotal: subtotalTL,
      campaigns,
      coupon: appliedCoupon,
    });
    if (!result || result.amount <= 0) return null;
    return {
      amountKurus: toKurus(result.amount),
      label: result.label,
      type: result.type,
      source: result.source,
    };
  };

  const totals = computeOrderTotals({
    items: order.items || [],
    itemStates,
    manualDiscount,
    payments,
    computeAutoDiscount,
  });

  // Display alias'ları — eski kodu az değiştirmek için
  const subtotal = fromKurus(totals.subtotalKurus);
  const ikramTotal = fromKurus(totals.ikramTotalKurus);
  const paidItemsTotal = fromKurus(totals.paidItemsTotalKurus);
  const selectedRawSubtotal = fromKurus(totals.selectedRawSubtotalKurus);
  const selectedSubtotal = fromKurus(totals.selectedNetKurus);
  const effectiveTotal = fromKurus(totals.effectiveTotalKurus);
  const totalPaid = fromKurus(totals.totalPaidKurus);
  const remaining = fromKurus(totals.remainingKurus);
  const isFullyPaid = totals.fullyPaid;
  const discountRatio =
    totals.subtotalKurus > 0 ? totals.effectiveTotalKurus / totals.subtotalKurus : 1;
  const bestDiscount = {
    amount: fromKurus(totals.discount.amountKurus),
    type: totals.discount.type,
    label: totals.discount.label,
    source: totals.discount.source,
  };

  // Inline (useMemo değil) — koşullu erken return'lerden sonra hook çağırmak
  // React hooks kuralını ihlal eder ve beyaz ekrana yol açar.
  const applicableCampaigns = campaigns.filter((c) => isCampaignActive(c, subtotal));

  // Sadakat puanı kullanımı — kullanılabilir puan ve maksimum indirim
  const loyaltyEnabled = !!settings?.sadakatAktif && !!order.paketMi;
  const availablePoints = loyaltyCustomer?.puan || 0;
  const puanTLKarsiligi = Number(settings.puanTLKarsiligi) || 1;
  // subtotal'i aşmayacak kadar puan kullanılabilir
  const maxRedeemablePoints = Math.min(
    availablePoints,
    Math.floor(subtotal / puanTLKarsiligi),
  );

  const applyLoyaltyRedeem = () => {
    if (maxRedeemablePoints <= 0) return;
    const tl = maxRedeemablePoints * puanTLKarsiligi;
    setManualDiscount({
      tipi: 'sabit',
      deger: tl,
      aciklama: `Sadakat puanı (${maxRedeemablePoints} puan)`,
    });
    setLoyaltyRedeem({ puan: maxRedeemablePoints, tl });
  };

  const clearManualDiscount = () => {
    setManualDiscount(null);
    setLoyaltyRedeem(null);
  };

  const applyCouponCode = () => {
    if (!couponInput.trim()) return;
    const kod = couponInput.trim().toUpperCase();
    const found = coupons.find((c) => c.kod === kod);
    if (!found) {
      toast.error('Kupon bulunamadı');
      return;
    }
    if (!isCouponValid(found, subtotal)) {
      if (found.sonGecerlilik) {
        const today = new Date().toISOString().slice(0, 10);
        if (today > found.sonGecerlilik) {
          toast.error('Kupon süresi dolmuş');
          return;
        }
      }
      if (found.maxKullanim > 0 && (found.kullanilan || 0) >= found.maxKullanim) {
        toast.error('Kupon kullanım limiti dolmuş');
        return;
      }
      if (found.minTutar > 0 && subtotal < found.minTutar) {
        toast.error(`Min sepet tutarı: ${formatTL(found.minTutar)}`);
        return;
      }
      if (!found.aktif) {
        toast.error('Kupon aktif değil');
        return;
      }
      toast.error('Kupon kullanılamıyor');
      return;
    }
    setAppliedCoupon(found);
    toast.success(`Kupon eklendi: ${found.kod}`);
    setCouponInput('');
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
  };

  const addPayment = (entry) => {
    setPayments((arr) => [...arr, entry]);
  };

  const removePayment = (idx) => {
    setPayments((arr) => arr.filter((_, i) => i !== idx));
  };

  const handleComplete = async () => {
    if (finalized || submitting) return; // Double-click koruması
    if (payments.length === 0) {
      toast.error('Ödeme yöntemi seçin');
      return;
    }
    if (!isFullyPaid) {
      toast.error(`Eksik ödeme: ${formatTL(remaining)} kaldı`);
      return;
    }
    setSubmitting(true);
    setFinalized(true); // Erken işaretle — duplicate çağrıları engelle
    try {
      // Madde 5+6: ikramQty > 0 olan item'lar varsa order doc'unu güncelle.
      // Tüm satır ikram ise eski `ikram: true` flag'i, kısmi ise `ikramQty`.
      const hasIkram = itemStates.some((s) => (s?.ikramQty || 0) > 0);
      if (hasIkram) {
        const updatedItems = order.items.map((it, i) => {
          const ikramQty = itemStates[i]?.ikramQty || 0;
          const total = Number(it.adet) || 0;
          if (ikramQty === 0) return it;
          if (ikramQty >= total) {
            return { ...it, ikram: true, ikramQty };
          }
          return { ...it, ikramQty };
        });
        await patchDoc('orders', order.id, {
          items: updatedItems,
          araToplam: subtotal, // ikram düşülmüş hali (paymentMath'ten geldi)
        });
      }

      let discountPayload = null;
      if (bestDiscount.amount > 0 && bestDiscount.source) {
        if (bestDiscount.type === 'kampanya') {
          discountPayload = {
            type: 'kampanya',
            kampanyaId: bestDiscount.source.id,
            kampanyaAd: bestDiscount.source.ad,
            amount: bestDiscount.amount,
          };
        } else if (bestDiscount.type === 'manuel') {
          discountPayload = {
            type: 'manuel',
            tipi: manualDiscount.tipi,
            deger: Number(manualDiscount.deger),
            aciklama: manualDiscount.aciklama || '',
            amount: bestDiscount.amount,
          };
        } else {
          discountPayload = {
            type: 'kupon',
            kuponId: bestDiscount.source.id,
            kuponKod: bestDiscount.source.kod,
            amount: bestDiscount.amount,
          };
        }
      }

      const result = await recordPayment({
        orderId: order.id,
        kasiyerId: user.uid,
        kasiyerAd: profile?.ad || 'Kasiyer',
        payments: payments.map((p) => ({
          tutar: p.tutar,
          yontem: p.yontem,
          kartTipi: p.kartTipi || null,
        })),
        fisBasildi: fisBas,
        discount: discountPayload,
      });
      setChange(result.change);
      toast.success('Ödeme tamamlandı');

      // Sadakat: kullanılan puanı düş + yeni puan kazandır (sessiz, akışı bozmaz)
      if (settings?.sadakatAktif && order.paketMi && order.musteriTel) {
        if (loyaltyRedeem?.puan > 0) {
          adjustLoyaltyPoints({ tel: order.musteriTel, delta: -loyaltyRedeem.puan }).catch((e) =>
            console.warn('Puan düşülemedi:', e),
          );
        }
        const earned = computeEarnedPoints(result.effectiveTotal, settings);
        if (earned > 0) {
          awardLoyaltyPoints({ tel: order.musteriTel, tutar: result.effectiveTotal, settings })
            .then(() => toast.success(`+${earned} sadakat puanı`))
            .catch((e) => console.warn('Puan eklenemedi:', e));
        }
      }
      // Müşteri ekranına "teşekkürler" + para üstü
      pushToCustomerDisplay({
        mode: 'thanks',
        payment: { paraUstu: result.change || 0 },
      });
      // Ödeme özeti modal'ını aç — kullanıcı "Masalara Dön" deyince navigate
      setSummaryOpen(true);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('zaten') || msg.includes('tamamlandi') || msg.includes('completed')) {
        // Sipariş zaten kapalı — masalar'a sessizce dön (silinmiş veya başka cihazdan kapanmış)
        toast('Bu sipariş zaten tamamlanmış, masalar ekranına dönülüyor.', { icon: 'ℹ️' });
        navigate('/pos/tables');
      } else {
        toast.error(msg);
        setFinalized(false); // hatadan sonra yeniden denenebilsin
      }
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const closeReceipt = () => {
    setReceiptOpen(false);
    navigate('/pos/tables');
  };

  const closeSummary = () => {
    setSummaryOpen(false);
    pushToCustomerDisplay({ mode: 'idle' });
    navigate('/pos/tables');
  };

  // handleComplete'ı ref'e bağla — auto-finalize useEffect (yukarıda, erken return'lerden ÖNCE)
  // buradan çağırır. Direkt çağrı erken return'ler nedeniyle hooks order'ı bozardı.
  handleCompleteRef.current = handleComplete;

  return (
    <div className="flex h-full">
      {/* Sol panel: Sipariş özeti */}
      <div className="flex flex-1 flex-col overflow-y-auto bg-white p-6">
        <button onClick={() => navigate(-1)} className="btn-ghost mb-3 self-start text-sm">
          <ArrowLeft size={14} /> Geri
        </button>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">{order.masaAd || 'Paket Sipariş'}</h1>
          <p className="text-sm text-slate-500">
            Garson: {order.garsonAd} · Süre: {minutesSince(order.olusturmaZamani)} dk
          </p>
        </div>

        <div className="mb-4">
          {/* Başlık + view toggle */}
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold uppercase tracking-wider text-slate-600">
                Sipariş İçeriği
              </h3>
              <p className="text-xs text-slate-500">
                Müşterinin yediklerine dokun → ödeme yöntemini seç
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${
                  itemViewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
                title="Liste görünümü"
              >
                <List size={14} /> Liste
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${
                  itemViewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
                title="Kutular görünümü"
              >
                <LayoutGrid size={14} /> Kutular
              </button>
            </div>
          </div>

          {/* Ödenenleri gizleme toggle'ı — bir veya daha fazla satır tamamen ödendiyse */}
          {(() => {
            const fullyPaidCount = (order.items || []).filter((it, i) => {
              const s = itemStates[i];
              if (!s) return false;
              const total = Number(it.adet) || 0;
              return (s.paidQty || 0) + (s.ikramQty || 0) >= total && total > 0;
            }).length;
            if (fullyPaidCount === 0) return null;
            return (
              <button
                onClick={() => setShowPaid((v) => !v)}
                className="mb-2 flex w-full items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
              >
                <span className="flex items-center gap-2">
                  <Check size={14} />
                  <strong>{fullyPaidCount} satır tamamen ödendi/ikram</strong>
                  <span className="text-xs text-emerald-600">
                    · {formatTL(paidItemsTotal)}
                  </span>
                </span>
                <span className="text-xs font-medium">
                  {showPaid ? 'Gizle' : 'Göster'}
                </span>
              </button>
            );
          })()}

          {/* Ürün listesi — tamamen ödenmiş/ikram olan satırları gizle */}
          {(() => {
            const visibleIndices = order.items
              .map((_, i) => i)
              .filter((i) => {
                if (showPaid) return true;
                const s = itemStates[i];
                if (!s) return true;
                const total = Number(order.items[i].adet) || 0;
                const consumed = (s.paidQty || 0) + (s.ikramQty || 0);
                return consumed < total; // hala seçilebilir adet var
              });

            if (visibleIndices.length === 0) {
              return (
                <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center">
                  <Check size={32} className="mx-auto mb-2 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-700">
                    Tüm ürünler ödendi
                  </p>
                  <p className="mt-1 text-xs text-emerald-600">
                    Aşağıdaki "ÖDEMEYİ TAMAMLA" butonuna basın
                  </p>
                </div>
              );
            }

            return itemViewMode === 'list' ? (
              <div className="space-y-2">
                {visibleIndices.map((idx) => (
                  <ItemRowList
                    key={idx}
                    item={order.items[idx]}
                    state={itemStates[idx] || {}}
                    onAdjustSelect={(mode) => adjustSelectedQty(idx, mode)}
                    onIkram={() => toggleItemIkram(idx)}
                    onUnpay={() => unmarkPaid(idx)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {visibleIndices.map((idx) => (
                  <ItemCard
                    key={idx}
                    item={order.items[idx]}
                    state={itemStates[idx] || {}}
                    onAdjustSelect={(mode) => adjustSelectedQty(idx, mode)}
                    onIkram={() => toggleItemIkram(idx)}
                    onUnpay={() => unmarkPaid(idx)}
                  />
                ))}
              </div>
            );
          })()}

          {/* Alt özet */}
          {(paidItemsTotal > 0 || ikramTotal > 0) && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 text-sm">
              {paidItemsTotal > 0 && (
                <span className="text-emerald-700">
                  ✓ Ödenen: <strong className="tabular-nums">{formatTL(paidItemsTotal)}</strong>
                </span>
              )}
              {ikramTotal > 0 && (
                <span className="text-amber-700">
                  🎁 İkram: <strong className="tabular-nums">{formatTL(ikramTotal)}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* İndirim paneli */}
        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            <Megaphone size={12} />
            <span>Kampanya / Kupon</span>
          </div>

          {applicableCampaigns.length > 0 && bestDiscount.type === 'kampanya' && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
              <Check size={12} />
              <span>
                <strong>{bestDiscount.label}</strong> otomatik uygulandı (
                {formatTL(bestDiscount.amount)})
              </span>
            </div>
          )}

          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
              <span className="flex items-center gap-1">
                <Tag size={12} />
                <code className="font-mono font-bold">{appliedCoupon.kod}</code>
                {bestDiscount.type === 'kupon' && (
                  <span>· {formatTL(bestDiscount.amount)} uygulanıyor</span>
                )}
                {bestDiscount.type === 'kampanya' && (
                  <span className="text-slate-500">· kampanya daha avantajlı</span>
                )}
              </span>
              <button onClick={removeCoupon} className="rounded p-0.5 hover:bg-blue-100">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && applyCouponCode()}
                placeholder="KUPON KODU"
                className="input flex-1 font-mono uppercase tracking-wider"
              />
              <button onClick={applyCouponCode} className="btn-secondary text-sm">
                Uygula
              </button>
            </div>
          )}

          {applicableCampaigns.length > 0 && !appliedCoupon && bestDiscount.type !== 'kampanya' && !manualDiscount && (
            <p className="mt-1 text-xs text-slate-500">
              Geçerli kampanya: {applicableCampaigns.map((c) => c.ad).join(', ')}
            </p>
          )}

          {/* Manuel indirim — kampanya/kupon yerine geçer */}
          <div className="mt-3 border-t border-slate-100 pt-2">
            {manualDiscount ? (
              <div className="flex items-center justify-between rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                <span className="flex items-center gap-1">
                  <Tag size={12} />
                  <strong>Manuel İndirim:</strong>
                  {manualDiscount.tipi === 'yuzde'
                    ? ` %${manualDiscount.deger}`
                    : ` ${manualDiscount.deger} TL`}
                  <span className="ml-1 text-amber-600">
                    (- {formatTL(bestDiscount.amount)})
                  </span>
                  {manualDiscount.aciklama && (
                    <span className="ml-1 italic text-amber-700">— {manualDiscount.aciklama}</span>
                  )}
                </span>
                <button onClick={clearManualDiscount} className="rounded p-0.5 hover:bg-amber-100">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setManualDiscountModal(true)}
                className="w-full rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              >
                + Manuel İndirim Ekle
              </button>
            )}
            {(applicableCampaigns.length > 0 || appliedCoupon) && !manualDiscount && (
              <p className="mt-1 text-[10px] text-slate-400">
                Manuel indirim eklersen kampanya/kupon devre dışı kalır.
              </p>
            )}
          </div>

          {/* Sadakat puanı kullanımı */}
          {loyaltyEnabled && availablePoints > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              {loyaltyRedeem ? (
                <div className="flex items-center justify-between rounded-md bg-purple-50 px-2 py-1.5 text-xs text-purple-800">
                  <span className="flex items-center gap-1">
                    <Gift size={12} />
                    <strong>{loyaltyRedeem.puan} puan kullanıldı</strong>
                    <span className="ml-1 text-purple-600">(- {formatTL(loyaltyRedeem.tl)})</span>
                  </span>
                  <button onClick={clearManualDiscount} className="rounded p-0.5 hover:bg-purple-100">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={applyLoyaltyRedeem}
                  disabled={maxRedeemablePoints <= 0}
                  className="flex w-full items-center justify-between rounded-md border border-dashed border-purple-300 px-2 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1">
                    <Gift size={12} /> Puan Kullan ({availablePoints} puan)
                  </span>
                  {maxRedeemablePoints > 0 && (
                    <span>- {formatTL(maxRedeemablePoints * puanTLKarsiligi)}</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 rounded-lg bg-slate-50 p-4">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Ara Toplam</span>
            <span className="tabular-nums">{formatTL(subtotal)}</span>
          </div>
          {bestDiscount.amount > 0 && (
            <div className="flex justify-between text-sm text-emerald-700">
              <span>İndirim ({bestDiscount.label})</span>
              <span className="tabular-nums">- {formatTL(bestDiscount.amount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-2xl font-bold text-slate-900">
            <span>TOPLAM</span>
            <span className="tabular-nums">{formatTL(effectiveTotal)}</span>
          </div>
        </div>

        {payments.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
              Alınan Ödemeler
            </div>
            <ul className="divide-y divide-slate-100">
              {payments.map((p, idx) => (
                <li key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {p.yontem === 'nakit' && '💵 Nakit'}
                    {p.yontem === 'kart' && '💳 Kart'}
                    {p.yontem === 'yemekKarti' && `🍴 ${p.kartTipi}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatTL(p.tutar)}</span>
                    <button
                      onClick={() => removePayment(idx)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span>Toplam Alınan:</span>
                <span className="font-semibold tabular-nums">{formatTL(totalPaid)}</span>
              </div>
              {remaining > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Kalan:</span>
                  <span className="font-semibold tabular-nums">{formatTL(remaining)}</span>
                </div>
              )}
              {totalPaid > effectiveTotal && (
                <div className="flex justify-between text-emerald-600">
                  <span>Para Üstü:</span>
                  <span className="font-semibold tabular-nums">
                    {formatTL(totalPaid - effectiveTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4">
          <label className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Printer size={16} /> Fişi Bas
            </span>
            <Toggle checked={fisBas} onChange={setFisBas} />
          </label>
          <button
            onClick={handleComplete}
            disabled={!isFullyPaid || submitting || finalized}
            className="btn-primary w-full py-3 text-lg disabled:opacity-50"
          >
            {finalized
              ? 'Tamamlandı'
              : submitting
                ? 'Tamamlanıyor...'
                : isFullyPaid
                  ? 'ÖDEMEYİ TAMAMLA'
                  : `Kalan: ${formatTL(remaining)}`}
          </button>
        </div>
      </div>

      {/* Sağ panel: Ödeme yöntemleri */}
      <aside className="flex w-96 flex-col gap-3 border-l border-slate-200 bg-slate-100 p-4">
        <h2 className="text-sm font-semibold uppercase text-slate-500">Ödeme Yöntemi</h2>

        {/* Seçilen tutar göstergesi */}
        {selectedSubtotal > 0 ? (
          <div className="rounded-lg bg-blue-600 p-4 text-white shadow-lg">
            <p className="text-xs uppercase tracking-wider text-blue-100">Seçilen Tutar</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{formatTL(selectedSubtotal)}</p>
            {bestDiscount.amount > 0 && discountRatio < 1 && (
              <p className="mt-0.5 text-xs text-blue-100">
                <span className="line-through">{formatTL(selectedRawSubtotal)}</span>
                {' · '}
                {bestDiscount.label} payı
              </p>
            )}
            <p className="mt-1 text-xs text-blue-100">
              Aşağıdaki butonla ödeme yöntemini seç
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-white p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">İpucu</p>
            <p>
              Soldaki listeden müşterinin yediği ürünleri <strong>işaretle</strong> →
              tutar burada görünecek → Nakit/Kart ile öde.
            </p>
          </div>
        )}

        <PaymentButton
          color="emerald"
          icon={Wallet}
          label="NAKİT"
          onClick={() => setCashModal(true)}
          disabled={isFullyPaid}
        />
        <PaymentButton
          color="blue"
          icon={CreditCard}
          label="KART"
          onClick={() => setCardModal(true)}
          disabled={isFullyPaid}
        />
        <PaymentButton
          color="amber"
          icon={UtensilsCrossed}
          label="YEMEK KARTI"
          onClick={() => setMealModal(true)}
          disabled={isFullyPaid}
        />

        <div className="mt-auto rounded-lg bg-white p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">Bölünmüş Ödeme</p>
          <p>Önce ürünleri seç → ödeme yöntemini seç. Diğer müşteri için tekrarla.</p>
        </div>
      </aside>

      <CashModal
        open={cashModal}
        onClose={() => setCashModal(false)}
        remaining={selectedSubtotal > 0 ? selectedSubtotal : remaining}
        onAdd={(tutar) => {
          const entry = { yontem: 'nakit', tutar };
          addPayment(entry);
          markSelectedAsPaid(entry);
          setCashModal(false);
        }}
      />
      <CardPaymentModal
        open={cardModal}
        onClose={() => setCardModal(false)}
        remaining={selectedSubtotal > 0 ? selectedSubtotal : remaining}
        provider={settings.cardPaymentProvider || 'simulation'}
        terminalIp={settings.cardTerminalIp}
        onApproved={(tutar, result) => {
          const entry = {
            yontem: 'kart',
            tutar,
            kartTipi: result?.cardType,
            onayKodu: result?.approvalCode,
            mod: result?.mode,
          };
          addPayment(entry);
          markSelectedAsPaid(entry);
          setCardModal(false);
        }}
      />
      <MealCardModal
        open={mealModal}
        onClose={() => setMealModal(false)}
        remaining={selectedSubtotal > 0 ? selectedSubtotal : remaining}
        onAdd={(tutar, kartTipi) => {
          const entry = { yontem: 'yemekKarti', tutar, kartTipi };
          addPayment(entry);
          markSelectedAsPaid(entry);
          setMealModal(false);
        }}
      />

      <ManualDiscountModal
        open={manualDiscountModal}
        onClose={() => setManualDiscountModal(false)}
        subtotal={subtotal}
        onApply={(disc) => {
          setManualDiscount(disc);
          setLoyaltyRedeem(null);
          setManualDiscountModal(false);
        }}
      />

      <ReceiptPreview
        open={receiptOpen}
        onClose={closeReceipt}
        order={order}
        payments={payments}
        settings={settings}
        change={change}
      />

      <SplitReceiptModal
        open={!!splitSlip}
        onClose={() => setSplitSlip(null)}
        order={order}
        items={splitSlip?.items}
        payment={splitSlip?.payment}
        settings={settings}
        activePrinter={activePrinter}
      />

      <PaymentSummaryModal
        open={summaryOpen}
        onClose={closeSummary}
        order={order}
        payments={payments}
        ikramTotal={ikramTotal}
        discount={bestDiscount.amount}
        change={change}
      />
    </div>
  );
}

function ManualDiscountModal({ open, onClose, subtotal, onApply }) {
  const [tipi, setTipi] = useState('yuzde');
  const [deger, setDeger] = useState('');
  const [aciklama, setAciklama] = useState('');

  useEffect(() => {
    if (open) {
      setTipi('yuzde');
      setDeger('');
      setAciklama('');
    }
  }, [open]);

  const degerNum = parseFloat(deger) || 0;
  const preview =
    tipi === 'yuzde'
      ? Math.min(subtotal, (subtotal * degerNum) / 100)
      : Math.min(subtotal, degerNum);

  const canApply = degerNum > 0 && (tipi === 'yuzde' ? degerNum <= 100 : degerNum <= subtotal);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manuel İndirim"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            onClick={() => onApply({ tipi, deger: degerNum, aciklama: aciklama.trim() })}
            disabled={!canApply}
            className="btn-primary disabled:opacity-50"
          >
            Uygula (- {formatTL(preview)})
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          Ara Toplam: <strong>{formatTL(subtotal)}</strong>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">İndirim Tipi</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipi('yuzde')}
              className={`rounded-lg border-2 px-4 py-2 text-base font-semibold transition ${
                tipi === 'yuzde'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Yüzde (%)
            </button>
            <button
              type="button"
              onClick={() => setTipi('sabit')}
              className={`rounded-lg border-2 px-4 py-2 text-base font-semibold transition ${
                tipi === 'sabit'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Sabit Tutar (TL)
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {tipi === 'yuzde' ? 'Yüzde (1-100)' : 'Tutar (TL)'}
          </label>
          <input
            type="number"
            step={tipi === 'yuzde' ? '1' : '0.01'}
            value={deger}
            onChange={(e) => setDeger(e.target.value)}
            placeholder={tipi === 'yuzde' ? 'Örn: 10' : 'Örn: 50'}
            className="input text-2xl tabular-nums"
            autoFocus
          />
          {tipi === 'yuzde' && (
            <div className="mt-1 flex gap-1">
              {[5, 10, 15, 20, 25].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDeger(String(v))}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs hover:bg-slate-200"
                >
                  %{v}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Açıklama (opsiyonel)
          </label>
          <input
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Örn: VIP müşteri, eski personel..."
            className="input"
          />
        </div>

        {degerNum > 0 && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex justify-between">
              <span>İndirim Tutarı:</span>
              <span className="font-bold tabular-nums">- {formatTL(preview)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>Yeni Toplam:</span>
              <span className="tabular-nums">{formatTL(subtotal - preview)}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Tek satır için adet bazlı seçim/durum bilgisini hesaplar.
 */
function deriveDisplay(item, state) {
  const totalQty = Number(item.adet) || 0;
  const ikramQty = Math.min(totalQty, Math.max(0, Number(state?.ikramQty) || 0));
  const paidQty = Math.min(totalQty - ikramQty, Math.max(0, Number(state?.paidQty) || 0));
  const selectedQty = Math.min(
    Math.max(0, totalQty - ikramQty - paidQty),
    Math.max(0, Number(state?.selectedQty) || 0),
  );
  const remainingQty = totalQty - ikramQty - paidQty - selectedQty;
  const isAtomic = !Number.isInteger(totalQty);
  const selectedAmount = item.fiyat * selectedQty;
  return {
    totalQty,
    ikramQty,
    paidQty,
    selectedQty,
    remainingQty,
    isAtomic,
    selectedAmount,
  };
}

function ItemRowList({ item, state, onAdjustSelect, onIkram, onUnpay }) {
  const d = deriveDisplay(item, state);
  const hasSelected = d.selectedQty > 0;
  const hasIkram = d.ikramQty > 0;
  const hasPaid = d.paidQty > 0;
  const fullyConsumed = d.remainingQty === 0 && !hasSelected;

  const cls = fullyConsumed && hasPaid
    ? 'border-emerald-300 bg-emerald-50/60'
    : fullyConsumed && hasIkram
      ? 'border-amber-300 bg-amber-50/60'
      : hasSelected
        ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200'
        : 'border-slate-200 bg-white hover:bg-slate-50';

  const handleRowClick = () => {
    if (d.isAtomic) {
      onAdjustSelect?.('toggle');
    } else if (d.remainingQty > 0) {
      onAdjustSelect?.('inc');
    }
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div className={`relative rounded-xl border-2 px-4 py-3 transition ${cls}`}>
      <button
        type="button"
        onClick={handleRowClick}
        className="absolute inset-0 rounded-xl"
        aria-label={`${item.ad} seç`}
      />
      <div className="relative flex items-center gap-3">
        {/* Sol: Adet × Ad */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tabular-nums text-slate-900">
              {formatAdet(d.totalQty)}×
            </span>
            <span className="truncate text-lg font-semibold text-slate-900">
              {item.ad}
            </span>
            <span className="text-sm text-slate-500">@{formatTL(item.fiyat)}</span>
          </div>
          {item.notlar && (
            <p className="mt-0.5 text-sm italic text-slate-500">({item.notlar})</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {hasPaid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                <Check size={11} /> {formatAdet(d.paidQty)} ödendi
              </span>
            )}
            {hasIkram && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 font-bold text-amber-900">
                <Gift size={11} /> {formatAdet(d.ikramQty)} ikram
              </span>
            )}
            {hasSelected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 font-bold text-white">
                <Check size={11} /> {formatAdet(d.selectedQty)} seçili
              </span>
            )}
            {d.remainingQty > 0 && !d.isAtomic && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {formatAdet(d.remainingQty)} kalan
              </span>
            )}
          </div>
        </div>

        {/* Sağ: Adet kontrolleri + ikram + tutar */}
        <div className="flex shrink-0 items-center gap-2" onClick={stop}>
          {!d.isAtomic && (d.remainingQty > 0 || hasSelected) && (
            <div className="inline-flex items-center gap-1 rounded-xl border-2 border-blue-400 bg-white p-1">
              <button
                type="button"
                onClick={() => onAdjustSelect?.('dec')}
                disabled={!hasSelected}
                className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-700 active:scale-95 hover:bg-slate-200 disabled:opacity-30"
                aria-label="Azalt"
              >
                <Minus size={22} strokeWidth={3} />
              </button>
              <span className="min-w-[44px] text-center text-2xl font-extrabold tabular-nums text-blue-700">
                {formatAdet(d.selectedQty)}
              </span>
              <button
                type="button"
                onClick={() => onAdjustSelect?.('inc')}
                disabled={d.remainingQty === 0}
                className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500 text-white active:scale-95 hover:bg-blue-600 disabled:opacity-30"
                aria-label="Arttır"
              >
                <Plus size={22} strokeWidth={3} />
              </button>
            </div>
          )}

          {hasPaid && !hasSelected && (
            <button
              type="button"
              onClick={onUnpay}
              className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-red-100 hover:text-red-700"
              title="Ödendi adetlerini sıfırla"
            >
              <X size={14} className="inline" /> Geri Al
            </button>
          )}

          {!hasPaid && (
            <button
              type="button"
              onClick={onIkram}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                hasIkram
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-slate-200 text-slate-700 hover:bg-amber-200 hover:text-amber-900'
              }`}
            >
              <Gift size={14} className="inline" />{' '}
              {hasIkram ? 'İkramı Kaldır' : '+ İkram'}
            </button>
          )}

          <span className="min-w-[100px] text-right text-xl font-bold tabular-nums text-slate-900">
            {hasSelected
              ? formatTL(d.selectedAmount)
              : formatTL(item.fiyat * d.totalQty)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, state, onAdjustSelect, onIkram, onUnpay }) {
  const d = deriveDisplay(item, state);
  const hasSelected = d.selectedQty > 0;
  const hasIkram = d.ikramQty > 0;
  const hasPaid = d.paidQty > 0;
  const fullyConsumed = d.remainingQty === 0 && !hasSelected;

  const cls = fullyConsumed && hasPaid
    ? 'border-emerald-300 bg-emerald-50/60'
    : fullyConsumed && hasIkram
      ? 'border-amber-300 bg-amber-50/60'
      : hasSelected
        ? 'border-blue-500 bg-blue-50 shadow-lg ring-4 ring-blue-200'
        : 'border-slate-200 bg-white hover:bg-slate-50';

  const stop = (e) => e.stopPropagation();
  const handleAreaClick = () => {
    // Atomik (yarım porsiyon) → tek tıkla toggle. Çoklu adette sadece +/- ile.
    if (d.isAtomic) onAdjustSelect?.('toggle');
  };

  return (
    <div className={`relative flex min-h-[180px] gap-3 rounded-2xl border-2 p-4 ${cls}`}>
      {/* İkram butonu — kartın sol üst köşesinde sabit */}
      {!hasPaid && (
        <button
          type="button"
          onClick={(e) => { stop(e); onIkram?.(); }}
          className={`absolute left-2 top-2 z-20 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${
            hasIkram
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-slate-200 text-slate-700 hover:bg-amber-200 hover:text-amber-900'
          }`}
          title={hasIkram ? 'İkramı kaldır' : 'İkram olarak işaretle'}
        >
          <Gift size={14} className="inline" />{' '}
          {hasIkram ? 'İkram' : '+ İkram'}
        </button>
      )}

      {/* Sol: tıklanabilir bilgi alanı */}
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onClick={handleAreaClick}
        role={d.isAtomic ? 'button' : undefined}
      >
        <div className="mt-9 text-3xl font-extrabold tabular-nums text-slate-900">
          {formatAdet(d.totalQty)}×
        </div>
        <p className="mt-1 text-base font-semibold leading-tight text-slate-900">
          {item.ad}
        </p>
        {item.notlar && (
          <p className="mt-1 text-xs italic text-slate-500">({item.notlar})</p>
        )}
        <div className="mt-1 text-xs text-slate-500">@{formatTL(item.fiyat)}</div>

        {/* Durum chip'leri */}
        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
          {hasPaid && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">
              ✓ {formatAdet(d.paidQty)} ödendi
            </span>
          )}
          {hasIkram && (
            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 font-bold text-amber-900">
              🎁 {formatAdet(d.ikramQty)} ikram
            </span>
          )}
          {hasSelected && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 font-bold text-white">
              ✓ {formatAdet(d.selectedQty)} seçili
            </span>
          )}
          {d.remainingQty > 0 && !d.isAtomic && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">
              {formatAdet(d.remainingQty)} kalan
            </span>
          )}
        </div>

        <div className="mt-auto pt-3 text-2xl font-bold tabular-nums text-slate-900">
          {hasSelected ? formatTL(d.selectedAmount) : formatTL(item.fiyat * d.totalQty)}
        </div>

        {hasPaid && !hasSelected && (
          <button
            type="button"
            onClick={(e) => { stop(e); onUnpay?.(); }}
            className="mt-2 self-start rounded-md bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-red-100 hover:text-red-700"
          >
            Geri Al
          </button>
        )}
      </div>

      {/* Sağ: BÜYÜK dikey +/- kontrol kolonu — kalın parmaklara uygun */}
      {!d.isAtomic && (
        <div
          className="flex w-16 shrink-0 flex-col items-stretch justify-center gap-2"
          onClick={stop}
        >
          <button
            type="button"
            onClick={() => onAdjustSelect?.('inc')}
            disabled={d.remainingQty === 0}
            className="flex h-16 items-center justify-center rounded-xl border-2 border-blue-500 bg-blue-500 text-white shadow-md transition active:scale-95 hover:bg-blue-600 disabled:opacity-30"
            aria-label="Arttır"
          >
            <Plus size={28} strokeWidth={3} />
          </button>
          <div className="flex h-14 items-center justify-center rounded-xl border-2 border-blue-300 bg-white">
            <span className="text-2xl font-extrabold tabular-nums text-blue-700">
              {formatAdet(d.selectedQty)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAdjustSelect?.('dec')}
            disabled={!hasSelected}
            className="flex h-16 items-center justify-center rounded-xl border-2 border-slate-400 bg-white text-slate-700 shadow-md transition active:scale-95 hover:bg-slate-100 disabled:opacity-30"
            aria-label="Azalt"
          >
            <Minus size={28} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentButton({ color, icon: Icon, label, onClick, disabled }) {
  const styles = {
    emerald: 'bg-emerald-500 hover:bg-emerald-600',
    blue: 'bg-blue-500 hover:bg-blue-600',
    amber: 'bg-amber-500 hover:bg-amber-600',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-3 rounded-xl py-6 text-xl font-bold text-white shadow transition active:scale-95 disabled:opacity-40 ${styles[color]}`}
    >
      <Icon size={28} />
      {label}
    </button>
  );
}

function CashModal({ open, onClose, remaining, onAdd }) {
  const [given, setGiven] = useState('');
  useEffect(() => {
    if (open) setGiven(remaining.toFixed(2));
  }, [open, remaining]);
  const givenNum = parseFloat(given) || 0;
  const change = givenNum - remaining;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nakit Ödeme"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">İptal</button>
          <button
            onClick={() => onAdd(Math.min(givenNum, remaining))}
            disabled={givenNum <= 0}
            className="btn-primary"
          >
            Ekle
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">Kalan Tutar</p>
          <p className="text-2xl font-bold">{formatTL(remaining)}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Verilen Tutar</label>
          <input
            type="number"
            step="0.01"
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            className="input text-2xl tabular-nums"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {[50, 100, 200, 500].map((v) => (
              <button key={v} onClick={() => setGiven(String(v))} className="btn-ghost text-xs">
                {v} TL
              </button>
            ))}
          </div>
        </div>
        {change >= 0 && givenNum > 0 && (
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
            <p className="text-sm">Para Üstü</p>
            <p className="text-2xl font-bold">{formatTL(change)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CardModal({ open, onClose, remaining, onAdd }) {
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setProcessing(false);
    }
  }, [open, remaining]);
  const amountNum = parseFloat(amount) || 0;

  const handleCharge = async () => {
    if (amountNum <= 0) return;
    setProcessing(true);
    // Mock POS cihaz onayı bekleme
    await new Promise((r) => setTimeout(r, 1200));
    onAdd(Math.min(amountNum, remaining));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kart Ödemesi"
      footer={
        !processing && (
          <>
            <button onClick={onClose} className="btn-secondary">İptal</button>
            <button
              onClick={handleCharge}
              disabled={amountNum <= 0}
              className="btn-primary"
            >
              POS'a Gönder
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tutar</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={processing}
            className="input text-2xl tabular-nums"
          />
        </div>
        {processing ? (
          <div className="rounded-lg bg-blue-50 p-6 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
            <p className="font-semibold text-blue-700">POS cihazına yönlendiriliyor...</p>
            <p className="text-sm text-slate-500">Banka POS entegrasyonu (mock)</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            ⚠️ Banka POS entegrasyonu Faz 4 sonunda kurulacak (Ingenico/Verifone/PayFlex marka kararı bekleniyor).
            Şimdilik onay simüle ediliyor.
          </p>
        )}
      </div>
    </Modal>
  );
}

function MealCardModal({ open, onClose, remaining, onAdd }) {
  const [amount, setAmount] = useState('');
  const [tip, setTip] = useState(YEMEK_KARTI_TIPLERI[0]);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setProcessing(false);
    }
  }, [open, remaining]);
  const amountNum = parseFloat(amount) || 0;

  const handleCharge = async () => {
    if (amountNum <= 0) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1000));
    onAdd(Math.min(amountNum, remaining), tip);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yemek Kartı"
      footer={
        !processing && (
          <>
            <button onClick={onClose} className="btn-secondary">İptal</button>
            <button onClick={handleCharge} disabled={amountNum <= 0} className="btn-primary">
              POS'a Gönder
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kart Tipi</label>
          <select value={tip} onChange={(e) => setTip(e.target.value)} className="input" disabled={processing}>
            {YEMEK_KARTI_TIPLERI.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tutar</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={processing}
            className="input text-2xl tabular-nums"
          />
        </div>
        {processing && (
          <div className="rounded-lg bg-amber-50 p-6 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600"></div>
            <p className="font-semibold text-amber-700">{tip} POS'a yönlendiriliyor...</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
