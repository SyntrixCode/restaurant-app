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
 * "YYYY-MM-DD" gün string'inden o günün sonu (23:59:59.999, yerel).
 */
function endOfDay(gunStr) {
  const [y, m, d] = String(gunStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

/**
 * Gece sıfırlaması: önceki günden kalan AÇIK mesaiyi o günün sonunda (23:59:59)
 * otomatik kapatır. Çıkış "şimdi" değil, mesainin ait olduğu günün sonu olarak
 * yazılır ki süre/rapor doğru güne sayılsın.
 */
async function closeStaleShift(shift) {
  const giris = shift.giris?.toDate ? shift.giris.toDate() : new Date(shift.giris);
  const cikis = endOfDay(shift.gun || gunString(giris));
  const sureDk = Math.max(0, Math.round((cikis.getTime() - giris.getTime()) / 60000));
  await updateDoc(doc(db, 'shifts', shift.id), {
    cikis,
    sureDk,
    acik: false,
    otomatikKapatildi: true, // gece sıfırlamasıyla kapatıldı (manuel değil)
  });
}

/**
 * Mesai başlat (gün-duyarlı).
 * - Bugün zaten açık mesai varsa onu döndürür (çift kayıt önlenir).
 * - Önceki günden kalan açık mesai varsa gece sıfırlaması olarak o günün
 *   sonunda kapatılır, sonra bugüne yeni mesai açılır.
 */
export async function clockIn({ personelId, personelAd, rol }) {
  if (!personelId) throw new Error('personelId zorunlu');
  const bugun = gunString();
  const existing = await getOpenShift(personelId);
  if (existing) {
    if ((existing.gun || null) === bugun) return existing; // bugün zaten açık
    await closeStaleShift(existing); // dünden kalma → gün sonunda kapat (gece sıfırlama)
  }
  const ref = await addDoc(collection(db, 'shifts'), {
    personelId,
    personelAd: personelAd || 'Personel',
    rol: rol || null,
    giris: serverTimestamp(),
    cikis: null,
    gun: bugun,
    sureDk: null,
    acik: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, gun: bugun };
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
