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
export function groupItemsByPrinter(items, categories, printers) {
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
    // 1) Ürün-bazlı çoklu yazıcı — aktif olanlara denk gelenler
    const ids = Array.isArray(it.yaziciIds) ? it.yaziciIds : [];
    const targets = ids.map((id) => printerById.get(id)).filter(Boolean);
    if (targets.length > 0) {
      for (const t of targets) addToGroup(t, it);
      continue;
    }
    // 2) Kategori-bazlı tek yazıcı, yoksa 3) varsayılan
    const cat = it.categoryId ? catById.get(it.categoryId) : null;
    const yId = cat?.yaziciId;
    const target = (yId && printerById.get(yId)) || def;
    if (!target) continue;
    addToGroup(target, it);
  }
  return [...groups.values()];
}
