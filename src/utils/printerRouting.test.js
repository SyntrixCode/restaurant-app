import { describe, it, expect } from 'vitest';
import { pickDefaultPrinter, groupItemsByPrinter } from './printerRouting';

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
});
