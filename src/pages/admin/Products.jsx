import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Package, Image as ImageIcon, Upload, X, Languages, FileDown } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc, orderBy } from '../../firebase/firestore';
import { productSchema } from '../../utils/validators';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import { SPARK_MODE, getStorageRef } from '../../firebase/config';
import { translateMenu } from '../../firebase/translation';
import { importMenu } from '../../firebase/menuImport';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const { settings } = useSettingsStore();
  const [filter, setFilter] = useState({ categoryId: 'all', stock: 'all', search: '' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleImportMenu = async () => {
    if (importing) return;
    const msg = products.length > 0
      ? `⚠️ MEVCUT ${products.length} ürün ve ${categories.length} kategori SİLİNECEK ve PDF menüsü yüklenecek.\n\nGörseller, fiyatlar ve TR/EN/AR çeviriler dahil olacak.\n\nDevam edilsin mi?`
      : 'PDF menüsünden kategoriler ve ürünler yüklenecek (görsel + TR/EN/AR çeviri dahil). Devam edilsin mi?';
    if (!confirm(msg)) return;
    setImporting(true);
    const t = toast.loading('Menü import ediliyor…');
    try {
      const res = await importMenu({ clearFirst: products.length > 0 });
      toast.success(
        `✓ Import tamam — ${res.categoriesAdded} kategori, ${res.productsAdded} ürün yüklendi (silinen: ${res.categoriesCleared}+${res.productsCleared})`,
        { id: t, duration: 8000 },
      );
    } catch (err) {
      console.error(err);
      toast.error('Import hatası: ' + (err.message || 'bilinmeyen'), { id: t });
    } finally {
      setImporting(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (translating) return;
    if (!confirm('Tüm kategori ve ürünleri TR\'den EN ve AR\'a otomatik çevirelim mi?\n\nMevcut çeviriler korunur (sadece eksik olanlar doldurulur).')) return;
    setTranslating(true);
    const t = toast.loading('Menü çevriliyor… (yeni ürünler için 1-2 dk sürebilir)');
    try {
      const res = await translateMenu({ force: false });
      const c = res?.categories || {};
      const p = res?.products || {};
      toast.success(
        `✓ Çeviri tamam — ${c.updated || 0}+${p.updated || 0} doc güncellendi, ${c.skipped || 0}+${p.skipped || 0} doc zaten çevrili`,
        { id: t, duration: 6000 },
      );
    } catch (err) {
      console.error(err);
      toast.error('Çeviri hatası: ' + (err.message || 'bilinmeyen'), { id: t });
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => watchCollection('categories', setCategories, orderBy('sira', 'asc')), []);

  const globalEsigi = settings.dusukStokEsigi || 5;

  const stockState = (p) => {
    const esik = p.dusukStokEsigi ?? globalEsigi;
    if (p.stok <= 0) return 'out';
    if (p.stok <= esik) return 'low';
    return 'ok';
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filter.categoryId !== 'all' && p.categoryId !== filter.categoryId) return false;
      if (filter.search && !p.ad.toLowerCase().includes(filter.search.toLowerCase())) return false;
      const s = stockState(p);
      if (filter.stock === 'in' && s === 'out') return false;
      if (filter.stock === 'low' && s !== 'low') return false;
      if (filter.stock === 'out' && s !== 'out') return false;
      return true;
    });
  }, [products, filter]);

  const stats = {
    toplam: products.length,
    aktif: products.filter((p) => p.aktif).length,
    dusuk: products.filter((p) => stockState(p) === 'low').length,
    bitti: products.filter((p) => stockState(p) === 'out').length,
  };

  const handleDelete = async (p) => {
    if (!confirm(`"${p.ad}" silinsin mi?`)) return;
    await removeDoc('products', p.id);
    toast.success('Ürün silindi');
  };

  const toggleActive = (p) => patchDoc('products', p.id, { aktif: !p.aktif });

  return (
    <div className="p-8">
      <PageHeader
        title="Ürünler"
        subtitle="Menü ürünleri, stok ve fiyat yönetimi"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportMenu}
              disabled={importing}
              className="btn-secondary"
              title="PDF menüsünden kategoriler + ürünler + görsel + çeviriler yüklenir (mevcut menü silinir)"
            >
              <FileDown size={16} /> {importing ? 'Yükleniyor…' : 'PDF Menüsünü Yükle'}
            </button>
            <button
              onClick={handleAutoTranslate}
              disabled={translating}
              className="btn-secondary"
              title="Tüm kategori ve ürünleri TR'den EN ve AR'a otomatik çevirir (mevcut çeviriler korunur)"
            >
              <Languages size={16} /> {translating ? 'Çevriliyor…' : 'Otomatik Çevir (TR→EN/AR)'}
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="btn-primary"
            >
              <Plus size={16} /> Yeni Ürün
            </button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Toplam Ürün" value={stats.toplam} icon={Package} />
        <StatCard label="Aktif" value={stats.aktif} color="green" />
        <StatCard label="Düşük Stok" value={stats.dusuk} color="amber" />
        <StatCard label="Stokta Yok" value={stats.bitti} color="red" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          placeholder="Ürün ara..."
          className="input max-w-xs"
        />
        <select
          value={filter.categoryId}
          onChange={(e) => setFilter((f) => ({ ...f, categoryId: e.target.value }))}
          className="input max-w-xs"
        >
          <option value="all">Tüm Kategoriler</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ad}
            </option>
          ))}
        </select>
        <select
          value={filter.stock}
          onChange={(e) => setFilter((f) => ({ ...f, stock: e.target.value }))}
          className="input max-w-xs"
        >
          <option value="all">Tüm Stok</option>
          <option value="in">Stokta Var</option>
          <option value="low">Düşük Stok</option>
          <option value="out">Stokta Yok</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Görsel</th>
              <th className="px-3 py-3">Ad</th>
              <th className="px-3 py-3">Kategori</th>
              <th className="px-3 py-3">Fiyat</th>
              <th className="px-3 py-3">Stok</th>
              <th className="px-3 py-3">Aktif</th>
              <th className="px-3 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="py-12 text-center text-slate-500">
                  {products.length === 0 ? 'Henüz ürün yok.' : 'Filtreyle eşleşen ürün yok.'}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.categoryId);
              const state = stockState(p);
              const stockColor =
                state === 'out' ? 'bg-red-100 text-red-700' : state === 'low' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    {p.gorsel ? (
                      <img src={p.gorsel} alt={p.ad} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-400">
                        <ImageIcon size={16} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{p.ad}</td>
                  <td className="px-3 py-2 text-slate-600">{cat?.ad || '-'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{formatTL(p.fiyat)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${stockColor}`}>{p.stok}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Toggle checked={p.aktif} onChange={() => toggleActive(p)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => {
                          setEditing(p);
                          setOpen(true);
                        }}
                        className="btn-ghost px-2 py-1"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ProductModal open={open} onClose={() => setOpen(false)} editing={editing} categories={categories} />
    </div>
  );
}

function ProductModal({ open, onClose, editing, categories }) {
  const isEdit = !!editing;
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      ad: '', categoryId: '', fiyat: 0, stokTakipli: false, stok: 0, aciklama: '', opsiyonlar: [],
      ceviri: { en: { ad: '', aciklama: '' }, ar: { ad: '', aciklama: '' } },
      aktif: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              ad: editing.ad,
              categoryId: editing.categoryId,
              fiyat: editing.fiyat,
              // Mevcut ürünlerde undefined ise eski davranış (takipli) korunur
              stokTakipli: editing.stokTakipli !== false,
              stok: editing.stok,
              dusukStokEsigi: editing.dusukStokEsigi ?? null,
              aciklama: editing.aciklama || '',
              opsiyonlar: editing.opsiyonlar || [],
              ceviri: {
                en: { ad: editing.ceviri?.en?.ad || '', aciklama: editing.ceviri?.en?.aciklama || '' },
                ar: { ad: editing.ceviri?.ar?.ad || '', aciklama: editing.ceviri?.ar?.aciklama || '' },
              },
              aktif: editing.aktif ?? true,
            }
          : {
              ad: '',
              categoryId: categories[0]?.id || '',
              fiyat: 0,
              stokTakipli: false, // Yeni ürünlerde default: stoksuz
              stok: 0,
              dusukStokEsigi: null,
              aciklama: '',
              opsiyonlar: [],
              ceviri: { en: { ad: '', aciklama: '' }, ar: { ad: '', aciklama: '' } },
              aktif: true,
            },
      );
      setImageUrl(editing?.gorsel || '');
    }
  }, [open, editing, reset, categories]);

  const handleImage = async (file) => {
    if (!file) return;
    if (SPARK_MODE) {
      toast.error('Görsel yüklemek için Firebase Blaze plana geçmeniz gerekir.');
      return;
    }
    setUploading(true);
    try {
      const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = await getStorageRef();
      const path = `products/${Date.now()}-${file.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setImageUrl(url);
      toast.success('Görsel yüklendi');
    } catch (err) {
      toast.error('Görsel yüklenemedi');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data) => {
    try {
      const cat = categories.find((c) => c.id === data.categoryId);
      const payload = {
        ...data,
        fiyat: Number(data.fiyat),
        stok: Number(data.stok),
        dusukStokEsigi: data.dusukStokEsigi != null && data.dusukStokEsigi !== '' ? Number(data.dusukStokEsigi) : null,
        categoryAd: cat?.ad || '',
        gorsel: imageUrl || null,
      };
      if (isEdit) {
        await patchDoc('products', editing.id, payload);
        toast.success('Ürün güncellendi');
      } else {
        await createDoc('products', payload);
        toast.success('Ürün eklendi');
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
      title={isEdit ? 'Ürün Düzenle' : 'Yeni Ürün'}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button type="submit" form="prod-form" disabled={isSubmitting} className="btn-primary">
            Kaydet
          </button>
        </>
      }
    >
      <form id="prod-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Ürün Adı</label>
          <input {...register('ad')} className="input" autoFocus />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
          <select {...register('categoryId')} className="input">
            <option value="">Seçin...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ad}
              </option>
            ))}
          </select>
          {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Fiyat (TL)</label>
          <input type="number" step="0.01" {...register('fiyat')} className="input" />
          {errors.fiyat && <p className="mt-1 text-xs text-red-600">{errors.fiyat.message}</p>}
        </div>

        {/* Stok Takibi toggle — mutfak ürünlerinde kapalı, paketli ürünlerde açık */}
        <div className="col-span-2">
          <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Stok Takibi</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Açık: kola, su, paketli ürünler (sınırlı sayı). Kapalı: menemen, pide, kebap (mutfaktan yapılır, stok yok).
              </p>
            </div>
            <Toggle
              checked={!!watch('stokTakipli')}
              onChange={(v) => setValue('stokTakipli', v, { shouldDirty: true })}
            />
          </div>
        </div>

        {watch('stokTakipli') && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Stok</label>
              <input type="number" {...register('stok')} className="input" />
              {errors.stok && <p className="mt-1 text-xs text-red-600">{errors.stok.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Düşük Stok Eşiği (opsiyonel)
              </label>
              <input
                type="number"
                {...register('dusukStokEsigi')}
                className="input"
                placeholder="Boş = global ayar"
              />
            </div>
          </>
        )}

        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama</label>
          <textarea {...register('aciklama')} rows={2} className="input" />
        </div>

        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Opsiyonlar (sipariş notları)
          </label>
          <OptionTagsInput
            value={watch('opsiyonlar') || []}
            onChange={(arr) => setValue('opsiyonlar', arr, { shouldDirty: true })}
            placeholder="acılı, acısız, soğansız ..."
          />
          <p className="mt-1 text-xs text-slate-500">
            Garson siparişe eklerken bu seçenekler çıkar. Birden fazla seçilebilir, fiyatı etkilemez.
          </p>
        </div>

        <details className="col-span-2 rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Çeviriler (QR menü — opsiyonel)
          </summary>
          <p className="mt-1 text-xs text-slate-500">
            Boş bırakılan diller müşteri menüsünde Türkçe gösterilir.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">İngilizce ad</label>
              <input {...register('ceviri.en.ad')} className="input" placeholder="English name" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">İngilizce açıklama</label>
              <input {...register('ceviri.en.aciklama')} className="input" placeholder="English description" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Arapça ad</label>
              <input {...register('ceviri.ar.ad')} className="input" dir="rtl" placeholder="الاسم بالعربية" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Arapça açıklama</label>
              <input {...register('ceviri.ar.aciklama')} className="input" dir="rtl" placeholder="الوصف بالعربية" />
            </div>
          </div>
        </details>

        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Görsel</label>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img src={imageUrl} className="h-16 w-16 rounded object-cover" alt="" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-slate-400">
                <ImageIcon size={20} />
              </div>
            )}
            <label className={`btn-secondary cursor-pointer ${SPARK_MODE ? 'opacity-60' : ''}`}>
              <Upload size={14} />
              {SPARK_MODE
                ? 'Görsel (Blaze gerekli)'
                : uploading
                  ? 'Yükleniyor...'
                  : 'Görsel Yükle'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={SPARK_MODE}
                onChange={(e) => handleImage(e.target.files?.[0])}
              />
            </label>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl('')} className="btn-ghost text-xs">
                Kaldır
              </button>
            )}
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Toggle checked={watch('aktif')} onChange={(v) => setValue('aktif', v)} />
        </div>
      </form>
    </Modal>
  );
}

function OptionTagsInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const tags = Array.isArray(value) ? value : [];

  const commit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Virgülle birden fazla yapıştırılırsa hepsini ekle
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    const unique = [...new Set([...tags, ...parts])];
    onChange(unique);
    setInput('');
  };

  const remove = (idx) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 focus-within:border-blue-500">
      {tags.map((t, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"
        >
          {t}
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-full p-0.5 hover:bg-blue-200"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !input && tags.length > 0) {
            remove(tags.length - 1);
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
      />
    </div>
  );
}
