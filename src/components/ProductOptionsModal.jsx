import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';

/**
 * Garson ürünü sepete eklerken çıkan opsiyon seçim modal'ı.
 * Birden fazla seçilebilir (ör: hem "acılı" hem "soğansız").
 * Seçilenler virgülle birleştirilip item.notlar alanına yazılır.
 *
 * @param {{
 *   open: boolean,
 *   product: { ad: string, opsiyonlar?: string[] } | null,
 *   onClose: () => void,
 *   onConfirm: (selectedJoined: string) => void,
 * }} props
 */
export default function ProductOptionsModal({ open, product, onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set());
  const [customNote, setCustomNote] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setCustomNote('');
    }
  }, [open]);

  if (!open || !product) return null;

  const options = product.opsiyonlar || [];

  const toggle = (opt) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    setSelected(next);
  };

  const handleConfirm = () => {
    const parts = [...selected];
    if (customNote.trim()) parts.push(customNote.trim());
    // (notlar string, selectedOptions array) — caller opsiyon→ürün eşleştirmesi yapabilsin diye
    onConfirm(parts.join(', '), [...selected]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-lg font-bold text-slate-900">{product.ad}</h3>
          <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-sm text-slate-600">
            Sipariş notları (birden fazla seçilebilir)
          </p>

          {options.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {options.map((opt) => {
                const isOn = selected.has(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-base font-semibold transition active:scale-95 ${
                      isOn
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt}</span>
                    {isOn && <Check size={18} className="text-blue-600" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Bu ürünün özel opsiyonu yok.</p>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Ekstra Not
            </label>
            <input
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Örn: az pişmiş, doğranmış…"
              className="input"
            />
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            İptal
          </button>
          <button
            onClick={() => onConfirm('', [])}
            className="btn-ghost flex-1"
            title="Not eklemeden ekle"
          >
            Notsuz Ekle
          </button>
          <button onClick={handleConfirm} className="btn-primary flex-[1.4]">
            <Check size={16} /> Sepete Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
