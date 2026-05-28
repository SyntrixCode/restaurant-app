import { useEffect, useRef, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { formatTL, formatDate, formatAdet } from '../utils/format';
import {
  printReceipt as iminPrintReceipt,
  buildCustomerReceiptLines,
  isIminPrinterAvailable,
} from '../plugins/iminPrinter';
import { printNetworkReceipt } from '../plugins/networkPrinter';
import { watchCollection } from '../firebase/firestore';

/**
 * Adisyon (hesap fişi) — ödemeden ÖNCE müşteriye verilen itemize edilmiş hesap.
 * Açılınca otomatik termal yazıcıya basar (Bixolon > iMin > web fallback).
 * Ödeme bölümü içermez; "ÖDENECEK" tutar + "mali belge değildir" notu.
 */
export default function AdisyonTicket({ open, onClose, order, settings }) {
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState([]);
  const printStartedRef = useRef(false);

  useEffect(() => watchCollection('printers', setNetworkPrinters), []);
  const activePrinter = networkPrinters.find((p) => p.aktif && p.ip);

  useEffect(() => {
    if (!open) {
      printStartedRef.current = false;
      setPrinted(false);
    }
  }, [open]);

  useEffect(() => {
    const handleEsc = (e) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Otomatik bas
  useEffect(() => {
    if (!open || !order) return;
    if (printStartedRef.current) return;
    printStartedRef.current = true;
    let cancelled = false;
    (async () => {
      const lines = buildCustomerReceiptLines({
        order,
        payments: [],
        settings: settings || {},
        isAdisyon: true,
      });
      if (activePrinter) {
        setNativeAvailable(true);
        setPrinting(true);
        try {
          await printNetworkReceipt({
            ip: activePrinter.ip,
            model: activePrinter.model || 'SRP-E300',
            lines,
            cut: true,
            feedLines: 3,
          });
          if (!cancelled) {
            setPrinted(true);
            setTimeout(() => !cancelled && onClose(), 800);
          }
        } catch (err) {
          console.warn('Adisyon network print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
        return;
      }
      const available = await isIminPrinterAvailable();
      if (cancelled) return;
      setNativeAvailable(available);
      if (available) {
        setPrinting(true);
        try {
          await iminPrintReceipt({ lines, cut: true, feedLines: 3 });
          if (!cancelled) {
            setPrinted(true);
            setTimeout(() => !cancelled && onClose(), 800);
          }
        } catch (err) {
          console.warn('Adisyon iMin print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, order, settings, activePrinter, onClose]);

  if (!open || !order) return null;

  const print = async () => {
    setPrinting(true);
    try {
      const lines = buildCustomerReceiptLines({
        order,
        payments: [],
        settings: settings || {},
        isAdisyon: true,
      });
      if (activePrinter) {
        await printNetworkReceipt({
          ip: activePrinter.ip,
          model: activePrinter.model || 'SRP-E300',
          lines,
          cut: true,
          feedLines: 3,
        });
      } else {
        await iminPrintReceipt({ lines, cut: true, feedLines: 3, fallbackPrintFn: () => window.print() });
      }
      setPrinted(true);
    } catch (err) {
      console.error(err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  const baslik = settings?.fisBasligi || settings?.restoranAd || 'RESTORAN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">
            Adisyon (Hesap Fişi)
            {nativeAvailable && (
              <span className="ml-2 text-xs font-normal text-emerald-600">
                {printed ? '✓ basıldı' : printing ? 'Basılıyor…' : activePrinter ? activePrinter.ad : 'iMin'}
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            <button onClick={print} disabled={printing} className="btn-primary text-sm disabled:opacity-50">
              {printed ? <Check size={14} /> : <Printer size={14} />}
              {printed ? 'Yeniden Bas' : 'Yazdır'}
            </button>
            <button onClick={onClose} className="btn-ghost text-sm">
              <X size={14} /> Kapat
            </button>
          </div>
        </div>

        <div className="p-6 font-mono text-sm leading-snug" id="adisyon">
          <div className="mb-2 text-center">
            <h1 className="text-lg font-bold">{baslik}</h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">ADİSYON</p>
            {settings?.restoranAdres && <p className="text-xs">{settings.restoranAdres}</p>}
            {settings?.restoranTel && <p className="text-xs">Tel: {settings.restoranTel}</p>}
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2 text-xs">
            <div className="flex justify-between"><span>Tarih:</span><span>{formatDate(new Date())}</span></div>
            <div className="flex justify-between"><span>Masa:</span><span>{order.masaAd || 'Paket'}</span></div>
            {order.kisiSayisi != null && (
              <div className="flex justify-between"><span>Kişi:</span><span>{order.kisiSayisi}</span></div>
            )}
            <div className="flex justify-between"><span>Garson:</span><span>{order.garsonAd}</span></div>
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2">
            {(order.items || []).map((it, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="flex-1">
                  {formatAdet(it.adet)}× {it.ad}
                  {it.ikram && <span className="ml-1 text-[9px] font-bold text-amber-700">[İKRAM]</span>}
                  {it.notlar && <em className="block pl-4 text-slate-500">({it.notlar})</em>}
                </span>
                <span className={`ml-2 tabular-nums ${it.ikram ? 'text-slate-400 line-through' : ''}`}>
                  {formatTL(it.ikram ? 0 : it.fiyat * it.adet)}
                </span>
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
            <div className="mt-1 flex justify-between border-t border-slate-400 pt-1 text-base font-bold">
              <span>ÖDENECEK:</span>
              <span className="tabular-nums">{formatTL(order.toplam || order.araToplam)}</span>
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] text-slate-400">
            Bu adisyon mali belge değildir
            <br />
            powered by {'{'}S{'}'} syntrixCode
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #adisyon, #adisyon * { visibility: visible; }
          #adisyon { position: absolute; left: 0; top: 0; width: 80mm; padding: 4mm; }
        }
      `}</style>
    </div>
  );
}
