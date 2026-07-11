/**
 * Bir POS kodunun Firebase Auth hesabını KALICI siler → o 4 haneli kod serbest kalır.
 *
 * Panelden "sil" yalnızca Firestore dokümanını siliyor; koddan türetilen Auth hesabı
 * kalıyor ve kod "kullanımda" görünüyordu. Bu script hesaba koduyla giriş yapıp kendi
 * Auth kaydını siler (client SDK bir hesabın KENDİNİ silmesine izin verir → deploy gerekmez).
 *
 * Kullanım:
 *   node scripts/free-pos-code.mjs 1234 2345
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
import crypto from 'node:crypto';

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
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const POS_EMAIL_DOMAIN =
  env.VITE_POS_EMAIL_DOMAIN || `${config.projectId}.firebaseapp.com`;

if (!config.apiKey || !config.projectId) {
  console.error('❌ .env.local içinde Firebase config bulunamadı.');
  process.exit(1);
}

// Uygulamadaki derivePosCredentials ile BİREBİR aynı türetme.
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const derive = (kod) => {
  const h = sha(kod);
  return { email: `pos-${h.slice(0, 16)}@${POS_EMAIL_DOMAIN}`, password: h.slice(16, 64) };
};

const kodlar = process.argv.slice(2).map((k) => k.trim());
if (kodlar.length === 0) {
  console.log('Kullanım: node scripts/free-pos-code.mjs 1234 2345');
  process.exit(0);
}
for (const kod of kodlar) {
  if (!/^\d{4}$/.test(kod)) {
    console.error(`❌ Geçersiz kod (4 haneli olmalı): "${kod}"`);
    process.exit(1);
  }
}

const app = initializeApp(config);
const auth = getAuth(app);

async function main() {
  console.log(`\n🧹 POS kodu serbest bırakma (project: ${config.projectId})\n`);
  for (const kod of kodlar) {
    const { email, password } = derive(kod);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await deleteUser(cred.user);
      console.log(`  ✓ kod ${kod} → Auth hesabı silindi, kod serbest`);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        console.log(`  • kod ${kod} → zaten serbest (hesap yok)`);
      } else {
        console.error(`  ✗ kod ${kod}: ${err.code || err.message}`);
      }
    }
  }
  console.log('\n✅ Bitti. Panelde bu kodlar artık "Kod uygun" görünür; aynı kodla ekleyebilirsin.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
