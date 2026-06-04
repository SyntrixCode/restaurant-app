import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Bixolon (UPOS) ağ yazıcısı plugin'i — SRP-E300 ve uyumlu modeller.
 *
 * `lines` formatı iminPrinter.js ile aynıdır (text/divider/feed/qr).
 * Native tarafta jpos.POSPrinter + BXLConfigLoader kullanılır.
 *
 * Web fallback: yok — ağ yazıcısı sadece native ortamda.
 */
const NetworkPrinter = registerPlugin('NetworkPrinter', {
  web: () => ({
    printReceipt: async () => ({ ok: false, mode: 'web-noop' }),
    testPrint: async () => ({ ok: false, mode: 'web-noop' }),
    openCashDrawer: async () => ({ ok: false, mode: 'web-noop' }),
  }),
});

/**
 * Bixolon ağ yazıcısına fiş bas.
 * @param {{ ip: string, port?: number, model?: string, lines: Array, cut?: boolean, feedLines?: number }} opts
 */
export async function printNetworkReceipt(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Ağ yazıcısı sadece cihazda kullanılabilir');
  }
  const { ip, model = 'SRP-E300', lines, cut = true, feedLines = 3 } = opts || {};
  if (!ip) throw new Error('Yazıcı IP adresi gerekli');
  if (!Array.isArray(lines)) throw new Error('lines bir dizi olmalı');
  return NetworkPrinter.printReceipt({ ip, model, lines, cut, feedLines });
}

/**
 * Yazıcı bağlantısını test eder — bir test sayfası basar.
 * @param {{ ip: string, model?: string }} opts
 */
export async function testNetworkPrinter(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Ağ yazıcısı sadece cihazda kullanılabilir');
  }
  const { ip, model = 'SRP-E300' } = opts || {};
  if (!ip) throw new Error('Yazıcı IP adresi gerekli');
  return NetworkPrinter.testPrint({ ip, model });
}

/**
 * Para kasasını açar — yazıcının DK portuna 24V darbe.
 * Yazıcı bağlı olan tek bir kasa varsa (HP VB400 vb.) onu açar.
 * @param {{ ip: string, model?: string }} opts
 */
export async function openCashDrawer(opts) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Kasa sadece cihazda açılabilir');
  }
  const { ip, model = 'SRP-E300' } = opts || {};
  if (!ip) throw new Error('Yazıcı IP adresi gerekli');
  return NetworkPrinter.openCashDrawer({ ip, model });
}
