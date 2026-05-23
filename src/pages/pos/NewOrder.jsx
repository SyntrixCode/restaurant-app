import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Minus, Trash2, Search, X, ImageIcon, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { watchCollection, orderBy, fetchOne } from '../../firebase/firestore';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { formatTL } from '../../utils/format';
import { createOrder, addItemsToOrder } from '../../firebase/orders';
import Modal from '../../components/ui/Modal';

export default function NewOrder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const masaId = params.get('masaId');
  const orderId = params.get('orderId');
  const kisi = Number(params.get('kisi')) || null;
  const { user, profile, rol } = useAuthStore();
  const { masaAd, items, start, addItem, changeQuantity, removeItem, setNote, clear, total } =
    useCartStore();

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
        toast.success(`${result.added} ürün eklendi (mutfağa yazıldı)`);
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
      }
      clear();
      navigate('/pos/tables');
    } catch (err) {
      toast.error(err.message || 'Sipariş kaydedilemedi');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const subtotal = total();

  return (
    <div className="flex h-full bg-slate-100">
      {/* Sol: Kategoriler + Ürünler */}
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

      {/* Sağ: Sepet */}
      <aside className="flex w-96 flex-col border-l border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-blue-700">{masaAd || '...'}</h2>
              <p className="text-xs text-slate-500">
                Garson: {profile?.ad} {orderId && '· Mevcut siparişe ekleme'}
              </p>
            </div>
            {kisi && !orderId && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                {kisi} kişi
              </span>
            )}
          </div>
        </div>

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
                    <span className="w-10 text-center font-semibold">{it.adet}</span>
                    <button
                      onClick={() => changeQuantity(it.productId, 1)}
                      className="rounded bg-slate-100 p-1.5 hover:bg-slate-200"
                    >
                      <Plus size={14} />
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
              onClick={() => {
                clear();
                navigate('/pos/tables');
              }}
              className="btn-secondary"
            >
              İptal
            </button>
            <button
              onClick={handleSubmit}
              disabled={items.length === 0 || submitting}
              className="btn-primary disabled:opacity-50"
            >
              {submitting ? 'Gönderiliyor...' : orderId ? 'Ekle' : 'Onayla'}
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
