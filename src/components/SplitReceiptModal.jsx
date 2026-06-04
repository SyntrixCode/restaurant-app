import { useEffect, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { formatTL, formatDate, formatAdet } from '../utils/format';
import {
  buildSplitReceiptLines,
  printReceipt as iminPrintReceipt,
  isIminPrinterAvailable,
} from '../plugins/iminPrinter';
import { printNetworkReceipt } from '../plugins/networkPrinter';

/**
 * Parça (bölünmüş) ödeme fişi modal'ı — her partial payment sonrasında açılır.
 * Otomatik termal yazıcıya basar (Bixolon > iMin); yoksa "Yazdır" butonu
 * window.print() ile tarayıcı yazdırma diyaloğu açar.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   order: object,
 *   items: Array,
 *   payment: { yontem, tutar, kartTipi? },
 *   settings: object,
 *   activePrinter: object|null,
 * }} props
 */
export default function SplitReceiptModal({
  open,
  onClose,
  order,
  items,
  payment,
  settings,
  activePrinter,
}) {
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [mode, setMode] = useState('idle'); // idle | network | imin | web | none

  useEffect(() => {
    if (!open) return;
    setPrinted(false);
    setMode('idle');
    let cancelled = false;
    (async () => {
      const lines = buildSplitReceiptLines({ order, items, payment, settings });

      // 1. Network yazıcı (Bixolon vs) — Ethernet ya da USB
      if (activePrinter && (activePrinter.ip || activePrinter.baglanti === 'usb')) {
        setPrinting(true);
        setMode('network');
        try {
          await printNetworkReceipt({
            ip: activePrinter.ip,
            model: activePrinter.model || 'SRP-E300',
            connection: activePrinter.baglanti || 'ethernet',
            lines,
            cut: true,
            feedLines: 3,
          });
          if (!cancelled) {
            setPrinted(true);
            setTimeout(() => !cancelled && onClose(), 1200);
          }
        } catch (err) {
          console.warn('SplitReceipt network print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
        return;
      }

      // 2. iMin dahili termal
      const iminAvail = await isIminPrinterAvailable();
      if (cancelled) return;
      if (iminAvail) {
        setPrinting(true);
        setMode('imin');
        try {
          await iminPrintReceipt({ lines, cut: true, feedLines: 3 });
          if (!cancelled) {
            setPrinted(true);
            setTimeout(() => !cancelled && onClose(), 1200);
          }
        } catch (err) {
          console.warn('SplitReceipt iMin print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
        return;
      }

      // 3. Web — kullanıcı manuel yazdırır
      setMode('web');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, order, items, payment, settings, activePrinter, onClose]);

  if (!open || !order || !items || !payment) return null;

  const baslik = settings?.fisBasligi || settings?.restoranAd || 'RESTORAN';
  const yontemLabel =
    payment.yontem === 'nakit'
      ? '💵 NAKİT'
      : payment.yontem === 'kart'
        ? `💳 KART${payment.kartTipi ? ` (${payment.kartTipi})` : ''}`
        : payment.yontem === 'yemekKarti'
          ? `🍴 ${payment.kartTipi || 'YEMEK KARTI'}`
          : payment.yontem;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">
            Parça Fiş
            <span className="ml-2 text-xs font-normal text-blue-600">
              {printing
                ? `Basılıyor… (${mode === 'network' ? activePrinter?.ad || 'Bixolon' : 'iMin'})`
                : printed
                  ? '✓ basıldı'
                  : mode === 'web'
                    ? 'Yazıcı yok — manuel'
                    : ''}
            </span>
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              disabled={printing}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {printed ? <Check size={14} /> : <Printer size={14} />}
              {printed ? 'Tekrar' : 'Yazdır'}
            </button>
            <button onClick={onClose} className="btn-ghost text-sm">
              <X size={14} /> Kapat
            </button>
          </div>
        </div>

        <div className="p-5 font-mono text-sm leading-snug" id="split-receipt">
          <div className="mb-3 text-center">
            <h1 className="text-base font-bold">{baslik}</h1>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Parça Fiş (Bölünmüş Ödeme)
            </p>
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2 text-xs">
            <div className="flex justify-between">
              <span>Tarih:</span>
              <span>{formatDate(new Date())}</span>
            </div>
            <div className="flex justify-between">
              <span>Masa:</span>
              <span>{order.masaAd || 'Paket'}</span>
            </div>
            <div className="flex justify-between">
              <span>Garson:</span>
              <span>{order.garsonAd || '—'}</span>
            </div>
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="flex-1">
                  {formatAdet(it.adet)}× {it.ad}
                  {it.notlar && <em className="block pl-4 text-slate-500">({it.notlar})</em>}
                </span>
                <span className="ml-2 tabular-nums">{formatTL(it.fiyat * it.adet)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-slate-400 pt-2">
            <div className="flex justify-between text-base font-bold">
              <span>{yontemLabel}</span>
              <span className="tabular-nums">{formatTL(payment.tutar)}</span>
            </div>
          </div>

          <div className="mt-3 text-center text-[10px] text-slate-400">
            Kalan ürünler için ayrı fiş basılacak
            <br />
            powered by {'{'}S{'}'} syntrixCode
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #split-receipt, #split-receipt * { visibility: visible; }
          #split-receipt {
            position: absolute;
            left: 0; top: 0;
            width: 80mm;
            padding: 4mm;
          }
        }
      `}</style>
    </div>
  );
}
