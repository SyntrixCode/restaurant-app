/**
 * Tüm ürünlerin stokTakipli alanını ayarlar:
 *   - Paketli ürünler (kola, su, ayran, gazoz, meyve suyu vb) → true (stok takipli)
 *   - Diğer her şey (mutfak ürünleri: menemen, pide, kebap, çay, kahve) → false
 *
 * Kullanım: node scripts/set-stok-takibi.mjs [--dry]
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

// Paketli/şişe ürün anahtar kelimeleri — bunlar stok takipli olur
const PAKETLI = [
  'kola', 'cola', 'su', 'maden', 'soda', 'gazoz', 'fanta', 'sprite',
  'meyve suyu', 'meyvesuyu', 'ayran', 'salgam', 'salgam suyu',
  'limonata', 'ice tea', 'icetea', 'redbull', 'red bull', 'enerji',
  'sise', 'kutu',
];

function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o');
}

function isPaketli(ad) {
  const n = normalize(ad);
  const words = n.split(/\s+/);
  return PAKETLI.some((k) => {
    // Çok kelimeli anahtar (ör. "meyve suyu") → substring
    if (k.includes(' ')) return n.includes(k);
    // Tek kelime → tam kelime eşleşmesi ("su" → "sutlac" eşleşmesin)
    return words.includes(k);
  });
}

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

const dry = process.argv.includes('--dry');
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
const snap = await getDocs(collection(db, 'products'));
console.log(`Toplam ürün: ${snap.size}\n`);

let stoklu = 0, stoksuz = 0;
for (const d of snap.docs) {
  const p = d.data();
  const takipli = isPaketli(p.ad);
  console.log(`${takipli ? '📦 STOKLU ' : '🍳 stoksuz'} ${p.ad}`);
  if (takipli) stoklu++; else stoksuz++;
  if (!dry) {
    await updateDoc(doc(db, 'products', d.id), { stokTakipli: takipli });
  }
}

console.log('\n' + '─'.repeat(50));
console.log(`Stoklu (paketli): ${stoklu}  ·  Stoksuz (mutfak): ${stoksuz}`);
if (dry) console.log('(dry-run — değişiklik yapılmadı)');
process.exit(0);
