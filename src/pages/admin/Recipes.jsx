import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChefHat,
  Plus,
  Trash2,
  Save,
  Search,
  X,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, upsertDoc, removeDoc } from '../../firebase/firestore';
import { formatTL, formatAdet } from '../../utils/format';

const BIRIM_LABELS = {
  adet: 'adet',
  kg: 'kg',
  gram: 'g',
  lt: 'lt',
  ml: 'ml',
  paket: 'paket',
};

export default function AdminRecipes() {
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => watchCollection('ingredients', setIngredients), []);
  useEffect(() => watchCollection('recipes', setRecipes), []);

  const recipeMap = useMemo(() => {
    const map = {};
    for (const r of recipes) map[r.id] = r;
    return map;
  }, [recipes]);

  const productList = useMemo(() => {
    let list = products.filter((p) => p.aktif);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.ad?.toLowerCase().includes(q) || p.categoryAd?.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [products, search]);

  const recetesiOlanSayisi = useMemo(() => {
    let count = 0;
    for (const p of products) if (recipeMap[p.id]?.items?.length > 0) count++;
    return count;
  }, [products, recipeMap]);

  return (
    <div className="p-8">
      <PageHeader
        title="Reçeteler"
        subtitle="Bir ürünü malzemelere bağlayarak satış sırasında stok otomatik düşer"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Aktif Ürün" value={products.filter((p) => p.aktif).length} icon={ChefHat} />
        <StatCard label="Reçetesi Olan" value={recetesiOlanSayisi} color="green" />
        <StatCard label="Malzeme Sayısı" value={ingredients.length} color="blue" />
      </div>

      {ingredients.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Henüz malzeme tanımlanmamış. Reçete oluşturmadan önce <a href="/admin/ingredients" className="font-semibold underline">Malzemeler</a> sayfasından kıyma/un/yumurta vb. tanımlayın.
        </div>
      )}

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün ara..."
            className="input pl-8"
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <ul className="divide-y divide-slate-100">
          {productList.map((p) => {
            const recipe = recipeMap[p.id];
            const hasRecipe = recipe?.items?.length > 0;
            const maliyet = hasRecipe
              ? recipe.items.reduce((sum, it) => {
                  const ing = ingredients.find((i) => i.id === it.ingredientId);
                  return sum + (ing?.birimMaliyet || 0) * (it.miktar || 0);
                }, 0)
              : 0;
            return (
              <li key={p.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm">
                <div className="col-span-3">
                  <p className="font-medium text-slate-900">{p.ad}</p>
                  <p className="text-xs text-slate-500">{p.categoryAd}</p>
                </div>
                <div className="col-span-2 text-sm text-slate-700">{formatTL(p.fiyat)}</div>
                <div className="col-span-4">
                  {hasRecipe ? (
                    <div className="flex flex-wrap gap-1 text-xs">
                      {recipe.items.slice(0, 4).map((it, idx) => {
                        const ing = ingredients.find((i) => i.id === it.ingredientId);
                        return (
                          <span
                            key={idx}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700"
                          >
                            {ing?.ad || '?'} ×{formatAdet(it.miktar)}
                            {ing?.birim && ` ${BIRIM_LABELS[ing.birim]}`}
                          </span>
                        );
                      })}
                      {recipe.items.length > 4 && (
                        <span className="text-slate-400">+{recipe.items.length - 4}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs italic text-slate-400">Reçete tanımlı değil</span>
                  )}
                </div>
                <div className="col-span-2 text-xs">
                  {maliyet > 0 && (
                    <>
                      <p className="text-slate-500">Maliyet</p>
                      <p className="font-semibold text-slate-900">{formatTL(maliyet)}</p>
                      {p.fiyat > 0 && (
                        <p className="text-emerald-600">
                          %{(((p.fiyat - maliyet) / p.fiyat) * 100).toFixed(0)} kar
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="col-span-1 text-right">
                  <button
                    onClick={() => setEditing({ product: p, recipe })}
                    className="btn-ghost px-2 py-1 text-sm"
                  >
                    {hasRecipe ? 'Düzenle' : '+ Tanımla'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <RecipeModal
        open={!!editing}
        product={editing?.product}
        existingRecipe={editing?.recipe}
        ingredients={ingredients}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function RecipeModal({ open, product, existingRecipe, ingredients, onClose }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setItems(existingRecipe?.items?.map((it) => ({ ...it })) || []);
      setSearch('');
    }
  }, [open, existingRecipe?.id]);

  if (!open || !product) return null;

  const availableIngredients = ingredients
    .filter((i) => i.aktif !== false)
    .filter((i) => !items.some((it) => it.ingredientId === i.id))
    .filter((i) => !search || i.ad.toLowerCase().includes(search.toLowerCase()));

  const addIngredient = (ing) => {
    setItems((arr) => [...arr, { ingredientId: ing.id, miktar: 1, _ing: ing }]);
    setSearch('');
  };

  const updateItem = (idx, miktar) => {
    setItems((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx], miktar };
      return next;
    });
  };

  const removeItem = (idx) => {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const payload = {
        productId: product.id,
        productAd: product.ad,
        items: items
          .filter((it) => it.miktar > 0)
          .map((it) => ({ ingredientId: it.ingredientId, miktar: Number(it.miktar) })),
      };
      if (payload.items.length === 0) {
        // boş reçete = silme
        await removeDoc('recipes', product.id);
        toast.success('Reçete silindi');
      } else {
        await upsertDoc('recipes', product.id, payload);
        toast.success('Reçete kaydedildi');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Kayıt hatası');
    } finally {
      setSubmitting(false);
    }
  };

  const totalMaliyet = items.reduce((sum, it) => {
    const ing = ingredients.find((i) => i.id === it.ingredientId);
    return sum + (ing?.birimMaliyet || 0) * (Number(it.miktar) || 0);
  }, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reçete — ${product.ad}`}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button onClick={handleSave} disabled={submitting} className="btn-primary disabled:opacity-50">
            <Save size={14} /> Kaydet
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          💡 Bir porsiyon <strong>{product.ad}</strong> hazırlamak için gereken malzemeleri ekleyin.
          Sipariş alındığında bu malzemelerin stoğu otomatik düşer.
          {product.fiyat > 0 && totalMaliyet > 0 && (
            <p className="mt-1">
              Toplam maliyet: <strong>{formatTL(totalMaliyet)}</strong> · Satış fiyatı:{' '}
              <strong>{formatTL(product.fiyat)}</strong> · Kar:{' '}
              <strong>%{(((product.fiyat - totalMaliyet) / product.fiyat) * 100).toFixed(0)}</strong>
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm italic text-slate-500">
            Henüz malzeme eklenmedi. Aşağıdan seçin.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => {
              const ing =
                it._ing || ingredients.find((i) => i.id === it.ingredientId);
              return (
                <div
                  key={it.ingredientId}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{ing?.ad || '?'}</p>
                    {ing?.birimMaliyet > 0 && (
                      <p className="text-xs text-slate-500">
                        {formatTL(ing.birimMaliyet)} / {BIRIM_LABELS[ing.birim]}
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={it.miktar}
                    onChange={(e) => updateItem(idx, e.target.value)}
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                  />
                  <span className="w-12 text-xs text-slate-500">{BIRIM_LABELS[ing?.birim] || ''}</span>
                  <button
                    onClick={() => removeItem(idx)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Malzeme Ekle
          </p>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Malzeme ara..."
              className="input pl-8"
            />
          </div>
          {availableIngredients.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500">
              {ingredients.length === 0
                ? 'Önce Malzemeler sayfasından tanım yapın.'
                : 'Tüm malzemeler eklendi veya arama sonucu yok.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-1 sm:grid-cols-3">
              {availableIngredients.slice(0, 30).map((i) => (
                <button
                  key={i.id}
                  onClick={() => addIngredient(i)}
                  className="rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50"
                >
                  <span className="font-medium text-slate-900">+ {i.ad}</span>
                  <span className="ml-1 text-slate-500">({BIRIM_LABELS[i.birim]})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
