import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Minus, Trash2, Search, X, ImageIcon, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { watchCollection, orderBy, fetchOne } from '../../firebase/firestore';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { formatTL, formatAdet } from '../../utils/format';
import { createOrder, addItemsToOrder } from '../../firebase/orders';
import Modal from '../../components/ui/Modal';
import KitchenTicket from '../../components/KitchenTicket';

export default function NewOrder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const masaId = params.get('masaId');
  const orderId = params.get('orderId');
  const kisi = Number(params.get('kisi')) || null;
  const { user, profile, rol } = useAuthStore();
  const { masaAd, items, start, addItem, changeQuantity, toggleHalf, removeItem, setNote, clear, total } =
    useCartStore();
  const [kitchenTicket, setKitchenTicket] = useState(null);

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [noteFor, setNoteFor] = useState(null);

  useEffect(() => {
    if (!masaId) {
      navigate('/pos/tables', { replace: true });
      return;
    }
    // Yeni sipariş açılışında kişi sayısı zorunlu
    if (!orderId && !kisi) {
      toast.error('Önce kişi sayısını girin');
      navigate('/pos/tables', { replace: true });
      return;
    }
    (async () => {
      const t = await fetchOne('tables', masaId);
      if (!t) {
        toast.error('Masa bulunamadı');
        navigate('/pos/tables', { replace: true });
        return;
      }
      if (t.grupId) {
        const group = await fetchOne('tableGroups', t.grupId);
        if (group && group.mainTableId !== masaId) {
          navigate(`/pos/order/new?masaId=${group.mainTableId}`, { replace: true });
          return;
        }
        const combined = group?.memberAdlari?.join(' + ') || t.ad;
        start(masaId, combined);
        return;
      }
      start(masaId, t.ad);
    })();
    return () => clear();
  }, [masaId]);

  useEffect(() => watchCollection('categories', setCategories, orderBy('sira', 'asc')), []);
  useEffect(() => watchCollection('products', setProducts), []);

  const activeCats = useMemo(() => categories.filter((c) => c.aktif), [categories]);

  useEffect(() => {
    if (!activeCategory && activeCats[0]) setActiveCategory(activeCats[0].id);
  }, [activeCats, activeCategory]);

  const visibleProducts = useMemo(() => {
    let list = products.filter((p) => p.aktif);
    if (search) {
      list = list.filter((p) => p.ad.toLowerCase().includes(search.toLowerCase()));
    } else if (activeCategory) {
      list = list.filter((p) => p.categoryId === activeCategory);
    }
    return list;
  }, [products, search, activeCategory]);

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Sepet boş');
      return;
    }
    setSubmitting(true);
    try {
      const ticketItems = items.map((it) => ({
        ad: it.ad,
        adet: it.adet,
        notlar: it.notlar,
      }));
      if (orderId) {
        const result = await addItemsToOrder({
          orderId,
          garsonId: user.uid,
          newItems: items.map((it) => ({
            productId: it.productId,
            adet: it.adet,
            notlar: it.notlar,
          })),
        });
        toast.success(`${result.added} ürün eklendi`);
        setKitchenTicket({
          isAddendum: true,
          order: {
            id: orderId,
            masaAd,
            kisiSayisi: null,
            garsonAd: profile?.ad || 'Garson',
          },
          items: ticketItems,
        });
      } else {
        const result = await createOrder({
          masaId,
          masaAd,
          kisiSayisi: kisi,
          garsonId: user.uid,
          garsonAd: profile?.ad || 'Garson',
          items: items.map((it) => ({
            productId: it.productId,
            adet: it.adet,
            notlar: it.notlar,
          })),
        });
        toast.success(`Sipariş alındı (${formatTL(result.araToplam)})`);
        setKitchenTicket({
          isAddendum: false,
          order: {
            id: result.orderId,
            masaAd,
            kisiSayisi: kisi,
            garsonAd: profile?.ad || 'Garson',
          },
          items: ticketItems,
        });
      }
      clear();
      // navigate'i mutfak fişi modal kapanınca yapacağız
    } catch (err) {
      toast.error(err.message || 'Sipariş kaydedilemedi');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const closeKitchenTicket = () => {
    setKitchenTicket(null);
    navigate('/pos/tables');
  };

  const subtotal = total();

  return (
    <div className="flex h-full bg-slate-100">
      {/* Sol: Kategoriler + Ürünler */}
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

      {/* Sağ: Sepet */}
      <aside className="flex w-[440px] flex-col border-l border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold text-blue-700">{masaAd || '...'}</h2>
              <p className="text-sm text-slate-500">
                Garson: <strong>{profile?.ad}</strong>
                {orderId && ' · Mevcut siparişe ekleme'}
              </p>
            </div>
            {kisi && !orderId && (
              <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1.5 text-sm font-bold text-blue-700">
                {kisi} kişi
              </span>
            )}
          </div>
        </div>

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
                      <p className="text-base font-bold leading-tight text-slate-900">
                        {it.ad}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {formatTL(it.fiyat)} / adet
                      </p>
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
                      aria-label="Azalt"
                    >
                      <Minus size={20} />
                    </button>
                    <span className="w-12 text-center text-2xl font-bold tabular-nums">
                      {formatAdet(it.adet)}
                    </span>
                    <button
                      onClick={() => changeQuantity(it.productId, 1)}
                      className="rounded-lg bg-slate-100 p-2.5 hover:bg-slate-200 active:scale-95"
                      aria-label="Arttır"
                    >
                      <Plus size={20} />
                    </button>
                    <button
                      onClick={() => toggleHalf(it.productId)}
                      title="Yarım porsiyon (½)"
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
                      aria-label="Not ekle"
                    >
                      <MessageSquare size={18} />
                    </button>
                    <button
                      onClick={() => removeItem(it.productId)}
                      className="rounded-lg p-2.5 text-red-500 hover:bg-red-50 active:scale-95"
                      aria-label="Sil"
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
              onClick={() => {
                clear();
                navigate('/pos/tables');
              }}
              className="btn-secondary py-3 text-base"
            >
              İptal
            </button>
            <button
              onClick={handleSubmit}
              disabled={items.length === 0 || submitting}
              className="btn-primary py-3 text-base disabled:opacity-50"
            >
              {submitting ? 'Gönderiliyor…' : orderId ? 'Ekle' : 'Onayla'}
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
