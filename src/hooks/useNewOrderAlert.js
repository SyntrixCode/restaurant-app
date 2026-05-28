import { useEffect, useRef } from 'react';
import { watchCollection, where } from '../firebase/firestore';
import { playNewOrderSound, playNewPackageSound } from '../utils/sound';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Aktif siparişleri dinler; yeni bir sipariş geldiğinde ses çalar.
 * İlk yüklemede çalmaz (mevcut siparişler için). Sadece SONRADAN eklenenler.
 *
 * settings.bildirimAyarlari.sesliUyari kapalıysa ses çalmaz.
 */
export function useNewOrderAlert() {
  const { settings } = useSettingsStore();
  const knownIdsRef = useRef(null); // null = henüz ilk yükleme yapılmadı
  const sesliUyari = settings?.bildirimAyarlari?.sesliUyari !== false;

  useEffect(() => {
    const unsub = watchCollection(
      'orders',
      (orders) => {
        const currentIds = new Set(orders.map((o) => o.id));

        // İlk yükleme — sadece mevcut id'leri kaydet, ses çalma
        if (knownIdsRef.current === null) {
          knownIdsRef.current = currentIds;
          return;
        }

        // Yeni gelen sipariş(ler)i bul
        const newOrders = orders.filter((o) => !knownIdsRef.current.has(o.id));
        knownIdsRef.current = currentIds;

        if (newOrders.length > 0 && sesliUyari) {
          const hasPackage = newOrders.some((o) => o.paketMi);
          if (hasPackage && settings?.bildirimAyarlari?.yeniPaket !== false) {
            playNewPackageSound();
          } else {
            playNewOrderSound();
          }
        }
      },
      where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesliUyari]);
}
