/** Canlı veri sağlık taraması (read-only). node scripts/health-scan.mjs */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

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
const all = async (n) => (await getDocs(collection(db, n))).docs.map((d) => ({ id: d.id, ...d.data() }));

await signInWithEmailAndPassword(auth, 'admin@restoran.com', '123456');
const [printers, categories, products, tables] = await Promise.all([all('printers'), all('categories'), all('products'), all('tables')]);
const cById = new Map(categories.map((c) => [c.id, c]));
const list = (a, n = 8) => (a.length ? a.slice(0, n).join(' | ') + (a.length > n ? ' …' : '') : 'yok');

console.log('════════ SAĞLIK TARAMASI ════════');

const varsay = printers.filter((p) => p.varsayilan);
const aktifIpsiz = printers.filter((p) => p.aktif && !p.ip);
console.log('\n[YAZICILAR] toplam', printers.length);
if (varsay.length > 1) console.log('  UYARI: birden fazla VARSAYILAN ->', varsay.map((p) => p.ad).join(', '));
if (aktifIpsiz.length) console.log('  UYARI: aktif ama IPsiz (basamaz) ->', aktifIpsiz.map((p) => p.ad).join(', '));
if (varsay.length <= 1 && !aktifIpsiz.length) console.log('  OK');

const akt = products.filter((p) => p.aktif !== false);
const fiyatsiz = akt.filter((p) => !(Number(p.fiyat) > 0));
const katsiz = akt.filter((p) => !p.categoryId || !cById.get(p.categoryId));
console.log('\n[URUNLER] aktif', akt.length, '/ toplam', products.length);
console.log('  Fiyati 0/bos aktif urun:', fiyatsiz.length, '->', list(fiyatsiz.map((p) => p.ad)));
console.log('  Kategorisi yok/silinmis aktif urun:', katsiz.length, '->', list(katsiz.map((p) => p.ad)));

const aktKat = categories.filter((c) => c.aktif !== false);
const bosKat = aktKat.filter((c) => !akt.some((p) => p.categoryId === c.id));
console.log('\n[KATEGORILER] aktif', aktKat.length);
console.log('  Icinde aktif urun olmayan:', bosKat.length, '->', list(bosKat.map((c) => c.ad)));

const adsiz = tables.filter((t) => !t.ad);
console.log('\n[MASALAR] toplam', tables.length, '| adsiz:', adsiz.length);

const snap = await getDoc(doc(db, 'settings', 'general')).catch(() => null);
if (snap && snap.exists()) {
  const s = snap.data();
  console.log('\n[AYARLAR]');
  console.log('  restoranAd:', s.restoranAd || '(BOS)', '| adres:', s.restoranAdres ? 'var' : '(bos)', '| tel:', s.restoranTel ? 'var' : '(bos)');
  console.log('  garsonCagirma:', s.garsonCagirmaAcik !== false ? 'acik' : 'KAPALI', '| fisLogoBas:', s.fisLogoBas !== false ? 'acik' : 'kapali');
} else {
  console.log('\n[AYARLAR] settings/general bulunamadi (UYARI)');
}

console.log('\n════════ BITTI ════════');
process.exit(0);
