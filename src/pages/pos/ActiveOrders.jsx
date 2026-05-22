import { useEffect, useMemo, useState } from 'react';
import { Clock, ChefHat, Truck, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { watchCollection, where, orderBy } from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, minutesSince } from '../../utils/format';
import { updateOrderStatus } from '../../firebase/orders';

const TABS = [
  { id: 'aktif', label: 'Bekleyen', icon: Clock },
  { id: 'hazirlandi', label: 'Hazırlandı', icon: ChefHat },
  { id: 'masayaGitti', label: 'Masaya Gitti', icon: Truck },
];

export default function ActiveOrders() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('aktif');
  const { user, rol } = useAuthStore();
  const { settings } = useSettingsStore();
  const gecikmeEsigi = settings.gecikmeEsigiDk || 15;

  useEffect(
    () =>
      watchCollection(
        'orders',
        setOrders,
        where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']),
        orderBy('olusturmaZamani', 'desc'),
      ),
    [],
  );

  const visible = useMemo(() => {
    let list = orders.filter((o) => o.durum === tab);
    if (rol === 'garson') list = list.filter((o) => o.garsonId === user?.uid);
    return list;
  }, [orders, tab, rol, user]);

  const counts = {
    aktif: orders.filter((o) => o.durum === 'aktif').length,
    hazirlandi: orders.filter((o) => o.durum === 'hazirlandi').length,
    masayaGitti: orders.filter((o) => o.durum === 'masayaGitti').length,
  };

  const handleStatusChange = async (order, newStatus) => {
    try {
      await updateOrderStatus(order.id, newStatus);
      toast.success(
        newStatus === 'hazirlandi'
          ? 'Sipariş hazırlandı olarak işaretlendi'
          : 'Masaya gitti olarak işaretlendi',
      );
    } catch (err) {
      toast.error('Durum güncellenemedi');
      console.error(err);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  tab === t.id ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={16} />
                <span>{t.label}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-slate-500">Bu kategoride sipariş yok.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((o) => {
              const mins = minutesSince(o.olusturmaZamani);
              const late = mins > gecikmeEsigi && o.durum !== 'masayaGitti';
              return (
                <div
                  key={o.id}
                  className={`rounded-xl border-2 bg-white p-4 shadow-sm ${
                    late ? 'border-red-500' : 'border-slate-200'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {o.masaAd || 'Paket'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {o.garsonAd} · #{o.id.slice(0, 6)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${late ? 'text-red-600' : 'text-slate-700'}`}>
                        {late && <AlertTriangle size={14} className="mr-1 inline" />}
                        {mins} dk
                      </p>
                      <p className="text-base font-bold text-slate-900">{formatTL(o.toplam)}</p>
                    </div>
                  </div>

                  <ul className="mb-3 max-h-32 overflow-y-auto space-y-1 text-sm">
                    {o.items.map((it, idx) => (
                      <li key={idx} className="flex justify-between text-slate-700">
                        <span>
                          <strong>{it.adet}×</strong> {it.ad}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="grid grid-cols-2 gap-2">
                    {o.durum === 'aktif' && (
                      <button
                        onClick={() => handleStatusChange(o, 'hazirlandi')}
                        className="btn-secondary col-span-2 text-sm"
                      >
                        <ChefHat size={14} /> Hazırlandı
                      </button>
                    )}
                    {o.durum === 'hazirlandi' && (
                      <button
                        onClick={() => handleStatusChange(o, 'masayaGitti')}
                        className="btn-primary col-span-2 text-sm"
                      >
                        <Truck size={14} /> Masaya Gitti
                      </button>
                    )}
                    {o.durum === 'masayaGitti' && (
                      <span className="col-span-2 rounded-lg bg-emerald-100 py-2 text-center text-sm font-medium text-emerald-700">
                        Servis edildi · Ödeme bekleniyor
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
