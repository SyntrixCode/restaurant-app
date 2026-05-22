import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ImageIcon } from 'lucide-react';
import { watchCollection, fetchOne, orderBy } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';

export default function Menu() {
  const { masaId } = useParams();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [masa, setMasa] = useState(null);
  const { settings } = useSettingsStore();

  useEffect(() => watchCollection('categories', setCategories, orderBy('sira', 'asc')), []);
  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => {
    if (!masaId) return;
    fetchOne('tables', masaId).then(setMasa).catch(console.error);
  }, [masaId]);

  const activeCategories = useMemo(() => categories.filter((c) => c.aktif), [categories]);

  useEffect(() => {
    if (!activeCategory && activeCategories[0]) setActiveCategory(activeCategories[0].id);
  }, [activeCategories, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map();
    activeCategories.forEach((c) => map.set(c.id, []));
    products
      .filter((p) => p.aktif)
      .forEach((p) => {
        if (map.has(p.categoryId)) map.get(p.categoryId).push(p);
      });
    return map;
  }, [activeCategories, products]);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-xl font-bold text-slate-900">{settings.restoranAd || 'Restoran'}</h1>
          {masa && <p className="text-sm text-slate-500">{masa.ad}</p>}
        </div>
      </header>

      <nav className="sticky top-[57px] z-10 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2">
        <div className="mx-auto flex max-w-2xl gap-2">
          {activeCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCategory(c.id);
                document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
                activeCategory === c.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {c.ad}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {activeCategories.length === 0 && (
          <p className="py-12 text-center text-slate-500">Menü hazırlanıyor.</p>
        )}
        {activeCategories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="mb-8">
            <h2 className="mb-3 text-lg font-bold text-slate-900">{c.ad}</h2>
            <div className="space-y-3">
              {(grouped.get(c.id) || []).length === 0 ? (
                <p className="text-sm text-slate-400">Bu kategoride ürün yok.</p>
              ) : (
                (grouped.get(c.id) || []).map((p) => (
                  <article
                    key={p.id}
                    className={`flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${
                      p.stok <= 0 ? 'opacity-50' : ''
                    }`}
                  >
                    {p.gorsel ? (
                      <img src={p.gorsel} alt={p.ad} loading="lazy" className="h-20 w-20 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900">{p.ad}</h3>
                        <span className="whitespace-nowrap font-bold text-blue-600">{formatTL(p.fiyat)}</span>
                      </div>
                      {p.aciklama && <p className="mt-1 text-sm text-slate-500">{p.aciklama}</p>}
                      {p.stok <= 0 && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          Tükendi
                        </span>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        {settings.restoranAdres && <p>{settings.restoranAdres}</p>}
        {settings.restoranTel && <p>Tel: {settings.restoranTel}</p>}
      </footer>
    </div>
  );
}
