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
 * @returns {Array<{ printer, items }>} — aktif yazıcı yoksa boş dizi.
 */
export function groupItemsByPrinter(items, categories, printers) {
  const active = (printers || []).filter((p) => p.aktif && p.ip);
  if (active.length === 0) return [];
  const def = pickDefaultPrinter(printers);
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  const printerById = new Map(active.map((p) => [p.id, p]));

  const groups = new Map(); // printerId -> { printer, items }
  for (const it of items || []) {
    const cat = it.categoryId ? catById.get(it.categoryId) : null;
    const yId = cat?.yaziciId;
    const target = (yId && printerById.get(yId)) || def;
    if (!target) continue;
    if (!groups.has(target.id)) groups.set(target.id, { printer: target, items: [] });
    groups.get(target.id).items.push(it);
  }
  return [...groups.values()];
}
