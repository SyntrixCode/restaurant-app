import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './config';

const functions = getFunctions(app, 'europe-west1');

const confirmFn = httpsCallable(functions, 'posentegraConfirm');
const rejectFn = httpsCallable(functions, 'posentegraReject');
const reasonsFn = httpsCallable(functions, 'posentegraReasons');

/**
 * Posentegra siparişini kabul et — order'da posentegraOnayli=true olur,
 * Posentegra'ya verify çağrısı gider.
 */
export async function confirmPosentegraOrder(orderId) {
  const res = await confirmFn({ orderId });
  return res.data;
}

/**
 * Posentegra siparişini reddet — order durumu 'iptal' olur,
 * Posentegra'ya cancel çağrısı gider.
 */
export async function rejectPosentegraOrder(orderId, { reason, note } = {}) {
  const res = await rejectFn({ orderId, reason, note });
  return res.data;
}

/**
 * Posentegra'dan iptal nedenleri listesi (dropdown için).
 */
export async function fetchPosentegraReasons(orderId) {
  const res = await reasonsFn({ orderId });
  return res.data?.reasons || [];
}
