import { useEffect, useRef, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { printReceipt as iminPrintReceipt, isIminPrinterAvailable } from '../plugins/iminPrinter';
import { printNetworkReceipt } from '../plugins/networkPrinter';
import { watchCollection } from '../firebase/firestore';
import { renderAdisyonBitmap } from '../utils/adisyonBitmap';
import { pickAdisyonPrinter } from '../utils/posDeviceSettings';

/**
 * Adisyon (hesap fişi) — ödemeden ÖNCE müşteriye verilen hesap.
 * Tüm fiş tek bir bitmap olarak çizilir (kutular, kişi-başı bölüşme, bahşiş)
 * ve termal yazıcıya tek resim olarak basılır (Bixolon > iMin > web fallback).
 */
export default function AdisyonTicket({ open, onClose, order, settings }) {
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState([]);
  const [bitmap, setBitmap] = useState(null); // { dataUrl, base64 }
  const printStartedRef = useRef(false);

  useEffect(() => watchCollection('printers', setNetworkPrinters), []);
  const activePrinter = pickAdisyonPrinter(networkPrinters);

  useEffect(() => {
    if (!open) {
      printStartedRef.current = false;
      setPrinted(false);
      setBitmap(null);
    }
  }, [open]);

  useEffect(() => {
    const handleEsc = (e) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Adisyon görselini üret (canvas → base64 PNG)
  useEffect(() => {
    if (!open || !order) return;
    let cancelled = false;
    renderAdisyonBitmap({ order, settings: settings || {} })
      .then((res) => {
        if (!cancelled) setBitmap(res);
      })
      .catch((err) => console.warn('Adisyon bitmap üretilemedi:', err));
    return () => {
      cancelled = true;
    };
  }, [open, order, settings]);

  // Görsel hazır olunca otomatik bas (tek sefer)
  useEffect(() => {
    if (!open || !order || !bitmap) return;
    if (printStartedRef.current) return;
    printStartedRef.current = true;
    let cancelled = false;
    (async () => {
      const lines = [{ type: 'imageData', base64: bitmap.base64, align: 'center' }];
      if (activePrinter) {
        setNativeAvailable(true);
        setPrinting(true);
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
  }, [open, order, bitmap, activePrinter, onClose]);

  if (!open || !order) return null;

  const print = async () => {
    if (!bitmap) {
      window.print();
      return;
    }
    setPrinting(true);
    try {
      const lines = [{ type: 'imageData', base64: bitmap.base64, align: 'center' }];
      if (activePrinter) {
        await printNetworkReceipt({
          ip: activePrinter.ip,
          model: activePrinter.model || 'SRP-E300',
          connection: activePrinter.baglanti || 'ethernet',
          lines,
          cut: true,
          feedLines: 3,
        });
      } else {
        const available = await isIminPrinterAvailable();
        if (available) {
          await iminPrintReceipt({ lines, cut: true, feedLines: 3 });
        } else {
          window.print();
        }
      }
      setPrinted(true);
    } catch (err) {
      console.error(err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };

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
            <button onClick={print} disabled={printing || !bitmap} className="btn-primary text-sm disabled:opacity-50">
              {printed ? <Check size={14} /> : <Printer size={14} />}
              {printed ? 'Yeniden Bas' : 'Yazdır'}
            </button>
            <button onClick={onClose} className="btn-ghost text-sm">
              <X size={14} /> Kapat
            </button>
          </div>
        </div>

        <div className="p-4" id="adisyon">
          {bitmap ? (
            <img src={bitmap.dataUrl} alt="Adisyon" className="mx-auto w-full max-w-[384px]" />
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">Adisyon hazırlanıyor…</p>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #adisyon, #adisyon * { visibility: visible; }
          #adisyon { position: absolute; left: 0; top: 0; width: 80mm; padding: 2mm; }
          #adisyon img { width: 100%; }
        }
      `}</style>
    </div>
  );
}
