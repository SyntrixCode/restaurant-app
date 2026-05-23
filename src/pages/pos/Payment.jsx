import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wallet,
  CreditCard,
  UtensilsCrossed,
  Plus,
  Trash2,
  ArrowLeft,
  Printer,
  Megaphone,
  Tag,
  X,
  Check,
} from 'lucide-react';
import { watchDoc, watchCollection } from '../../firebase/firestore';
import { formatTL, minutesSince, formatAdet } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { recordPayment } from '../../firebase/payments';
import { pickBestDiscount, isCouponValid, isCampaignActive } from '../../utils/discount';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import ReceiptPreview from '../../components/ReceiptPreview';

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

  const [cashModal, setCashModal] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [mealModal, setMealModal] = useState(false);

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

  const subtotal = Number(order.araToplam || order.toplam || 0);

  // En büyük indirim hesabı (kampanya auto + manual kupon — kümülatif değil)
  const bestDiscount = pickBestDiscount({
    subtotal,
    campaigns,
    coupon: appliedCoupon,
  });

  const effectiveTotal = Math.max(0, subtotal - bestDiscount.amount);

  const totalPaid = payments.reduce((s, p) => s + Number(p.tutar || 0), 0);
  const remaining = Math.max(0, effectiveTotal - totalPaid);
  const isFullyPaid = totalPaid >= effectiveTotal - 0.005;

  // Inline (useMemo değil) — koşullu erken return'lerden sonra hook çağırmak
  // React hooks kuralını ihlal eder ve beyaz ekrana yol açar.
  const applicableCampaigns = campaigns.filter((c) => isCampaignActive(c, subtotal));

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
    if (payments.length === 0) {
      toast.error('Ödeme yöntemi seçin');
      return;
    }
    if (!isFullyPaid) {
      toast.error(`Eksik ödeme: ${formatTL(remaining)} kaldı`);
      return;
    }
    setSubmitting(true);
    try {
      let discountPayload = null;
      if (bestDiscount.amount > 0 && bestDiscount.source) {
        if (bestDiscount.type === 'kampanya') {
          discountPayload = {
            type: 'kampanya',
            kampanyaId: bestDiscount.source.id,
            kampanyaAd: bestDiscount.source.ad,
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
      if (fisBas) {
        setReceiptOpen(true);
      } else {
        setTimeout(() => navigate('/pos/tables'), 800);
      }
    } catch (err) {
      toast.error(err.message || 'Ödeme alınamadı');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const closeReceipt = () => {
    setReceiptOpen(false);
    navigate('/pos/tables');
  };

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

        <div className="mb-4 rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
            Sipariş İçeriği
          </div>
          <ul className="divide-y divide-slate-100">
            {order.items.map((it, idx) => (
              <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                <span>
                  <strong className="mr-1">{formatAdet(it.adet)}×</strong>
                  {it.ad}
                  {it.notlar && <em className="ml-2 text-xs text-slate-500">({it.notlar})</em>}
                </span>
                <span className="font-semibold tabular-nums">{formatTL(it.fiyat * it.adet)}</span>
              </li>
            ))}
          </ul>
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

          {applicableCampaigns.length > 0 && !appliedCoupon && bestDiscount.type !== 'kampanya' && (
            <p className="mt-1 text-xs text-slate-500">
              Geçerli kampanya: {applicableCampaigns.map((c) => c.ad).join(', ')}
            </p>
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
            disabled={!isFullyPaid || submitting}
            className="btn-primary w-full py-3 text-lg disabled:opacity-50"
          >
            {submitting ? 'Tamamlanıyor...' : isFullyPaid ? 'ÖDEMEYİ TAMAMLA' : `Kalan: ${formatTL(remaining)}`}
          </button>
        </div>
      </div>

      {/* Sağ panel: Ödeme yöntemleri */}
      <aside className="flex w-96 flex-col gap-3 border-l border-slate-200 bg-slate-100 p-4">
        <h2 className="text-sm font-semibold uppercase text-slate-500">Ödeme Yöntemi</h2>
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
          <p>Birden fazla yöntem ekleyebilirsiniz. Her parça ayrı kayıt olarak saklanır.</p>
        </div>
      </aside>

      <CashModal
        open={cashModal}
        onClose={() => setCashModal(false)}
        remaining={remaining}
        onAdd={(tutar) => {
          addPayment({ yontem: 'nakit', tutar });
          setCashModal(false);
        }}
      />
      <CardModal
        open={cardModal}
        onClose={() => setCardModal(false)}
        remaining={remaining}
        onAdd={(tutar) => {
          addPayment({ yontem: 'kart', tutar });
          setCardModal(false);
        }}
      />
      <MealCardModal
        open={mealModal}
        onClose={() => setMealModal(false)}
        remaining={remaining}
        onAdd={(tutar, kartTipi) => {
          addPayment({ yontem: 'yemekKarti', tutar, kartTipi });
          setMealModal(false);
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
