import { useEffect, useState } from 'react';
import { Download, RefreshCw, Check, CircleAlert, Smartphone, Loader2, ShieldAlert } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { APP_VERSION, APP_BUILD_DATE } from '../../version';
import { checkForUpdate, startApkDownload } from '../../services/appUpdate';
import {
  isAppUpdaterNative,
  canInstallUnknownSources,
  openInstallSourcesSetting,
  downloadAndInstall,
} from '../../plugins/appUpdater';
import { approveDistribution } from '../../firebase/distribution';
import { useAuthStore } from '../../store/authStore';

export default function UpdateCard() {
  const isNative = Capacitor.isNativePlatform();
  const { user, profile, rol } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState(null); // { hasUpdate, current, latest }
  const [lastChecked, setLastChecked] = useState(null);

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [installPermissionDenied, setInstallPermissionDenied] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = await checkForUpdate();
      setInfo(result);
      setLastChecked(new Date());
    } catch (err) {
      toast.error('Güncelleme kontrolü başarısız');
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async () => {
    if (!info?.latest?.apkUrl) return;

    // Admin onayı → settings/dagitim yazılır → diğer tabletlerin auto-update
    // hook'u (useAutoUpdate) bunu yakalayıp sessizce indirir/kurar.
    if (rol === 'admin') {
      approveDistribution({
        version: info.latest.version,
        apkUrl: info.latest.apkUrl,
        onaylayanId: user?.uid,
        onaylayanAd: profile?.ad || 'Admin',
      })
        .then(() => toast.success('Diğer cihazlara dağıtım onaylandı', { duration: 4000 }))
        .catch((e) => console.warn('Dağıtım yazılamadı:', e));
    }

    // Native ortamda otomatik indir + yükle
    if (isNative && isAppUpdaterNative()) {
      // Önce "Bilinmeyen kaynaklardan yüklemeye izin" kontrolü
      const allowed = await canInstallUnknownSources();
      if (!allowed) {
        setInstallPermissionDenied(true);
        return;
      }
      setInstallPermissionDenied(false);
      setDownloading(true);
      setProgress(0);
      try {
        await downloadAndInstall(info.latest.apkUrl, (p) => {
          setProgress(Math.round(p.percent || 0));
        });
        toast.success('APK indirildi — Android yükleme onayı isteyecek');
      } catch (err) {
        toast.error(err?.message || 'Güncelleme indirilemedi');
        console.error(err);
      } finally {
        setDownloading(false);
      }
      return;
    }

    // Web fallback — tarayıcıya yönlendir
    try {
      startApkDownload(info.latest.apkUrl);
      toast.success('İndirme başladı (tarayıcıda)', { duration: 5000 });
    } catch (err) {
      toast.error('İndirme başlatılamadı');
      console.error(err);
    }
  };

  const handleGrantPermission = async () => {
    try {
      await openInstallSourcesSetting();
      toast('İzni verdikten sonra geri dönüp "İndir" tuşuna tekrar basın', { icon: 'ℹ️', duration: 6000 });
    } catch (err) {
      toast.error('Ayar ekranı açılamadı');
    }
  };

  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        <Smartphone size={16} />
        <span>Yazılım Güncelle</span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Mevcut</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {APP_VERSION}
            </p>
            <p className="text-xs text-slate-500">{APP_BUILD_DATE}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Son Sürüm</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {checking ? '…' : info?.latest?.version || '—'}
            </p>
            <p className="text-xs text-slate-500">
              {info?.latest?.publishedAt
                ? new Date(info.latest.publishedAt).toLocaleString('tr-TR')
                : ''}
            </p>
          </div>
        </div>

        {/* İzin uyarısı */}
        {installPermissionDenied && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
              <ShieldAlert size={16} />
              <span>Yükleme izni gerekli</span>
            </div>
            <p className="mb-2 text-xs text-amber-700">
              Android, uygulamanın APK yükleyebilmesi için bir kerelik izin ister.
              Açılan ayar ekranında "Bu kaynağa izin ver" tuşunu açın, sonra geri dönüp tekrar deneyin.
            </p>
            <button onClick={handleGrantPermission} className="btn-primary w-full text-sm">
              <ShieldAlert size={14} /> İzin Ekranını Aç
            </button>
          </div>
        )}

        {/* İndirme progress */}
        {downloading && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-blue-800">
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> APK indiriliyor…
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
              İndirme bitince Android "Yükle?" diyalogu çıkacak — Tamam'a basın.
            </p>
          </div>
        )}

        {/* Güncelleme var */}
        {!downloading && info?.hasUpdate && !installPermissionDenied && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <Download size={16} />
              <span>Yeni sürüm hazır</span>
            </div>
            {info.latest.body && (
              <pre className="mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-white/60 p-2 text-xs text-slate-700">
                {info.latest.body.slice(0, 400)}
              </pre>
            )}
            <button onClick={handleDownload} className="btn-primary w-full">
              <Download size={16} />
              {isNative ? 'İndir & Güncelle' : 'Tarayıcıdan İndir'}
            </button>
          </div>
        )}

        {/* Güncel */}
        {info && !info.hasUpdate && info.latest && !downloading && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <Check size={16} className="text-emerald-600" />
            <span>En güncel sürümü kullanıyorsunuz</span>
          </div>
        )}

        {/* Release alınamadı */}
        {info && !info.latest && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              GitHub'dan release bilgisi alınamadı. İnternet bağlantınızı kontrol edin veya
              biraz sonra tekrar deneyin.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            {lastChecked
              ? `Son kontrol: ${lastChecked.toLocaleTimeString('tr-TR')}`
              : 'Kontrol ediliyor…'}
          </p>
          <button onClick={runCheck} disabled={checking || downloading} className="btn-ghost text-xs">
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            Tekrar Kontrol
          </button>
        </div>

        {!isNative && (
          <p className="text-xs text-slate-400">
            ℹ️ Otomatik APK yükleme yalnızca tablette çalışır. Tarayıcıdan indirip elden kurman gerekir.
          </p>
        )}
      </div>
    </div>
  );
}
