import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Çevrimdışıyken üstte uyarı şeridi. Firestore yerel cache'ten okumaya
 * devam eder ve yazılanları (sipariş/ödeme) kuyruğa alıp bağlantı gelince
 * otomatik eşitler — bu şerit sadece personeli bilgilendirir.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-sm font-semibold text-white">
      <WifiOff size={16} />
      <span>Çevrimdışı — işlemler kaydediliyor, bağlantı gelince otomatik eşitlenecek.</span>
    </div>
  );
}
