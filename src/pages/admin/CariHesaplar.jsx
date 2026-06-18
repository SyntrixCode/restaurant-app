import { Fragment, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Search, Pencil, Trash2, Plus, Users, Wallet, History, ChevronDown, ChevronRight, Printer, X, FileText } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, createDoc, patchDoc, removeDoc, where, fetchOne } from '../../firebase/firestore';
import { recordCariTahsilat } from '../../firebase/cari';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL, formatDate, formatAdet } from '../../utils/format';

export default function CariHesaplar() {
  const { rol } = useAuthStore();
  const isAdmin = rol === 'admin';
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // {id?, ad, ...} | 'new'
  const [detail, setDetail] = useState(null); // seçili cari (geçmiş + tahsilat)
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => watchCollection('cari', setList), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = list;
    if (q) arr = list.filter((c) => (c.ad || '').toLowerCase().includes(q) || (c.telefon || '').includes(q));
    return [...arr].sort((a, b) => Number(b.bakiye || 0) - Number(a.bakiye || 0));
  }, [list, search]);

  const toplamAlacak = list.reduce((s, c) => s + Number(c.bakiye || 0), 0);
  const borcluSayisi = list.filter((c) => Number(c.bakiye || 0) > 0).length;

  const handleDelete = async (c) => {
    if (Number(c.bakiye || 0) !== 0) {
      toast.error('Bakiyesi sıfır olmayan cari silinemez (önce tahsilat alın)');
      return;
    }
    if (!confirm(`"${c.ad}" carisi silinsin mi?`)) return;
    try {
      await removeDoc('cari', c.id);
      toast.success('Silindi');
    } catch {
      toast.error('Silinemedi');
    }
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Cari Hesaplar"
        subtitle="Patron/veresiye — kişiye yazılan hesaplar ve borç (alacak) takibi"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setReportOpen(true)} className="btn-secondary">
              <FileText size={16} /> Rapor / PDF
            </button>
            <button onClick={() => setEditing('new')} className="btn-primary">
              <Plus size={16} /> Yeni Cari
            </button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Toplam Alacak" value={formatTL(toplamAlacak)} color="red" icon={Wallet} />
        <StatCard label="Cari Sayısı" value={list.length} icon={Users} />
        <StatCard label="Borçlu" value={borcluSayisi} color="amber" icon={CreditCard} />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya telefon ara..."
          className="input pl-10"
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Ad</th>
              <th className="px-3 py-3">Telefon</th>
              <th className="px-3 py-3 text-right">Bakiye (Borç)</th>
              <th className="px-3 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500">
                  {list.length === 0 ? 'Henüz cari yok. "Yeni Cari" ile ekleyin.' : 'Eşleşen cari yok.'}
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const bk = Number(c.bakiye || 0);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">{c.ad}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{c.telefon || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    <span className={bk > 0 ? 'text-rose-600' : bk < 0 ? 'text-emerald-600' : 'text-slate-700'}>
                      {formatTL(bk)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setDetail(c)} className="btn-ghost px-2 py-1" title="Geçmiş & Tahsilat">
                        <History size={14} />
                      </button>
                      <button onClick={() => setEditing(c)} className="btn-ghost px-2 py-1" title="Düzenle">
                        <Pencil size={14} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(c)}
                          className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50"
                          title="Sil"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EditModal value={editing} onClose={() => setEditing(null)} />
      <DetailModal cari={detail} onClose={() => setDetail(null)} />
      {reportOpen && <CariReportModal caris={list} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

// ───────────────── Cari Raporu / Ekstre (yazdır → PDF) ─────────────────
function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CariReportModal({ caris, onClose }) {
  const { settings } = useSettingsStore();
  const [preset, setPreset] = useState('7'); // today | 7 | 30 | custom
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(isoToday());
  const [scope, setScope] = useState('all'); // 'all' | cariId
  const [har, setHar] = useState([]);

  useEffect(() => {
    if (preset === 'today') { setFrom(isoToday()); setTo(isoToday()); }
    else if (preset === '7') { setFrom(isoDaysAgo(6)); setTo(isoToday()); }
    else if (preset === '30') { setFrom(isoDaysAgo(29)); setTo(isoToday()); }
  }, [preset]);

  useEffect(
    () => watchCollection('cariHareketleri', setHar, where('gun', '>=', from), where('gun', '<=', to)),
    [from, to],
  );

  const bakiyeById = useMemo(() => Object.fromEntries((caris || []).map((c) => [c.id, Number(c.bakiye || 0)])), [caris]);

  const rows = useMemo(
    () => (scope === 'all' ? har : har.filter((h) => h.cariId === scope)),
    [har, scope],
  );

  const byCari = useMemo(() => {
    const m = {};
    rows.forEach((h) => {
      const e = m[h.cariId] || { cariId: h.cariId, cariAd: h.cariAd, borc: 0, tahsilat: 0, urunler: {}, adet: 0 };
      if (h.tip === 'borc') {
        e.borc += Number(h.tutar || 0);
        (h.items || []).forEach((it) => {
          const u = e.urunler[it.ad] || { adet: 0, tutar: 0 };
          u.adet += Number(it.adet) || 0;
          u.tutar += (Number(it.fiyat) || 0) * (Number(it.adet) || 0);
          e.urunler[it.ad] = u;
          e.adet += Number(it.adet) || 0;
        });
      } else {
        e.tahsilat += Number(h.tutar || 0);
      }
      m[h.cariId] = e;
    });
    return Object.values(m).sort((a, b) => b.borc - a.borc);
  }, [rows]);

  const grandBorc = byCari.reduce((s, c) => s + c.borc, 0);
  const grandTahsilat = byCari.reduce((s, c) => s + c.tahsilat, 0);
  const tarihAraligi = from === to ? from.split('-').reverse().join('.') : `${from.split('-').reverse().join('.')} – ${to.split('-').reverse().join('.')}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/70 p-4 print:static print:bg-white print:p-0">
      <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl print:my-0 print:max-w-none print:rounded-none print:shadow-none">
        {/* Kontroller (yazdırmada gizli) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 print:hidden">
          <div className="flex gap-1">
            {[['today', 'Bugün'], ['7', 'Son 7 Gün'], ['30', 'Son 30 Gün'], ['custom', 'Özel']].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className={`rounded-md px-3 py-1.5 text-sm ${preset === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-1">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input max-w-[150px]" />
              <span className="text-slate-400">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input max-w-[150px]" />
            </div>
          )}
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="input max-w-[180px]">
            <option value="all">Tüm Cariler</option>
            {(caris || []).slice().sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr')).map((c) => (
              <option key={c.id} value={c.id}>{c.ad}</option>
            ))}
          </select>
          <div className="ml-auto flex gap-2">
            <button onClick={() => window.print()} className="btn-primary text-sm">
              <Printer size={14} /> Yazdır / PDF
            </button>
            <button onClick={onClose} className="btn-ghost text-sm"><X size={14} /> Kapat</button>
          </div>
        </div>

        {/* Yazdırılabilir rapor */}
        <div id="cari-rapor" className="p-6">
          <div className="mb-4 text-center">
            <h1 className="text-xl font-bold text-slate-900">{settings.restoranAd || 'Restoran'}</h1>
            <p className="text-sm font-semibold text-slate-700">CARİ HESAP RAPORU</p>
            <p className="text-xs text-slate-500">Dönem: {tarihAraligi}{scope !== 'all' ? ` · ${byCari[0]?.cariAd || ''}` : ''}</p>
          </div>

          {byCari.length === 0 ? (
            <p className="py-12 text-center text-sm italic text-slate-400">Bu dönemde cari hareketi yok.</p>
          ) : (
            <>
              {byCari.map((c) => {
                const urunList = Object.entries(c.urunler).sort((a, b) => b[1].tutar - a[1].tutar);
                return (
                  <div key={c.cariId} className="mb-5 break-inside-avoid rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="font-bold text-slate-900">{c.cariAd}</span>
                      <span className="text-sm text-slate-600">
                        Dönem borç: <strong className="text-rose-600">{formatTL(c.borc)}</strong>
                        {c.tahsilat > 0 && <> · Tahsilat: <strong className="text-emerald-600">{formatTL(c.tahsilat)}</strong></>}
                        {' '}· Güncel bakiye: <strong>{formatTL(bakiyeById[c.cariId] || 0)}</strong>
                      </span>
                    </div>
                    {urunList.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-1.5">Ürün</th>
                            <th className="px-3 py-1.5 text-right">Adet</th>
                            <th className="px-3 py-1.5 text-right">Tutar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {urunList.map(([ad, u]) => (
                            <tr key={ad}>
                              <td className="px-3 py-1.5">{ad}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatAdet(u.adet)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatTL(u.tutar)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 font-semibold">
                            <td className="px-3 py-1.5">Toplam</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatAdet(c.adet)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatTL(c.borc)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <p className="px-3 py-2 text-xs text-slate-400">Ürün dökümü yok (eski kayıt). Borç: {formatTL(c.borc)}</p>
                    )}
                  </div>
                );
              })}

              {scope === 'all' && byCari.length > 1 && (
                <div className="mt-4 flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold">
                  <span>GENEL TOPLAM</span>
                  <span>
                    Borç: <span className="text-rose-600">{formatTL(grandBorc)}</span>
                    {grandTahsilat > 0 && <> · Tahsilat: <span className="text-emerald-600">{formatTL(grandTahsilat)}</span></>}
                  </span>
                </div>
              )}
            </>
          )}
          <p className="mt-4 text-center text-[10px] text-slate-400">
            {settings.restoranAd || 'Restoran'} — Cari hesap dökümüdür, mali belge değildir. ({tarihAraligi})
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cari-rapor, #cari-rapor * { visibility: visible; }
          #cari-rapor { position: absolute; left: 0; top: 0; width: 100%; padding: 10mm; }
        }
      `}</style>
    </div>
  );
}

function EditModal({ value, onClose }) {
  const isNew = value === 'new';
  const cari = isNew ? null : value;
  const [ad, setAd] = useState('');
  const [telefon, setTelefon] = useState('');
  const [notlar, setNotlar] = useState('');
  const [aktif, setAktif] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!value) return;
    setAd(cari?.ad || '');
    setTelefon(cari?.telefon || '');
    setNotlar(cari?.notlar || '');
    setAktif(cari?.aktif !== false);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (ad.trim().length < 2) {
      toast.error('Cari adı girin');
      return;
    }
    setSaving(true);
    try {
      const data = { ad: ad.trim(), telefon: telefon.trim(), notlar: notlar.trim(), aktif };
      if (isNew) await createDoc('cari', { ...data, bakiye: 0 });
      else await patchDoc('cari', cari.id, data);
      toast.success(isNew ? 'Cari eklendi' : 'Güncellendi');
      onClose();
    } catch {
      toast.error('Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={isNew ? 'Yeni Cari' : `Cari — ${cari?.ad || ''}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">İptal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">Kaydet</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ad *</label>
          <input value={ad} onChange={(e) => setAd(e.target.value)} className="input" autoFocus placeholder="ör. Ali Bey" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
          <input value={telefon} onChange={(e) => setTelefon(e.target.value)} className="input" inputMode="tel" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Not</label>
          <input value={notlar} onChange={(e) => setNotlar(e.target.value)} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} />
          Aktif (ödeme ekranında listelensin)
        </label>
      </div>
    </Modal>
  );
}

function DetailModal({ cari, onClose }) {
  const { user, profile } = useAuthStore();
  const [har, setHar] = useState([]);
  const [tutar, setTutar] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null); // açık borç hareketi id
  const [orders, setOrders] = useState({}); // { orderId: 'loading' | order | 'notfound' }
  const [fisData, setFisData] = useState(null); // { order, hareket } — yazdırılacak cari fişi

  useEffect(() => {
    if (!cari) return undefined;
    setTutar('');
    setAciklama('');
    setExpanded(null);
    setOrders({});
    setFisData(null);
    return watchCollection('cariHareketleri', setHar, where('cariId', '==', cari.id));
  }, [cari]);

  // Borç satırına tıklayınca o siparişin detayını (arşivden) aç/kapat
  const toggleRow = async (h) => {
    if (h.tip !== 'borc' || (!Array.isArray(h.items) && !h.orderId)) return;
    const willOpen = expanded !== h.id;
    setExpanded(willOpen ? h.id : null);
    // Ürün bazlı bölmede hareketin kendi items'ı var → arşiv siparişine gerek yok
    if (willOpen && !Array.isArray(h.items) && h.orderId && orders[h.orderId] === undefined) {
      setOrders((o) => ({ ...o, [h.orderId]: 'loading' }));
      try {
        const od = await fetchOne('archivedOrders', h.orderId);
        setOrders((o) => ({ ...o, [h.orderId]: od || 'notfound' }));
      } catch {
        setOrders((o) => ({ ...o, [h.orderId]: 'notfound' }));
      }
    }
  };

  const sorted = useMemo(
    () =>
      [...har].sort((a, b) => (b.zaman?.toMillis?.() || 0) - (a.zaman?.toMillis?.() || 0)),
    [har],
  );

  const handleTahsilat = async () => {
    const t = Number(String(tutar).replace(',', '.'));
    if (!(t > 0)) {
      toast.error('Geçerli tutar girin');
      return;
    }
    setBusy(true);
    try {
      await recordCariTahsilat({
        cariId: cari.id,
        cariAd: cari.ad,
        tutar: t,
        kasiyerId: user?.uid,
        kasiyerAd: profile?.ad || 'Admin',
        aciklama,
      });
      toast.success('Tahsilat işlendi');
      setTutar('');
      setAciklama('');
    } catch (e) {
      toast.error(e?.message || 'İşlenemedi');
    } finally {
      setBusy(false);
    }
  };

  const bakiye = Number(cari?.bakiye || 0);

  return (
    <>
    <Modal
      open={!!cari}
      onClose={onClose}
      title={`${cari?.ad || ''} — Cari Hareketleri`}
      size="lg"
      footer={<button onClick={onClose} className="btn-secondary">Kapat</button>}
    >
      <div className="mb-4 rounded-xl bg-slate-50 p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">Güncel Bakiye (Borç)</p>
        <p className={`text-2xl font-bold tabular-nums ${bakiye > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
          {formatTL(bakiye)}
        </p>
      </div>

      {/* Tahsilat / bakiye düş */}
      <div className="mb-4 rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">Tahsilat / Bakiye Düş</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            inputMode="decimal"
            placeholder="Tutar (TL)"
            className="input sm:max-w-[140px]"
          />
          <input
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Açıklama (opsiyonel)"
            className="input"
          />
          <button onClick={handleTahsilat} disabled={busy} className="btn-primary whitespace-nowrap disabled:opacity-50">
            Tahsil Et
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">Girilen tutar borçtan düşülür (ciroya yansımaz).</p>
      </div>

      {/* Hareket geçmişi */}
      <div className="max-h-[40vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Tarih</th>
              <th className="px-2 py-2">Tip</th>
              <th className="px-2 py-2">Açıklama</th>
              <th className="px-2 py-2 text-right">Tutar</th>
              <th className="px-2 py-2 text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">Hareket yok.</td></tr>
            )}
            {sorted.map((h) => {
              const acilabilir = h.tip === 'borc' && (Array.isArray(h.items) || h.orderId);
              const acik = expanded === h.id;
              const od = h.orderId ? orders[h.orderId] : undefined;
              // Ürün bazlı bölmede hareketin kendi items'ı var; yoksa arşiv siparişinin tümü
              const hItems = Array.isArray(h.items)
                ? h.items
                : (od && typeof od === 'object' ? od.items : null);
              const hToplam = h.tutar || (od && typeof od === 'object' ? (od.cariTutar || od.araToplam) : 0);
              return (
                <Fragment key={h.id}>
                  <tr
                    onClick={() => toggleRow(h)}
                    className={acilabilir ? 'cursor-pointer hover:bg-slate-50' : ''}
                  >
                    <td className="px-2 py-2 text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {acilabilir ? (acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
                        {h.zaman ? formatDate(h.zaman, 'dd.MM.yyyy HH:mm') : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${h.tip === 'borc' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {h.tip === 'borc' ? 'Borç' : 'Tahsilat'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{h.masaAd || h.aciklama || '—'}</td>
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${h.tip === 'borc' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {h.tip === 'borc' ? '+' : '−'}{formatTL(h.tutar || 0)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-700">{formatTL(h.yeniBakiye || 0)}</td>
                  </tr>
                  {acik && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={5} className="px-3 py-2">
                        {!hItems && od === 'loading' && <p className="text-xs text-slate-400">Sipariş yükleniyor…</p>}
                        {!hItems && od === 'notfound' && <p className="text-xs text-slate-400">Sipariş detayı bulunamadı.</p>}
                        {hItems && (
                          <div className="rounded-lg border border-slate-200 bg-white p-2">
                            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                              Sipariş İçeriği{h.masaAd ? ` — ${h.masaAd}` : ''}
                            </p>
                            <ul className="divide-y divide-slate-100">
                              {hItems.map((it, i) => (
                                <li key={i} className="flex justify-between gap-3 py-1 text-sm">
                                  <span className="min-w-0">
                                    <strong>{formatAdet(it.adet)}×</strong> {it.ad}
                                    {it.ikram && <em className="ml-1 text-xs text-emerald-600">(ikram)</em>}
                                    {it.notlar && <em className="ml-1 text-xs text-slate-500">({it.notlar})</em>}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-slate-600">{formatTL((it.fiyat || 0) * (it.adet || 0))}</span>
                                </li>
                              ))}
                              {hItems.length === 0 && (
                                <li className="py-1 text-xs text-slate-400">Ürün kaydı yok.</li>
                              )}
                            </ul>
                            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold">
                              <span>Toplam</span>
                              <span className="tabular-nums">{formatTL(hToplam)}</span>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); setFisData({ order: od && typeof od === 'object' ? od : null, hareket: h, items: hItems }); }}
                                className="btn-secondary text-xs"
                              >
                                <Printer size={14} /> Fiş Bas
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
    {fisData && (
      <CariReceiptModal
        order={fisData.order}
        hareket={fisData.hareket}
        items={fisData.items}
        cari={cari}
        onClose={() => setFisData(null)}
      />
    )}
    </>
  );
}

function CariReceiptModal({ order, hareket, items: itemsProp, cari, onClose }) {
  const { settings } = useSettingsStore();
  const items = itemsProp || order?.items || [];
  const toplam = hareket?.tutar || order?.cariTutar || order?.araToplam || 0;
  const tarih = order?.tamamlandiZamani || order?.arsivZamani || hareket?.zaman;

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 print:hidden">
          <h3 className="font-semibold">Cari Hesap Fişi</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-primary text-sm">
              <Printer size={14} /> Yazdır
            </button>
            <button onClick={onClose} className="btn-ghost text-sm">
              <X size={14} /> Kapat
            </button>
          </div>
        </div>

        <div id="cari-fis" className="p-5 font-mono text-sm leading-snug text-slate-900">
          <div className="text-center">
            <p className="text-base font-bold">{settings.restoranAd || 'Alâ Konya Mutfağı'}</p>
            {settings.restoranAdres && <p className="text-xs">{settings.restoranAdres}</p>}
            {settings.restoranTel && <p className="text-xs">Tel: {settings.restoranTel}</p>}
          </div>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-center font-bold tracking-widest">CARİ HESAP FİŞİ</p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between"><span>Cari:</span><span className="font-bold">{cari?.ad || '—'}</span></div>
          <div className="flex justify-between"><span>Masa:</span><span>{order?.masaAd || hareket?.masaAd || '—'}</span></div>
          <div className="flex justify-between"><span>Tarih:</span><span>{tarih ? formatDate(tarih, 'dd.MM.yyyy HH:mm') : '—'}</span></div>
          <div className="my-2 border-t border-dashed border-slate-400" />
          {items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="min-w-0">
                {formatAdet(it.adet)}× {it.ad}
                {it.ikram ? ' (ikram)' : ''}
              </span>
              <span className="shrink-0 tabular-nums">{formatTL((it.fiyat || 0) * (it.adet || 0))}</span>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-slate-400">Ürün kaydı yok.</p>}
          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between text-base font-bold">
            <span>TOPLAM</span>
            <span className="tabular-nums">{formatTL(toplam)}</span>
          </div>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-center text-xs">Güncel Cari Bakiye: <strong>{formatTL(cari?.bakiye || 0)}</strong></p>
          <p className="mt-3 text-center text-[10px] text-slate-500">
            Bu bir mali belge değildir — cari hesap dökümüdür.
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cari-fis, #cari-fis * { visibility: visible; }
          #cari-fis { position: absolute; left: 0; top: 0; width: 80mm; padding: 4mm; }
        }
      `}</style>
    </div>
  );
}
