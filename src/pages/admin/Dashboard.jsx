import { useEffect, useState } from 'react';
import { ShoppingCart, Grid3x3, Clock, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import UpdateBanner from '../../components/UpdateBanner';
import { watchCollection, where } from '../../firebase/firestore';
import { formatTL } from '../../utils/format';

export default function Dashboard() {
  const [activeOrders, setActiveOrders] = useState([]);
  const [todayPayments, setTodayPayments] = useState([]);
  const [tables, setTables] = useState([]);

  useEffect(() => {
    const today = new Date();
    const gun = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const unsubOrders = watchCollection('orders', setActiveOrders, where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']));
    const unsubPayments = watchCollection('payments', setTodayPayments, where('gun', '==', gun));
    const unsubTables = watchCollection('tables', setTables);

    return () => {
      unsubOrders();
      unsubPayments();
      unsubTables();
    };
  }, []);

  const dailySales = todayPayments.reduce((sum, p) => sum + (p.tutar || 0), 0);
  const fullTables = tables.filter((t) => t.durum === 'dolu').length;
  const pendingOrders = activeOrders.length;
  const completedToday = todayPayments.length;

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
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Bilgi</h3>
          <p className="text-sm text-slate-600">
            Bu dashboard veriyi Firestore'dan canlı dinler. İlk kurulumdan sonra siparişler oluşturuldukça
            kartlar ve listeler otomatik dolar.
          </p>
        </div>
      </div>
    </div>
  );
}
