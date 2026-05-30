import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Sparkles, X, Download, Loader2, ShieldAlert, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useUpdateAvailable } from '../hooks/useUpdateAvailable';
import { startApkDownload } from '../services/appUpdate';
import {
  isAppUpdaterNative,
  canInstallUnknownSources,
  openInstallSourcesSetting,
  downloadAndInstall,
} from '../plugins/appUpdater';

/**
 * Yeni sürüm uyarı banner'ı. Dashboard ve POS Layout'ta üstte gösterilir.
 * Tek tık → indirme → Android "Yükle?" diyalogu. Ayarlara yönlendirmez.
 *
 * Tarayıcı/web ortamında "İndir" tarayıcıyı açar (fallback).
 * Native (APK) ortamda doğrudan in-place indirme + install intent.
 */
export default function UpdateBanner({ to = '/admin/settings' }) {
  const { info, dismissed, dismiss } = useUpdateAvailable();
  const isNative = Capacitor.isNativePlatform();

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  if (!info?.hasUpdate || dismissed) return null;
  const v = info.latest?.version || '';

  const handleDownload = async () => {
    if (!info.latest?.apkUrl) return;

    if (isNative && isAppUpdaterNative()) {
      const allowed = await canInstallUnknownSources();
      if (!allowed) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      setDownloading(true);
      setProgress(0);
      try {
        await downloadAndInstall(info.latest.apkUrl, (p) =>
          setProgress(Math.round(p.percent || 0)),
        );
      } catch (err) {
        toast.error(err?.message || 'İndirme başarısız');
      } finally {
        setDownloading(false);
      }
      return;
    }

    // Web fallback — tarayıcı
    try {
      startApkDownload(info.latest.apkUrl);
      toast.success('İndirme tarayıcıdan başladı', { duration: 5000 });
    } catch (err) {
      toast.error('İndirme başlatılamadı');
    }
  };

  const handleGrant = async () => {
    try {
      await openInstallSourcesSetting();
      toast('İzin verdikten sonra geri dönüp "İndir & Güncelle" tıklayın', {
        icon: 'ℹ️',
        duration: 6000,
      });
    } catch {
      toast.error('Ayar ekranı açılamadı');
    }
  };

  // İzin uyarısı görünümü
  if (permissionDenied) {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <ShieldAlert size={18} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-amber-900">Yükleme izni gerekli</p>
          <p className="text-xs text-amber-700">
            Android, bu uygulamanın APK yüklemesi için bir kerelik izin ister.
          </p>
        </div>
        <button
          onClick={handleGrant}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          İzin Aç
        </button>
        <button onClick={() => setPermissionDenied(false)} className="rounded-lg p-1.5 text-amber-700 hover:bg-amber-100">
          <X size={16} />
        </button>
      </div>
    );
  }

  // İndirme görünümü
  if (downloading) {
    return (
      <div className="mb-3 rounded-xl border border-blue-300 bg-blue-50 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-blue-900">
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> İndiriliyor… ({v})
          </span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-blue-700">
          Bitince Android "Yükle?" diyalogu çıkacak — Tamam'a basın.
        </p>
      </div>
    );
  }

  // Normal banner
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-emerald-100 p-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
        <Sparkles size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-900">
          Yeni sürüm hazır
          <span className="ml-2 font-mono text-xs font-normal text-emerald-700">{v}</span>
        </p>
        <p className="truncate text-xs text-emerald-700">
          {info.latest?.body
            ? info.latest.body.split('\n')[0].slice(0, 100)
            : 'Tek tıkla güncellenebilir.'}
        </p>
      </div>

      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
      >
        <Download size={14} /> İndir & Güncelle
      </button>

      <Link
        to={to}
        title="Ayrıntılar"
        className="hidden rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-200 md:inline-flex"
      >
        <ArrowRight size={14} />
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
