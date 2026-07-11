/**
 * Mutfak/bar yazıcı yönlendirmesi.
 *
 * Kategorilere `yaziciId` atanabilir (örn. "İçecekler" → bar yazıcısı).
 * Atanmamış kategoriler varsayılan (mutfak) yazıcıya gider.
 * Böylece tek bir siparişin kalemleri birden fazla yazıcıya bölünebilir.
 */

/**
 * Aktif ve IP'si olan yazıcılar arasından varsayılanı seçer.
 * `varsayilan` işaretli yoksa ilk aktif yazıcıyı döndürür.
 */
export function pickDefaultPrinter(printers) {
  const active = (printers || []).filter((p) => p.aktif && p.ip);
  return active.find((p) => p.varsayilan) || active[0] || null;
}

/**
 * Sipariş kalemlerini hedef yazıcılarına göre gruplar.
 *
 * Öncelik sırası (kalem başına):
 *   1. Ürün-bazlı `yaziciIds` (çoklu) — aktif yazıcılara denk gelenler. Bir kalem
 *      birden fazla istasyona atanmışsa HER birinin grubuna eklenir (çoğaltılır),
 *      böylece aynı ürün birden çok mutfak istasyonundan basılır.
 *   2. Kategorinin `yaziciId`'si (tek, geriye uyumlu).
 *   3. Varsayılan yazıcı.
 *
 * @returns {Array<{ printer, items }>} — aktif yazıcı yoksa boş dizi.
 */
export function groupItemsByPrinter(items, categories, printers, products = []) {
  const active = (printers || []).filter((p) => p.aktif && p.ip);
  if (active.length === 0) return [];
  const def = pickDefaultPrinter(printers);
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  const printerById = new Map(active.map((p) => [p.id, p]));

  const groups = new Map(); // printerId -> { printer, items }
  const addToGroup = (printer, item) => {
    if (!groups.has(printer.id)) groups.set(printer.id, { printer, items: [] });
    groups.get(printer.id).items.push(item);
  };

  for (const it of items || []) {
    for (const t of resolveTargets(it, catById, printerById, def, products)) addToGroup(t, it);
  }
  return [...groups.values()];
}

function normalizeAd(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[^0-9a-zğüşıöç]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Platform (Trendyol / Yemeksepeti / Getir) siparişlerinin kalemlerinde
 * `productId` / `categoryId` / `yaziciIds` YOKTUR — platform ürün adını DÜZ METİN
 * olarak gönderir. Bu yüzden bu kalemler yönlendirilemiyor ve hepsi VARSAYILAN
 * yazıcıya düşüyordu (ör. sadece çorba yazıcısından çıkması).
 *
 * Çözüm: kalem adını menüdeki ürünle eşleştir, o ürünün yönlendirmesini kullan.
 * Platform menüsü restoranın menüsünden kopyalandığı için adlar genelde birebir aynıdır.
 */
function matchProductByName(ad, products) {
  const n = normalizeAd(ad);
  if (!n || !products || products.length === 0) return null;

  // 1) Birebir eşleşme
  let hit = products.find((p) => normalizeAd(p.ad) === n);
  if (hit) return hit;

  // 2) Baştan eşleşme — porsiyon/ek ibareleri farkını tolere et
  //    ("Etli Ekmek İri Kıymalı (Büyük)" ↔ "Etli Ekmek İri Kıymalı")
  hit = products.find((p) => {
    const pn = normalizeAd(p.ad);
    return pn && (n.startsWith(pn) || pn.startsWith(n));
  });
  if (hit) return hit;

  // 3) İçerme — en UZUN eşleşen ürün adı kazansın ("ayran" yerine "ayran büyük" varsa doğru olan)
  const cands = products
    .filter((p) => {
      const pn = normalizeAd(p.ad);
      return pn && pn.length >= 3 && (n.includes(pn) || pn.includes(n));
    })
    .sort((a, b) => normalizeAd(b.ad).length - normalizeAd(a.ad).length);
  return cands[0] || null;
}

/**
 * Bir kalemin (eklenen/silinen/değişen) gideceği aktif yazıcıları çözer.
 * Öncelik: ürün yaziciIds (çoklu) → kategori yaziciId → varsayılan.
 * Yönlendirme bilgisi hiç yoksa (platform siparişi) ürün ADINDAN eşleştirilir.
 */
function resolveTargets(it, catById, printerById, def, products) {
  let ids = Array.isArray(it.yaziciIds) ? it.yaziciIds : [];
  let categoryId = it.categoryId;

  // Platform siparişi → routing bilgisi yok, ürün adından çöz
  if (ids.length === 0 && !categoryId && it.ad) {
    const p = matchProductByName(it.ad, products);
    if (p) {
      ids = Array.isArray(p.yaziciIds) ? p.yaziciIds : [];
      categoryId = p.categoryId;
    }
  }

  const targets = ids.map((id) => printerById.get(id)).filter(Boolean);
  if (targets.length > 0) return targets;
  const cat = categoryId ? catById.get(categoryId) : null;
  const yId = cat?.yaziciId;
  const t = (yId && printerById.get(yId)) || def;
  return t ? [t] : [];
}

/**
 * Mutfak fişini yazıcılara göre gruplar — hem EKLENEN kalemleri hem DÜZELTME
 * farkını (iptal edilen / adet değişen) aynı yönlendirme mantığıyla dağıtır.
 * Böylece bir ürün siparişten çıkarılınca/azaltılınca, o ürünün hazırlandığı
 * istasyon(lar)a düzeltme fişi basılır (boş yere fazla üretim olmasın).
 *
 * @param {{items?:Array, removed?:Array, changed?:Array}} payload
 * @returns {Array<{printer, items, removed, changed}>} aktif yazıcı yoksa []
 */
export function groupTicketByPrinter(
  { items = [], removed = [], changed = [] } = {},
  categories,
  printers,
  products = [], // platform siparişlerinde ad-eşleştirme için menü ürünleri
) {
  const active = (printers || []).filter((p) => p.aktif && p.ip);
  if (active.length === 0) return [];
  const def = pickDefaultPrinter(printers);
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  const printerById = new Map(active.map((p) => [p.id, p]));

  const groups = new Map(); // printerId -> { printer, items, removed, changed }
  const ensure = (printer) => {
    if (!groups.has(printer.id)) groups.set(printer.id, { printer, items: [], removed: [], changed: [] });
    return groups.get(printer.id);
  };
  for (const it of items || [])
    for (const p of resolveTargets(it, catById, printerById, def, products)) ensure(p).items.push(it);
  for (const it of removed || [])
    for (const p of resolveTargets(it, catById, printerById, def, products)) ensure(p).removed.push(it);
  for (const it of changed || [])
    for (const p of resolveTargets(it, catById, printerById, def, products)) ensure(p).changed.push(it);
  return [...groups.values()];
}
