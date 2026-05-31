import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './config';

const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'translateMenu');

/**
 * Tüm kategori + ürünleri TR'den EN ve AR'a otomatik çevirir.
 * Mevcut çeviriler varsa atlanır (force=true ile ezilir).
 * @param {{ force?: boolean }} opts
 * @returns {Promise<{ categories: {updated, skipped}, products: {updated, skipped} }>}
 */
export async function translateMenu({ force = false } = {}) {
  const res = await fn({ force });
  return res.data;
}
