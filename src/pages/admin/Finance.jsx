import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  Search,
  Download,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, createDoc, removeDoc, orderBy } from '../../firebase/firestore';
import { financeTxSchema } from '../../utils/validators';
import { formatTL, formatDate } from '../../utils/format';

const GELIR_KATEGORILER = [
  'Yemek Satışı',
  'İçecek Satışı',
  'Paket Servis',
  'Catering / Etkinlik',
  'Diğer Gelir',
];

const GIDER_KATEGORILER = [
  'Kira',
  'Elektrik',
  'Su',
  'Doğalgaz',
  'İnternet / Telefon',
  'Personel Maaşı',
  'SGK / Vergi',
  'Tedarik / Market',
  'Bakım / Onarım',
  'Reklam / Pazarlama',
  'Yakıt',
  'Diğer Gider',
];

const YONTEM_LABELS = {
  nakit: 'Nakit',
  kart: 'Kart',
  havale: 'Havale/EFT',
  diger: 'Diğer',
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

export default function AdminFinance() {
  const [txs, setTxs] = useState([]);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [filterTip, setFilterTip] = useState('all');
  const [filterKategori, setFilterKategori] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => watchCollection('transactions', setTxs, orderBy('tarih', 'desc')), []);

  const filtered = useMemo(() => {
    let list = txs.filter((t) => {
      const tarih = t.tarih || '';
      return tarih >= from && tarih <= to;
    });
    if (filterTip !== 'all') list = list.filter((t) => t.tip === filterTip);
    if (filterKategori !== 'all') list = list.filter((t) => t.kategori === filterKategori);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.aciklama?.toLowerCase().includes(q) ||
          t.kategori?.toLowerCase().includes(q) ||
          t.belgeNo?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [txs, from, to, filterTip, filterKategori, search]);

  const stats = useMemo(() => {
    let gelir = 0;
    let gider = 0;
    for (const t of filtered) {
      if (t.tip === 'gelir') gelir += t.miktar || 0;
      else gider += t.miktar || 0;
    }
    return { gelir, gider, net: gelir - gider };
  }, [filtered]);

  const tumKategoriler = useMemo(() => {
    const set = new Set();
    txs.forEach((t) => t.kategori && set.add(t.kategori));
    return [...set];
  }, [txs]);

  const handleDelete = async (t) => {
    if (!confirm(`"${t.kategori}" hareketi silinsin mi?`)) return;
    try {
      await removeDoc('transactions', t.id);
      toast.success('Hareket silindi');
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  };

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const detayRows = filtered.map((t) => ({
        Tarih: t.tarih,
        Tip: t.tip === 'gelir' ? 'Gelir' : 'Gider',
        Kategori: t.kategori,
        Tutar: t.miktar,
        Yöntem: YONTEM_LABELS[t.odemeYontemi] || t.odemeYontemi || '',
        'Belge No': t.belgeNo || '',
        Açıklama: t.aciklama || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detayRows), 'Hareketler');

      // Kategori özeti
      const kategoriMap = {};
      filtered.forEach((t) => {
        const key = `${t.tip}::${t.kategori}`;
        if (!kategoriMap[key]) kategoriMap[key] = { tip: t.tip, kategori: t.kategori, toplam: 0, adet: 0 };
        kategoriMap[key].toplam += t.miktar || 0;
        kategoriMap[key].adet += 1;
      });
      const ozet = Object.values(kategoriMap).map((k) => ({
        Tip: k.tip === 'gelir' ? 'Gelir' : 'Gider',
        Kategori: k.kategori,
        'Adet': k.adet,
        Toplam: k.toplam,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ozet), 'Kategori Özeti');

      XLSX.writeFile(wb, `finans_${from}_${to}.xlsx`);
      toast.success('Excel indirildi');
    } catch (err) {
      console.error(err);
      toast.error('Excel oluşturulamadı');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Finans"
        subtitle="Gelir / gider defteri (POS satışları otomatik raporlardan görülür; burası ek hareketler)"
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
              <Plus size={16} /> Yeni Hareket
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Toplam Hareket" value={filtered.length} color="blue" icon={Wallet} />
        <StatCard label="Gelir" value={formatTL(stats.gelir)} color="green" icon={TrendingUp} />
        <StatCard label="Gider" value={formatTL(stats.gider)} color="red" icon={TrendingDown} />
        <StatCard
          label="Net"
          value={formatTL(stats.net)}
          color={stats.net >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input max-w-[150px]" />
          <span className="text-slate-400">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input max-w-[150px]" />
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={() => { setFrom(todayISO()); setTo(todayISO()); }} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
            Bugün
          </button>
          <button onClick={() => { setFrom(daysAgo(30)); setTo(todayISO()); }} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
            30 gün
          </button>
        </div>
        <select value={filterTip} onChange={(e) => setFilterTip(e.target.value)} className="input max-w-[140px]">
          <option value="all">Tüm Tipler</option>
          <option value="gelir">Gelir</option>
          <option value="gider">Gider</option>
        </select>
        <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className="input max-w-[200px]">
          <option value="all">Tüm Kategoriler</option>
          {tumKategoriler.map((k) => (
            <option key={k} value={k}>
              {k}
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
            <Wallet size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Bu aralıkta hareket yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((t) => {
              const isGelir = t.tip === 'gelir';
              const Arrow = isGelir ? ArrowUpRight : ArrowDownRight;
              const color = isGelir ? 'text-emerald-600' : 'text-red-600';
              return (
                <li key={t.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm">
                  <div className="col-span-2 text-xs text-slate-500">{t.tarih}</div>
                  <div className="col-span-3">
                    <p className="font-medium text-slate-900">{t.kategori}</p>
                    {t.aciklama && (
                      <p className="text-xs text-slate-500 truncate">{t.aciklama}</p>
                    )}
                  </div>
                  <div className="col-span-2 text-xs text-slate-600">
                    {YONTEM_LABELS[t.odemeYontemi] || t.odemeYontemi || '—'}
                    {t.belgeNo && <p className="text-[10px] text-slate-400">#{t.belgeNo}</p>}
                  </div>
                  <div className={`col-span-3 flex items-center gap-1 font-bold ${color}`}>
                    <Arrow size={16} />
                    {isGelir ? '+' : '-'}
                    {formatTL(t.miktar)}
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      onClick={() => handleDelete(t)}
                      className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        💡 POS'tan alınan satışlar Raporlar sayfasında ayrı olarak takip edilir. Bu sayfa kira, fatura, market alışverişi gibi <strong>nakit defter dışı</strong> hareketler içindir.
      </p>

      <TxModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function TxModal({ open, onClose }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(financeTxSchema),
    defaultValues: {
      tarih: todayISO(),
      tip: 'gider',
      kategori: '',
      miktar: 0,
      aciklama: '',
      odemeYontemi: 'nakit',
      belgeNo: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        tarih: todayISO(),
        tip: 'gider',
        kategori: '',
        miktar: 0,
        aciklama: '',
        odemeYontemi: 'nakit',
        belgeNo: '',
      });
    }
  }, [open, reset]);

  const onSubmit = async (data) => {
    try {
      await createDoc('transactions', data);
      toast.success('Hareket kaydedildi');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Kayıt hatası');
    }
  };

  const tip = watch('tip');
  const kategoriler = tip === 'gelir' ? GELIR_KATEGORILER : GIDER_KATEGORILER;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni Hareket"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="tx-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="tx-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Tip</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`cursor-pointer rounded-lg border-2 p-3 text-center text-sm font-medium ${
                tip === 'gelir' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'
              }`}>
                <input type="radio" {...register('tip')} value="gelir" className="sr-only" />
                + Gelir
              </label>
              <label className={`cursor-pointer rounded-lg border-2 p-3 text-center text-sm font-medium ${
                tip === 'gider' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200'
              }`}>
                <input type="radio" {...register('tip')} value="gider" className="sr-only" />
                − Gider
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tarih</label>
            <input type="date" {...register('tarih')} className="input" />
            {errors.tarih && <p className="mt-1 text-xs text-red-600">{errors.tarih.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
          <select {...register('kategori')} className="input">
            <option value="">— Kategori seçin —</option>
            {kategoriler.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {errors.kategori && <p className="mt-1 text-xs text-red-600">{errors.kategori.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tutar (TL)</label>
            <input
              type="number"
              step="0.01"
              {...register('miktar', { valueAsNumber: true })}
              className="input"
            />
            {errors.miktar && <p className="mt-1 text-xs text-red-600">{errors.miktar.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ödeme Yöntemi</label>
            <select {...register('odemeYontemi')} className="input">
              {Object.entries(YONTEM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Belge No</label>
          <input {...register('belgeNo')} className="input" placeholder="Fatura no, fiş no vs." />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama</label>
          <input {...register('aciklama')} className="input" placeholder="Detay (opsiyonel)" />
        </div>
      </form>
    </Modal>
  );
}
