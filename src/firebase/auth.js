import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth, POS_EMAIL_DOMAIN, getSecondaryAuth } from './config';
import { derivePosCredentials } from '../utils/hash';
import {
  saveAdminCredentials,
  getAdminCredentials,
  clearAdminCredentials,
} from '../services/credentialStore';

// Capacitor APK ortamında browserLocalPersistence (localStorage) güvenilmez —
// WebView her açılışta storage'ı koruyamayabilir. IndexedDB persistence APK'da
// uygulama veri dizininde kalır, uygulama silinmediği sürece oturum açık kalır.
// Web tarafında IDB yoksa otomatik browserLocalPersistence'a düşer.
async function setRememberPersistence() {
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch {
    await setPersistence(auth, browserLocalPersistence);
  }
}

export async function loginAdmin(email, password, rememberMe = false) {
  if (rememberMe) {
    await setRememberPersistence();
  } else {
    await setPersistence(auth, browserSessionPersistence);
    await clearAdminCredentials(); // önceki kalıntı varsa temizle
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // Login başarılı + remember → native storage'a yaz (APK'da kalıcı oturum)
  if (rememberMe) {
    try {
      await saveAdminCredentials(email, password);
    } catch (err) {
      console.warn('Credential kaydedilemedi (remember-me):', err);
    }
  }
  return cred;
}

/**
 * Uygulama açılışında Firebase auth restore başarısızsa kayıtlı credential ile
 * sessiz re-login dener. Başarısızsa credential temizler.
 * @returns {Promise<boolean>} true=re-login başarılı (watchAuth tekrar tetiklenir)
 */
export async function tryRestoreAdminSession() {
  const creds = await getAdminCredentials();
  if (!creds) return false;
  try {
    await setRememberPersistence();
    await signInWithEmailAndPassword(auth, creds.email, creds.password);
    return true;
  } catch (err) {
    console.warn('Otomatik oturum restore başarısız, credential temizleniyor:', err.code || err.message);
    await clearAdminCredentials();
    return false;
  }
}

export async function loginPos(kod) {
  if (!/^\d{4}$/.test(kod)) throw new Error('auth/invalid-code');
  const { email, password } = await derivePosCredentials(kod, POS_EMAIL_DOMAIN);
  await setPersistence(auth, browserSessionPersistence);
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (
      err.code === 'auth/user-not-found' ||
      err.code === 'auth/invalid-credential' ||
      err.code === 'auth/wrong-password'
    ) {
      const e = new Error('auth/invalid-code');
      e.code = 'auth/invalid-code';
      throw e;
    }
    if (err.code === 'auth/too-many-requests') {
      const e = new Error('auth/rate-limited');
      e.code = 'auth/rate-limited';
      throw e;
    }
    throw err;
  }
}

export async function createPosUser({ kod, ad, rol }) {
  const { email, password } = await derivePosCredentials(kod, POS_EMAIL_DOMAIN);
  const { auth: secondary, dispose } = getSecondaryAuth();
  try {
    const cred = await createUserWithEmailAndPassword(secondary, email, password);
    if (cred.user) await updateProfile(cred.user, { displayName: ad });
    await signOut(secondary);
    return { uid: cred.user.uid, email };
  } finally {
    try {
      await dispose();
    } catch {
      /* ignore */
    }
  }
}

export async function logout() {
  await clearAdminCredentials(); // logout = beni hatırlama da sıfırlanır
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
