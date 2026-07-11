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

/** Bir kaydın (sipariş/ödeme/arşiv) test verisi olup olmadığı. */
export function isTestRecord(rec) {
  return rec?.test === true || isTestAccount(rec?.garsonAd) || isTestAccount(rec?.kasiyerAd);
}

/** Rapor/ciro toplamları için: test kayıtlarını dışla. */
export function excludeTest(list) {
  return (list || []).filter((r) => !isTestRecord(r));
}
