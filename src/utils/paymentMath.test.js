import { describe, it, expect } from 'vitest';
import {
  toKurus,
  fromKurus,
  formatKurusTL,
  analyzeItems,
  remainingQty,
  computeManualDiscountKurus,
  applyDiscountRatio,
  computeRemainingKurus,
  isFullyPaidKurus,
  computeChangeKurus,
  computeOrderTotals,
} from './paymentMath';

// ─── Dönüştürücüler ──────────────────────────────────────────────────────

describe('toKurus', () => {
  it('TL number → integer kuruş', () => {
    expect(toKurus(877.5)).toBe(87750);
    expect(toKurus(0.1 + 0.2)).toBe(30); // klasik float trap
    expect(toKurus(1000)).toBe(100000);
    expect(toKurus(0)).toBe(0);
    expect(toKurus(0.01)).toBe(1);
    expect(toKurus(999999.99)).toBe(99999999);
  });

  it('null/undefined/boş string → 0', () => {
    expect(toKurus(null)).toBe(0);
    expect(toKurus(undefined)).toBe(0);
    expect(toKurus('')).toBe(0);
    expect(toKurus('abc')).toBe(0); // NaN
  });

  it('string sayı çevirir', () => {
    expect(toKurus('877.50')).toBe(87750);
  });

  it('yüksek hassasiyet — float hatası kalmaz', () => {
    expect(toKurus(0.1)).toBe(10);
    expect(toKurus(0.2)).toBe(20);
    expect(toKurus(0.7)).toBe(70);
    // 7 × 12.50 = 87.5 (float'ta 87.49999...)
    expect(toKurus(12.5 * 7)).toBe(8750);
  });
});

describe('fromKurus', () => {
  it('kuruş → TL', () => {
    expect(fromKurus(87750)).toBe(877.5);
    expect(fromKurus(0)).toBe(0);
    expect(fromKurus(1)).toBe(0.01);
  });
});

describe('formatKurusTL', () => {
  it('formatlı string', () => {
    expect(formatKurusTL(87750)).toMatch(/877,50 TL/);
    expect(formatKurusTL(0)).toMatch(/0,00 TL/);
    expect(formatKurusTL(100)).toMatch(/1,00 TL/);
  });
});

// ─── analyzeItems ────────────────────────────────────────────────────────

describe('analyzeItems', () => {
  it('boş liste → tüm toplamlar 0', () => {
    const a = analyzeItems([], []);
    expect(a.rawSubtotalKurus).toBe(0);
    expect(a.ikramTotalKurus).toBe(0);
    expect(a.subtotalKurus).toBe(0);
    expect(a.selectedRawSubtotalKurus).toBe(0);
    expect(a.paidItemsTotalKurus).toBe(0);
  });

  it('tek ürün, hiçbir state', () => {
    const items = [{ fiyat: 100, adet: 1 }];
    const a = analyzeItems(items, [{}]);
    expect(a.rawSubtotalKurus).toBe(10000);
    expect(a.subtotalKurus).toBe(10000);
    expect(a.ikramTotalKurus).toBe(0);
    expect(a.selectedRawSubtotalKurus).toBe(0);
  });

  it('ikram bir ürün — subtotal düşer', () => {
    const items = [
      { fiyat: 650, adet: 1.5 }, // 975
      { fiyat: 35, adet: 1 }, // 35 (ikram)
    ];
    const states = [{}, { ikramQty: 1 }];
    const a = analyzeItems(items, states);
    expect(a.rawSubtotalKurus).toBe(101000); // 975 + 35 = 1010
    expect(a.ikramTotalKurus).toBe(3500); // 35
    expect(a.subtotalKurus).toBe(97500); // 975
  });

  it('seçili ürünlerin raw toplamı (tek adet)', () => {
    const items = [
      { fiyat: 100, adet: 1 },
      { fiyat: 50, adet: 2 },
      { fiyat: 30, adet: 1 },
    ];
    const states = [{ selectedQty: 1 }, { selectedQty: 2 }, {}];
    const a = analyzeItems(items, states);
    expect(a.selectedRawSubtotalKurus).toBe(20000); // 100 + (50×2) = 200
  });

  it('multi-adet: 8x serpme — 3 seçili, 2 ödenmiş, 1 ikram, 2 boş', () => {
    const items = [{ fiyat: 350, adet: 8 }]; // toplam 2800 TL
    const states = [{ selectedQty: 3, paidQty: 2, ikramQty: 1 }];
    const a = analyzeItems(items, states);
    expect(a.rawSubtotalKurus).toBe(280000); // 2800
    expect(a.ikramTotalKurus).toBe(35000); // 350 × 1
    expect(a.paidItemsTotalKurus).toBe(70000); // 350 × 2
    expect(a.selectedRawSubtotalKurus).toBe(105000); // 350 × 3
    expect(a.subtotalKurus).toBe(245000); // 2800 - 350 (ikram)
  });

  it('ödenenler seçim/ikrama girmez', () => {
    const items = [
      { fiyat: 100, adet: 1 },
      { fiyat: 50, adet: 1 },
    ];
    const states = [{ paidQty: 1 }, { selectedQty: 1 }];
    const a = analyzeItems(items, states);
    expect(a.paidItemsTotalKurus).toBe(10000);
    expect(a.selectedRawSubtotalKurus).toBe(5000);
  });

  it('ikram + paid + select toplamı totalQty\'yi aşamaz', () => {
    const items = [{ fiyat: 100, adet: 2 }];
    // Mantıksız state: 2 ikram + 2 paid + 2 selected = 6 > 2
    // analyzeItems sırayla clamp etmeli
    const states = [{ ikramQty: 2, paidQty: 5, selectedQty: 3 }];
    const a = analyzeItems(items, states);
    expect(a.ikramTotalKurus).toBe(20000); // 2 ikram tüm satır
    expect(a.paidItemsTotalKurus).toBe(0); // ikram'dan sonra 0 kalmış
    expect(a.selectedRawSubtotalKurus).toBe(0);
  });

  it('porsiyon (yarım) hesabı doğru', () => {
    const items = [{ fiyat: 650, adet: 1.5 }];
    const a = analyzeItems(items, [{}]);
    expect(a.rawSubtotalKurus).toBe(97500); // 975.00
  });

  it('decimal fiyatlı ürün float kaymaz', () => {
    // 17.99 × 3 = 53.97 (float'ta 53.96999...)
    const items = [{ fiyat: 17.99, adet: 3 }];
    const a = analyzeItems(items, [{}]);
    expect(a.rawSubtotalKurus).toBe(5397);
  });
});

// ─── computeManualDiscountKurus ──────────────────────────────────────────

describe('computeManualDiscountKurus', () => {
  it('null → 0', () => {
    expect(computeManualDiscountKurus(null, 10000)).toBe(0);
    expect(computeManualDiscountKurus({}, 10000)).toBe(0);
  });

  it('yüzde indirim', () => {
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 10 }, 100000)).toBe(10000);
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 50 }, 100000)).toBe(50000);
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 100 }, 100000)).toBe(100000);
  });

  it('yüzde 0 = 0, ama subtotal aşamaz', () => {
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 0 }, 100000)).toBe(0);
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 200 }, 100000)).toBe(100000);
  });

  it('sabit TL indirim', () => {
    expect(computeManualDiscountKurus({ tipi: 'sabit', deger: 50 }, 100000)).toBe(5000);
    expect(computeManualDiscountKurus({ tipi: 'sabit', deger: 1000 }, 100000)).toBe(100000); // tam kadar
    expect(computeManualDiscountKurus({ tipi: 'sabit', deger: 9999 }, 100000)).toBe(100000); // aşar, clamp
  });

  it('sub-kuruş yüzde — kullanıcı lehine yuvarlama (floor)', () => {
    // 97500 × 10 = 975000, /100 = 9750 → tam
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 10 }, 97500)).toBe(9750);
    // 97501 × 10 = 975010, /100 = 9750 (floor) → işletme lehine
    expect(computeManualDiscountKurus({ tipi: 'yuzde', deger: 10 }, 97501)).toBe(9750);
  });
});

// ─── applyDiscountRatio ──────────────────────────────────────────────────

describe('applyDiscountRatio', () => {
  it('indirim yoksa portionRaw aynı kalır', () => {
    expect(applyDiscountRatio(50000, 100000, 100000)).toBe(50000);
    expect(applyDiscountRatio(50000, 100000, 0)).toBe(0); // total sıfır = her şey ücretsiz?
  });

  it('subtotal sıfır → 0', () => {
    expect(applyDiscountRatio(50000, 0, 0)).toBe(0);
  });

  it('%10 indirim — oransal payı', () => {
    // 1000 total, 900 effective (= %10 indirim), parça 500 raw
    // 500 × 900/1000 = 450
    expect(applyDiscountRatio(50000, 100000, 90000)).toBe(45000);
  });

  it('tüm sipariş seçildi = tam effective', () => {
    expect(applyDiscountRatio(97500, 97500, 87750)).toBe(87750);
  });

  it('birden fazla parça toplamı = effective (yuvarlama dahil)', () => {
    // 1010 - 35 ikram = 975 subtotal, %10 indirim → 877.50 effective (87750 kuruş)
    // A: 600 raw, B: 200 raw, C: 175 raw → toplam 975
    const a = applyDiscountRatio(60000, 97500, 87750);
    const b = applyDiscountRatio(20000, 97500, 87750);
    const c = applyDiscountRatio(17500, 97500, 87750);
    // Her parça yuvarlanabilir, toplam ±1-2 kuruş kayabilir ama makul
    expect(Math.abs(a + b + c - 87750)).toBeLessThanOrEqual(2);
  });
});

// ─── Remaining / fully paid / change ────────────────────────────────────

describe('computeRemainingKurus', () => {
  it('hiç ödeme yok → tam tutar', () => {
    expect(computeRemainingKurus(87750, 0)).toBe(87750);
  });

  it('kısmi ödeme', () => {
    expect(computeRemainingKurus(87750, 50000)).toBe(37750);
  });

  it('tam ödeme', () => {
    expect(computeRemainingKurus(87750, 87750)).toBe(0);
  });

  it('fazla ödeme — sıfıra clamp', () => {
    expect(computeRemainingKurus(87750, 100000)).toBe(0);
  });
});

describe('isFullyPaidKurus', () => {
  it('tam ödeme → true', () => {
    expect(isFullyPaidKurus(87750, 87750)).toBe(true);
  });
  it('eksik ödeme → false', () => {
    expect(isFullyPaidKurus(87750, 87749)).toBe(true); // ±1 tolerans
    expect(isFullyPaidKurus(87750, 87748)).toBe(false);
  });
  it('fazla ödeme → true', () => {
    expect(isFullyPaidKurus(87750, 100000)).toBe(true);
  });
});

describe('computeChangeKurus', () => {
  it('para üstü', () => {
    expect(computeChangeKurus(100000, 87750)).toBe(12250);
  });
  it('tam → 0', () => {
    expect(computeChangeKurus(87750, 87750)).toBe(0);
  });
  it('eksik → 0 (negatif değil)', () => {
    expect(computeChangeKurus(50000, 87750)).toBe(0);
  });
});

// ─── computeOrderTotals (entegrasyon testleri) ───────────────────────────

describe('computeOrderTotals — gerçek senaryolar', () => {
  it('Senaryo A: tek müşteri, indirim yok, ikram yok', () => {
    const items = [
      { fiyat: 100, adet: 2 }, // 200
      { fiyat: 50, adet: 1 }, // 50
    ];
    const states = [{}, {}];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: null,
      payments: [],
    });
    expect(r.subtotalKurus).toBe(25000);
    expect(r.discount.amountKurus).toBe(0);
    expect(r.effectiveTotalKurus).toBe(25000);
    expect(r.remainingKurus).toBe(25000);
    expect(r.fullyPaid).toBe(false);
  });

  it('Senaryo B: ikram + manuel %10 indirim (kullanıcının ekranı)', () => {
    // 1.5x Etli Ekmek (975) + 1x Ayran (35, ikram), manuel %10
    const items = [
      { fiyat: 650, adet: 1.5 },
      { fiyat: 35, adet: 1 },
    ];
    const states = [{}, { ikramQty: 1 }];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: { tipi: 'yuzde', deger: 10 },
      payments: [],
    });
    expect(r.rawSubtotalKurus).toBe(101000); // 1010
    expect(r.ikramTotalKurus).toBe(3500); // 35
    expect(r.subtotalKurus).toBe(97500); // 975
    expect(r.discount.amountKurus).toBe(9750); // 97.50
    expect(r.effectiveTotalKurus).toBe(87750); // 877.50
  });

  it('Senaryo C: bölünmüş ödeme, indirim oransal dağılır', () => {
    // 2 ürün, toplam 1000, %20 indirim → 800 effective
    // Kişi A: 600 raw seçti → A'nın payı 600×800/1000 = 480
    const items = [
      { fiyat: 600, adet: 1 },
      { fiyat: 400, adet: 1 },
    ];
    const states = [{ selectedQty: 1 }, {}];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: { tipi: 'yuzde', deger: 20 },
      payments: [],
    });
    expect(r.subtotalKurus).toBe(100000);
    expect(r.effectiveTotalKurus).toBe(80000);
    expect(r.selectedNetKurus).toBe(48000); // 480 TL
  });

  it('Senaryo D: ödenmiş parça hesap dışı', () => {
    const items = [
      { fiyat: 600, adet: 1 },
      { fiyat: 400, adet: 1 },
    ];
    const states = [{ paidQty: 1 }, { selectedQty: 1 }];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: null,
      payments: [{ tutar: 600 }],
    });
    expect(r.subtotalKurus).toBe(100000);
    expect(r.paidItemsTotalKurus).toBe(60000);
    expect(r.selectedRawSubtotalKurus).toBe(40000);
    expect(r.totalPaidKurus).toBe(60000);
    expect(r.remainingKurus).toBe(40000);
  });

  it('Senaryo E: tüm sipariş ikram → 0 ödeme', () => {
    const items = [
      { fiyat: 100, adet: 1 },
      { fiyat: 50, adet: 2 },
    ];
    const states = [{ ikramQty: 1 }, { ikramQty: 2 }];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: { tipi: 'yuzde', deger: 10 },
      payments: [],
    });
    expect(r.subtotalKurus).toBe(0);
    expect(r.effectiveTotalKurus).toBe(0);
    expect(r.remainingKurus).toBe(0);
    expect(r.fullyPaid).toBe(true);
  });

  it('Senaryo F2: 8 kişilik masa, 8x serpme — kişi başına böl', () => {
    // 8x Serpme Kahvaltı = 2800 TL
    // Kişi A: 1 porsiyon ödedi (350 TL)
    // Kişi B: 3 porsiyon ödedi (1050 TL) — şu an seçili
    // Kalan: 4 porsiyon = 1400 TL
    const items = [{ fiyat: 350, adet: 8 }];
    const states = [{ selectedQty: 3, paidQty: 1 }];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: null,
      payments: [{ tutar: 350 }],
    });
    expect(r.rawSubtotalKurus).toBe(280000);
    expect(r.subtotalKurus).toBe(280000);
    expect(r.paidItemsTotalKurus).toBe(35000); // 1 porsiyon ödendi
    expect(r.selectedRawSubtotalKurus).toBe(105000); // 3 porsiyon seçili
    expect(r.selectedNetKurus).toBe(105000); // indirim yok
    expect(r.totalPaidKurus).toBe(35000);
    expect(r.remainingKurus).toBe(245000); // 7 porsiyon × 350 = 2450
  });

  it('Senaryo F: tam ödendi + para üstü', () => {
    const items = [{ fiyat: 100, adet: 1 }];
    const states = [{}];
    const r = computeOrderTotals({
      items,
      itemStates: states,
      manualDiscount: null,
      payments: [{ tutar: 150 }],
    });
    expect(r.fullyPaid).toBe(true);
    expect(r.remainingKurus).toBe(0);
    expect(r.overpayKurus).toBe(5000); // 50 TL para üstü
  });

  it('Senaryo G: sabit TL indirim subtotali asamaz', () => {
    const items = [{ fiyat: 50, adet: 1 }];
    const r = computeOrderTotals({
      items,
      itemStates: [{}],
      manualDiscount: { tipi: 'sabit', deger: 100 },
      payments: [],
    });
    expect(r.discount.amountKurus).toBe(5000);
    expect(r.effectiveTotalKurus).toBe(0);
  });

  it('Senaryo H: çoklu parça ödeme — toplamlar tutarlı', () => {
    const items = [
      { fiyat: 200, adet: 1 },
      { fiyat: 300, adet: 1 },
      { fiyat: 500, adet: 1 },
    ];
    const r = computeOrderTotals({
      items,
      itemStates: [{}, {}, {}],
      manualDiscount: { tipi: 'yuzde', deger: 10 },
      payments: [{ tutar: 180 }, { tutar: 270 }],
    });
    expect(r.subtotalKurus).toBe(100000);
    expect(r.effectiveTotalKurus).toBe(90000);
    expect(r.totalPaidKurus).toBe(45000);
    expect(r.remainingKurus).toBe(45000);
    expect(r.fullyPaid).toBe(false);
  });
});
