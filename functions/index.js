import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

initializeApp();
setGlobalOptions({ region: 'europe-west1' });

// Posentegra → bize webhook çağrılarındaki Bearer token'ı doğrulamak için.
// CLI ile set edilir: `firebase functions:secrets:set POSENTEGRA_WEBHOOK_SECRET`
const POSENTEGRA_WEBHOOK_SECRET = defineSecret('POSENTEGRA_WEBHOOK_SECRET');

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

const PAKET_KAYNAK_ALLOWED = ['yemeksepeti', 'getir', 'trendyol', 'diger'];
function normalizePlatform(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (PAKET_KAYNAK_ALLOWED.includes(s)) return s;
  if (s.includes('yemek')) return 'yemeksepeti';
  if (s.includes('getir')) return 'getir';
  if (s.includes('trendyol')) return 'trendyol';
  return 'diger';
}

/**
 * Posentegra'nın yolladığı sipariş gövdesini bizim `orders` şemamıza çevirir.
 * Posentegra alan isimleri kesin doküman olmadığı için iki dil/biçim varyantını
 * tolere ediyor; raw payload da `posentegraRaw` altına saklanıyor (debug için).
 */
function mapPosentegraOrder(body) {
  const itemsRaw = body.items || body.urunler || body.products || [];
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it) => ({
    ad: String(it.name || it.ad || it.product_name || it.urun_adi || 'Ürün'),
    adet: Number(it.quantity || it.qty || it.adet || it.miktar || 1),
    fiyat: Number(it.price || it.unit_price || it.fiyat || it.birim_fiyat || 0),
    notlar: String(it.note || it.notes || it.notlar || it.aciklama || ''),
  }));

  const araToplam = items.reduce((s, it) => s + (it.fiyat || 0) * (it.adet || 0), 0);
  const toplam = Number(body.total || body.toplam || body.tutar || araToplam);

  const paketKaynak = normalizePlatform(body.platform || body.kaynak || body.source || body.app);
  const platformAd = paketKaynak === 'diger' ? 'Posentegra' : paketKaynak[0].toUpperCase() + paketKaynak.slice(1);

  return {
    masaId: null,
    masaAd: `Paket - ${platformAd}`,
    kisiSayisi: null,
    garsonId: null,
    garsonAd: platformAd,
    durum: 'aktif',
    items,
    araToplam,
    indirim: 0,
    kuponKodu: null,
    kampanyaId: null,
    toplam,
    paketMi: true,
    paketKaynak,
    musteriAd: String(body.customer?.name || body.musteri_ad || body.musteriAd || body.ad_soyad || ''),
    musteriTel: String(body.customer?.phone || body.musteri_tel || body.musteriTel || body.telefon || ''),
    musteriAdres: String(body.customer?.address || body.musteri_adres || body.musteriAdres || body.adres || ''),
    posentegraSiparisNo: String(body.order_id || body.siparis_no || body.id || body.posentegra_id || '') || null,
    posentegraRaw: body,
    olusturmaZamani: FieldValue.serverTimestamp(),
    hazirlandiZamani: null,
    masayaGittiZamani: null,
    tamamlandiZamani: null,
    gecikmeli: false,
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
      // Posentegra siparis_no ile çift kayıt önle — varsa mevcut order'ı dön
      const posSiparisNo = String(body.order_id || body.siparis_no || body.id || '') || null;
      if (posSiparisNo) {
        const existing = await db
          .collection('orders')
          .where('posentegraSiparisNo', '==', posSiparisNo)
          .limit(1)
          .get();
        if (!existing.empty) {
          res.status(200).json({ pos_ticket: existing.docs[0].id, duplicate: true });
          return;
        }
      }
      const orderData = mapPosentegraOrder(body);
      const ref = await db.collection('orders').add(orderData);
      console.log('[posentegraOrder] OK', { ref: ref.id, kaynak: orderData.paketKaynak, pos: posSiparisNo });
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
      const posSiparisNo = String(body.posentegra_siparis_no || body.siparis_no || body.id || '');
      const sebep = String(body.sebep || body.reason || 'Posentegra üzerinden iptal');

      let orderRef = null;
      if (posTicket) {
        const snap = await db.collection('orders').doc(posTicket).get();
        if (snap.exists) orderRef = snap.ref;
      }
      if (!orderRef && posSiparisNo) {
        const snap = await db
          .collection('orders')
          .where('posentegraSiparisNo', '==', posSiparisNo)
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
