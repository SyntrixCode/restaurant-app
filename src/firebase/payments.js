import {
  runTransaction,
  doc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

function gunString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Ödemeyi kaydeder. Opsiyonel discount uygulanır (kümülatif değil — en büyük 1 indirim).
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.kasiyerId
 * @param {string} params.kasiyerAd
 * @param {Array} params.payments - [{ yontem, tutar, kartTipi }]
 * @param {boolean} params.fisBasildi
 * @param {boolean} params.finalize
 * @param {Object|null} params.discount - { type:'kampanya'|'kupon', kampanyaId?, kampanyaAd?, kuponId?, kuponKod?, amount }
 */
export async function recordPayment({
  orderId,
  kasiyerId,
  kasiyerAd,
  payments,
  fisBasildi = true,
  finalize = true,
  discount = null,
}) {
  if (!orderId) throw new Error('orderId zorunlu');
  if (!payments || payments.length === 0) throw new Error('En az 1 ödeme satırı gerekli');

  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    // === READS ===
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') {
      throw new Error('Bu sipariş zaten ödendi');
    }

    // İndirim hesabı: subtotal = araToplam (orijinal)
    const subtotal = Number(order.araToplam || order.toplam || 0);
    const indirimAmount = discount && discount.amount > 0 ? Number(discount.amount) : 0;
    const effectiveTotal = Math.max(0, subtotal - indirimAmount);

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.tutar || 0), 0);
    if (totalPaid + 0.005 < effectiveTotal) {
      throw new Error(
        `Eksik ödeme: ${totalPaid.toFixed(2)} TL ödendi, gereken ${effectiveTotal.toFixed(2)} TL`,
      );
    }

    // Kupon ise sayacı artırmak için oku
    let couponRef = null;
    let couponData = null;
    if (discount && discount.type === 'kupon' && discount.kuponId) {
      couponRef = doc(db, 'coupons', discount.kuponId);
      const couponSnap = await txn.get(couponRef);
      if (couponSnap.exists()) couponData = couponSnap.data();
    }

    // Grup kontrolü için masa + grup oku (write'lardan ÖNCE)
    let groupId = null;
    let groupMemberIds = null;
    if (finalize && order.masaId) {
      const tableRef = doc(db, 'tables', order.masaId);
      const tableSnap = await txn.get(tableRef);
      if (tableSnap.exists() && tableSnap.data().grupId) {
        groupId = tableSnap.data().grupId;
        const groupRef = doc(db, 'tableGroups', groupId);
        const groupSnap = await txn.get(groupRef);
        if (groupSnap.exists()) {
          groupMemberIds = groupSnap.data().memberIds || [];
        } else {
          groupId = null;
        }
      }
    }

    // === WRITES ===
    const gun = gunString();
    const paymentIds = [];

    for (const p of payments) {
      const payRef = doc(collection(db, 'payments'));
      txn.set(payRef, {
        orderId,
        masaId: order.masaId || null,
        tutar: Number(p.tutar),
        yontem: p.yontem,
        kartTipi: p.kartTipi || null,
        kasiyerId,
        kasiyerAd,
        fisBasildi,
        zaman: serverTimestamp(),
        gun,
      });
      paymentIds.push(payRef.id);
    }

    // İndirim bilgisini order doc'a yaz
    const orderPatch = {};
    if (indirimAmount > 0) {
      orderPatch.indirim = indirimAmount;
      orderPatch.toplam = effectiveTotal;
      if (discount.type === 'kampanya') {
        orderPatch.kampanyaId = discount.kampanyaId || null;
        orderPatch.kampanyaAd = discount.kampanyaAd || null;
        orderPatch.kuponKodu = null;
      } else if (discount.type === 'kupon') {
        orderPatch.kuponKodu = discount.kuponKod || null;
        orderPatch.kuponId = discount.kuponId || null;
        orderPatch.kampanyaId = null;
      }
    }

    if (finalize) {
      orderPatch.durum = 'tamamlandi';
      orderPatch.tamamlandiZamani = serverTimestamp();
    }

    if (Object.keys(orderPatch).length > 0) {
      txn.update(orderRef, orderPatch);
    }

    if (finalize) {
      const archived = {
        ...order,
        ...orderPatch,
        arsivZamani: serverTimestamp(),
        gun,
        odemeYontemleri: payments.map((p) => p.yontem),
      };
      const archiveRef = doc(db, 'archivedOrders', orderId);
      txn.set(archiveRef, archived);

      if (order.masaId) {
        const tableRef = doc(db, 'tables', order.masaId);
        txn.update(tableRef, { durum: 'bos' });
      }

      // Auto-dissolve group
      if (groupId && groupMemberIds) {
        for (const mid of groupMemberIds) {
          txn.update(doc(db, 'tables', mid), { grupId: null });
        }
        txn.delete(doc(db, 'tableGroups', groupId));
      }

      // Kupon kullanım sayacı
      if (couponRef && couponData) {
        txn.update(couponRef, {
          kullanilan: (couponData.kullanilan || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { paymentIds, totalPaid, change: totalPaid - effectiveTotal, effectiveTotal };
  });
}

/**
 * Hesabı PATRON/İKRAM olarak ÜCRETSİZ kapatır (ödeme alınmaz).
 * Tutar ciroya YAZILMAZ (toplam=0); `patronTutar` olarak izlenir → gün sonu ve
 * raporlarda "İkram/Patron" eksi (-) kalemi olarak görünür. Masa etiketlenir
 * (patronMasasi:true) → hangi masanın patron/ikram olduğu bilinir.
 *
 * @param {{ orderId, kasiyerId, kasiyerAd, sebep?:string }} params
 */
export async function closeAsPatron({ orderId, kasiyerId, kasiyerAd, sebep = 'Patron' }) {
  if (!orderId) throw new Error('orderId zorunlu');
  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') throw new Error('Bu sipariş zaten kapandı');
    const tutar = Number(order.araToplam || order.toplam || 0);

    // Grup/masa oku (write'lardan ÖNCE)
    let groupId = null;
    let groupMemberIds = null;
    if (order.masaId) {
      const tableRef = doc(db, 'tables', order.masaId);
      const tableSnap = await txn.get(tableRef);
      if (tableSnap.exists() && tableSnap.data().grupId) {
        groupId = tableSnap.data().grupId;
        const groupSnap = await txn.get(doc(db, 'tableGroups', groupId));
        if (groupSnap.exists()) groupMemberIds = groupSnap.data().memberIds || [];
        else groupId = null;
      }
    }

    const gun = gunString();
    const patch = {
      durum: 'tamamlandi',
      tamamlandiZamani: serverTimestamp(),
      toplam: 0, // ciroya yazılmaz
      indirim: tutar, // tüm tutar ikram/patron olarak düşüldü
      patronMasasi: true,
      bedelsiz: true,
      bedelsizSebep: sebep,
      patronTutar: tutar, // gün sonu/rapor "- bakiye" buradan
      kasiyerId,
      kasiyerAd,
    };
    txn.update(orderRef, patch);

    txn.set(doc(db, 'archivedOrders', orderId), {
      ...order,
      ...patch,
      arsivZamani: serverTimestamp(),
      gun,
      odemeYontemleri: ['patron'],
    });

    if (order.masaId) {
      txn.update(doc(db, 'tables', order.masaId), { durum: 'bos' });
    }
    if (groupId && groupMemberIds) {
      for (const mid of groupMemberIds) {
        txn.update(doc(db, 'tables', mid), { grupId: null });
      }
      txn.delete(doc(db, 'tableGroups', groupId));
    }

    return { tutar };
  });
}

/**
 * Tamamen ikram edilen (ödenecek tutar 0) hesabı ödemesiz kapatır.
 * Ciroya yazılmaz, bakiye/patron olarak da işlenmez — sadece ikram.
 */
export async function closeIkramOrder({ orderId, kasiyerId, kasiyerAd }) {
  if (!orderId) throw new Error('orderId zorunlu');
  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') throw new Error('Bu sipariş zaten kapandı');
    const tutar = Number(order.araToplam ?? order.toplam ?? 0);

    // Grup/masa oku (write'lardan ÖNCE)
    let groupId = null;
    let groupMemberIds = null;
    if (order.masaId) {
      const tableRef = doc(db, 'tables', order.masaId);
      const tableSnap = await txn.get(tableRef);
      if (tableSnap.exists() && tableSnap.data().grupId) {
        groupId = tableSnap.data().grupId;
        const groupSnap = await txn.get(doc(db, 'tableGroups', groupId));
        if (groupSnap.exists()) groupMemberIds = groupSnap.data().memberIds || [];
        else groupId = null;
      }
    }

    const gun = gunString();
    const patch = {
      durum: 'tamamlandi',
      tamamlandiZamani: serverTimestamp(),
      toplam: 0, // ciroya yazılmaz
      ikramMasasi: true, // tüm hesap ikram
      kasiyerId,
      kasiyerAd,
    };
    txn.update(orderRef, patch);

    txn.set(doc(db, 'archivedOrders', orderId), {
      ...order,
      ...patch,
      arsivZamani: serverTimestamp(),
      gun,
      odemeYontemleri: ['ikram'],
    });

    if (order.masaId) {
      txn.update(doc(db, 'tables', order.masaId), { durum: 'bos' });
    }
    if (groupId && groupMemberIds) {
      for (const mid of groupMemberIds) {
        txn.update(doc(db, 'tables', mid), { grupId: null });
      }
      txn.delete(doc(db, 'tableGroups', groupId));
    }

    return { tutar };
  });
}
