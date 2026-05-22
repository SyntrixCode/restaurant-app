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

export async function recordPayment({
  orderId,
  kasiyerId,
  kasiyerAd,
  payments,
  fisBasildi = true,
  finalize = true,
}) {
  if (!orderId) throw new Error('orderId zorunlu');
  if (!payments || payments.length === 0) throw new Error('En az 1 ödeme satırı gerekli');

  const orderRef = doc(db, 'orders', orderId);

  return runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') {
      throw new Error('Bu sipariş zaten ödendi');
    }

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.tutar || 0), 0);
    if (totalPaid + 0.005 < order.toplam) {
      throw new Error(
        `Eksik ödeme: ${totalPaid.toFixed(2)} TL ödendi, gereken ${order.toplam.toFixed(2)} TL`,
      );
    }

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

    if (finalize) {
      txn.update(orderRef, {
        durum: 'tamamlandi',
        tamamlandiZamani: serverTimestamp(),
      });

      const archiveRef = doc(db, 'archivedOrders', orderId);
      txn.set(archiveRef, {
        ...order,
        durum: 'tamamlandi',
        tamamlandiZamani: serverTimestamp(),
        arsivZamani: serverTimestamp(),
        gun,
        odemeYontemleri: payments.map((p) => p.yontem),
      });

      if (order.masaId) {
        const tableRef = doc(db, 'tables', order.masaId);
        txn.update(tableRef, { durum: 'bos' });
      }
    }

    return { paymentIds, totalPaid, change: totalPaid - order.toplam };
  });
}
