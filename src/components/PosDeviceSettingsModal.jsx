import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, MapPin } from 'lucide-react';
import Modal from './ui/Modal';
import { watchCollection } from '../firebase/firestore';
import {
  getDeviceAdisyonPrinterId,
  setDeviceAdisyonPrinterId,
  getDeviceStationName,
  setDeviceStationName,
} from '../utils/posDeviceSettings';
import { testNetworkPrinter } from '../plugins/networkPrinter';

/**
 * Her POS tableti kendi ayarlarını burada yapar — localStorage'a yazılır.
 * Bu cihazın istasyon adı (Kasa, Garson-1, Garson-2 vb.) ve adisyon yazıcısı.
 */
export default function PosDeviceSettingsModal({ open, onClose }) {
  const [printers, setPrinters] = useState([]);
  const [adisyonPrinterId, setAdisyonId] = useState('');
  const [stationName, setStation] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => watchCollection('printers', setPrinters), []);

  useEffect(() => {
    if (open) {
      setAdisyonId(getDeviceAdisyonPrinterId() || '');
      setStation(getDeviceStationName() || '');
    }
  }, [open]);

  const save = () => {
    setDeviceAdisyonPrinterId(adisyonPrinterId || null);
    setDeviceStationName(stationName || null);
    toast.success('Cihaz ayarları kaydedildi');
    onClose();
  };

  const testPrinter = async () => {
    const selected = printers.find((p) => p.id === adisyonPrinterId);
    if (!selected) return;
    setTesting(true);
    const t = toast.loading(`${selected.ad}: test ediliyor…`);
    try {
      await testNetworkPrinter({
        ip: selected.ip,
        model: selected.model || 'SRP-E300',
        connection: selected.baglanti || 'ethernet',
      });
      toast.success(`${selected.ad}: test sayfası gönderildi`, { id: t });
    } catch (err) {
      toast.error(`Test başarısız: ${err?.message || err}`, { id: t, duration: 6000 });
    } finally {
      setTesting(false);
    }
  };

  // Adisyon basabilir olarak işaretli yazıcılar — yoksa hepsi
  const adisyonPrinters = printers.filter((p) => p.aktif && (p.ip || p.baglanti === 'usb'));
  const flagged = adisyonPrinters.filter((p) => p.adisyonBas);
  const list = flagged.length > 0 ? flagged : adisyonPrinters;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bu Cihazın Ayarları"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button type="button" onClick={save} className="btn-primary">
            Kaydet
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
          Bu ayarlar yalnızca bu tablete özeldir (localStorage). Her POS tableti
          (kasa, garson-1, garson-2) kendi adisyon yazıcısını seçer.
        </p>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <MapPin size={14} /> İstasyon Adı (opsiyonel)
          </label>
          <input
            type="text"
            value={stationName}
            onChange={(e) => setStation(e.target.value)}
            className="input"
            placeholder="Kasa, Garson-1, Garson-2…"
          />
          <p className="mt-1 text-xs text-slate-500">
            Sadece kayıt amaçlı — fiş üzerine yazılmaz. İlerideki çoklu istasyon raporları için.
          </p>
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Receipt size={14} /> Adisyon Yazıcısı
          </label>
          <select
            value={adisyonPrinterId}
            onChange={(e) => setAdisyonId(e.target.value)}
            className="input"
          >
            <option value="">
              — Otomatik (varsayılan adisyon basıcı) —
            </option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad} {p.varsayilan ? '★' : ''} ({p.baglanti === 'usb' ? 'USB' : p.ip})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Bu tabletten basılan adisyon, hesap fişi, parça fiş bu yazıcıdan çıkar.
            {flagged.length === 0 && (
              <>
                {' '}
                <span className="text-amber-600">Henüz "Adisyon basıcı" işaretli yazıcı yok</span>
                {' — '}Admin → Yazıcılar'dan işaretleyin.
              </>
            )}
          </p>
        </div>

        {adisyonPrinterId && (
          <button
            type="button"
            onClick={testPrinter}
            disabled={testing}
            className="btn-ghost w-full text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {testing ? 'Test ediliyor…' : 'Test Yazdır'}
          </button>
        )}
      </div>
    </Modal>
  );
}
