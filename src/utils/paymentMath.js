/**
 * Para hesabı utility — kuruş tabanlı integer aritmetik.
 *
 * JavaScript'in floating-point sorunlarını ortadan kaldırmak için tüm
 * hesaplar integer (kuruş) cinsinden yapılır. 877.50 TL = 87750 kuruş.
 *
 * Tek doğruluk kaynağı (single source of truth) — hem client (Payment.jsx)
 * hem server (recordPayment) bu fonksiyonları kullanır. İki tarafın aynı
 * sonucu vermesi garantilidir.
 *
 * NOT: Bu modül pure (yan etkisiz, deterministik). Test'ten test'e
 * davranış değişmemelidir.
 */

const KURUS = 100;

// ─── Dönüştürücüler ──────────────────────────────────────────────────────

/**
 * TL number → kuruş integer. 877.5 → 87750. 877.504 → 87750 (truncate).
 * Negatif girdi de doğru çalışır.
 */
export function toKurus(tl) {
  if (tl == null || tl === '') return 0;
  const n = Number(tl);
  if (!Number.isFinite(n)) return 0;
  // Math.round float yuvarlama hatasını azaltır.
  return Math.round(n * KURUS);
}

/**
 * Kuruş integer → TL number. 87750 → 877.5.
 * Display amaçlı, hesap içinde KULLANMA — kuruş'ta kal.
 */
export function fromKurus(kurus) {
  const n = Number(kurus);
  if (!Number.isFinite(n)) return 0;
  return n / KURUS;
}

/**
 * Kuruş integer → "877,50 TL" formatlı string.
 */
export function formatKurusTL(kurus) {
  const n = fromKurus(kurus);
  return (
    new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + ' TL'
  );
}

// ─── Sipariş özeti ────────────────────────────────────────────────────────

/**
 * Sipariş öğelerini ve durumlarını analiz eder.
 *
 * itemStates quantity-tabanlı: her satırın toplam adedinin ne kadarı
 * seçili, ne kadarı ikram, ne kadarı ödendi tutulur. Geriye kalan
 * "henüz işlem görmemiş" adet sayılır.
 *
 * @param {Array<{fiyat:number, adet:number}>} items
 * @param {Array<{selectedQty?:number, ikramQty?:number, paidQty?:number}>} states
 * @returns {{ rawSubtotalKurus, ikramTotalKurus, subtotalKurus,
 *            selectedRawSubtotalKurus, paidItemsTotalKurus }}
 */
export function analyzeItems(items, states) {
  let rawSubtotalKurus = 0;
  let ikramTotalKurus = 0;
  let selectedRawSubtotalKurus = 0;
  let paidItemsTotalKurus = 0;

  for (let i = 0; i < (items || []).length; i++) {
    const it = items[i] || {};
    const fiyat = Number(it.fiyat) || 0;
    const totalQty = Number(it.adet) || 0;
    const s = (states && states[i]) || {};

    const ikramQty = Math.min(totalQty, Math.max(0, Number(s.ikramQty) || 0));
    const paidQty = Math.min(totalQty - ikramQty, Math.max(0, Number(s.paidQty) || 0));
    const selectedQty = Math.min(
      Math.max(0, totalQty - ikramQty - paidQty),
      Math.max(0, Number(s.selectedQty) || 0),
    );

    // Her satırın toplam tutarını kuruşa çevir — float trap önlenir
    rawSubtotalKurus += toKurus(fiyat * totalQty);
    ikramTotalKurus += toKurus(fiyat * ikramQty);
    paidItemsTotalKurus += toKurus(fiyat * paidQty);
    selectedRawSubtotalKurus += toKurus(fiyat * selectedQty);
  }

  const subtotalKurus = Math.max(0, rawSubtotalKurus - ikramTotalKurus);

  return {
    rawSubtotalKurus,
    ikramTotalKurus,
    subtotalKurus,
    selectedRawSubtotalKurus,
    paidItemsTotalKurus,
  };
}

/**
 * Bir satır için var olan boş adet (henüz seçilmemiş / ikram / ödenmemiş).
 * UI burada kalan kaç adet seçilebilir bilgisini gösterir.
 */
export function remainingQty(totalQty, state) {
  const t = Number(totalQty) || 0;
  const i = Math.max(0, Number(state?.ikramQty) || 0);
  const p = Math.max(0, Number(state?.paidQty) || 0);
  const s = Math.max(0, Number(state?.selectedQty) || 0);
  return Math.max(0, t - i - p - s);
}

// ─── İndirim ─────────────────────────────────────────────────────────────

/**
 * Manuel indirim tutarını hesaplar (kuruş).
 * @param {{ tipi:'yuzde'|'sabit', deger:number }} manualDiscount
 * @param {number} subtotalKurus
 */
export function computeManualDiscountKurus(manualDiscount, subtotalKurus) {
  if (!manualDiscount) return 0;
  const deger = Number(manualDiscount.deger) || 0;
  if (deger <= 0) return 0;
  if (manualDiscount.tipi === 'yuzde') {
    // Yüzde: (subtotal * yuzde) / 100 — integer arithmetic
    // Math.floor sürpriz iadeyi önler (müşteri lehine değil)
    return Math.min(subtotalKurus, Math.floor((subtotalKurus * deger) / 100));
  }
  // Sabit TL → kuruşa çevir, subtotal'ı aşamaz
  return Math.min(subtotalKurus, toKurus(deger));
}

// ─── Oransal dağıtım (split payment için) ────────────────────────────────

/**
 * Bir parça ödemenin, toplam üzerinden ne kadarına denk geldiğini
 * oransal hesaplar. İndirim dahil olan etkin tutara göre dağıtır.
 *
 * Örn: subtotal 1010, ikram 35 (net 975), indirim 97.50, effective 877.50.
 *      Müşteri A'nın yediği raw 975 → A'ya düşen 975 × (877.50/975) = 877.50.
 *
 * Geriye integer kuruş döner; yuvarlama nedeniyle 1 kuruş kayba neden olabilir
 * ama o son ödemeye telafi edilir (computeRemaining mantığı).
 *
 * @param {number} portionRawKurus - parçanın ham (indirimsiz) tutarı
 * @param {number} subtotalKurus - toplam ham tutar (ikram düşülmüş)
 * @param {number} effectiveTotalKurus - indirim uygulanmış net toplam
 */
export function applyDiscountRatio(portionRawKurus, subtotalKurus, effectiveTotalKurus) {
  if (subtotalKurus <= 0) return 0;
  if (portionRawKurus <= 0) return 0;
  if (effectiveTotalKurus >= subtotalKurus) return portionRawKurus; // indirim yok
  // Integer aritmetik — overflow tehlikesi yok (max ~21 milyar = 210M TL)
  return Math.round((portionRawKurus * effectiveTotalKurus) / subtotalKurus);
}

// ─── Kalan / fully paid ──────────────────────────────────────────────────

/**
 * Kalan tutarı döner (kuruş). Negatif olamaz (para üstü ayrı hesaplanır).
 */
export function computeRemainingKurus(effectiveTotalKurus, totalPaidKurus) {
  return Math.max(0, effectiveTotalKurus - totalPaidKurus);
}

/**
 * Tam ödendi mi? Yuvarlama hataları için ±1 kuruş tolerans.
 */
export function isFullyPaidKurus(effectiveTotalKurus, totalPaidKurus, toleranceKurus = 1) {
  return totalPaidKurus >= effectiveTotalKurus - toleranceKurus;
}

/**
 * Para üstü (kuruş). Negatif olamaz.
 */
export function computeChangeKurus(totalGivenKurus, effectiveTotalKurus) {
  return Math.max(0, totalGivenKurus - effectiveTotalKurus);
}

// ─── Yüksek seviyeli wrapper — Payment.jsx kullanır ──────────────────────

/**
 * Sipariş + state'lerden tüm para hesaplarını tek seferde çıkarır.
 * UI tek bir nesne üzerinden çalışır, hesap kaçaklarına yer kalmaz.
 *
 * @param {{
 *   items: Array,
 *   itemStates: Array,
 *   manualDiscount: object|null,
 *   campaigns: Array, coupon: object|null,
 *   payments: Array<{tutar:number}>,
 *   computeAutoDiscount: (subtotalKurus)=>{amountKurus:number, label?, type?, source?}|null,
 * }} input
 */
export function computeOrderTotals({
  items,
  itemStates,
  manualDiscount,
  payments,
  computeAutoDiscount,
}) {
  const analysis = analyzeItems(items || [], itemStates || []);
  const subtotalKurus = analysis.subtotalKurus;

  let discount = { amountKurus: 0, label: null, type: null, source: null };
  if (manualDiscount) {
    const amount = computeManualDiscountKurus(manualDiscount, subtotalKurus);
    discount = {
      amountKurus: amount,
      label:
        manualDiscount.tipi === 'yuzde'
          ? `Manuel %${manualDiscount.deger}`
          : `Manuel ${manualDiscount.deger} TL`,
      type: 'manuel',
      source: manualDiscount,
    };
  } else if (typeof computeAutoDiscount === 'function') {
    const auto = computeAutoDiscount(subtotalKurus);
    if (auto && auto.amountKurus > 0) discount = auto;
  }

  const effectiveTotalKurus = Math.max(0, subtotalKurus - discount.amountKurus);

  const totalPaidKurus = (payments || []).reduce(
    (sum, p) => sum + toKurus(p.tutar),
    0,
  );

  const selectedNetKurus = applyDiscountRatio(
    analysis.selectedRawSubtotalKurus,
    subtotalKurus,
    effectiveTotalKurus,
  );

  const remainingKurus = computeRemainingKurus(effectiveTotalKurus, totalPaidKurus);
  const fullyPaid = isFullyPaidKurus(effectiveTotalKurus, totalPaidKurus);
  const overpayKurus = computeChangeKurus(totalPaidKurus, effectiveTotalKurus);

  return {
    ...analysis,
    discount,
    effectiveTotalKurus,
    totalPaidKurus,
    selectedNetKurus,
    remainingKurus,
    fullyPaid,
    overpayKurus,
  };
}
