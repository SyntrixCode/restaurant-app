/**
 * Firestore products koleksiyonundaki her ürün için isim eşleştirmesi
 * yaparak küratörlü bir Pexels/Unsplash foto URL'si atar.
 *
 * Kullanım:
 *   node scripts/import-menu-photos.mjs              # tüm boş gorsel'leri doldur
 *   node scripts/import-menu-photos.mjs --overwrite  # mevcut görselleri de değiştir
 *   node scripts/import-menu-photos.mjs --dry        # değişikliği uygulama, sadece raporla
 *
 * Auth: .env.local'deki admin@restoran.com / Admin123! kullanılır.
 */

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';

// ─── Kürate edilmiş foto eşlemeleri ──────────────────────────────────────
// Anahtarlar: normalize edilmiş Türkçe ürün adı (lowercase, Türkçe → ascii).
// Değerler: Pexels/Unsplash CDN URL'leri (commercial use izinli, hot-link OK).
// Birden fazla eşleşen anahtar varsa en uzun match kazanır.
const PHOTO_MAP = {
  // KAHVALTI
  'serpme kahvalti': 'https://images.pexels.com/photos/14654379/pexels-photo-14654379.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kahvalti': 'https://images.pexels.com/photos/18543435/pexels-photo-18543435.jpeg?auto=compress&cs=tinysrgb&w=800',
  'menemen': 'https://images.pexels.com/photos/36472448/pexels-photo-36472448.jpeg?auto=compress&cs=tinysrgb&w=800',
  'omlet': 'https://images.pexels.com/photos/824635/pexels-photo-824635.jpeg?auto=compress&cs=tinysrgb&w=800',
  'sucuklu yumurta': 'https://images.pexels.com/photos/824635/pexels-photo-824635.jpeg?auto=compress&cs=tinysrgb&w=800',

  // KEBAP / IZGARA
  'adana kebap': 'https://images.pexels.com/photos/31587880/pexels-photo-31587880.jpeg?auto=compress&cs=tinysrgb&w=800',
  'urfa kebap': 'https://images.pexels.com/photos/31587880/pexels-photo-31587880.jpeg?auto=compress&cs=tinysrgb&w=800',
  'iskender': 'https://images.pexels.com/photos/32986454/pexels-photo-32986454.jpeg?auto=compress&cs=tinysrgb&w=800',
  'sigara boregi': 'https://images.pexels.com/photos/15832108/pexels-photo-15832108.jpeg?auto=compress&cs=tinysrgb&w=800',
  'borek': 'https://images.pexels.com/photos/15832108/pexels-photo-15832108.jpeg?auto=compress&cs=tinysrgb&w=800',
  'patates kizartmasi': 'https://images.pexels.com/photos/115740/pexels-photo-115740.jpeg?auto=compress&cs=tinysrgb&w=800',
  'patates': 'https://images.pexels.com/photos/115740/pexels-photo-115740.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kebap': 'https://images.pexels.com/photos/3535383/pexels-photo-3535383.jpeg?auto=compress&cs=tinysrgb&w=800',
  'sis kebap': 'https://images.pexels.com/photos/8629142/pexels-photo-8629142.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kofte': 'https://images.pexels.com/photos/6605206/pexels-photo-6605206.jpeg?auto=compress&cs=tinysrgb&w=800',
  'tavuk sis': 'https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=800',
  'tavuk': 'https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=800',

  // PIDE / LAHMACUN
  'karisik pide': 'https://images.pexels.com/photos/7813739/pexels-photo-7813739.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kiymali pide': 'https://images.pexels.com/photos/7813739/pexels-photo-7813739.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kasarli pide': 'https://images.pexels.com/photos/7813739/pexels-photo-7813739.jpeg?auto=compress&cs=tinysrgb&w=800',
  'pide': 'https://images.pexels.com/photos/7813739/pexels-photo-7813739.jpeg?auto=compress&cs=tinysrgb&w=800',
  'lahmacun': 'https://images.pexels.com/photos/13311755/pexels-photo-13311755.jpeg?auto=compress&cs=tinysrgb&w=800',

  // YÖRESEL
  'tirit': 'https://images.pexels.com/photos/8629082/pexels-photo-8629082.jpeg?auto=compress&cs=tinysrgb&w=800',
  'etli ekmek': 'https://images.pexels.com/photos/7813739/pexels-photo-7813739.jpeg?auto=compress&cs=tinysrgb&w=800',
  'mantı': 'https://images.pexels.com/photos/12771807/pexels-photo-12771807.jpeg?auto=compress&cs=tinysrgb&w=800',
  'manti': 'https://images.pexels.com/photos/12771807/pexels-photo-12771807.jpeg?auto=compress&cs=tinysrgb&w=800',
  'ali nazik': 'https://images.pexels.com/photos/6605206/pexels-photo-6605206.jpeg?auto=compress&cs=tinysrgb&w=800',

  // ÇORBA
  'mercimek corba': 'https://images.pexels.com/photos/5409027/pexels-photo-5409027.jpeg?auto=compress&cs=tinysrgb&w=800',
  'ezogelin corba': 'https://images.pexels.com/photos/5409027/pexels-photo-5409027.jpeg?auto=compress&cs=tinysrgb&w=800',
  'yayla corba': 'https://images.pexels.com/photos/5409027/pexels-photo-5409027.jpeg?auto=compress&cs=tinysrgb&w=800',
  'corba': 'https://images.pexels.com/photos/5409027/pexels-photo-5409027.jpeg?auto=compress&cs=tinysrgb&w=800',

  // SALATA / MEZE
  'coban salata': 'https://images.pexels.com/photos/1059905/pexels-photo-1059905.jpeg?auto=compress&cs=tinysrgb&w=800',
  'mevsim salata': 'https://images.pexels.com/photos/1059905/pexels-photo-1059905.jpeg?auto=compress&cs=tinysrgb&w=800',
  'salata': 'https://images.pexels.com/photos/1059905/pexels-photo-1059905.jpeg?auto=compress&cs=tinysrgb&w=800',
  'humus': 'https://images.pexels.com/photos/6275171/pexels-photo-6275171.jpeg?auto=compress&cs=tinysrgb&w=800',
  'cacik': 'https://images.pexels.com/photos/6275171/pexels-photo-6275171.jpeg?auto=compress&cs=tinysrgb&w=800',

  // TATLI
  'kunefe': 'https://images.pexels.com/photos/37118306/pexels-photo-37118306.jpeg?auto=compress&cs=tinysrgb&w=800',
  'baklava': 'https://images.pexels.com/photos/5323489/pexels-photo-5323489.jpeg?auto=compress&cs=tinysrgb&w=800',
  'sutlac': 'https://images.pexels.com/photos/30403808/pexels-photo-30403808.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kazandibi': 'https://images.pexels.com/photos/30403755/pexels-photo-30403755.jpeg?auto=compress&cs=tinysrgb&w=800',
  'dondurma': 'https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=800',

  // İÇECEKLER
  'turk kahvesi': 'https://images.pexels.com/photos/4109743/pexels-photo-4109743.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kahve': 'https://images.pexels.com/photos/4109743/pexels-photo-4109743.jpeg?auto=compress&cs=tinysrgb&w=800',
  'cay': 'https://images.pexels.com/photos/28572821/pexels-photo-28572821.jpeg?auto=compress&cs=tinysrgb&w=800',
  'ayran': 'https://images.pexels.com/photos/26648792/pexels-photo-26648792.jpeg?auto=compress&cs=tinysrgb&w=800',
  'kola': 'https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg?auto=compress&cs=tinysrgb&w=800',
  'cola': 'https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg?auto=compress&cs=tinysrgb&w=800',
  'fanta': 'https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg?auto=compress&cs=tinysrgb&w=800',
  'gazoz': 'https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg?auto=compress&cs=tinysrgb&w=800',
  'su': 'https://images.pexels.com/photos/327090/pexels-photo-327090.jpeg?auto=compress&cs=tinysrgb&w=800',
  'maden suyu': 'https://images.pexels.com/photos/327090/pexels-photo-327090.jpeg?auto=compress&cs=tinysrgb&w=800',
  'meyve suyu': 'https://images.pexels.com/photos/1337824/pexels-photo-1337824.jpeg?auto=compress&cs=tinysrgb&w=800',
  'limonata': 'https://images.pexels.com/photos/1337824/pexels-photo-1337824.jpeg?auto=compress&cs=tinysrgb&w=800',
  'salgam': 'https://images.pexels.com/photos/8629142/pexels-photo-8629142.jpeg?auto=compress&cs=tinysrgb&w=800',

  // VARSAYILAN — eşleşme yoksa
  '_default': 'https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=800',
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD') // combining marks'ı ayır (İ → i + nokta)
    .replace(/[̀-ͯ]/g, '') // tüm aksanlı işaretleri sil
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPhoto(productName) {
  const n = normalize(productName);
  // Daha uzun anahtar daha spesifik — önce onları dene
  const keys = Object.keys(PHOTO_MAP)
    .filter((k) => k !== '_default')
    .sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (n.includes(k)) return { url: PHOTO_MAP[k], matched: k };
  }
  return { url: PHOTO_MAP._default, matched: '_default' };
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

// ─── Main ────────────────────────────────────────────────────────────────

const overwrite = process.argv.includes('--overwrite');
const dryRun = process.argv.includes('--dry');

const env = loadEnv();
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

if (!config.apiKey) {
  console.error('❌ .env.local içinde Firebase config bulunamadı.');
  process.exit(1);
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = env.SEED_ADMIN_EMAIL || 'admin@restoran.com';
const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD || 'Admin123!';

console.log(`→ ${ADMIN_EMAIL} ile giriş yapılıyor...`);
await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
console.log('✓ Giriş başarılı\n');

const snap = await getDocs(collection(db, 'products'));
console.log(`Toplam ürün: ${snap.size}\n`);

const stats = { updated: 0, skipped: 0, defaulted: 0 };
const log = [];

for (const d of snap.docs) {
  const p = d.data();
  const hasPhoto = !!p.gorsel;

  if (hasPhoto && !overwrite) {
    log.push(`⊘ Atla: ${p.ad} (görseli var)`);
    stats.skipped++;
    continue;
  }

  const { url, matched } = findPhoto(p.ad);
  if (matched === '_default') stats.defaulted++;
  log.push(
    `${matched === '_default' ? '?' : '✓'} ${p.ad.padEnd(30)} → ${matched}`,
  );

  if (!dryRun) {
    await updateDoc(doc(db, 'products', d.id), { gorsel: url });
  }
  stats.updated++;
}

log.forEach((line) => console.log(line));
console.log('');
console.log('─'.repeat(60));
console.log(`Güncellenen: ${stats.updated}  ·  Atlanan: ${stats.skipped}  ·  Eşleşmedi (varsayılan): ${stats.defaulted}`);
if (dryRun) console.log('(dry-run — Firestore değişmedi)');
process.exit(0);
