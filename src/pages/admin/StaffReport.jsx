import { useEffect, useMemo, useState } from 'react';
import { Users, Wallet, Printer, ClipboardList, Truck } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { watchCollection, where } from '../../firebase/firestore';
import { formatTL } from '../../utils/format';
import { toKurus, fromKurus } from '../../utils/paymentMath';
import { exportExcel } from '../../utils/excelExport';
import { excludeTest } from '../../utils/testAccount';

// Firestore Timestamp veya Date → millisaniye
function tsToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const t = new Date(ts).getTime();
  return isNaN(t) ? null : t;
}

function fmtDuration(secs) {
  if (secs == null || isNaN(secs) || secs < 0) return '-';
  const dk = Math.floor(secs / 60);
  const sn = Math.round(secs % 60);
  if (dk === 0) return `${sn} sn`;
  return `${dk} dk ${String(sn).padStart(2, '0')} sn`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StaffReport() {
  const [gun, setGun] = useState(todayISO());
  const [archived, setArchived] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    const unsubA = watchCollection('archivedOrders', (l) => setArchived(excludeTest(l)), where('gun', '==', gun));
    const unsubP = watchCollection('payments', (l) => setPayments(excludeTest(l)), where('gun', '==', gun));
    return () => {
      unsubA();
      unsubP();
    };
  }, [gun]);

  // Garson bazlı: arşivlenen (iptal olmayan) siparişlerden
  const garsonRows = useMemo(() => {
    const map = new Map();
    for (const o of archived) {
      if (o.iptal?.edildi) continue;
      const id = o.garsonId || 'bilinmiyor';
      const ad = o.garsonAd || 'Bilinmiyor';
      if (!map.has(id)) map.set(id, { id, ad, siparis: 0, kisi: 0, ciroK: 0 });
      const r = map.get(id);
      r.siparis += 1;
      r.kisi += o.kisiSayisi || 0;
      r.ciroK += toKurus(o.toplam || 0);
    }
    return [...map.values()]
      .map((r) => ({ ...r, ciro: fromKurus(r.ciroK) }))
      .sort((a, b) => b.ciroK - a.ciroK);
  }, [archived]);

  // Kurye bazlı: arşivlenen paket siparişlerinden (kuryeId atanmış olanlar)
  const kuryeRows = useMemo(() => {
    const map = new Map();
    for (const o of archived) {
      if (o.iptal?.edildi) continue;
      if (!o.kuryeId) continue; // sadece kurye atanmış paketler
      const id = o.kuryeId;
      const ad = o.kuryeAd || 'Bilinmiyor';
      if (!map.has(id)) {
        map.set(id, {
          id,
          ad,
          teslimat: 0,
          ciroK: 0,
          toplamSureSec: 0,
          olcumluSayisi: 0,
          enKisaSec: null,
          enUzunSec: null,
        });
      }
      const r = map.get(id);
      r.teslimat += 1;
      r.ciroK += toKurus(o.toplam || 0);
      // Teslim süresi: masayaGittiZamani → tamamlandiZamani
      const start = tsToMillis(o.masayaGittiZamani);
      const end = tsToMillis(o.tamamlandiZamani);
      if (start && end && end > start) {
        const sec = Math.round((end - start) / 1000);
        r.toplamSureSec += sec;
        r.olcumluSayisi += 1;
        r.enKisaSec = r.enKisaSec == null ? sec : Math.min(r.enKisaSec, sec);
        r.enUzunSec = r.enUzunSec == null ? sec : Math.max(r.enUzunSec, sec);
      }
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        ciro: fromKurus(r.ciroK),
        ortalamaSureSec: r.olcumluSayisi > 0 ? r.toplamSureSec / r.olcumluSayisi : null,
      }))
      .sort((a, b) => b.teslimat - a.teslimat);
  }, [archived]);

  // Kasiyer bazlı: ödemelerden
  const kasiyerRows = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const id = p.kasiyerId || 'bilinmiyor';
      const ad = p.kasiyerAd || 'Bilinmiyor';
      if (!map.has(id)) map.set(id, { id, ad, odeme: 0, tahsilatK: 0 });
      const r = map.get(id);
      r.odeme += 1;
      r.tahsilatK += toKurus(p.tutar || 0);
    }
    return [...map.values()]
      .map((r) => ({ ...r, tahsilat: fromKurus(r.tahsilatK) }))
      .sort((a, b) => b.tahsilatK - a.tahsilatK);
  }, [payments]);

  const toplamCiro = fromKurus(garsonRows.reduce((s, r) => s + r.ciroK, 0));
  const toplamTahsilat = fromKurus(kasiyerRows.reduce((s, r) => s + r.tahsilatK, 0));
  const toplamKuryeCiro = fromKurus(kuryeRows.reduce((s, r) => s + r.ciroK, 0));
  const toplamTeslimat = kuryeRows.reduce((s, r) => s + r.teslimat, 0);

  const handleExport = () => {
    exportExcel(`personel-raporu-${gun}`, [
      {
        name: 'Garsonlar',
        rows: garsonRows.map((r) => ({
          Garson: r.ad,
          'Sipariş Adedi': r.siparis,
          'Kişi Sayısı': r.kisi,
          Ciro: r.ciro,
        })),
      },
      {
        name: 'Kasiyerler',
        rows: kasiyerRows.map((r) => ({
          Kasiyer: r.ad,
          'Ödeme Adedi': r.odeme,
          Tahsilat: r.tahsilat,
        })),
      },
      {
        name: 'Kuryeler',
        rows: kuryeRows.map((r) => ({
          Kurye: r.ad,
          'Teslimat Adedi': r.teslimat,
          Ciro: r.ciro,
          'Ortalama Süre': fmtDuration(r.ortalamaSureSec),
          'En Kısa Teslim': fmtDuration(r.enKisaSec),
          'En Uzun Teslim': fmtDuration(r.enUzunSec),
        })),
      },
    ]);
  };

  const handlePrint = () => window.print();

  return (
    <div className="p-8">
      <PageHeader
        title="Personel Günlük Raporu"
        subtitle="Garson ve kasiyer bazlı günlük performans"
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
            <button onClick={handlePrint} className="btn-secondary">
              <Printer size={16} /> Yazdır
            </button>
          </div>
        }
      />

      <div id="personel-rapor" className="space-y-6">
        {/* Garsonlar */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Users size={18} /> Garsonlar
            </h3>
            <span className="text-sm text-slate-500">Toplam ciro: {formatTL(toplamCiro)}</span>
          </div>
          {garsonRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Bu güne ait sipariş yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Garson</th>
                  <th className="py-2 text-right">Sipariş</th>
                  <th className="py-2 text-right">Kişi</th>
                  <th className="py-2 text-right">Ciro</th>
                </tr>
              </thead>
              <tbody>
                {garsonRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{r.ad}</td>
                    <td className="py-2 text-right tabular-nums">{r.siparis}</td>
                    <td className="py-2 text-right tabular-nums">{r.kisi || '-'}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatTL(r.ciro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Kasiyerler */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Wallet size={18} /> Kasiyerler
            </h3>
            <span className="text-sm text-slate-500">Toplam tahsilat: {formatTL(toplamTahsilat)}</span>
          </div>
          {kasiyerRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Bu güne ait ödeme yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Kasiyer</th>
                  <th className="py-2 text-right">Ödeme Adedi</th>
                  <th className="py-2 text-right">Tahsilat</th>
                </tr>
              </thead>
              <tbody>
                {kasiyerRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{r.ad}</td>
                    <td className="py-2 text-right tabular-nums">{r.odeme}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatTL(r.tahsilat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Kuryeler */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Truck size={18} /> Kuryeler
            </h3>
            <span className="text-sm text-slate-500">
              {toplamTeslimat} teslimat · {formatTL(toplamKuryeCiro)}
            </span>
          </div>
          {kuryeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Bu güne ait teslimat yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Kurye</th>
                  <th className="py-2 text-right">Teslimat</th>
                  <th className="py-2 text-right">Ciro</th>
                  <th className="py-2 text-right" title="Yola çıkıştan teslime ortalama süre">
                    Ort. Süre
                  </th>
                  <th className="py-2 text-right">En Kısa</th>
                  <th className="py-2 text-right">En Uzun</th>
                </tr>
              </thead>
              <tbody>
                {kuryeRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{r.ad}</td>
                    <td className="py-2 text-right tabular-nums">{r.teslimat}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {formatTL(r.ciro)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-700">
                      {fmtDuration(r.ortalamaSureSec)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-emerald-700">
                      {fmtDuration(r.enKisaSec)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-700">
                      {fmtDuration(r.enUzunSec)}
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
          #personel-rapor, #personel-rapor * { visibility: visible; }
          #personel-rapor { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
