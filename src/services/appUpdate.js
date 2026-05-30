/**
 * GitHub Releases üzerinden uygulama güncellemesi.
 *
 * - Mevcut sürüm: build sırasında src/version.js'e yazılır (commit short SHA)
 * - Son sürüm: GitHub API'den çekilir (releases/latest)
 * - Farklıysa kullanıcıya 'Yeni sürüm var' uyarısı + indir butonu
 *
 * APK indirme:
 *   Capacitor Browser plugin yoksa basit window.location.href ile yönlendirir,
 *   Android tarayıcısı APK'yı indirir, kullanıcı tıklayınca "Yükle?" sorar.
 */

import { APP_VERSION, APP_REPO } from '../version';

// /releases endpoint'i pre-release dahil tüm release'leri döner.
// /releases/latest yalnızca stable yayınları gösterir — biz pre-release de istiyoruz.
const RELEASES_URL = `https://api.github.com/repos/${APP_REPO}/releases?per_page=10`;

/**
 * GitHub'daki en yeni release'i (pre-release dahil) çeker.
 * @returns {Promise<{ version:string, tag:string, name:string, body:string, apkUrl:string, publishedAt:string, prerelease:boolean } | null>}
 */
export async function fetchLatestRelease() {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub API: ${res.status}`);
    }
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;

    // GitHub API bazen sıralamayı garanti etmiyor — published_at'a göre
    // manuel sıralayıp en yeni APK içeren release'i seç.
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.published_at || a.created_at || 0).getTime();
      const tb = new Date(b.published_at || b.created_at || 0).getTime();
      return tb - ta; // descending — en yeni başta
    });
    const apkRelease = sorted.find((r) =>
      (r.assets || []).some((a) => a.name.toLowerCase().endsWith('.apk')),
    );
    if (!apkRelease) return null;

    const apkAsset = apkRelease.assets.find((a) =>
      a.name.toLowerCase().endsWith('.apk'),
    );

    return {
      version: apkRelease.tag_name.replace(/^build-/, ''),
      tag: apkRelease.tag_name,
      name: apkRelease.name,
      body: apkRelease.body || '',
      apkUrl: apkAsset.browser_download_url,
      apkSize: apkAsset.size,
      publishedAt: apkRelease.published_at,
      prerelease: apkRelease.prerelease,
    };
  } catch (err) {
    console.warn('appUpdate: release alınamadı', err);
    return null;
  }
}

/**
 * Güncelleme var mı?
 * Mevcut versiyon (commit sha) son release versiyonu ile eşleşmiyorsa true.
 */
export async function checkForUpdate() {
  const current = APP_VERSION;
  const latest = await fetchLatestRelease();
  if (!latest) {
    return { hasUpdate: false, current, latest: null };
  }
  return {
    hasUpdate: latest.version !== current,
    current,
    latest,
  };
}

/**
 * APK indirmeyi tetikler — Android tarayıcısı dosyayı indirir,
 * kullanıcı bildirimden tıklayınca Android "Yükle?" diyalogu çıkar.
 */
export function startApkDownload(apkUrl) {
  if (!apkUrl) throw new Error('APK URL yok');
  // Capacitor native ortamda Browser plugin tercih edilir ama opsiyonel.
  // window.open yeni sekme açar; Android intent sistemi dosya tipini algılar.
  window.open(apkUrl, '_system');
}
