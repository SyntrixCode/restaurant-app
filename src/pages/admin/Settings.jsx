import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Save, Store, Receipt, Bell, Gift, Settings as SettingsIcon } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Toggle from '../../components/ui/Toggle';
import UpdateCard from '../../components/admin/UpdateCard';
import { useSettingsStore } from '../../store/settingsStore';
import { settingsSchema } from '../../utils/validators';

const DEFAULT_VALUES = {
  restoranAd: '',
  restoranAdres: '',
  restoranTel: '',
  vergiNo: '',
  vergiDairesi: '',
  paraBirimi: 'TL',
  vergiOrani: 10,
  kdvDahilFiyat: true,
  kasaAcilis: '08:00',
  kasaKapanis: '23:00',
  gecikmeEsigiDk: 15,
  dusukStokEsigi: 5,
  fisBasligi: '',
  fisAltMesaji: 'Teşekkür ederiz',
  fisQrUrl: '',
  fisQrMesaj: 'Bizi değerlendirin',
  fisLogoBas: true,
  garsonCagirmaAcik: true,
  sadakatAktif: false,
  puanKazanmaTL: 10,
  puanTLKarsiligi: 1,
  otomatikFisBas: true,
  bildirimAyarlari: {
    gecikme: true,
    dusukStok: true,
    yeniPaket: true,
    callerID: true,
    rezervasyon: true,
    sesliUyari: true,
  },
};

export default function AdminSettings() {
  const { settings, loading, save } = useSettingsStore();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!loading && settings) {
      reset({ ...DEFAULT_VALUES, ...settings });
    }
  }, [loading, settings, reset]);

  const onSubmit = async (data) => {
    try {
      await save(data);
      toast.success('Ayarlar kaydedildi');
      reset(data); // dirty state reset
    } catch (err) {
      console.error(err);
      toast.error('Ayarlar kaydedilemedi');
    }
  };

  return (
    <div className="p-8">
      <form onSubmit={handleSubmit(onSubmit)}>
        <PageHeader
          title="Ayarlar"
          subtitle="Restoran bilgileri, vergi, fiş ve bildirim ayarları"
          actions={
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className="btn-primary disabled:opacity-50"
            >
              <Save size={16} /> {isDirty ? 'Değişiklikleri Kaydet' : 'Kaydedildi'}
            </button>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Restoran Bilgileri */}
          <Section title="Restoran Bilgileri" icon={Store}>
            <Field label="Restoran Adı" error={errors.restoranAd}>
              <input {...register('restoranAd')} className="input" placeholder="Alazlı Konya Mutfağı" />
            </Field>
            <Field label="Adres" error={errors.restoranAdres}>
              <input {...register('restoranAdres')} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefon" error={errors.restoranTel}>
                <input {...register('restoranTel')} className="input" placeholder="0212 000 00 00" />
              </Field>
              <Field label="Vergi No" error={errors.vergiNo}>
                <input {...register('vergiNo')} className="input" />
              </Field>
            </div>
            <Field label="Vergi Dairesi" error={errors.vergiDairesi}>
              <input {...register('vergiDairesi')} className="input" placeholder="Selçuklu" />
            </Field>
          </Section>

          {/* Operasyon */}
          <Section title="Operasyon" icon={SettingsIcon}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Para Birimi" error={errors.paraBirimi}>
                <select {...register('paraBirimi')} className="input">
                  <option value="TL">TL (₺)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </Field>
              <Field label="Vergi Oranı (%)" error={errors.vergiOrani}>
                <input
                  type="number"
                  step="0.1"
                  {...register('vergiOrani', { valueAsNumber: true })}
                  className="input"
                />
              </Field>
            </div>

            <ToggleField
              label="KDV Dahil Fiyat"
              hint="Açıkken ürün fiyatları KDV dahil gösterilir"
              control={control}
              name="kdvDahilFiyat"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Kasa Açılış" error={errors.kasaAcilis}>
                <input type="time" {...register('kasaAcilis')} className="input" />
              </Field>
              <Field label="Kasa Kapanış" error={errors.kasaKapanis}>
                <input type="time" {...register('kasaKapanis')} className="input" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Gecikme Eşiği (dk)" error={errors.gecikmeEsigiDk}>
                <input
                  type="number"
                  {...register('gecikmeEsigiDk', { valueAsNumber: true })}
                  className="input"
                />
              </Field>
              <Field label="Düşük Stok Eşiği" error={errors.dusukStokEsigi}>
                <input
                  type="number"
                  {...register('dusukStokEsigi', { valueAsNumber: true })}
                  className="input"
                />
              </Field>
            </div>
          </Section>

          {/* Fiş */}
          <Section title="Fiş Ayarları" icon={Receipt}>
            <Field label="Fiş Başlığı" error={errors.fisBasligi}>
              <input
                {...register('fisBasligi')}
                className="input font-mono"
                placeholder="Boşsa restoran adı kullanılır"
              />
              <p className="mt-1 text-xs text-slate-500">
                Fişin en üstünde basılır. Boşsa restoran adı kullanılır.
              </p>
            </Field>
            <Field label="Fiş Alt Mesajı" error={errors.fisAltMesaji}>
              <input
                {...register('fisAltMesaji')}
                className="input"
                placeholder="Teşekkür ederiz"
              />
            </Field>
            <ToggleField
              label="Fişte Logo Bas"
              hint="Fişin tepesinde restoran logosu (siyah-beyaz) basılır"
              control={control}
              name="fisLogoBas"
            />
            <Field label="Değerlendirme QR Linki" error={errors.fisQrUrl}>
              <input
                {...register('fisQrUrl')}
                className="input"
                placeholder="https://g.page/r/... (Google yorum linki)"
              />
              <p className="mt-1 text-xs text-slate-500">
                Girilirse fişin altına QR kod basılır. Müşteri okutup değerlendirir. Boşsa QR çıkmaz.
              </p>
            </Field>
            <Field label="QR Üstü Mesaj" error={errors.fisQrMesaj}>
              <input
                {...register('fisQrMesaj')}
                className="input"
                placeholder="Bizi değerlendirin"
              />
            </Field>
            <ToggleField
              label="Otomatik Fiş Bas"
              hint="Ödeme tamamlandığında fiş otomatik basılır"
              control={control}
              name="otomatikFisBas"
            />
          </Section>

          {/* Bildirimler */}
          <Section title="Bildirimler" icon={Bell}>
            <ToggleField
              label="Gecikme Uyarısı"
              hint={`Sipariş ${15} dakikadan fazla aktifte kalırsa bildirim`}
              control={control}
              name="bildirimAyarlari.gecikme"
            />
            <ToggleField
              label="Düşük Stok Uyarısı"
              hint="Eşiğin altına düşen ürünler için bildirim"
              control={control}
              name="bildirimAyarlari.dusukStok"
            />
            <ToggleField
              label="Yeni Paket Sipariş"
              hint="Online paket geldiğinde bildirim"
              control={control}
              name="bildirimAyarlari.yeniPaket"
            />
            <ToggleField
              label="CallerID (Telefon)"
              hint="Tanınmayan numaralardan arama gelince popup"
              control={control}
              name="bildirimAyarlari.callerID"
            />
            <ToggleField
              label="Rezervasyon Hatırlatma"
              hint="Yaklaşan rezervasyonlar için bildirim"
              control={control}
              name="bildirimAyarlari.rezervasyon"
            />
            <ToggleField
              label="Sesli Uyarı"
              hint="Bildirimler ses çıkartır"
              control={control}
              name="bildirimAyarlari.sesliUyari"
            />
            <ToggleField
              label="Masadan Garson Çağırma"
              hint="QR menüde 'Garson Çağır' / 'Hesap İste' butonları gösterilir"
              control={control}
              name="garsonCagirmaAcik"
            />
          </Section>

          {/* Sadakat / Puan */}
          <Section title="Sadakat / Puan" icon={Gift}>
            <ToggleField
              label="Sadakat Programı"
              hint="Paket müşterileri telefonlarına göre puan kazanır (puan, ödeme sonrası eklenir)"
              control={control}
              name="sadakatAktif"
            />
            <Field label="Puan Kazanma Oranı (her kaç TL'ye 1 puan)" error={errors.puanKazanmaTL}>
              <input type="number" step="1" min="1" {...register('puanKazanmaTL')} className="input" placeholder="10" />
            </Field>
            <Field label="1 Puan = Kaç TL İndirim" error={errors.puanTLKarsiligi}>
              <input type="number" step="0.01" min="0.01" {...register('puanTLKarsiligi')} className="input" placeholder="1" />
            </Field>
            <p className="text-xs text-slate-500">
              Örnek: 100 TL paket ödeyen müşteri (oran 10) 10 puan kazanır. 1 puan = 1 TL ise sonraki siparişte 10 TL indirim kullanabilir.
            </p>
          </Section>

          {/* Yazılım Güncelleme — form dışında, kendi state'i */}
          <UpdateCard />
        </div>

        {/* Mobile sticky save */}
        <div className="mt-6 flex justify-end lg:hidden">
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="btn-primary disabled:opacity-50"
          >
            <Save size={16} /> {isDirty ? 'Kaydet' : 'Kaydedildi'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        <Icon size={16} />
        <span>{title}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error.message}</p>}
    </div>
  );
}

function ToggleField({ label, hint, control, name }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Toggle checked={!!field.value} onChange={field.onChange} />
        )}
      />
    </div>
  );
}
