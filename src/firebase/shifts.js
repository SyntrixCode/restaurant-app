import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

function gunString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Personelin açık (bitmemiş) mesaisini döndürür, yoksa null.
 */
export async function getOpenShift(personelId) {
  if (!personelId) return null;
  const q = query(
    collection(db, 'shifts'),
    where('personelId', '==', personelId),
    where('acik', '==', true),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Mesai başlat. Zaten açık mesai varsa onu döndürür (çift kayıt önlenir).
 */
export async function clockIn({ personelId, personelAd, rol }) {
  if (!personelId) throw new Error('personelId zorunlu');
  const existing = await getOpenShift(personelId);
  if (existing) return existing;
  const ref = await addDoc(collection(db, 'shifts'), {
    personelId,
    personelAd: personelAd || 'Personel',
    rol: rol || null,
    giris: serverTimestamp(),
    cikis: null,
    gun: gunString(),
    sureDk: null,
    acik: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

/**
 * Mesai bitir. Süre (dk) giriş zamanına göre hesaplanır.
 */
export async function clockOut(shift) {
  if (!shift?.id) throw new Error('Mesai bulunamadı');
  const giris = shift.giris?.toDate ? shift.giris.toDate() : new Date(shift.giris);
  const now = new Date();
  const sureDk = Math.max(0, Math.round((now.getTime() - giris.getTime()) / 60000));
  await updateDoc(doc(db, 'shifts', shift.id), {
    cikis: serverTimestamp(),
    sureDk,
    acik: false,
  });
  return sureDk;
}
