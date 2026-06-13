import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ImageIcon, BellRing, Receipt, Check, Search, Star, X,
  MapPin, Clock, Instagram, MessageCircle, CalendarCheck, ArrowUp,
} from 'lucide-react';
import { watchCollection, fetchOne, orderBy, createDoc, watchDoc } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import PoweredBy from '../../components/PoweredBy';
import { MENU_LANGS, t, dirFor, localized } from '../../utils/menuI18n';

const CALL_COOLDOWN_MS = 60_000;

// Müşteri menüsü rozetleri (emoji + i18n anahtarı)
const BADGES = {
  populer: { e: '🔥', k: 'rozet_populer' },
  yeni: { e: '🆕', k: 'rozet_yeni' },
  acili: { e: '🌶️', k: 'rozet_acili' },
  vejetaryen: { e: '🥬', k: 'rozet_vejetaryen' },
};

// Parşömen tema renk paleti — restoran PDF'inden esinlenmiş
const THEME = {
  bg: '#f4ecd5',
  bgAlt: '#ede1c0',
  banner: '#1f1a14',
  gold: '#d4a749',
  goldLight: '#e8c378',
  text: '#3a2e1f',
  textMuted: '#7a6749',
  divider: '#c9b890',
};

const lc = (s) => (s || '').toString().toLocaleLowerCase('tr-TR');
const waLink = (num, msg) =>
  `https://wa.me/${(num || '').replace(/[^0-9]/g, '')}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;

export default function Menu() {
  const { masaId } = useParams();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [masa, setMasa] = useState(null);
  const [calling, setCalling] = useState(null);
  const [calledTip, setCalledTip] = useState(null);
  const [lang, setLang] = useState('tr');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // detay penceresi ürünü
  const [showTop, setShowTop] = useState(false);
  const { settings: staffSettings } = useSettingsStore();
  // Anonim müşteri settings/global'i okuyamaz (kurallar) → public aynayı dinle ve birleştir
  const [pubSettings, setPubSettings] = useState(null);
  useEffect(() => watchDoc('settings', 'public', (d) => d && setPubSettings(d)), []);
  const settings = pubSettings ? { ...staffSettings, ...pubSettings } : staffSettings;
  const garsonCagirmaAcik = settings?.garsonCagirmaAcik !== false;
  const waNum = (settings.whatsappNumarasi || '').replace(/[^0-9]/g, '');
  const dir = dirFor(lang);
  const genel = !masaId; // masasız = Instagram/genel menü (masa adı + garson çağır YOK)

  useEffect(() => watchCollection('categories', setCategories, orderBy('sira', 'asc')), []);
  useEffect(() => watchCollection('products', setProducts), []);
  useEffect(() => {
    if (!masaId) return;
    fetchOne('tables', masaId).then(setMasa).catch(console.error);
  }, [masaId]);

  // "Yukarı çık" butonu görünürlüğü
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const activeCategories = useMemo(() => categories.filter((c) => c.aktif), [categories]);

  useEffect(() => {
    if (!activeCategory && activeCategories[0]) setActiveCategory(activeCategories[0].id);
  }, [activeCategories, activeCategory]);

  const q = search.trim();
  const matchProduct = (p) => {
    if (!q) return true;
    const n = lc(q);
    return lc(p.ad).includes(n) || lc(localized(p, lang, 'ad')).includes(n) || lc(localized(p, lang, 'aciklama')).includes(n);
  };

  const grouped = useMemo(() => {
    const map = new Map();
    activeCategories.forEach((c) => map.set(c.id, []));
    products
      .filter((p) => p.aktif && matchProduct(p))
      .sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999))
      .forEach((p) => {
        if (map.has(p.categoryId)) map.get(p.categoryId).push(p);
      });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategories, products, q, lang]);

  const featured = useMemo(
    () => products.filter((p) => p.aktif && p.oneCikan).sort((a, b) => (a.sira ?? 9999) - (b.sira ?? 9999)),
    [products],
  );

  const sonucVar = q ? activeCategories.some((c) => (grouped.get(c.id) || []).length > 0) : true;

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
      // Masa adını garanti et — asenkron fetch henüz bitmediyse anında çek.
      let masaAd = masa?.ad;
      if (!masaAd) {
        try {
          const m = await fetchOne('tables', masaId);
          if (m) { setMasa(m); masaAd = m.ad; }
        } catch { /* yoksay */ }
      }
      await createDoc('waiterCalls', {
        masaId,
        masaAd: masaAd || masaId,
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

  const langButtons = (
    <div className="flex gap-1">
      {MENU_LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className="rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition"
          style={lang === l.code ? { background: THEME.banner, color: THEME.gold } : { background: THEME.bgAlt, color: THEME.text }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="min-h-full pb-2"
      dir={dir}
      style={{
        background: `${THEME.bg} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='1' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.92  0 0 0 0 0.85  0 0 0 0 0.68  0 0 0 0.12 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        color: THEME.text,
        fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
      }}
    >
      {/* HEADER */}
      {genel ? (
        <header className="border-b" style={{ background: THEME.bg, borderColor: THEME.divider }}>
          <div className="mx-auto max-w-2xl px-4 pb-5 pt-9 text-center">
            <img
              src="/branding/ala-konya-logo.png"
              alt={settings.restoranAd || 'Alâ Konya Mutfağı'}
              className="mx-auto h-28 w-auto sm:h-32"
            />
            <div className="mx-auto mt-5 h-px w-24" style={{ background: THEME.gold }} />
            <p className="mt-3 text-xs uppercase tracking-[0.4em]" style={{ color: THEME.textMuted }}>
              {t(lang, 'menu')}
            </p>
            {settings.menuKarsilama && (
              <p className="mt-2 text-base italic" style={{ color: THEME.text }}>
                {settings.menuKarsilama}
              </p>
            )}
            {settings.restoranAdres && (
              <p className="mt-2 text-sm italic" style={{ color: THEME.textMuted }}>
                {settings.restoranAdres}
              </p>
            )}
            <div className="mt-4 flex justify-center">{langButtons}</div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-20 border-b shadow-sm" style={{ background: THEME.bg, borderColor: THEME.divider }}>
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <img
              src="/branding/ala-konya-logo.png"
              alt={settings.restoranAd || 'Alâ Konya Mutfağı'}
              className="h-[3.75rem] w-auto"
            />
            <div className="ml-auto flex items-center gap-2">
              {masa && <p className="text-sm font-medium" style={{ color: THEME.textMuted }}>{masa.ad}</p>}
              {langButtons}
            </div>
          </div>
        </header>
      )}

      {/* KATEGORİ NAV + ARAMA */}
      <nav className="sticky z-10 border-b" style={{ top: genel ? '0' : '5.5rem', background: THEME.banner, borderColor: THEME.gold + '40' }}>
        <div className="mx-auto max-w-2xl px-2 pt-2">
          {/* Arama kutusu */}
          <div className="relative mb-2 px-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: THEME.banner }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'ara')}
              className="w-full rounded-md border-0 py-2 pl-9 pr-8 text-sm outline-none"
              style={{ background: THEME.bg, color: THEME.text }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1" style={{ color: THEME.banner }}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 pb-2">
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
                style={active ? { background: THEME.gold, color: THEME.banner } : { color: THEME.goldLight }}
              >
                {localized(c, lang, 'ad')}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ÖNE ÇIKANLAR / ŞEFİN ÖNERİSİ vitrini */}
      {!q && featured.length > 0 && (
        <section className="mx-auto max-w-2xl px-4 pt-6">
          <div className="mb-3 flex items-center gap-2">
            <Star size={18} style={{ color: THEME.gold }} fill={THEME.gold} />
            <h2 className="text-lg font-bold uppercase tracking-wide" style={{ color: THEME.text }}>
              {t(lang, 'oneCikanlar')}
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {featured.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-36 shrink-0 overflow-hidden text-left shadow-sm transition active:scale-95"
                style={{ background: 'rgba(255,252,240,0.7)', border: `1.5px solid ${THEME.gold}`, borderRadius: '6px' }}
              >
                {p.gorsel ? (
                  <img src={p.gorsel} alt={localized(p, lang, 'ad')} loading="lazy" className="h-24 w-full object-cover" />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center" style={{ background: THEME.bgAlt, color: THEME.textMuted }}>
                    <ImageIcon size={22} />
                  </div>
                )}
                <div className="p-2">
                  <p className="truncate text-sm font-bold" style={{ color: THEME.text }}>{localized(p, lang, 'ad')}</p>
                  <p className="text-sm font-bold" style={{ color: THEME.gold }}>{formatTL(p.fiyat)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <main className="mx-auto max-w-2xl px-4 py-8">
        {activeCategories.length === 0 && (
          <p className="py-12 text-center italic" style={{ color: THEME.textMuted }}>{t(lang, 'menuHazirlaniyor')}</p>
        )}
        {q && !sonucVar && (
          <p className="py-12 text-center italic" style={{ color: THEME.textMuted }}>{t(lang, 'sonucYok')}</p>
        )}
        {activeCategories.map((c) => {
          const list = grouped.get(c.id) || [];
          if (q && list.length === 0) return null; // aramada boş kategoriyi gizle
          return (
            <section key={c.id} id={`cat-${c.id}`} className="mb-10">
              <div
                className="mb-6 flex items-center justify-center px-6 py-2.5 shadow"
                style={{ background: THEME.banner, borderTop: `2px solid ${THEME.gold}`, borderBottom: `2px solid ${THEME.gold}` }}
              >
                <span className="text-center text-xl font-bold uppercase tracking-[0.25em]" style={{ color: THEME.gold, fontFamily: 'Georgia, serif' }}>
                  {localized(c, lang, 'ad')}
                </span>
              </div>

              {list.length === 0 ? (
                <p className="text-center text-sm italic" style={{ color: THEME.textMuted }}>{t(lang, 'kategoriBos')}</p>
              ) : (
                <ul className="space-y-3">
                  {list.map((p) => {
                    const adTr = p.ad || '';
                    const adLang = localized(p, lang, 'ad');
                    const aciklamaLang = localized(p, lang, 'aciklama');
                    const soldOut = p.stokTakipli !== false && p.stok <= 0;
                    const rozetler = [...(p.oneCikan ? ['sef'] : []), ...(p.etiketler || [])];
                    return (
                      <li
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={`relative flex cursor-pointer gap-3 border px-3 py-3 shadow-sm transition active:scale-[0.99] ${soldOut ? 'opacity-50' : ''}`}
                        style={{ background: 'rgba(255, 252, 240, 0.6)', borderColor: THEME.divider, borderRadius: '4px' }}
                      >
                        {p.gorsel ? (
                          <img src={p.gorsel} alt={adLang} loading="lazy" className="h-20 w-20 shrink-0 object-cover shadow-sm" style={{ border: `1.5px solid ${THEME.divider}`, borderRadius: '2px' }} />
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center" style={{ background: THEME.bgAlt, border: `1.5px dashed ${THEME.divider}`, color: THEME.textMuted, borderRadius: '2px' }}>
                            <ImageIcon size={22} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-bold leading-tight" style={{ color: THEME.text, fontFamily: 'Georgia, serif' }}>{adLang}</h3>
                              {lang !== 'tr' && adTr && adTr !== adLang && (
                                <p className="truncate text-xs italic" style={{ color: THEME.textMuted }}>{adTr}</p>
                              )}
                            </div>
                            <span className="shrink-0 whitespace-nowrap text-lg font-bold" style={{ color: THEME.gold, fontFamily: 'Georgia, serif' }}>{formatTL(p.fiyat)}</span>
                          </div>
                          {/* Rozetler */}
                          {rozetler.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {rozetler.map((r) =>
                                r === 'sef' ? (
                                  <span key="sef" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: THEME.gold, color: THEME.banner }}>
                                    ⭐ {t(lang, 'rozet_sef')}
                                  </span>
                                ) : BADGES[r] ? (
                                  <span key={r} className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: THEME.bgAlt, color: THEME.text }}>
                                    {BADGES[r].e} {t(lang, BADGES[r].k)}
                                  </span>
                                ) : null,
                              )}
                            </div>
                          )}
                          {aciklamaLang && <p className="mt-1.5 line-clamp-2 text-sm leading-snug" style={{ color: THEME.textMuted }}>{aciklamaLang}</p>}
                          {soldOut && (
                            <span className="mt-1.5 inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: '#9c2727', color: THEME.gold, borderRadius: '2px' }}>
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

      {/* GARSON ÇAĞIR / HESAP İSTE */}
      {masaId && garsonCagirmaAcik && (
        <div className="sticky bottom-0 z-20 border-t backdrop-blur" style={{ background: THEME.banner + 'f0', borderColor: THEME.gold + '60' }}>
          <div className="mx-auto flex max-w-2xl gap-3 px-4 py-3">
            <button onClick={() => handleCall('garson')} disabled={calling === 'garson'} className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-bold uppercase tracking-wider shadow-sm transition active:scale-95 disabled:opacity-60" style={{ background: THEME.gold, color: THEME.banner }}>
              {calledTip === 'garson' ? <Check size={20} /> : <BellRing size={20} />}
              {calledTip === 'garson' ? t(lang, 'garsonCagrildi') : t(lang, 'garsonCagir')}
            </button>
            <button onClick={() => handleCall('hesap')} disabled={calling === 'hesap'} className="flex flex-1 items-center justify-center gap-2 rounded-md border-2 px-4 py-3 text-base font-bold uppercase tracking-wider shadow-sm transition active:scale-95 disabled:opacity-60" style={{ background: 'transparent', color: THEME.gold, borderColor: THEME.gold }}>
              {calledTip === 'hesap' ? <Check size={20} /> : <Receipt size={20} />}
              {calledTip === 'hesap' ? t(lang, 'hesapIstendi') : t(lang, 'hesapIste')}
            </button>
          </div>
        </div>
      )}

      {/* REZERVASYON — Instagram/genel menüde sabit alt çubuk (kaydırınca hep görünür) */}
      {genel && waNum && (
        <div className="sticky bottom-0 z-20 border-t backdrop-blur" style={{ background: THEME.banner + 'f0', borderColor: THEME.gold + '60' }}>
          <div className="mx-auto max-w-2xl px-4 py-3">
            <a
              href={waLink(waNum, 'Merhaba, rezervasyon yapmak istiyorum.')}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-bold uppercase tracking-wider shadow-sm transition active:scale-95"
              style={{ background: THEME.gold, color: THEME.banner }}
            >
              <CalendarCheck size={20} /> {t(lang, 'rezervasyon')}
            </a>
          </div>
        </div>
      )}

      {/* SOSYAL / İLETİŞİM ALT BİLGİ */}
      <SocialFooter lang={lang} settings={settings} genel={genel} />

      {/* ÜRÜN DETAY PENCERESİ */}
      {selected && <MenuDetailModal item={selected} lang={lang} onClose={() => setSelected(null)} />}

      {/* YUKARI ÇIK */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-20 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition active:scale-90"
          style={{ background: THEME.gold, color: THEME.banner }}
          aria-label={t(lang, 'yukariCik')}
        >
          <ArrowUp size={22} />
        </button>
      )}
    </div>
  );
}

function SocialFooter({ lang, settings, genel }) {
  const waNum = (settings.whatsappNumarasi || '').replace(/[^0-9]/g, '');
  const links = [];
  if (settings.googleMapsUrl) links.push({ icon: MapPin, label: t(lang, 'konum'), href: settings.googleMapsUrl });
  if (waNum) links.push({ icon: MessageCircle, label: 'WhatsApp', href: waLink(waNum) });
  if (settings.instagramUrl) links.push({ icon: Instagram, label: t(lang, 'instagram'), href: settings.instagramUrl });
  if (settings.fisQrUrl) links.push({ icon: Star, label: t(lang, 'googleDegerlendir'), href: settings.fisQrUrl });

  return (
    <footer className="border-t px-4 py-7 text-center text-sm" style={{ background: THEME.banner, color: THEME.goldLight, borderColor: THEME.gold + '40' }}>
      {/* Sosyal ikon satırı */}
      {links.length > 0 && (
        <div className="mb-4 flex flex-wrap justify-center gap-2">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95"
              style={{ borderColor: THEME.gold + '70', color: THEME.goldLight }}
            >
              <l.icon size={14} /> {l.label}
            </a>
          ))}
        </div>
      )}

      {settings.calismaSaatleri && (
        <p className="mb-1 flex items-center justify-center gap-1.5"><Clock size={13} /> {settings.calismaSaatleri}</p>
      )}
      {settings.restoranAdres && <p className="italic">{settings.restoranAdres}</p>}
      {settings.restoranTel && <p className="mt-1 font-medium">{t(lang, 'tel')}: {settings.restoranTel}</p>}
      <div className="mt-3 opacity-70"><PoweredBy /></div>
    </footer>
  );
}

function MenuDetailModal({ item, lang, onClose }) {
  const adLang = localized(item, lang, 'ad');
  const adTr = item.ad || '';
  const aciklamaLang = localized(item, lang, 'aciklama');
  const rozetler = [...(item.oneCikan ? ['sef'] : []), ...(item.etiketler || [])];
  const soldOut = item.stokTakipli !== false && item.stok <= 0;

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl"
        style={{ background: THEME.bg, color: THEME.text, fontFamily: '"Cormorant Garamond", Georgia, serif' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {item.gorsel ? (
            <img src={item.gorsel} alt={adLang} className="h-56 w-full object-cover" />
          ) : (
            <div className="flex h-40 w-full items-center justify-center" style={{ background: THEME.bgAlt, color: THEME.textMuted }}>
              <ImageIcon size={40} />
            </div>
          )}
          <button onClick={onClose} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full shadow-md" style={{ background: THEME.bg, color: THEME.text }} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>{adLang}</h2>
            <span className="shrink-0 whitespace-nowrap text-2xl font-bold" style={{ color: THEME.gold, fontFamily: 'Georgia, serif' }}>{formatTL(item.fiyat)}</span>
          </div>
          {lang !== 'tr' && adTr && adTr !== adLang && <p className="text-sm italic" style={{ color: THEME.textMuted }}>{adTr}</p>}

          {rozetler.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rozetler.map((r) =>
                r === 'sef' ? (
                  <span key="sef" className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-bold" style={{ background: THEME.gold, color: THEME.banner }}>⭐ {t(lang, 'rozet_sef')}</span>
                ) : BADGES[r] ? (
                  <span key={r} className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: THEME.bgAlt, color: THEME.text }}>{BADGES[r].e} {t(lang, BADGES[r].k)}</span>
                ) : null,
              )}
            </div>
          )}

          {aciklamaLang && <p className="mt-4 text-base leading-relaxed" style={{ color: THEME.textMuted }}>{aciklamaLang}</p>}
          {soldOut && (
            <span className="mt-4 inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ background: '#9c2727', color: THEME.gold, borderRadius: '3px' }}>{t(lang, 'tukendi')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
