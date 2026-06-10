import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ImageIcon, BellRing, Receipt, Check } from 'lucide-react';
import { watchCollection, fetchOne, orderBy, createDoc } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import PoweredBy from '../../components/PoweredBy';
import { MENU_LANGS, t, dirFor, localized } from '../../utils/menuI18n';

const CALL_COOLDOWN_MS = 60_000;

// Parşömen tema renk paleti — restoran PDF'inden esinlenmiş
const THEME = {
  bg: '#f4ecd5',         // parşömen sarımtırak bej
  bgAlt: '#ede1c0',      // koyu bej (banner altı tonu)
  banner: '#1f1a14',     // banner / kategori arka planı (koyu kahverengi-siyah)
  gold: '#d4a749',       // altın aksan (PDF'teki sarı vurgu)
  goldLight: '#e8c378',  // açık altın (hover, kenarlık)
  text: '#3a2e1f',       // ana metin (koyu kahverengi)
  textMuted: '#7a6749',  // ikincil metin
  divider: '#c9b890',    // dekoratif ayraç çizgisi
};

export default function Menu() {
  const { masaId } = useParams();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [masa, setMasa] = useState(null);
  const [calling, setCalling] = useState(null);
  const [calledTip, setCalledTip] = useState(null);
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
      .sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999))
      .forEach((p) => {
        if (map.has(p.categoryId)) map.get(p.categoryId).push(p);
      });
    return map;
  }, [activeCategories, products]);

  const handleCall = async (tip) => {
    if (!masaId || calling) return;
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
        tip,
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
    <div
      className="min-h-full"
      dir={dir}
      style={{
        background: `${THEME.bg} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='1' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.92  0 0 0 0 0.85  0 0 0 0 0.68  0 0 0 0.12 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        color: THEME.text,
        fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
      }}
    >
      {/* HEADER: parşömen + logo + dil butonları */}
      <header
        className="sticky top-0 z-20 border-b shadow-sm"
        style={{ background: THEME.bg, borderColor: THEME.divider }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <img
            src="/branding/ala-konya-logo.png"
            alt={settings.restoranAd || 'Alâ Konya Mutfağı'}
            className="h-[3.75rem] w-auto"
          />
          <div className="ml-auto flex items-center gap-2">
            {masa && (
              <p className="text-sm font-medium" style={{ color: THEME.textMuted }}>
                {masa.ad}
              </p>
            )}
            <div className="flex gap-1">
              {MENU_LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className="rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition"
                  style={
                    lang === l.code
                      ? { background: THEME.banner, color: THEME.gold }
                      : { background: THEME.bgAlt, color: THEME.text }
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* KATEGORİ NAVİGASYON ŞERİDİ */}
      <nav
        className="sticky z-10 overflow-x-auto border-b"
        style={{
          top: '5.5rem',
          background: THEME.banner,
          borderColor: THEME.gold + '40',
        }}
      >
        <div className="mx-auto flex max-w-2xl gap-1 px-2 py-2">
          {activeCategories.map((c) => {
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCategory(c.id);
                  document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold uppercase tracking-wide transition"
                style={
                  active
                    ? { background: THEME.gold, color: THEME.banner }
                    : { color: THEME.goldLight }
                }
              >
                {localized(c, lang, 'ad')}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {activeCategories.length === 0 && (
          <p className="py-12 text-center italic" style={{ color: THEME.textMuted }}>
            {t(lang, 'menuHazirlaniyor')}
          </p>
        )}
        {activeCategories.map((c) => {
          const list = grouped.get(c.id) || [];
          return (
            <section key={c.id} id={`cat-${c.id}`} className="mb-10">
              {/* PDF stilinde kategori banner — koyu çerçeve içinde altın yazı */}
              <div
                className="mb-6 flex items-center justify-center px-6 py-2.5 shadow"
                style={{
                  background: THEME.banner,
                  borderTop: `2px solid ${THEME.gold}`,
                  borderBottom: `2px solid ${THEME.gold}`,
                  borderRadius: 0,
                }}
              >
                <span
                  className="text-center text-xl font-bold uppercase tracking-[0.25em]"
                  style={{ color: THEME.gold, fontFamily: 'Georgia, serif' }}
                >
                  {localized(c, lang, 'ad')}
                </span>
              </div>

              {list.length === 0 ? (
                <p className="text-center text-sm italic" style={{ color: THEME.textMuted }}>
                  {t(lang, 'kategoriBos')}
                </p>
              ) : (
                <ul className="space-y-3">
                  {list.map((p) => {
                    const adTr = p.ad || '';
                    const adLang = localized(p, lang, 'ad');
                    const aciklamaLang = localized(p, lang, 'aciklama');
                    // Sadece stok takipli ürünler "tükendi" olabilir (pide/kebap takipsiz)
                    const soldOut = p.stokTakipli !== false && p.stok <= 0;
                    return (
                      <li
                        key={p.id}
                        className={`relative flex gap-3 border px-3 py-3 shadow-sm ${soldOut ? 'opacity-50' : ''}`}
                        style={{
                          background: 'rgba(255, 252, 240, 0.6)',
                          borderColor: THEME.divider,
                          borderRadius: '4px',
                        }}
                      >
                        {p.gorsel ? (
                          <img
                            src={p.gorsel}
                            alt={adLang}
                            loading="lazy"
                            className="h-20 w-20 shrink-0 object-cover shadow-sm"
                            style={{
                              border: `1.5px solid ${THEME.divider}`,
                              borderRadius: '2px',
                            }}
                          />
                        ) : (
                          <div
                            className="flex h-20 w-20 shrink-0 items-center justify-center"
                            style={{
                              background: THEME.bgAlt,
                              border: `1.5px dashed ${THEME.divider}`,
                              color: THEME.textMuted,
                              borderRadius: '2px',
                            }}
                          >
                            <ImageIcon size={22} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3
                                className="truncate text-base font-bold leading-tight"
                                style={{ color: THEME.text, fontFamily: 'Georgia, serif' }}
                              >
                                {adLang}
                              </h3>
                              {lang !== 'tr' && adTr && adTr !== adLang && (
                                <p
                                  className="truncate text-xs italic"
                                  style={{ color: THEME.textMuted }}
                                >
                                  {adTr}
                                </p>
                              )}
                            </div>
                            <span
                              className="shrink-0 whitespace-nowrap text-lg font-bold"
                              style={{ color: THEME.gold, fontFamily: 'Georgia, serif' }}
                            >
                              {formatTL(p.fiyat)}
                            </span>
                          </div>
                          {aciklamaLang && (
                            <p
                              className="mt-1.5 text-sm leading-snug"
                              style={{ color: THEME.textMuted }}
                            >
                              {aciklamaLang}
                            </p>
                          )}
                          {soldOut && (
                            <span
                              className="mt-1.5 inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                              style={{
                                background: '#9c2727',
                                color: THEME.gold,
                                borderRadius: '2px',
                              }}
                            >
                              {t(lang, 'tukendi')}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </main>

      {/* GARSON ÇAĞIR / HESAP İSTE — koyu banner stil */}
      {masaId && garsonCagirmaAcik && (
        <div
          className="sticky bottom-0 z-20 border-t backdrop-blur"
          style={{
            background: THEME.banner + 'f0',
            borderColor: THEME.gold + '60',
          }}
        >
          <div className="mx-auto flex max-w-2xl gap-3 px-4 py-3">
            <button
              onClick={() => handleCall('garson')}
              disabled={calling === 'garson'}
              className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-bold uppercase tracking-wider shadow-sm transition active:scale-95 disabled:opacity-60"
              style={{ background: THEME.gold, color: THEME.banner }}
            >
              {calledTip === 'garson' ? <Check size={20} /> : <BellRing size={20} />}
              {calledTip === 'garson' ? t(lang, 'garsonCagrildi') : t(lang, 'garsonCagir')}
            </button>
            <button
              onClick={() => handleCall('hesap')}
              disabled={calling === 'hesap'}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border-2 px-4 py-3 text-base font-bold uppercase tracking-wider shadow-sm transition active:scale-95 disabled:opacity-60"
              style={{
                background: 'transparent',
                color: THEME.gold,
                borderColor: THEME.gold,
              }}
            >
              {calledTip === 'hesap' ? <Check size={20} /> : <Receipt size={20} />}
              {calledTip === 'hesap' ? t(lang, 'hesapIstendi') : t(lang, 'hesapIste')}
            </button>
          </div>
        </div>
      )}

      <footer
        className="border-t px-4 py-6 text-center text-sm"
        style={{
          background: THEME.banner,
          color: THEME.goldLight,
          borderColor: THEME.gold + '40',
        }}
      >
        {settings.restoranAdres && <p className="italic">{settings.restoranAdres}</p>}
        {settings.restoranTel && (
          <p className="mt-1 font-medium">
            {t(lang, 'tel')}: {settings.restoranTel}
          </p>
        )}
        <div className="mt-3 opacity-70">
          <PoweredBy />
        </div>
      </footer>
    </div>
  );
}
