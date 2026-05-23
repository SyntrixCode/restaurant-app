import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Minus,
  Trash2,
  Search,
  X,
  ImageIcon,
  MessageSquare,
  Truck,
  User,
  Phone,
  MapPin,
  Send,
} from 'lucide-react';
import { watchCollection, orderBy } from '../../firebase/firestore';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { formatTL, formatAdet } from '../../utils/format';
import { createOrder } from '../../firebase/orders';
import { paketSchema } from '../../utils/validators';
import Modal from '../../components/ui/Modal';
import KitchenTicket from '../../components/KitchenTicket';

const KAYNAK_LABELS = {
  manuel: 'Manuel (kasada)',
  telefon: 'Telefon',
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
  diger: 'Diğer',
};

export default function PosPackages() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, profile } = useAuthStore();
  const { items, addItem, changeQuantity, toggleHalf, removeItem, setNote, clear, total } =
    useCartStore();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [kitchenTicket, setKitchenTicket] = useState(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(paketSchema),
    defaultValues: {
      musteriAd: '',
      musteriTel: params.get('tel') || '',
      musteriAdres: '',
      paketKaynak: 'telefon',
      paketNotlar: '',
    },
  });

  useEffect(() => watchCollection('categories', setCategories, orderBy('sira', 'asc')), []);
  useEffect(() => watchCollection('products', setProducts), []);

  // Paket modunda sepeti temizle ve masaAd'sız başlat
  useEffect(() => {
    clear();
  }, []);

  const activeCats = useMemo(() => categories.filter((c) => c.aktif), [categories]);

  useEffect(() => {
    if (!activeCategory && activeCats[0]) setActiveCategory(activeCats[0].id);
  }, [activeCats, activeCategory]);

  const visibleProducts = useMemo(() => {
    let list = products.filter((p) => p.aktif);
    if (search) list = list.filter((p) => p.ad.toLowerCase().includes(search.toLowerCase()));
    else if (activeCategory) list = list.filter((p) => p.categoryId === activeCategory);
    return list;
  }, [products, search, activeCategory]);

  const onSubmit = async (data) => {
    if (items.length === 0) {
      toast.error('Sepet boş');
      return;
    }
    setSubmitting(true);
    try {
      const ticketItems = items.map((it) => ({ ad: it.ad, adet: it.adet, notlar: it.notlar }));
      const result = await createOrder({
        masaId: null,
        masaAd: `Paket - ${data.musteriAd}`,
        kisiSayisi: null,
        garsonId: user.uid,
        garsonAd: profile?.ad || 'Personel',
        items: items.map((it) => ({
          productId: it.productId,
          adet: it.adet,
          notlar: it.notlar,
        })),
        paketMi: true,
        paketKaynak: data.paketKaynak,
        musteriAd: data.musteriAd,
        musteriTel: data.musteriTel,
        musteriAdres: data.musteriAdres,
      });
      toast.success(`Paket sipariş alındı (${formatTL(result.araToplam)})`);
      setKitchenTicket({
        isAddendum: false,
        order: {
          id: result.orderId,
          masaAd: `Paket - ${data.musteriAd}`,
          kisiSayisi: null,
          garsonAd: profile?.ad || 'Personel',
        },
        items: ticketItems,
      });
      clear();
    } catch (err) {
      toast.error(err.message || 'Paket kaydedilemedi');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const closeKitchenTicket = () => {
    setKitchenTicket(null);
    navigate('/pos/orders/active');
  };

  const subtotal = total();

  return (
    <div className="flex h-full bg-slate-100">
      {/* Sol: kategori + ürün */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-200 bg-white p-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün ara..."
                className="input pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-slate-100"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {!search && (
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {activeCats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                    activeCategory === c.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {c.ad}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {visibleProducts.length === 0 ? (
            <p className="py-12 text-center text-slate-500">Ürün bulunamadı.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={() => addItem(p)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sağ: müşteri formu + sepet */}
      <aside className="flex w-[420px] flex-col border-l border-slate-200 bg-white">
        <form
          id="paket-form"
          onSubmit={handleSubmit(onSubmit)}
          className="border-b border-slate-200 bg-amber-50 p-3"
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Truck size={14} />
            <span>Paket Sipariş</span>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <User size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                {...register('musteriAd')}
                placeholder="Müşteri adı"
                className="input py-1.5 pl-7 text-sm"
              />
              {errors.musteriAd && (
                <p className="mt-0.5 text-xs text-red-600">{errors.musteriAd.message}</p>
              )}
            </div>

            <div className="relative">
              <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                {...register('musteriTel')}
                placeholder="Telefon"
                inputMode="tel"
                className="input py-1.5 pl-7 text-sm"
              />
              {errors.musteriTel && (
                <p className="mt-0.5 text-xs text-red-600">{errors.musteriTel.message}</p>
              )}
            </div>

            <div className="relative">
              <MapPin size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
              <textarea
                {...register('musteriAdres')}
                placeholder="Adres"
                rows={2}
                className="input py-1.5 pl-7 text-sm"
              />
              {errors.musteriAdres && (
                <p className="mt-0.5 text-xs text-red-600">{errors.musteriAdres.message}</p>
              )}
            </div>

            <select {...register('paketKaynak')} className="input py-1.5 text-sm">
              {Object.entries(KAYNAK_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <input
              {...register('paketNotlar')}
              placeholder="Not (kapı kodu, kat vs.)"
              className="input py-1.5 text-sm"
            />
          </div>
        </form>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Sepet boş</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.productId} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{it.ad}</p>
                      <p className="text-xs text-slate-500">{formatTL(it.fiyat)} / adet</p>
                      {it.notlar && (
                        <p className="mt-1 text-xs italic text-blue-600">{it.notlar}</p>
                      )}
                    </div>
                    <span className="font-bold text-slate-900">{formatTL(it.fiyat * it.adet)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      onClick={() => changeQuantity(it.productId, -1)}
                      className="rounded bg-slate-100 p-1.5 hover:bg-slate-200"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-10 text-center font-semibold">{formatAdet(it.adet)}</span>
                    <button
                      onClick={() => changeQuantity(it.productId, 1)}
                      className="rounded bg-slate-100 p-1.5 hover:bg-slate-200"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => toggleHalf(it.productId)}
                      title="Yarım porsiyon"
                      className={`rounded px-1.5 py-1 text-xs font-bold transition ${
                        it.adet % 1 !== 0
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      ½
                    </button>
                    <button
                      onClick={() => setNoteFor(it)}
                      className="ml-auto rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <MessageSquare size={14} />
                    </button>
                    <button
                      onClick={() => removeItem(it.productId)}
                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-500">Toplam</span>
            <span className="text-2xl font-bold text-slate-900">{formatTL(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                clear();
                navigate('/pos/tables');
              }}
              className="btn-secondary"
            >
              İptal
            </button>
            <button
              type="submit"
              form="paket-form"
              disabled={items.length === 0 || submitting}
              className="btn-primary disabled:opacity-50"
            >
              <Send size={14} /> {submitting ? 'Gönderiliyor...' : 'Paket Aç'}
            </button>
          </div>
        </div>
      </aside>

      <NoteModal
        open={!!noteFor}
        item={noteFor}
        onClose={() => setNoteFor(null)}
        onSave={(note) => {
          if (noteFor) setNote(noteFor.productId, note);
          setNoteFor(null);
        }}
      />

      <KitchenTicket
        open={!!kitchenTicket}
        onClose={closeKitchenTicket}
        order={kitchenTicket?.order}
        items={kitchenTicket?.items}
        isAddendum={kitchenTicket?.isAddendum}
      />
    </div>
  );
}

function ProductCard({ product, onAdd }) {
  const outOfStock = product.stok <= 0;
  return (
    <button
      onClick={onAdd}
      disabled={outOfStock}
      className={`flex flex-col rounded-xl border-2 bg-white p-2 text-left shadow-sm transition active:scale-95 ${
        outOfStock
          ? 'cursor-not-allowed border-slate-200 opacity-40'
          : 'border-slate-200 hover:border-blue-400 hover:shadow-md'
      }`}
    >
      <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100">
        {product.gorsel ? (
          <img src={product.gorsel} alt={product.ad} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={32} className="text-slate-300" />
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium text-slate-900">{product.ad}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-base font-bold text-blue-700">{formatTL(product.fiyat)}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs ${
            outOfStock
              ? 'bg-red-100 text-red-700'
              : product.stok <= 5
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {outOfStock ? 'Tükendi' : product.stok}
        </span>
      </div>
    </button>
  );
}

function NoteModal({ open, item, onClose, onSave }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(item?.notlar || '');
  }, [open, item]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Not — ${item?.ad}`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">İptal</button>
          <button onClick={() => onSave(text)} className="btn-primary">Kaydet</button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="örn. Az soslu, baharatsız..."
        rows={3}
        className="input"
        autoFocus
      />
    </Modal>
  );
}
