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
export function buildKitchenTicketLines({ order, items, isAddendum = false }) {
  const lines = [];
  lines.push({
    type: 'text',
    text: isAddendum ? 'EK SİPARİŞ' : 'MUTFAK ADİSYONU',
    align: 'center',
    size: 36,
    bold: true,
  });
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

  for (const it of items) {
    const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
    lines.push({
      type: 'text',
      text: `${adet}x ${it.ad}`,
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
  return lines;
}

/**
 * Müşteri hesap fişi için yardımcı.
 */
export function buildCustomerReceiptLines({ order, payments = [], settings = {}, change = 0 }) {
  const lines = [];
  const baslik = settings.fisBasligi || settings.restoranAd || 'RESTORAN';
  lines.push({ type: 'text', text: baslik, align: 'center', size: 36, bold: true });
  if (settings.restoranAdres) {
    lines.push({ type: 'text', text: settings.restoranAdres, align: 'center', size: 22 });
  }
  if (settings.restoranTel) {
    lines.push({ type: 'text', text: `Tel: ${settings.restoranTel}`, align: 'center', size: 22 });
  }
  lines.push({ type: 'divider' });

  const now = new Date();
  const tarih = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  lines.push({ type: 'text', text: `Tarih: ${tarih}` });
  lines.push({ type: 'text', text: `Masa: ${order.masaAd || 'Paket'}` });
  if (order.kisiSayisi != null) lines.push({ type: 'text', text: `Kişi: ${order.kisiSayisi}` });
  lines.push({ type: 'text', text: `Garson: ${order.garsonAd || '-'}` });
  lines.push({
    type: 'text',
    text: `Fiş No: ${String(order.id || '').slice(0, 8).toUpperCase()}`,
  });
  lines.push({ type: 'divider' });

  const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  for (const it of order.items || []) {
    const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
    const tutar = fmt((it.fiyat || 0) * (it.adet || 0));
    lines.push({ type: 'text', text: `${adet}x ${it.ad}` });
    lines.push({ type: 'text', text: `   ${tutar} TL`, align: 'right', size: 24 });
    if (it.notlar) {
      lines.push({ type: 'text', text: `   (${it.notlar})`, size: 22, italic: true });
    }
  }

  lines.push({ type: 'divider' });
  lines.push({ type: 'text', text: `Ara Toplam: ${fmt(order.araToplam)} TL`, align: 'right' });
  if (order.indirim > 0) {
    lines.push({ type: 'text', text: `İndirim: -${fmt(order.indirim)} TL`, align: 'right' });
  }
  lines.push({
    type: 'text',
    text: `TOPLAM: ${fmt(order.toplam)} TL`,
    align: 'right',
    size: 36,
    bold: true,
  });

  if (payments.length > 0) {
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
  const altMesaj = settings.fisAltMesaji || 'Teşekkür ederiz';
  lines.push({ type: 'text', text: altMesaj, align: 'center', size: 24 });

  return lines;
}
