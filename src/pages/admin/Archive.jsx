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
  Wallet,
  Pencil,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, orderBy, patchDoc, where } from '../../firebase/firestore';
import {
  cancelArchivedOrder,
  uncancelArchivedOrder,
  updateArchivedOrderItems,
} from '../../firebase/orders';
import { updateOdemeYontemi } from '../../firebase/payments';
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
  const [pays, setPays] = useState([]); // bu siparişin tahsilat kayıtları
  // ── Ürün düzeltme (yanlış girilen ürünü sil / adet düzelt / unutulanı ekle) ──
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [confirmEdit, setConfirmEdit] = useState(false); // ödeme sorusu modalı
  const [savingEdit, setSavingEdit] = useState(false);
  const [payEdits, setPayEdits] = useState({}); // paymentId -> yontem
  const [savingPay, setSavingPay] = useState(false);
  const isAdmin = rol === 'admin';

  // Başka sipariş açılınca not alanını o siparişin notuyla doldur
  useEffect(() => {
    setNot(order?.not || '');
  }, [order?.id]);

  // Siparişin ödeme kayıtlarını izle (gün sonu nakit/kart dağılımı buradan gelir)
  useEffect(() => {
    if (!order?.id) {
      setPays([]);
      return;
    }
    return watchCollection('payments', setPays, where('orderId', '==', order.id));
  }, [order?.id]);

  // Ödemeler gelince düzenleme taslağını mevcut yöntemlerle doldur
  useEffect(() => {
    setPayEdits(Object.fromEntries(pays.map((p) => [p.id, p.yontem])));
  }, [pays]);

  const payDirty = pays.some((p) => payEdits[p.id] && payEdits[p.id] !== p.yontem);

  // Ürün listesi (düzenlemede "ürün ekle" için)
  useEffect(() => watchCollection('products', setProducts), []);

  // Başka sipariş açılınca düzenleme modunu kapat
  useEffect(() => {
    setEditMode(false);
    setEditItems([]);
    setConfirmEdit(false);
  }, [order?.id]);

  const startEdit = () => {
    setEditItems((order?.items || []).map((it) => ({ ...it })));
    setEditMode(true);
  };
  const cancelEdit = () => {
    setEditMode(false);
    setEditItems([]);
  };
  const setItemAdet = (idx, val) =>
    setEditItems((arr) => arr.map((it, i) => (i === idx ? { ...it, adet: val } : it)));
  const removeItem = (idx) => setEditItems((arr) => arr.filter((_, i) => i !== idx));
  const addItem = (p) =>
    setEditItems((arr) => [
      ...arr,
      { productId: p.id, ad: p.ad, fiyat: Number(p.fiyat) || 0, adet: 1, notlar: '' },
    ]);

  const yeniAraToplam = editItems.reduce(
    (s, it) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0),
    0,
  );
  const yeniToplam = Math.max(0, yeniAraToplam - Number(order?.indirim || 0));
  const fark = yeniToplam - Number(order?.toplam || 0);
  const itemsDirty =
    editItems.length !== (order?.items || []).length ||
    editItems.some((it, i) => Number(it.adet) !== Number(order.items[i]?.adet)) ||
    fark !== 0;

  /** @param {boolean} odemeyiDuzelt ödeme kayıtları da yeni toplama çekilsin mi */
  const handleSaveItems = async (odemeyiDuzelt) => {
    setSavingEdit(true);
    try {
      const res = await updateArchivedOrderItems({
        archivedId: order.id,
        newItems: editItems.map((it) => ({
          productId: it.productId,
          ad: it.ad,
          fiyat: Number(it.fiyat) || 0,
          adet: Number(it.adet),
          notlar: it.notlar || '',
        })),
        odemeyiDuzelt,
        paymentIds: pays.map((p) => p.id),
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      toast.success(
        `Sipariş düzeltildi: ${formatTL(res.eskiToplam)} → ${formatTL(res.yeniToplam)}` +
          (res.odemeDuzeltildi ? ' · ödeme de güncellendi' : ' · ödemeye dokunulmadı'),
        { duration: 6000 },
      );
      setConfirmEdit(false);
      setEditMode(false);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Düzeltme kaydedilemedi');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSavePayments = async () => {
    setSavingPay(true);
    try {
      const res = await updateOdemeYontemi({
        orderId: order.id,
        updates: pays.map((p) => ({
          paymentId: p.id,
          yontem: payEdits[p.id] || p.yontem,
          kartTipi: p.kartTipi,
        })),
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      toast.success(
        res.degisen > 0
          ? 'Ödeme yöntemi düzeltildi — gün sonu/raporlar güncellendi'
          : 'Değişiklik yok',
      );
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Ödeme yöntemi güncellenemedi');
    } finally {
      setSavingPay(false);
    }
  };

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
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium uppercase text-slate-500">İçerik</span>
              {isAdmin && !cancelled && (
                editMode ? (
                  <div className="flex gap-1">
                    <button onClick={cancelEdit} className="btn-ghost px-2 py-1 text-xs">
                      Vazgeç
                    </button>
                    <button
                      onClick={() => setConfirmEdit(true)}
                      disabled={!itemsDirty}
                      className="btn-primary px-2 py-1 text-xs disabled:opacity-40"
                    >
                      <Save size={13} /> Düzeltmeyi Kaydet
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startEdit}
                    className="btn-ghost px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                    title="Yanlış girilen ürünü sil / adedi düzelt / unutulanı ekle"
                  >
                    <Pencil size={13} /> Ürünleri Düzenle
                  </button>
                )
              )}
            </div>

            {!editMode ? (
              <>
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
              </>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {editItems.map((it, idx) => (
                    <li key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex-1 truncate">
                        {it.ad}
                        {it.notlar && <em className="ml-1 text-xs text-slate-500">({it.notlar})</em>}
                        <span className="ml-1 text-xs text-slate-400">{formatTL(it.fiyat)}/adet</span>
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={it.adet}
                        onChange={(e) => setItemAdet(idx, e.target.value)}
                        className="input max-w-[70px] py-1 text-center text-sm"
                      />
                      <span className="w-20 shrink-0 text-right font-semibold">
                        {formatTL((Number(it.fiyat) || 0) * (Number(it.adet) || 0))}
                      </span>
                      <button
                        onClick={() => removeItem(idx)}
                        title="Bu ürünü siparişten sil"
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Ürün ekle */}
                <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      if (p) addItem(p);
                      e.target.value = '';
                    }}
                    className="input py-1 text-sm"
                  >
                    <option value="">+ Ürün ekle (unutulan / sonradan servis edilen)…</option>
                    {[...products]
                      .filter((p) => p.aktif !== false)
                      .sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.ad} — {formatTL(p.fiyat)}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm">
                  <span className="text-slate-500">Eski: </span>
                  <span className="text-slate-400 line-through">{formatTL(order.toplam)}</span>
                  <span className="mx-2 text-slate-400">→</span>
                  <span className="text-slate-500">Yeni: </span>
                  <span
                    className={`text-lg font-bold ${
                      yeniToplam < Number(order.toplam || 0)
                        ? 'text-red-600'
                        : yeniToplam > Number(order.toplam || 0)
                          ? 'text-emerald-600'
                          : 'text-slate-900'
                    }`}
                  >
                    {formatTL(yeniToplam)}
                  </span>
                  {fark !== 0 && (
                    <span className={`ml-2 text-xs font-medium ${fark < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      ({fark > 0 ? '+' : ''}
                      {formatTL(fark)})
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Önceki düzeltmeler (denetim izi) */}
          {(order.duzeltmeler || []).length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50">
              <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-amber-800">
                ✎ Bu fişte {order.duzeltmeler.length} düzeltme yapılmış
              </summary>
              <ul className="space-y-1 px-3 pb-2 text-[11px] text-amber-700">
                {order.duzeltmeler.map((d, i) => (
                  <li key={i}>
                    {formatDate(d.zaman, 'dd.MM HH:mm')} · <strong>{d.kullaniciAd}</strong> ·{' '}
                    {formatTL(d.oncekiToplam)} → {formatTL(d.yeniToplam)} ·{' '}
                    {d.odemeDuzeltildi ? 'ödeme de düzeltildi' : 'ödemeye dokunulmadı'}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* ÖDEME YÖNTEMİ DÜZELTME — kasiyer yanlış girdiyse (nakit ödendi ama kart işaretlendi).
              payments dokümanı güncellenir → Gün Sonu / Raporlar dağılımı düzelir. Tutar değişmez. */}
          {pays.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase text-slate-500">
                  <Wallet size={14} /> Ödeme Yöntemi
                </span>
                {isAdmin && (
                  <button
                    onClick={handleSavePayments}
                    disabled={!payDirty || savingPay}
                    className="btn-primary px-2 py-1 text-xs disabled:opacity-40"
                  >
                    <Save size={13} /> {savingPay ? 'Kaydediliyor…' : 'Düzeltmeyi Kaydet'}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {pays.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-900">{formatTL(p.tutar)}</span>
                    <div className="flex items-center gap-2">
                      {p.duzeltme && (
                        <span
                          title={`Önce: ${p.duzeltme.oncekiYontem} → ${p.duzeltme.yeniYontem} · ${p.duzeltme.kullaniciAd || '—'}`}
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                        >
                          düzeltildi
                        </span>
                      )}
                      {isAdmin ? (
                        <select
                          value={payEdits[p.id] ?? p.yontem}
                          onChange={(e) =>
                            setPayEdits((s) => ({ ...s, [p.id]: e.target.value }))
                          }
                          className={`input max-w-[150px] py-1 text-sm ${
                            payEdits[p.id] && payEdits[p.id] !== p.yontem
                              ? 'border-amber-400 bg-amber-50 font-medium'
                              : ''
                          }`}
                        >
                          <option value="nakit">Nakit</option>
                          <option value="kart">Kart</option>
                          <option value="yemekKarti">Yemek Kartı</option>
                        </select>
                      ) : (
                        <span className="text-slate-600">{p.yontem}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {isAdmin && (
                <p className="border-t border-slate-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                  ℹ️ Yanlış yöntem girildiyse (müşteri nakit ödedi ama kart işaretlendi) buradan
                  düzelt. <strong>Tutar değişmez</strong>, sadece Gün Sonu ve Raporlardaki
                  nakit/kart dağılımı düzelir.
                </p>
              )}
            </div>
          )}

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

      {/* Düzeltmeyi kaydederken: ödeme kaydı da düzeltilsin mi? */}
      <Modal
        open={confirmEdit}
        onClose={() => setConfirmEdit(false)}
        title="Düzeltmeyi Kaydet — Ödeme ne olacak?"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Eski toplam</span>
              <span className="font-medium text-slate-500 line-through">{formatTL(order.toplam)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700">Yeni toplam</span>
              <span className="text-lg font-bold text-slate-900">{formatTL(yeniToplam)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
              <span className="font-medium text-slate-700">Fark</span>
              <span className={`font-bold ${fark < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {fark > 0 ? '+' : ''}
                {formatTL(fark)}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Tahsil edilen tutar şu an <strong>{formatTL(pays.reduce((s, p) => s + (p.tutar || 0), 0))}</strong>.
            Ödeme kaydı da yeni toplama çekilsin mi?
          </p>

          <div className="space-y-2">
            <button
              onClick={() => handleSaveItems(true)}
              disabled={savingEdit}
              className="w-full rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3 text-left transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <p className="font-semibold text-emerald-800">
                ✅ Ödemeden de düşülsün ({formatTL(yeniToplam)} olsun)
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                Para {fark < 0 ? 'iade edildi / hiç alınmadı' : 'ek olarak tahsil edildi'}. Gün sonu ve
                kasa <strong>tutar</strong>. (Genelde doğru olan bu)
              </p>
            </button>

            <button
              onClick={() => handleSaveItems(false)}
              disabled={savingEdit}
              className="w-full rounded-lg border-2 border-slate-300 bg-white p-3 text-left transition hover:bg-slate-50 disabled:opacity-50"
            >
              <p className="font-semibold text-slate-800">Ödemeye dokunma</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Müşteri zaten doğru parayı ödemişti, sadece ürün listesi yanlıştı.{' '}
                <strong className="text-amber-700">⚠️ Ciro ile tahsilat arasında fark oluşur.</strong>
              </p>
            </button>
          </div>

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ℹ️ Her iki durumda da: silinen/azalan ürünlerin <strong>stoğu geri verilir</strong>
            (reçete malzemeleri dahil), eklenenlerin stoğu düşer. İşlem <strong>iz bırakır</strong>
            (kim, ne zaman, ne değişti).
          </p>

          <button
            onClick={() => setConfirmEdit(false)}
            disabled={savingEdit}
            className="btn-secondary w-full"
          >
            Vazgeç
          </button>
        </div>
      </Modal>
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
