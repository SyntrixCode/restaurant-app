/**
 * Test/demo hesabı tespiti.
 *
 * Adı "Syntrix" ile başlayan hesaplar (Syntrix Garson, Syntrix Kasiyer, ...) restoranda
 * TEST amaçlıdır. Bu hesaplardan girilen siparişler ve alınan ödemeler `test: true` ile
 * işaretlenir ve ciroya / gün sonu / raporlara KARIŞMAZ. Böylece test sonrası elle
 * silmeye gerek kalmaz — gerçek verilerle karışmaz.
 *
 * Not: Mesai muafiyeti (ShiftButton) ve personel raporu da aynı "Syntrix*" kuralını kullanır.
 */
export function isTestAccount(ad) {
  return (ad || '').toLowerCase().startsWith('syntrix');
}

/**
 * Bir kaydın (sipariş/ödeme/arşiv) test verisi olup olmadığı.
 * Test = kaydın `test` işareti (sipariş garsondan set edilir) VEYA garson adı Syntrix.
 * `kasiyerAd` bilerek hariç: gerçek garsonun siparişini "Syntrix Kasiyer" tahsil edince
 * gerçek satış ciro dışı kalıyordu (gün sonu yazar kasayla tutmuyordu).
 */
export function isTestRecord(rec) {
  if (rec?.test === true) return true;
  // Açıkça test:false damgalı kayıt (ör. testGeriAlindi) GERÇEK satıştır — ada bakılmaz.
  if (rec?.test === false) return false;
  // `test` alanı hiç yoksa (eski kayıtlar) garson adına göre belirle.
  return isTestAccount(rec?.garsonAd);
}

/** Rapor/ciro toplamları için: test kayıtlarını dışla. */
export function excludeTest(list) {
  return (list || []).filter((r) => !isTestRecord(r));
}
