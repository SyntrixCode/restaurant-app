import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * In-app APK güncelleme — yalnızca Android'de çalışır.
 * Web/iOS fallback: window.open(url) ile tarayıcıya yönlendirir.
 */
const AppUpdater = registerPlugin('AppUpdater', {
  web: () => ({
    canInstallUnknownSources: async () => ({ allowed: true }),
    openInstallSourcesSetting: async () => {},
    downloadAndInstall: async ({ url }) => {
      window.open(url, '_blank');
      return { ok: true, mode: 'web-open' };
    },
    addListener: () => ({ remove: () => {} }),
  }),
});

export function isAppUpdaterNative() {
  return Capacitor.isNativePlatform();
}

/**
 * Bilinmeyen kaynaklardan yükleme izni var mı? (Android 8+)
 */
export async function canInstallUnknownSources() {
  const res = await AppUpdater.canInstallUnknownSources();
  return !!res?.allowed;
}

/**
 * Sistem ayarlarında "Bu uygulamadan yüklemeye izin ver" ekranını aç.
 */
export async function openInstallSourcesSetting() {
  return AppUpdater.openInstallSourcesSetting();
}

/**
 * APK'yı indir ve install intent'i tetikle. Android yüklemeyi onaylatır.
 * @param {string} url - APK indirme URL'i
 * @param {(progress:{downloaded:number,total:number,percent:number})=>void} onProgress
 * @returns {Promise<{ok:true, path:string} | {ok:false, mode:string}>}
 */
export async function downloadAndInstall(url, onProgress) {
  if (typeof onProgress === 'function') {
    const handle = await AppUpdater.addListener('downloadProgress', onProgress);
    try {
      return await AppUpdater.downloadAndInstall({ url });
    } finally {
      if (handle?.remove) await handle.remove();
    }
  }
  return AppUpdater.downloadAndInstall({ url });
}
