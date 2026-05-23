import { useEffect, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { formatAdet, formatDate } from '../utils/format';
import { printReceipt, buildKitchenTicketLines, isIminPrinterAvailable } from '../plugins/iminPrinter';

export default function KitchenTicket({
  open,
  onClose,
  order,
  items,
  isAddendum = false,
}) {
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Modal açılınca native yazıcı varsa OTOMATİK bas (garson tek tıkla işini bitirsin)
  useEffect(() => {
    if (!open || !order || !items || printed) return;
    let cancelled = false;
    (async () => {
      const available = await isIminPrinterAvailable();
      if (cancelled) return;
      setNativeAvailable(available);
      if (available) {
        setPrinting(true);
        try {
          const lines = buildKitchenTicketLines({ order, items, isAddendum });
          await printReceipt({ lines, cut: true, feedLines: 3 });
          if (!cancelled) {
            setPrinted(true);
            // Otomatik kapat — garson işine devam etsin
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
  }, [open, order, items, isAddendum, printed, onClose]);

  if (!open || !order || !items) return null;

  const print = async () => {
    setPrinting(true);
    try {
      const lines = buildKitchenTicketLines({ order, items, isAddendum });
      await printReceipt({
        lines,
        cut: true,
        feedLines: 3,
        fallbackPrintFn: () => window.print(),
      });
      setPrinted(true);
    } catch (err) {
      console.error(err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };
  const heading = isAddendum ? 'EK SİPARİŞ' : 'MUTFAK ADİSYONU';
  const shortId =
    typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">
            {isAddendum ? 'Ek Sipariş Fişi' : 'Mutfak Fişi'}
            {nativeAvailable && (
              <span className="ml-2 text-xs font-normal text-emerald-600">
                {printed ? '✓ basıldı' : printing ? 'Basılıyor…' : 'iMin yazıcı'}
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
          <div className="mb-3 text-center">
            <h1 className="text-lg font-bold tracking-widest">{heading}</h1>
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

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2">
            {items.map((it, idx) => (
              <div key={idx} className="mb-1.5">
                <div className="text-base font-bold">
                  {formatAdet(it.adet)}× {it.ad}
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
