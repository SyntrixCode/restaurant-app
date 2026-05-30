import { useEffect, useState } from 'react';
import { checkForUpdate } from '../services/appUpdate';

const STORAGE_KEY = 'syntrixpos.dismissedUpdate';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 dk

/**
 * Yeni sürüm var mı? Polling ile periyodik kontrol eder.
 * Kullanıcı bir sürümü "kapatırsa" o sürüm için banner gizlenir.
 *
 * @returns {{ info: object|null, dismissed: boolean, dismiss: () => void, refresh: () => Promise<void> }}
 */
export function useUpdateAvailable() {
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = async () => {
    try {
      const result = await checkForUpdate();
      setInfo(result);
      if (result?.hasUpdate && result.latest?.version) {
        const dismissedVer = localStorage.getItem(STORAGE_KEY);
        setDismissed(dismissedVer === result.latest.version);
      } else {
        setDismissed(false);
      }
    } catch (err) {
      console.warn('useUpdateAvailable:', err);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (info?.latest?.version) {
      localStorage.setItem(STORAGE_KEY, info.latest.version);
    }
    setDismissed(true);
  };

  return { info, dismissed, dismiss, refresh };
}
