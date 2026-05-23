import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { formatAdet, formatDate } from '../utils/format';

export default function KitchenTicket({
  open,
  onClose,
  order,
  items,
  isAddendum = false,
}) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open || !order || !items) return null;

  const print = () => window.print();
  const heading = isAddendum ? 'EK SİPARİŞ' : 'MUTFAK ADİSYONU';
  const shortId =
    typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">
            {isAddendum ? 'Ek Sipariş Fişi' : 'Mutfak Fişi'}
          </h3>
          <div className="flex gap-2">
            <button onClick={print} className="btn-primary text-sm">
              <Printer size={14} /> Yazdır
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
