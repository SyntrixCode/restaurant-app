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

const LATEST_RELEASE_URL = `https://api.github.com/repos/${APP_REPO}/releases/latest`;

/**
 * GitHub'daki son release'i çeker.
 * @returns {Promise<{ version:string, tag:string, name:string, body:string, apkUrl:string, publishedAt:string } | null>}
 */
export async function fetchLatestRelease() {
  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      if (res.status === 404) return null; // hiç release yok henüz
      throw new Error(`GitHub API: ${res.status}`);
    }
    const data = await res.json();
    const apkAsset = (data.assets || []).find((a) =>
      a.name.toLowerCase().endsWith('.apk'),
    );
    if (!apkAsset) return null;

    // tag formatı: build-<sha7>
    const version = data.tag_name.replace(/^build-/, '');

    return {
      version,
      tag: data.tag_name,
      name: data.name,
      body: data.body || '',
      apkUrl: apkAsset.browser_download_url,
      apkSize: apkAsset.size,
      publishedAt: data.published_at,
    };
  } catch (err) {
    console.warn('appUpdate: latest release alınamadı', err);
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
