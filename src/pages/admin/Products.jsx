import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Package, Image as ImageIcon, Upload, X, Languages, FileDown, GripVertical } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc, orderBy, writeBatch, serverTimestamp } from '../../firebase/firestore';
import { productSchema } from '../../utils/validators';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import { SPARK_MODE, getStorageRef, db } from '../../firebase/config';
import { translateMenu } from '../../firebase/translation';
import { importMenu } from '../../firebase/menuImport';
import { doc } from 'firebase/firestore';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [printers, setPrinters] = useState([]);
  const { settings } = useSettingsStore();
  const [filter, setFilter] = useState({ categoryId: 'all', stock: 'all', search: '' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [order, setOrder] = useState([]); // sürükle-sırala için ürün id sırası
  const [dirty, setDirty] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
  useEffect(() => watchCollection('printers', setPrinters), []);

  const globalEsigi = settings.dusukStokEsigi || 5;

  const stockState = (p) => {
    if (p.stokTakipli === false) return 'untracked'; // pide/kebap — stok yok, takipsiz
    const esik = p.dusukStokEsigi ?? globalEsigi;
    if (p.stok <= 0) return 'out';
    if (p.stok <= esik) return 'low';
    return 'ok';
  };

  // Sürükle-sırala yalnızca tek kategori seçiliyken (arama/stok filtresi yokken) — menü
  // ürünleri kategori içinde sira'ya göre gösterdiği için sıralama kategori-içidir.
  const canReorder =
    filter.categoryId !== 'all' && !filter.search.trim() && filter.stock === 'all';

  const categoryProducts = useMemo(() => {
    if (!canReorder) return [];
    return products
      .filter((p) => p.categoryId === filter.categoryId)
      .sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999));
  }, [products, filter.categoryId, canReorder]);

  // order'ı kategori ürünlerinden senkronla (düzenleme yapılmadıysa)
  useEffect(() => {
    if (!dirty) setOrder(categoryProducts.map((p) => p.id));
  }, [categoryProducts, dirty]);

  // Filtre değişince düzenleme kilidini sıfırla (kaydedilmemiş sıra iptal)
  useEffect(() => {
    setDirty(false);
  }, [filter.categoryId, filter.search, filter.stock]);

  const filtered = useMemo(() => {
    if (canReorder) {
      const byId = Object.fromEntries(products.map((p) => [p.id, p]));
      return order.map((id) => byId[id]).filter(Boolean);
    }
    return products
      .filter((p) => {
        if (filter.categoryId !== 'all' && p.categoryId !== filter.categoryId) return false;
        if (filter.search && !p.ad.toLowerCase().includes(filter.search.toLowerCase())) return false;
        const s = stockState(p);
        if (filter.stock === 'in' && s === 'out') return false;
        if (filter.stock === 'low' && s !== 'low') return false;
        if (filter.stock === 'out' && s !== 'out') return false;
        return true;
      })
      .sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999));
  }, [products, filter, order, canReorder]);

  // Her sürükleme sonunda yeni sırayı anında Firestore'a yazar — manuel kaydet butonu yok
  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);
    setDirty(true); // listener-bazlı re-sync'i sürtünme süresince engelle
    try {
      const batch = writeBatch(db);
      newOrder.forEach((id, idx) => {
        batch.update(doc(db, 'products', id), { sira: idx, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (err) {
      toast.error('Sıralama kaydedilemedi');
      console.error(err);
    } finally {
      setDirty(false);
    }
  };

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

      <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        {canReorder ? (
          <>
            <GripVertical size={13} className="text-slate-400" />
            Soldaki tutamaçtan sürükleyerek sırala — değişiklikler <strong>otomatik kaydedilir</strong>.
          </>
        ) : filter.categoryId === 'all' ? (
          <>
            📌 Ürünleri sıralamak için üstten <strong className="mx-1">tek bir kategori</strong> seç
            (sıralama kategori içindedir).
          </>
        ) : (
          'Sıralamak için arama ve stok filtrelerini temizle (yalnız kategori seçili olsun).'
        )}
      </p>

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-12 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-500">
          <div className="col-span-1"></div>
          <div className="col-span-1">Görsel</div>
          <div className="col-span-4">Ad</div>
          <div className="col-span-2">Kategori</div>
          <div className="col-span-1">Fiyat</div>
          <div className="col-span-1">Aktif</div>
          <div className="col-span-2 text-right">İşlem</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-500">
            {products.length === 0 ? 'Henüz ürün yok.' : 'Filtreyle eşleşen ürün yok.'}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {filtered.map((p) => (
                <SortableProductRow
                  key={p.id}
                  product={p}
                  categoryAd={categories.find((c) => c.id === p.categoryId)?.ad || '-'}
                  state={stockState(p)}
                  canReorder={canReorder}
                  onToggle={() => toggleActive(p)}
                  onEdit={() => {
                    setEditing(p);
                    setOpen(true);
                  }}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ProductModal open={open} onClose={() => setOpen(false)} editing={editing} categories={categories} printers={printers} />
    </div>
  );
}

function SortableProductRow({ product: p, categoryAd, state, canReorder, onToggle, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
    disabled: !canReorder,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-12 items-center gap-2 border-b border-slate-100 px-4 py-2 hover:bg-slate-50"
    >
      <div className="col-span-1">
        {canReorder ? (
          <button {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-700" title="Sürükle">
            <GripVertical size={18} />
          </button>
        ) : (
          <GripVertical size={18} className="text-slate-200" />
        )}
      </div>
      <div className="col-span-1">
        {p.gorsel ? (
          <img src={p.gorsel} alt={p.ad} className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-400">
            <ImageIcon size={16} />
          </div>
        )}
      </div>
      <div className="col-span-4 font-medium text-slate-900">{p.ad}</div>
      <div className="col-span-2 text-sm text-slate-600">{categoryAd}</div>
      <div className="col-span-1 font-semibold text-slate-900">{formatTL(p.fiyat)}</div>
      <div className="col-span-1">
        <Toggle checked={p.aktif} onChange={onToggle} />
      </div>
      <div className="col-span-2 text-right">
        <div className="inline-flex gap-1">
          <button onClick={onEdit} className="btn-ghost px-2 py-1">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductModal({ open, onClose, editing, categories, printers = [] }) {
  const isEdit = !!editing;
  // Mutfak yönlendirmesi için sadece IP'li (ethernet) yazıcılar seçilebilir —
  // USB adisyon yazıcıları (Kasa) mutfak hedefi değildir.
  const kitchenPrinters = printers.filter((p) => p.ip);
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
      ad: '', categoryId: '', yaziciIds: [], fiyat: 0, stokTakipli: false, stok: 0, aciklama: '', opsiyonlar: [],
      etiketler: [], oneCikan: false,
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
              yaziciIds: Array.isArray(editing.yaziciIds) ? editing.yaziciIds : [],
              fiyat: editing.fiyat,
              // Mevcut ürünlerde undefined ise eski davranış (takipli) korunur
              stokTakipli: editing.stokTakipli !== false,
              stok: editing.stok,
              dusukStokEsigi: editing.dusukStokEsigi ?? null,
              aciklama: editing.aciklama || '',
              opsiyonlar: editing.opsiyonlar || [],
              etiketler: editing.etiketler || [],
              oneCikan: !!editing.oneCikan,
              ceviri: {
                en: { ad: editing.ceviri?.en?.ad || '', aciklama: editing.ceviri?.en?.aciklama || '' },
                ar: { ad: editing.ceviri?.ar?.ad || '', aciklama: editing.ceviri?.ar?.aciklama || '' },
              },
              aktif: editing.aktif ?? true,
            }
          : {
              ad: '',
              categoryId: categories[0]?.id || '',
              yaziciIds: [],
              fiyat: 0,
              stokTakipli: false, // Yeni ürünlerde default: stoksuz
              stok: 0,
              dusukStokEsigi: null,
              aciklama: '',
              opsiyonlar: [],
              etiketler: [],
              oneCikan: false,
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

        {/* Mutfak yazıcı yönlendirmesi — ürün-bazlı, çoklu seçim */}
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Mutfak Yazıcısı (hangi istasyon[lar]da bassın)
          </label>
          {kitchenPrinters.length === 0 ? (
            <p className="text-xs text-slate-400">Henüz IP'li mutfak yazıcısı yok.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kitchenPrinters.map((p) => {
                const sel = (watch('yaziciIds') || []).includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      const cur = watch('yaziciIds') || [];
                      const next = cur.includes(p.id)
                        ? cur.filter((x) => x !== p.id)
                        : [...cur, p.id];
                      setValue('yaziciIds', next, { shouldDirty: true });
                    }}
                    className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                      sel
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {sel ? '✓ ' : ''}
                    {p.ad}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Boş bırakılırsa kategorinin yazıcısına gider. Birden fazla seçilirse ürün her
            istasyondan basılır (ör. Köy Kahvaltısı → Kahvaltı + Çorba-Salata + Fırın).
          </p>
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
          <div className="col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            ℹ️ Başlangıç stoğu ve giriş hareketleri <strong>Stok</strong> sayfasından "Manuel Hareket"
            ile yapılır. Düşük stok eşiği global Ayarlar'dan okunur.
          </div>
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

        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Menü Rozetleri</label>
          <div className="flex flex-wrap gap-2">
            {[
              { k: 'populer', t: '🔥 Popüler' },
              { k: 'yeni', t: '🆕 Yeni' },
              { k: 'acili', t: '🌶️ Acılı' },
              { k: 'vejetaryen', t: '🥬 Vejetaryen' },
            ].map(({ k, t }) => {
              const sel = (watch('etiketler') || []).includes(k);
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => {
                    const cur = watch('etiketler') || [];
                    setValue('etiketler', sel ? cur.filter((x) => x !== k) : [...cur, k], { shouldDirty: true });
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    sel ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Müşteri menüsünde ürünün yanında rozet olarak görünür.</p>
        </div>

        <div className="col-span-2 flex items-center justify-between rounded-lg bg-amber-50 p-3">
          <div>
            <span className="text-sm font-medium text-amber-800">⭐ Şefin Önerisi (Öne Çıkanlar vitrini)</span>
            <p className="text-xs text-amber-700">Menünün en üstündeki vitrinde gösterilir + ⭐ rozeti alır.</p>
          </div>
          <Toggle checked={watch('oneCikan')} onChange={(v) => setValue('oneCikan', v, { shouldDirty: true })} />
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
  const [editingIdx, setEditingIdx] = useState(null);
  const tags = Array.isArray(value) ? value : [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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

  const updateAt = (idx, newText) => {
    const trimmed = newText.trim();
    if (!trimmed) {
      remove(idx);
      return;
    }
    // Başka bir tag aynı isimdeyse çakışmasın
    if (tags.some((t, i) => i !== idx && t === trimmed)) return;
    const next = [...tags];
    next[idx] = trimmed;
    onChange(next);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = tags.indexOf(active.id);
    const newIdx = tags.indexOf(over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(tags, oldIdx, newIdx));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 focus-within:border-blue-500">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tags}>
          {tags.map((t, i) => (
            <SortableOptionTag
              key={t}
              id={t}
              value={t}
              editing={editingIdx === i}
              onStartEdit={() => setEditingIdx(i)}
              onSaveEdit={(newText) => {
                updateAt(i, newText);
                setEditingIdx(null);
              }}
              onCancelEdit={() => setEditingIdx(null)}
              onRemove={() => {
                setEditingIdx(null);
                remove(i);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (
            e.key === 'Backspace' &&
            !input &&
            tags.length > 0 &&
            editingIdx === null
          ) {
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

function SortableOptionTag({
  id,
  value,
  editing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (editing) {
    return (
      <span
        ref={setNodeRef}
        style={style}
        className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-xs font-medium ring-2 ring-blue-400"
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onSaveEdit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSaveEdit(text);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setText(value);
              onCancelEdit();
            }
          }}
          className="w-24 bg-transparent text-blue-900 outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 text-blue-800 hover:bg-blue-200"
          title="Kaldır"
        >
          <X size={11} />
        </button>
      </span>
    );
  }

  return (
    <span
      ref={setNodeRef}
      style={style}
      className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-1 text-xs font-medium text-blue-800"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-blue-500 hover:text-blue-700 active:cursor-grabbing"
        title="Sıralamak için sürükle"
      >
        <GripVertical size={11} />
      </button>
      <span
        onClick={onStartEdit}
        className="cursor-text rounded px-1 hover:bg-blue-200"
        title="Düzenlemek için tıkla"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-blue-200"
        title="Kaldır"
      >
        <X size={11} />
      </button>
    </span>
  );
}
