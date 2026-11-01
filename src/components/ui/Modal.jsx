import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  // Açıkken arka sayfanın kaymasını engelle (telefonda modal dışına kaydırma karışıklığı)
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  const sizeClasses = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  };
  // Telefonda alttan açılan tam genişlik sayfa (başparmakla ulaşılır); sm+ ortada klasik kutu.
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <div
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl ${sizeClasses[size]}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="min-w-0 break-words text-base font-semibold text-slate-900 sm:text-lg">{title}</h3>
          <button onClick={onClose} className="shrink-0 rounded p-2 hover:bg-slate-100" aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 [&>button]:flex-1 sm:[&>button]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
