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
    tel: 'Tel',
    masa: 'Masa',
    menu: 'MENÜ',
    ara: 'Menüde ara…',
    sonucYok: 'Sonuç bulunamadı.',
    oneCikanlar: 'Şefin Önerisi',
    rezervasyon: 'Rezervasyon',
    bizeUlasin: 'Bize Ulaşın',
    konum: 'Konum',
    calismaSaatleri: 'Çalışma Saatleri',
    instagram: 'Instagram',
    googleDegerlendir: "Google'da Değerlendir",
    rozet_populer: 'Popüler',
    rozet_yeni: 'Yeni',
    rozet_acili: 'Acılı',
    rozet_vejetaryen: 'Vejetaryen',
    rozet_sef: 'Şefin Önerisi',
  },
  en: {
    menuHazirlaniyor: 'Menu is being prepared.',
    kategoriBos: 'No items in this category.',
    tukendi: 'Sold out',
    garsonCagir: 'Call Waiter',
    garsonCagrildi: 'Waiter called',
    hesapIste: 'Request Bill',
    hesapIstendi: 'Bill requested',
    tel: 'Phone',
    masa: 'Table',
    menu: 'MENU',
    ara: 'Search the menu…',
    sonucYok: 'No results found.',
    oneCikanlar: "Chef's Picks",
    rezervasyon: 'Reservation',
    bizeUlasin: 'Contact Us',
    konum: 'Location',
    calismaSaatleri: 'Opening Hours',
    instagram: 'Instagram',
    googleDegerlendir: 'Review on Google',
    rozet_populer: 'Popular',
    rozet_yeni: 'New',
    rozet_acili: 'Spicy',
    rozet_vejetaryen: 'Vegetarian',
    rozet_sef: "Chef's Pick",
  },
  ar: {
    menuHazirlaniyor: 'القائمة قيد الإعداد.',
    kategoriBos: 'لا توجد عناصر في هذه الفئة.',
    tukendi: 'نفد',
    garsonCagir: 'استدعاء النادل',
    garsonCagrildi: 'تم استدعاء النادل',
    hesapIste: 'طلب الفاتورة',
    hesapIstendi: 'تم طلب الفاتورة',
    tel: 'هاتف',
    masa: 'طاولة',
    menu: 'القائمة',
    ara: 'ابحث في القائمة…',
    sonucYok: 'لا توجد نتائج.',
    oneCikanlar: 'اختيار الشيف',
    rezervasyon: 'حجز',
    bizeUlasin: 'تواصل معنا',
    konum: 'الموقع',
    calismaSaatleri: 'ساعات العمل',
    instagram: 'انستغرام',
    googleDegerlendir: 'قيّمنا على جوجل',
    rozet_populer: 'شائع',
    rozet_yeni: 'جديد',
    rozet_acili: 'حار',
    rozet_vejetaryen: 'نباتي',
    rozet_sef: 'اختيار الشيف',
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
