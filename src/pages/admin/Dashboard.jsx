import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Grid3x3, Clock, CheckCircle2, AlertTriangle, PackageX } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import UpdateBanner from '../../components/UpdateBanner';
import { watchCollection, where } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';

export default function Dashboard() {
  const [activeOrders, setActiveOrders] = useState([]);
  const [todayPayments, setTodayPayments] = useState([]);
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const { settings } = useSettingsStore();

  useEffect(() => {
    const today = new Date();
    const gun = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const unsubOrders = watchCollection('orders', setActiveOrders, where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']));
    const unsubPayments = watchCollection('payments', setTodayPayments, where('gun', '==', gun));
    const unsubTables = watchCollection('tables', setTables);
    const unsubProducts = watchCollection('products', setProducts);

    return () => {
      unsubOrders();
      unsubPayments();
      unsubTables();
      unsubProducts();
    };
  }, []);

  const dailySales = todayPayments.reduce((sum, p) => sum + (p.tutar || 0), 0);
  const fullTables = tables.filter((t) => t.durum === 'dolu').length;
  const pendingOrders = activeOrders.length;
  const completedToday = todayPayments.length;

  // Stok uyarısı — sadece stok takipli ürünler (mutfak ürünleri hariç)
  const globalEsik = settings?.dusukStokEsigi || 5;
  const trackedProducts = products.filter((p) => p.stokTakipli !== false && p.aktif);
  const outOfStock = trackedProducts.filter((p) => (p.stok ?? 0) <= 0);
  const lowStock = trackedProducts.filter((p) => {
    const esik = p.dusukStokEsigi ?? globalEsik;
    return (p.stok ?? 0) > 0 && (p.stok ?? 0) <= esik;
  });

  // Saatlik ciro — bugünkü ödemeleri saate göre grupla
  const hourlyData = useMemo(() => {
    const buckets = {};
    for (const p of todayPayments) {
      const ts = p.zaman?.toDate ? p.zaman.toDate() : p.zaman ? new Date(p.zaman) : null;
      if (!ts) continue;
      const h = ts.getHours();
      buckets[h] = (buckets[h] || 0) + (p.tutar || 0);
    }
    const hours = Object.keys(buckets).map(Number);
    if (hours.length === 0) return [];
    const min = Math.min(...hours);
    const max = Math.max(...hours);
    const out = [];
    for (let h = min; h <= max; h++) {
      out.push({ saat: `${String(h).padStart(2, '0')}:00`, ciro: Math.round(buckets[h] || 0) });
    }
    return out;
  }, [todayPayments]);

  return (
    <div className="p-8">
      <UpdateBanner />
      <PageHeader title="Dashboard" subtitle="Günlük operasyon özeti" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Günlük Satış" value={formatTL(dailySales)} color="green" icon={CheckCircle2} />
        <StatCard label="Aktif Masa" value={fullTables} color="red" icon={Grid3x3} />
        <StatCard label="Bekleyen Sipariş" value={pendingOrders} color="amber" icon={Clock} />
        <StatCard label="Tamamlanan Sipariş" value={completedToday} color="blue" icon={ShoppingCart} />
      </div>

      {/* Saatlik ciro grafiği */}
      <div className="mt-8 card">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Saatlik Ciro (Bugün)</h3>
        {hourlyData.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Bugün henüz satış yok.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="saat" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} width={48} tickFormatter={(v) => `${v}₺`} />
                <Tooltip
                  formatter={(v) => [formatTL(v), 'Ciro']}
                  labelFormatter={(l) => `Saat: ${l}`}
                />
                <Bar dataKey="ciro" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Son Aktif Siparişler</h3>
          {activeOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Aktif sipariş yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activeOrders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{o.masaAd || 'Paket'}</p>
                    <p className="text-xs text-slate-500">{o.garsonAd}</p>
                  </div>
                  <span className="font-semibold text-slate-900">{formatTL(o.toplam)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Stok Durumu</h3>
            <Link to="/admin/stock" className="text-xs font-medium text-blue-600 hover:underline">
              Stok yönetimi →
            </Link>
          </div>

          {outOfStock.length === 0 && lowStock.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 size={16} />
              <span>Tüm stoklar yeterli düzeyde.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {outOfStock.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                    <PackageX size={16} /> Tükendi ({outOfStock.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {outOfStock.slice(0, 12).map((p) => (
                      <span key={p.id} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {p.ad}
                      </span>
                    ))}
                    {outOfStock.length > 12 && (
                      <span className="text-xs text-red-600">+{outOfStock.length - 12} daha</span>
                    )}
                  </div>
                </div>
              )}
              {lowStock.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <AlertTriangle size={16} /> Düşük Stok ({lowStock.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lowStock.slice(0, 12).map((p) => (
                      <span key={p.id} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {p.ad} ({p.stok})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
