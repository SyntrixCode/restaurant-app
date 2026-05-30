import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { posentegraApi, POSENTEGRA_STATUS_MAP } from './lib/posentegra.js';

initializeApp();
setGlobalOptions({ region: 'europe-west1' });

// Posentegra → bize webhook çağrılarındaki Bearer token'ı doğrulamak için.
// CLI ile set edilir: `firebase functions:secrets:set POSENTEGRA_WEBHOOK_SECRET`
const POSENTEGRA_WEBHOOK_SECRET = defineSecret('POSENTEGRA_WEBHOOK_SECRET');
// Posentegra'ya outbound çağrılar için (verify/cancel/change-status)
const POSENTEGRA_API_KEY = defineSecret('POSENTEGRA_API_KEY');

const auth = getAuth();
const db = getFirestore();

function hashCode(kod) {
  return crypto.createHash('sha256').update(String(kod)).digest('hex');
}

const rateLimits = new Map();
function rateLimitKey(req) {
  return req.rawRequest?.ip || req.app?.appId || 'unknown';
}
function checkRateLimit(key) {
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil > now) {
    return { ok: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { ok: true, entry };
}
function recordFailure(key) {
  const entry = rateLimits.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 60_000;
    entry.count = 0;
  }
  rateLimits.set(key, entry);
}
function recordSuccess(key) {
  rateLimits.delete(key);
}

export const verifyUserCode = onCall(async (req) => {
  const kod = String(req.data?.kod || '').trim();
  if (!/^\d{4}$/.test(kod)) {
    throw new HttpsError('invalid-argument', 'auth/invalid-code');
  }

  const key = rateLimitKey(req);
  const rate = checkRateLimit(key);
  if (!rate.ok) {
    throw new HttpsError('resource-exhausted', `auth/rate-limited:${rate.retryAfter}`);
  }

  const kodHash = hashCode(kod);
  const snap = await db
    .collection('users')
    .where('kodHash', '==', kodHash)
    .where('aktif', '==', true)
    .limit(1)
    .get();

  if (snap.empty) {
    recordFailure(key);
    throw new HttpsError('not-found', 'auth/invalid-code');
  }

  const userDoc = snap.docs[0];
  const userData = userDoc.data();
  await auth.setCustomUserClaims(userDoc.id, { rol: userData.rol });
  const token = await auth.createCustomToken(userDoc.id, { rol: userData.rol });

  recordSuccess(key);
  await userDoc.ref.update({ sonGiris: FieldValue.serverTimestamp() });

  return { token, userId: userDoc.id, rol: userData.rol, ad: userData.ad };
});

// ────────────────────────────────────────────────────────────────────────────
// Posentegra Webhook'ları
// Yemeksepeti / Getir / Trendyol Yemek siparişleri Posentegra üzerinden gelir.
// Posentegra panelinde aşağıdaki URL'ler yazılır ve Authorization: Bearer <secret>
// (CLI ile set edilen POSENTEGRA_WEBHOOK_SECRET) doğrulanır.
// ────────────────────────────────────────────────────────────────────────────

const webhookRates = new Map();
function checkWebhookRate(ip, max = 60, windowMs = 60_000) {
  const now = Date.now();
  const entry = webhookRates.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  webhookRates.set(ip, entry);
  return entry.count <= max;
}

function validateBearer(req, secret) {
  const auth = String(req.headers.authorization || '');
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  // sabit zamanlı karşılaştırma — timing attack koruması
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

// Posentegra provider slug → bizim paketKaynak enum'u
const PROVIDER_MAP = {
  ys: 'yemeksepeti',
  yemeksepeti: 'yemeksepeti',
  yemek_sepeti: 'yemeksepeti',
  ty: 'trendyol',
  trendyol: 'trendyol',
  getir: 'getir',
  migros: 'migros',
  migros_yemek: 'migros',
};
function normalizePlatform(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (PROVIDER_MAP[s]) return PROVIDER_MAP[s];
  if (s.includes('yemek')) return 'yemeksepeti';
  if (s.includes('getir')) return 'getir';
  if (s.includes('trendyol')) return 'trendyol';
  if (s.includes('migros')) return 'migros';
  return 'diger';
}

const PLATFORM_LABELS = {
  yemeksepeti: 'Yemeksepeti',
  trendyol: 'Trendyol Yemek',
  getir: 'Getir',
  migros: 'Migros Yemek',
  diger: 'Posentegra',
};

// "Online Ödeme", "PAY_WITH_CARD", "Migros Online" gibi → online (kasiyer ödeme almaz)
function isPrepaid(posPaymentMethod, paymentMethodText) {
  const s = `${posPaymentMethod || ''} ${paymentMethodText?.tr || ''} ${paymentMethodText?.en || ''}`.toLowerCase();
  if (s.includes('nakit') || s.includes('cash')) return false;
  if (s.includes('kapıda') || s.includes('door')) return false;
  return s.includes('online') || s.includes('card') || s.includes('kart') || s.includes('pay_with');
}

// i18n alan → string ('name': { tr, en } → 'Türkçe karşılığı')
function tr(field) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') return String(field.tr || field.en || '');
  return String(field);
}

// Adres parçalarını tek satırda birleştir
function birlestirAdres(da) {
  if (!da || typeof da !== 'object') return '';
  const parts = [];
  if (da.address) parts.push(da.address);
  if (da.aptNo) parts.push(`No: ${da.aptNo}`);
  if (da.floor) parts.push(`Kat: ${da.floor}`);
  if (da.doorNo) parts.push(`Daire: ${da.doorNo}`);
  if (da.district) parts.push(da.district);
  if (da.city) parts.push(da.city);
  const main = parts.filter(Boolean).join(', ');
  const desc = da.description && da.description !== '0' ? ` (${da.description})` : '';
  return (main + desc).trim();
}

// Ürün opsiyon/ingredient bilgilerini tek bir not stringine düzleştir
function urunNotlariBirlestir(p) {
  const parts = [];

  // Opsiyon kategorileri (örn. menü seçenekleri, porsiyon)
  if (Array.isArray(p.optionCategories)) {
    for (const cat of p.optionCategories) {
      const opsiyonlar = Array.isArray(cat.options) ? cat.options : [];
      for (const opt of opsiyonlar) {
        const ad = tr(opt.name);
        const fiyat = Number(opt.price || 0);
        const fiyatTxt = fiyat > 0 ? ` (+${fiyat})` : '';
        if (ad) parts.push(`+ ${ad}${fiyatTxt}`);
      }
    }
  }

  // Çıkarılan malzemeler (V2 öncelikli, yoksa V1)
  if (Array.isArray(p.removedIngredientsV2) && p.removedIngredientsV2.length) {
    for (const ing of p.removedIngredientsV2) {
      const ad = tr(ing.name || ing);
      if (ad) parts.push(`− ${ad}`);
    }
  } else if (Array.isArray(p.removedIngredients)) {
    for (const s of p.removedIngredients) {
      // "ÇIKAR:Soğan" formatını temizle
      const ad = String(s || '').replace(/^[^:]+:\s*/, '').trim();
      if (ad) parts.push(`− ${ad}`);
    }
  }

  // Eklenen malzemeler
  if (Array.isArray(p.extraIngredients)) {
    for (const ing of p.extraIngredients) {
      const ad = tr(ing.name || ing);
      const fiyat = Number(ing.price || 0);
      const fiyatTxt = fiyat > 0 ? ` (+${fiyat})` : '';
      if (ad) parts.push(`+ ${ad}${fiyatTxt}`);
    }
  }

  // Ürün notu (müşteri özel notu)
  const note = tr(p.note);
  if (note) parts.push(note);

  return parts.join(' · ');
}

/**
 * Posentegra'nın yolladığı sipariş gövdesini bizim `orders` şemamıza çevirir.
 *
 * Üç platformun (Migros / Trendyol / Yemeksepeti) gerçek payload örneklerine göre
 * yazıldı; alan isimleri ortak (provider, pid, products, client, totalPrice...).
 * Raw payload `posentegraRaw` altında saklanır (debug + ileride yeni alanlar).
 */
function mapPosentegraOrder(body) {
  const productsRaw = body.products || body.items || body.urunler || [];
  const products = Array.isArray(productsRaw) ? productsRaw : [];

  const items = products.map((p) => {
    const ad = tr(p.name) || 'Ürün';
    const adet = Number(p.count || p.quantity || p.adet || 1);
    // Opsiyon dahil tek-birim fiyatı; yoksa düz price
    const fiyatBirim = Number(p.priceWithOption || p.price || 0);
    return {
      ad,
      adet,
      fiyat: fiyatBirim,
      notlar: urunNotlariBirlestir(p),
    };
  });

  const araToplam = items.reduce((s, it) => s + (it.fiyat || 0) * (it.adet || 0), 0);
  const indirim = Number(body.totalDiscount || 0);
  const toplam = Number(body.totalDiscountedPrice || body.totalPrice || araToplam);

  const slug = body.provider?.slug || body.platform || body.kaynak || body.source || body.app;
  const paketKaynak = normalizePlatform(slug);
  const platformAd = body.provider?.kaynak || PLATFORM_LABELS[paketKaynak] || 'Posentegra';

  const client = body.client || body.customer || {};
  const musteriAd = String(client.name || body.musteri_ad || '');
  const musteriTel = String(client.clientPhoneNumber || client.contactPhoneNumber || client.phone || body.musteri_tel || '');
  const musteriAdres = client.deliveryAddress
    ? birlestirAdres(client.deliveryAddress)
    : String(client.address || body.musteri_adres || '');

  const odemeTipi = tr(body.paymentMethodText) || body.posPaymentMethod || '';
  const onceden = isPrepaid(body.posPaymentMethod, body.paymentMethodText);

  // Posentegra'nın bize geri çağırırken kullanacağı id (verify/cancel/change-status için)
  const posentegraPid = body.pid ? String(body.pid) : null;

  const scheduledDate = body.scheduledDate?.$date || body.scheduledDate || null;

  return {
    masaId: null,
    masaAd: `Paket - ${platformAd}`,
    kisiSayisi: null,
    garsonId: null,
    garsonAd: platformAd,
    durum: 'aktif',
    items,
    araToplam,
    indirim,
    kuponKodu: null,
    kampanyaId: null,
    toplam,
    paketMi: true,
    paketKaynak,
    paketKaynakAd: platformAd, // güzel görünen ad — UI'da Migros Yemek vs gösterir
    musteriAd,
    musteriTel,
    musteriAdres,
    musteriNotu: tr(body.clientNote) || '',
    odemeTipi,
    oncedenOdendi: onceden, // online ödenmişse kasiyer ödeme almaz
    // Posentegra referansları (callback'ler için)
    posentegraPid,
    posentegraConfirmationId: body.confirmationId ? String(body.confirmationId) : null,
    posentegraShortCode: body.shortCode ? String(body.shortCode) : null,
    posentegraRestaurantId: body.restaurantId || null,
    posentegraRaw: body,
    olusturmaZamani: FieldValue.serverTimestamp(),
    hazirlandiZamani: null,
    masayaGittiZamani: null,
    tamamlandiZamani: null,
    gecikmeli: false,
    zamanlanmis: !!scheduledDate,
    zamanlanmisTarih: scheduledDate || null,
  };
}

export const posentegraOrder = onRequest(
  { secrets: [POSENTEGRA_WEBHOOK_SECRET], region: 'europe-west1', cors: false, invoker: 'public' },
  async (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkWebhookRate(ip)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!validateBearer(req, POSENTEGRA_WEBHOOK_SECRET.value())) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const body = req.body || {};
      // pid ile çift kayıt önle — Posentegra'nın bizim için tanımladığı sipariş kimliği
      const pid = body.pid ? String(body.pid) : null;
      if (pid) {
        const existing = await db
          .collection('orders')
          .where('posentegraPid', '==', pid)
          .limit(1)
          .get();
        if (!existing.empty) {
          res.status(200).json({ pos_ticket: existing.docs[0].id, duplicate: true });
          return;
        }
      }
      const orderData = mapPosentegraOrder(body);
      const ref = await db.collection('orders').add(orderData);
      console.log('[posentegraOrder] OK', {
        ref: ref.id,
        kaynak: orderData.paketKaynak,
        pid,
        items: orderData.items.length,
        toplam: orderData.toplam,
      });
      res.status(200).json({ pos_ticket: ref.id });
    } catch (err) {
      console.error('[posentegraOrder] HATA:', err);
      res.status(500).json({ error: 'internal', message: err.message });
    }
  },
);

export const posentegraCancel = onRequest(
  { secrets: [POSENTEGRA_WEBHOOK_SECRET], region: 'europe-west1', cors: false, invoker: 'public' },
  async (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkWebhookRate(ip)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!validateBearer(req, POSENTEGRA_WEBHOOK_SECRET.value())) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const body = req.body || {};
      const posTicket = String(body.pos_ticket || body.order_id || '');
      const pid = String(body.pid || body.posentegra_id || '');
      const sebep = String(body.sebep || body.reason || tr(body.reasonName) || 'Posentegra üzerinden iptal');

      let orderRef = null;
      if (posTicket) {
        const snap = await db.collection('orders').doc(posTicket).get();
        if (snap.exists) orderRef = snap.ref;
      }
      if (!orderRef && pid) {
        const snap = await db
          .collection('orders')
          .where('posentegraPid', '==', pid)
          .limit(1)
          .get();
        if (!snap.empty) orderRef = snap.docs[0].ref;
      }
      if (!orderRef) {
        res.status(404).json({ error: 'order_not_found' });
        return;
      }

      const orderSnap = await orderRef.get();
      const order = orderSnap.data();
      if (order.durum === 'tamamlandi') {
        res.status(409).json({ error: 'already_completed' });
        return;
      }
      if (order.durum === 'iptal') {
        res.status(200).json({ pos_ticket: orderRef.id, already: 'cancelled' });
        return;
      }

      const gun = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      await orderRef.update({
        durum: 'iptal',
        iptal: {
          edildi: true,
          sebep,
          edenId: null,
          edenAd: 'Posentegra',
          zaman: FieldValue.serverTimestamp(),
        },
        iptalZamani: FieldValue.serverTimestamp(),
      });
      // Raporlama için arşive iptal damgalı kopya
      await db.collection('archivedOrders').doc(orderRef.id).set(
        {
          ...order,
          durum: 'iptal',
          iptal: {
            edildi: true,
            sebep,
            edenAd: 'Posentegra',
            zaman: FieldValue.serverTimestamp(),
          },
          arsivZamani: FieldValue.serverTimestamp(),
          tamamlandiZamani: FieldValue.serverTimestamp(),
          gun,
          odemeYontemleri: [],
        },
        { merge: true },
      );

      console.log('[posentegraCancel] OK', { ref: orderRef.id });
      res.status(200).json({ pos_ticket: orderRef.id });
    } catch (err) {
      console.error('[posentegraCancel] HATA:', err);
      res.status(500).json({ error: 'internal', message: err.message });
    }
  },
);

/**
 * Garson "Kabul Et" basınca → Posentegra'ya verify gönderir, order'da onaylı flag'i set eder.
 */
export const posentegraConfirm = onCall(
  { secrets: [POSENTEGRA_API_KEY], region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Giriş gerekli');
    const userSnap = await db.collection('users').doc(req.auth.uid).get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'Kullanıcı bulunamadı');
    const userData = userSnap.data();
    if (!userData.aktif || !['admin', 'kasiyer', 'garson'].includes(userData.rol)) {
      throw new HttpsError('permission-denied', 'Yetki yok');
    }

    const orderId = String(req.data?.orderId || '');
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId gerekli');
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Sipariş bulunamadı');
    const order = orderSnap.data();
    const pid = order.posentegraPid;
    if (!pid) throw new HttpsError('failed-precondition', 'Posentegra siparişi değil');
    if (order.posentegraOnayli) return { ok: true, already: true };

    await posentegraApi.verifyOrder(POSENTEGRA_API_KEY.value(), pid);
    await orderRef.update({
      posentegraOnayli: true,
      posentegraOnayZamani: FieldValue.serverTimestamp(),
      posentegraOnaylayanId: req.auth.uid,
      posentegraOnaylayanAd: userData.ad || 'Personel',
    });
    return { ok: true };
  },
);

/**
 * Garson/Kasiyer "Reddet" basınca → Posentegra'ya cancel gönderir, order'ı iptal'e alır.
 */
export const posentegraReject = onCall(
  { secrets: [POSENTEGRA_API_KEY], region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Giriş gerekli');
    const userSnap = await db.collection('users').doc(req.auth.uid).get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'Kullanıcı bulunamadı');
    const userData = userSnap.data();
    if (!userData.aktif || !['admin', 'kasiyer'].includes(userData.rol)) {
      throw new HttpsError('permission-denied', 'Yetki yok');
    }

    const orderId = String(req.data?.orderId || '');
    const reason = String(req.data?.reason || '');
    const note = String(req.data?.note || '');
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId gerekli');
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Sipariş bulunamadı');
    const order = orderSnap.data();
    const pid = order.posentegraPid;
    if (!pid) throw new HttpsError('failed-precondition', 'Posentegra siparişi değil');
    if (order.durum === 'iptal') return { ok: true, already: true };

    await posentegraApi.cancelOrder(POSENTEGRA_API_KEY.value(), pid, reason || 'Restoran reddi', note);
    await orderRef.update({
      durum: 'iptal',
      iptal: {
        edildi: true,
        sebep: note || reason || 'Posentegra üzerinden reddedildi',
        edenId: req.auth.uid,
        edenAd: userData.ad || 'Personel',
        zaman: FieldValue.serverTimestamp(),
      },
      iptalZamani: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  },
);

/**
 * GET — iptal nedenleri listesi (UI dropdown için).
 */
export const posentegraReasons = onCall(
  { secrets: [POSENTEGRA_API_KEY], region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Giriş gerekli');
    const orderId = String(req.data?.orderId || '');
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId gerekli');
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Sipariş bulunamadı');
    const pid = orderSnap.data().posentegraPid;
    if (!pid) throw new HttpsError('failed-precondition', 'Posentegra siparişi değil');
    const reasons = await posentegraApi.getCancelReasons(POSENTEGRA_API_KEY.value(), pid);
    return { reasons };
  },
);

/**
 * order.durum değiştiğinde Posentegra'ya otomatik bildir.
 * 'hazirlandi' → status 400, 'masayaGitti' → 500, 'tamamlandi' → 900.
 * Posentegra siparişi olmayan order'larda noop.
 */
export const posentegraOnStatusChange = onDocumentUpdated(
  { document: 'orders/{orderId}', secrets: [POSENTEGRA_API_KEY], region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const pid = after.posentegraPid;
    if (!pid) return;
    if (before.durum === after.durum) return;
    const statusCode = POSENTEGRA_STATUS_MAP[after.durum];
    if (statusCode == null) return;
    try {
      await posentegraApi.changeStatus(POSENTEGRA_API_KEY.value(), pid, statusCode);
      console.log('[posentegraOnStatusChange] OK', { pid, durum: after.durum, status: statusCode });
    } catch (err) {
      console.warn('[posentegraOnStatusChange] HATA', { pid, durum: after.durum, msg: err.message });
    }
  },
);

export const onUserWrite = onDocumentWritten('users/{userId}', async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  if (!after.kod) return;

  const kodHash = hashCode(after.kod);
  const kodIpucu = `${String(after.kod)[0]}***`;
  if (after.kodHash === kodHash && after.kod === null) return;

  await event.data.after.ref.update({
    kodHash,
    kodIpucu,
    kod: FieldValue.delete(),
  });

  if (after.rol) {
    try {
      await auth.setCustomUserClaims(event.params.userId, { rol: after.rol });
    } catch (err) {
      console.warn('setCustomUserClaims atlandı (Auth user yok):', err.message);
    }
  }
});
