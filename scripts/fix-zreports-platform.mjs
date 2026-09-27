// GEÇMİŞE DÖNÜK DÜZELTME: zReports dokümanlarında platform (uygulama) ödemeleri
// yanlışlıkla NAKİT'e yazılmıştı. Bu script her zReport'u o günün ham verisinden
// (payments + archivedOrders) yeniden hesaplar ve düzeltir:
//   - toplamNakit (sadece gerçek nakit), toplamKart, toplamYemekKarti
//   - toplamTrendyol/Getir/Yemeksepeti/Migros, toplamPlatform, toplamDiger
//   - beklenenNakit = acilisKasa + nakit ; fark = sayilanNakit - beklenenNakit
//
// Çalıştır:  node scripts/fix-zreports-platform.mjs           (önizleme — yazMAZ)
//            node scripts/fix-zreports-platform.mjs --apply    (gerçekten yazar)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
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

const PLATFORM_KAYNAKLAR = ['trendyol', 'getir', 'yemeksepeti', 'migros'];
const toK = (n) => Math.round((Number(n) || 0) * 100);
const fromK = (k) => k / 100;
const isTestAccount = (ad) => (ad || '').toLowerCase().startsWith('syntrix');
const isTestRecord = (r) =>
  r?.test === true || isTestAccount(r?.garsonAd) || isTestAccount(r?.kasiyerAd);
const tl = (n) => (Number(n) || 0).toFixed(2);

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, 'admin@restoran.com', '123456');

  const zSnap = await getDocs(collection(db, 'zReports'));
  console.log(`${zSnap.size} adet zReport bulundu.${APPLY ? '' : '  (ÖNİZLEME — yazılmayacak)'}\n`);

  let degisen = 0;
  for (const zdoc of zSnap.docs) {
    const z = zdoc.data();
    const gun = z.gun;
    if (!gun) continue;

    const [paySnap, arsivSnap] = await Promise.all([
      getDocs(query(collection(db, 'payments'), where('gun', '==', gun))),
      getDocs(query(collection(db, 'archivedOrders'), where('gun', '==', gun))),
    ]);

    // Güvenlik: o güne ait ham veri yoksa (silinmiş/eski kayıt) DOKUNMA — sıfırlama.
    if (paySnap.size === 0 && arsivSnap.size === 0) {
      console.log(`${gun}: ham veri yok (payments+archived boş) → ATLANDI (dokunulmadı)`);
      continue;
    }

    const kaynakMap = new Map();
    for (const d of arsivSnap.docs) {
      const o = d.data();
      if (isTestRecord(o)) continue;
      kaynakMap.set(d.id, o.paketKaynak || null);
    }

    let nakitK = 0, kartK = 0, yemekK = 0, digerK = 0;
    const platK = { trendyol: 0, getir: 0, yemeksepeti: 0, migros: 0 };
    for (const d of paySnap.docs) {
      const p = d.data();
      if (isTestRecord(p)) continue;
      const k = toK(p.tutar);
      if (p.yontem === 'nakit') nakitK += k;
      else if (p.yontem === 'kart') kartK += k;
      else if (p.yontem === 'yemekKarti') yemekK += k;
      else if (p.yontem === 'uygulama') {
        const kaynak = kaynakMap.get(p.orderId);
        if (kaynak && PLATFORM_KAYNAKLAR.includes(kaynak)) platK[kaynak] += k;
        else digerK += k;
      } else digerK += k;
    }
    const platformToplamK = platK.trendyol + platK.getir + platK.yemeksepeti + platK.migros;
    const toplamK = nakitK + kartK + yemekK + platformToplamK + digerK;

    const acilis = Number(z.acilisKasa || 0);
    const sayilan = Number(z.sayilanNakit || 0);
    const beklenenNakit = acilis + fromK(nakitK);
    const fark = sayilan - beklenenNakit;

    const patch = {
      toplamNakit: fromK(nakitK),
      toplamKart: fromK(kartK),
      toplamYemekKarti: fromK(yemekK),
      toplamTrendyol: fromK(platK.trendyol),
      toplamGetir: fromK(platK.getir),
      toplamYemeksepeti: fromK(platK.yemeksepeti),
      toplamMigros: fromK(platK.migros),
      toplamPlatform: fromK(platformToplamK),
      toplamDiger: fromK(digerK),
      toplamCiro: fromK(toplamK),
      beklenenNakit,
      fark,
      platformDuzeltmeUygulandi: true,
    };

    const eskiNakit = Number(z.toplamNakit || 0);
    const fark2 = Math.abs(eskiNakit - patch.toplamNakit);
    if (fark2 > 0.005 || platformToplamK > 0) {
      degisen++;
      console.log(
        `${gun}: nakit ${tl(eskiNakit)} → ${tl(patch.toplamNakit)}  |  platform ${tl(fromK(platformToplamK))}` +
          ` (T:${tl(fromK(platK.trendyol))} G:${tl(fromK(platK.getir))} YS:${tl(fromK(platK.yemeksepeti))} M:${tl(fromK(platK.migros))})` +
          `  |  fark ${tl(z.fark)} → ${tl(fark)}`,
      );
      if (APPLY) await updateDoc(doc(db, 'zReports', zdoc.id), patch);
    }
  }

  console.log(`\n${degisen} zReport ${APPLY ? 'DÜZELTİLDİ' : 'düzeltilecek (--apply ile çalıştır)'}.`);
  process.exit(0);
}
main().catch((e) => {
  console.error('HATA:', e.code || '', e.message);
  process.exit(1);
});
