import {
  runTransaction,
  doc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

export async function createTableGroup({ memberTables, mainTableId }) {
  if (!memberTables || memberTables.length < 2) {
    throw new Error('Birleştirmek için en az 2 masa seçin');
  }
  const main = memberTables.find((t) => t.id === mainTableId) || memberTables[0];
  const memberIds = memberTables.map((t) => t.id);
  const totalKapasite = memberTables.reduce((s, t) => s + (t.kapasite || 0), 0);

  return runTransaction(db, async (txn) => {
    const tableRefs = memberTables.map((t) => doc(db, 'tables', t.id));
    const snaps = await Promise.all(tableRefs.map((r) => txn.get(r)));

    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      if (!s.exists()) throw new Error(`Masa bulunamadı: ${memberTables[i].ad}`);
      const data = s.data();
      if (data.grupId) throw new Error(`${data.ad} zaten bir grupta`);
      if (data.durum !== 'bos') throw new Error(`${data.ad} boş değil, birleştirilemez`);
    }

    const groupRef = doc(collection(db, 'tableGroups'));
    txn.set(groupRef, {
      memberIds,
      mainTableId: main.id,
      mainTableAd: main.ad,
      kapasite: totalKapasite,
      memberAdlari: memberTables.map((t) => t.ad),
      createdAt: serverTimestamp(),
    });

    for (const ref of tableRefs) {
      txn.update(ref, { grupId: groupRef.id });
    }

    return { groupId: groupRef.id, mainTableId: main.id, kapasite: totalKapasite };
  });
}

export async function dissolveTableGroup({ groupId }) {
  const groupRef = doc(db, 'tableGroups', groupId);

  return runTransaction(db, async (txn) => {
    const groupSnap = await txn.get(groupRef);
    if (!groupSnap.exists()) throw new Error('Grup bulunamadı');
    const group = groupSnap.data();
    const memberIds = group.memberIds || [];

    const tableRefs = memberIds.map((id) => doc(db, 'tables', id));
    const tableSnaps = await Promise.all(tableRefs.map((r) => txn.get(r)));

    const mainTableId = group.mainTableId;
    for (let i = 0; i < tableSnaps.length; i++) {
      const s = tableSnaps[i];
      if (!s.exists()) continue;
      const data = s.data();
      if (s.id === mainTableId && data.durum === 'dolu') {
        throw new Error('Ana masada aktif sipariş var, önce ödemeyi al');
      }
    }

    for (const ref of tableRefs) {
      txn.update(ref, { grupId: null });
    }
    txn.delete(groupRef);

    return { groupId };
  });
}
