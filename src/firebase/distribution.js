import { upsertDoc, watchDoc } from './firestore';

/**
 * Admin yeni bir APK sürümünü "dağıtım için onaylar" — Firestore'a yazılır,
 * diğer tabletlerin auto-update hook'u bunu yakalayıp sessizce indirir.
 *
 * Dağıtım dokümanı:
 *   settings/dagitim
 *     onayliSurum: "d7ca803"      (build short SHA)
 *     apkUrl: "https://github.com/.../app-debug.apk"
 *     onaylayanId, onaylayanAd, onayZamani
 */
export async function approveDistribution({ version, apkUrl, onaylayanId, onaylayanAd }) {
  if (!version || !apkUrl) throw new Error('version ve apkUrl gerekli');
  await upsertDoc('settings', 'dagitim', {
    onayliSurum: version,
    apkUrl,
    onaylayanId: onaylayanId || null,
    onaylayanAd: onaylayanAd || 'Admin',
    onayZamani: new Date(),
  });
}

export function watchDistribution(callback) {
  return watchDoc('settings', 'dagitim', callback);
}
