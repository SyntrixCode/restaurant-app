import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, User } from 'lucide-react';
import Modal from './ui/Modal';
import { watchCollection, createDoc } from '../firebase/firestore';
import { formatTL } from '../utils/format';

/**
 * Kasiyer "Patron / Cari" deyince açılır: hesabı yazacağı kişiyi (cari) seçer.
 * Aktif carileri büyük dokunmatik butonlar olarak listeler + hızlı "Yeni Cari" ekleme.
 *
 * Props: open, onClose, amount (işlenecek tutar), onSelect(cari) → { id, ad, bakiye }
 */
export default function CariSelectModal({ open, onClose, amount, onSelect }) {
  const [list, setList] = useState([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    return watchCollection('cari', setList);
  }, [open]);

  const active = useMemo(
    () =>
      list
        .filter((c) => c.aktif !== false)
        .sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr')),
    [list],
  );

  const handleAdd = async () => {
    const ad = newName.trim();
    if (ad.length < 2) {
      toast.error('Cari adı girin');
      return;
    }
    setBusy(true);
    try {
      const id = await createDoc('cari', { ad, telefon: '', notlar: '', aktif: true, bakiye: 0 });
      setNewName('');
      onSelect({ id, ad, bakiye: 0 }); // yeni cariye direkt yaz
    } catch {
      toast.error('Cari eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Patron / Cari — Kime yazılsın?"
      size="md"
      footer={
        <button onClick={onClose} className="btn-secondary">
          Vazgeç
        </button>
      }
    >
      <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        İşlenecek tutar: <b className="tabular-nums">{formatTL(amount)}</b> — seçilen kişinin
        <b> carisine borç</b> olarak yazılır (ciroya girmez).
      </div>

      <div className="grid max-h-[45vh] gap-2 overflow-y-auto">
        {active.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            Henüz cari yok. Aşağıdan ekleyin.
          </p>
        )}
        {active.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            disabled={busy}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50 active:scale-[0.99] disabled:opacity-50"
          >
            <span className="flex items-center gap-2 font-medium text-slate-900">
              <User size={18} className="text-slate-400" /> {c.ad}
            </span>
            <span className="text-sm tabular-nums text-slate-500">
              Bakiye: <b className={Number(c.bakiye) > 0 ? 'text-rose-600' : 'text-slate-700'}>{formatTL(c.bakiye || 0)}</b>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Yeni cari adı (ör. Ali Bey)"
          className="input"
        />
        <button onClick={handleAdd} disabled={busy} className="btn-primary whitespace-nowrap disabled:opacity-50">
          <Plus size={16} /> Ekle & Yaz
        </button>
      </div>
    </Modal>
  );
}
