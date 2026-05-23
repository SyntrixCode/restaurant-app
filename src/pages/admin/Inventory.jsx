import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  ClipboardList,
  CheckCircle2,
  X,
  Trash2,
  Search,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import {
  watchCollection,
  createDoc,
  patchDoc,
  removeDoc,
  orderBy,
  fetchAll,
} from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { finalizeInventoryCount } from '../../firebase/orders';
import { formatDate, formatAdet } from '../../utils/format';

export default function AdminInventory() {
  const { user, profile } = useAuthStore();
  const [counts, setCounts] = useState([]);
  const [active, setActive] = useState(null); // aktif sayım sessiyonu
  const [search, setSearch] = useState('');

  useEffect(() => watchCollection('inventoryCounts', setCounts, orderBy('baslangic', 'desc')), []);

  const aktifSayim = useMemo(() => counts.find((c) => c.durum === 'aktif'), [counts]);
  const tamamlanan = useMemo(() => counts.filter((c) => c.durum === 'tamamlandi'), [counts]);

  const startNewCount = async () => {
    if (aktifSayim) {
      toast.error('Aktif sayım var, önce kapatın.');
      return;
    }
    if (!confirm('Yeni sayım başlatılsın mı? Tüm aktif ürünlerin anlık stok seviyesi snapshot olarak alınır.')) return;
    try {
      const products = await fetchAll('products');
      const aktifUrunler = products.filter((p) => p.aktif);
      const items = aktifUrunler.map((p) => ({
        productId: p.id,
        productAd: p.ad,
        categoryAd: p.categoryAd || '',
        sistemStok: p.stok || 0,
        fizikselStok: null, // doldurulacak
      }));
      const adi = `Sayım ${formatDate(new Date(), 'dd.MM.yyyy HH:mm')}`;
      const id = await createDoc('inventoryCounts', {
        ad: adi,
        durum: 'aktif',
        baslangic: new Date(),
        items,
        urunSayisi: items.length,
        yapanId: user?.uid || null,
        yapanAd: profile?.ad || 'Admin',
      });
      toast.success(`Sayım başlatıldı (${items.length} ürün)`);
      // Modal'ı aç
      const created = { id, ad: adi, items, durum: 'aktif' };
      setActive(created);
    } catch (err) {
      console.error(err);
      toast.error('Sayım başlatılamadı');
    }
  };

  const cancelCount = async (c) => {
    if (!confirm(`${c.ad} sayımı iptal edilsin mi? Yapılan değişiklikler kaybolur.`)) return;
    try {
      await removeDoc('inventoryCounts', c.id);
      toast.success('Sayım iptal edildi');
      setActive(null);
    } catch (err) {
      console.error(err);
      toast.error('İptal edilemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Sayım"
        subtitle="Fiziksel stoğu sistem ile karşılaştır, farkları otomatik düzelt"
        actions={
          !aktifSayim ? (
            <button onClick={startNewCount} className="btn-primary">
              <Plus size={16} /> Yeni Sayım Başlat
            </button>
          ) : (
            <button onClick={() => setActive(aktifSayim)} className="btn-primary">
              <ClipboardList size={16} /> Aktif Sayıma Devam Et
            </button>
          )
        }
      />

      {aktifSayim && (
        <div className="mb-6 rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900">📋 Devam Eden Sayım</p>
              <p className="text-xs text-blue-700">{aktifSayim.ad} — {aktifSayim.urunSayisi} ürün</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setActive(aktifSayim)} className="btn-primary text-sm">
                Devam Et
              </button>
              <button onClick={() => cancelCount(aktifSayim)} className="btn-secondary text-sm">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Sayım" value={counts.length} icon={ClipboardList} />
        <StatCard label="Tamamlanan" value={tamamlanan.length} color="green" icon={CheckCircle2} />
        <StatCard label="Aktif" value={aktifSayim ? 1 : 0} color="amber" />
      </div>

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        Geçmiş Sayımlar
      </h3>
      <div className="card overflow-hidden p-0">
        {tamamlanan.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <ClipboardList size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Henüz tamamlanmış sayım yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tamamlanan.map((c) => (
              <li key={c.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm">
                <div className="col-span-4">
                  <p className="font-medium text-slate-900">{c.ad}</p>
                  <p className="text-xs text-slate-500">
                    {c.yapanAd} {c.kapatanAd && c.kapatanAd !== c.yapanAd && `→ ${c.kapatanAd}`}
                  </p>
                </div>
                <div className="col-span-3 text-xs text-slate-600">
                  Başlangıç: {formatDate(c.baslangic, 'dd.MM HH:mm')}
                </div>
                <div className="col-span-3 text-xs text-slate-600">
                  Bitiş: {formatDate(c.bitisZamani, 'dd.MM HH:mm')}
                </div>
                <div className="col-span-2 text-right text-sm">
                  <span className="font-semibold">{c.duzeltilenSayisi || 0}</span>
                  <span className="ml-1 text-xs text-slate-500">düzeltme</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CountSession
        open={!!active}
        countDoc={active}
        userId={user?.uid}
        userAd={profile?.ad}
        onClose={() => setActive(null)}
      />
    </div>
  );
}

function CountSession({ open, countDoc, userId, userAd, onClose }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (countDoc?.items) {
      setRows(countDoc.items.map((it) => ({ ...it })));
      setSearch('');
    }
  }, [countDoc?.id]);

  if (!open || !countDoc) return null;

  const updateRow = (idx, fiziksel) => {
    setRows((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx], fizikselStok: fiziksel };
      return next;
    });
  };

  const dolduruldu = rows.filter((r) => r.fizikselStok != null && r.fizikselStok !== '').length;
  const totalArti = rows.reduce((s, r) => {
    if (r.fizikselStok == null || r.fizikselStok === '') return s;
    const fark = Number(r.fizikselStok) - Number(r.sistemStok || 0);
    return s + (fark > 0 ? fark : 0);
  }, 0);
  const totalEksi = rows.reduce((s, r) => {
    if (r.fizikselStok == null || r.fizikselStok === '') return s;
    const fark = Number(r.fizikselStok) - Number(r.sistemStok || 0);
    return s + (fark < 0 ? Math.abs(fark) : 0);
  }, 0);

  const visibleRows = rows
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter((r) => !search || r.productAd?.toLowerCase().includes(search.toLowerCase()));

  const finalize = async () => {
    if (dolduruldu === 0) {
      toast.error('En az 1 ürün için fiziksel stok girin');
      return;
    }
    const farkliSayisi = rows.filter((r) => {
      if (r.fizikselStok == null || r.fizikselStok === '') return false;
      return Number(r.fizikselStok) !== Number(r.sistemStok || 0);
    }).length;

    if (!confirm(`${dolduruldu} ürün için sayım kapatılsın mı?\n\n${farkliSayisi} üründe stok farkı düzeltilecek.`))
      return;

    setSubmitting(true);
    try {
      const itemsToSubmit = rows.map((r) => ({
        productId: r.productId,
        productAd: r.productAd,
        sistemStok: r.sistemStok,
        fizikselStok:
          r.fizikselStok == null || r.fizikselStok === '' ? null : Number(r.fizikselStok),
      }));
      // Önce sayım doc'unu güncelle (sayım anındaki snapshot'a fizikselStok eklensin)
      await patchDoc('inventoryCounts', countDoc.id, { items: itemsToSubmit });
      // Atomik finalize
      const result = await finalizeInventoryCount({
        countId: countDoc.id,
        items: itemsToSubmit,
        kullaniciId: userId,
        kullaniciAd: userAd,
      });
      toast.success(`Sayım tamamlandı (${result.duzeltilenSayisi} düzeltme)`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Sayım kapatılamadı');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={countDoc.ad || 'Sayım'}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Sonra Devam Et
          </button>
          <button
            onClick={finalize}
            disabled={submitting || dolduruldu === 0}
            className="btn-primary disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            Sayımı Kapat ({dolduruldu}/{rows.length})
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-slate-50 p-2 text-center">
            <p className="text-slate-500">Doldurulan</p>
            <p className="text-lg font-bold text-slate-900">{dolduruldu} / {rows.length}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2 text-center">
            <p className="text-emerald-700">Stok Artışı</p>
            <p className="text-lg font-bold text-emerald-700">+{formatAdet(totalArti)}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-2 text-center">
            <p className="text-red-700">Stok Düşüşü (kayıp/fire)</p>
            <p className="text-lg font-bold text-red-700">-{formatAdet(totalEksi)}</p>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün ara..."
            className="input pl-8"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Ürün</th>
                <th className="px-3 py-2 text-right">Sistem</th>
                <th className="px-3 py-2 text-right">Fiziksel</th>
                <th className="px-3 py-2 text-right">Fark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((r) => {
                const fiziksel =
                  r.fizikselStok == null || r.fizikselStok === '' ? null : Number(r.fizikselStok);
                const fark = fiziksel == null ? null : fiziksel - Number(r.sistemStok || 0);
                return (
                  <tr key={r.productId} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{r.productAd}</p>
                      {r.categoryAd && <p className="text-xs text-slate-500">{r.categoryAd}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatAdet(r.sistemStok)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.5"
                        value={r.fizikselStok ?? ''}
                        onChange={(e) => updateRow(r._idx, e.target.value)}
                        placeholder="—"
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        fark == null
                          ? 'text-slate-300'
                          : fark === 0
                            ? 'text-slate-400'
                            : fark > 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                      }`}
                    >
                      {fark == null ? '—' : fark > 0 ? `+${formatAdet(fark)}` : formatAdet(fark)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
