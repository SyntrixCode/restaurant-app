import { useEffect, useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Tag, Copy, Search } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc } from '../../firebase/firestore';
import { couponSchema } from '../../utils/validators';
import { formatTL } from '../../utils/format';
import { isCouponValid } from '../../utils/discount';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => watchCollection('coupons', setCoupons), []);

  const filtered = useMemo(() => {
    if (!search) return coupons;
    const q = search.toUpperCase();
    return coupons.filter((c) => c.kod?.toUpperCase().includes(q));
  }, [coupons, search]);

  const totalAktif = coupons.filter((c) => c.aktif).length;
  const totalGecerli = coupons.filter((c) => isCouponValid(c, 999999)).length;

  const handleDelete = async (c) => {
    if (!confirm(`"${c.kod}" kuponu silinsin mi?`)) return;
    try {
      await removeDoc('coupons', c.id);
      toast.success('Kupon silindi');
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  };

  const handleToggle = async (c) => {
    try {
      await patchDoc('coupons', c.id, { aktif: !c.aktif });
    } catch (err) {
      console.error(err);
      toast.error('Güncellenemedi');
    }
  };

  const copyCode = (kod) => {
    navigator.clipboard?.writeText(kod);
    toast.success(`${kod} kopyalandı`);
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Kupon Kodları"
        subtitle="Müşterinin elinde kod ile uygulanan indirimler"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Yeni Kupon
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Kupon" value={coupons.length} icon={Tag} />
        <StatCard label="Aktif" value={totalAktif} color="green" />
        <StatCard label="Şu An Kullanılabilir" value={totalGecerli} color="blue" />
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kupon kodu ara..."
            className="input max-w-xs pl-8"
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <Tag size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Kupon yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const gecerli = isCouponValid(c, 999999);
              const dolu = c.maxKullanim > 0 && (c.kullanilan || 0) >= c.maxKullanim;
              const suresizMi = c.maxKullanim === 0;
              return (
                <li key={c.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm font-bold tracking-wider">
                        {c.kod}
                      </code>
                      <button
                        onClick={() => copyCode(c.kod)}
                        title="Kopyala"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <Copy size={12} />
                      </button>
                      {gecerli && c.aktif && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          GEÇERLİ
                        </span>
                      )}
                      {dolu && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                          DOLU
                        </span>
                      )}
                    </div>
                    {c.aciklama && <p className="mt-1 text-xs text-slate-500">{c.aciklama}</p>}
                  </div>
                  <div className="col-span-2 text-sm font-semibold text-blue-700">
                    {c.indirimTipi === 'yuzde' ? `%${c.indirimDeger}` : formatTL(c.indirimDeger)}
                  </div>
                  <div className="col-span-2 text-xs text-slate-600">
                    {c.minTutar > 0 && <p>Min: {formatTL(c.minTutar)}</p>}
                    {c.sonGecerlilik && <p>Son: {c.sonGecerlilik}</p>}
                  </div>
                  <div className="col-span-2 text-xs text-slate-700">
                    <p>
                      Kullanım: <strong>{c.kullanilan || 0}</strong>
                      {!suresizMi && ` / ${c.maxKullanim}`}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Toggle checked={!!c.aktif} onChange={() => handleToggle(c)} />
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                      className="btn-ghost px-2 py-1"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
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

      <CouponModal open={open} editing={editing} onClose={() => setOpen(false)} />
    </div>
  );
}

function CouponModal({ open, editing, onClose }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      kod: '',
      aciklama: '',
      indirimTipi: 'yuzde',
      indirimDeger: 10,
      minTutar: 0,
      maxKullanim: 0,
      sonGecerlilik: '',
      aktif: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing || {
          kod: '',
          aciklama: '',
          indirimTipi: 'yuzde',
          indirimDeger: 10,
          minTutar: 0,
          maxKullanim: 0,
          sonGecerlilik: '',
          aktif: true,
        },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    try {
      const payload = { ...data, kod: data.kod.toUpperCase() };
      if (isEdit) {
        await patchDoc('coupons', editing.id, payload);
        toast.success('Kupon güncellendi');
      } else {
        await createDoc('coupons', { ...payload, kullanilan: 0 });
        toast.success('Kupon eklendi');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.code === 'permission-denied' ? 'Yetki yok' : 'Kayıt hatası');
    }
  };

  const tipi = watch('indirimTipi');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kupon Düzenle' : 'Yeni Kupon'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="coupon-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kupon Kodu</label>
          <input
            {...register('kod')}
            className="input font-mono uppercase tracking-wider"
            placeholder="ACILIS50"
            autoFocus
            onChange={(e) => {
              e.target.value = e.target.value.toUpperCase();
            }}
          />
          {errors.kod && <p className="mt-1 text-xs text-red-600">{errors.kod.message}</p>}
          <p className="mt-1 text-xs text-slate-500">Sadece büyük harf, rakam, _ veya -</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama</label>
          <input {...register('aciklama')} className="input" placeholder="Açılış kampanyası vb." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">İndirim Tipi</label>
            <select {...register('indirimTipi')} className="input">
              <option value="yuzde">Yüzde (%)</option>
              <option value="sabit">Sabit (TL)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Değer {tipi === 'yuzde' ? '(%)' : '(TL)'}
            </label>
            <input
              type="number"
              step="0.01"
              {...register('indirimDeger', { valueAsNumber: true })}
              className="input"
            />
            {errors.indirimDeger && (
              <p className="mt-1 text-xs text-red-600">{errors.indirimDeger.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Min Sepet (TL)</label>
            <input
              type="number"
              step="0.01"
              {...register('minTutar', { valueAsNumber: true })}
              className="input"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Max Kullanım
            </label>
            <input
              type="number"
              {...register('maxKullanim', { valueAsNumber: true })}
              className="input"
              placeholder="0 = sınırsız"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Son Geçerlilik Tarihi</label>
          <input type="date" {...register('sonGecerlilik')} className="input" />
          <p className="mt-1 text-xs text-slate-500">Boş = süresiz</p>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Controller
            control={control}
            name="aktif"
            render={({ field }) => <Toggle checked={!!field.value} onChange={field.onChange} />}
          />
        </div>
      </form>
    </Modal>
  );
}
