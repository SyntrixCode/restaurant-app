import { useEffect, useMemo, useState } from 'react';
import { Users, Wallet, Printer, ClipboardList } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { watchCollection, where } from '../../firebase/firestore';
import { formatTL } from '../../utils/format';
import { toKurus, fromKurus } from '../../utils/paymentMath';
import { exportExcel } from '../../utils/excelExport';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StaffReport() {
  const [gun, setGun] = useState(todayISO());
  const [archived, setArchived] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    const unsubA = watchCollection('archivedOrders', setArchived, where('gun', '==', gun));
    const unsubP = watchCollection('payments', setPayments, where('gun', '==', gun));
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
