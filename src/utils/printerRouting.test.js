import { describe, it, expect } from 'vitest';
import { pickDefaultPrinter, groupItemsByPrinter, groupTicketByPrinter } from './printerRouting';

const mutfak = { id: 'p1', ad: 'Mutfak', ip: '192.168.1.50', aktif: true, varsayilan: true };
const bar = { id: 'p2', ad: 'Bar', ip: '192.168.1.51', aktif: true, varsayilan: false };
const printers = [mutfak, bar];

const categories = [
  { id: 'c1', ad: 'Kebaplar', yaziciId: null }, // → varsayılan (mutfak)
  { id: 'c2', ad: 'İçecekler', yaziciId: 'p2' }, // → bar
];

describe('pickDefaultPrinter', () => {
  it('varsayilan işaretliyi seçer', () => {
    expect(pickDefaultPrinter(printers)?.id).toBe('p1');
  });

  it('varsayilan yoksa ilk aktifi seçer', () => {
    const r = pickDefaultPrinter([{ ...bar, varsayilan: false }, { ...mutfak, varsayilan: false }]);
    expect(r?.id).toBe('p2');
  });

  it('aktif/IP olmayanları eler', () => {
    expect(pickDefaultPrinter([{ id: 'x', aktif: false, ip: '1.2.3.4' }])).toBeNull();
    expect(pickDefaultPrinter([{ id: 'x', aktif: true }])).toBeNull();
  });
});

describe('groupItemsByPrinter', () => {
  it('kalemleri kategoriye göre mutfak/bar yazıcısına böler', () => {
    const items = [
      { ad: 'Adana', categoryId: 'c1' },
      { ad: 'Ayran', categoryId: 'c2' },
      { ad: 'Kola', categoryId: 'c2' },
    ];
    const groups = groupItemsByPrinter(items, categories, printers);
    expect(groups).toHaveLength(2);
    const byPrinter = Object.fromEntries(groups.map((g) => [g.printer.id, g.items.map((i) => i.ad)]));
    expect(byPrinter.p1).toEqual(['Adana']);
    expect(byPrinter.p2).toEqual(['Ayran', 'Kola']);
  });

  it('kategorisiz/atanmamış kalem varsayılana gider', () => {
    const items = [{ ad: 'X', categoryId: null }, { ad: 'Y', categoryId: 'bilinmeyen' }];
    const groups = groupItemsByPrinter(items, categories, printers);
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p1');
    expect(groups[0].items).toHaveLength(2);
  });

  it('hedef yazıcı pasifse varsayılana düşer', () => {
    const cats = [{ id: 'c2', yaziciId: 'p2' }];
    const onlyMutfak = [mutfak, { ...bar, aktif: false }];
    const groups = groupItemsByPrinter([{ ad: 'Kola', categoryId: 'c2' }], cats, onlyMutfak);
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p1');
  });

  it('hiç aktif yazıcı yoksa boş döner (çağıran fallback yapar)', () => {
    const groups = groupItemsByPrinter([{ ad: 'X', categoryId: 'c1' }], categories, [
      { ...mutfak, aktif: false },
    ]);
    expect(groups).toEqual([]);
  });

  it('tek yazıcılı kurulumda her şey tek grupta', () => {
    const groups = groupItemsByPrinter(
      [{ ad: 'A', categoryId: 'c1' }, { ad: 'B', categoryId: 'c2' }],
      categories,
      [mutfak], // bar yok
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('ürün yaziciIds (çoklu) → kalem her istasyona basılır', () => {
    const items = [{ ad: 'Köy Kahvaltısı', categoryId: 'c1', yaziciIds: ['p1', 'p2'] }];
    const groups = groupItemsByPrinter(items, categories, printers);
    expect(groups).toHaveLength(2);
    const byPrinter = Object.fromEntries(groups.map((g) => [g.printer.id, g.items.map((i) => i.ad)]));
    expect(byPrinter.p1).toEqual(['Köy Kahvaltısı']);
    expect(byPrinter.p2).toEqual(['Köy Kahvaltısı']);
  });

  it('ürün yaziciIds kategoriyi ezer (override)', () => {
    // Kategori c1 → varsayılan (p1) ama ürün yaziciIds=[p2] → p2'ye gider
    const items = [{ ad: 'Sahanda', categoryId: 'c1', yaziciIds: ['p2'] }];
    const groups = groupItemsByPrinter(items, categories, printers);
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p2');
  });

  it('yaziciIds boşsa kategori kuralına düşer (geriye uyumlu)', () => {
    const items = [{ ad: 'Ayran', categoryId: 'c2', yaziciIds: [] }];
    const groups = groupItemsByPrinter(items, categories, printers);
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p2');
  });

  it('yaziciIds pasif/bilinmeyen yazıcıya işaret ediyorsa kategori/varsayılana düşer', () => {
    const items = [{ ad: 'X', categoryId: 'c2', yaziciIds: ['silinmis'] }];
    const groups = groupItemsByPrinter(items, categories, printers);
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p2'); // c2 → p2
  });

  it('çoklu yazıcıdan biri pasifse sadece aktif olana basılır', () => {
    const items = [{ ad: 'Köy Kahvaltısı', yaziciIds: ['p1', 'p2'] }];
    const onlyMutfak = [mutfak, { ...bar, aktif: false }];
    const groups = groupItemsByPrinter(items, [], onlyMutfak);
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p1');
  });
});

describe('groupTicketByPrinter (düzeltme farkı yönlendirme)', () => {
  it('silinen kalem ilgili yazıcıya düzeltme olarak gider', () => {
    const groups = groupTicketByPrinter(
      { removed: [{ ad: 'Pide', yaziciIds: ['p2'] }] },
      categories,
      printers,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p2');
    expect(groups[0].removed.map((i) => i.ad)).toEqual(['Pide']);
    expect(groups[0].items).toEqual([]);
  });

  it('değişen kalem kategori yazıcısına gider', () => {
    const groups = groupTicketByPrinter(
      { changed: [{ ad: 'Ayran', categoryId: 'c2', fromAdet: 6, toAdet: 5 }] },
      categories,
      printers,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].printer.id).toBe('p2');
    expect(groups[0].changed).toHaveLength(1);
  });

  it('eklenen + silinen ayrı yazıcılara dağılır', () => {
    const groups = groupTicketByPrinter(
      {
        items: [{ ad: 'Adana', yaziciIds: ['p1'] }],
        removed: [{ ad: 'Kola', yaziciIds: ['p2'] }],
      },
      categories,
      printers,
    );
    const byId = Object.fromEntries(groups.map((g) => [g.printer.id, g]));
    expect(byId.p1.items.map((i) => i.ad)).toEqual(['Adana']);
    expect(byId.p1.removed).toEqual([]);
    expect(byId.p2.removed.map((i) => i.ad)).toEqual(['Kola']);
    expect(byId.p2.items).toEqual([]);
  });

  it('çoklu yazıcılı silinen kalem her istasyonun düzeltmesine girer', () => {
    const groups = groupTicketByPrinter(
      { removed: [{ ad: 'Köy Kahvaltısı', yaziciIds: ['p1', 'p2'] }] },
      categories,
      printers,
    );
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(g.removed.map((i) => i.ad)).toEqual(['Köy Kahvaltısı']);
  });

  it('aktif yazıcı yoksa boş döner', () => {
    const groups = groupTicketByPrinter(
      { removed: [{ ad: 'X', yaziciIds: ['p1'] }] },
      categories,
      [{ ...mutfak, aktif: false }],
    );
    expect(groups).toEqual([]);
  });
});

// ── Platform (Trendyol/Yemeksepeti) siparişleri ──────────────────────────────
// Platform kalemleri DÜZ METİN gelir: productId/categoryId/yaziciIds YOKTUR.
// Bu yüzden eskiden hepsi varsayılan yazıcıya düşüyordu (ör. sadece çorba).
// Artık kalem ADI menüdeki ürünle eşleştirilip doğru istasyona yönlendirilir.
describe('platform siparişi — ürün adından yazıcı yönlendirme', () => {
  const firin = { id: 'p3', ad: 'Fırın', ip: '192.168.1.52', aktif: true };
  const pList = [mutfak, bar, firin];
  const cats = [
    { id: 'c1', ad: 'Çorbalar', yaziciId: null }, // → varsayılan (mutfak)
    { id: 'c2', ad: 'İçecekler', yaziciId: 'p2' }, // → bar
    { id: 'c3', ad: 'Pideler', yaziciId: 'p3' }, // → fırın
  ];
  const products = [
    { id: 'u1', ad: 'Etli Ekmek İri Kıymalı', categoryId: 'c3', yaziciIds: [] },
    { id: 'u2', ad: 'Ayran', categoryId: 'c2', yaziciIds: [] },
    { id: 'u3', ad: 'Mercimek Çorbası', categoryId: 'c1', yaziciIds: [] },
  ];

  it('platform kalemini adından eşleştirip doğru istasyona yollar', () => {
    const items = [
      { ad: 'Etli Ekmek İri Kıymalı', adet: 2 }, // → fırın
      { ad: 'Ayran', adet: 1 }, // → bar
      { ad: 'Mercimek Çorbası', adet: 1 }, // → mutfak (varsayılan)
    ];
    const groups = groupTicketByPrinter({ items }, cats, pList, products);
    const byId = Object.fromEntries(groups.map((g) => [g.printer.id, g.items.map((i) => i.ad)]));
    expect(byId.p3).toEqual(['Etli Ekmek İri Kıymalı']); // fırın
    expect(byId.p2).toEqual(['Ayran']); // bar
    expect(byId.p1).toEqual(['Mercimek Çorbası']); // mutfak
  });

  it('ad tam eşleşmese de (porsiyon/ek ibare) doğru istasyona gider', () => {
    const items = [{ ad: 'Etli Ekmek İri Kıymalı (Büyük)', adet: 1 }];
    const groups = groupTicketByPrinter({ items }, cats, pList, products);
    expect(groups[0].printer.id).toBe('p3'); // fırın
  });

  it('menüde olmayan ürün varsayılan yazıcıya düşer (eski davranış korunur)', () => {
    const items = [{ ad: 'Bilinmeyen Ürün XYZ', adet: 1 }];
    const groups = groupTicketByPrinter({ items }, cats, pList, products);
    expect(groups[0].printer.id).toBe('p1'); // varsayılan
  });

  it('ürünler verilmezse eski davranış (varsayılan) bozulmaz', () => {
    const items = [{ ad: 'Etli Ekmek İri Kıymalı', adet: 1 }];
    const groups = groupTicketByPrinter({ items }, cats, pList);
    expect(groups[0].printer.id).toBe('p1');
  });
});
