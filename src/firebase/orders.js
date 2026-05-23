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

    const stockUpdates = [];
    const enrichedItems = items.map((it, idx) => {
      const snap = productSnapshots[idx];
      if (!snap.exists()) throw new Error(`Ürün bulunamadı: ${it.productId}`);
      const data = snap.data();
      if (!data.aktif) throw new Error(`Ürün pasif: ${data.ad}`);
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
      return {
        productId: it.productId,
        ad: data.ad,
        fiyat: data.fiyat,
        adet: it.adet,
        notlar: it.notlar || '',
        eklenmeZamani: new Date(),
      };
    });

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
        eklenmeZamani: new Date(),
      };
    });

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
