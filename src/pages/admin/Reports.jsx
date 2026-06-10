import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users as UsersIcon,
  Receipt,
  Download,
  Calendar,
  ShoppingBag,
  Wallet,
  Gift,
  CreditCard,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { watchCollection, orderBy } from '../../firebase/firestore';
import { formatTL } from '../../utils/format';

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#84cc16',
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminReports() {
  const [archived, setArchived] = useState([]);
  const [payments, setPayments] = useState([]);
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayISO());

  useEffect(
    () => watchCollection('archivedOrders', setArchived, orderBy('tamamlandiZamani', 'desc')),
    [],
  );
  useEffect(() => watchCollection('payments', setPayments), []);

  const inRange = (gun) => gun >= from && gun <= to;
  const orders = useMemo(() => archived.filter((o) => inRange(o.gun || '')), [archived, from, to]);
  const filteredPayments = useMemo(() => payments.filter((p) => inRange(p.gun || '')), [payments, from, to]);

  // === KPI ===
  const totals = useMemo(() => {
    const sumToplam = orders.reduce((s, o) => s + (o.toplam || 0), 0);
    const sumKisi = orders.reduce((s, o) => s + (o.kisiSayisi || 0), 0);
    // Patron/ücretsiz kapatılan masalar — ciroya dahil değil (toplam=0), ayrı izlenir
    const sumPatron = orders.reduce(
      (s, o) => s + (o.patronMasasi ? Number(o.patronTutar || 0) : 0),
      0,
    );
    // Cariye (kişiye) yazılan — ciroya dahil değil, alacak olarak izlenir
    const sumCari = orders.reduce(
      (s, o) => s + (o.cariMasasi ? Number(o.cariTutar || 0) : 0),
      0,
    );
    const count = orders.length;
    return {
      ciro: sumToplam,
      siparis: count,
      ortalama: count > 0 ? sumToplam / count : 0,
      kisi: sumKisi,
      kisiBasi: sumKisi > 0 ? sumToplam / sumKisi : 0,
      patron: sumPatron,
      cari: sumCari,
    };
  }, [orders]);

  // === Saatlik satış (BarChart) ===
  const hourlySales = useMemo(() => {
    const buckets = {};
    for (let h = 0; h < 24; h++) buckets[h] = { saat: `${String(h).padStart(2, '0')}:00`, ciro: 0, siparis: 0 };
    orders.forEach((o) => {
      const ts = o.tamamlandiZamani?.toDate
        ? o.tamamlandiZamani.toDate()
        : new Date(o.tamamlandiZamani || 0);
      const h = ts.getHours();
      if (buckets[h]) {
        buckets[h].ciro += o.toplam || 0;
        buckets[h].siparis += 1;
      }
    });
    return Object.values(buckets);
  }, [orders]);

  // === Günlük ciro trendi (LineChart) ===
  const dailyTrend = useMemo(() => {
    const buckets = {};
    orders.forEach((o) => {
      const gun = o.gun || '';
      if (!gun) return;
      if (!buckets[gun]) buckets[gun] = { gun, ciro: 0, siparis: 0 };
      buckets[gun].ciro += o.toplam || 0;
      buckets[gun].siparis += 1;
    });
    return Object.values(buckets).sort((a, b) => a.gun.localeCompare(b.gun));
  }, [orders]);

  // === Garson performansı (top 8 BarChart) ===
  const waiterPerf = useMemo(() => {
    const buckets = {};
    orders.forEach((o) => {
      const ad = o.garsonAd || '—';
      if (!buckets[ad]) buckets[ad] = { ad, ciro: 0, siparis: 0 };
      buckets[ad].ciro += o.toplam || 0;
      buckets[ad].siparis += 1;
    });
    return Object.values(buckets).sort((a, b) => b.ciro - a.ciro).slice(0, 8);
  }, [orders]);

  // === Kategori dağılımı (PieChart) ===
  const categoryDist = useMemo(() => {
    const buckets = {};
    orders.forEach((o) => {
      (o.items || []).forEach((it) => {
        // archivedOrders items'ında categoryAd yok ama productId üzerinden çıkartmadık, just use ad
        // Burada categoryAd varsa o, yoksa ad'i grup yap
        const key = it.categoryAd || it.ad || 'Diğer';
        const value = (it.fiyat || 0) * (it.adet || 0);
        if (!buckets[key]) buckets[key] = { name: key, value: 0 };
        buckets[key].value += value;
      });
    });
    return Object.values(buckets).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [orders]);

  // === Ödeme yöntemi dağılımı (PieChart) ===
  const paymentMethodDist = useMemo(() => {
    const buckets = {};
    filteredPayments.forEach((p) => {
      const key =
        p.yontem === 'nakit'
          ? 'Nakit'
          : p.yontem === 'kart'
            ? 'Kredi/Banka Kartı'
            : p.yontem === 'yemekKarti'
              ? 'Yemek Kartı'
              : p.yontem || 'Diğer';
      if (!buckets[key]) buckets[key] = { name: key, value: 0 };
      buckets[key].value += p.tutar || 0;
    });
    return Object.values(buckets);
  }, [filteredPayments]);

  // === Ürün performansı (top 10) ===
  const productPerf = useMemo(() => {
    const buckets = {};
    orders.forEach((o) => {
      (o.items || []).forEach((it) => {
        const key = it.ad || '—';
        if (!buckets[key]) buckets[key] = { ad: key, adet: 0, ciro: 0 };
        buckets[key].adet += it.adet || 0;
        buckets[key].ciro += (it.fiyat || 0) * (it.adet || 0);
      });
    });
    return Object.values(buckets).sort((a, b) => b.ciro - a.ciro).slice(0, 10);
  }, [orders]);

  // === Excel export ===
  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Özet
      const ozet = [
        ['Rapor Aralığı', `${from} → ${to}`],
        [],
        ['Toplam Ciro', totals.ciro],
        ['Sipariş Sayısı', totals.siparis],
        ['Ortalama Sepet', totals.ortalama],
        ['Toplam Kişi', totals.kisi],
        ['Kişi Başı Ortalama', totals.kisiBasi],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ozet), 'Özet');

      // Sheet 2: Günlük
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          dailyTrend.map((d) => ({ Gün: d.gun, Ciro: d.ciro, 'Sipariş Sayısı': d.siparis })),
        ),
        'Günlük',
      );

      // Sheet 3: Saatlik
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          hourlySales.map((h) => ({ Saat: h.saat, Ciro: h.ciro, 'Sipariş Sayısı': h.siparis })),
        ),
        'Saatlik',
      );

      // Sheet 4: Garsonlar
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          waiterPerf.map((w) => ({ Garson: w.ad, Ciro: w.ciro, 'Sipariş Sayısı': w.siparis })),
        ),
        'Garsonlar',
      );

      // Sheet 5: Ürünler
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          productPerf.map((p) => ({ Ürün: p.ad, 'Satış Adedi': p.adet, Ciro: p.ciro })),
        ),
        'Ürünler',
      );

      // Sheet 6: Ödeme
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          paymentMethodDist.map((p) => ({ Yöntem: p.name, Tutar: p.value })),
        ),
        'Ödeme Yöntemleri',
      );

      XLSX.writeFile(wb, `rapor_${from}_${to}.xlsx`);
      toast.success('Excel raporu indirildi');
    } catch (err) {
      console.error(err);
      toast.error('Excel oluşturulamadı');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Raporlar"
        subtitle="Satış analizleri ve performans grafikleri"
        actions={
          <button onClick={exportExcel} disabled={orders.length === 0} className="btn-primary disabled:opacity-50">
            <Download size={16} /> Excel İndir
          </button>
        }
      />

      {/* Tarih aralığı */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input max-w-[160px]"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input max-w-[160px]"
          />
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={() => { setFrom(todayISO()); setTo(todayISO()); }} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
            Bugün
          </button>
          <button onClick={() => { setFrom(daysAgo(7)); setTo(todayISO()); }} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
            Son 7 gün
          </button>
          <button onClick={() => { setFrom(daysAgo(30)); setTo(todayISO()); }} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
            Son 30 gün
          </button>
          <button onClick={() => { setFrom(daysAgo(90)); setTo(todayISO()); }} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
            Son 90 gün
          </button>
        </div>
      </div>

      {/* KPI'lar */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ciro" value={formatTL(totals.ciro)} color="green" icon={TrendingUp} />
        <StatCard label="Sipariş" value={totals.siparis} color="blue" icon={Receipt} />
        <StatCard label="Ortalama Sepet" value={formatTL(totals.ortalama)} color="amber" icon={ShoppingBag} />
        <StatCard label="Toplam Kişi" value={totals.kisi} color="blue" icon={UsersIcon} />
        <StatCard label="Kişi Başı" value={formatTL(totals.kisiBasi)} color="green" icon={Wallet} />
        <StatCard label="İkram / Patron" value={`- ${formatTL(totals.patron)}`} color="red" icon={Gift} />
        <StatCard label="Cari'ye yazılan" value={formatTL(totals.cari)} color="amber" icon={CreditCard} />
      </div>

      {orders.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <BarChart3 size={48} className="text-slate-300" />
          <p>Bu aralıkta veri yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Günlük trend */}
          <ChartCard title="Günlük Ciro Trendi">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="gun" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  formatter={(value, name) => [name === 'ciro' ? formatTL(value) : value, name === 'ciro' ? 'Ciro' : 'Sipariş']}
                />
                <Legend />
                <Line type="monotone" dataKey="ciro" stroke="#3b82f6" strokeWidth={2} name="Ciro (₺)" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Saatlik */}
          <ChartCard title="Saatlik Satış Dağılımı">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="saat" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(value) => formatTL(value)} />
                <Bar dataKey="ciro" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Garson performansı */}
          <ChartCard title="Garson Performansı (Top 8)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waiterPerf} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="ad" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(value) => formatTL(value)} />
                <Bar dataKey="ciro" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Kategori dağılımı */}
          <ChartCard title="Ürün/Kategori Dağılımı (Top 10)">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={categoryDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {categoryDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatTL(value)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Ödeme yöntemi */}
          <ChartCard title="Ödeme Yöntemi Dağılımı">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={paymentMethodDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {paymentMethodDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatTL(value)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Ürün tablosu (top 10) */}
          <div className="card">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              En Çok Satan Ürünler (Top 10)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 text-left">Ürün</th>
                    <th className="py-2 text-right">Adet</th>
                    <th className="py-2 text-right">Ciro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productPerf.map((p) => (
                    <tr key={p.ad}>
                      <td className="py-2 truncate">{p.ad}</td>
                      <td className="py-2 text-right">{p.adet}</td>
                      <td className="py-2 text-right font-semibold">{formatTL(p.ciro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  );
}
