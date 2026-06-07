import { useEffect, useState } from 'react';
import { Clock, Play, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOpenShift, clockIn, clockOut } from '../firebase/shifts';
import { useAuthStore } from '../store/authStore';

function elapsedLabel(giris) {
  if (!giris) return '';
  const start = giris.toDate ? giris.toDate() : new Date(giris);
  const mins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`;
}

/**
 * POS başlığında mesai başlat/bitir butonu. Açık mesai varsa geçen süreyi gösterir.
 */
export default function ShiftButton() {
  const { user, profile, rol } = useAuthStore();
  const [shift, setShift] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // POS personeli (garson/kasiyer/kurye) giriş yapınca mesai OTOMATİK başlar.
  // clockIn gün-duyarlı: dünden kalan açık mesaiyi gece sıfırlaması olarak kapatır,
  // bugün açık varsa onu sürdürür, yoksa yeni açar. Admin için otomatik yok (manuel).
  const AUTO_ROLES = ['garson', 'kasiyer', 'kurye'];
  useEffect(() => {
    if (!user?.uid || !rol) return;
    let cancelled = false;
    (async () => {
      try {
        if (AUTO_ROLES.includes(rol)) {
          const s = await clockIn({ personelId: user.uid, personelAd: profile?.ad, rol });
          if (!cancelled) setShift({ ...s, giris: s.giris || new Date() });
        } else {
          const open = await getOpenShift(user.uid);
          if (!cancelled) setShift(open);
        }
      } catch (e) {
        console.error('Mesai otomatik başlatma:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, rol]);

  // Açık mesaide geçen süreyi her dakika güncelle
  useEffect(() => {
    if (!shift) return;
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [shift]);

  const handleClick = async () => {
    if (!user?.uid || busy) return;
    setBusy(true);
    try {
      if (shift) {
        if (!confirm('Mesaiyi bitirmek istiyor musunuz?')) {
          setBusy(false);
          return;
        }
        const sureDk = await clockOut(shift);
        setShift(null);
        const h = Math.floor(sureDk / 60);
        const m = sureDk % 60;
        toast.success(`Mesai bitti — ${h > 0 ? `${h}s ` : ''}${m}dk çalışıldı`);
      } else {
        const s = await clockIn({ personelId: user.uid, personelAd: profile?.ad, rol });
        // clockIn serverTimestamp henüz çözülmemiş olabilir; giriş zamanını yerel ayarla
        setShift({ ...s, giris: new Date() });
        toast.success('Mesai başladı');
      }
    } catch (err) {
      console.error(err);
      toast.error('Mesai işlemi başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
        shift
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
      title={shift ? 'Mesaiyi bitir' : 'Mesai başlat'}
    >
      {shift ? <Square size={16} /> : <Play size={16} />}
      {shift ? (
        <span className="flex items-center gap-1">
          <Clock size={14} /> {elapsedLabel(shift.giris)}
        </span>
      ) : (
        'Mesai'
      )}
    </button>
  );
}
