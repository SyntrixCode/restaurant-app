import { useEffect, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatTL, formatDate, formatAdet } from '../utils/format';
import {
  printReceipt,
  buildCustomerReceiptLines,
  isIminPrinterAvailable,
} from '../plugins/iminPrinter';
import { printNetworkReceipt } from '../plugins/networkPrinter';
import { watchCollection } from '../firebase/firestore';
import { pickAdisyonPrinter } from '../utils/posDeviceSettings';

const YONTEM_LABEL = {
  nakit: 'NAKİT',
  kart: 'KART',
  yemekKarti: 'YEMEK KARTI',
  uygulama: 'UYGULAMA',
};

export default function ReceiptPreview({ open, onClose, order, payments, settings, change }) {
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState([]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Aktif ağ yazıcılarını dinle
  useEffect(() => watchCollection('printers', setNetworkPrinters), []);
  const activePrinter = pickAdisyonPrinter(networkPrinters);

  // Modal açılır açılmaz yazıcı varsa otomatik bas
  useEffect(() => {
    if (!open || !order || printed) return;
    let cancelled = false;
    (async () => {
      const lines = buildCustomerReceiptLines({
        order,
        payments: payments || [],
        settings: settings || {},
        change: change || 0,
      });

      // Öncelik: ağ yazıcısı (Bixolon vb)
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
            feedLines: 4,
          });
          if (!cancelled) setPrinted(true);
        } catch (err) {
          console.warn('Bixolon network receipt failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
        return;
      }

      // Fallback: iMin dahili termal yazıcı
      const available = await isIminPrinterAvailable();
      if (cancelled) return;
      setNativeAvailable(available);
      if (available) {
        setPrinting(true);
        try {
          await printReceipt({ lines, cut: true, feedLines: 4 });
          if (!cancelled) setPrinted(true);
        } catch (err) {
          console.warn('iMin receipt print failed:', err);
        } finally {
          if (!cancelled) setPrinting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, order, payments, settings, change, printed, activePrinter]);

  if (!open || !order) return null;

  const print = async () => {
    setPrinting(true);
    try {
      const lines = buildCustomerReceiptLines({
        order,
        payments: payments || [],
        settings: settings || {},
        change: change || 0,
      });
      if (activePrinter) {
        await printNetworkReceipt({
          ip: activePrinter.ip,
          model: activePrinter.model || 'SRP-E300',
          connection: activePrinter.baglanti || 'ethernet',
          lines,
          cut: true,
          feedLines: 4,
        });
      } else {
        await printReceipt({
          lines,
          cut: true,
          feedLines: 4,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0">
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">
            Fiş Önizleme
            {nativeAvailable && (
              <span className="ml-2 text-xs font-normal text-emerald-600">
                {printed
                  ? '✓ basıldı'
                  : printing
                    ? 'Basılıyor…'
                    : activePrinter
                      ? `${activePrinter.ad || 'Yazıcı'} (${activePrinter.ip})`
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

        <div className="p-6 font-mono text-sm leading-snug" id="receipt">
          <div className="mb-3 text-center">
            {settings?.fisLogoBas !== false && (
              <img
                src="/branding/alazli-logo-receipt.png"
                alt={settings?.restoranAd || 'Logo'}
                className="mx-auto mb-2 h-16 w-auto"
              />
            )}
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
              <span>Fiş No:</span>
              <span>{order.id?.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="flex-1">
                  {formatAdet(it.adet)}× {it.ad}
                  {it.ikram && (
                    <span className="ml-1 inline-block rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-800">
                      İKRAM
                    </span>
                  )}
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
            {settings?.fisQrUrl && (
              <div className="mt-3 flex flex-col items-center">
                <p className="mb-1 text-[11px] font-medium">{settings.fisQrMesaj || 'Bizi değerlendirin'}</p>
                <QRCodeSVG value={settings.fisQrUrl} size={96} level="M" />
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-400">
              powered by {'{'}S{'}'}  syntrixCode
            </p>
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
