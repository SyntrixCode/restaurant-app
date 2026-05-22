import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Printer as PrinterIcon, Star } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc } from '../../firebase/firestore';
import { printerSchema } from '../../utils/validators';

export default function Printers() {
  const [printers, setPrinters] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => watchCollection('printers', setPrinters), []);

  const setDefault = async (p) => {
    const others = printers.filter((x) => x.varsayilan && x.id !== p.id);
    for (const x of others) await patchDoc('printers', x.id, { varsayilan: false });
    await patchDoc('printers', p.id, { varsayilan: true });
    toast.success(`${p.ad} varsayılan yazıcı olarak işaretlendi`);
  };

  const handleDelete = async (p) => {
    if (!confirm(`${p.ad} silinsin mi? Bu yazıcıya bağlı kategorilerin yazıcısı silinecek.`)) return;
    await removeDoc('printers', p.id);
    toast.success('Yazıcı silindi');
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Yazıcılar"
        subtitle="Mutfak / bar yazıcıları ve kategori yönlendirme"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Yeni Yazıcı
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {printers.length === 0 && (
          <div className="card col-span-full flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
            <PrinterIcon size={40} className="text-slate-300" />
            <p>Henüz yazıcı yok.</p>
            <p className="text-xs">
              Önce yazıcı ekleyin, ardından "Kategoriler" sayfasında her kategoriye atayın.
            </p>
          </div>
        )}
        {printers.map((p) => (
          <div key={p.id} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <PrinterIcon size={18} />
                {p.ad}
                {p.varsayilan && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <Star size={12} /> Varsayılan
                  </span>
                )}
              </h3>
              <Toggle
                checked={p.aktif}
                onChange={(v) => patchDoc('printers', p.id, { aktif: v })}
              />
            </div>
            <p className="font-mono text-sm text-slate-600">
              {p.ip}:{p.port || 9100}
            </p>
            <div className="mt-2 flex gap-2">
              {!p.varsayilan && (
                <button onClick={() => setDefault(p)} className="btn-ghost flex-1 text-xs">
                  <Star size={14} /> Varsayılan Yap
                </button>
              )}
              <button
                onClick={() => {
                  setEditing(p);
                  setOpen(true);
                }}
                className="btn-ghost flex-1 text-xs"
              >
                <Pencil size={14} /> Düzenle
              </button>
              <button
                onClick={() => handleDelete(p)}
                className="btn-ghost flex-1 text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Sil
              </button>
            </div>
          </div>
        ))}
      </div>

      <PrinterModal open={open} onClose={() => setOpen(false)} editing={editing} />
    </div>
  );
}

function PrinterModal({ open, onClose, editing }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(printerSchema),
    defaultValues: { ad: '', ip: '', port: 9100, varsayilan: false, aktif: true },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              ad: editing.ad,
              ip: editing.ip,
              port: editing.port || 9100,
              varsayilan: editing.varsayilan ?? false,
              aktif: editing.aktif ?? true,
            }
          : { ad: '', ip: '', port: 9100, varsayilan: false, aktif: true },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        await patchDoc('printers', editing.id, data);
        toast.success('Yazıcı güncellendi');
      } else {
        await createDoc('printers', data);
        toast.success('Yazıcı eklendi');
      }
      onClose();
    } catch (err) {
      toast.error('Kayıt hatası');
      console.error(err);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Yazıcı Düzenle' : 'Yeni Yazıcı'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button type="submit" form="printer-form" disabled={isSubmitting} className="btn-primary">
            Kaydet
          </button>
        </>
      }
    >
      <form id="printer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ad</label>
          <input {...register('ad')} className="input" placeholder="Mutfak / Bar / Pastane" autoFocus />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">IP Adresi</label>
            <input {...register('ip')} className="input font-mono" placeholder="192.168.1.50" />
            {errors.ip && <p className="mt-1 text-xs text-red-600">{errors.ip.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Port</label>
            <input type="number" {...register('port')} className="input" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Varsayılan yazıcı</span>
          <Toggle checked={watch('varsayilan')} onChange={(v) => setValue('varsayilan', v)} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Toggle checked={watch('aktif')} onChange={(v) => setValue('aktif', v)} />
        </div>
        <p className="text-xs text-slate-500">
          Bu yazıcıya yönlendirilen kategorilerin siparişleri buradan ESC/POS protokolü ile basılır.
          Kategori atama "Kategoriler" sayfasından yapılır.
        </p>
      </form>
    </Modal>
  );
}
