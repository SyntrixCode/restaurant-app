import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Wheat,
  Search,
  Package as PackageIcon,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc } from '../../firebase/firestore';
import { ingredientSchema } from '../../utils/validators';
import { formatTL, formatAdet } from '../../utils/format';

const BIRIM_LABELS = {
  adet: 'adet',
  kg: 'kg',
  gram: 'g',
  lt: 'lt',
  ml: 'ml',
  paket: 'paket',
};

export default function AdminIngredients() {
  const [ingredients, setIngredients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKategori, setFilterKategori] = useState('all');

  useEffect(() => watchCollection('ingredients', setIngredients), []);
  useEffect(() => watchCollection('suppliers', setSuppliers), []);

  const kategoriler = useMemo(() => {
    const set = new Set();
    ingredients.forEach((i) => i.kategori && set.add(i.kategori));
    return [...set];
  }, [ingredients]);

  const filtered = useMemo(() => {
    let list = ingredients;
    if (filterKategori !== 'all') list = list.filter((i) => i.kategori === filterKategori);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.ad?.toLowerCase().includes(q));
    }
    return list;
  }, [ingredients, search, filterKategori]);

  const aktifSayisi = ingredients.filter((i) => i.aktif !== false).length;
  const dusukStok = ingredients.filter(
    (i) => i.aktif !== false && i.dusukStokEsigi != null && i.stok <= i.dusukStokEsigi,
  );

  const handleDelete = async (i) => {
    if (!confirm(`"${i.ad}" malzemesi silinsin mi?\n\nBu malzemeyi kullanan reçeteler bozulabilir.`))
      return;
    try {
      await removeDoc('ingredients', i.id);
      toast.success('Malzeme silindi');
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Malzemeler"
        subtitle="Reçete bazlı stok için hammadde tanımları (un, kıyma, yağ vb.)"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Yeni Malzeme
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Malzeme" value={ingredients.length} icon={Wheat} />
        <StatCard label="Aktif" value={aktifSayisi} color="green" />
        <StatCard
          label="Düşük Stok"
          value={dusukStok.length}
          color={dusukStok.length > 0 ? 'red' : 'green'}
        />
      </div>

      {dusukStok.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
            ⚠️ Düşük Stoklu Malzemeler
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {dusukStok.map((i) => (
              <span key={i.id} className="rounded-full bg-amber-200 px-2 py-0.5 text-amber-900">
                {i.ad}: <strong>{formatAdet(i.stok)} {BIRIM_LABELS[i.birim]}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Malzeme ara..."
            className="input pl-8"
          />
        </div>
        <select
          value={filterKategori}
          onChange={(e) => setFilterKategori(e.target.value)}
          className="input max-w-xs"
        >
          <option value="all">Tüm Kategoriler</option>
          {kategoriler.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <Wheat size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Malzeme yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((i) => {
              const dusuk = i.dusukStokEsigi != null && i.stok <= i.dusukStokEsigi;
              const tedarikci = suppliers.find((s) => s.id === i.tedarikciId);
              return (
                <li
                  key={i.id}
                  className={`grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm ${
                    i.aktif === false ? 'opacity-60' : ''
                  }`}
                >
                  <div className="col-span-3">
                    <p className="font-medium text-slate-900">{i.ad}</p>
                    {i.kategori && (
                      <span className="mt-0.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
                        {i.kategori}
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        dusuk
                          ? i.stok === 0
                            ? 'bg-red-200 text-red-800'
                            : 'bg-amber-200 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {formatAdet(i.stok)} {BIRIM_LABELS[i.birim]}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-slate-500">
                    {i.dusukStokEsigi != null && (
                      <p>
                        Eşik: {formatAdet(i.dusukStokEsigi)} {BIRIM_LABELS[i.birim]}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 text-xs text-slate-700">
                    {i.birimMaliyet != null && i.birimMaliyet > 0 && (
                      <p>
                        {formatTL(i.birimMaliyet)} / {BIRIM_LABELS[i.birim]}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 text-xs text-slate-500">
                    {tedarikci?.ad || '—'}
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditing(i);
                        setOpen(true);
                      }}
                      className="btn-ghost px-2 py-1"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(i)}
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

      <IngredientModal
        open={open}
        editing={editing}
        suppliers={suppliers}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function IngredientModal({ open, editing, suppliers, onClose }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      ad: '',
      birim: 'kg',
      stok: 0,
      dusukStokEsigi: null,
      birimMaliyet: null,
      tedarikciId: '',
      kategori: '',
      aktif: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              ...editing,
              dusukStokEsigi: editing.dusukStokEsigi ?? '',
              birimMaliyet: editing.birimMaliyet ?? '',
              aktif: editing.aktif !== false,
            }
          : {
              ad: '',
              birim: 'kg',
              stok: 0,
              dusukStokEsigi: '',
              birimMaliyet: '',
              tedarikciId: '',
              kategori: '',
              aktif: true,
            },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        ...data,
        dusukStokEsigi: data.dusukStokEsigi === '' || data.dusukStokEsigi == null ? null : Number(data.dusukStokEsigi),
        birimMaliyet: data.birimMaliyet === '' || data.birimMaliyet == null ? null : Number(data.birimMaliyet),
        tedarikciId: data.tedarikciId || null,
      };
      if (isEdit) {
        await patchDoc('ingredients', editing.id, payload);
        toast.success('Malzeme güncellendi');
      } else {
        await createDoc('ingredients', payload);
        toast.success('Malzeme eklendi');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Kayıt hatası');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Malzeme Düzenle' : 'Yeni Malzeme'}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="ing-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="ing-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Malzeme Adı</label>
          <input {...register('ad')} className="input" autoFocus placeholder="Kıyma, Un, Yumurta..." />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Birim</label>
            <select {...register('birim')} className="input">
              <option value="kg">Kilogram (kg)</option>
              <option value="gram">Gram (g)</option>
              <option value="lt">Litre (lt)</option>
              <option value="ml">Mililitre (ml)</option>
              <option value="adet">Adet</option>
              <option value="paket">Paket</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
            <input
              {...register('kategori')}
              className="input"
              placeholder="Et / Sebze / Süt ürünü..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mevcut Stok</label>
            <input
              type="number"
              step="0.01"
              {...register('stok', { valueAsNumber: true })}
              className="input"
            />
            {errors.stok && <p className="mt-1 text-xs text-red-600">{errors.stok.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Düşük Stok Eşiği</label>
            <input
              type="number"
              step="0.01"
              {...register('dusukStokEsigi')}
              className="input"
              placeholder="Boş = uyarı yok"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Birim Maliyet (TL)</label>
            <input
              type="number"
              step="0.01"
              {...register('birimMaliyet')}
              className="input"
              placeholder="Opsiyonel"
            />
          </div>
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
