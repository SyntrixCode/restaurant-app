import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

function gunString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Hesabı bir CARİ hesaba (kişiye) BORÇ olarak yazıp masayı kapatır.
 * Ödeme alınmaz; tutar ciroya YAZILMAZ (toplam=0). Cari bakiyesi artar ve
 * cariHareketleri'ne 'borc' kaydı düşülür. Masa boşaltılır (grup varsa dağıtılır).
 *
 * @param {{ orderId, cariId, cariAd, kasiyerId, kasiyerAd }} params
 */
export async function closeToCari({ orderId, cariId, cariAd, kasiyerId, kasiyerAd }) {
  if (!orderId) throw new Error('orderId zorunlu');
  if (!cariId) throw new Error('Cari seçilmedi');
  const orderRef = doc(db, 'orders', orderId);
  const cariRef = doc(db, 'cari', cariId);

  return runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Sipariş bulunamadı');
    const order = orderSnap.data();
    if (order.durum === 'tamamlandi') throw new Error('Bu sipariş zaten kapandı');
    const tutar = Number(order.araToplam || order.toplam || 0);

    const cariSnap = await txn.get(cariRef);
    if (!cariSnap.exists()) throw new Error('Cari hesap bulunamadı');
    const onceki = Number(cariSnap.data().bakiye || 0);
    const yeni = onceki + tutar;

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
      toplam: 0, // ciroya yazılmaz — cariye borç
      cariMasasi: true,
      cariId,
      cariAd: cariAd || cariSnap.data().ad || '',
      cariTutar: tutar,
      kasiyerId,
      kasiyerAd,
    };
    txn.update(orderRef, patch);

    txn.set(doc(db, 'archivedOrders', orderId), {
      ...order,
      ...patch,
      arsivZamani: serverTimestamp(),
      gun,
      odemeYontemleri: ['cari'],
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

    // Cari bakiyesini artır + hareket kaydı
    txn.update(cariRef, { bakiye: yeni, updatedAt: serverTimestamp() });
    txn.set(doc(collection(db, 'cariHareketleri')), {
      cariId,
      cariAd: patch.cariAd,
      tip: 'borc',
      tutar,
      oncekiBakiye: onceki,
      yeniBakiye: yeni,
      orderId,
      masaAd: order.masaAd || null,
      kasiyerId,
      kasiyerAd,
      zaman: serverTimestamp(),
      gun,
    });

    return { tutar, yeniBakiye: yeni };
  });
}

/**
 * Cariden TAHSİLAT/düzeltme — bakiyeyi `tutar` kadar AZALTIR (borç düşer).
 * Ciroya yansımaz; sadece bakiye takibi. cariHareketleri'ne 'tahsilat' kaydı düşer.
 *
 * @param {{ cariId, cariAd, tutar, kasiyerId, kasiyerAd, aciklama? }} params
 */
export async function recordCariTahsilat({ cariId, cariAd, tutar, kasiyerId, kasiyerAd, aciklama = '' }) {
  if (!cariId) throw new Error('cariId zorunlu');
  const t = Number(tutar);
  if (!(t > 0)) throw new Error('Geçerli bir tutar girin');
  const cariRef = doc(db, 'cari', cariId);

  return runTransaction(db, async (txn) => {
    const snap = await txn.get(cariRef);
    if (!snap.exists()) throw new Error('Cari hesap bulunamadı');
    const onceki = Number(snap.data().bakiye || 0);
    const yeni = onceki - t;

    txn.update(cariRef, { bakiye: yeni, updatedAt: serverTimestamp() });
    txn.set(doc(collection(db, 'cariHareketleri')), {
      cariId,
      cariAd: cariAd || snap.data().ad || '',
      tip: 'tahsilat',
      tutar: t,
      oncekiBakiye: onceki,
      yeniBakiye: yeni,
      aciklama: aciklama || null,
      kasiyerId,
      kasiyerAd,
      zaman: serverTimestamp(),
      gun: gunString(),
    });

    return { yeniBakiye: yeni };
  });
}
