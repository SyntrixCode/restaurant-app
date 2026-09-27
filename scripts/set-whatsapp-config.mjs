// settings/whatsapp yapılandırmasını yazar (CallMeBot).
// Çalıştır: node scripts/set-whatsapp-config.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const CONFIG = {
  aktif: true, // gün sonu ciro raporu
  siparisBildirimAktif: true, // yeni platform siparişi
  iptalBildirimAktif: true, // sipariş iptali
  telefon: '905446725881',
  apikey: '9032555',
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, 'admin@restoran.com', '123456');
  await setDoc(doc(db, 'settings', 'whatsapp'), CONFIG, { merge: true });
  console.log('✓ settings/whatsapp yazıldı:', CONFIG);
  process.exit(0);
}
main().catch((e) => {
  console.error('HATA:', e.code || '', e.message);
  process.exit(1);
});
