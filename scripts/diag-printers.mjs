/**
 * Yazıcı yönlendirme teşhisi (read-only).
 * Çalıştırma: node scripts/diag-printers.mjs [arama-kelimesi]
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const NEEDLE = (process.argv[2] || 'pide').toLocaleLowerCase('tr-TR');
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const all = async (name) => (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, ...d.data() }));

await signInWithEmailAndPassword(auth, 'admin@restoran.com', '123456');
const [printers, categories, products] = await Promise.all([all('printers'), all('categories'), all('products')]);
const pById = new Map(printers.map((p) => [p.id, p]));
const cById = new Map(categories.map((c) => [c.id, c]));
const pName = (id) => (id && pById.get(id) ? `${pById.get(id).ad}${pById.get(id).aktif ? '' : ' [PASİF]'}` : id ? `??(${id})` : '—');

console.log('\n===== YAZICILAR =====');
printers.forEach((p) => console.log(`  ${p.aktif ? '🟢' : '⚪'} ${p.ad}  ip=${p.ip || '—'}  ${p.varsayilan ? '★VARSAYILAN' : ''} model=${p.model || '-'}`));
const def = printers.find((p) => p.aktif && p.ip && p.varsayilan) || printers.find((p) => p.aktif && p.ip);
console.log('  → Varsayılan (fallback):', def ? def.ad : 'YOK');

console.log('\n===== KATEGORİ → YAZICI =====');
categories.filter((c) => c.aktif !== false).sort((a, b) => (a.sira ?? 99) - (b.sira ?? 99))
  .forEach((c) => console.log(`  ${c.yaziciId ? '→' : '·'} ${c.ad.padEnd(28)} ${c.yaziciId ? pName(c.yaziciId) : '(atanmamış → varsayılan)'}`));

console.log(`\n===== "${NEEDLE}" İÇEREN ÜRÜNLER =====`);
const hits = products.filter((p) => (p.ad || '').toLocaleLowerCase('tr-TR').includes(NEEDLE));
hits.forEach((p) => {
  const cat = p.categoryId ? cById.get(p.categoryId) : null;
  const viaIds = Array.isArray(p.yaziciIds) && p.yaziciIds.length ? p.yaziciIds.map(pName).join(', ') : null;
  const hedef = viaIds || (cat?.yaziciId ? pName(cat.yaziciId) : (def ? `${def.ad} (varsayılan)` : 'YOK'));
  console.log(`  • ${p.ad}`);
  console.log(`      kategori: ${cat ? cat.ad : (p.categoryId ? `??(${p.categoryId})` : '— YOK')}  | aktif=${p.aktif !== false}`);
  console.log(`      ürün yaziciIds: ${viaIds || '—'}  | kategori yaziciId: ${cat?.yaziciId ? pName(cat.yaziciId) : '—'}`);
  console.log(`      ⇒ GİDECEĞİ YAZICI: ${hedef}`);
});

console.log('\n===== RİSKLİ ÜRÜNLER (kategorisiz & yaziciIds yok → hepsi varsayılana) =====');
const risky = products.filter((p) => p.aktif !== false && !p.categoryId && !(Array.isArray(p.yaziciIds) && p.yaziciIds.length));
console.log(`  ${risky.length} ürün → ${risky.slice(0, 20).map((p) => p.ad).join(', ')}${risky.length > 20 ? ' …' : ''}`);

console.log('\n===== KATEGORİSİ YAZICISIZ ÜRÜN SAYISI (varsayılana düşenler) =====');
const noPrinterCats = categories.filter((c) => !c.yaziciId).map((c) => c.id);
const fallbackProducts = products.filter((p) => p.aktif !== false && p.categoryId && noPrinterCats.includes(p.categoryId) && !(Array.isArray(p.yaziciIds) && p.yaziciIds.length));
const byCat = {};
fallbackProducts.forEach((p) => { const n = cById.get(p.categoryId)?.ad || '?'; byCat[n] = (byCat[n] || 0) + 1; });
Object.entries(byCat).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));
process.exit(0);
