import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Bixolon (UPOS) yazıcı plugin'i — SRP-E300 ve uyumlu modeller.
 * Hem Ethernet (LAN, IP) hem USB Host (tablet'in USB-OTG'sine takılı) destekler.
 *
 * `lines` formatı iminPrinter.js ile aynıdır (text/divider/feed/qr).
 * Native tarafta jpos.POSPrinter + BXLConfigLoader kullanılır.
 *
 * Web fallback: yok — Bixolon yazıcı sadece native ortamda.
 */
const NetworkPrinter = registerPlugin('NetworkPrinter', {
  web: () => ({
    printReceipt: async () => ({ ok: false, mode: 'web-noop' }),
    testPrint: async () => ({ ok: false, mode: 'web-noop' }),
    openCashDrawer: async () => ({ ok: false, mode: 'web-noop' }),
    triggerBuzzer: async () => ({ ok: false, mode: 'web-noop' }),
  }),
});

// Yazıcı başına baskı KUYRUĞU — aynı yazıcıya (IP/USB) aynı anda iki iş gönderilmez.
// Termal yazıcılar tek bağlantılıdır; eşzamanlı iş gelince fiş yarıda kesilir / hiç çıkmaz /
// küçük kağıt çıkar. Her hedef için işleri zincire dizip biri bitmeden diğerini başlatmayız.
const _printQueues = new Map(); // key(ip|usb) -> son işin Promise'i

/**
 * Bixolon yazıcıya fiş bas. Aynı yazıcıya işler SIRAYLA gider (queue).
 * @param {{ ip?: string, port?: number, model?: string, connection?: 'ethernet'|'usb', lines: Array, cut?: boolean, feedLines?: number, buzzer?: {pulses:number} }} opts
 */
export async function printNetworkReceipt(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Bixolon yazıcı sadece cihazda kullanılabilir');
  }
  const { ip, model = 'SRP-E300', connection = 'ethernet', lines, cut = true, feedLines = 3, buzzer } = opts || {};
  if (connection === 'ethernet' && !ip) throw new Error('Ethernet bağlantısı için IP gerekli');
  if (!Array.isArray(lines)) throw new Error('lines bir dizi olmalı');

  const key = connection === 'usb' ? 'usb' : ip;
  const prev = _printQueues.get(key) || Promise.resolve();
  // Önceki iş hata verse bile sıradaki çalışsın; işler arasına küçük nefes payı bırak
  // (yazıcı önceki fişi tam bitirsin, bağlantı serbest kalsın).
  const run = prev
    .catch(() => {})
    .then(async () => {
      const res = await NetworkPrinter.printReceipt({ ip, model, connection, lines, cut, feedLines, buzzer });
      await new Promise((r) => setTimeout(r, 250));
      return res;
    });
  _printQueues.set(key, run);
  // Kuyruk referansı büyümesin: bu iş en sondaki ise temizle
  run.finally(() => {
    if (_printQueues.get(key) === run) _printQueues.delete(key);
  });
  return run;
}

/**
 * Yazıcı bağlantısını test eder — bir test sayfası basar.
 * @param {{ ip?: string, model?: string, connection?: 'ethernet'|'usb' }} opts
 */
export async function testNetworkPrinter(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Bixolon yazıcı sadece cihazda kullanılabilir');
  }
  const { ip, model = 'SRP-E300', connection = 'ethernet' } = opts || {};
  if (connection === 'ethernet' && !ip) throw new Error('Ethernet bağlantısı için IP gerekli');
  return NetworkPrinter.testPrint({ ip, model, connection });
}

/**
 * Para kasasını açar — yazıcının DK portuna 24V darbe.
 * Yazıcı bağlı olan tek bir kasa varsa (HP VB400 vb.) onu açar.
 * @param {{ ip?: string, model?: string, connection?: 'ethernet'|'usb' }} opts
 */
export async function openCashDrawer(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Kasa sadece cihazda açılabilir');
  }
  const { ip, model = 'SRP-E300', connection = 'ethernet' } = opts || {};
  if (connection === 'ethernet' && !ip) throw new Error('Ethernet bağlantısı için IP gerekli');
  return NetworkPrinter.openCashDrawer({ ip, model, connection });
}

/**
 * Mutfak buzzer'ı için pattern darbe. pulses adet, aralarında gap ms.
 * Pattern presetleri:
 *   - { pulses: 1, gap: 0 }     — yeni sipariş (tek bip)
 *   - { pulses: 2, gap: 200 }   — paket sipariş (iki bip)
 *   - { pulses: 2, gap: 100 }   — ek sipariş (hızlı iki bip)
 *   - { pulses: 3, gap: 300 }   — sipariş iptali (üç uzun bip)
 *
 * @param {{ ip?: string, model?: string, connection?: 'ethernet'|'usb', pulses?: number, gap?: number }} opts
 */
export async function triggerBuzzer(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Buzzer sadece cihazda çalışır');
  }
  const { ip, model = 'SRP-E300', connection = 'ethernet', pulses = 1, gap = 200 } = opts || {};
  if (connection === 'ethernet' && !ip) throw new Error('Ethernet bağlantısı için IP gerekli');
  return NetworkPrinter.triggerBuzzer({ ip, model, connection, pulses, gap });
}
