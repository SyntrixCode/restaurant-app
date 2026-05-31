import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const SPARK_MODE = import.meta.env.VITE_SPARK_MODE === 'true';
export const POS_EMAIL_DOMAIN =
  import.meta.env.VITE_POS_EMAIL_DOMAIN || `${firebaseConfig.projectId}.firebaseapp.com`;

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Capacitor APK ortamında getAuth() bazen IDB init'ini bekleyemeden localStorage'a
// düşüyor — sonraki açılışta oturum bulunamıyor ("beni hatırla" çalışmıyor görünüyor).
// initializeAuth() ile explicit IDB öncelikli sıra veriyoruz.
function initAuth() {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
    });
  } catch {
    // HMR / ikinci kez initialize → mevcut instance'ı döndür
    return getAuth(app);
  }
}

export const auth = initAuth();

export function getSecondaryAuth() {
  let secondary;
  if (getApps().some((a) => a.name === 'secondary')) {
    secondary = getApp('secondary');
  } else {
    secondary = initializeApp(firebaseConfig, 'secondary');
  }
  return { app: secondary, auth: getAuth(secondary), dispose: () => deleteApp(secondary) };
}

export async function getStorageRef() {
  if (SPARK_MODE) return null;
  const { getStorage } = await import('firebase/storage');
  return getStorage(app);
}

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
