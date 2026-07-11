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
import { upsertCustomerFromPackage, normalizePhone } from '../../firebase/customers';
import Modal from '../../components/ui/Modal';
import KitchenTicket from '../../components/KitchenTicket';

const KAYNAK_LABELS = {
  manuel: 'Manuel (kasada)',
  telefon: 'Telefon',
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
  migros: 'Migros',
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
  const [customers, setCustomers] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
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
  useEffect(() => watchCollection('customers', setCustomers), []);

  // Paket modunda sepeti temizle ve masaAd'sız başlat
  useEffect(() => {
    clear();
  }, []);

  // Telefon defteri arama — ad veya telefona göre kayıtlı müşteriler
  const telQuery = watch('musteriTel') || '';
  const adQuery = watch('musteriAd') || '';
  const customerMatches = useMemo(() => {
    const telDigits = normalizePhone(telQuery);
    const adLower = adQuery.trim().toLowerCase();
    if (telDigits.length < 3 && adLower.length < 2) return [];
    return customers
      .filter((c) => {
        const matchTel = telDigits.length >= 3 && normalizePhone(c.tel).includes(telDigits);
        const matchAd = adLower.length >= 2 && (c.ad || '').toLowerCase().includes(adLower);
        return matchTel || matchAd;
      })
      .slice(0, 6);
  }, [customers, telQuery, adQuery]);

  const pickCustomer = (c) => {
    setValue('musteriAd', c.ad || '', { shouldValidate: true });
    setValue('musteriTel', c.tel || '', { shouldValidate: true });
    if (c.adres) setValue('musteriAdres', c.adres, { shouldValidate: true });
    setShowSuggest(false);
  };

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
      // Telefon defterini güncelle (hata olsa bile sipariş akışını bozma)
      upsertCustomerFromPackage({
        ad: data.musteriAd,
        tel: data.musteriTel,
        adres: data.musteriAdres,
      }).catch((e) => console.warn('Müşteri defteri güncellenemedi:', e));
      toast.success(`Paket sipariş alındı (${formatTL(result.araToplam)})`);
      setKitchenTicket({
        isAddendum: false,
        order: {
          id: result.orderId,
          masaAd: `Paket - ${data.musteriAd}`,
          kisiSayisi: null,
          garsonAd: profile?.ad || 'Personel',
          paketMi: true,
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
        <div className="border-b border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün ara..."
                className="input py-3 pl-11 text-base"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
          {!search && (
            <div className="mt-3 flex gap-1.5 overflow-x-auto">
              {activeCats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`whitespace-nowrap rounded-lg px-5 py-3 text-base font-semibold transition ${
                    activeCategory === c.id
                      ? 'bg-blue-600 text-white shadow'
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
            <p className="py-12 text-center text-base text-slate-500">Ürün bulunamadı.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={() => addItem(p)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sağ: müşteri formu + sepet */}
      <aside className="flex w-[460px] flex-col border-l border-slate-200 bg-white">
        <form
          id="paket-form"
          onSubmit={handleSubmit(onSubmit)}
          className="border-b border-slate-200 bg-amber-50 p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-base font-bold text-amber-900">
            <Truck size={18} />
            <span>Paket Sipariş</span>
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                {...register('musteriAd')}
                placeholder="Müşteri adı"
                className="input py-2.5 pl-9 text-base"
                onFocus={() => setShowSuggest(true)}
              />
              {errors.musteriAd && (
                <p className="mt-1 text-xs text-red-600">{errors.musteriAd.message}</p>
              )}
            </div>

            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                {...register('musteriTel')}
                placeholder="Telefon"
                inputMode="tel"
                className="input py-2.5 pl-9 text-base"
                onFocus={() => setShowSuggest(true)}
              />
              {errors.musteriTel && (
                <p className="mt-1 text-xs text-red-600">{errors.musteriTel.message}</p>
              )}
            </div>

            {showSuggest && customerMatches.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                  <span>Kayıtlı müşteriler</span>
                  <button
                    type="button"
                    onClick={() => setShowSuggest(false)}
                    className="rounded p-0.5 hover:bg-slate-100"
                  >
                    <X size={14} />
                  </button>
                </div>
                <ul className="max-h-44 overflow-y-auto">
                  {customerMatches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickCustomer(c)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{c.ad || 'İsimsiz'}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {c.tel}
                            {c.adres ? ` · ${c.adres}` : ''}
                          </span>
                        </span>
                        {c.siparisSayisi > 1 && (
                          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            {c.siparisSayisi}x
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
              <textarea
                {...register('musteriAdres')}
                placeholder="Adres"
                rows={2}
                className="input py-2.5 pl-9 text-base"
              />
              {errors.musteriAdres && (
                <p className="mt-1 text-xs text-red-600">{errors.musteriAdres.message}</p>
              )}
            </div>

            <select {...register('paketKaynak')} className="input py-2.5 text-base">
              {Object.entries(KAYNAK_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <input
              {...register('paketNotlar')}
              placeholder="Not (kapı kodu, kat vs.)"
              className="input py-2.5 text-base"
            />
          </div>
        </form>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="py-16 text-center text-base text-slate-400">Sepet boş</p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((it) => (
                <li
                  key={it.productId}
                  className="rounded-xl border-2 border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold leading-tight text-slate-900">{it.ad}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{formatTL(it.fiyat)} / adet</p>
                      {it.notlar && (
                        <p className="mt-1 rounded bg-blue-50 px-2 py-0.5 text-sm italic text-blue-700">
                          {it.notlar}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-lg font-bold text-slate-900">
                      {formatTL(it.fiyat * it.adet)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => changeQuantity(it.productId, -1)}
                      className="rounded-lg bg-slate-100 p-2.5 hover:bg-slate-200 active:scale-95"
                    >
                      <Minus size={20} />
                    </button>
                    <span className="w-12 text-center text-2xl font-bold tabular-nums">
                      {formatAdet(it.adet)}
                    </span>
                    <button
                      onClick={() => changeQuantity(it.productId, 1)}
                      className="rounded-lg bg-slate-100 p-2.5 hover:bg-slate-200 active:scale-95"
                    >
                      <Plus size={20} />
                    </button>
                    <button
                      onClick={() => toggleHalf(it.productId)}
                      title="Yarım porsiyon"
                      className={`rounded-lg px-3 py-2 text-lg font-bold transition active:scale-95 ${
                        it.adet % 1 !== 0
                          ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400 hover:bg-blue-200'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      ½
                    </button>
                    <button
                      onClick={() => setNoteFor(it)}
                      className="ml-auto rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 active:scale-95"
                    >
                      <MessageSquare size={18} />
                    </button>
                    <button
                      onClick={() => removeItem(it.productId)}
                      className="rounded-lg p-2.5 text-red-500 hover:bg-red-50 active:scale-95"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t-2 border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-base font-medium text-slate-600">Toplam</span>
            <span className="text-3xl font-bold text-slate-900">{formatTL(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                clear();
                navigate('/pos/tables');
              }}
              className="btn-secondary py-3 text-base"
            >
              İptal
            </button>
            <button
              type="submit"
              form="paket-form"
              disabled={items.length === 0 || submitting}
              className="btn-primary py-3 text-base disabled:opacity-50"
            >
              <Send size={18} /> {submitting ? 'Gönderiliyor…' : 'Paket Aç'}
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
  const tracked = product.stokTakipli !== false; // pide/kebap takipsiz → tükendi olmaz
  const outOfStock = tracked && product.stok <= 0;
  return (
    <button
      onClick={onAdd}
      disabled={outOfStock}
      className={`flex flex-col rounded-xl border-2 bg-white p-3 text-left shadow-sm transition active:scale-95 ${
        outOfStock
          ? 'cursor-not-allowed border-slate-200 opacity-40'
          : 'border-slate-200 hover:border-blue-500 hover:shadow-md'
      }`}
    >
      <div className="mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100">
        {product.gorsel ? (
          <img src={product.gorsel} alt={product.ad} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={40} className="text-slate-300" />
        )}
      </div>
      <p className="line-clamp-2 min-h-[3rem] text-base font-semibold leading-tight text-slate-900">
        {product.ad}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xl font-bold text-blue-700">{formatTL(product.fiyat)}</span>
        {tracked && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              outOfStock
                ? 'bg-red-100 text-red-700'
                : product.stok <= 5
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {outOfStock ? 'Tükendi' : product.stok}
          </span>
        )}
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
