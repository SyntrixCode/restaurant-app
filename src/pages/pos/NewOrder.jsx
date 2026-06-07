import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Minus, Trash2, Search, X, ImageIcon, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { watchCollection, orderBy, fetchOne, watchDoc } from '../../firebase/firestore';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { formatTL, formatAdet } from '../../utils/format';
import { createOrder, addItemsToOrder, updateOrderItems } from '../../firebase/orders';
import Modal from '../../components/ui/Modal';
import KitchenTicket from '../../components/KitchenTicket';
import ProductOptionsModal from '../../components/ProductOptionsModal';
import { pushToCustomerDisplay } from '../../plugins/customerDisplay';

export default function NewOrder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const masaId = params.get('masaId');
  const orderId = params.get('orderId');
  const kisi = Number(params.get('kisi')) || null;
  const { user, profile, rol, logout } = useAuthStore();
  const { masaAd, items, start, addItem, changeQuantity, toggleHalf, removeItem, setNote, clear, total } =
    useCartStore();
  const [kitchenTicket, setKitchenTicket] = useState(null);

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [optionsFor, setOptionsFor] = useState(null);
  const [existingOrder, setExistingOrder] = useState(null);
  // Mevcut item'lardaki kullanıcı düzenlemelerini local olarak tut.
  // Map: itemKey (productId|notlar) → { adet (yeni), original (eski), removed }
  // Submit'te diff hesaplanır.
  const [editedExisting, setEditedExisting] = useState({});

  // Mevcut siparişe ekleme yapılıyorsa, siparişi dinle
  useEffect(() => {
    if (!orderId) {
      setExistingOrder(null);
      setEditedExisting({});
      return;
    }
    return watchDoc('orders', orderId, setExistingOrder);
  }, [orderId]);

  // Order ilk geldiğinde editedExisting'i original ile hizala
  useEffect(() => {
    if (!existingOrder?.items) return;
    setEditedExisting((prev) => {
      // Sadece henüz yoksa ekle, kullanıcı düzenlemelerini koru
      const next = { ...prev };
      existingOrder.items.forEach((it, idx) => {
        const key = `${idx}`;
        if (!(key in next)) {
          next[key] = {
            adet: it.adet,
            originalAdet: it.adet,
            ad: it.ad,
            fiyat: it.fiyat,
            notlar: it.notlar || '',
            removed: false,
          };
        }
      });
      return next;
    });
  }, [existingOrder?.id]);

  const adjustExistingQty = (idx, delta) => {
    setEditedExisting((prev) => {
      const key = `${idx}`;
      const cur = prev[key];
      if (!cur || cur.removed) return prev;
      const newAdet = Math.max(0, Math.round((cur.adet + delta) * 2) / 2); // 0.5 step
      if (newAdet === 0) {
        return { ...prev, [key]: { ...cur, adet: 0, removed: true } };
      }
      return { ...prev, [key]: { ...cur, adet: newAdet } };
    });
  };

  const removeExistingItem = (idx) => {
    setEditedExisting((prev) => {
      const key = `${idx}`;
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, removed: true, adet: 0 } };
    });
  };

  const undoExistingChange = (idx) => {
    setEditedExisting((prev) => {
      const key = `${idx}`;
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, adet: cur.originalAdet, removed: false } };
    });
  };

  // Diff hesabı (submit için ve görsel uyarılar için)
  const hasEdits = Object.values(editedExisting).some(
    (e) => e.adet !== e.originalAdet || e.removed,
  );

  // Ürüne tıklayınca: opsiyonu varsa ve sepete ilk kez ekleniyorsa modal,
  // yoksa veya zaten ekliyse direkt adet arttır.
  const handleProductClick = (product) => {
    const hasOptions = (product.opsiyonlar || []).length > 0;
    const alreadyInCart = items.some((it) => it.productId === product.id);
    if (hasOptions && !alreadyInCart) {
      setOptionsFor(product);
    } else {
      addItem(product);
    }
  };

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
    // Admin'de elle sıralanan düzen (sira) POS'ta da geçerli olsun
    return [...list].sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999));
  }, [products, search, activeCategory]);

  const handleSubmit = async () => {
    if (items.length === 0 && !hasEdits) {
      toast.error('Sepet boş, değişiklik de yok');
      return;
    }
    setSubmitting(true);
    try {
      const ticketItems = items.map((it) => ({
        ad: it.ad,
        adet: it.adet,
        notlar: it.notlar,
        // Mutfak yazıcı yönlendirmesi (anlık fiş kategoriye/ürüne göre bölünsün)
        categoryId: it.categoryId || null,
        yaziciIds: Array.isArray(it.yaziciIds) ? it.yaziciIds : [],
      }));
      if (orderId) {
        // Düzenleme diff'i (varsa)
        let editDiff = null;
        if (hasEdits && existingOrder?.items) {
          // Yeni items array: silinmemiş + adet güncellenmiş
          const updatedExistingItems = existingOrder.items
            .map((it, idx) => {
              const e = editedExisting[`${idx}`];
              if (!e || e.removed) return null;
              if (e.adet === e.originalAdet) return it;
              return { ...it, adet: e.adet };
            })
            .filter(Boolean);

          // Diff hesabı (mutfak fişi için)
          const removedItems = [];
          const changedItems = [];
          existingOrder.items.forEach((it, idx) => {
            const e = editedExisting[`${idx}`];
            if (!e) return;
            // Düzeltme fişi doğru mutfak istasyonuna gitsin diye yönlendirme bilgisini taşı
            const routing = {
              categoryId: it.categoryId || null,
              yaziciIds: Array.isArray(it.yaziciIds) ? it.yaziciIds : [],
            };
            if (e.removed) {
              removedItems.push({ ad: it.ad, adet: e.originalAdet, notlar: it.notlar, ...routing });
            } else if (e.adet !== e.originalAdet) {
              changedItems.push({
                ad: it.ad,
                fromAdet: e.originalAdet,
                toAdet: e.adet,
                notlar: it.notlar,
                ...routing,
              });
            }
          });

          await updateOrderItems({
            orderId,
            newItems: updatedExistingItems,
            originalItems: existingOrder.items,
            kullaniciId: user.uid,
            kullaniciAd: profile?.ad || 'Garson',
          });
          editDiff = { removed: removedItems, changed: changedItems };
        }

        // Yeni eklenecek ürünler varsa
        let addedCount = 0;
        if (items.length > 0) {
          const result = await addItemsToOrder({
            orderId,
            garsonId: user.uid,
            newItems: items.map((it) => ({
              productId: it.productId,
              adet: it.adet,
              notlar: it.notlar,
            })),
          });
          addedCount = result.added;
        }

        // Mutfak fişi: diff veya ek sipariş veya her ikisi
        const isCorrection = !!editDiff && (editDiff.removed.length > 0 || editDiff.changed.length > 0);
        if (isCorrection || addedCount > 0) {
          toast.success(
            isCorrection
              ? `${addedCount > 0 ? `${addedCount} eklendi, ` : ''}sipariş güncellendi`
              : `${addedCount} ürün eklendi`,
          );
          setKitchenTicket({
            isAddendum: !isCorrection && addedCount > 0,
            isCorrection,
            correctionDiff: editDiff,
            addedItems: ticketItems,
            order: {
              id: orderId,
              masaAd,
              kisiSayisi: null,
              garsonAd: profile?.ad || 'Garson',
            },
            items: ticketItems,
          });
        }
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
    // Garson: sipariş girildikten sonra otomatik çıkış → POS kod giriş ekranına dön.
    // (Tablet garsonlar arası paylaşımlı; herkes kendi kodunu girsin.) Logout user'ı
    // null'a çeker, ProtectedRoute /pos/login'e yönlendirir. Kasiyer/admin masalarda kalır.
    if (rol === 'garson') {
      logout();
    } else {
      navigate('/pos/tables');
    }
  };

  const subtotal = total();

  // Müşteri ekranına canlı sepet bilgisi gönder
  useEffect(() => {
    if (!masaAd) return;
    // Mevcut siparişin önceki kalemleri + sepetteki yeni kalemleri birleştir
    const existingItems = existingOrder?.items || [];
    const cartItems = items.map((it) => ({
      ad: it.ad,
      adet: it.adet,
      fiyat: it.fiyat,
      notlar: it.notlar,
    }));
    const allItems = [...existingItems, ...cartItems];
    const grandSubtotal = (existingOrder?.araToplam || 0) + subtotal;
    pushToCustomerDisplay({
      mode: items.length > 0 || allItems.length > 0 ? 'order' : 'idle',
      order: {
        masaAd,
        items: allItems,
        araToplam: grandSubtotal,
        toplam: grandSubtotal,
      },
    });
  }, [items, masaAd, subtotal, existingOrder?.items, existingOrder?.araToplam]);

  // Sayfa kapanırken müşteri ekranını idle'a çek
  useEffect(() => {
    return () => {
      pushToCustomerDisplay({ mode: 'idle' });
    };
  }, []);

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
                <ProductCard key={p.id} product={p} onAdd={() => handleProductClick(p)} />
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
          {/* Mevcut sipariş — düzenlenebilir */}
          {existingOrder?.items?.length > 0 && (
            <div className={`mb-3 rounded-xl border-2 p-3 ${hasEdits ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Mevcut Sipariş {hasEdits && <span className="ml-1 text-amber-700">· düzenlendi</span>}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {existingOrder.items.length} kalem · {formatTL(existingOrder.toplam || 0)}
                </span>
              </div>
              <ul className="space-y-1.5">
                {existingOrder.items.map((it, idx) => {
                  const e = editedExisting[`${idx}`] || {
                    adet: it.adet,
                    originalAdet: it.adet,
                    removed: false,
                  };
                  const changed = e.adet !== e.originalAdet || e.removed;
                  return (
                    <li
                      key={idx}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                        e.removed
                          ? 'bg-red-50 text-slate-400 line-through'
                          : changed
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-white text-slate-700'
                      }`}
                    >
                      {/* Sol: adet × ad */}
                      <span className="min-w-0 flex-1 truncate">
                        <strong className="mr-1 tabular-nums">{formatAdet(e.adet)}×</strong>
                        {it.ad}
                        {it.notlar && (
                          <em className="ml-1 text-xs text-slate-500">({it.notlar})</em>
                        )}
                        {changed && !e.removed && (
                          <span className="ml-1 text-[10px] text-amber-600">
                            (eski {formatAdet(e.originalAdet)})
                          </span>
                        )}
                      </span>

                      {/* +/- kontrolleri */}
                      {!e.removed && (
                        <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white">
                          <button
                            onClick={() => adjustExistingQty(idx, -1)}
                            className="rounded p-1 text-slate-600 hover:bg-slate-100"
                            aria-label="Azalt"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="min-w-[20px] text-center text-xs font-bold tabular-nums">
                            {formatAdet(e.adet)}
                          </span>
                          <button
                            onClick={() => adjustExistingQty(idx, 1)}
                            className="rounded p-1 text-slate-600 hover:bg-slate-100"
                            aria-label="Arttır"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}

                      {/* Sil / Geri al */}
                      {!changed ? (
                        <button
                          onClick={() => removeExistingItem(idx)}
                          className="rounded p-1 text-red-500 hover:bg-red-100"
                          title="Bu kalemi sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : (
                        <button
                          onClick={() => undoExistingChange(idx)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-200"
                          title="Değişikliği geri al"
                        >
                          <X size={12} />
                        </button>
                      )}

                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {formatTL(it.fiyat * e.adet)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-center text-[10px] italic text-slate-500">
                {hasEdits
                  ? '⚠️ Değişiklikler mutfağa düzeltme fişi olarak iletilecek'
                  : 'Aşağıdaki yeni ürünler mevcut siparişe eklenecek'}
              </p>
            </div>
          )}

          {existingOrder?.items?.length > 0 && items.length > 0 && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
              + Yeni Eklenenler
            </div>
          )}

          {items.length === 0 ? (
            <p className="py-16 text-center text-base text-slate-400">
              {existingOrder?.items?.length > 0
                ? 'Soldan yeni ürün ekleyin'
                : 'Sepet boş'}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((it) => (
                <li
                  key={it.lineId}
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
                      onClick={() => changeQuantity(it.lineId, -1)}
                      className="rounded-lg bg-slate-100 p-2.5 hover:bg-slate-200 active:scale-95"
                      aria-label="Azalt"
                    >
                      <Minus size={20} />
                    </button>
                    <span className="w-12 text-center text-2xl font-bold tabular-nums">
                      {formatAdet(it.adet)}
                    </span>
                    <button
                      onClick={() => changeQuantity(it.lineId, 1)}
                      className="rounded-lg bg-slate-100 p-2.5 hover:bg-slate-200 active:scale-95"
                      aria-label="Arttır"
                    >
                      <Plus size={20} />
                    </button>
                    <button
                      onClick={() => toggleHalf(it.lineId)}
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
                      onClick={() => removeItem(it.lineId)}
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
              disabled={(items.length === 0 && !hasEdits) || submitting}
              className="btn-primary py-3 text-base disabled:opacity-50"
            >
              {submitting
                ? 'Gönderiliyor…'
                : !orderId
                  ? 'Onayla'
                  : items.length > 0
                    ? 'Ekle'
                    : 'Kaydet'}
            </button>
          </div>
        </div>
      </aside>

      <NoteModal
        open={!!noteFor}
        item={noteFor}
        onClose={() => setNoteFor(null)}
        onSave={(note) => {
          if (noteFor) setNote(noteFor.lineId, note);
          setNoteFor(null);
        }}
      />

      <ProductOptionsModal
        open={!!optionsFor}
        product={optionsFor}
        onClose={() => setOptionsFor(null)}
        onConfirm={(joinedNotes) => {
          if (optionsFor) addItem(optionsFor, joinedNotes);
          setOptionsFor(null);
        }}
      />

      <KitchenTicket
        open={!!kitchenTicket}
        onClose={closeKitchenTicket}
        order={kitchenTicket?.order}
        items={kitchenTicket?.items}
        isAddendum={kitchenTicket?.isAddendum}
        isCorrection={kitchenTicket?.isCorrection}
        correctionDiff={kitchenTicket?.correctionDiff}
      />
    </div>
  );
}

function ProductCard({ product, onAdd }) {
  // Stok takibi: undefined → eski davranış (takipli). Açıkça false ise takipsiz.
  const stokTakipli = product.stokTakipli !== false;
  const outOfStock = stokTakipli && product.stok <= 0;
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
        {stokTakipli && (
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
