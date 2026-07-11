import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { toBaseQty } from '../utils/units';

function gunString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Tedarikçi faturası kaydeder: tek transaction'da
 *  - fatura kalemlerinin stoğunu artırır (ingredient → ana birime çevrilir; product → adet),
 *  - ingredient kalemlerinde birim maliyeti günceller (KDV hariç),
 *  - product kalemleri için stockMovements'a 'tedarik' girişi düşer,
 *  - tedarikçi (cari) bakiyesini fatura tutarı kadar ARTIRIR (borç, KDV DAHİL),
 *  - tedarikciHareketleri'ne 'fatura' kaydı düşer,
 *  - tedarikciFaturalari'na fatura belgesini yazar.
 *
 * Kalem tipleri: 'ingredient' | 'product' | 'diger' (stok dışı — temizlik vb.)
 */
export async function kaydetTedarikciFatura({
  tedarikciId,
  tedarikciAd,
  faturaNo,
  tarih,
  dosyaUrl,
  dosyaAd,
  dosyaPath,
  kalemler,
  notlar,
  kullaniciId,
  kullaniciAd,
}) {
  if (!tedarikciId) throw new Error('Tedarikçi seçilmedi');
  if (!Array.isArray(kalemler) || kalemler.length === 0) throw new Error('En az 1 kalem ekleyin');

  const supplierRef = doc(db, 'suppliers', tedarikciId);
  // Stoklu kalemler (malzeme/ürün) stoğu günceller; 'diger' (temizlik vb.) stok dışıdır,
  // yalnızca fatura toplamına ve borca girer.
  const stoklu = kalemler.filter((k) => k.tip === 'ingredient' || k.tip === 'product');
  const digerKalemler = kalemler.filter((k) => k.tip === 'diger');
  const lineRefs = stoklu.map((k) => ({
    k,
    ref: doc(db, k.tip === 'product' ? 'products' : 'ingredients', k.refId),
  }));

  return runTransaction(db, async (txn) => {
    // ---- READS (tüm yazımlardan ÖNCE) ----
    const supplierSnap = await txn.get(supplierRef);
    if (!supplierSnap.exists()) throw new Error('Tedarikçi bulunamadı');

    const lineData = [];
    for (const { k, ref } of lineRefs) {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error(`Kalem bulunamadı: ${k.ad || k.refId}`);
      lineData.push({ k, ref, data: snap.data() });
    }

    // ---- HESAP ----
    // tutar = KDV hariç satır; tutarKdvDahil = KDV dahil. Borç (toplam) KDV DAHİL'dir
    // (faturadaki "Ödenecek Tutar"). Stok maliyeti ise KDV hariç fiyatla hesaplanır.
    let toplam = 0; // KDV dahil
    let toplamHaric = 0;
    const faturaKalemler = [];
    for (const { k, data } of lineData) {
      const miktar = Number(k.miktar) || 0;
      const birimFiyat = Number(k.birimFiyat) || 0;
      const kdv = Number(k.kdv) || 0;
      const satirTutar = Math.round(miktar * birimFiyat * 100) / 100;
      const satirDahil = Math.round(satirTutar * (1 + kdv / 100) * 100) / 100;
      toplam += satirDahil;
      toplamHaric += satirTutar;
      // stoğa eklenecek miktar (ana birim cinsinden)
      const stokArtis = k.tip === 'ingredient' ? toBaseQty(miktar, k.birim, data.birim) : miktar;
      faturaKalemler.push({
        tip: k.tip,
        refId: k.refId,
        ad: k.ad || data.ad || '',
        stokKodu: k.stokKodu || '',
        miktar,
        birim: k.birim || data.birim || (k.tip === 'product' ? 'adet' : ''),
        birimFiyat,
        kdv,
        tutar: satirTutar,
        tutarKdvDahil: satirDahil,
        stokArtis,
        anaBirim: data.birim || (k.tip === 'product' ? 'adet' : ''),
      });
    }
    // Stok dışı kalemler (temizlik vb.) — stoğa dokunmaz, sadece toplam + borç
    for (const k of digerKalemler) {
      const miktar = Number(k.miktar) || 0;
      const birimFiyat = Number(k.birimFiyat) || 0;
      const kdv = Number(k.kdv) || 0;
      const satirTutar = Math.round(miktar * birimFiyat * 100) / 100;
      const satirDahil = Math.round(satirTutar * (1 + kdv / 100) * 100) / 100;
      toplam += satirDahil;
      toplamHaric += satirTutar;
      faturaKalemler.push({
        tip: 'diger',
        refId: null,
        ad: k.ad || '',
        stokKodu: k.stokKodu || '',
        miktar,
        birim: k.birim || 'adet',
        birimFiyat,
        kdv,
        tutar: satirTutar,
        tutarKdvDahil: satirDahil,
        stokArtis: 0,
        anaBirim: '',
      });
    }
    toplam = Math.round(toplam * 100) / 100;
    toplamHaric = Math.round(toplamHaric * 100) / 100;

    const oncekiBakiye = Number(supplierSnap.data().bakiye || 0);
    const yeniBakiye = oncekiBakiye + toplam;
    const gun = gunString();
    const faturaRef = doc(collection(db, 'tedarikciFaturalari'));

    // ---- WRITES ----
    for (let i = 0; i < lineData.length; i++) {
      const { k, ref, data } = lineData[i];
      const fk = faturaKalemler[i];
      const oncekiStok = Number(data.stok || 0);
      const yeniStok = oncekiStok + fk.stokArtis;

      if (k.tip === 'ingredient') {
        // ana birim başına maliyet = KDV hariç satır tutarı / ana birim miktar
        const patch = { stok: yeniStok, updatedAt: serverTimestamp() };
        if (fk.stokArtis > 0 && fk.tutar > 0) {
          patch.birimMaliyet = Math.round((fk.tutar / fk.stokArtis) * 100) / 100;
        }
        txn.update(ref, patch);
      } else {
        txn.update(ref, { stok: yeniStok, updatedAt: serverTimestamp() });
        // Ürün stok hareketi — Stok Yönetimi ekranında görünür
        txn.set(doc(collection(db, 'stockMovements')), {
          productId: k.refId,
          productAd: fk.ad,
          tip: 'giris',
          miktar: fk.stokArtis,
          oncekiStok,
          yeniStok,
          kaynak: 'tedarik',
          tedarikciId,
          tedarikciAd: tedarikciAd || supplierSnap.data().ad || null,
          ilgiliId: faturaRef.id,
          kullaniciId: kullaniciId || null,
          kullaniciAd: kullaniciAd || null,
          zaman: serverTimestamp(),
          aciklama: faturaNo ? `Fatura ${faturaNo}` : 'Tedarikçi faturası',
        });
      }
    }

    // Tedarikçi (cari) bakiyesi
    txn.update(supplierRef, { bakiye: yeniBakiye, updatedAt: serverTimestamp() });
    txn.set(doc(collection(db, 'tedarikciHareketleri')), {
      tedarikciId,
      tedarikciAd: tedarikciAd || supplierSnap.data().ad || '',
      tip: 'fatura',
      tutar: toplam,
      oncekiBakiye,
      yeniBakiye,
      faturaId: faturaRef.id,
      faturaNo: faturaNo || null,
      kullaniciId: kullaniciId || null,
      kullaniciAd: kullaniciAd || null,
      zaman: serverTimestamp(),
      gun,
    });

    // Fatura belgesi
    txn.set(faturaRef, {
      tedarikciId,
      tedarikciAd: tedarikciAd || supplierSnap.data().ad || '',
      faturaNo: faturaNo || null,
      tarih: tarih || gun,
      tutar: toplam,
      toplamHaric,
      dosyaUrl: dosyaUrl || null,
      dosyaAd: dosyaAd || null,
      dosyaPath: dosyaPath || null,
      kalemler: faturaKalemler.map(({ stokArtis, ...rest }) => rest),
      notlar: notlar || null,
      kullaniciId: kullaniciId || null,
      kullaniciAd: kullaniciAd || null,
      createdAt: serverTimestamp(),
      gun,
    });

    return { faturaId: faturaRef.id, toplam, yeniBakiye };
  });
}

/**
 * Tedarikçi faturasını SİLER ve etkilerini GERİ ALIR:
 *  - fatura kalemlerinin eklediği stoğu geri çıkarır (max 0'a kadar),
 *  - ürün kalemleri için düzeltme (çıkış) stok hareketi düşer,
 *  - tedarikçi bakiyesini (borcu) fatura tutarı kadar AZALTIR,
 *  - tedarikciHareketleri'ne 'iptal' kaydı düşer,
 *  - fatura belgesini siler.
 * NOT: malzeme birim maliyeti faturayla güncellenmişti; eski değere geri DÖNMEZ.
 *
 * @returns {{ dosyaPath: string|null }} Storage'daki dosyayı UI tarafının temizlemesi için.
 */
export async function silTedarikciFatura({ faturaId, kullaniciId, kullaniciAd }) {
  if (!faturaId) throw new Error('faturaId zorunlu');
  const faturaRef = doc(db, 'tedarikciFaturalari', faturaId);

  const dosyaPath = await runTransaction(db, async (txn) => {
    const fSnap = await txn.get(faturaRef);
    if (!fSnap.exists()) throw new Error('Fatura bulunamadı');
    const fatura = fSnap.data();
    const kalemler = fatura.kalemler || [];

    const supplierRef = doc(db, 'suppliers', fatura.tedarikciId);
    const supplierSnap = await txn.get(supplierRef);

    // Aynı ürün/malzemeye birden çok satır olabilir → ref bazında topla
    const byRef = new Map();
    for (const k of kalemler) {
      // Stok dışı kalemler stoğa hiç dokunmadı → geri alınacak bir şey yok
      if (k.tip !== 'ingredient' && k.tip !== 'product') continue;
      const stokArtis =
        k.tip === 'ingredient' ? toBaseQty(Number(k.miktar), k.birim, k.anaBirim) : Number(k.miktar);
      const key = `${k.tip}:${k.refId}`;
      const cur = byRef.get(key) || { tip: k.tip, refId: k.refId, ad: k.ad, miktar: 0 };
      cur.miktar += Number(stokArtis) || 0;
      byRef.set(key, cur);
    }

    // READS — tüm ilgili stok dokümanları
    const reads = [];
    for (const v of byRef.values()) {
      const ref = doc(db, v.tip === 'product' ? 'products' : 'ingredients', v.refId);
      const snap = await txn.get(ref);
      reads.push({ v, ref, snap });
    }

    // WRITES — stoğu geri çıkar
    for (const { v, ref, snap } of reads) {
      if (!snap.exists()) continue;
      const oncekiStok = Number(snap.data().stok || 0);
      const yeniStok = Math.max(0, oncekiStok - v.miktar);
      txn.update(ref, { stok: yeniStok, updatedAt: serverTimestamp() });
      if (v.tip === 'product' && oncekiStok !== yeniStok) {
        txn.set(doc(collection(db, 'stockMovements')), {
          productId: v.refId,
          productAd: v.ad || snap.data().ad,
          tip: 'cikis',
          miktar: oncekiStok - yeniStok,
          oncekiStok,
          yeniStok,
          kaynak: 'sayim',
          ilgiliId: faturaId,
          kullaniciId: kullaniciId || null,
          kullaniciAd: kullaniciAd || null,
          zaman: serverTimestamp(),
          aciklama: `Fatura silindi${fatura.faturaNo ? ` (#${fatura.faturaNo})` : ''}`,
        });
      }
    }

    // Tedarikçi bakiyesini geri al
    if (supplierSnap.exists()) {
      const oncekiBakiye = Number(supplierSnap.data().bakiye || 0);
      const yeniBakiye = oncekiBakiye - Number(fatura.tutar || 0);
      txn.update(supplierRef, { bakiye: yeniBakiye, updatedAt: serverTimestamp() });
      txn.set(doc(collection(db, 'tedarikciHareketleri')), {
        tedarikciId: fatura.tedarikciId,
        tedarikciAd: fatura.tedarikciAd || '',
        tip: 'iptal',
        tutar: Number(fatura.tutar || 0),
        oncekiBakiye,
        yeniBakiye,
        faturaId,
        faturaNo: fatura.faturaNo || null,
        aciklama: 'Fatura silindi',
        kullaniciId: kullaniciId || null,
        kullaniciAd: kullaniciAd || null,
        zaman: serverTimestamp(),
        gun: gunString(),
      });
    }

    txn.delete(faturaRef);
    return fatura.dosyaPath || null;
  });

  return { dosyaPath };
}

/**
 * Tedarikçiye ÖDEME — bakiyeyi (borcu) `tutar` kadar AZALTIR ve o günün
 * FİNANS defterine 'gider' olarak yazar (nakit çıkışı). Fatura anında değil,
 * ödeme anında gider olur → çift sayım olmaz.
 */
export async function tedarikciOdeme({
  tedarikciId,
  tedarikciAd,
  tutar,
  odemeYontemi = 'nakit',
  aciklama = '',
  kullaniciId,
  kullaniciAd,
}) {
  if (!tedarikciId) throw new Error('tedarikciId zorunlu');
  const t = Number(tutar);
  if (!(t > 0)) throw new Error('Geçerli bir tutar girin');
  const supplierRef = doc(db, 'suppliers', tedarikciId);

  return runTransaction(db, async (txn) => {
    const snap = await txn.get(supplierRef);
    if (!snap.exists()) throw new Error('Tedarikçi bulunamadı');
    const ad = tedarikciAd || snap.data().ad || '';
    const oncekiBakiye = Number(snap.data().bakiye || 0);
    const yeniBakiye = oncekiBakiye - t;
    const gun = gunString();
    const giderRef = doc(collection(db, 'transactions'));

    txn.update(supplierRef, { bakiye: yeniBakiye, updatedAt: serverTimestamp() });
    txn.set(doc(collection(db, 'tedarikciHareketleri')), {
      tedarikciId,
      tedarikciAd: ad,
      tip: 'odeme',
      tutar: t,
      oncekiBakiye,
      yeniBakiye,
      aciklama: aciklama || null,
      giderId: giderRef.id,
      kullaniciId: kullaniciId || null,
      kullaniciAd: kullaniciAd || null,
      zaman: serverTimestamp(),
      gun,
    });

    // Ödeme = o günün GİDERİ (Finans defteri / ciro neti)
    txn.set(giderRef, {
      tarih: gun,
      tip: 'gider',
      kategori: 'Tedarik / Market',
      miktar: t,
      aciklama: `Tedarikçi ödeme: ${ad}${aciklama ? ` — ${aciklama}` : ''}`,
      odemeYontemi: odemeYontemi || 'nakit',
      belgeNo: null,
      kaynak: 'tedarikci-odeme',
      tedarikciId,
      kullaniciId: kullaniciId || null,
      kullaniciAd: kullaniciAd || null,
      createdAt: serverTimestamp(),
    });

    return { yeniBakiye, giderId: giderRef.id };
  });
}
