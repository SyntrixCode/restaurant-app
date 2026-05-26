import { Link } from 'react-router-dom';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useUpdateAvailable } from '../hooks/useUpdateAvailable';

/**
 * Yeni sürüm uyarı banner'ı — yeşil, dashboard'ın üstünde gösterilir.
 * Kullanıcı X'e basarsa o sürüm için bir daha gösterilmez (localStorage).
 */
export default function UpdateBanner({ to = '/admin/settings' }) {
  const { info, dismissed, dismiss } = useUpdateAvailable();

  if (!info?.hasUpdate || dismissed) return null;
  const v = info.latest?.version || '';

  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-emerald-100 p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
        <Sparkles size={20} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-900">
          Yeni sürüm hazır
          <span className="ml-2 font-mono text-xs font-normal text-emerald-700">{v}</span>
        </p>
        <p className="truncate text-xs text-emerald-700">
          {info.latest?.body
            ? info.latest.body.split('\n')[0].slice(0, 100)
            : 'Yazılım Güncelle ekranından şimdi yükleyebilirsin.'}
        </p>
      </div>

      <Link
        to={to}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
      >
        Şimdi Güncelle <ArrowRight size={14} />
      </Link>

      <button
        onClick={dismiss}
        title="Bu sürüm için gizle"
        className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-200"
      >
        <X size={16} />
      </button>
    </div>
  );
}
