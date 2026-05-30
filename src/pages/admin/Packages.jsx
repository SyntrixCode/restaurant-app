import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Truck,
  Phone,
  MapPin,
  User,
  Search,
  Clock,
  Package as PackageIcon,
  AlertTriangle,
  Trash2,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { recordPayment } from '../../firebase/payments';
import { useAuthStore } from '../../store/authStore';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, where, orderBy, removeDoc } from '../../firebase/firestore';
import { updateOrderStatus } from '../../firebase/orders';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, formatDate, minutesSince, formatAdet } from '../../utils/format';

const TABS = [
  { id: 'yeni', label: 'Yeni', icon: Clock, color: 'text-amber-700 bg-amber-50', durumlar: ['aktif', 'hazirlandi'] },
  { id: 'masayaGitti', label: 'Yolda', icon: Truck, color: 'text-purple-700 bg-purple-50', durumlar: ['masayaGitti'] },
];

const KAYNAK_LABELS = {
  manuel: 'Manuel',
  telefon: 'Telefon',
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
  migros: 'Migros',
  diger: 'Diğer',
};

const APP_KAYNAKLAR = ['yemeksepeti', 'getir', 'trendyol', 'migros'];

const KAYNAK_COLORS = {
  manuel: 'bg-slate-100 text-slate-700',
  telefon: 'bg-blue-100 text-blue-700',
  yemeksepeti: 'bg-red-100 text-red-700',
  getir: 'bg-purple-100 text-purple-700',
  trendyol: 'bg-orange-100 text-orange-700',
  migros: 'bg-emerald-100 text-emerald-700',
  diger: 'bg-slate-100 text-slate-700',
};

export default function AdminPackages() {
  const { user, profile } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('yeni');
  const [search, setSearch] = useState('');
  const [filterKaynak, setFilterKaynak] = useState('all');
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

  const packets = useMemo(() => orders.filter((o) => o.paketMi === true), [orders]);

  const counts = {
    yeni: packets.filter((o) => ['aktif', 'hazirlandi'].includes(o.durum)).length,
    masayaGitti: packets.filter((o) => o.durum === 'masayaGitti').length,
  };

  const visible = useMemo(() => {
    const activeTab = TABS.find((t) => t.id === tab);
    let list = packets.filter((o) => activeTab?.durumlar?.includes(o.durum));
    if (filterKaynak !== 'all') list = list.filter((o) => o.paketKaynak === filterKaynak);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.musteriAd?.toLowerCase().includes(q) ||
          o.musteriTel?.toLowerCase().includes(q) ||
          o.musteriAdres?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [packets, tab, filterKaynak, search]);

  const totalActive = packets.reduce((s, o) => s + (o.toplam || 0), 0);
  const lateCount = packets.filter(
    (o) => o.durum !== 'masayaGitti' && minutesSince(o.olusturmaZamani) > gecikmeEsigi,
  ).length;

  const handleStatusChange = async (order, newStatus) => {
    try {
      await updateOrderStatus(order.id, newStatus);
      const labels = { masayaGitti: 'Yola çıktı' };
      toast.success(labels[newStatus] || 'Durum güncellendi');
    } catch (err) {
      console.error(err);
      toast.error('Durum güncellenemedi');
    }
  };

  const handleAppPaid = async (order) => {
    const appLabel = KAYNAK_LABELS[order.paketKaynak] || 'Uygulama';
    if (!confirm(`${appLabel} üzerinden ödeme alındı olarak işaretlensin mi?\n\nSipariş arşivlenecek.`))
      return;
    try {
      await recordPayment({
        orderId: order.id,
        kasiyerId: user?.uid,
        kasiyerAd: profile?.ad || 'Admin',
        payments: [
          {
            tutar: order.toplam,
            yontem: 'uygulama',
            kartTipi: appLabel,
          },
        ],
        fisBasildi: false,
      });
      toast.success(`${appLabel} üzerinden ödendi olarak arşivlendi`);
      setDetail(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Arşivlenemedi');
    }
  };

  const handleCancel = async (order) => {
    if (!confirm(`${order.musteriAd} paketi iptal edilsin mi?\n\nGeri alınamaz.`)) return;
    try {
      await removeDoc('orders', order.id);
      toast.success('Paket iptal edildi');
      setDetail(null);
    } catch (err) {
      console.error(err);
      toast.error('İptal edilemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Paket Servis"
        subtitle="Telefon ve online paket siparişleri (Yemeksepeti/Getir webhook entegrasyonu Blaze planına geçişte eklenecek)"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Aktif Paketler" value={packets.length} color="blue" icon={PackageIcon} />
        <StatCard label="Aktif Tutar" value={formatTL(totalActive)} color="green" />
        <StatCard label="Yolda" value={counts.masayaGitti} color="amber" icon={Truck} />
        <StatCard
          label="Gecikmeli"
          value={lateCount}
          color={lateCount > 0 ? 'red' : 'green'}
          icon={AlertTriangle}
        />
      </div>

      {/* Filtreler */}
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
            value={filterKaynak}
            onChange={(e) => setFilterKaynak(e.target.value)}
            className="input max-w-xs"
          >
            <option value="all">Tüm Kaynaklar</option>
            {Object.entries(KAYNAK_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad / tel / adres ara..."
              className="input max-w-xs pl-8"
            />
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="card overflow-hidden p-0">
        {visible.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <Truck size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Bu durumda paket yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((o) => {
              const mins = minutesSince(o.olusturmaZamani);
              const late = mins > gecikmeEsigi && o.durum !== 'masayaGitti';
              return (
                <li
                  key={o.id}
                  className={`grid cursor-pointer grid-cols-12 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                    late ? 'border-l-4 border-red-500' : ''
                  }`}
                  onClick={() => setDetail(o)}
                >
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <User size={12} className="text-slate-400" />
                      <p className="font-semibold text-slate-900">{o.musteriAd || '—'}</p>
                    </div>
                    <p className="ml-5 flex items-center gap-1 text-xs text-slate-500">
                      <Phone size={10} />
                      {o.musteriTel || '—'}
                    </p>
                  </div>
                  <div className="col-span-3 text-xs text-slate-600">
                    <p className="line-clamp-2 flex gap-1">
                      <MapPin size={11} className="mt-0.5 shrink-0 text-slate-400" />
                      <span>{o.musteriAdres || '—'}</span>
                    </p>
                  </div>
                  <div className="col-span-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        KAYNAK_COLORS[o.paketKaynak] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {KAYNAK_LABELS[o.paketKaynak] || o.paketKaynak || '—'}
                    </span>
                  </div>
                  <div className="col-span-1 text-sm text-slate-700">{o.items?.length || 0} ürün</div>
                  <div className="col-span-1 text-sm">
                    <p className={`font-semibold ${late ? 'text-red-600' : 'text-slate-700'}`}>
                      {mins} dk
                    </p>
                  </div>
                  <div className="col-span-2 text-right text-sm font-bold text-slate-900">
                    {formatTL(o.toplam)}
                  </div>
                  <div className="col-span-1 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {['aktif', 'hazirlandi'].includes(o.durum) && (
                      <button
                        onClick={() => handleStatusChange(o, 'masayaGitti')}
                        className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
                        title="Yola çıkar"
                      >
                        <Truck size={12} />
                      </button>
                    )}
                    {o.durum === 'masayaGitti' && APP_KAYNAKLAR.includes(o.paketKaynak) && (
                      <button
                        onClick={() => handleAppPaid(o)}
                        className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
                        title={`${KAYNAK_LABELS[o.paketKaynak]} ile ödendi`}
                      >
                        <Smartphone size={12} />
                      </button>
                    )}
                    {o.durum === 'masayaGitti' && !APP_KAYNAKLAR.includes(o.paketKaynak) && (
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                        Yolda
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PackageDetail
        open={!!detail}
        order={detail}
        onClose={() => setDetail(null)}
        onCancel={() => detail && handleCancel(detail)}
        onStatusChange={(s) => detail && handleStatusChange(detail, s)}
        onAppPaid={() => detail && handleAppPaid(detail)}
      />
    </div>
  );
}

function PackageDetail({ open, order, onClose, onCancel, onStatusChange, onAppPaid }) {
  if (!open || !order) return null;
  const mins = minutesSince(order.olusturmaZamani);
  const yolda = order.durum === 'masayaGitti';
  const appOrder = APP_KAYNAKLAR.includes(order.paketKaynak);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Paket — ${order.musteriAd || '—'}`}
      size="lg"
      footer={
        <>
          <button onClick={onCancel} className="btn-danger">
            <Trash2 size={14} /> İptal Et
          </button>
          <button onClick={onClose} className="btn-secondary">
            Kapat
          </button>
          {!yolda && (
            <button onClick={() => onStatusChange('masayaGitti')} className="btn-primary">
              <Truck size={14} /> Yola Çıkar
            </button>
          )}
          {yolda && appOrder && (
            <button onClick={onAppPaid} className="btn-primary">
              <Smartphone size={14} /> {KAYNAK_LABELS[order.paketKaynak]} ile Ödendi
            </button>
          )}
          {yolda && !appOrder && (
            <span className="rounded-lg bg-purple-100 px-3 py-1.5 text-sm font-medium text-purple-700">
              Yolda · POS'tan ödeme alın
            </span>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <User size={14} className="text-amber-700" />
              <span className="font-semibold">{order.musteriAd}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-amber-700" />
              <a href={`tel:${order.musteriTel}`} className="font-semibold text-amber-900 hover:underline">
                {order.musteriTel}
              </a>
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2">
            <MapPin size={14} className="mt-0.5 text-amber-700" />
            <span>{order.musteriAdres}</span>
          </div>
          {order.notlar && (
            <p className="mt-2 italic text-amber-800">Not: {order.notlar}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <Info label="Kaynak" value={KAYNAK_LABELS[order.paketKaynak] || order.paketKaynak || '—'} />
          <Info label="Süre" value={`${mins} dk`} />
          <Info label="Personel" value={order.garsonAd || '—'} />
        </div>

        <div className="rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
            Sipariş İçeriği
          </div>
          <ul className="divide-y divide-slate-100">
            {(order.items || []).map((it, idx) => (
              <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                <span>
                  <strong>{formatAdet(it.adet)}×</strong> {it.ad}
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

        <p className="text-xs text-slate-400">
          #{order.id.slice(0, 8).toUpperCase()} · {formatDate(order.olusturmaZamani)}
        </p>
      </div>
    </Modal>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900 truncate">{value}</p>
    </div>
  );
}
