import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './config';

const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'importMenu');

/**
 * Restoranın PDF menüsünden çıkarılmış kategori + ürün listesini Firestore'a yazar.
 * @param {{ clearFirst?: boolean }} opts — true → önce mevcut categories+products silinir
 */
export async function importMenu({ clearFirst = false } = {}) {
  const res = await fn({ clearFirst });
  return res.data;
}
