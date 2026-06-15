/**
 * Reçete birim dönüşümü.
 *
 * Malzeme stoğu kendi ANA biriminde tutulur (örn. un = kg). Reçetede ise
 * pratik olsun diye alt birimle (gram) girilebilir. Bu yardımcı, reçete
 * satırındaki miktarı malzemenin ana birimine çevirir; stok düşme ve maliyet
 * hep ana birim üzerinden doğru hesaplanır.
 */

const MASS = { kg: 1000, gram: 1 }; // gram cinsinden katsayı
const VOL = { lt: 1000, ml: 1 };    // ml cinsinden katsayı

/**
 * @param {number} miktar - reçete satırı miktarı
 * @param {string} [lineBirim] - satırda seçilen birim (yoksa ana birim varsayılır)
 * @param {string} [baseBirim] - malzemenin ana birimi
 * @returns {number} ana birim cinsinden miktar
 */
export function toBaseQty(miktar, lineBirim, baseBirim) {
  const m = Number(miktar) || 0;
  if (!lineBirim || !baseBirim || lineBirim === baseBirim) return m;
  if (MASS[lineBirim] && MASS[baseBirim]) return (m * MASS[lineBirim]) / MASS[baseBirim];
  if (VOL[lineBirim] && VOL[baseBirim]) return (m * VOL[lineBirim]) / VOL[baseBirim];
  return m; // uyumsuz boyut — olduğu gibi
}

/**
 * Bir malzemenin ana birimine göre reçetede seçilebilecek birimler.
 * Kütle (kg/gram) ve hacim (lt/ml) için iki seçenek; diğerlerinde tek.
 */
export function recipeUnitOptions(baseBirim) {
  if (MASS[baseBirim]) return ['kg', 'gram'];
  if (VOL[baseBirim]) return ['lt', 'ml'];
  return baseBirim ? [baseBirim] : [];
}
