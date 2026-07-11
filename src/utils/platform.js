/**
 * Platform (Trendyol / Yemeksepeti / Getir / Migros) GÖRÜNEN adı.
 *
 * `order.paketKaynakAd` platformun KENDİ gönderdiği addır (örn. "Trendyol Yemek").
 * Ekranlarda ve mutfak fişinde bizim etiketimizi kullanırız ("Trendyol Paket").
 *
 * DİKKAT: Adres maskeleme tespitinde (isMaskedAddress) ham `paketKaynakAd` kullanılmalı —
 * çünkü maskeli adres alanları platformun kendi string'iyle ("Trendyol Yemek") dolduruluyor.
 */
export const PLATFORM_ADLARI = {
  trendyol: 'Trendyol Paket',
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  migros: 'Migros Yemek',
};

/** Siparişin gösterilecek platform adı. */
export function platformAd(order) {
  if (!order) return '';
  return PLATFORM_ADLARI[order.paketKaynak] || order.paketKaynakAd || '';
}

/** Platform kuryesi etiketi — "Trendyol Paket Kuryesi" gibi. */
export function platformKuryeAd(order) {
  const ad = platformAd(order);
  if (ad) return `${ad} Kuryesi`;
  return order?.platformKuryeAdi || 'Platform Kuryesi';
}
