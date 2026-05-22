import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

initializeApp();
setGlobalOptions({ region: 'europe-west1' });

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
