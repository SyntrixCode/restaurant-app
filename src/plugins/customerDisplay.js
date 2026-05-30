import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Müşteri Ekranı (2. ekran) plugin'i.
 *
 * Native (Android, iMin Swan): ikincil ekrandaki Presentation üzerinde
 *   /customer-display route'unu WebView olarak açar.
 * Web/iOS: noop — sadece BroadcastChannel state sync çalışır,
 *   geliştirici elinde ikinci tarayıcı sekmesi açarsa görür.
 */
const CustomerDisplay = registerPlugin('CustomerDisplay', {
  web: () => ({
    isAvailable: async () => ({ available: false }),
    start: async () => ({ ok: false, mode: 'web-noop' }),
    stop: async () => ({ ok: true }),
  }),
});

const CHANNEL_NAME = 'syntrixpos-customer-display';

let _channel = null;
let _channelInitTried = false;
function channel() {
  if (typeof window === 'undefined') return null;
  if (_channel) return _channel;
  if (_channelInitTried) return null;
  _channelInitTried = true;
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    _channel = new BroadcastChannel(CHANNEL_NAME);
    return _channel;
  } catch (err) {
    console.warn('customerDisplay: BroadcastChannel oluşturulamadı', err);
    return null;
  }
}

export function isCustomerDisplayNative() {
  return Capacitor.isNativePlatform();
}

export async function checkCustomerDisplayAvailable() {
  try {
    const res = await CustomerDisplay.isAvailable();
    return !!res?.available;
  } catch {
    return false;
  }
}

export async function startCustomerDisplay() {
  try {
    return await CustomerDisplay.start({ url: '/customer-display' });
  } catch (err) {
    console.warn('CustomerDisplay start hata:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function stopCustomerDisplay() {
  try {
    return await CustomerDisplay.stop();
  } catch {
    return { ok: false };
  }
}

/**
 * Müşteri ekranına state gönder (BroadcastChannel).
 * Receiver tarafı: /customer-display route'u dinler ve render eder.
 *
 * @param {{
 *   mode: 'idle' | 'order' | 'payment' | 'thanks',
 *   order?: { masaAd, items, araToplam, indirim, toplam },
 *   payment?: { tutar, yontem, kalan, paraUstu },
 *   message?: string,
 * }} payload
 */
export function pushToCustomerDisplay(payload) {
  const ch = channel();
  if (!ch) return;
  try {
    ch.postMessage({ ts: Date.now(), ...payload });
  } catch (err) {
    console.warn('CustomerDisplay push hata:', err);
  }
}

/**
 * Müşteri ekranı tarafında dinlemek için.
 */
export function subscribeCustomerDisplay(handler) {
  const ch = channel();
  if (!ch) return () => {};
  const wrapper = (e) => handler(e.data);
  ch.addEventListener('message', wrapper);
  return () => ch.removeEventListener('message', wrapper);
}
