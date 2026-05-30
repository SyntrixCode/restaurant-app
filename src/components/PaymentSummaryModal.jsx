import { CheckCircle2, Wallet, CreditCard, UtensilsCrossed, Gift, Receipt } from 'lucide-react';
import { formatTL } from '../utils/format';

const YONTEM_INFO = {
  nakit: {
    label: 'NAKİT',
    icon: Wallet,
    rowCls: 'border-emerald-200 bg-emerald-50',
    iconCls: 'text-emerald-600',
  },
  kart: {
    label: 'KART',
    icon: CreditCard,
    rowCls: 'border-blue-200 bg-blue-50',
    iconCls: 'text-blue-600',
  },
  yemekKarti: {
    label: 'YEMEK KARTI',
    icon: UtensilsCrossed,
    rowCls: 'border-amber-200 bg-amber-50',
    iconCls: 'text-amber-600',
  },
};

/**
 * Ödeme tamamlandı özet modal'ı — tüm parça ödemeler listelenir,
 * masa kapanır, kasiyer "Kapat" deyince ana ekrana döner.
 */
export default function PaymentSummaryModal({
  open,
  onClose,
  order,
  payments = [],
  ikramTotal = 0,
  discount = 0,
  change = 0,
}) {
  if (!open || !order) return null;

  const totalPaid = payments.reduce((s, p) => s + Number(p.tutar || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="bg-emerald-600 px-6 py-5 text-center text-white">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold">Ödeme Tamamlandı</h2>
          <p className="mt-1 text-sm text-emerald-100">
            {order.masaAd || 'Paket'} · {payments.length} parça ödeme alındı
          </p>
        </div>

        {/* Payment list */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Alınan Ödemeler
          </div>
          <ul className="space-y-2">
            {payments.map((p, idx) => {
              const info =
                YONTEM_INFO[p.yontem] || {
                  label: p.yontem,
                  icon: Receipt,
                  rowCls: 'border-slate-200 bg-slate-50',
                  iconCls: 'text-slate-600',
                };
              const Icon = info.icon;
              return (
                <li
                  key={idx}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${info.rowCls}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={18} className={info.iconCls} />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {info.label}
                        {p.kartTipi && (
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            ({p.kartTipi})
                          </span>
                        )}
                      </p>
                      {p.onayKodu && (
                        <p className="font-mono text-[10px] text-slate-500">
                          Onay: {p.onayKodu}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-slate-900">
                    {formatTL(p.tutar)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
            {ikramTotal > 0 && (
              <div className="flex items-center justify-between text-amber-700">
                <span className="flex items-center gap-1.5">
                  <Gift size={14} /> Toplam İkram
                </span>
                <span className="tabular-nums">{formatTL(ikramTotal)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>İndirim</span>
                <span className="tabular-nums">- {formatTL(discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Toplam Tahsil Edilen</span>
              <span className="tabular-nums">{formatTL(totalPaid)}</span>
            </div>
            {change > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>Para Üstü</span>
                <span className="tabular-nums">{formatTL(change)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-lg font-semibold text-white shadow transition hover:bg-emerald-700 active:scale-95"
          >
            Masalara Dön
          </button>
        </div>
      </div>
    </div>
  );
}
