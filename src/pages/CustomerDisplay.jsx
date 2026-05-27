import { useEffect, useState } from 'react';
import { formatTL, formatAdet } from '../utils/format';
import { useSettingsStore } from '../store/settingsStore';
import { subscribeCustomerDisplay } from '../plugins/customerDisplay';

/**
 * Müşteri Ekranı — iMin Swan ikincil ekranında veya dev'de ikinci tarayıcı sekmesinde
 * gösterilir. Ana POS app'ten BroadcastChannel ile gelen güncellemeleri dinler.
 *
 * Modlar:
 *   - idle: hoş geldiniz ekranı (logo + restoran adı)
 *   - order: garson sipariş alıyor, ürünler ve toplam görünür
 *   - payment: ödeme alınıyor, büyük tutar + ödeme yöntemi
 *   - thanks: ödeme tamamlandı, teşekkür ekranı
 */
export default function CustomerDisplay() {
  const { settings } = useSettingsStore();
  const [state, setState] = useState({ mode: 'idle' });

  useEffect(() => {
    const unsub = subscribeCustomerDisplay((data) => {
      setState(data);
    });
    return unsub;
  }, []);

  // Idle ekranı
  if (state.mode === 'idle' || !state.mode) {
    return <IdleScreen settings={settings} />;
  }

  // Teşekkür ekranı (ödeme sonrası)
  if (state.mode === 'thanks') {
    return <ThanksScreen settings={settings} change={state.payment?.paraUstu} />;
  }

  // Sipariş veya ödeme ekranı
  return <OrderScreen state={state} settings={settings} />;
}

function IdleScreen({ settings }) {
  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-800 text-white">
      <img
        src="/branding/alazli-logo.svg"
        alt="Alazlı"
        className="mb-8 h-40 w-auto rounded-2xl bg-white/95 p-6 shadow-2xl"
      />
      <h1 className="mb-2 text-6xl font-bold tracking-wide">
        {settings?.restoranAd || 'Hoş Geldiniz'}
      </h1>
      <p className="text-2xl text-emerald-100">
        {settings?.fisAltMesaji || 'Afiyet olsun'}
      </p>

      {/* SyntrixCode logosu — gerçek renklerle (cyan brackets, beyaz S) */}
      <div className="absolute bottom-6 right-6 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
        <span className="text-xs text-emerald-100">powered by</span>
        <img
          src="/branding/syntrixcode-stacked.svg"
          alt="syntrixCode"
          className="h-10 w-auto"
        />
      </div>
    </div>
  );
}

function OrderScreen({ state, settings }) {
  const order = state.order || {};
  const payment = state.payment;
  const items = order.items || [];
  const isPayment = state.mode === 'payment';

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-900 text-white">
      {/* Üst başlık */}
      <header className="flex items-center justify-between border-b-2 border-emerald-500 bg-slate-800 px-8 py-4">
        <div className="flex items-center gap-3">
          <img
            src="/branding/alazli-logo.svg"
            alt="Alazlı"
            className="h-12 w-auto rounded bg-white p-1"
          />
          <div>
            <p className="text-xs uppercase tracking-wider text-emerald-300">
              {isPayment ? 'Ödeme' : 'Siparişiniz'}
            </p>
            <h2 className="text-2xl font-bold">{order.masaAd || 'Paket'}</h2>
          </div>
        </div>
        <div className="text-right text-sm text-slate-400">
          {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      {/* Ürün listesi */}
      <main className="flex-1 overflow-y-auto px-8 py-4">
        {items.length === 0 ? (
          <p className="py-12 text-center text-2xl text-slate-500">Sepet boş</p>
        ) : (
          <ul className="divide-y divide-slate-700">
            {items.map((it, idx) => (
              <li key={idx} className="flex items-center justify-between py-3">
                <div className="flex-1">
                  <p className="text-xl font-semibold">
                    <span className="mr-2 inline-block min-w-[44px] tabular-nums text-emerald-400">
                      {formatAdet(it.adet)}×
                    </span>
                    {it.ad}
                    {it.ikram && (
                      <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                        🎁 İkram
                      </span>
                    )}
                  </p>
                  {it.notlar && (
                    <p className="ml-12 text-sm italic text-slate-400">({it.notlar})</p>
                  )}
                </div>
                <span
                  className={`text-xl font-bold tabular-nums ${
                    it.ikram ? 'text-slate-500 line-through' : 'text-white'
                  }`}
                >
                  {formatTL((it.ikram ? 0 : it.fiyat * it.adet) || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Alt toplam */}
      <footer className="border-t-2 border-emerald-500 bg-slate-800 px-8 py-5">
        {order.araToplam != null && order.indirim > 0 && (
          <div className="mb-2 flex justify-between text-base text-slate-300">
            <span>Ara Toplam</span>
            <span className="tabular-nums">{formatTL(order.araToplam)}</span>
          </div>
        )}
        {order.indirim > 0 && (
          <div className="mb-2 flex justify-between text-base text-emerald-300">
            <span>İndirim</span>
            <span className="tabular-nums">- {formatTL(order.indirim)}</span>
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-medium text-slate-400">
            {isPayment ? 'ÖDENECEK' : 'TOPLAM'}
          </span>
          <span className="text-6xl font-extrabold tabular-nums text-emerald-400">
            {formatTL(order.toplam || order.araToplam || 0)}
          </span>
        </div>

        {isPayment && payment && (
          <div className="mt-4 rounded-xl bg-emerald-600 p-4 text-center">
            {payment.yontem && (
              <p className="text-lg uppercase tracking-widest">
                {payment.yontem === 'nakit' && '💵 Nakit'}
                {payment.yontem === 'kart' && `💳 Kart${payment.kartTipi ? ` (${payment.kartTipi})` : ''}`}
                {payment.yontem === 'yemekKarti' && `🍴 ${payment.kartTipi || 'Yemek Kartı'}`}
              </p>
            )}
            {payment.tutar != null && (
              <p className="mt-1 text-3xl font-bold tabular-nums">{formatTL(payment.tutar)}</p>
            )}
            {payment.kalan > 0 && (
              <p className="mt-2 text-sm">
                Kalan: <strong className="tabular-nums">{formatTL(payment.kalan)}</strong>
              </p>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

function ThanksScreen({ settings, change }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-600 to-emerald-800 text-white">
      <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-white/20 text-7xl">
        ✓
      </div>
      <h1 className="mb-3 text-6xl font-bold">Teşekkürler!</h1>
      <p className="text-2xl text-emerald-100">
        {settings?.fisAltMesaji || 'Yine bekleriz'}
      </p>
      {change > 0 && (
        <div className="mt-8 rounded-2xl bg-white/20 px-8 py-4 backdrop-blur">
          <p className="text-sm uppercase tracking-widest text-emerald-100">Para Üstü</p>
          <p className="text-5xl font-bold tabular-nums">{formatTL(change)}</p>
        </div>
      )}
    </div>
  );
}
