import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Users as UsersIcon,
  Truck,
  Receipt,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { watchCollection, where, orderBy } from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, minutesSince, formatAdet } from '../../utils/format';

export default function ActiveOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
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
    let list = orders;
    if (rol === 'garson') list = list.filter((o) => o.garsonId === user?.uid);
    return list;
  }, [orders, rol, user]);

  const masaOrders = visible.filter((o) => !o.paketMi);
  const paketOrders = visible.filter((o) => o.paketMi);

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Açık Siparişler
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            {visible.length}
          </span>
        </h2>
        <p className="text-xs text-slate-500">
          {rol === 'garson' ? 'Sadece sizin siparişleriniz' : 'Tüm açık siparişler'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Receipt size={40} />
            <p>Açık sipariş yok.</p>
          </div>
        ) : (
          <>
            {masaOrders.length > 0 && (
              <Section title="Masa Siparişleri" count={masaOrders.length}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {masaOrders.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      gecikmeEsigi={gecikmeEsigi}
                      onPay={() =>
                        ['kasiyer', 'admin'].includes(rol) &&
                        navigate(`/pos/payment?orderId=${o.id}`)
                      }
                      canPay={['kasiyer', 'admin'].includes(rol)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {paketOrders.length > 0 && (
              <Section title="Paket Siparişleri" count={paketOrders.length} icon={Truck}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paketOrders.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      gecikmeEsigi={gecikmeEsigi}
                      onPay={() =>
                        ['kasiyer', 'admin'].includes(rol) &&
                        navigate(`/pos/payment?orderId=${o.id}`)
                      }
                      canPay={['kasiyer', 'admin'].includes(rol)}
                      paket
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, icon: Icon, children }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {Icon && <Icon size={14} />}
        <span>{title}</span>
        <span className="rounded-full bg-slate-200 px-1.5 text-slate-700">{count}</span>
      </div>
      {children}
    </div>
  );
}

function OrderCard({ order, gecikmeEsigi, onPay, canPay, paket }) {
  const mins = minutesSince(order.olusturmaZamani);
  const late = mins > gecikmeEsigi;
  const yolda = order.durum === 'masayaGitti';

  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 shadow-sm ${
        late ? 'border-red-500' : yolda ? 'border-purple-400' : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-slate-900">
            {order.masaAd || 'Paket'}
          </h3>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span>{order.garsonAd}</span>
            {order.kisiSayisi != null && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700">
                <UsersIcon size={10} /> {order.kisiSayisi}
              </span>
            )}
            {yolda && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700">
                <Truck size={10} /> Yolda
              </span>
            )}
            <span>· #{order.id.slice(0, 6)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${late ? 'text-red-600' : 'text-slate-700'}`}>
            {late && <AlertTriangle size={14} className="mr-1 inline" />}
            <Clock size={12} className="mr-1 inline" />
            {mins} dk
          </p>
          <p className="text-base font-bold text-slate-900">{formatTL(order.toplam)}</p>
        </div>
      </div>

      <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto text-sm">
        {order.items.map((it, idx) => (
          <li key={idx} className="flex justify-between text-slate-700">
            <span>
              <strong>{formatAdet(it.adet)}×</strong> {it.ad}
              {it.notlar && <em className="ml-1 text-xs text-slate-400">({it.notlar})</em>}
            </span>
          </li>
        ))}
      </ul>

      {paket && order.musteriAdres && (
        <p className="mb-2 line-clamp-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          📍 {order.musteriAdres}
        </p>
      )}

      {canPay && (
        <button onClick={onPay} className="btn-primary w-full text-sm">
          Ödeme Al
        </button>
      )}
    </div>
  );
}
