/**
 * Kampanya ve kupon indirim hesaplama yardımcıları.
 *
 * Kural: KÜMÜLATİF DEĞİL — birden fazla uygun olsa bile sadece EN BÜYÜK indirim
 * uygulanır (PROJECT_STATUS Faz 7 kararı).
 */

/**
 * Bir kampanya şu an aktif/uygun mu kontrol eder.
 * @param {Object} campaign
 * @param {number} subtotal - sepetin ara toplamı
 * @param {Date} now - şimdi (test için override edilebilir)
 * @returns {boolean}
 */
export function isCampaignActive(campaign, subtotal, now = new Date()) {
  if (!campaign || !campaign.aktif) return false;
  if (campaign.minTutar > 0 && subtotal < campaign.minTutar) return false;

  // Tarih aralığı
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (campaign.baslangicTarih && today < campaign.baslangicTarih) return false;
  if (campaign.bitisTarih && today > campaign.bitisTarih) return false;

  // Gün filtresi (0=Pazar, 1=Pazartesi, ...)
  if (Array.isArray(campaign.gunler) && campaign.gunler.length > 0) {
    if (!campaign.gunler.includes(now.getDay())) return false;
  }

  // Saat aralığı
  if (campaign.baslangicSaat && campaign.bitisSaat) {
    const curHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (campaign.baslangicSaat <= campaign.bitisSaat) {
      // Normal aralık (örn. 09:00 - 17:00)
      if (curHHMM < campaign.baslangicSaat || curHHMM > campaign.bitisSaat) return false;
    } else {
      // Gece aralığı (örn. 22:00 - 02:00)
      if (curHHMM > campaign.bitisSaat && curHHMM < campaign.baslangicSaat) return false;
    }
  }

  return true;
}

/**
 * Bir kupon kullanılabilir mi kontrol eder.
 */
export function isCouponValid(coupon, subtotal, now = new Date()) {
  if (!coupon || !coupon.aktif) return false;
  if (coupon.minTutar > 0 && subtotal < coupon.minTutar) return false;
  if (coupon.maxKullanim > 0 && (coupon.kullanilan || 0) >= coupon.maxKullanim) return false;

  if (coupon.sonGecerlilik) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (today > coupon.sonGecerlilik) return false;
  }

  return true;
}

/**
 * Verilen indirim ayarına göre tutar düşüşünü hesaplar.
 */
export function computeDiscount(indirimTipi, indirimDeger, subtotal) {
  if (!indirimDeger || indirimDeger <= 0 || subtotal <= 0) return 0;
  if (indirimTipi === 'yuzde') {
    const v = (subtotal * indirimDeger) / 100;
    return Math.min(v, subtotal); // %100'ü geçemez
  }
  // sabit
  return Math.min(indirimDeger, subtotal);
}

/**
 * Uygun kampanyalar ve (verilmişse) kuponu değerlendirip
 * EN BÜYÜK indirimi seçer.
 *
 * @returns {{ type:'kampanya'|'kupon'|null, source:Object|null, amount:number, label:string }}
 */
export function pickBestDiscount({ subtotal, campaigns = [], coupon = null, now = new Date() }) {
  const candidates = [];

  for (const c of campaigns) {
    if (!isCampaignActive(c, subtotal, now)) continue;
    const amount = computeDiscount(c.indirimTipi, c.indirimDeger, subtotal);
    if (amount > 0) {
      candidates.push({
        type: 'kampanya',
        source: c,
        amount,
        label: c.ad,
      });
    }
  }

  if (coupon && isCouponValid(coupon, subtotal, now)) {
    const amount = computeDiscount(coupon.indirimTipi, coupon.indirimDeger, subtotal);
    if (amount > 0) {
      candidates.push({
        type: 'kupon',
        source: coupon,
        amount,
        label: `Kupon: ${coupon.kod}`,
      });
    }
  }

  if (candidates.length === 0) {
    return { type: null, source: null, amount: 0, label: '' };
  }

  return candidates.reduce((max, cur) => (cur.amount > max.amount ? cur : max));
}
