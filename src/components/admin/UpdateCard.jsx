import { useEffect, useState } from 'react';
import { Download, RefreshCw, Check, CircleAlert, Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { APP_VERSION, APP_BUILD_DATE } from '../../version';
import { checkForUpdate, startApkDownload } from '../../services/appUpdate';

export default function UpdateCard() {
  const isNative = Capacitor.isNativePlatform();
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState(null); // { hasUpdate, current, latest }
  const [lastChecked, setLastChecked] = useState(null);

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

  // Sayfa açılınca otomatik kontrol et
  useEffect(() => {
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    if (!info?.latest?.apkUrl) return;
    if (!isNative) {
      toast('Tarayıcıdan APK indirme önerilmez. Tabletten girip indirin.', { icon: 'ℹ️' });
    }
    try {
      startApkDownload(info.latest.apkUrl);
      toast.success('İndirme başladı. Tamamlanınca bildirimden tıklayıp yükleyin.', { duration: 6000 });
    } catch (err) {
      toast.error('İndirme başlatılamadı');
      console.error(err);
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

        {info?.hasUpdate && (
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
            <button
              onClick={handleDownload}
              className="btn-primary w-full"
            >
              <Download size={16} /> APK İndir &amp; Yükle
            </button>
            <p className="mt-2 text-xs text-emerald-700">
              İndirme bitince Android bildirim çubuğundan dosyaya tıklayın → "Yükle" diyerek güncelleyin.
              Verileriniz korunur.
            </p>
          </div>
        )}

        {info && !info.hasUpdate && info.latest && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <Check size={16} className="text-emerald-600" />
            <span>En güncel sürümü kullanıyorsunuz</span>
          </div>
        )}

        {info && !info.latest && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              GitHub'dan release bilgisi alınamadı. İnternet bağlantınızı kontrol edin
              veya birkaç dakika sonra tekrar deneyin.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            {lastChecked
              ? `Son kontrol: ${lastChecked.toLocaleTimeString('tr-TR')}`
              : 'Kontrol ediliyor…'}
          </p>
          <button
            onClick={runCheck}
            disabled={checking}
            className="btn-ghost text-xs"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            Tekrar Kontrol
          </button>
        </div>

        {!isNative && (
          <p className="text-xs text-slate-400">
            ℹ️ Bu özellik tablette (APK kurulduğunda) tam çalışır.
            Tarayıcıdan açıkken "kontrol" çalışır, "indirme" yalnızca Android'de işe yarar.
          </p>
        )}
      </div>
    </div>
  );
}
