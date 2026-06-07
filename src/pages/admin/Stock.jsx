import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Boxes,
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Calendar,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, orderBy, where } from '../../firebase/firestore';
import { recordManualStockMovement } from '../../firebase/orders';
import { useAuthStore } from '../../store/authStore';
import { formatTL, formatDate, formatAdet } from '../../utils/format';
import { stockMovementManualSchema } from '../../utils/validators';

// Firebase okuma maliyetini sınırlamak için listener'ı bu pencereyle bağlıyoruz.
// Daha eski hareketler ekranda görünmez. Eski kayıtların otomatik silinmesi için
// Firebase Console > Firestore > TTL ayarlarından 'zaman' alanına TTL politikası eklenebilir.
const STOCK_HISTORY_DAYS = 90;
const stockHistoryCutoff = () => {
  const d = new Date();
  d.setDate(d.getDate() - STOCK_HISTORY_DAYS);
  return d;
};

const KAYNAK_LABELS = {
  siparis: 'Sipariş',
  manuel: 'Manuel',
  fire: 'Fire',
  tedarik: 'Tedarik',
  iade: 'İade',
  sayim: 'Sayım Düzeltme',
};

const KAYNAK_COLORS = {
  siparis: 'bg-blue-50 text-blue-700',
  manuel: 'bg-slate-100 text-slate-700',
  fire: 'bg-red-50 text-red-700',
  tedarik: 'bg-emerald-50 text-emerald-700',
  iade: 'bg-amber-50 text-amber-700',
  sayim: 'bg-purple-50 text-purple-700',
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminStock() {
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayISO());
  const [filterTip, setFilterTip] = useState('all');
  const [filterKaynak, setFilterKaynak] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  // Sadece son STOCK_HISTORY_DAYS günlük hareketleri dinle — read maliyeti sabit kalır
  useEffect(
    () =>
      watchCollection(
        'stockMovements',
        setMovements,
        where('zaman', '>=', stockHistoryCutoff()),
        orderBy('zaman', 'desc'),
      ),
    [],
  );
  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => watchCollection('suppliers', setSuppliers), []);

  // Şu an stok takipli olan ürünlerin ID seti — geçmiş hatalı hareketler (artık
  // takipsiz yapılmış ürünler) listede görünmesin.
  const trackedProductIds = useMemo(
    () => new Set(products.filter((p) => p.stokTakipli !== false).map((p) => p.id)),
    [products],
  );

  const filtered = useMemo(() => {
    const fromTs = new Date(from + 'T00:00:00').getTime();
    const toTs = new Date(to + 'T23:59:59').getTime();
    let list = movements.filter((m) => {
      // Stoğu takipsiz olan ürünün hareketleri gösterilmesin
      if (m.productId && !trackedProductIds.has(m.productId)) return false;
      const t = m.zaman?.toDate ? m.zaman.toDate().getTime() : new Date(m.zaman || 0).getTime();
      return t >= fromTs && t <= toTs;
    });
    if (filterTip !== 'all') list = list.filter((m) => m.tip === filterTip);
    if (filterKaynak !== 'all') list = list.filter((m) => m.kaynak === filterKaynak);
    if (filterProduct !== 'all') list = list.filter((m) => m.productId === filterProduct);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.productAd?.toLowerCase().includes(q) ||
          m.aciklama?.toLowerCase().includes(q) ||
          m.tedarikciAd?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [movements, from, to, filterTip, filterKaynak, filterProduct, search, trackedProductIds]);

  const stats = useMemo(() => {
    let giris = 0;
    let cikis = 0;
    for (const m of filtered) {
      if (m.tip === 'giris') giris += m.miktar || 0;
      else cikis += m.miktar || 0;
    }
    return { giris, cikis, hareketler: filtered.length };
  }, [filtered]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter((p) => p.aktif && p.stokTakipli !== false && p.stok <= (p.dusukStokEsigi ?? 5))
      .sort((a, b) => a.stok - b.stok)
      .slice(0, 5);
  }, [products]);

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = filtered.map((m) => ({
        Tarih: m.zaman?.toDate ? m.zaman.toDate().toLocaleString('tr-TR') : '',
        Ürün: m.productAd,
        Tip: m.tip === 'giris' ? 'Giriş' : 'Çıkış',
        Miktar: m.miktar,
        Önceki: m.oncekiStok,
        Yeni: m.yeniStok,
        Kaynak: KAYNAK_LABELS[m.kaynak] || m.kaynak,
        Tedarikçi: m.tedarikciAd || '',
        Kullanıcı: m.kullaniciAd || '',
        Açıklama: m.aciklama || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Stok Hareketleri');
      XLSX.writeFile(wb, `stok_hareketleri_${from}_${to}.xlsx`);
      toast.success('Excel indirildi');
    } catch (err) {
      console.error(err);
      toast.error('Excel oluşturulamadı');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Stok Yönetimi"
        subtitle={`Son ${STOCK_HISTORY_DAYS} gün stok hareketleri ve manuel düzeltmeler`}
        actions={
          <>
            <button
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="btn-secondary disabled:opacity-50"
            >
              <Download size={16} /> Excel
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary">
              <Plus size={16} /> Manuel Hareket
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Toplam Hareket" value={stats.hareketler} color="blue" icon={Boxes} />
        <StatCard label="Giriş (adet)" value={stats.giris} color="green" icon={TrendingUp} />
        <StatCard label="Çıkış (adet)" value={stats.cikis} color="amber" icon={TrendingDown} />
        <StatCard
          label="Düşük Stok"
          value={lowStockProducts.length}
          color={lowStockProducts.length > 0 ? 'red' : 'green'}
        />
      </div>

      {lowStockProducts.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
            Düşük Stoklu Ürünler
          </p>
          <div className="flex flex-wrap gap-2">
            {lowStockProducts.map((p) => (
              <span
                key={p.id}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  p.stok === 0 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                }`}
              >
                {p.ad}: <strong>{p.stok}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input max-w-[150px]" />
          <span className="text-slate-400">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input max-w-[150px]" />
        </div>
        <select value={filterTip} onChange={(e) => setFilterTip(e.target.value)} className="input max-w-[140px]">
          <option value="all">Tüm Tipler</option>
          <option value="giris">Giriş</option>
          <option value="cikis">Çıkış</option>
        </select>
        <select value={filterKaynak} onChange={(e) => setFilterKaynak(e.target.value)} className="input max-w-[180px]">
          <option value="all">Tüm Kaynaklar</option>
          {Object.entries(KAYNAK_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="input max-w-[200px]"
        >
          <option value="all">Tüm Ürünler</option>
          {products
            .filter((p) => p.stokTakipli !== false)
            .sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad}
              </option>
            ))}
        </select>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara..."
            className="input max-w-xs pl-8"
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <Boxes size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Bu aralıkta stok hareketi yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.slice(0, 200).map((m) => {
              const Arrow = m.tip === 'giris' ? ArrowUpRight : ArrowDownRight;
              const arrowColor = m.tip === 'giris' ? 'text-emerald-600' : 'text-red-600';
              return (
                <li key={m.id} className="grid grid-cols-12 items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="col-span-2 text-xs text-slate-500">
                    {formatDate(m.zaman, 'dd.MM HH:mm')}
                  </div>
                  <div className="col-span-3 font-medium text-slate-900 truncate">{m.productAd}</div>
                  <div className="col-span-1 flex items-center gap-1">
                    <Arrow size={14} className={arrowColor} />
                    <span className={`font-bold ${arrowColor}`}>
                      {m.tip === 'giris' ? '+' : '-'}
                      {formatAdet(m.miktar)}
                    </span>
                  </div>
                  <div className="col-span-1 text-xs text-slate-500">
                    {m.oncekiStok} → <strong className="text-slate-900">{m.yeniStok}</strong>
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        KAYNAK_COLORS[m.kaynak] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {KAYNAK_LABELS[m.kaynak] || m.kaynak}
                    </span>
                  </div>
                  <div className="col-span-3 truncate text-xs text-slate-600">
                    {m.tedarikciAd && <span className="font-medium">{m.tedarikciAd}</span>}
                    {m.tedarikciAd && m.aciklama && <span> · </span>}
                    {m.aciklama}
                    {!m.tedarikciAd && !m.aciklama && m.kullaniciAd && (
                      <span className="text-slate-400">{m.kullaniciAd}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > 200 && (
          <div className="border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-500">
            İlk 200 kayıt gösteriliyor. Tarih filtresini daraltın.
          </div>
        )}
      </div>

      <ManualMovementModal
        open={open}
        onClose={() => setOpen(false)}
        products={products}
        suppliers={suppliers}
      />
    </div>
  );
}

function ManualMovementModal({ open, onClose, products, suppliers }) {
  const { user, profile } = useAuthStore();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(stockMovementManualSchema),
    defaultValues: {
      productId: '',
      tip: 'giris',
      miktar: 1,
      kaynak: 'tedarik',
      tedarikciId: '',
      aciklama: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        productId: '',
        tip: 'giris',
        miktar: 1,
        kaynak: 'tedarik',
        tedarikciId: '',
        aciklama: '',
      });
    }
  }, [open, reset]);

  const onSubmit = async (data) => {
    try {
      const tedarikci = suppliers.find((s) => s.id === data.tedarikciId);
      await recordManualStockMovement({
        productId: data.productId,
        tip: data.tip,
        miktar: data.miktar,
        kaynak: data.kaynak,
        tedarikciId: data.tedarikciId || null,
        tedarikciAd: tedarikci?.ad || null,
        aciklama: data.aciklama,
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      toast.success('Stok hareketi kaydedildi');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Kayıt hatası');
    }
  };

  const tip = watch('tip');
  const kaynak = watch('kaynak');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manuel Stok Hareketi"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="stock-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="stock-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ürün</label>
          <ProductPicker
            value={watch('productId')}
            onChange={(id) => setValue('productId', id, { shouldValidate: true, shouldDirty: true })}
            products={products
              .filter((p) => p.aktif && p.stokTakipli !== false)
              .sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999))}
            hasError={!!errors.productId}
          />
          {errors.productId && <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Tip</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`cursor-pointer rounded-lg border-2 p-3 text-center text-sm font-medium ${
                tip === 'giris' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'
              }`}>
                <input type="radio" {...register('tip')} value="giris" className="sr-only" />
                + Giriş
              </label>
              <label className={`cursor-pointer rounded-lg border-2 p-3 text-center text-sm font-medium ${
                tip === 'cikis' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200'
              }`}>
                <input type="radio" {...register('tip')} value="cikis" className="sr-only" />
                − Çıkış
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Miktar</label>
            <input
              type="number"
              step="0.1"
              {...register('miktar', { valueAsNumber: true })}
              className="input"
            />
            {errors.miktar && <p className="mt-1 text-xs text-red-600">{errors.miktar.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kaynak / Sebep</label>
          <select {...register('kaynak')} className="input">
            <option value="manuel">Manuel düzeltme</option>
            <option value="tedarik">Tedarik (sipariş geldi)</option>
            <option value="fire">Fire / Bozulma</option>
            <option value="iade">İade</option>
            <option value="sayim">Sayım düzeltmesi</option>
          </select>
        </div>

        {kaynak === 'tedarik' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tedarikçi</label>
            <select {...register('tedarikciId')} className="input">
              <option value="">— Seçim yok —</option>
              {suppliers
                .filter((s) => s.aktif !== false)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ad}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama</label>
          <input
            {...register('aciklama')}
            className="input"
            placeholder="Opsiyonel — örn. fatura no, neden vs."
          />
        </div>
      </form>
    </Modal>
  );
}

// Aranabilir ürün seçici (combobox) — uzun listede ürünü hızla bulmak için
function ProductPicker({ value, onChange, products, hasError }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  const selected = products.find((p) => p.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) => p.ad.toLowerCase().includes(q))
    : products;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Açılınca arama input'una odaklan
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input flex w-full items-center justify-between text-left ${
          hasError ? 'border-red-500' : ''
        }`}
      >
        <span className={selected ? '' : 'text-slate-400'}>
          {selected
            ? `${selected.ad} (mevcut: ${selected.stok ?? 0})`
            : '— Ürün seçin —'}
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara..."
                className="input pl-8"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-slate-400">
                Eşleşen ürün yok
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                    p.id === value
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{p.ad}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    mevcut: {p.stok ?? 0}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
