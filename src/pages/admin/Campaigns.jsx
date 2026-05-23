import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Megaphone, Calendar, Clock } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc } from '../../firebase/firestore';
import { campaignSchema } from '../../utils/validators';
import { formatTL } from '../../utils/format';
import { isCampaignActive } from '../../utils/discount';

const GUN_LABELS = ['Pzr', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => watchCollection('campaigns', setCampaigns), []);

  const activeNow = campaigns.filter((c) => isCampaignActive(c, 999999));
  const totalActive = campaigns.filter((c) => c.aktif).length;

  const handleDelete = async (c) => {
    if (!confirm(`"${c.ad}" kampanyası silinsin mi?`)) return;
    try {
      await removeDoc('campaigns', c.id);
      toast.success('Kampanya silindi');
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  };

  const handleToggle = async (c) => {
    try {
      await patchDoc('campaigns', c.id, { aktif: !c.aktif });
    } catch (err) {
      console.error(err);
      toast.error('Güncellenemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Kampanyalar"
        subtitle="Otomatik uygulanan indirimleri yönet (en büyük indirim kuralı)"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Yeni Kampanya
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Kampanya" value={campaigns.length} icon={Megaphone} />
        <StatCard label="Aktif" value={totalActive} color="green" />
        <StatCard label="Şu An Geçerli" value={activeNow.length} color="blue" />
      </div>

      <div className="card overflow-hidden p-0">
        {campaigns.length === 0 ? (
          <div className="px-4 py-16 text-center text-slate-500">
            <Megaphone size={32} className="mx-auto mb-2 text-slate-300" />
            <p>Henüz kampanya yok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {campaigns.map((c) => {
              const aktifSimdi = isCampaignActive(c, 999999);
              return (
                <li key={c.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <div className="col-span-4">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{c.ad}</p>
                      {aktifSimdi && c.aktif && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          ŞU AN GEÇERLİ
                        </span>
                      )}
                    </div>
                    {c.aciklama && <p className="text-xs text-slate-500">{c.aciklama}</p>}
                  </div>
                  <div className="col-span-2 text-sm font-semibold text-blue-700">
                    {c.indirimTipi === 'yuzde' ? `%${c.indirimDeger}` : formatTL(c.indirimDeger)}
                  </div>
                  <div className="col-span-3 text-xs text-slate-600">
                    {c.gunler && c.gunler.length > 0 && (
                      <p className="flex items-center gap-1">
                        <Calendar size={11} />
                        {c.gunler.map((g) => GUN_LABELS[g]).join(', ')}
                      </p>
                    )}
                    {c.baslangicSaat && c.bitisSaat && (
                      <p className="flex items-center gap-1">
                        <Clock size={11} />
                        {c.baslangicSaat} - {c.bitisSaat}
                      </p>
                    )}
                    {c.minTutar > 0 && <p>Min: {formatTL(c.minTutar)}</p>}
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

      <CampaignModal open={open} editing={editing} onClose={() => setOpen(false)} />
    </div>
  );
}

function CampaignModal({ open, editing, onClose }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      ad: '',
      aciklama: '',
      indirimTipi: 'yuzde',
      indirimDeger: 10,
      minTutar: 0,
      aktif: true,
      baslangicTarih: '',
      bitisTarih: '',
      gunler: [],
      baslangicSaat: '',
      bitisSaat: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing || {
          ad: '',
          aciklama: '',
          indirimTipi: 'yuzde',
          indirimDeger: 10,
          minTutar: 0,
          aktif: true,
          baslangicTarih: '',
          bitisTarih: '',
          gunler: [],
          baslangicSaat: '',
          bitisSaat: '',
        },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        await patchDoc('campaigns', editing.id, data);
        toast.success('Kampanya güncellendi');
      } else {
        await createDoc('campaigns', data);
        toast.success('Kampanya eklendi');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Kayıt hatası');
    }
  };

  const tipi = watch('indirimTipi');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kampanya Düzenle' : 'Yeni Kampanya'}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="campaign-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="campaign-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kampanya Adı</label>
          <input {...register('ad')} className="input" placeholder="Salı Salı Pide -%20" autoFocus />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama</label>
          <input {...register('aciklama')} className="input" placeholder="Müşteriye gösterilecek not (opsiyonel)" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">İndirim Tipi</label>
            <select {...register('indirimTipi')} className="input">
              <option value="yuzde">Yüzde (%)</option>
              <option value="sabit">Sabit Tutar (TL)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              İndirim Değeri {tipi === 'yuzde' ? '(%)' : '(TL)'}
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

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Minimum Sepet Tutarı (TL)
          </label>
          <input
            type="number"
            step="0.01"
            {...register('minTutar', { valueAsNumber: true })}
            className="input"
            placeholder="0 = sınırsız"
          />
        </div>

        <hr className="my-2" />
        <p className="text-xs uppercase tracking-wider text-slate-500">Geçerlilik (boş = her zaman)</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-700">Başlangıç Tarihi</label>
            <input type="date" {...register('baslangicTarih')} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">Bitiş Tarihi</label>
            <input type="date" {...register('bitisTarih')} className="input" />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Geçerli Günler</label>
          <Controller
            control={control}
            name="gunler"
            render={({ field }) => (
              <div className="grid grid-cols-7 gap-1">
                {GUN_LABELS.map((g, idx) => {
                  const selected = field.value?.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? field.value.filter((i) => i !== idx)
                          : [...(field.value || []), idx];
                        field.onChange(next);
                      }}
                      className={`rounded-lg border-2 py-2 text-xs font-semibold transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            )}
          />
          <p className="mt-1 text-xs text-slate-500">Hiçbiri seçili değilse her gün geçerli olur.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-700">Başlangıç Saati</label>
            <input type="time" {...register('baslangicSaat')} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">Bitiş Saati</label>
            <input type="time" {...register('bitisSaat')} className="input" />
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
