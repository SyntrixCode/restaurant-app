import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID };
const GUN = process.argv[2] || '2026-09-25';
const PLAT = ['trendyol', 'getir', 'yemeksepeti', 'migros'];
const toK = (n) => Math.round((Number(n) || 0) * 100), fromK = (k) => (k / 100).toFixed(2);
const isTA = (a) => (a || '').toLowerCase().startsWith('syntrix');
const isTR = (r) => r?.test === true || isTA(r?.garsonAd) || isTA(r?.kasiyerAd);
const app = initializeApp(cfg);
await signInWithEmailAndPassword(getAuth(app), 'admin@restoran.com', '123456');
const db = getFirestore(app);
const [pS, aS] = await Promise.all([
  getDocs(query(collection(db, 'payments'), where('gun', '==', GUN))),
  getDocs(query(collection(db, 'archivedOrders'), where('gun', '==', GUN))),
]);
const km = new Map(); aS.forEach((d) => { if (!isTR(d.data())) km.set(d.id, d.data().paketKaynak); });
let nakit = 0, kart = 0, yemek = 0, diger = 0; const plat = { trendyol: 0, getir: 0, yemeksepeti: 0, migros: 0 };
let uygSay = 0;
pS.forEach((d) => {
  const p = d.data(); if (isTR(p)) return; const k = toK(p.tutar);
  if (p.yontem === 'nakit') nakit += k; else if (p.yontem === 'kart') kart += k; else if (p.yontem === 'yemekKarti') yemek += k;
  else if (p.yontem === 'uygulama') { uygSay++; const kk = km.get(p.orderId); if (kk && PLAT.includes(kk)) plat[kk] += k; else diger += k; }
  else diger += k;
});
const pt = plat.trendyol + plat.getir + plat.yemeksepeti + plat.migros;
console.log(`GÜN ${GUN}  (archived: ${aS.size}, uygulama ödemesi: ${uygSay})`);
console.log(`  Nakit:        ${fromK(nakit)}`);
console.log(`  Kart:         ${fromK(kart)}`);
console.log(`  Yemek Kartı:  ${fromK(yemek)}`);
console.log(`  Trendyol:     ${fromK(plat.trendyol)}`);
console.log(`  Getir:        ${fromK(plat.getir)}`);
console.log(`  Yemeksepeti:  ${fromK(plat.yemeksepeti)}`);
console.log(`  Migros:       ${fromK(plat.migros)}`);
console.log(`  Diğer:        ${fromK(diger)}`);
console.log(`  --------------------------------`);
console.log(`  TOPLAM CİRO:  ${fromK(nakit + kart + yemek + pt + diger)}`);
console.log(`  (ESKİ mantık nakit = ${fromK(nakit + pt + diger)}  → platform ${fromK(pt)} yanlış nakite yazılıyordu)`);
process.exit(0);
