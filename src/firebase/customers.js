import { doc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from './config';

/**
 * Telefonu normalize eder (sadece rakam). Doc id olarak kullanılır.
 */
export function normalizePhone(tel) {
  return String(tel || '').replace(/\D/g, '');
}

/**
 * Paket siparişten müşteri defterini günceller (telefon = doc id).
 * Aynı numara tekrar gelirse sipariş sayısı artar, ad/adres en günceli kalır.
 */
export async function upsertCustomerFromPackage({ ad, tel, adres }) {
  const id = normalizePhone(tel);
  if (!id || id.length < 7) return null; // geçersiz numara → kaydetme
  const ref = doc(db, 'customers', id);
  await setDoc(
    ref,
    {
      ad: ad || '',
      tel: tel || '',
      ...(adres ? { adres } : {}),
      siparisSayisi: increment(1),
      sonSiparis: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return id;
}

/**
 * Bir tutardan kazanılacak sadakat puanını hesaplar (saf fonksiyon).
 * settings.puanKazanmaTL = kaç TL'ye 1 puan (örn. 10 → her 10 TL = 1 puan).
 */
export function computeEarnedPoints(tutar, settings) {
  if (!settings?.sadakatAktif) return 0;
  const per = Number(settings.puanKazanmaTL) || 0;
  if (per <= 0) return 0;
  return Math.floor((Number(tutar) || 0) / per);
}

/**
 * Ödeme sonrası müşteriye puan ekler. Sessizce çalışır (hata sipariş akışını bozmaz).
 */
export async function awardLoyaltyPoints({ tel, tutar, settings }) {
  const puan = computeEarnedPoints(tutar, settings);
  if (puan <= 0) return 0;
  const id = normalizePhone(tel);
  if (!id || id.length < 7) return 0;
  await setDoc(
    doc(db, 'customers', id),
    { puan: increment(puan), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return puan;
}

/**
 * Puan bakiyesini değiştirir (delta negatif olabilir — kullanım/iade).
 */
export async function adjustLoyaltyPoints({ tel, delta }) {
  const id = normalizePhone(tel);
  if (!id || id.length < 7 || !delta) return;
  await setDoc(
    doc(db, 'customers', id),
    { puan: increment(delta), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
