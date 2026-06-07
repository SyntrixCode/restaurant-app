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
import { Plus, Pencil, Trash2, GripVertical, Tags } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import {
  watchCollection,
  createDoc,
  patchDoc,
  removeDoc,
  orderBy,
  writeBatch,
  serverTimestamp,
} from '../../firebase/firestore';
import { categorySchema } from '../../utils/validators';
import { db } from '../../firebase/config';
import { doc } from 'firebase/firestore';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => watchCollection('categories', setCategories, orderBy('sira', 'asc')), []);
  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => watchCollection('printers', setPrinters), []);

  useEffect(() => {
    if (!dirty) setOrder(categories.map((c) => c.id));
  }, [categories, dirty]);

  const counts = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      map[p.categoryId] = (map[p.categoryId] || 0) + 1;
    });
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return order
      .map((id) => byId[id])
      .filter(Boolean)
      .filter((c) => !search || c.ad.toLowerCase().includes(search.toLowerCase()));
  }, [order, categories, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
        batch.update(doc(db, 'categories', id), { sira: idx, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (err) {
      toast.error('Sıralama kaydedilemedi');
      console.error(err);
    } finally {
      setDirty(false);
    }
  };

  const handleDelete = async (c) => {
    const productCount = counts[c.id] || 0;
    if (productCount > 0) {
      toast.error(`"${c.ad}" kategorisinde ${productCount} ürün var. Önce ürünleri taşıyın veya silin.`);
      return;
    }
    if (!confirm(`"${c.ad}" silinsin mi?`)) return;
    await removeDoc('categories', c.id);
    toast.success('Kategori silindi');
  };

  const toggleActive = (c) => patchDoc('categories', c.id, { aktif: !c.aktif });

  return (
    <div className="p-8">
      <PageHeader
        title="Kategoriler"
        subtitle="Menü kategorilerini sıralayın ve yazıcı atayın"
        actions={
          <>
            <button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="btn-primary"
            >
              <Plus size={16} /> Yeni Kategori
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Kategori" value={categories.length} icon={Tags} />
        <StatCard label="Aktif" value={categories.filter((c) => c.aktif).length} color="green" />
        <StatCard label="Toplam Ürün" value={products.length} color="blue" />
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Kategori ara..."
          className="input max-w-xs"
        />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-500">
          <div className="col-span-1"></div>
          <div className="col-span-1">Sıra</div>
          <div className="col-span-4">Ad</div>
          <div className="col-span-2">Ürün</div>
          <div className="col-span-2">Yazıcı</div>
          <div className="col-span-1">Aktif</div>
          <div className="col-span-1 text-right">İşlem</div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-slate-500">
                Henüz kategori yok.
              </div>
            )}
            {filtered.map((c, idx) => (
              <SortableRow
                key={c.id}
                cat={c}
                index={idx}
                productCount={counts[c.id] || 0}
                printers={printers}
                onToggle={() => toggleActive(c)}
                onEdit={() => {
                  setEditing(c);
                  setOpen(true);
                }}
                onDelete={() => handleDelete(c)}
                onPrinterChange={(yaziciId) => patchDoc('categories', c.id, { yaziciId: yaziciId || null })}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <CategoryModal open={open} onClose={() => setOpen(false)} editing={editing} printers={printers} maxSira={categories.length} />
    </div>
  );
}

function SortableRow({ cat, index, productCount, printers, onToggle, onEdit, onDelete, onPrinterChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-12 items-center gap-2 border-b border-slate-100 px-4 py-3 hover:bg-slate-50"
    >
      <div className="col-span-1">
        <button {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-700">
          <GripVertical size={18} />
        </button>
      </div>
      <div className="col-span-1 text-sm text-slate-500">{index + 1}</div>
      <div className="col-span-4 font-medium text-slate-900">{cat.ad}</div>
      <div className="col-span-2">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          {productCount} ürün
        </span>
      </div>
      <div className="col-span-2">
        <select
          value={cat.yaziciId || ''}
          onChange={(e) => onPrinterChange(e.target.value)}
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
        >
          <option value="">Varsayılan</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ad}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-1">
        <Toggle checked={cat.aktif} onChange={onToggle} />
      </div>
      <div className="col-span-1 text-right">
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

function CategoryModal({ open, onClose, editing, printers, maxSira }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { ad: '', aktif: true, yaziciId: null, ceviri: { en: { ad: '' }, ar: { ad: '' } } },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              ad: editing.ad,
              aktif: editing.aktif ?? true,
              yaziciId: editing.yaziciId || null,
              ceviri: {
                en: { ad: editing.ceviri?.en?.ad || '' },
                ar: { ad: editing.ceviri?.ar?.ad || '' },
              },
            }
          : { ad: '', aktif: true, yaziciId: null, ceviri: { en: { ad: '' }, ar: { ad: '' } } },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    try {
      const payload = { ...data, yaziciId: data.yaziciId || null };
      if (isEdit) {
        await patchDoc('categories', editing.id, payload);
        toast.success('Kategori güncellendi');
      } else {
        await createDoc('categories', { ...payload, sira: maxSira });
        toast.success('Kategori eklendi');
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
      title={isEdit ? 'Kategori Düzenle' : 'Yeni Kategori'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button type="submit" form="cat-form" disabled={isSubmitting} className="btn-primary">
            Kaydet
          </button>
        </>
      }
    >
      <form id="cat-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kategori Adı</label>
          <input {...register('ad')} className="input" autoFocus />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Yazıcı</label>
          <select
            value={watch('yaziciId') || ''}
            onChange={(e) => setValue('yaziciId', e.target.value || null)}
            className="input"
          >
            <option value="">Varsayılan yazıcı</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Bu kategorideki ürünlerin sipariş fişi seçilen yazıcıya gönderilir.
          </p>
        </div>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Çeviriler (QR menü — opsiyonel)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">İngilizce ad</label>
              <input {...register('ceviri.en.ad')} className="input" placeholder="English name" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Arapça ad</label>
              <input {...register('ceviri.ar.ad')} className="input" dir="rtl" placeholder="الاسم بالعربية" />
            </div>
          </div>
        </details>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Toggle checked={watch('aktif')} onChange={(v) => setValue('aktif', v)} />
        </div>
      </form>
    </Modal>
  );
}
