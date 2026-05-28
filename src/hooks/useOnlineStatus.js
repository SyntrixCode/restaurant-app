import { useEffect, useState } from 'react';

/**
 * Tarayıcı/cihaz çevrimiçi mi? online/offline event'lerini dinler.
 * Firestore zaten yerel cache + write kuyruğu tutar; bu hook sadece
 * personele görsel durum göstermek için kullanılır.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
