import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
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

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const derive = (kod) => {
  const h = sha(kod);
  return { email: `pos-${h.slice(0, 16)}@${POS_EMAIL_DOMAIN}`, password: h.slice(16, 64) };
};

const ADMIN = {
  email: 'admin@restoran.com',
  password: 'Admin123!',
  ad: 'Restoran Sahibi',
};

const POS_USERS = [
  { ad: 'Ali Yılmaz (Garson)', rol: 'garson', kod: '1234' },
  { ad: 'Ayşe Demir (Garson)', rol: 'garson', kod: '2345' },
  { ad: 'Mehmet Kaya (Kasiyer)', rol: 'kasiyer', kod: '9999' },
];

async function ensureUser(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return { user: cred.user, created: true };
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return { user: cred.user, created: false };
    }
    throw err;
  }
}

async function bootstrapAdmin() {
  const { user, created } = await ensureUser(ADMIN.email, ADMIN.password);
  await setDoc(
    doc(db, 'users', user.uid),
    {
      ad: ADMIN.ad,
      rol: 'admin',
      aktif: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`  ✓ Admin ${created ? 'oluşturuldu' : 'zaten vardı'}: ${ADMIN.email}`);
}

async function seedPosUser(u) {
  const { email, password } = derive(u.kod);
  const { user, created } = await ensureUser(email, password);
  await setDoc(
    doc(db, 'users', user.uid),
    {
      ad: u.ad,
      rol: u.rol,
      kodIpucu: `${u.kod[0]}***`,
      aktif: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  // Re-sign as admin so subsequent writes pass Firestore rules
  await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.password);
  console.log(
    `  ✓ ${u.rol.padEnd(8)} ${created ? 'eklendi   ' : 'güncellendi'} → kod ${u.kod}  (${u.ad})`,
  );
}

async function seedSettings() {
  await setDoc(
    doc(db, 'settings', 'global'),
    {
      gecikmeEsigiDk: 15,
      dusukStokEsigi: 5,
      restoranAd: 'Alazlı Konya Mutfağı',
      restoranAdres: '',
      restoranTel: '',
      vergiOrani: 10,
      paraBirimi: 'TL',
      kdvDahilFiyat: true,
      kasaAcilis: '08:00',
      kasaKapanis: '23:00',
      fisBasligi: 'LEZZET DURAĞI',
      fisAltMesaji: 'Bizi tercih ettiğiniz için teşekkür ederiz',
      otomatikFisBas: true,
      bildirimAyarlari: {
        gecikme: true,
        dusukStok: true,
        yeniPaket: true,
        callerID: true,
        rezervasyon: true,
        sesliUyari: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  console.log('  ✓ settings/global');
}

async function seedPrinters() {
  await setDoc(doc(db, 'printers', 'mutfak'), {
    ad: 'Mutfak',
    ip: '192.168.1.50',
    port: 9100,
    varsayilan: true,
    aktif: true,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'printers', 'bar'), {
    ad: 'Bar',
    ip: '192.168.1.51',
    port: 9100,
    varsayilan: false,
    aktif: true,
    createdAt: serverTimestamp(),
  });
  console.log('  ✓ 2 yazıcı (Mutfak varsayılan, Bar)');
}

async function seedCategoriesAndProducts() {
  const cats = [
    { id: 'kahvalti', ad: 'Kahvaltı', sira: 0, yaziciId: 'mutfak' },
    { id: 'corbalar', ad: 'Çorbalar', sira: 1, yaziciId: 'mutfak' },
    { id: 'ara-sicaklar', ad: 'Ara Sıcaklar', sira: 2, yaziciId: 'mutfak' },
    { id: 'salatalar', ad: 'Salatalar', sira: 3, yaziciId: 'mutfak' },
    { id: 'pideler', ad: 'Pideler', sira: 4, yaziciId: 'mutfak' },
    { id: 'yoresel', ad: 'Yöresel Lezzetler', sira: 5, yaziciId: 'mutfak' },
    { id: 'tatlilar', ad: 'Tatlılar', sira: 6, yaziciId: 'mutfak' },
    { id: 'icecekler', ad: 'İçecekler', sira: 7, yaziciId: 'bar' },
  ];
  const catBatch = writeBatch(db);
  for (const c of cats) {
    catBatch.set(doc(db, 'categories', c.id), {
      ad: c.ad,
      sira: c.sira,
      yaziciId: c.yaziciId,
      aktif: true,
      urunSayisi: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await catBatch.commit();

  const products = [
    { categoryId: 'kahvalti', ad: 'Serpme Kahvaltı', fiyat: 350, stok: 50 },
    { categoryId: 'kahvalti', ad: 'Menemen', fiyat: 180, stok: 30 },
    { categoryId: 'corbalar', ad: 'Mercimek Çorbası', fiyat: 90, stok: 40 },
    { categoryId: 'corbalar', ad: 'Ezogelin Çorbası', fiyat: 90, stok: 35 },
    { categoryId: 'ara-sicaklar', ad: 'Sigara Böreği', fiyat: 120, stok: 20 },
    { categoryId: 'ara-sicaklar', ad: 'Patates Kızartması', fiyat: 100, stok: 50 },
    { categoryId: 'salatalar', ad: 'Mevsim Salata', fiyat: 140, stok: 25 },
    { categoryId: 'salatalar', ad: 'Çoban Salata', fiyat: 130, stok: 25 },
    { categoryId: 'pideler', ad: 'Kıymalı Pide', fiyat: 250, stok: 15 },
    { categoryId: 'pideler', ad: 'Kuşbaşılı Pide', fiyat: 280, stok: 12 },
    { categoryId: 'pideler', ad: 'Karışık Pide', fiyat: 300, stok: 10 },
    { categoryId: 'yoresel', ad: 'Adana Kebap', fiyat: 380, stok: 18 },
    { categoryId: 'yoresel', ad: 'Urfa Kebap', fiyat: 380, stok: 15 },
    { categoryId: 'yoresel', ad: 'İskender', fiyat: 420, stok: 12 },
    { categoryId: 'tatlilar', ad: 'Künefe', fiyat: 220, stok: 20 },
    { categoryId: 'tatlilar', ad: 'Sütlaç', fiyat: 110, stok: 30 },
    { categoryId: 'icecekler', ad: 'Ayran', fiyat: 35, stok: 100 },
    { categoryId: 'icecekler', ad: 'Çay', fiyat: 25, stok: 200 },
    { categoryId: 'icecekler', ad: 'Türk Kahvesi', fiyat: 60, stok: 80 },
    { categoryId: 'icecekler', ad: 'Cola', fiyat: 50, stok: 60 },
  ];
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.ad]));

  for (const p of products) {
    await addDoc(collection(db, 'products'), {
      ad: p.ad,
      fiyat: p.fiyat,
      stok: p.stok,
      dusukStokEsigi: null,
      categoryId: p.categoryId,
      categoryAd: catMap[p.categoryId],
      aciklama: '',
      gorsel: null,
      aktif: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  console.log(`  ✓ ${cats.length} kategori + ${products.length} ürün`);
}

async function seedTables() {
  const tables = [
    { id: 't1', ad: 'Masa 1', zone: 'ic', kapasite: 4, x: 100, y: 100 },
    { id: 't2', ad: 'Masa 2', zone: 'ic', kapasite: 4, x: 240, y: 100 },
    { id: 't3', ad: 'Masa 3', zone: 'ic', kapasite: 2, x: 100, y: 240 },
    { id: 't4', ad: 'Masa 4', zone: 'ic', kapasite: 6, x: 240, y: 240 },
    { id: 't5', ad: 'Teras-1', zone: 'teras', kapasite: 4, x: 100, y: 100 },
    { id: 't6', ad: 'Teras-2', zone: 'teras', kapasite: 4, x: 240, y: 100 },
  ];
  const batch = writeBatch(db);
  tables.forEach((t, i) => {
    batch.set(doc(db, 'tables', t.id), {
      ad: t.ad,
      zone: t.zone,
      kapasite: t.kapasite,
      x: t.x,
      y: t.y,
      w: t.kapasite >= 8 ? 250 : t.kapasite >= 6 ? 200 : t.kapasite >= 4 ? 150 : 100,
      h: 100,
      durum: 'bos',
      grupId: null,
      rezervasyonNotu: null,
      siraNo: i,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
  console.log(`  ✓ ${tables.length} masa`);
}

async function main() {
  console.log(`\n🌱 Seed başlıyor (project: ${config.projectId})\n`);

  console.log('→ Admin:');
  await bootstrapAdmin();

  console.log('→ POS kullanıcıları:');
  for (const u of POS_USERS) await seedPosUser(u);

  console.log('→ Ayarlar:');
  await seedSettings();

  console.log('→ Yazıcılar:');
  await seedPrinters();

  console.log('→ Kategoriler + Ürünler:');
  await seedCategoriesAndProducts();

  console.log('→ Masalar:');
  await seedTables();

  await signOut(auth);

  console.log('\n✅ Seed tamamlandı.\n');
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│ TEST BİLGİLERİ                                  │');
  console.log('├─────────────────────────────────────────────────┤');
  console.log(`│ Admin → http://localhost:5173/admin/login       │`);
  console.log(`│   email   : ${ADMIN.email.padEnd(36)}│`);
  console.log(`│   şifre   : ${ADMIN.password.padEnd(36)}│`);
  console.log('├─────────────────────────────────────────────────┤');
  console.log(`│ POS → http://localhost:5173/pos/login           │`);
  for (const u of POS_USERS) {
    const line = `  ${u.kod}  →  ${u.ad}`;
    console.log(`│ ${line.padEnd(48)}│`);
  }
  console.log('└─────────────────────────────────────────────────┘\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed hatası:', err);
  process.exit(1);
});
