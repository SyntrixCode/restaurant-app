/**
 * urun.xlsx → ingredients (Malzemeler) koleksiyonuna toplu ekleme.
 * Auth: admin@restoran.com (client SDK, isAdmin kuralını geçer).
 * Çalıştırma: node scripts/import-ingredients.mjs [--commit]
 *   --commit olmadan: sadece önizleme (dry-run), yazmaz.
 */
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, doc, writeBatch, serverTimestamp,
} from 'firebase/firestore';

const COMMIT = process.argv.includes('--commit');
const ADMIN = { email: 'admin@restoran.com', password: '123456' };

function loadEnv(path = '.env.local') {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
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

const norm = (s) => (s || '').toString().trim().replace(/\s+/g, ' ');
const key = (s) => norm(s).toLocaleUpperCase('tr-TR');

function mapBirim(b) {
  const x = key(b);
  if (x === 'KG') return 'kg';
  if (x === 'PAKET') return 'paket';
  if (x === 'ADET LT' || x === 'LT') return 'lt';
  if (x === 'ADET') return 'adet';
  if (x === 'GRAM' || x === 'GR') return 'gram';
  if (x === 'ML') return 'ml';
  return 'kg';
}
function mapKategori(k) {
  const x = norm(k);
  const up = key(k);
  if (up === 'BAKLIYAT VE MAKARNA') return 'BAKLİYAT VE MAKARNA';
  if (up === 'KAHVALTILIK') return 'KAHVALTILIK ÜRÜNLER';
  if (up === 'ICICEK') return 'İÇECEK';
  return x;
}

const rows = XLSX.utils.sheet_to_json(XLSX.readFile('urun.xlsx').Sheets['Sheet1'], { defval: '' });

// Dosya içi tekrarları ele
const seen = new Set();
const items = [];
for (const r of rows) {
  const ad = norm(r['MALZEME ADI']);
  if (!ad) continue;
  const k = key(ad);
  if (seen.has(k)) continue;
  seen.add(k);
  items.push({ ad, birim: mapBirim(r['BİRİM']), kategori: mapKategori(r['KATEGORİ']) });
}

const run = async () => {
  await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.password);
  console.log('✓ admin girişi ok');

  // Mevcut malzemeler (duplicate yazma)
  const snap = await getDocs(collection(db, 'ingredients'));
  const existing = new Set();
  snap.forEach((d) => existing.add(key(d.data().ad)));
  console.log(`Mevcut malzeme: ${existing.size}`);

  const toAdd = items.filter((it) => !existing.has(key(it.ad)));
  const skipped = items.length - toAdd.length;
  console.log(`Dosyadaki benzersiz: ${items.length} | yeni: ${toAdd.length} | zaten var: ${skipped}`);

  // Kategori dağılımı
  const byCat = {};
  toAdd.forEach((it) => (byCat[it.kategori] = (byCat[it.kategori] || 0) + 1));
  console.log('\nKategori dağılımı (yeni):');
  Object.entries(byCat).sort().forEach(([k, v]) => console.log(`  ${v.toString().padStart(3)}  ${k}`));

  if (!COMMIT) {
    console.log('\n[DRY-RUN] Yazılmadı. Onaylamak için: node scripts/import-ingredients.mjs --commit');
    process.exit(0);
  }

  let batch = writeBatch(db), n = 0, total = 0;
  for (const it of toAdd) {
    const ref = doc(collection(db, 'ingredients'));
    batch.set(ref, {
      ad: it.ad,
      birim: it.birim,
      kategori: it.kategori,
      stok: 0,
      dusukStokEsigi: null,
      birimMaliyet: null,
      tedarikciId: '',
      aktif: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    n++; total++;
    if (n >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  console.log(`\n✓ ${total} malzeme eklendi.`);
  process.exit(0);
};

run().catch((e) => { console.error('HATA:', e.code || '', e.message); process.exit(1); });
