import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Search, Pencil, Trash2, Plus, Users, Wallet, History } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, createDoc, patchDoc, removeDoc, where } from '../../firebase/firestore';
import { recordCariTahsilat } from '../../firebase/cari';
import { useAuthStore } from '../../store/authStore';
import { formatTL, formatDate } from '../../utils/format';

export default function CariHesaplar() {
  const { rol } = useAuthStore();
  const isAdmin = rol === 'admin';
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // {id?, ad, ...} | 'new'
  const [detail, setDetail] = useState(null); // seçili cari (geçmiş + tahsilat)

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
          <button onClick={() => setEditing('new')} className="btn-primary">
            <Plus size={16} /> Yeni Cari
          </button>
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

  useEffect(() => {
    if (!cari) return undefined;
    setTutar('');
    setAciklama('');
    return watchCollection('cariHareketleri', setHar, where('cariId', '==', cari.id));
  }, [cari]);

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
            {sorted.map((h) => (
              <tr key={h.id}>
                <td className="px-2 py-2 text-slate-500">{h.zaman ? formatDate(h.zaman, 'dd.MM.yyyy HH:mm') : '—'}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
