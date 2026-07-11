import { useEffect, useMemo, useState } from 'react';
import {
  Archive as ArchiveIcon,
  Search,
  Calendar,
  Users as UsersIcon,
  Download,
  Ban,
  Undo2,
  StickyNote,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, orderBy, patchDoc } from '../../firebase/firestore';
import { cancelArchivedOrder, uncancelArchivedOrder } from '../../firebase/orders';
import { useAuthStore } from '../../store/authStore';
import { exportArchivedOrders } from '../../utils/excelExport';
import { formatTL, formatDate, formatAdet } from '../../utils/format';
import { excludeTest } from '../../utils/testAccount';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminArchive() {
  const [archived, setArchived] = useState([]);
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(
    () =>
      watchCollection('archivedOrders', (l) => setArchived(excludeTest(l)), orderBy('tamamlandiZamani', 'desc')),
    [],
  );

  const filtered = useMemo(() => {
    let list = archived.filter((o) => {
      const gun = o.gun || '';
      return gun >= from && gun <= to;
    });
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
  }, [archived, from, to, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, o) => {
        const isCancelled = o.iptal?.edildi;
        acc.count += 1;
        if (isCancelled) {
          acc.iptalCount += 1;
          acc.iptalTutar += o.toplam || 0;
        } else {
          acc.toplam += o.toplam || 0;
          acc.kisi += o.kisiSayisi || 0;
        }
        return acc;
      },
      { count: 0, toplam: 0, kisi: 0, iptalCount: 0, iptalTutar: 0 },
    );
  }, [filtered]);

  const validCount = totals.count - totals.iptalCount;
  const ortalamaTutar = validCount > 0 ? totals.toplam / validCount : 0;

  const exportCSV = () => {
    const headers = ['Tarih', 'Saat', 'Masa', 'Garson', 'Kişi', 'Ürün Sayısı', 'Tutar', 'Ödeme', 'No'];
    const rows = filtered.map((o) => {
      const ts = o.tamamlandiZamani?.toDate
        ? o.tamamlandiZamani.toDate()
        : new Date(o.tamamlandiZamani || Date.now());
      return [
        ts.toLocaleDateString('tr-TR'),
        ts.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        o.masaAd || 'Paket',
        o.garsonAd || '',
        o.kisiSayisi || '',
        o.items?.length || 0,
        (o.toplam || 0).toFixed(2),
        (o.odemeYontemleri || []).join('+'),
        o.id.slice(0, 8).toUpperCase(),
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arsiv_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Arşivlenen Siparişler"
        subtitle="Tamamlanan siparişlerin geçmişi"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => exportArchivedOrders(filtered, `arsiv_${from}_${to}`)}
              disabled={filtered.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              <Download size={16} /> Excel İndir
            </button>
            <button
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className="btn-secondary disabled:opacity-50"
            >
              <Download size={16} /> CSV
            </button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Geçerli Sipariş" value={validCount} color="blue" icon={ArchiveIcon} />
        <StatCard label="Toplam Ciro" value={formatTL(totals.toplam)} color="green" />
        <StatCard label="Ortalama Tutar" value={formatTL(ortalamaTutar)} color="blue" />
        <StatCard
          label={totals.iptalCount > 0 ? `İptal Edilen (${totals.iptalCount})` : 'Toplam Kişi'}
          value={totals.iptalCount > 0 ? `- ${formatTL(totals.iptalTutar)}` : totals.kisi}
          color={totals.iptalCount > 0 ? 'red' : 'amber'}
          icon={totals.iptalCount > 0 ? Ban : UsersIcon}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <button
            onClick={() => {
              setFrom(todayISO());
              setTo(todayISO());
            }}
            className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200"
          >
            Bugün
          </button>
          <button
            onClick={() => {
              setFrom(daysAgo(7));
              setTo(todayISO());
            }}
            className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200"
          >
            Son 7 gün
          </button>
          <button
            onClick={() => {
              setFrom(daysAgo(30));
              setTo(todayISO());
            }}
            className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200"
          >
            Son 30 gün
          </button>
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Masa, garson, no..."
            className="input max-w-xs pl-8"
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <ArchiveIcon size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Bu aralıkta arşivlenen sipariş yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.slice(0, 200).map((o) => {
              const cancelled = o.iptal?.edildi;
              return (
                <li
                  key={o.id}
                  onClick={() => setDetail(o)}
                  className={`grid cursor-pointer grid-cols-12 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                    cancelled ? 'bg-red-50/40' : ''
                  }`}
                >
                  <div className="col-span-2 text-sm">
                    <p className={`font-semibold ${cancelled ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                      {o.masaAd || 'Paket'}
                    </p>
                    <p className="text-xs text-slate-500">
                      #{o.id.slice(0, 6)}
                      {o.not && <span title="Not var"> · 📝</span>}
                    </p>
                  </div>
                  <div className="col-span-2 text-sm text-slate-700">{o.garsonAd || '—'}</div>
                  <div className="col-span-1 text-sm text-slate-700">
                    {o.kisiSayisi != null ? `${o.kisiSayisi} kişi` : '—'}
                  </div>
                  <div className="col-span-2 text-sm text-slate-700">
                    {o.items?.length || 0} ürün
                  </div>
                  <div className="col-span-2 text-xs text-slate-500">
                    {formatDate(o.tamamlandiZamani)}
                  </div>
                  <div className="col-span-2 text-right">
                    <p className={`font-bold ${cancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {formatTL(o.toplam)}
                    </p>
                    <p className="text-[10px] uppercase text-slate-400">
                      {(o.odemeYontemleri || []).join(' + ')}
                    </p>
                  </div>
                  <div className="col-span-1 text-right">
                    {cancelled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                        <Ban size={9} /> İptal
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Tamamlandı
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > 200 && (
          <div className="border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-500">
            İlk 200 kayıt gösteriliyor. Daha eski kayıtlar için tarih filtresini daraltın.
          </div>
        )}
      </div>

      <ArchiveDetailModal open={!!detail} order={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ArchiveDetailModal({ open, order, onClose }) {
  const { user, profile, rol } = useAuthStore();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [not, setNot] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const isAdmin = rol === 'admin';

  // Başka sipariş açılınca not alanını o siparişin notuyla doldur
  useEffect(() => {
    setNot(order?.not || '');
  }, [order?.id]);

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      await patchDoc('archivedOrders', order.id, { not: not.trim() });
      toast.success('Not kaydedildi');
    } catch (err) {
      toast.error(err?.message || 'Not kaydedilemedi');
    } finally {
      setSavingNote(false);
    }
  };

  if (!open || !order) return null;

  const cancelled = order.iptal?.edildi;

  const handleConfirmCancel = async (sebep) => {
    setSubmitting(true);
    try {
      await cancelArchivedOrder({
        archivedId: order.id,
        sebep,
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      toast.success('Fiş iptal edildi');
      setCancelOpen(false);
      onClose();
    } catch (err) {
      toast.error(err?.message || 'İptal başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUncancel = async () => {
    if (!confirm('İptal kararını geri al?')) return;
    setSubmitting(true);
    try {
      await uncancelArchivedOrder(order.id);
      toast.success('İptal geri alındı');
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Geri alma başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${order.masaAd || 'Paket'} — Arşiv`}
        size="lg"
        footer={
          isAdmin && (
            cancelled ? (
              <button
                onClick={handleUncancel}
                disabled={submitting}
                className="btn-secondary"
              >
                <Undo2 size={14} /> İptali Geri Al
              </button>
            ) : (
              <button
                onClick={() => setCancelOpen(true)}
                disabled={submitting}
                className="btn-secondary text-red-600 hover:bg-red-50"
              >
                <Ban size={14} /> Fişi İptal Et
              </button>
            )
          )
        }
      >
        <div className="space-y-4">
          {cancelled && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold text-red-800">
                <Ban size={14} /> Bu fiş iptal edildi
              </div>
              <p className="text-xs text-red-700">
                <strong>Sebep:</strong> {order.iptal.sebep}
              </p>
              <p className="mt-0.5 text-xs text-red-600">
                <strong>İptal Eden:</strong> {order.iptal.edenAd || '—'}{' '}
                · {formatDate(order.iptal.zaman, 'dd.MM HH:mm')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 text-sm">
            <Info label="Garson" value={order.garsonAd || '—'} />
            <Info label="Kişi" value={order.kisiSayisi != null ? order.kisiSayisi : '—'} />
            <Info label="Tamamlanma" value={formatDate(order.tamamlandiZamani, 'dd.MM HH:mm')} />
            <Info label="Ödeme" value={(order.odemeYontemleri || []).join(' + ') || '—'} />
          </div>
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
              İçerik
            </div>
            <ul className="divide-y divide-slate-100">
              {order.items?.map((it, idx) => (
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
              <span className={`text-lg font-bold ${cancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                {formatTL(order.toplam)}
              </span>
            </div>
          </div>

          {/* Sonradan eklenebilen serbest NOT — özellikle iptal sebebi unutulduysa */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <StickyNote size={14} /> Not
              {cancelled && (
                <span className="text-xs font-normal text-slate-400">(iptal açıklaması / ek bilgi)</span>
              )}
            </label>
            {isAdmin ? (
              <>
                <textarea
                  value={not}
                  onChange={(e) => setNot(e.target.value)}
                  rows={3}
                  placeholder="Bu siparişle ilgili sonradan not ekle (ör. iptal sebebi, müşteri açıklaması)..."
                  className="input"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || not.trim() === (order.not || '').trim()}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    <Save size={14} /> {savingNote ? 'Kaydediliyor...' : 'Notu Kaydet'}
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {order.not ? order.not : <span className="italic text-slate-400">Not eklenmemiş</span>}
              </p>
            )}
          </div>
        </div>
      </Modal>

      <CancelReasonModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleConfirmCancel}
        submitting={submitting}
        orderTotal={order.toplam}
      />
    </>
  );
}

function CancelReasonModal({ open, onClose, onConfirm, submitting, orderTotal }) {
  const [sebep, setSebep] = useState('');

  useEffect(() => {
    if (open) setSebep('');
  }, [open]);

  if (!open) return null;

  const canConfirm = sebep.trim().length >= 3 && !submitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fişi İptal Et"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>
            Vazgeç
          </button>
          <button
            onClick={() => canConfirm && onConfirm(sebep)}
            disabled={!canConfirm}
            className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            <Ban size={14} /> İptal Et ({formatTL(orderTotal)})
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠️ Bu fişi iptal etmek raporlarda <strong>ciro toplamından düşer</strong>.
          Veriler silinmez, sadece "iptal" damgası bırakılır. Yanlışlık olduğunu
          fark edersen "İptali Geri Al" ile geri alabilirsin.
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            İptal Sebebi <span className="text-red-500">*</span>
          </label>
          <textarea
            value={sebep}
            onChange={(e) => setSebep(e.target.value)}
            rows={3}
            placeholder="Ör: Müşteri yanlış sipariş, çift fişleme, mutfak hatası..."
            className="input"
            autoFocus
          />
          <p className="mt-1 text-xs text-slate-500">En az 3 karakter. Rapor ekranında görünür.</p>
        </div>
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
