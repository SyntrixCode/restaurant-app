import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Printer as PrinterIcon, Star, Zap, Wallet, Bell, Receipt, ClipboardList } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import PageHeader from '../../components/layout/PageHeader';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc } from '../../firebase/firestore';
import { printerSchema } from '../../utils/validators';
import { testNetworkPrinter, openCashDrawer, triggerBuzzer, printNetworkReceipt } from '../../plugins/networkPrinter';
import { groupItemsByPrinter } from '../../utils/printerRouting';

export default function Printers() {
  const [printers, setPrinters] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [listPrinting, setListPrinting] = useState(false);

  useEffect(() => watchCollection('printers', setPrinters), []);
  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => watchCollection('categories', setCategories), []);

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

  const handleTest = async (p) => {
    const t = toast.loading(`${p.ad} test ediliyor…`);
    try {
      await testNetworkPrinter({ ip: p.ip, model: p.model || 'SRP-E300', connection: p.baglanti || 'ethernet' });
      toast.success(`${p.ad}: test sayfası gönderildi`, { id: t });
    } catch (err) {
      toast.error(`${p.ad}: ${err?.message || err}`, { id: t, duration: 6000 });
    }
  };

  const handleOpenDrawer = async (p) => {
    const t = toast.loading(`${p.ad}: kasa açılıyor…`);
    try {
      await openCashDrawer({ ip: p.ip, model: p.model || 'SRP-E300', connection: p.baglanti || 'ethernet' });
      toast.success(`${p.ad}: kasa açıldı`, { id: t });
    } catch (err) {
      toast.error(`${p.ad}: ${err?.message || err}`, { id: t, duration: 6000 });
    }
  };

  const handleBuzzer = async (p) => {
    const t = toast.loading(`${p.ad}: zil çalınıyor…`);
    try {
      await triggerBuzzer({
        ip: p.ip,
        model: p.model || 'SRP-E300',
        connection: p.baglanti || 'ethernet',
        pulses: 2,
        gap: 200,
      });
      toast.success(`${p.ad}: zil tetiklendi`, { id: t });
    } catch (err) {
      toast.error(`${p.ad}: ${err?.message || err}`, { id: t, duration: 6000 });
    }
  };

  // Her yazıcıdan, O YAZICIDAN basılan ürünlerin listesini çıkar (sipariş/ciro oluşmadan).
  // Hem bağlantıyı hem ürün→yazıcı yönlendirmesini tek seferde doğrular.
  const handlePrintRoutingMap = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error(
        'Bu işlem yazıcılara baskı gönderir — restorandaki TABLET üzerinden (yazıcı ağına bağlı) çalıştırın.',
        { duration: 7000 },
      );
      return;
    }
    const aktifUrun = products.filter((p) => p.aktif !== false);
    const groups = groupItemsByPrinter(aktifUrun, categories, printers);
    if (groups.length === 0) {
      toast.error('Aktif ve IP’li yazıcı bulunamadı.');
      return;
    }
    setListPrinting(true);
    const t = toast.loading('Tüm yazıcılardan ürün listesi basılıyor…');
    let ok = 0;
    let fail = 0;
    for (const g of groups) {
      const urunler = [...g.items].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
      const lines = [
        { type: 'text', text: 'URUN LISTESI (TEST)', align: 'center', size: 30, bold: true },
        { type: 'text', text: `» ${String(g.printer.ad).toLocaleUpperCase('tr-TR')} «`, align: 'center', size: 40, bold: true },
        { type: 'text', text: `${g.printer.ip || ''}`, align: 'center', size: 20 },
        { type: 'divider' },
        { type: 'text', text: `Bu yazicidan ${urunler.length} urun basilir:`, size: 24, bold: true },
        ...urunler.map((u, i) => ({ type: 'text', text: `${i + 1}. ${u.ad}`, size: 26 })),
        { type: 'divider' },
        { type: 'text', text: 'Yazici/urun yonlendirme testi', align: 'center', size: 20 },
        { type: 'feed', lines: 1 },
      ];
      try {
        await printNetworkReceipt({
          ip: g.printer.ip,
          model: g.printer.model || 'SRP-E300',
          connection: g.printer.baglanti || 'ethernet',
          lines,
          cut: true,
          feedLines: 3,
        });
        ok++;
      } catch (err) {
        fail++;
        console.warn(`Liste basılamadı (${g.printer.ad} @ ${g.printer.ip}):`, err?.message || err);
      }
    }
    setListPrinting(false);
    toast[fail ? 'error' : 'success'](
      `${ok} yazıcıdan liste basıldı${fail ? ` · ${fail} yazıcı başarısız` : ''}`,
      { id: t, duration: 6000 },
    );
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Yazıcılar"
        subtitle="Mutfak / bar yazıcıları ve kategori yönlendirme"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrintRoutingMap}
              disabled={listPrinting}
              className="btn-secondary disabled:opacity-50"
              title="Her yazıcıdan, o yazıcının bastığı ürünlerin listesini çıkarır (sipariş/ciro oluşmaz)"
            >
              <ClipboardList size={16} /> {listPrinting ? 'Basılıyor…' : 'Yazıcı–Ürün Listesi Bas'}
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="btn-primary"
            >
              <Plus size={16} /> Yeni Yazıcı
            </button>
          </div>
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
              {(p.baglanti || 'ethernet') === 'usb'
                ? 'USB bağlantısı'
                : `${p.ip}:${p.port || 9100}`}
            </p>
            {p.kasaBagli && (
              <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <Wallet size={12} /> Para kasası bağlı
              </p>
            )}
            {p.siparisZili && (
              <p className="flex items-center gap-1 text-xs font-medium text-blue-700">
                <Bell size={12} /> Sipariş zili bağlı
              </p>
            )}
            {p.adisyonBas && (
              <p className="flex items-center gap-1 text-xs font-medium text-purple-700">
                <Receipt size={12} /> Adisyon basıcı
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => handleTest(p)} className="btn-ghost flex-1 text-xs text-emerald-700 hover:bg-emerald-50">
                <Zap size={14} /> Test Yazdır
              </button>
              {p.kasaBagli && (
                <button onClick={() => handleOpenDrawer(p)} className="btn-ghost flex-1 text-xs text-amber-700 hover:bg-amber-50">
                  <Wallet size={14} /> Kasayı Aç
                </button>
              )}
              {p.siparisZili && (
                <button onClick={() => handleBuzzer(p)} className="btn-ghost flex-1 text-xs text-blue-700 hover:bg-blue-50">
                  <Bell size={14} /> Zili Çal
                </button>
              )}
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
    defaultValues: { ad: '', model: 'SRP-E300', baglanti: 'ethernet', ip: '', port: 9100, varsayilan: false, aktif: true, kasaBagli: false, siparisZili: false, adisyonBas: false },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              ad: editing.ad,
              model: editing.model || 'SRP-E300',
              baglanti: editing.baglanti || 'ethernet',
              ip: editing.ip || '',
              port: editing.port || 9100,
              varsayilan: editing.varsayilan ?? false,
              aktif: editing.aktif ?? true,
              kasaBagli: editing.kasaBagli ?? false,
              siparisZili: editing.siparisZili ?? false,
              adisyonBas: editing.adisyonBas ?? false,
            }
          : { ad: '', model: 'SRP-E300', ip: '', port: 9100, varsayilan: false, aktif: true, kasaBagli: false },
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
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
          <select {...register('model')} className="input">
            <option value="SRP-E300">Bixolon SRP-E300 (80mm)</option>
            <option value="SRP-E302">Bixolon SRP-E302</option>
            <option value="SRP-QE300">Bixolon SRP-QE300</option>
            <option value="SRP-QE302">Bixolon SRP-QE302</option>
            <option value="SRP-380">Bixolon SRP-380</option>
            <option value="SRP-350III">Bixolon SRP-350III</option>
            <option value="SRP-350V">Bixolon SRP-350V</option>
            <option value="SRP-Q300">Bixolon SRP-Q300</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Bağlantı</label>
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium ${watch('baglanti') === 'ethernet' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}>
              <input type="radio" value="ethernet" {...register('baglanti')} className="sr-only" />
              Ethernet (LAN)
            </label>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium ${watch('baglanti') === 'usb' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}>
              <input type="radio" value="usb" {...register('baglanti')} className="sr-only" />
              USB
            </label>
          </div>
        </div>
        {watch('baglanti') === 'ethernet' && (
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
        )}
        {watch('baglanti') === 'usb' && (
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            Yazıcıyı tablete USB kablosuyla bağlayın. İlk kullanımda Android USB izni isteyecektir, onaylayın.
            Cihaz Bixolon SDK ile otomatik bulunur — IP gerekmez.
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Varsayılan yazıcı</span>
          <Toggle checked={watch('varsayilan')} onChange={(v) => setValue('varsayilan', v)} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Toggle checked={watch('aktif')} onChange={(v) => setValue('aktif', v)} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
          <div>
            <span className="text-sm font-medium text-slate-700">Para kasası bağlı</span>
            <p className="text-xs text-slate-500">Yazıcının DK portunda bir para kasası varsa nakit ödemede otomatik açılır.</p>
          </div>
          <Toggle checked={watch('kasaBagli')} onChange={(v) => setValue('kasaBagli', v)} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
          <div>
            <span className="text-sm font-medium text-slate-700">Sipariş zili (buzzer) bağlı</span>
            <p className="text-xs text-slate-500">
              DK portuna bir buzzer takılıysa mutfak adisyonu basıldıktan sonra otomatik çalar.
              Sipariş tipine göre farklı pattern: yeni 1 bip, paket 2 bip, ek sipariş 2 hızlı bip, iptal 3 uzun bip.
            </p>
          </div>
          <Toggle checked={watch('siparisZili')} onChange={(v) => setValue('siparisZili', v)} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
          <div>
            <span className="text-sm font-medium text-slate-700">Adisyon basabilir</span>
            <p className="text-xs text-slate-500">
              Müşteriye verilen hesap fişi (adisyon) ve ödeme fişi bu yazıcıdan basılır.
              Birden fazla işaretli yazıcı varsa her POS tableti kendi adisyon yazıcısını
              POS &rarr; Ayarlar'dan seçer.
            </p>
          </div>
          <Toggle checked={watch('adisyonBas')} onChange={(v) => setValue('adisyonBas', v)} />
        </div>
        <p className="text-xs text-slate-500">
          Bu yazıcıya yönlendirilen kategorilerin siparişleri buradan ESC/POS protokolü ile basılır.
          Kategori atama "Kategoriler" sayfasından yapılır.
        </p>
      </form>
    </Modal>
  );
}
