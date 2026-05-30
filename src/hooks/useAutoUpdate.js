import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { APP_VERSION } from '../version';
import { watchDistribution } from '../firebase/distribution';
import {
  isAppUpdaterNative,
  canInstallUnknownSources,
  downloadAndInstall,
} from '../plugins/appUpdater';

const LS_KEY = 'syntrixpos.autoUpdate.lastAttempt';

/**
 * Admin "İndir & Güncelle" tıkladığında diğer tabletlerin (garson/kasiyer)
 * sessizce indirip kuruluma geçmesini sağlar.
 *
 * Tek bir yerde mount edilmeli (PosLayout). Native (APK) değilse ve admin'in
 * aynı tableti üzerindeysek (rol kontrolü) devreye girmez.
 *
 * Akış:
 *   1. settings/dagitim dinlenir
 *   2. onayliSurum cihazdaki APP_VERSION'dan farklıysa ve daha önce
 *      denenmemişse → APK indirilir → Android "Yükle?" diyaloğu açılır
 *   3. localStorage'a son denenen sürüm yazılır — sonsuz döngü olmaz
 */
export function useAutoUpdate() {
  const inFlight = useRef(false);

  useEffect(() => {
    // Sadece native (APK) ortamında çalışır
    if (!Capacitor.isNativePlatform() || !isAppUpdaterNative()) return;

    return watchDistribution(async (data) => {
      if (!data) return;
      const { onayliSurum, apkUrl } = data;
      if (!onayliSurum || !apkUrl) return;
      // Zaten bu sürümdeyiz
      if (onayliSurum === APP_VERSION) return;
      // Bu sürüm daha önce denendi (kullanıcı dialog'u reddetmiş olabilir)
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY) === onayliSurum) return;
      if (inFlight.current) return;

      inFlight.current = true;
      try {
        const allowed = await canInstallUnknownSources();
        if (!allowed) {
          toast(
            'Yeni sürüm bekliyor — bu cihaza kurulum izni vermeden ilerlenemez. Admin\'e bildirin.',
            { icon: '⚠️', duration: 10000 },
          );
          inFlight.current = false;
          return;
        }
        toast(`Yeni sürüm geliyor (${onayliSurum})…`, { icon: '✨', duration: 5000 });
        try {
          localStorage.setItem(LS_KEY, onayliSurum);
        } catch {
          /* yoksay */
        }
        await downloadAndInstall(apkUrl, () => {
          /* sessiz — progress göstermiyoruz */
        });
      } catch (err) {
        console.warn('autoUpdate başarısız:', err);
        inFlight.current = false;
      }
    });
  }, []);
}
