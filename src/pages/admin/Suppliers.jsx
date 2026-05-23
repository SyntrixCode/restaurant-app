import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  Phone,
  Mail,
  MapPin,
  Search,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc } from '../../firebase/firestore';
import { supplierSchema } from '../../utils/validators';

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => watchCollection('suppliers', setSuppliers), []);

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.ad?.toLowerCase().includes(q) ||
        s.iletisimAd?.toLowerCase().includes(q) ||
        s.telefon?.toLowerCase().includes(q) ||
        s.kategori?.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const aktifSayisi = suppliers.filter((s) => s.aktif !== false).length;

  const handleDelete = async (s) => {
    if (!confirm(`"${s.ad}" tedarikçisi silinsin mi?`)) return;
    try {
      await removeDoc('suppliers', s.id);
      toast.success('Tedarikçi silindi');
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  };

  const handleToggle = async (s) => {
    try {
      await patchDoc('suppliers', s.id, { aktif: !(s.aktif !== false) });
    } catch (err) {
      console.error(err);
      toast.error('Güncellenemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Tedarikçiler"
        subtitle="Et, sebze, içecek, ekmek vb. tedarikçi rehberi"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Yeni Tedarikçi
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Tedarikçi" value={suppliers.length} icon={Truck} />
        <StatCard label="Aktif" value={aktifSayisi} color="green" />
        <StatCard label="Pasif" value={suppliers.length - aktifSayisi} color="amber" />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad / kontak / tel / kategori..."
            className="input pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <Truck size={48} className="text-slate-300" />
          <p>Tedarikçi yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`card ${s.aktif === false ? 'opacity-60' : ''}`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{s.ad}</h3>
                  {s.kategori && (
                    <span className="mt-0.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {s.kategori}
                    </span>
                  )}
                </div>
                <Toggle checked={s.aktif !== false} onChange={() => handleToggle(s)} />
              </div>

              {s.iletisimAd && (
                <p className="mb-1 text-sm text-slate-700">{s.iletisimAd}</p>
              )}

              <div className="space-y-1 text-xs text-slate-600">
                {s.telefon && (
                  <p className="flex items-center gap-1.5">
                    <Phone size={11} className="text-slate-400" />
                    <a href={`tel:${s.telefon}`} className="hover:underline">
                      {s.telefon}
                    </a>
                  </p>
                )}
                {s.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail size={11} className="text-slate-400" />
                    <a href={`mailto:${s.email}`} className="hover:underline">
                      {s.email}
                    </a>
                  </p>
                )}
                {s.adres && (
                  <p className="flex items-start gap-1.5">
                    <MapPin size={11} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="line-clamp-2">{s.adres}</span>
                  </p>
                )}
              </div>

              {s.notlar && (
                <p className="mt-2 line-clamp-2 rounded bg-slate-50 p-2 text-xs italic text-slate-600">
                  {s.notlar}
                </p>
              )}

              <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-3">
                <button
                  onClick={() => {
                    setEditing(s);
                    setOpen(true);
                  }}
                  className="btn-ghost px-2 py-1 text-sm"
                >
                  <Pencil size={14} /> Düzenle
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  className="btn-ghost px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SupplierModal open={open} editing={editing} onClose={() => setOpen(false)} />
    </div>
  );
}

function SupplierModal({ open, editing, onClose }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      ad: '',
      iletisimAd: '',
      telefon: '',
      email: '',
      adres: '',
      kategori: '',
      notlar: '',
      aktif: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? { ...editing, aktif: editing.aktif !== false }
          : {
              ad: '',
              iletisimAd: '',
              telefon: '',
              email: '',
              adres: '',
              kategori: '',
              notlar: '',
              aktif: true,
            },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        await patchDoc('suppliers', editing.id, data);
        toast.success('Tedarikçi güncellendi');
      } else {
        await createDoc('suppliers', data);
        toast.success('Tedarikçi eklendi');
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
      title={isEdit ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="supplier-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tedarikçi Adı</label>
          <input {...register('ad')} className="input" autoFocus placeholder="Örn: Mehmet Et" />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
            <input
              {...register('kategori')}
              className="input"
              placeholder="Et / Sebze / İçecek..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">İletişim Kişisi</label>
            <input {...register('iletisimAd')} className="input" placeholder="Ad soyad" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
            <input {...register('telefon')} className="input" placeholder="0212 ..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-posta</label>
            <input {...register('email')} type="email" className="input" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Adres</label>
          <textarea {...register('adres')} rows={2} className="input" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Not</label>
          <input
            {...register('notlar')}
            className="input"
            placeholder="Ödeme şartı, sevkiyat günü vs."
          />
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
