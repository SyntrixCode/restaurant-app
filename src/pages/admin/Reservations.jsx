import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarClock,
  Phone,
  User,
  Users as UsersIcon,
  Trash2,
  Search,
  Check,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { watchCollection, orderBy } from '../../firebase/firestore';
import { cancelReservation, completeReservation } from '../../firebase/reservations';

const TABS = [
  { id: 'aktif', label: 'Aktif' },
  { id: 'tamamlandi', label: 'Tamamlanan' },
  { id: 'iptal', label: 'İptal' },
];

function tarihSaatKey(r) {
  return `${r.tarih}T${r.saat}`;
}

export default function AdminReservations() {
  const [reservations, setReservations] = useState([]);
  const [tab, setTab] = useState('aktif');
  const [search, setSearch] = useState('');

  useEffect(
    () => watchCollection('reservations', setReservations, orderBy('createdAt', 'desc')),
    [],
  );

  const counts = {
    aktif: reservations.filter((r) => r.durum === 'aktif').length,
    tamamlandi: reservations.filter((r) => r.durum === 'tamamlandi').length,
    iptal: reservations.filter((r) => r.durum === 'iptal').length,
  };

  const filtered = useMemo(() => {
    let list = reservations.filter((r) => r.durum === tab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.musteriAd?.toLowerCase().includes(q) ||
          r.musteriTel?.toLowerCase().includes(q) ||
          r.masaAd?.toLowerCase().includes(q),
      );
    }
    if (tab === 'aktif') list.sort((a, b) => tarihSaatKey(a).localeCompare(tarihSaatKey(b)));
    return list;
  }, [reservations, tab, search]);

  const handleCancel = async (r) => {
    if (!confirm(`${r.musteriAd} (${r.tarih} ${r.saat}) rezervasyonu iptal edilsin mi?`)) return;
    try {
      await cancelReservation({ reservationId: r.id });
      toast.success('Rezervasyon iptal edildi');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'İptal edilemedi');
    }
  };

  const handleComplete = async (r) => {
    try {
      await completeReservation({ reservationId: r.id });
      toast.success('Tamamlandı olarak işaretlendi');
    } catch (err) {
      console.error(err);
      toast.error('Güncellenemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Rezervasyonlar"
        subtitle="Aktif ve geçmiş rezervasyonları yönet"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Aktif" value={counts.aktif} icon={CalendarClock} color="amber" />
        <StatCard label="Tamamlanan" value={counts.tamamlandi} color="green" />
        <StatCard label="İptal" value={counts.iptal} color="red" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm transition ${
                tab === t.id
                  ? 'bg-blue-100 font-medium text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-70">({counts[t.id]})</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad, tel veya masa ara..."
            className="input max-w-xs pl-8"
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <CalendarClock size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Bu kategoride rezervasyon yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <li key={r.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="col-span-3">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <User size={14} className="text-slate-400" />
                    {r.musteriAd}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <Phone size={11} />
                    {r.musteriTel}
                  </div>
                </div>
                <div className="col-span-2 text-sm">
                  <p className="font-semibold text-slate-900">{r.tarih}</p>
                  <p className="text-xs text-slate-500">{r.saat}</p>
                </div>
                <div className="col-span-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {r.masaAd}
                  </span>
                </div>
                <div className="col-span-1 flex items-center gap-1 text-sm text-slate-700">
                  <UsersIcon size={12} />
                  {r.kisiSayisi}
                </div>
                <div className="col-span-2 text-xs text-slate-500 truncate">
                  {r.notlar || '—'}
                </div>
                <div className="col-span-2 flex justify-end gap-1">
                  {r.durum === 'aktif' && (
                    <>
                      <button
                        onClick={() => handleComplete(r)}
                        className="btn-ghost px-2 py-1 text-emerald-600 hover:bg-emerald-50"
                        title="Tamamlandı"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => handleCancel(r)}
                        className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50"
                        title="İptal Et"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
