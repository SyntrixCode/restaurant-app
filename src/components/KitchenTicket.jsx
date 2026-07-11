import { useEffect, useRef, useState } from 'react';
import { Printer, X, Check } from 'lucide-react';
import { formatAdet, formatDate } from '../utils/format';
import { printReceipt, buildKitchenTicketLines, isIminPrinterAvailable } from '../plugins/iminPrinter';
import { printNetworkReceipt, triggerBuzzer } from '../plugins/networkPrinter';

// Sipariş tipine göre buzzer pattern'i (mutfak garsonu bip sayısından tipi anlasın).
function buzzerPatternFor({ isCancellation, isCorrection, isAddendum, isPackage }) {
  if (isCancellation) return { pulses: 3, gap: 350 };   // İptal: 3 uzun aralıklı bip
  if (isCorrection) return { pulses: 2, gap: 400 };      // Düzeltme: 2 uzun aralıklı bip
  if (isAddendum) return { pulses: 2, gap: 100 };        // Ek sipariş: 2 hızlı bip
  if (isPackage) return { pulses: 2, gap: 250 };         // Paket: 2 orta bip
  return { pulses: 1, gap: 0 };                          // Normal yeni sipariş: 1 bip
}
import { watchCollection } from '../firebase/firestore';
import { groupTicketByPrinter } from '../utils/printerRouting';

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
  // Platform (Trendyol/Yemeksepeti) kalemlerinde categoryId/yaziciIds YOKTUR —
  // ürün adından eşleştirip doğru istasyona (fırın/ızgara/bar) yönlendirmek için gerekli.
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Aktif ağ yazıcıları + kategoriler + ürünler (yazıcı yönlendirmesi için)
  useEffect(() => watchCollection('printers', setNetworkPrinters), []);
  useEffect(() => watchCollection('categories', setCategories), []);
  useEffect(() => watchCollection('products', setProducts), []);
  // Eklenen kalemleri + düzeltme farkını (silinen/azalan) hedef yazıcılara göre
  // grupla. Böylece bir ürün çıkarılınca/azaltılınca o istasyona düzeltme fişi basılır.
  const ticketGroups = groupTicketByPrinter(
    { items: items || [], removed: correctionDiff?.removed || [], changed: correctionDiff?.changed || [] },
    categories,
    networkPrinters,
    products,
  );
  const hasNetworkPrinter = ticketGroups.length > 0;

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
        let hata = 0;
        for (const group of ticketGroups) {
          // Bu istasyona düzeltme (silinen/azalan) düşüyor mu?
          const groupHasCorrection = group.removed.length > 0 || group.changed.length > 0;
          const lines = buildKitchenTicketLines({
            order,
            items: group.items,
            isAddendum,
            isCancellation,
            cancellationReason,
            isCorrection: groupHasCorrection,
            correctionDiff: groupHasCorrection ? { removed: group.removed, changed: group.changed } : null,
            printerAd: group.printer.ad,
          });
          // Her istasyon BAĞIMSIZ basılır — biri hata verse (offline/timeout) diğerleri
          // yine de bassın. (Eskiden tek try tüm döngüyü sarıyordu → bir yazıcı patlayınca
          // sonraki istasyonlar hiç basılmıyordu = sipariş eksik çıkıyordu.)
          try {
            await printNetworkReceipt({
              ip: group.printer.ip,
              model: group.printer.model || 'SRP-E300',
              connection: group.printer.baglanti || 'ethernet',
              lines,
              cut: true,
              feedLines: 3,
            });
            // Sipariş zili: bu yazıcının DK portunda buzzer varsa, sipariş tipine göre bip pattern'i.
            if (group.printer.siparisZili) {
              const pattern = buzzerPatternFor({
                isCancellation,
                isCorrection: groupHasCorrection,
                isAddendum,
                isPackage: !!order?.paketMi,
              });
              triggerBuzzer({
                ip: group.printer.ip,
                model: group.printer.model || 'SRP-E300',
                connection: group.printer.baglanti || 'ethernet',
                pulses: pattern.pulses,
                gap: pattern.gap,
              }).catch((e) => console.warn('Buzzer tetiklenemedi:', e?.message || e));
            }
          } catch (err) {
            hata++;
            console.warn(`Yazıcıya basılamadı (${group.printer.ad} @ ${group.printer.ip}):`, err?.message || err);
          }
        }
        if (!cancelled) {
          setPrinted(true);
          setTimeout(() => !cancelled && onClose(), hata ? 1800 : 800);
          setPrinting(false);
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
        for (const group of ticketGroups) {
          const groupHasCorrection = group.removed.length > 0 || group.changed.length > 0;
          const lines = buildKitchenTicketLines({
            order,
            items: group.items,
            isAddendum,
            isCancellation,
            cancellationReason,
            isCorrection: groupHasCorrection,
            correctionDiff: groupHasCorrection ? { removed: group.removed, changed: group.changed } : null,
            printerAd: group.printer.ad,
          });
          // Her istasyon bağımsız — biri hata verse diğerleri yine de bassın.
          try {
            await printNetworkReceipt({
              ip: group.printer.ip,
              model: group.printer.model || 'SRP-E300',
              connection: group.printer.baglanti || 'ethernet',
              lines,
              cut: true,
              feedLines: 3,
            });
            if (group.printer.siparisZili) {
              const pattern = buzzerPatternFor({
                isCancellation,
                isCorrection: groupHasCorrection,
                isAddendum,
                isPackage: !!order?.paketMi,
              });
              triggerBuzzer({
                ip: group.printer.ip,
                model: group.printer.model || 'SRP-E300',
                connection: group.printer.baglanti || 'ethernet',
                pulses: pattern.pulses,
                gap: pattern.gap,
              }).catch((e) => console.warn('Buzzer tetiklenemedi:', e?.message || e));
            }
          } catch (err) {
            console.warn(`Yazıcıya basılamadı (${group.printer.ad} @ ${group.printer.ip}):`, err?.message || err);
          }
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
  const isPaket = !!order?.paketMi;
  const paketKaynakAd = order?.paketKaynakAd || '';
  // Masadan açılan paket masaAd'ı "Masa 6 · Paket" → başlıkta "PAKET - MASA 6"
  let paketMasaRef = '';
  if (isPaket && !paketKaynakAd && typeof order?.masaAd === 'string' && order.masaAd.endsWith(' · Paket')) {
    paketMasaRef = order.masaAd.slice(0, order.masaAd.length - ' · Paket'.length).trim();
  }
  const paketBaslik = paketKaynakAd
    ? `PAKET - ${paketKaynakAd.toLocaleUpperCase('tr-TR')}`
    : paketMasaRef
      ? `PAKET - ${paketMasaRef.toLocaleUpperCase('tr-TR')}`
      : 'PAKET';
  const heading = isCancellation
    ? '*** SİPARİŞ İPTAL ***'
    : isCorrection
      ? '🔄 SİPARİŞ DÜZELTME'
      : isAddendum
        ? '*** EK SİPARİŞ ***'
        : isPaket
          ? paketBaslik
          : 'YENİ SİPARİŞ';
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
                  : isPaket
                    ? 'Paket Fişi'
                    : 'Mutfak Fişi'}
            {nativeAvailable && (
              <span className="ml-2 text-xs font-normal text-emerald-600">
                {printed
                  ? '✓ basıldı'
                  : printing
                    ? 'Basılıyor…'
                    : hasNetworkPrinter
                      ? ticketGroups.length > 1
                        ? `${ticketGroups.length} yazıcı (mutfak/bar)`
                        : `${ticketGroups[0].printer.ad || 'Mutfak'} (${ticketGroups[0].printer.ip})`
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

          {/* Dine-in: eski Mutfak/Bar satırının yerine BÜYÜK masa + numarası */}
          {!isPaket && (
            <div className="mb-3 text-center text-3xl font-extrabold tracking-wider">
              {(order.masaAd || 'Paket').toLocaleUpperCase('tr-TR')}
            </div>
          )}

          <div className="mb-2 border-t border-dashed border-slate-400 pt-2 text-base">
            {!isPaket ? (
              <>
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
              </>
            ) : (
              order.masaAd && order.masaAd !== 'Paket' && !paketMasaRef && !paketKaynakAd && (
                <div className="truncate">{order.masaAd}</div>
              )
            )}
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
