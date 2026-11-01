import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText, Download, Calculator } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { fetchAll, where, orderBy } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import { toKurus, fromKurus } from '../../utils/paymentMath';
import { exportExcel, exportCSV } from '../../utils/excelExport';
import { excludeTest } from '../../utils/testAccount';

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStart() {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function Accounting() {
  const { settings } = useSettingsStore();
  const [bas, setBas] = useState(monthStart());
  const [bit, setBit] = useState(isoDay(new Date()));
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const vergiOrani = Number(settings.vergiOrani) || 0;
  const kdvDahil = settings.kdvDahilFiyat !== false;

  // toplamdan KDV ve matrah hesabı (kuruş)
  const splitVat = (toplamK) => {
    if (vergiOrani <= 0) return { matrahK: toplamK, kdvK: 0 };
    if (kdvDahil) {
      const kdvK = Math.round((toplamK * vergiOrani) / (100 + vergiOrani));
      return { matrahK: toplamK - kdvK, kdvK };
    }
    const kdvK = Math.round((toplamK * vergiOrani) / 100);
    return { matrahK: toplamK, kdvK };
  };

  const handleFetch = async () => {
    if (bas > bit) {
      toast.error('Başlangıç tarihi bitişten sonra olamaz');
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchAll(
        'payments',
        where('gun', '>=', bas),
        where('gun', '<=', bit),
        orderBy('gun', 'asc'),
      );
      setPayments(excludeTest(rows));
      setLoaded(true);
      if (rows.length === 0) toast('Bu aralıkta ödeme yok', { icon: 'ℹ️' });
    } catch (err) {
      toast.error('Veri çekilemedi: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Güne göre özet (KDV kırılımlı)
  const daily = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const gun = p.gun || '—';
      if (!map.has(gun)) map.set(gun, { gun, nakitK: 0, kartK: 0, yemekK: 0, toplamK: 0 });
      const r = map.get(gun);
      const k = toKurus(p.tutar || 0);
      r.toplamK += k;
      if (p.yontem === 'kart') r.kartK += k;
      else if (p.yontem === 'yemekKarti') r.yemekK += k;
      else r.nakitK += k;
    }
    return [...map.values()]
      .sort((a, b) => a.gun.localeCompare(b.gun))
      .map((r) => {
        const { matrahK, kdvK } = splitVat(r.toplamK);
        return { ...r, matrahK, kdvK };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, vergiOrani, kdvDahil]);

  const toplam = useMemo(
    () =>
      daily.reduce(
        (acc, r) => ({
          toplamK: acc.toplamK + r.toplamK,
          matrahK: acc.matrahK + r.matrahK,
          kdvK: acc.kdvK + r.kdvK,
        }),
        { toplamK: 0, matrahK: 0, kdvK: 0 },
      ),
    [daily],
  );

  const buildRows = () =>
    daily.map((r) => ({
      Tarih: r.gun,
      Nakit: fromKurus(r.nakitK),
      Kart: fromKurus(r.kartK),
      'Yemek Karti': fromKurus(r.yemekK),
      'KDV Matrahi': fromKurus(r.matrahK),
      [`KDV (%${vergiOrani})`]: fromKurus(r.kdvK),
      Toplam: fromKurus(r.toplamK),
    }));

  const handleExcel = () => {
    if (daily.length === 0) return;
    exportExcel(`muhasebe-${bas}_${bit}`, [{ name: 'Gunluk Satis', rows: buildRows() }]);
  };

  const handleCSV = () => {
    if (daily.length === 0) return;
    exportCSV(buildRows(), `muhasebe-${bas}_${bit}`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Muhasebe Aktarımı"
        subtitle="Logo / Mikro vb. için günlük satış + KDV dökümü (Excel / CSV)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={bas} onChange={(e) => setBas(e.target.value)} className="input min-w-0 flex-1 sm:max-w-[150px] sm:flex-none" />
            <span className="text-slate-400">—</span>
            <input type="date" value={bit} onChange={(e) => setBit(e.target.value)} className="input min-w-0 flex-1 sm:max-w-[150px] sm:flex-none" />
            <button onClick={handleFetch} disabled={loading} className="btn-primary w-full disabled:opacity-50 sm:w-auto">
              <Download size={16} /> {loading ? 'Getiriliyor...' : 'Getir'}
            </button>
          </div>
        }
      />

      {loaded && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-4 md:grid-cols-3">
            <StatCard label="KDV Matrahı" value={formatTL(fromKurus(toplam.matrahK))} icon={Calculator} />
            <StatCard label={`KDV (%${vergiOrani})`} value={formatTL(fromKurus(toplam.kdvK))} color="amber" />
            <div className="col-span-2 md:col-span-1">
              <StatCard label="Toplam Ciro" value={formatTL(fromKurus(toplam.toplamK))} color="green" />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={handleExcel} disabled={daily.length === 0} className="btn-secondary disabled:opacity-50">
              <FileSpreadsheet size={16} /> Excel (.xlsx)
            </button>
            <button onClick={handleCSV} disabled={daily.length === 0} className="btn-secondary disabled:opacity-50">
              <FileText size={16} /> CSV
            </button>
          </div>

          {/* Telefon: gün kartları */}
          <div className="space-y-2 sm:hidden">
            {daily.length === 0 ? (
              <div className="card py-8 text-center text-sm text-slate-500">Bu aralıkta kayıt yok.</div>
            ) : (
              daily.map((r) => (
                <div key={r.gun} className="card p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{r.gun}</span>
                    <span className="text-base font-semibold tabular-nums">{formatTL(fromKurus(r.toplamK))}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <div className="flex justify-between gap-2"><dt>Nakit</dt><dd className="tabular-nums">{formatTL(fromKurus(r.nakitK))}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Kart</dt><dd className="tabular-nums">{formatTL(fromKurus(r.kartK))}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Yemek K.</dt><dd className="tabular-nums">{formatTL(fromKurus(r.yemekK))}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Matrah</dt><dd className="tabular-nums">{formatTL(fromKurus(r.matrahK))}</dd></div>
                    <div className="col-span-2 flex justify-between gap-2 text-amber-700"><dt>KDV</dt><dd className="tabular-nums">{formatTL(fromKurus(r.kdvK))}</dd></div>
                  </dl>
                </div>
              ))
            )}
          </div>

          <div className="card hidden overflow-hidden p-0 sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Tarih</th>
                  <th className="px-3 py-3 text-right">Nakit</th>
                  <th className="px-3 py-3 text-right">Kart</th>
                  <th className="px-3 py-3 text-right">Yemek K.</th>
                  <th className="px-3 py-3 text-right">Matrah</th>
                  <th className="px-3 py-3 text-right">KDV</th>
                  <th className="px-3 py-3 text-right">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {daily.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-500">
                      Bu aralıkta kayıt yok.
                    </td>
                  </tr>
                ) : (
                  daily.map((r) => (
                    <tr key={r.gun} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.gun}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTL(fromKurus(r.nakitK))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTL(fromKurus(r.kartK))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTL(fromKurus(r.yemekK))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTL(fromKurus(r.matrahK))}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatTL(fromKurus(r.kdvK))}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatTL(fromKurus(r.toplamK))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Not: KDV ayarlardaki orana (%{vergiOrani}, {kdvDahil ? 'dahil' : 'hariç'}) göre hesaplanır.
            Sütunlar muhasebe yazılımınızın import şablonuna göre eşlenebilir.
          </p>
        </>
      )}

      {!loaded && (
        <div className="card text-center text-sm text-slate-500">
          Tarih aralığı seçip <strong>Getir</strong>'e basın.
        </div>
      )}
    </div>
  );
}
