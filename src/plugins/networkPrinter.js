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
  }),
});

/**
 * Bixolon yazıcıya fiş bas.
 * @param {{ ip?: string, port?: number, model?: string, connection?: 'ethernet'|'usb', lines: Array, cut?: boolean, feedLines?: number }} opts
 */
export async function printNetworkReceipt(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Bixolon yazıcı sadece cihazda kullanılabilir');
  }
  const { ip, model = 'SRP-E300', connection = 'ethernet', lines, cut = true, feedLines = 3 } = opts || {};
  if (connection === 'ethernet' && !ip) throw new Error('Ethernet bağlantısı için IP gerekli');
  if (!Array.isArray(lines)) throw new Error('lines bir dizi olmalı');
  return NetworkPrinter.printReceipt({ ip, model, connection, lines, cut, feedLines });
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
