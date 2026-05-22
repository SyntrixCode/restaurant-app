import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { formatTL, formatDate } from '../utils/format';

const YONTEM_LABEL = {
  nakit: 'NAKİT',
  kart: 'KART',
  yemekKarti: 'YEMEK KARTI',
};

export default function ReceiptPreview({ open, onClose, order, payments, settings, change }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open || !order) return null;

  const print = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">Fiş Önizleme</h3>
          <div className="flex gap-2">
            <button onClick={print} className="btn-primary text-sm">
              <Printer size={14} /> Yazdır
            </button>
            <button onClick={onClose} className="btn-ghost text-sm">
              <X size={14} /> Kapat
            </button>
          </div>
        </div>

        <div className="p-6 font-mono text-sm leading-snug" id="receipt">
          <div className="mb-3 text-center">
            <h1 className="text-lg font-bold">{settings?.fisBasligi || settings?.restoranAd || 'RESTORAN'}</h1>
            {settings?.restoranAdres && <p className="text-xs">{settings.restoranAdres}</p>}
            {settings?.restoranTel && <p className="text-xs">Tel: {settings.restoranTel}</p>}
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
              <span>{order.garsonAd}</span>
            </div>
            <div className="flex justify-between">
              <span>Fiş No:</span>
              <span>{order.id?.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="flex-1">
                  {it.adet}× {it.ad}
                  {it.notlar && <em className="block pl-4 text-slate-500">({it.notlar})</em>}
                </span>
                <span className="ml-2 tabular-nums">{formatTL(it.fiyat * it.adet)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-slate-400 pt-2">
            <div className="flex justify-between text-xs">
              <span>Ara Toplam:</span>
              <span className="tabular-nums">{formatTL(order.araToplam)}</span>
            </div>
            {order.indirim > 0 && (
              <div className="flex justify-between text-xs">
                <span>İndirim:</span>
                <span className="tabular-nums">- {formatTL(order.indirim)}</span>
              </div>
            )}
            {settings?.vergiOrani > 0 && (
              <div className="flex justify-between text-xs">
                <span>KDV (%{settings.vergiOrani}) {settings.kdvDahilFiyat ? 'dahil' : 'hariç'}:</span>
                <span className="tabular-nums">
                  {formatTL((order.toplam * settings.vergiOrani) / (100 + (settings.kdvDahilFiyat ? settings.vergiOrani : 0)))}
                </span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-slate-400 pt-1 text-base font-bold">
              <span>TOPLAM:</span>
              <span className="tabular-nums">{formatTL(order.toplam)}</span>
            </div>
          </div>

          {payments && payments.length > 0 && (
            <div className="mt-2 border-t border-dashed border-slate-400 pt-2 text-xs">
              {payments.map((p, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {YONTEM_LABEL[p.yontem]}
                    {p.kartTipi ? ` (${p.kartTipi})` : ''}:
                  </span>
                  <span className="tabular-nums">{formatTL(p.tutar)}</span>
                </div>
              ))}
              {change > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Para Üstü:</span>
                  <span className="tabular-nums">{formatTL(change)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-center text-xs">
            <p>{settings?.fisAltMesaji || 'Teşekkür ederiz'}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt, #receipt * { visibility: visible; }
          #receipt {
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
