import {
  runTransaction,
  doc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

export async function createTableGroup({ memberTables, mainTableId, positions = null }) {
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
      // Ana masa dolu olabilir (mevcut sipariş üstünde kalır). Eklenen masalar boş olmalı.
      if (s.id !== main.id && data.durum !== 'bos') {
        throw new Error(`${data.ad} boş değil, birleştirilemez`);
      }
      if (data.durum === 'rezerve') {
        throw new Error(`${data.ad} rezerve, birleştirilemez`);
      }
    }

    const groupRef = doc(collection(db, 'tableGroups'));
    txn.set(groupRef, {
      memberIds,
      mainTableId: main.id,
      mainTableAd: main.ad,
      kapasite: totalKapasite,
      memberAdlari: memberTables.map((t) => t.ad),
      positions: positions || null,
      createdAt: serverTimestamp(),
    });

    for (const ref of tableRefs) {
      txn.update(ref, { grupId: groupRef.id });
    }

    return { groupId: groupRef.id, mainTableId: main.id, kapasite: totalKapasite };
  });
}

// Mevcut bir gruba yeni bir masa ekler (3+ masalı grup için)
export async function addTableToGroup({ groupId, table, position = null }) {
  const groupRef = doc(db, 'tableGroups', groupId);
  const tableRef = doc(db, 'tables', table.id);

  return runTransaction(db, async (txn) => {
    const groupSnap = await txn.get(groupRef);
    if (!groupSnap.exists()) throw new Error('Grup bulunamadı');
    const tableSnap = await txn.get(tableRef);
    if (!tableSnap.exists()) throw new Error(`Masa bulunamadı: ${table.ad}`);

    const tData = tableSnap.data();
    if (tData.grupId) throw new Error(`${tData.ad} zaten bir grupta`);
    if (tData.durum !== 'bos') throw new Error(`${tData.ad} boş değil, birleştirilemez`);

    const g = groupSnap.data();
    const memberIds = [...(g.memberIds || [])];
    if (memberIds.includes(table.id)) return { groupId };
    memberIds.push(table.id);

    const kapasite = (g.kapasite || 0) + (tData.kapasite || 0);
    const memberAdlari = [...(g.memberAdlari || []), tData.ad];
    const positions = { ...(g.positions || {}) };
    if (position) positions[table.id] = position;

    txn.update(groupRef, { memberIds, kapasite, memberAdlari, positions });
    txn.update(tableRef, { grupId: groupId });

    return { groupId, kapasite };
  });
}

export async function dissolveTableGroup({ groupId, force = false }) {
  const groupRef = doc(db, 'tableGroups', groupId);

  return runTransaction(db, async (txn) => {
    const groupSnap = await txn.get(groupRef);
    if (!groupSnap.exists()) throw new Error('Grup bulunamadı');
    const group = groupSnap.data();
    const memberIds = group.memberIds || [];

    const tableRefs = memberIds.map((id) => doc(db, 'tables', id));
    const tableSnaps = await Promise.all(tableRefs.map((r) => txn.get(r)));

    const mainTableId = group.mainTableId;
    if (!force) {
      for (let i = 0; i < tableSnaps.length; i++) {
        const s = tableSnaps[i];
        if (!s.exists()) continue;
        const data = s.data();
        if (s.id === mainTableId && data.durum === 'dolu') {
          throw new Error('Ana masada aktif sipariş var, önce ödemeyi al');
        }
      }
    }

    for (const ref of tableRefs) {
      txn.update(ref, { grupId: null });
    }
    txn.delete(groupRef);

    return { groupId };
  });
}
