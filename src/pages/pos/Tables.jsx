import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users as UsersIcon, Clock, AlertCircle } from 'lucide-react';
import { watchCollection, orderBy, where } from '../../firebase/firestore';
import { formatTL, minutesSince } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/ui/Modal';

const ZONES = [
  { id: 'all', label: 'Tümü' },
  { id: 'ic', label: 'İç Mekan' },
  { id: 'dis', label: 'Dış Mekan' },
  { id: 'teras', label: 'Teras' },
];

export default function PosTables() {
  const navigate = useNavigate();
  const { rol } = useAuthStore();
  const [tables, setTables] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [zone, setZone] = useState('all');
  const [selectedTable, setSelectedTable] = useState(null);

  useEffect(() => watchCollection('tables', setTables, orderBy('siraNo', 'asc')), []);
  useEffect(
    () =>
      watchCollection(
        'orders',
        setActiveOrders,
        where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']),
      ),
    [],
  );

  const ordersByTable = useMemo(() => {
    const map = {};
    for (const o of activeOrders) {
      if (o.masaId) map[o.masaId] = o;
    }
    return map;
  }, [activeOrders]);

  const filtered = zone === 'all' ? tables : tables.filter((t) => t.zone === zone);

  const counts = {
    bos: tables.filter((t) => t.durum === 'bos').length,
    dolu: tables.filter((t) => t.durum === 'dolu').length,
    rezerve: tables.filter((t) => t.durum === 'rezerve').length,
  };

  const handleTableClick = (table) => {
    if (table.durum === 'bos') {
      navigate(`/pos/order/new?masaId=${table.id}`);
    } else if (table.durum === 'dolu') {
      setSelectedTable({ ...table, order: ordersByTable[table.id] });
    } else if (table.durum === 'rezerve') {
      if (confirm(`${table.ad} rezerve. Rezervasyonu açıp sipariş almak istiyor musunuz?`)) {
        navigate(`/pos/order/new?masaId=${table.id}`);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex gap-1">
          {ZONES.map((z) => (
            <button
              key={z.id}
              onClick={() => setZone(z.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                zone === z.id ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
            Boş: <strong>{counts.bos}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500"></span>
            Dolu: <strong>{counts.dolu}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-500"></span>
            Rezerve: <strong>{counts.rezerve}</strong>
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <AlertCircle size={40} />
            <p>Bu bölgede masa yok.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((t) => (
              <TableCard
                key={t.id}
                table={t}
                order={ordersByTable[t.id]}
                onClick={() => handleTableClick(t)}
              />
            ))}
          </div>
        )}
      </div>

      <FullTableModal
        open={!!selectedTable}
        onClose={() => setSelectedTable(null)}
        table={selectedTable}
        rol={rol}
        navigate={navigate}
      />
    </div>
  );
}

function TableCard({ table, order, onClick }) {
  const colors = {
    bos: 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600',
    dolu: 'bg-red-500 hover:bg-red-600 border-red-600',
    rezerve: 'bg-amber-500 hover:bg-amber-600 border-amber-600',
  };
  const mins = order?.olusturmaZamani ? minutesSince(order.olusturmaZamani) : null;

  return (
    <button
      onClick={onClick}
      className={`flex aspect-square flex-col items-center justify-between rounded-xl border-2 p-3 text-white shadow-md transition active:scale-95 ${colors[table.durum]}`}
    >
      <div className="flex w-full justify-between text-xs">
        <span className="flex items-center gap-1">
          <UsersIcon size={12} />
          {table.kapasite}
        </span>
        {mins != null && (
          <span className={`flex items-center gap-1 ${mins > 15 ? 'font-bold' : ''}`}>
            <Clock size={12} />
            {mins}dk
          </span>
        )}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold leading-tight">{table.ad}</span>
        {order && <span className="mt-1 text-sm font-semibold">{formatTL(order.toplam)}</span>}
      </div>
      <span className="w-full truncate text-xs opacity-90">
        {order ? order.garsonAd : table.durum === 'rezerve' ? 'Rezerve' : 'Boş'}
      </span>
    </button>
  );
}

function FullTableModal({ open, onClose, table, rol, navigate }) {
  if (!open || !table) return null;
  const order = table.order;
  const canPay = ['kasiyer', 'admin'].includes(rol);

  return (
    <Modal open={open} onClose={onClose} title={table.ad} size="lg">
      {!order ? (
        <p className="py-8 text-center text-slate-500">Bu masada aktif sipariş bulunamadı.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-slate-500">Garson</p>
              <p className="font-semibold text-slate-900">{order.garsonAd}</p>
            </div>
            <div>
              <p className="text-slate-500">Süre</p>
              <p className="font-semibold text-slate-900">
                {minutesSince(order.olusturmaZamani)} dk
              </p>
            </div>
            <div>
              <p className="text-slate-500">Durum</p>
              <p className="font-semibold text-slate-900">{order.durum}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
              Sipariş İçeriği
            </div>
            <ul className="divide-y divide-slate-100">
              {order.items.map((it, idx) => (
                <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                  <span>
                    <strong>{it.adet}×</strong> {it.ad}
                    {it.notlar && <em className="ml-2 text-xs text-slate-500">({it.notlar})</em>}
                  </span>
                  <span className="font-semibold">{formatTL(it.fiyat * it.adet)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <span className="text-slate-500">Toplam: </span>
              <span className="text-lg font-bold text-slate-900">{formatTL(order.toplam)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                navigate(`/pos/order/new?masaId=${table.id}&orderId=${order.id}`);
              }}
              className="btn-primary"
            >
              <Plus size={16} /> Sipariş Ekle
            </button>
            {canPay && (
              <button
                onClick={() => {
                  onClose();
                  navigate(`/pos/payment?orderId=${order.id}`);
                }}
                className="btn-secondary"
              >
                Ödeme Al
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
