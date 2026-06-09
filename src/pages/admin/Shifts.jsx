import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, Trash2, Printer, ClipboardList } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { watchCollection, where, removeDoc, patchDoc } from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/format';
import { exportExcel } from '../../utils/excelExport';
import { isMesaiMuafiYet } from '../../components/ShiftButton';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sureLabel(dk) {
  if (dk == null) return '—';
  const h = Math.floor(dk / 60);
  const m = dk % 60;
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`;
}

export default function Shifts() {
  const { rol } = useAuthStore();
  const isAdmin = rol === 'admin';
  const [gun, setGun] = useState(todayISO());
  const [rawShifts, setRawShifts] = useState([]);
  // Açık mesailerin canlı geçen süresi için dakikada bir tick
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(
    () => watchCollection('shifts', setRawShifts, where('gun', '==', gun)),
    [gun],
  );

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Test/demo hesaplarını (Syntrix*) raporda gösterme
  const shifts = useMemo(
    () => rawShifts.filter((s) => !isMesaiMuafiYet(s.personelAd)),
    [rawShifts],
  );

  // Açık mesai için canlı geçen dk, kapalı için kaydedilmiş sureDk
  const effectiveDk = (s) => {
    if (!s.acik) return s.sureDk;
    const giris = s.giris?.toDate ? s.giris.toDate() : new Date(s.giris);
    if (!giris || isNaN(giris.getTime())) return 0;
    return Math.max(0, Math.round((nowMs - giris.getTime()) / 60000));
  };

  const sorted = useMemo(
    () =>
      [...shifts].sort((a, b) => {
        const ta = a.giris?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.giris?.toDate?.()?.getTime?.() ?? 0;
        return ta - tb;
      }),
    [shifts],
  );

  // Personel bazlı toplam süre — açık mesailer için canlı geçen dakika dahil
  const totals = useMemo(() => {
    const map = new Map();
    for (const s of shifts) {
      const id = s.personelId || 'bilinmiyor';
      const ad = s.personelAd || 'Bilinmiyor';
      if (!map.has(id)) map.set(id, { id, ad, toplamDk: 0, acik: 0 });
      const r = map.get(id);
      if (s.acik) r.acik += 1;
      r.toplamDk += effectiveDk(s) || 0;
    }
    return [...map.values()].sort((a, b) => b.toplamDk - a.toplamDk);
  }, [shifts, nowMs]);

  const handleClose = async (s) => {
    const giris = s.giris?.toDate ? s.giris.toDate() : new Date(s.giris);
    const sureDk = Math.max(0, Math.round((Date.now() - giris.getTime()) / 60000));
    try {
      await patchDoc('shifts', s.id, { cikis: new Date(), sureDk, acik: false });
      toast.success('Mesai kapatıldı');
    } catch {
      toast.error('İşlem başarısız');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu mesai kaydı silinsin mi?')) return;
    try {
      await removeDoc('shifts', id);
      toast.success('Silindi');
    } catch {
      toast.error('Silinemedi');
    }
  };

  const handleExport = () => {
    exportExcel(`mesai-${gun}`, [
      {
        name: 'Mesailer',
        rows: sorted.map((s) => ({
          Personel: s.personelAd,
          Rol: s.rol || '',
          Giriş: s.giris ? formatDate(s.giris, 'HH:mm') : '',
          Çıkış: s.cikis ? formatDate(s.cikis, 'HH:mm') : 'Açık',
          'Süre (dk)': s.sureDk ?? '',
        })),
      },
      {
        name: 'Toplam',
        rows: totals.map((t) => ({
          Personel: t.ad,
          'Toplam Süre (dk)': t.toplamDk,
          'Açık Mesai': t.acik,
        })),
      },
    ]);
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Personel Mesai Takibi"
        subtitle="Günlük giriş / çıkış kayıtları ve toplam çalışma süresi"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <input
              type="date"
              value={gun}
              onChange={(e) => setGun(e.target.value)}
              className="input max-w-[160px]"
            />
            <button onClick={handleExport} className="btn-secondary">
              <ClipboardList size={16} /> Excel
            </button>
            <button onClick={() => window.print()} className="btn-secondary">
              <Printer size={16} /> Yazdır
            </button>
          </div>
        }
      />

      <div id="mesai-rapor" className="space-y-6">
        {/* Toplam süre özeti */}
        {totals.length > 0 && (
          <div className="card">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock size={18} /> Günlük Toplam
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {totals.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="truncate font-medium text-slate-900">{t.ad}</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-600">{sureLabel(t.toplamDk)}</p>
                  {t.acik > 0 && <p className="text-xs text-amber-600">{t.acik} açık mesai</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detay */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Mesai Kayıtları — {gun}</h3>
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Bu güne ait mesai kaydı yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Personel</th>
                  <th className="py-2">Rol</th>
                  <th className="py-2 text-right">Giriş</th>
                  <th className="py-2 text-right">Çıkış</th>
                  <th className="py-2 text-right">Süre</th>
                  <th className="py-2 text-right print:hidden">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{s.personelAd}</td>
                    <td className="py-2 text-slate-600">{s.rol || '-'}</td>
                    <td className="py-2 text-right tabular-nums">{s.giris ? formatDate(s.giris, 'HH:mm') : '-'}</td>
                    <td className="py-2 text-right tabular-nums">
                      {s.acik ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Açık
                        </span>
                      ) : s.cikis ? (
                        formatDate(s.cikis, 'HH:mm')
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${s.acik ? 'text-amber-700' : ''}`}>{sureLabel(effectiveDk(s))}</td>
                    <td className="py-2 text-right print:hidden">
                      <div className="flex justify-end gap-1">
                        {s.acik && (
                          <button
                            onClick={() => handleClose(s)}
                            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                          >
                            Kapat
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="rounded-md p-1 text-red-500 hover:bg-red-50"
                            title="Sil"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #mesai-rapor, #mesai-rapor * { visibility: visible; }
          #mesai-rapor { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
