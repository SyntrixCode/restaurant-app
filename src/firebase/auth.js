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
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
    let user;
    try {
      const cred = await createUserWithEmailAndPassword(secondary, email, password);
      user = cred.user;
      if (user) await updateProfile(user, { displayName: ad });
    } catch (err) {
      // Bu koda ait Auth hesabı zaten var (ör. doküman panelden silinip aynı kodla
      // yeniden eklenirken, ya da eski uid kayması). Hata vermek yerine hesaba giriş
      // yapıp GERÇEK uid'ini al — çağıran, users dokümanını bu doğru uid altına yazar
      // (self-heal). Böylece "kod zaten kullanımda" tıkanması ve uid uyuşmazlığı biter.
      if (err.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(secondary, email, password);
        user = cred.user;
        if (user && ad) {
          try {
            await updateProfile(user, { displayName: ad });
          } catch {
            /* displayName güncellenemese de akış devam etsin */
          }
        }
      } else {
        throw err;
      }
    }
    await signOut(secondary);
    return { uid: user.uid, email };
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

/**
 * Giriş yapmış admin'in şifresini günceller.
 * Önce mevcut şifreyle reauthenticate (Firebase Auth güvenlik gereği),
 * sonra updatePassword. Hatalar (wrong-password, weak-password) yukarı çıkar.
 */
export async function changeAdminPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Önce giriş yapın');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  // Beni Hatırla store'unda eski şifre varsa onu da güncelle
  try {
    const saved = await getAdminCredentials();
    if (saved?.email === user.email) {
      await saveAdminCredentials({ email: user.email, password: newPassword });
    }
  } catch {}
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
