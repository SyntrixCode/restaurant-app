// Godmode kullanıcısı "Sezgin" (PIN 2834) oluşturur.
// createPosUser akışını birebir taklit eder: PIN'den email/şifre türet → Auth hesabı aç
// → users/{uid} dokümanını rol=godmode ile yaz (admin olarak).
//
// Çalıştır:  node scripts/create-godmode-user.mjs
// Gerekli:   .env.local (VITE_FIREBASE_*), admin@restoran.com / 123456
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- .env.local yükle ---
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
const POS_EMAIL_DOMAIN =
  env.VITE_POS_EMAIL_DOMAIN || `${firebaseConfig.projectId}.firebaseapp.com`;

const KOD = '2834';
const AD = 'Sezgin';
const ROL = 'godmode';
const ADMIN_EMAIL = 'admin@restoran.com';
const ADMIN_PASS = '123456';

// derivePosCredentials ile birebir (src/utils/hash.js)
const hash = crypto.createHash('sha256').update(KOD).digest('hex');
const posEmail = `pos-${hash.slice(0, 16)}@${POS_EMAIL_DOMAIN}`;
const posPass = hash.slice(16, 64);

async function main() {
  // 1) POS Auth hesabını ikincil app'te oluştur (varsa: giriş yapıp uid al)
  const secApp = initializeApp(firebaseConfig, 'secondary');
  const secAuth = getAuth(secApp);
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, posEmail, posPass);
    uid = cred.user.uid;
    await updateProfile(cred.user, { displayName: AD });
    console.log('✓ Auth hesabı oluşturuldu:', uid);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(secAuth, posEmail, posPass);
      uid = cred.user.uid;
      console.log('• Bu PIN (2834) zaten bir Auth hesabına sahip. uid:', uid);
    } else {
      throw err;
    }
  }
  await signOut(secAuth);

  // 2) Admin olarak Firestore'a yaz
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);

  // Bu uid'de aktif bir kullanıcı var mı? (PIN başkasına aitse ezme)
  const existing = await getDoc(doc(db, 'users', uid));
  if (existing.exists()) {
    const d = existing.data();
    if (d.aktif && d.rol && d.rol !== ROL) {
      console.error(
        `✗ PIN 2834 zaten AKTİF bir kullanıcıya ait: ${d.ad} (${d.rol}). ` +
          `Önce o kullanıcıyı silin veya farklı PIN seçin. Değişiklik yapılmadı.`,
      );
      process.exit(1);
    }
    console.log('• Mevcut doküman güncellenecek:', d.ad || '(adsız)');
  }

  await setDoc(
    doc(db, 'users', uid),
    { ad: AD, rol: ROL, aktif: true, kodIpucu: `${KOD[0]}***` },
    { merge: true },
  );
  console.log(`✓ users/${uid} yazıldı → ad=${AD}, rol=${ROL}, aktif=true`);
  console.log('✓ TAMAM. Sezgin artık POS/Admin\'e PIN 2834 ile girebilir.');
  process.exit(0);
}

main().catch((e) => {
  console.error('HATA:', e.code || '', e.message);
  process.exit(1);
});
