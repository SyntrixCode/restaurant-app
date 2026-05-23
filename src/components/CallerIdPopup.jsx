import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, X, User, Truck } from 'lucide-react';
import { fetchAll } from '../firebase/firestore';
import { where, orderBy } from '../firebase/firestore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Mock CallerID popup'ı.
 *
 * Şu an manuel tetiklenir: window.__mockCall(phone) ile veya
 * geliştirme menüsünden test edilebilir.
 *
 * Gelecekte IP telefon entegrasyonu eklenirse:
 * - Yerel telefon servisinden bir event listener kurulur
 * - Numara geldiğinde setIncoming(phone) çağrılır
 * - Otomatik olarak past orders'tan müşteri bilgisi çekilir
 *
 * Müşteri tarafının istek belgesinde "VoIP entegrasyonu eklenecek" yazıyor,
 * o gelene kadar bu popup mock olarak duruyor.
 */
export default function CallerIdPopup() {
  const [incoming, setIncoming] = useState(null);
  const [history, setHistory] = useState([]);
  const [autoClose, setAutoClose] = useState(0);
  const navigate = useNavigate();
  const { rol } = useAuthStore();
  const { settings } = useSettingsStore();

  // Window üzerinde test fonksiyonu — dev console'dan çağırılabilir
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__mockCall = (phone) => {
      if (!phone) return console.warn('Telefon numarası gerekli');
      setIncoming({ phone, time: new Date() });
    };
    return () => {
      delete window.__mockCall;
    };
  }, []);

  // Gelen aramada geçmiş siparişleri çek
  useEffect(() => {
    if (!incoming) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const past = await fetchAll(
          'archivedOrders',
          where('musteriTel', '==', incoming.phone),
          orderBy('tamamlandiZamani', 'desc'),
        );
        if (!cancelled) setHistory(past.slice(0, 5));
      } catch (err) {
        // archivedOrders'a paket dışı kayıt yoksa boş listesi göster
        console.warn('CallerID geçmiş hata:', err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incoming]);

  // 30 sn otomatik kapan
  useEffect(() => {
    if (!incoming) return;
    setAutoClose(30);
    const tick = setInterval(() => {
      setAutoClose((s) => {
        if (s <= 1) {
          clearInterval(tick);
          setIncoming(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [incoming]);

  // Ayarlardan kapalıysa veya rol uygun değilse render etme
  const enabled = settings?.bildirimAyarlari?.callerID !== false;
  if (!enabled) return null;
  if (!['kasiyer', 'admin'].includes(rol)) return null;
  if (!incoming) return null;

  const lastCustomer = history[0];
  const ad = lastCustomer?.musteriAd || 'Bilinmeyen';

  return (
    <div className="fixed right-4 top-4 z-[60] w-80 animate-in slide-in-from-top-2">
      <div className="overflow-hidden rounded-xl border-2 border-blue-400 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-blue-600 px-3 py-2 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Phone size={14} className="animate-pulse" />
            <span>Gelen Arama</span>
          </div>
          <button
            onClick={() => setIncoming(null)}
            className="rounded p-1 hover:bg-blue-700"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <User size={16} className="text-slate-400" />
            <span className="font-semibold text-slate-900">{ad}</span>
          </div>
          <p className="font-mono text-lg font-bold text-blue-700">{incoming.phone}</p>

          {history.length > 0 ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs">
              <p className="font-semibold text-slate-700">
                Son {history.length} sipariş ({history.length === 5 ? '5+' : history.length} kayıt)
              </p>
              <ul className="mt-1 space-y-0.5 text-slate-600">
                {history.slice(0, 3).map((h) => (
                  <li key={h.id} className="truncate">
                    • {h.gun} · {(h.items || []).map((i) => i.ad).slice(0, 2).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs italic text-slate-500">Bu numara için kayıt yok</p>
          )}

          <button
            onClick={() => {
              const tel = incoming.phone;
              setIncoming(null);
              navigate(`/pos/packages?tel=${encodeURIComponent(tel)}`);
            }}
            className="btn-primary mt-3 w-full"
          >
            <Truck size={14} /> Paket Sipariş Aç
          </button>

          <p className="mt-2 text-center text-[10px] text-slate-400">
            {autoClose}s sonra otomatik kapanır
          </p>
        </div>
      </div>
    </div>
  );
}
