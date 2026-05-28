import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * iMin termal yazıcı plugin'i.
 *
 * Capacitor native ortamda (Android + Swan 1 Pro) gerçek yazıcıya basar.
 * Tarayıcı / iOS / non-iMin Android'de fallback olarak window.print() kullanılır.
 *
 * Fiş öğeleri (`lines`):
 *   { type: 'text', text: 'MUTFAK ADİSYONU', align: 'center', size: 36, bold: true }
 *   { type: 'divider' }
 *   { type: 'feed', lines: 2 }
 *   { type: 'qr', data: '#A1B2', align: 'center' }
 */
const IminPrinter = registerPlugin('IminPrinter', {
  // Web fallback — pencere yazdırma diyaloğu
  web: () => ({
    isAvailable: async () => ({ available: false, error: 'web' }),
    printReceipt: async () => {
      window.print();
    },
  }),
});

let availabilityCache = null;

/**
 * iMin yazıcı bu cihazda kullanılabilir mi? Bir kez sorulur, cache'lenir.
 */
export async function isIminPrinterAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  if (availabilityCache != null) return availabilityCache;
  try {
    const res = await IminPrinter.isAvailable();
    availabilityCache = !!res?.available;
    if (!availabilityCache && res?.error) {
      console.warn('[iMin] yazıcı kullanılamıyor:', res.error);
    }
    return availabilityCache;
  } catch (err) {
    console.warn('[iMin] isAvailable hata:', err?.message || err);
    availabilityCache = false;
    return false;
  }
}

/**
 * Fişi basar. iMin native varsa direkt termal yazıcıya, yoksa tarayıcı diyaloğu.
 * @param {{ lines: Array, cut?: boolean, feedLines?: number, fallbackPrintFn?: () => void }} opts
 */
export async function printReceipt(opts) {
  const { lines, cut = true, feedLines = 3, fallbackPrintFn } = opts || {};
  const available = await isIminPrinterAvailable();
  if (available) {
    await IminPrinter.printReceipt({ lines, cut, feedLines });
    return { mode: 'native' };
  }
  // Fallback — caller'ın belirlediği yöntem (genelde window.print)
  if (typeof fallbackPrintFn === 'function') {
    fallbackPrintFn();
  } else {
    window.print();
  }
  return { mode: 'web' };
}

/**
 * Mutfak adisyonu için yardımcı — sipariş + items'ı satır listesine çevirir.
 */
export function buildKitchenTicketLines({
  order,
  items,
  isAddendum = false,
  isCancellation = false,
  cancellationReason = '',
  isCorrection = false,
  correctionDiff = null,
}) {
  const lines = [];
  const heading = isCancellation
    ? '*** SIPARIS IPTAL ***'
    : isCorrection
      ? '*** SIPARIS DUZELTME ***'
      : isAddendum
        ? 'EK SIPARIS'
        : 'MUTFAK ADISYONU';
  lines.push({
    type: 'text',
    text: heading,
    align: 'center',
    size: isCancellation || isCorrection ? 42 : 36,
    bold: true,
  });
  if (isCancellation && cancellationReason) {
    lines.push({
      type: 'text',
      text: `Sebep: ${cancellationReason}`,
      align: 'center',
      size: 24,
      bold: true,
    });
  }
  lines.push({ type: 'divider' });
  lines.push({ type: 'text', text: `Masa: ${order.masaAd || 'Paket'}`, size: 28, bold: true });
  if (order.kisiSayisi != null) {
    lines.push({ type: 'text', text: `Kişi: ${order.kisiSayisi}` });
  }
  lines.push({ type: 'text', text: `Garson: ${order.garsonAd || '-'}` });
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  lines.push({ type: 'text', text: `Saat: ${hh}:${mm}` });
  lines.push({ type: 'divider' });

  // Düzeltme fişi: önce silinenler ve değişenler
  if (isCorrection && correctionDiff) {
    if (correctionDiff.removed?.length > 0) {
      lines.push({ type: 'text', text: 'IPTAL EDILEN:', size: 26, bold: true });
      for (const it of correctionDiff.removed) {
        const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
        lines.push({ type: 'text', text: `- ${adet}x ${it.ad}`, size: 32, bold: true });
        if (it.notlar) {
          lines.push({ type: 'text', text: `   (${it.notlar})`, size: 22, italic: true });
        }
      }
      lines.push({ type: 'divider' });
    }
    if (correctionDiff.changed?.length > 0) {
      lines.push({ type: 'text', text: 'ADET DEGISEN:', size: 26, bold: true });
      for (const it of correctionDiff.changed) {
        const f = it.fromAdet % 1 === 0 ? String(it.fromAdet) : it.fromAdet.toFixed(1).replace('.', ',');
        const t = it.toAdet % 1 === 0 ? String(it.toAdet) : it.toAdet.toFixed(1).replace('.', ',');
        lines.push({ type: 'text', text: `${it.ad}: ${f}x > ${t}x`, size: 30, bold: true });
        if (it.notlar) {
          lines.push({ type: 'text', text: `   (${it.notlar})`, size: 22, italic: true });
        }
      }
      lines.push({ type: 'divider' });
    }
    if (items && items.length > 0) {
      lines.push({ type: 'text', text: 'YENI EKLENEN:', size: 26, bold: true });
    }
  }

  for (const it of items || []) {
    const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
    lines.push({
      type: 'text',
      text: `${isCorrection ? '+ ' : ''}${adet}x ${it.ad}`,
      size: 32,
      bold: true,
    });
    if (it.notlar) {
      lines.push({ type: 'text', text: `   (${it.notlar})`, size: 24, italic: true });
    }
  }

  lines.push({ type: 'divider' });
  if (order.id) {
    lines.push({
      type: 'text',
      text: `#${String(order.id).slice(0, 8).toUpperCase()}`,
      align: 'center',
      size: 22,
    });
  }
  lines.push({
    type: 'text',
    text: 'powered by {S} syntrixCode',
    align: 'center',
    size: 18,
  });
  return lines;
}

/**
 * Bölünmüş (parça) ödeme fişi — bir müşterinin sadece yediği kısım için.
 * Tam fiş değil, "ara slip" niteliğinde. Sonunda ÖDEMEYİ TAMAMLA basıldığında
 * yine buildCustomerReceiptLines ile asıl tam fiş basılır.
 *
 * @param {{ order, items:Array, payment:{yontem, tutar, kartTipi?}, settings? }} opts
 */
export function buildSplitReceiptLines({ order, items = [], payment, settings = {} }) {
  const lines = [];
  const baslik = settings.fisBasligi || settings.restoranAd || 'RESTORAN';
  lines.push({ type: 'text', text: baslik, align: 'center', size: 32, bold: true });
  lines.push({ type: 'text', text: 'PARCA FIS (Bolunmus Odeme)', align: 'center', size: 22 });
  lines.push({ type: 'divider' });

  const now = new Date();
  const tarih = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  lines.push({ type: 'text', text: `Tarih: ${tarih}` });
  lines.push({ type: 'text', text: `Masa: ${order.masaAd || 'Paket'}` });
  lines.push({ type: 'text', text: `Garson: ${order.garsonAd || '-'}` });
  lines.push({ type: 'divider' });

  const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  for (const it of items) {
    const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
    const tutar = fmt((it.fiyat || 0) * (it.adet || 0));
    lines.push({ type: 'text', text: `${adet}x ${it.ad}` });
    lines.push({ type: 'text', text: `   ${tutar} TL`, align: 'right', size: 24 });
    if (it.notlar) {
      lines.push({ type: 'text', text: `   (${it.notlar})`, size: 22, italic: true });
    }
  }

  lines.push({ type: 'divider' });
  const yontemLabel =
    payment.yontem === 'nakit'
      ? 'NAKIT'
      : payment.yontem === 'kart'
        ? `KART${payment.kartTipi ? ` (${payment.kartTipi})` : ''}`
        : payment.yontem === 'yemekKarti'
          ? `${(payment.kartTipi || 'YEMEK KARTI').toUpperCase()}`
          : (payment.yontem || '').toUpperCase();

  lines.push({
    type: 'text',
    text: `${yontemLabel}: ${fmt(payment.tutar)} TL`,
    align: 'right',
    size: 36,
    bold: true,
  });

  lines.push({ type: 'feed', lines: 1 });
  lines.push({
    type: 'text',
    text: 'Tesekkurler — kalan urunler icin ayri fis',
    align: 'center',
    size: 20,
  });
  lines.push({
    type: 'text',
    text: 'powered by {S} syntrixCode',
    align: 'center',
    size: 18,
  });
  return lines;
}

/**
 * Müşteri hesap fişi için yardımcı.
 */
export function buildCustomerReceiptLines({ order, payments = [], settings = {}, change = 0, isAdisyon = false }) {
  const lines = [];
  const baslik = settings.fisBasligi || settings.restoranAd || 'RESTORAN';
  lines.push({ type: 'text', text: baslik, align: 'center', size: 36, bold: true });
  if (isAdisyon) {
    lines.push({ type: 'text', text: 'ADISYON', align: 'center', size: 26, bold: true });
  }
  if (settings.restoranAdres) {
    lines.push({ type: 'text', text: settings.restoranAdres, align: 'center', size: 22 });
  }
  if (settings.restoranTel) {
    lines.push({ type: 'text', text: `Tel: ${settings.restoranTel}`, align: 'center', size: 22 });
  }
  if (settings.vergiDairesi || settings.vergiNo) {
    const vd = settings.vergiDairesi ? `${settings.vergiDairesi} VD` : '';
    const vn = settings.vergiNo ? `VKN: ${settings.vergiNo}` : '';
    lines.push({ type: 'text', text: [vd, vn].filter(Boolean).join('  '), align: 'center', size: 20 });
  }
  lines.push({ type: 'divider' });

  const now = new Date();
  const tarih = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  lines.push({ type: 'text', text: `Tarih: ${tarih}`, size: 22 });
  lines.push({ type: 'text', text: `Masa: ${order.masaAd || 'Paket'}`, size: 22 });
  if (order.kisiSayisi != null) lines.push({ type: 'text', text: `Kişi: ${order.kisiSayisi}`, size: 22 });
  lines.push({ type: 'text', text: `Garson: ${order.garsonAd || '-'}`, size: 22 });
  lines.push({
    type: 'text',
    text: `Fiş No: ${String(order.id || '').slice(0, 8).toUpperCase()}`,
  });
  lines.push({ type: 'divider' });

  const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  for (const it of order.items || []) {
    const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
    const isIkram = !!it.ikram;
    const tutar = fmt(isIkram ? 0 : (it.fiyat || 0) * (it.adet || 0));
    lines.push({
      type: 'text',
      text: `${adet}x ${it.ad}${isIkram ? '  [İKRAM]' : ''}`,
      bold: isIkram,
    });
    lines.push({ type: 'text', text: `   ${tutar} TL`, align: 'right', size: 24 });
    if (it.notlar) {
      lines.push({ type: 'text', text: `   (${it.notlar})`, size: 22, italic: true });
    }
  }

  lines.push({ type: 'divider' });
  lines.push({ type: 'text', text: `Ara Toplam: ${fmt(order.araToplam)} TL`, align: 'right', size: 22 });
  if (order.indirim > 0) {
    lines.push({ type: 'text', text: `İndirim: -${fmt(order.indirim)} TL`, align: 'right', size: 22 });
  }
  lines.push({
    type: 'text',
    text: `${isAdisyon ? 'ÖDENECEK' : 'TOPLAM'}: ${fmt(order.toplam)} TL`,
    align: 'right',
    size: 36,
    bold: true,
  });

  // Ödeme bölümü — sadece gerçek fişte (adisyon değil)
  if (!isAdisyon && payments.length > 0) {
    lines.push({ type: 'divider' });
    for (const p of payments) {
      const lbl =
        p.yontem === 'nakit'
          ? 'NAKİT'
          : p.yontem === 'kart'
            ? `KART${p.kartTipi ? ` (${p.kartTipi})` : ''}`
            : p.yontem === 'uygulama'
              ? `${(p.kartTipi || 'UYGULAMA').toUpperCase()}`
              : 'YEMEK KARTI';
      lines.push({ type: 'text', text: `${lbl}: ${fmt(p.tutar)} TL`, align: 'right', size: 24 });
    }
    if (change > 0) {
      lines.push({ type: 'text', text: `Para Üstü: ${fmt(change)} TL`, align: 'right', bold: true });
    }
  }

  lines.push({ type: 'feed', lines: 1 });
  if (isAdisyon) {
    lines.push({
      type: 'text',
      text: 'Bu adisyon mali belge degildir',
      align: 'center',
      size: 20,
    });
  } else {
    const altMesaj = settings.fisAltMesaji || 'Teşekkür ederiz';
    lines.push({ type: 'text', text: altMesaj, align: 'center', size: 24 });
  }
  lines.push({
    type: 'text',
    text: 'powered by {S} syntrixCode',
    align: 'center',
    size: 18,
  });

  return lines;
}
