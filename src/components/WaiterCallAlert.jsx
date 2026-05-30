import { useEffect, useRef, useState } from 'react';
import { BellRing, Receipt, Check } from 'lucide-react';
import { watchCollection, where, patchDoc } from '../firebase/firestore';
import { playWaiterCallSound } from '../utils/sound';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

const TIP_META = {
  garson: { label: 'Garson çağırıyor', icon: BellRing, color: 'bg-blue-600' },
  hesap: { label: 'Hesap istiyor', icon: Receipt, color: 'bg-emerald-600' },
};

/**
 * Masadaki QR menüden gelen garson çağrılarını dinler, ses çalar ve
 * POS üzerinde kapatılabilir kartlar gösterir. Tüm POS rollerinde görünür.
 */
export default function WaiterCallAlert() {
  const [calls, setCalls] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const knownIdsRef = useRef(null);
  const { profile } = useAuthStore();
  const { settings } = useSettingsStore();
  const sesliUyari = settings?.bildirimAyarlari?.sesliUyari !== false;

  useEffect(() => {
    return watchCollection(
      'waiterCalls',
      (items) => {
        const sorted = [...items].sort((a, b) => {
          const ta = a.olusturmaZamani?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.olusturmaZamani?.toDate?.()?.getTime?.() ?? 0;
          return ta - tb;
        });
        const currentIds = new Set(sorted.map((c) => c.id));
        if (knownIdsRef.current === null) {
          knownIdsRef.current = currentIds;
        } else {
          const hasNew = sorted.some((c) => !knownIdsRef.current.has(c.id));
          knownIdsRef.current = currentIds;
          if (hasNew && sesliUyari) playWaiterCallSound();
        }
        setCalls(sorted);
      },
      where('durum', '==', 'bekliyor'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesliUyari]);

  const handleKarsila = async (call) => {
    setBusyId(call.id);
    try {
      await patchDoc('waiterCalls', call.id, {
        durum: 'karsilandi',
        karsilayanAd: profile?.ad || 'Personel',
        karsilamaZamani: new Date(),
      });
    } catch (err) {
      console.error('Çağrı kapatılamadı:', err);
    } finally {
      setBusyId(null);
    }
  };

  if (calls.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {calls.map((call) => {
        const meta = TIP_META[call.tip] || TIP_META.garson;
        const Icon = meta.icon;
        return (
          <div
            key={call.id}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-2 ring-amber-300"
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${meta.color}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-slate-900">{call.masaAd}</p>
              <p className="text-sm text-slate-600">{meta.label}</p>
            </div>
            <button
              onClick={() => handleKarsila(call)}
              disabled={busyId === call.id}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              <Check size={16} /> Tamam
            </button>
          </div>
        );
      })}
    </div>
  );
}
