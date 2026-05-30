/**
 * Müşteri QR menüsü için basit çoklu dil desteği.
 * Ürün/kategori adları doc'taki `ceviri` alanından okunur (yoksa TR'ye düşer).
 */

export const MENU_LANGS = [
  { code: 'tr', label: 'TR', name: 'Türkçe', dir: 'ltr' },
  { code: 'en', label: 'EN', name: 'English', dir: 'ltr' },
  { code: 'ar', label: 'AR', name: 'العربية', dir: 'rtl' },
];

const STRINGS = {
  tr: {
    menuHazirlaniyor: 'Menü hazırlanıyor.',
    kategoriBos: 'Bu kategoride ürün yok.',
    tukendi: 'Tükendi',
    garsonCagir: 'Garson Çağır',
    garsonCagrildi: 'Garson çağrıldı',
    hesapIste: 'Hesap İste',
    hesapIstendi: 'Hesap istendi',
  },
  en: {
    menuHazirlaniyor: 'Menu is being prepared.',
    kategoriBos: 'No items in this category.',
    tukendi: 'Sold out',
    garsonCagir: 'Call Waiter',
    garsonCagrildi: 'Waiter called',
    hesapIste: 'Request Bill',
    hesapIstendi: 'Bill requested',
  },
  ar: {
    menuHazirlaniyor: 'القائمة قيد الإعداد.',
    kategoriBos: 'لا توجد عناصر في هذه الفئة.',
    tukendi: 'نفد',
    garsonCagir: 'استدعاء النادل',
    garsonCagrildi: 'تم استدعاء النادل',
    hesapIste: 'طلب الفاتورة',
    hesapIstendi: 'تم طلب الفاتورة',
  },
};

export function t(lang, key) {
  return (STRINGS[lang] || STRINGS.tr)[key] || STRINGS.tr[key] || key;
}

export function dirFor(lang) {
  return MENU_LANGS.find((l) => l.code === lang)?.dir || 'ltr';
}

/**
 * Bir doc'tan (ürün/kategori) seçili dile göre alanı döndürür.
 * `ceviri[lang][field]` doluysa onu, değilse TR'deki `field` değerini verir.
 */
export function localized(doc, lang, field) {
  if (!doc) return '';
  if (lang && lang !== 'tr') {
    const tr = doc.ceviri?.[lang]?.[field];
    if (tr && String(tr).trim()) return tr;
  }
  return doc[field] || '';
}
