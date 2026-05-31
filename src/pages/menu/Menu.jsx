import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ImageIcon, BellRing, Receipt, Check } from 'lucide-react';
import { watchCollection, fetchOne, orderBy, createDoc } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import PoweredBy from '../../components/PoweredBy';
import { MENU_LANGS, t, dirFor, localized } from '../../utils/menuI18n';

const CALL_COOLDOWN_MS = 60_000; // aynı masadan 1 dk içinde tekrar çağrı engellenir

export default function Menu() {
  const { masaId } = useParams();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [masa, setMasa] = useState(null);
  const [calling, setCalling] = useState(null); // 'garson' | 'hesap' | null
  const [calledTip, setCalledTip] = useState(null); // son başarılı çağrının tipi
  const [lang, setLang] = useState('tr');
  const { settings } = useSettingsStore();
  const garsonCagirmaAcik = settings?.garsonCagirmaAcik !== false;
  const dir = dirFor(lang);

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

  const handleCall = async (tip) => {
    if (!masaId || calling) return;
    // Spam koruması: aynı masa+tip için 1 dk cooldown (localStorage)
    const key = `waiterCall:${masaId}:${tip}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < CALL_COOLDOWN_MS) {
      setCalledTip(tip);
      setTimeout(() => setCalledTip(null), 3000);
      return;
    }
    setCalling(tip);
    try {
      await createDoc('waiterCalls', {
        masaId,
        masaAd: masa?.ad || masaId,
        tip, // 'garson' | 'hesap'
        durum: 'bekliyor',
        olusturmaZamani: new Date(),
      });
      localStorage.setItem(key, String(Date.now()));
      setCalledTip(tip);
      setTimeout(() => setCalledTip(null), 4000);
    } catch (err) {
      console.error('Garson çağrılamadı:', err);
    } finally {
      setCalling(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50" dir={dir}>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <img
            src="/branding/alazli-logo.svg"
            alt={settings.restoranAd || 'Alazlı Konya Mutfağı'}
            className="h-[3.75rem] w-auto"
          />
          <div className="ml-auto flex items-center gap-2">
            {masa && <p className="text-sm text-slate-500">{masa.ad}</p>}
            <div className="flex gap-1">
              {MENU_LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                    lang === l.code
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
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
              {localized(c, lang, 'ad')}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {activeCategories.length === 0 && (
          <p className="py-12 text-center text-slate-500">{t(lang, 'menuHazirlaniyor')}</p>
        )}
        {activeCategories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="mb-8">
            <h2 className="mb-3 text-lg font-bold text-slate-900">{localized(c, lang, 'ad')}</h2>
            <div className="space-y-3">
              {(grouped.get(c.id) || []).length === 0 ? (
                <p className="text-sm text-slate-400">{t(lang, 'kategoriBos')}</p>
              ) : (
                (grouped.get(c.id) || []).map((p) => (
                  <article
                    key={p.id}
                    className={`flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${
                      p.stok <= 0 ? 'opacity-50' : ''
                    }`}
                  >
                    {p.gorsel ? (
                      <img src={p.gorsel} alt={localized(p, lang, 'ad')} loading="lazy" className="h-20 w-20 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900">{localized(p, lang, 'ad')}</h3>
                        <span className="whitespace-nowrap font-bold text-blue-600">{formatTL(p.fiyat)}</span>
                      </div>
                      {localized(p, lang, 'aciklama') && (
                        <p className="mt-1 text-sm text-slate-500">{localized(p, lang, 'aciklama')}</p>
                      )}
                      {p.stok <= 0 && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          {t(lang, 'tukendi')}
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

      {masaId && garsonCagirmaAcik && (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-3">
            <button
              onClick={() => handleCall('garson')}
              disabled={calling === 'garson'}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-60"
            >
              {calledTip === 'garson' ? <Check size={20} /> : <BellRing size={20} />}
              {calledTip === 'garson' ? t(lang, 'garsonCagrildi') : t(lang, 'garsonCagir')}
            </button>
            <button
              onClick={() => handleCall('hesap')}
              disabled={calling === 'hesap'}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-60"
            >
              {calledTip === 'hesap' ? <Check size={20} /> : <Receipt size={20} />}
              {calledTip === 'hesap' ? t(lang, 'hesapIstendi') : t(lang, 'hesapIste')}
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        {settings.restoranAdres && <p>{settings.restoranAdres}</p>}
        {settings.restoranTel && <p>{t(lang, 'tel')}: {settings.restoranTel}</p>}
        <div className="mt-3">
          <PoweredBy />
        </div>
      </footer>
    </div>
  );
}
