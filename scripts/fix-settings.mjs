// Tek seferlik: settings/global dokümanındaki "Lezzet Durağı" varsa
// Alazlı Konya Mutfağı ile değiştirir.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';

function loadEnv(path = '.env.local') {
  const text = readFileSync(path, 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, 'admin@restoran.com', 'Admin123!');
const ref = doc(db, 'settings', 'global');
const snap = await getDoc(ref);
if (!snap.exists()) {
  console.log('settings/global yok');
  process.exit(0);
}
const cur = snap.data();
console.log('Şu anki restoranAd:', cur.restoranAd);
if (cur.restoranAd === 'Lezzet Durağı' || !cur.restoranAd) {
  await updateDoc(ref, { restoranAd: 'Alazlı Konya Mutfağı' });
  console.log('✓ "Alazlı Konya Mutfağı" olarak güncellendi');
} else {
  console.log('Değişiklik yok (zaten farklı bir değer var)');
}
process.exit(0);
