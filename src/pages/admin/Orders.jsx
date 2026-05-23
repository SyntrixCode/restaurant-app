import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  Clock,
  ChefHat,
  Truck,
  AlertTriangle,
  Search,
  X,
  Users as UsersIcon,
  Trash2,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, where, orderBy, removeDoc } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, formatDate, minutesSince, formatAdet } from '../../utils/format';

const TABS = [
  { id: 'aktif', label: 'Aktif', icon: Clock, color: 'text-amber-700 bg-amber-50' },
  { id: 'hazirlandi', label: 'Hazırlandı', icon: ChefHat, color: 'text-blue-700 bg-blue-50' },
  { id: 'masayaGitti', label: 'Masaya Gitti', icon: Truck, color: 'text-emerald-700 bg-emerald-50' },
];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('aktif');
  const [search, setSearch] = useState('');
  const [filterGarson, setFilterGarson] = useState('all');
  const [detail, setDetail] = useState(null);
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

  const counts = {
    aktif: orders.filter((o) => o.durum === 'aktif').length,
    hazirlandi: orders.filter((o) => o.durum === 'hazirlandi').length,
    masayaGitti: orders.filter((o) => o.durum === 'masayaGitti').length,
  };

  const garsonlar = useMemo(() => {
    const set = new Set();
    orders.forEach((o) => o.garsonAd && set.add(o.garsonAd));
    return [...set];
  }, [orders]);

  const visible = useMemo(() => {
    let list = orders.filter((o) => o.durum === tab);
    if (filterGarson !== 'all') {
      list = list.filter((o) => o.garsonAd === filterGarson);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.masaAd?.toLowerCase().includes(q) ||
          o.garsonAd?.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [orders, tab, filterGarson, search]);

  const totalActive = orders.reduce((s, o) => s + (o.toplam || 0), 0);
  const lateCount = orders.filter(
    (o) => o.durum !== 'masayaGitti' && minutesSince(o.olusturmaZamani) > gecikmeEsigi,
  ).length;

  const handleCancel = async (order) => {
    if (
      !confirm(
        `${order.masaAd || 'Paket'} siparişi iptal edilsin mi?\n\nBu işlem geri alınamaz. Stok geri eklenmez.`,
      )
    )
      return;
    try {
      await removeDoc('orders', order.id);
      toast.success('Sipariş iptal edildi');
      setDetail(null);
    } catch (err) {
      console.error(err);
      toast.error('İptal edilemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader title="Sipariş Yönetimi" subtitle="Aktif siparişler ve durum takibi" />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Aktif Tutar" value={formatTL(totalActive)} color="blue" />
        <StatCard label="Bekleyen" value={counts.aktif} color="amber" icon={Clock} />
        <StatCard label="Hazırlandı" value={counts.hazirlandi} color="blue" icon={ChefHat} />
        <StatCard
          label="Gecikmeli"
          value={lateCount}
          color={lateCount > 0 ? 'red' : 'green'}
          icon={AlertTriangle}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  tab === t.id ? 'bg-blue-100 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
                <span className="rounded-full bg-slate-200 px-1.5 text-xs">{counts[t.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={filterGarson}
            onChange={(e) => setFilterGarson(e.target.value)}
            className="input max-w-xs"
          >
            <option value="all">Tüm Garsonlar</option>
            {garsonlar.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Masa, garson, no ara..."
              className="input max-w-xs pl-8"
            />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {visible.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <ShoppingCart size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Bu durumda sipariş yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((o) => {
              const mins = minutesSince(o.olusturmaZamani);
              const late = mins > gecikmeEsigi && o.durum !== 'masayaGitti';
              return (
                <li
                  key={o.id}
                  onClick={() => setDetail(o)}
                  className={`grid cursor-pointer grid-cols-12 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                    late ? 'border-l-4 border-red-500' : ''
                  }`}
                >
                  <div className="col-span-3">
                    <p className="font-semibold text-slate-900">{o.masaAd || 'Paket'}</p>
                    <p className="text-xs text-slate-500">#{o.id.slice(0, 6)}</p>
                  </div>
                  <div className="col-span-2 text-sm">
                    <p className="text-slate-900">{o.garsonAd}</p>
                    {o.kisiSayisi != null && (
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <UsersIcon size={10} /> {o.kisiSayisi} kişi
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-slate-700">
                    {o.items?.length || 0} ürün
                  </div>
                  <div className="col-span-2 text-sm">
                    <p className={`font-semibold ${late ? 'text-red-600' : 'text-slate-700'}`}>
                      {late && <AlertTriangle size={12} className="mr-1 inline" />}
                      {mins} dk
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(o.olusturmaZamani, 'HH:mm')}</p>
                  </div>
                  <div className="col-span-2 text-right text-sm font-bold text-slate-900">
                    {formatTL(o.toplam)}
                  </div>
                  <div className="col-span-1 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        TABS.find((t) => t.id === o.durum)?.color
                      }`}
                    >
                      {TABS.find((t) => t.id === o.durum)?.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <OrderDetailModal
        open={!!detail}
        order={detail}
        onClose={() => setDetail(null)}
        onCancel={() => detail && handleCancel(detail)}
      />
    </div>
  );
}

function OrderDetailModal({ open, order, onClose, onCancel }) {
  if (!open || !order) return null;
  const mins = minutesSince(order.olusturmaZamani);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${order.masaAd || 'Paket'} — Sipariş Detayı`}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Kapat
          </button>
          <button onClick={onCancel} className="btn-danger">
            <Trash2 size={14} /> Siparişi İptal Et
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <Info label="Garson" value={order.garsonAd} />
          <Info label="Kişi" value={order.kisiSayisi != null ? order.kisiSayisi : '—'} />
          <Info label="Süre" value={`${mins} dk`} />
          <Info label="Durum" value={order.durum} />
        </div>

        <div className="rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
            Sipariş İçeriği
          </div>
          <ul className="divide-y divide-slate-100">
            {order.items?.map((it, idx) => (
              <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                <span>
                  <strong>{formatAdet(it.adet)}×</strong> {it.ad}
                  {it.notlar && (
                    <em className="ml-2 text-xs text-slate-500">({it.notlar})</em>
                  )}
                </span>
                <span className="font-semibold">{formatTL(it.fiyat * it.adet)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <span className="text-slate-500">Ara Toplam: </span>
            <span className="mr-3">{formatTL(order.araToplam)}</span>
            {order.indirim > 0 && (
              <>
                <span className="text-slate-500">İndirim: </span>
                <span className="mr-3 text-red-600">-{formatTL(order.indirim)}</span>
              </>
            )}
            <span className="text-slate-500">Toplam: </span>
            <span className="text-lg font-bold text-slate-900">{formatTL(order.toplam)}</span>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          <p>Sipariş No: #{order.id.slice(0, 8).toUpperCase()}</p>
          <p>Açılış: {formatDate(order.olusturmaZamani)}</p>
          {order.hazirlandiZamani && (
            <p>Hazırlandı: {formatDate(order.hazirlandiZamani)}</p>
          )}
          {order.masayaGittiZamani && (
            <p>Masaya Gitti: {formatDate(order.masayaGittiZamani)}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}
