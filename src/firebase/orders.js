import {
  runTransaction,
  doc,
  collection,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';

export async function createOrder({
  masaId,
  masaAd,
  kisiSayisi,
  garsonId,
  garsonAd,
  items,
  paketMi = false,
  paketKaynak = null,
  musteriAd = null,
  musteriTel = null,
  musteriAdres = null,
}) {
  if (!paketMi && (!kisiSayisi || kisiSayisi < 1)) {
    throw new Error('Kişi sayısı zorunlu');
  }
  if (!items || items.length === 0) throw new Error('Sipariş boş olamaz');

  const orderRef = doc(collection(db, 'orders'));
  const tableRef = masaId ? doc(db, 'tables', masaId) : null;

  return runTransaction(db, async (txn) => {
    const productSnapshots = await Promise.all(
      items.map((it) => txn.get(doc(db, 'products', it.productId))),
    );

    // Reçete kontrolü: ürünlerin reçetesi varsa malzeme stoğunu da hesapla
    const recipeSnapshots = await Promise.all(
      items.map((it) => txn.get(doc(db, 'recipes', it.productId))),
    );
    const ingredientIds = new Set();
    recipeSnapshots.forEach((rs) => {
      if (rs.exists()) {
        (rs.data().items || []).forEach((r) => r.ingredientId && ingredientIds.add(r.ingredientId));
      }
    });
    const ingredientRefs = [...ingredientIds].map((id) => doc(db, 'ingredients', id));
    const ingredientSnapshots = await Promise.all(ingredientRefs.map((r) => txn.get(r)));
    const ingredientById = {};
    ingredientSnapshots.forEach((s, idx) => {
      if (s.exists()) ingredientById[ingredientRefs[idx].id] = { ref: s.ref, data: s.data() };
    });

    // Reçeteden gerekli toplam malzeme miktarlarını topla
    const ingredientDeductions = {}; // { ingredientId: toplamMiktar }
    items.forEach((it, idx) => {
      const rs = recipeSnapshots[idx];
      if (!rs.exists()) return;
      (rs.data().items || []).forEach((r) => {
        const total = (r.miktar || 0) * (it.adet || 0);
        ingredientDeductions[r.ingredientId] = (ingredientDeductions[r.ingredientId] || 0) + total;
      });
    });

    // Malzeme stok yeterli mi
    for (const [id, total] of Object.entries(ingredientDeductions)) {
      const info = ingredientById[id];
      if (!info) continue; // silinmiş malzeme — sessizce geç
      const stok = Number(info.data.stok || 0);
      if (stok < total) {
        throw new Error(`Malzeme yetersiz: ${info.data.ad} (gereken ${total}, mevcut ${stok})`);
      }
    }

    const stockUpdates = [];
    const enrichedItems = items.map((it, idx) => {
      const snap = productSnapshots[idx];
      if (!snap.exists()) throw new Error(`Ürün bulunamadı: ${it.productId}`);
      const data = snap.data();
      if (!data.aktif) throw new Error(`Ürün pasif: ${data.ad}`);
      // Stok takibi: undefined → eski davranış (true). Açıkça false ise kontrol+güncelleme atlanır.
      const stokTakipli = data.stokTakipli !== false;
      if (stokTakipli) {
        if (data.stok < it.adet)
          throw new Error(`Yetersiz stok: ${data.ad} (mevcut: ${data.stok})`);
        stockUpdates.push({
          ref: snap.ref,
          productId: snap.id,
          productAd: data.ad,
          oncekiStok: data.stok,
          yeniStok: data.stok - it.adet,
          miktar: it.adet,
        });
      }
      return {
        productId: it.productId,
        ad: data.ad,
        fiyat: data.fiyat,
        adet: it.adet,
        notlar: it.notlar || '',
        categoryId: data.categoryId || null, // yazıcı yönlendirmesi (mutfak/bar) için
        yaziciIds: Array.isArray(data.yaziciIds) ? data.yaziciIds : [], // ürün-bazlı çoklu yazıcı
        opsiyonProductIds: Array.isArray(it.opsiyonProductIds) ? it.opsiyonProductIds : [],
        eklenmeZamani: new Date(),
      };
    });

    // Opsiyondan seçilen stoklu ürünleri (örn. menü içeceği) otomatik düş
    const opsiyonDeductMap = new Map(); // productId → toplam düşülecek adet
    items.forEach((it) => {
      (it.opsiyonProductIds || []).forEach((pid) => {
        if (!pid) return;
        opsiyonDeductMap.set(pid, (opsiyonDeductMap.get(pid) || 0) + Number(it.adet || 0));
      });
    });
    if (opsiyonDeductMap.size > 0) {
      const mainIds = new Set(items.map((i) => i.productId));
      const extraIds = [...opsiyonDeductMap.keys()].filter((id) => !mainIds.has(id));
      const opsiyonSnaps = await Promise.all(
        extraIds.map((id) => txn.get(doc(db, 'products', id))),
      );
      const opsiyonSnapById = {};
      extraIds.forEach((id, idx) => {
        opsiyonSnapById[id] = opsiyonSnaps[idx];
      });
      opsiyonDeductMap.forEach((adet, pid) => {
        if (mainIds.has(pid)) {
          // Aynı ürün hem ana item hem opsiyon olarak — mevcut stockUpdate'e ekle
          const upd = stockUpdates.find((u) => u.productId === pid);
          if (upd) {
            const yeniMiktar = upd.miktar + adet;
            if (upd.oncekiStok < yeniMiktar) {
              throw new Error(`Yetersiz stok: ${upd.productAd} (gereken ${yeniMiktar}, mevcut ${upd.oncekiStok})`);
            }
            upd.miktar = yeniMiktar;
            upd.yeniStok = upd.oncekiStok - yeniMiktar;
          }
          // Stoksuz ürünse (stockUpdates'te yok) sessizce geç
        } else {
          const snap = opsiyonSnapById[pid];
          if (!snap || !snap.exists()) return; // ürün silinmiş, atla
          const data = snap.data();
          if (data.stokTakipli === false) return;
          const oncekiStok = Number(data.stok || 0);
          if (oncekiStok < adet) {
            throw new Error(`Yetersiz stok (opsiyon): ${data.ad} (gereken ${adet}, mevcut ${oncekiStok})`);
          }
          stockUpdates.push({
            ref: snap.ref,
            productId: snap.id,
            productAd: data.ad,
            oncekiStok,
            yeniStok: oncekiStok - adet,
            miktar: adet,
          });
        }
      });
    }

    let tableData = null;
    if (tableRef) {
      const tableSnap = await txn.get(tableRef);
      if (!tableSnap.exists()) throw new Error('Masa bulunamadı');
      tableData = tableSnap.data();
    }

    const araToplam = enrichedItems.reduce((sum, it) => sum + it.fiyat * it.adet, 0);

    txn.set(orderRef, {
      masaId: masaId || null,
      masaAd: masaAd || tableData?.ad || null,
      kisiSayisi: kisiSayisi || null,
      garsonId,
      garsonAd,
      durum: 'aktif',
      items: enrichedItems,
      araToplam,
      indirim: 0,
      kuponKodu: null,
      kampanyaId: null,
      toplam: araToplam,
      paketMi,
      paketKaynak,
      musteriAd,
      musteriTel,
      musteriAdres,
      olusturmaZamani: serverTimestamp(),
      hazirlandiZamani: null,
      masayaGittiZamani: null,
      tamamlandiZamani: null,
      gecikmeli: false,
    });

    for (const upd of stockUpdates) {
      txn.update(upd.ref, { stok: upd.yeniStok, updatedAt: serverTimestamp() });
      const movRef = doc(collection(db, 'stockMovements'));
      txn.set(movRef, {
        productId: upd.productId,
        productAd: upd.productAd,
        tip: 'cikis',
        miktar: upd.miktar,
        oncekiStok: upd.oncekiStok,
        yeniStok: upd.yeniStok,
        kaynak: 'siparis',
        ilgiliId: orderRef.id,
        kullaniciId: garsonId,
        zaman: serverTimestamp(),
        aciklama: `Sipariş #${orderRef.id.slice(0, 6)}`,
      });
    }

    // Reçeteli ürünler için malzeme stok düşümü
    for (const [id, total] of Object.entries(ingredientDeductions)) {
      const info = ingredientById[id];
      if (!info) continue;
      const oncekiStok = Number(info.data.stok || 0);
      const yeniStok = oncekiStok - total;
      txn.update(info.ref, { stok: yeniStok, updatedAt: serverTimestamp() });
    }

    if (tableRef) {
      txn.update(tableRef, { durum: 'dolu' });
    }

    return { orderId: orderRef.id, araToplam };
  });
}

export async function addItemsToOrder({ orderId, garsonId, newItems }) {
  if (!newItems || newItems.length === 0) throw new Error('Eklenecek ürün yok');

  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (!['aktif', 'hazirlandi'].includes(order.durum)) {
      throw new Error(`Sipariş tamamlanmış (${order.durum}), ekleme yapılamaz`);
    }

    const productSnapshots = await Promise.all(
      newItems.map((it) => txn.get(doc(db, 'products', it.productId))),
    );

    const stockUpdates = [];
    const enrichedNew = newItems.map((it, idx) => {
      const snap = productSnapshots[idx];
      if (!snap.exists()) throw new Error(`Ürün bulunamadı: ${it.productId}`);
      const data = snap.data();
      if (data.stok < it.adet)
        throw new Error(`Yetersiz stok: ${data.ad}`);
      stockUpdates.push({
        ref: snap.ref,
        productId: snap.id,
        productAd: data.ad,
        oncekiStok: data.stok,
        yeniStok: data.stok - it.adet,
        miktar: it.adet,
      });
      return {
        productId: it.productId,
        ad: data.ad,
        fiyat: data.fiyat,
        adet: it.adet,
        notlar: it.notlar || '',
        categoryId: data.categoryId || null,
        yaziciIds: Array.isArray(data.yaziciIds) ? data.yaziciIds : [], // ürün-bazlı çoklu yazıcı
        opsiyonProductIds: Array.isArray(it.opsiyonProductIds) ? it.opsiyonProductIds : [],
        eklenmeZamani: new Date(),
      };
    });

    // Opsiyondan seçilen stoklu ürünleri (örn. menü içeceği) otomatik düş
    const opsiyonDeductMap = new Map();
    newItems.forEach((it) => {
      (it.opsiyonProductIds || []).forEach((pid) => {
        if (!pid) return;
        opsiyonDeductMap.set(pid, (opsiyonDeductMap.get(pid) || 0) + Number(it.adet || 0));
      });
    });
    if (opsiyonDeductMap.size > 0) {
      const mainIds = new Set(newItems.map((i) => i.productId));
      const extraIds = [...opsiyonDeductMap.keys()].filter((id) => !mainIds.has(id));
      const opsiyonSnaps = await Promise.all(
        extraIds.map((id) => txn.get(doc(db, 'products', id))),
      );
      const opsiyonSnapById = {};
      extraIds.forEach((id, idx) => {
        opsiyonSnapById[id] = opsiyonSnaps[idx];
      });
      opsiyonDeductMap.forEach((adet, pid) => {
        if (mainIds.has(pid)) {
          const upd = stockUpdates.find((u) => u.productId === pid);
          if (upd) {
            const yeniMiktar = upd.miktar + adet;
            if (upd.oncekiStok < yeniMiktar) {
              throw new Error(`Yetersiz stok: ${upd.productAd} (gereken ${yeniMiktar}, mevcut ${upd.oncekiStok})`);
            }
            upd.miktar = yeniMiktar;
            upd.yeniStok = upd.oncekiStok - yeniMiktar;
          }
        } else {
          const snap = opsiyonSnapById[pid];
          if (!snap || !snap.exists()) return;
          const data = snap.data();
          if (data.stokTakipli === false) return;
          const oncekiStok = Number(data.stok || 0);
          if (oncekiStok < adet) {
            throw new Error(`Yetersiz stok (opsiyon): ${data.ad} (gereken ${adet}, mevcut ${oncekiStok})`);
          }
          stockUpdates.push({
            ref: snap.ref,
            productId: snap.id,
            productAd: data.ad,
            oncekiStok,
            yeniStok: oncekiStok - adet,
            miktar: adet,
          });
        }
      });
    }

    const allItems = [...order.items, ...enrichedNew];
    const araToplam = allItems.reduce((sum, it) => sum + it.fiyat * it.adet, 0);
    const toplam = araToplam - (order.indirim || 0);

    txn.update(orderRef, {
      items: allItems,
      araToplam,
      toplam,
    });

    for (const upd of stockUpdates) {
      txn.update(upd.ref, { stok: upd.yeniStok, updatedAt: serverTimestamp() });
      const movRef = doc(collection(db, 'stockMovements'));
      txn.set(movRef, {
        productId: upd.productId,
        productAd: upd.productAd,
        tip: 'cikis',
        miktar: upd.miktar,
        oncekiStok: upd.oncekiStok,
        yeniStok: upd.yeniStok,
        kaynak: 'siparis',
        ilgiliId: orderId,
        kullaniciId: garsonId,
        zaman: serverTimestamp(),
        aciklama: `Sipariş #${orderId.slice(0, 6)} (ekleme)`,
      });
    }

    return { orderId, added: enrichedNew.length };
  });
}

/**
 * Sayım sessiyonunu kapatır. Her bir ürün için fiziksel stok ile sistem stoğu
 * arasındaki farkı products.stok'a uygular + stockMovements'a "sayim" kaynaklı
 * audit kaydı yazar. Tek transaction içinde.
 */
export async function finalizeInventoryCount({ countId, items, kullaniciId, kullaniciAd }) {
  if (!countId) throw new Error('countId zorunlu');
  if (!items || items.length === 0) throw new Error('Sayım kayıtları boş');

  const countRef = doc(db, 'inventoryCounts', countId);

  return runTransaction(db, async (txn) => {
    const countSnap = await txn.get(countRef);
    if (!countSnap.exists()) throw new Error('Sayım bulunamadı');
    if (countSnap.data().durum !== 'aktif') {
      throw new Error('Sayım zaten kapatılmış');
    }

    // Tüm ürünleri tek tek oku (write'lardan önce)
    const productData = {};
    for (const it of items) {
      if (it.fizikselStok == null) continue; // doldurulmamış satırı atla
      const ref = doc(db, 'products', it.productId);
      const snap = await txn.get(ref);
      if (!snap.exists()) continue;
      productData[it.productId] = { ref, data: snap.data() };
    }

    // Writes
    const dusumler = []; // audit için
    for (const it of items) {
      if (it.fizikselStok == null) continue;
      const info = productData[it.productId];
      if (!info) continue;
      const oncekiStok = Number(info.data.stok || 0);
      const yeniStok = Number(it.fizikselStok);
      const fark = yeniStok - oncekiStok;
      if (fark === 0) continue; // değişiklik yok

      txn.update(info.ref, { stok: yeniStok, updatedAt: serverTimestamp() });
      const movRef = doc(collection(db, 'stockMovements'));
      txn.set(movRef, {
        productId: it.productId,
        productAd: info.data.ad,
        tip: fark > 0 ? 'giris' : 'cikis',
        miktar: Math.abs(fark),
        oncekiStok,
        yeniStok,
        kaynak: 'sayim',
        ilgiliId: countId,
        kullaniciId: kullaniciId || null,
        kullaniciAd: kullaniciAd || null,
        zaman: serverTimestamp(),
        aciklama: `Sayım düzeltmesi #${countId.slice(0, 6)}`,
      });
      dusumler.push({ productId: it.productId, fark });
    }

    txn.update(countRef, {
      durum: 'tamamlandi',
      bitisZamani: serverTimestamp(),
      kapatanId: kullaniciId || null,
      kapatanAd: kullaniciAd || null,
      duzeltilenSayisi: dusumler.length,
    });

    return { countId, duzeltilenSayisi: dusumler.length };
  });
}

/**
 * Manuel stok hareketi: giriş veya çıkış. Ürün stoğunu atomik günceller +
 * stockMovements koleksiyonuna audit kaydı yazar.
 */
export async function recordManualStockMovement({
  productId,
  tip, // 'giris' | 'cikis'
  miktar,
  kaynak, // 'manuel' | 'fire' | 'tedarik' | 'iade' | 'sayim'
  tedarikciId,
  tedarikciAd,
  aciklama,
  kullaniciId,
  kullaniciAd,
}) {
  if (!productId) throw new Error('Ürün seçin');
  if (!miktar || miktar <= 0) throw new Error('Geçerli miktar girin');

  const productRef = doc(db, 'products', productId);

  return runTransaction(db, async (txn) => {
    const productSnap = await txn.get(productRef);
    if (!productSnap.exists()) throw new Error('Ürün bulunamadı');
    const product = productSnap.data();
    const oncekiStok = Number(product.stok || 0);
    const delta = tip === 'cikis' ? -miktar : miktar;
    const yeniStok = oncekiStok + delta;

    if (yeniStok < 0) {
      throw new Error(`Çıkış miktarı stoktan fazla: stok ${oncekiStok}, çıkış ${miktar}`);
    }

    txn.update(productRef, { stok: yeniStok, updatedAt: serverTimestamp() });

    const movRef = doc(collection(db, 'stockMovements'));
    txn.set(movRef, {
      productId,
      productAd: product.ad,
      tip,
      miktar,
      oncekiStok,
      yeniStok,
      kaynak: kaynak || 'manuel',
      tedarikciId: tedarikciId || null,
      tedarikciAd: tedarikciAd || null,
      ilgiliId: null,
      kullaniciId: kullaniciId || null,
      kullaniciAd: kullaniciAd || null,
      zaman: serverTimestamp(),
      aciklama: aciklama || '',
    });

    return { productId, oncekiStok, yeniStok, movementId: movRef.id };
  });
}

/**
 * Mevcut bir siparişin items array'ini günceller (düzenleme).
 * Yeni adet/silme değişikliklerine göre stok geri yüklenir.
 * araToplam yeniden hesaplanır.
 *
 * @param {{ orderId: string, newItems: Array<{productId, ad, fiyat, adet, notlar?}>, originalItems: Array, kullaniciId, kullaniciAd }} opts
 */
export async function updateOrderItems({ orderId, newItems, originalItems, kullaniciId, kullaniciAd }) {
  if (!orderId) throw new Error('orderId gerekli');
  if (!Array.isArray(newItems)) throw new Error('newItems dizi olmalı');

  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    // === READS ===
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') throw new Error('Tamamlanmış sipariş düzenlenemez');
    if (order.durum === 'iptal') throw new Error('İptal edilmiş sipariş düzenlenemez');

    // Stok değişiklik hesabı: orijinal adet - yeni adet → fark
    // Pozitifse stok geri verilir (silindi/azaldı), negatifse eklenir (arttı, stok düşer)
    // productId'ye göre net fark
    const stockDelta = {};
    const itemMap = {};
    (originalItems || []).forEach((it, idx) => {
      stockDelta[it.productId] = (stockDelta[it.productId] || 0) + Number(it.adet || 0);
      itemMap[`orig-${idx}`] = it;
    });
    newItems.forEach((it) => {
      stockDelta[it.productId] = (stockDelta[it.productId] || 0) - Number(it.adet || 0);
    });

    // Etkilenen ürünleri oku
    const productIds = Object.keys(stockDelta).filter((pid) => stockDelta[pid] !== 0);
    const productRefs = productIds.map((pid) => doc(db, 'products', pid));
    const productSnaps = await Promise.all(productRefs.map((r) => txn.get(r)));

    // Stok yeterlilik kontrolü (delta negatifse = stok düşecek)
    // Stok takipsiz (stokTakipli=false) ürünler için kontrol/güncelleme atlanır
    for (let i = 0; i < productIds.length; i++) {
      const snap = productSnaps[i];
      if (!snap.exists()) continue;
      const data = snap.data();
      if (data.stokTakipli === false) continue;
      const delta = stockDelta[productIds[i]];
      if (delta < 0) {
        const stok = Number(data.stok || 0);
        const required = -delta;
        if (stok < required) {
          throw new Error(`Yetersiz stok: ${data.ad} (gereken ${required}, mevcut ${stok})`);
        }
      }
    }

    // === WRITES ===
    // Yeni araToplam
    const yeniAraToplam = newItems.reduce(
      (sum, it) => sum + Number(it.fiyat || 0) * Number(it.adet || 0),
      0,
    );

    txn.update(orderRef, {
      items: newItems,
      araToplam: yeniAraToplam,
      toplam: yeniAraToplam, // indirim varsa Payment ekranında yeniden hesaplanır
      sonGuncelleme: serverTimestamp(),
      sonGuncelleyenId: kullaniciId || null,
      sonGuncelleyenAd: kullaniciAd || null,
    });

    // Stok güncelle (takipsiz ürünler atlanır)
    for (let i = 0; i < productIds.length; i++) {
      const snap = productSnaps[i];
      if (!snap.exists()) continue;
      const data = snap.data();
      if (data.stokTakipli === false) continue;
      const delta = stockDelta[productIds[i]];
      if (delta === 0) continue;
      const stok = Number(data.stok || 0);
      txn.update(snap.ref, { stok: stok + delta });
    }

    return { ok: true, yeniAraToplam };
  });
}

export async function updateOrderStatus(orderId, newStatus) {
  const orderRef = doc(db, 'orders', orderId);
  const timestampField = {
    hazirlandi: 'hazirlandiZamani',
    masayaGitti: 'masayaGittiZamani',
    tamamlandi: 'tamamlandiZamani',
  }[newStatus];
  const patch = { durum: newStatus };
  if (timestampField) patch[timestampField] = serverTimestamp();
  await updateDoc(orderRef, patch);
}

/**
 * Aktif (ödenmemiş) bir siparişi iptal eder.
 * - Order durumu 'iptal' olur
 * - Ürün stokları geri yüklenir
 * - Masa boşaltılır
 * - archivedOrders'a iptal damgalı kopyalanır (raporlama için)
 *
 * @param {{ orderId:string, sebep:string, kullaniciId:string, kullaniciAd:string }} opts
 */
export async function cancelActiveOrder({ orderId, sebep, kullaniciId, kullaniciAd }) {
  if (!orderId) throw new Error('orderId gerekli');
  if (!sebep || !sebep.trim()) throw new Error('İptal sebebi zorunlu');

  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    // === READS ===
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') {
      throw new Error('Tamamlanmış sipariş iptal edilemez (Arşivden iptal et)');
    }
    if (order.durum === 'iptal') {
      throw new Error('Bu sipariş zaten iptal edilmiş');
    }

    // Stoğu geri yüklemek için ürünleri oku
    const productRefs = (order.items || []).map((it) => doc(db, 'products', it.productId));
    const productSnaps = await Promise.all(productRefs.map((r) => txn.get(r)));

    // Masa kontrolü
    const tableRef = order.masaId ? doc(db, 'tables', order.masaId) : null;

    // === WRITES ===
    const iptal = {
      edildi: true,
      sebep: sebep.trim(),
      edenId: kullaniciId || null,
      edenAd: kullaniciAd || 'Bilinmiyor',
      zaman: serverTimestamp(),
    };

    // Order: durum = iptal + iptal damgası
    txn.update(orderRef, {
      durum: 'iptal',
      iptal,
      iptalZamani: serverTimestamp(),
    });

    // Ürün stoklarını geri yükle (sadece stok takipli ürünler için)
    productSnaps.forEach((snap, idx) => {
      if (!snap.exists()) return; // silinmiş ürün, atla
      const data = snap.data();
      if (data.stokTakipli === false) return; // takipsiz ürün
      const item = order.items[idx];
      const oncekiStok = Number(data.stok || 0);
      const yeniStok = oncekiStok + Number(item.adet || 0);
      txn.update(snap.ref, { stok: yeniStok });
    });

    // Masayı boşalt
    if (tableRef) {
      txn.update(tableRef, { durum: 'bos' });
    }

    // Arşive iptal damgalı kopya — raporlamada görünsün
    const gun = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const archiveRef = doc(db, 'archivedOrders', orderId);
    txn.set(archiveRef, {
      ...order,
      durum: 'iptal',
      iptal,
      arsivZamani: serverTimestamp(),
      tamamlandiZamani: serverTimestamp(),
      gun,
      odemeYontemleri: [],
    });

    return { ok: true };
  });
}

/**
 * Aktif bir siparişi bir masadan başka BOŞ masaya taşır/aktarır.
 * - Sipariş.masaId ve masaAd hedef masaya güncellenir (tüm sipariş bilgisi taşınır)
 * - Kaynak masa 'bos', hedef masa 'dolu' olur
 * - Birleşik (gruplu) masalar desteklenmez — önce grup çözülmeli
 *
 * @param {{ orderId:string, sourceTableId:string, targetTableId:string, kullaniciId?:string, kullaniciAd?:string }}
 */
export async function transferOrder({ orderId, sourceTableId, targetTableId, kullaniciId, kullaniciAd }) {
  if (!orderId || !sourceTableId || !targetTableId) {
    throw new Error('orderId, kaynak ve hedef masa zorunlu');
  }
  if (sourceTableId === targetTableId) {
    throw new Error('Aynı masaya taşıma yapılamaz');
  }

  const orderRef = doc(db, 'orders', orderId);
  const sourceRef = doc(db, 'tables', sourceTableId);
  const targetRef = doc(db, 'tables', targetTableId);

  return runTransaction(db, async (txn) => {
    // === READS ===
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (!['aktif', 'hazirlandi', 'masayaGitti'].includes(order.durum)) {
      throw new Error('Sadece aktif sipariş taşınabilir');
    }

    const targetSnap = await txn.get(targetRef);
    if (!targetSnap.exists()) throw new Error('Hedef masa bulunamadı');
    const target = targetSnap.data();
    if (target.grupId) throw new Error('Hedef masa birleşik bir grubun üyesi');
    if ((target.durum || 'bos') !== 'bos') throw new Error('Hedef masa boş değil');

    const sourceSnap = await txn.get(sourceRef);
    if (sourceSnap.exists() && sourceSnap.data().grupId) {
      throw new Error('Birleşik masa taşınamaz, önce grubu çözün');
    }

    // === WRITES ===
    // Sipariş hedef masaya bağlanır
    txn.update(orderRef, {
      masaId: targetTableId,
      masaAd: target.ad,
      tasimaZamani: serverTimestamp(),
      tasiyanId: kullaniciId || null,
      tasiyanAd: kullaniciAd || null,
    });
    // Kaynak masa boşalır, hedef masa dolar
    if (sourceSnap.exists()) txn.update(sourceRef, { durum: 'bos' });
    txn.update(targetRef, { durum: 'dolu' });

    return { ok: true };
  });
}

/**
 * Arşivlenmiş (ödenmiş) bir siparişi iptal eder. Veri silinmez,
 * iptal damgası bırakılır. Raporlama bu damgaya bakıp toplamlardan
 * düşer.
 *
 * @param {{ archivedId: string, sebep: string, kullaniciId: string, kullaniciAd: string }} opts
 */
export async function cancelArchivedOrder({ archivedId, sebep, kullaniciId, kullaniciAd }) {
  if (!archivedId) throw new Error('archivedId gerekli');
  if (!sebep || !sebep.trim()) throw new Error('İptal sebebi zorunlu');
  const ref = doc(db, 'archivedOrders', archivedId);
  await updateDoc(ref, {
    iptal: {
      edildi: true,
      sebep: sebep.trim(),
      edenId: kullaniciId || null,
      edenAd: kullaniciAd || 'Bilinmiyor',
      zaman: serverTimestamp(),
    },
  });
}

/**
 * İptal kararını geri al (yanlışlıkla iptal edilmişse).
 */
export async function uncancelArchivedOrder(archivedId) {
  if (!archivedId) throw new Error('archivedId gerekli');
  const ref = doc(db, 'archivedOrders', archivedId);
  await updateDoc(ref, { iptal: null });
}
