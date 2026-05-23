import {
  runTransaction,
  doc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

function isoFromDateAndTime(tarih, saat) {
  // tarih: "2026-05-23", saat: "20:30" → ISO string in local timezone
  return new Date(`${tarih}T${saat}:00`).toISOString();
}

export async function createReservation({
  masaId,
  masaAd,
  musteriAd,
  musteriTel,
  tarih,
  saat,
  kisiSayisi,
  notlar,
  olusturanId,
  olusturanAd,
}) {
  if (!masaId) throw new Error('masaId zorunlu');

  const resvRef = doc(collection(db, 'reservations'));
  const tableRef = doc(db, 'tables', masaId);

  return runTransaction(db, async (txn) => {
    const tableSnap = await txn.get(tableRef);
    if (!tableSnap.exists()) throw new Error('Masa bulunamadı');
    const tableData = tableSnap.data();
    if (tableData.durum !== 'bos') {
      throw new Error(`Masa boş değil (${tableData.durum}), rezerve edilemez`);
    }

    const zamanISO = isoFromDateAndTime(tarih, saat);

    txn.set(resvRef, {
      masaId,
      masaAd: masaAd || tableData.ad,
      musteriAd,
      musteriTel,
      tarih,
      saat,
      zamanISO,
      kisiSayisi,
      notlar: notlar || null,
      durum: 'aktif', // aktif | iptal | tamamlandi
      olusturanId: olusturanId || null,
      olusturanAd: olusturanAd || null,
      createdAt: serverTimestamp(),
    });

    txn.update(tableRef, {
      durum: 'rezerve',
      rezervasyonNotu: `${musteriAd} · ${saat}`,
    });

    return { reservationId: resvRef.id };
  });
}

export async function cancelReservation({ reservationId }) {
  const resvRef = doc(db, 'reservations', reservationId);

  return runTransaction(db, async (txn) => {
    const resvSnap = await txn.get(resvRef);
    if (!resvSnap.exists()) throw new Error('Rezervasyon bulunamadı');
    const resv = resvSnap.data();
    if (resv.durum !== 'aktif') return { reservationId };

    const tableRef = doc(db, 'tables', resv.masaId);
    const tableSnap = await txn.get(tableRef);

    txn.update(resvRef, {
      durum: 'iptal',
      iptalZamani: serverTimestamp(),
    });

    if (tableSnap.exists() && tableSnap.data().durum === 'rezerve') {
      txn.update(tableRef, {
        durum: 'bos',
        rezervasyonNotu: null,
      });
    }
    return { reservationId };
  });
}

export async function completeReservation({ reservationId }) {
  const resvRef = doc(db, 'reservations', reservationId);
  return runTransaction(db, async (txn) => {
    const resvSnap = await txn.get(resvRef);
    if (!resvSnap.exists()) throw new Error('Rezervasyon bulunamadı');
    txn.update(resvRef, {
      durum: 'tamamlandi',
      tamamlanmaZamani: serverTimestamp(),
    });
    return { reservationId };
  });
}
