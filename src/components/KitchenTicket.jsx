import { useEffect, useRef, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { formatAdet, formatDate } from '../utils/format';
import { printReceipt, buildKitchenTicketLines, isIminPrinterAvailable } from '../plugins/iminPrinter';
import { printNetworkReceipt } from '../plugins/networkPrinter';
import { watchCollection } from '../firebase/firestore';
import { groupItemsByPrinter } from '../utils/printerRouting';

export default function KitchenTicket({
  open,
  onClose,
  order,
  items,
  isAddendum = false,
  isCancellation = false,
  cancellationReason = '',
  isCorrection = false,
  correctionDiff = null, // { removed: [], changed: [] }
}) {
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Aktif ağ yazıcıları + kategoriler (yazıcı yönlendirmesi için)
  useEffect(() => watchCollection('printers', setNetworkPrinters), []);
  useEffect(() => watchCollection('categories', setCategories), []);
  // Kalemleri hedef yazıcılarına göre grupla (mutfak / bar)
  const printerGroups = groupItemsByPrinter(items, categories, networkPrinters);
  const hasNetworkPrinter = printerGroups.length > 0;

  // Senkron guard — async print başlamadan ÖNCE set edilir.
  // kitchenPrinter referansı her render değiştiği için effect tekrar
  // tetiklenebilir; bu ref çift basımı önler.
  const printStartedRef = useRef(false);

  // Modal kapanınca guard'ı ve printed state'i sıfırla
  useEffect(() => {
    if (!open) {
      printStartedRef.current = false;
      setPrinted(false);
    }
  }, [open]);

  // Modal açılınca yazıcı varsa OTOMATİK bas (garson tek tıkla işini bitirsin)
  useEffect(() => {
    if (!open || !order || !items) return;
    if (printStartedRef.current) return; // zaten basıldı/basılıyor
    printStartedRef.current = true; // SENKRON kilit — async'ten ÖNCE
    let cancelled = false;
    (async () => {
      // Öncelik: ağdaki Bixolon yazıcı(lar) — kalemler kategoriye göre
      // mutfak/bar yazıcılarına bölünür.
      if (hasNetworkPrinter) {
        setNativeAvailable(true);
        setPrinting(true);
        try {
          for (const group of printerGroups) {
            const lines = buildKitchenTicketLines({
              order, items: group.items, isAddendum, isCancellation, cancellationReason, isCorrection, correctionDiff,
            });
            await printNetworkReceipt({
              ip: group.printer.ip,
              model: group.printer.model || 'SRP-E300',
              lines,
              cut: true,
              feedLines: 3,
            });
          }
          if (!cancelled) {
            setPrinted(true);
            setTimeout(() => !cancelled && onClose(), 800);
          }
        } catch (err) {
          console.warn('Bixolon network print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
        return;
      }

      // Fallback: iMin dahili termal yazıcı — tüm kalemler tek fişte
      const lines = buildKitchenTicketLines({ order, items, isAddendum, isCancellation, cancellationReason, isCorrection, correctionDiff });
      const available = await isIminPrinterAvailable();
      if (cancelled) return;
      setNativeAvailable(available);
      if (available) {
        setPrinting(true);
        try {
          await printReceipt({ lines, cut: true, feedLines: 3 });
          if (!cancelled) {
            setPrinted(true);
            setTimeout(() => !cancelled && onClose(), 800);
          }
        } catch (err) {
          console.warn('iMin print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, items, isAddendum, isCancellation, cancellationReason, printed, onClose, hasNetworkPrinter]);

  if (!open || !order || !items) return null;

  const print = async () => {
    setPrinting(true);
    try {
      if (hasNetworkPrinter) {
        for (const group of printerGroups) {
          const lines = buildKitchenTicketLines({
            order, items: group.items, isAddendum, isCancellation, cancellationReason, isCorrection, correctionDiff,
          });
          await printNetworkReceipt({
            ip: group.printer.ip,
            model: group.printer.model || 'SRP-E300',
            lines,
            cut: true,
            feedLines: 3,
          });
        }
      } else {
        const lines = buildKitchenTicketLines({ order, items, isAddendum, isCancellation, cancellationReason, isCorrection, correctionDiff });
        await printReceipt({
          lines,
          cut: true,
          feedLines: 3,
          fallbackPrintFn: () => window.print(),
        });
      }
      setPrinted(true);
    } catch (err) {
      console.error(err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };
  const heading = isCancellation
    ? '❌ SİPARİŞ İPTAL'
    : isCorrection
      ? '🔄 SİPARİŞ DÜZELTME'
      : isAddendum
        ? 'EK SİPARİŞ'
        : 'MUTFAK ADİSYONU';
  const shortId =
    typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className={`font-semibold ${isCancellation ? 'text-red-700' : isCorrection ? 'text-amber-700' : ''}`}>
            {isCancellation
              ? '❌ İptal Fişi'
              : isCorrection
                ? '🔄 Düzeltme Fişi'
                : isAddendum
                  ? 'Ek Sipariş Fişi'
                  : 'Mutfak Fişi'}
            {nativeAvailable && (
              <span className="ml-2 text-xs font-normal text-emerald-600">
                {printed
                  ? '✓ basıldı'
                  : printing
                    ? 'Basılıyor…'
                    : hasNetworkPrinter
                      ? printerGroups.length > 1
                        ? `${printerGroups.length} yazıcı (mutfak/bar)`
                        : `${printerGroups[0].printer.ad || 'Mutfak'} (${printerGroups[0].printer.ip})`
                      : 'iMin yazıcı'}
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={print}
              disabled={printing}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {printed ? <Check size={14} /> : <Printer size={14} />}
              {printed ? 'Yeniden Bas' : 'Yazdır'}
            </button>
            <button onClick={onClose} className="btn-ghost text-sm">
              <X size={14} /> Kapat
            </button>
          </div>
        </div>

        <div className="p-6 font-mono leading-snug" id="kitchen-ticket">
          <div
            className={`mb-3 text-center ${
              isCancellation
                ? 'rounded-md bg-red-50 py-2 border-2 border-red-300'
                : isCorrection
                  ? 'rounded-md bg-amber-50 py-2 border-2 border-amber-300'
                  : ''
            }`}
          >
            <h1
              className={`text-lg font-bold tracking-widest ${
                isCancellation
                  ? 'text-red-700'
                  : isCorrection
                    ? 'text-amber-700'
                    : ''
              }`}
            >
              {heading}
            </h1>
            {isCancellation && cancellationReason && (
              <p className="mt-1 text-xs font-semibold uppercase text-red-700">
                Sebep: {cancellationReason}
              </p>
            )}
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2 text-sm">
            <div className="flex justify-between">
              <span>Masa:</span>
              <span className="font-bold">{order.masaAd || 'Paket'}</span>
            </div>
            {order.kisiSayisi != null && (
              <div className="flex justify-between">
                <span>Kişi:</span>
                <span>{order.kisiSayisi}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Garson:</span>
              <span>{order.garsonAd}</span>
            </div>
            <div className="flex justify-between">
              <span>Saat:</span>
              <span>{formatDate(new Date(), 'HH:mm')}</span>
            </div>
          </div>

          {/* Düzeltme fişi: silinen/değişen kalemler ÜSTTE */}
          {isCorrection && correctionDiff && (
            <div className="mb-2 border-t-2 border-dashed border-amber-400 pt-2 text-sm">
              {correctionDiff.removed?.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-bold uppercase text-red-700">İPTAL EDİLEN</p>
                  {correctionDiff.removed.map((it, idx) => (
                    <div key={`r${idx}`} className="text-base font-bold text-red-700 line-through">
                      − {formatAdet(it.adet)}× {it.ad}
                      {it.notlar && <em className="ml-1 text-xs">({it.notlar})</em>}
                    </div>
                  ))}
                </div>
              )}
              {correctionDiff.changed?.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-bold uppercase text-amber-700">ADET DEĞİŞEN</p>
                  {correctionDiff.changed.map((it, idx) => (
                    <div key={`c${idx}`} className="text-base font-bold text-amber-800">
                      ↻ {it.ad}: {formatAdet(it.fromAdet)}× → {formatAdet(it.toAdet)}×
                      {it.notlar && <em className="ml-1 text-xs">({it.notlar})</em>}
                    </div>
                  ))}
                </div>
              )}
              {items?.length > 0 && (
                <p className="mt-1 text-xs font-bold uppercase text-emerald-700">YENİ EKLENEN</p>
              )}
            </div>
          )}

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2">
            {items.map((it, idx) => (
              <div key={idx} className="mb-1.5">
                <div className={`text-base font-bold ${isCorrection ? 'text-emerald-700' : ''}`}>
                  {isCorrection ? '+ ' : ''}{formatAdet(it.adet)}× {it.ad}
                </div>
                {it.notlar && (
                  <div className="pl-4 text-xs italic text-slate-600">
                    ({it.notlar})
                  </div>
                )}
              </div>
            ))}
          </div>

          {shortId && (
            <div className="border-t border-dashed border-slate-400 pt-2 text-center text-xs">
              #{shortId}
            </div>
          )}
          <p className="mt-3 text-center text-[10px] text-slate-400">
            powered by {'{'}S{'}'}  syntrixCode
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kitchen-ticket, #kitchen-ticket * { visibility: visible; }
          #kitchen-ticket {
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
