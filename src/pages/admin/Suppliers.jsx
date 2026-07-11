import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  Phone,
  Mail,
  MapPin,
  Search,
  FileText,
  Receipt,
  Wallet,
  X,
  ChevronDown,
  Upload,
  ExternalLink,
  Sparkles,
  Loader2,
  PackageX,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, createDoc, patchDoc, removeDoc, where } from '../../firebase/firestore';
import { supplierSchema } from '../../utils/validators';
import { kaydetTedarikciFatura, tedarikciOdeme, silTedarikciFatura } from '../../firebase/tedarikci';
import { pdftenOku } from '../../utils/faturaParse';
import { recipeUnitOptions } from '../../utils/units';
import { useAuthStore } from '../../store/authStore';
import { SPARK_MODE, getStorageRef } from '../../firebase/config';
import { formatTL, formatDate } from '../../utils/format';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name || '');
}

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [cariForId, setCariForId] = useState(null); // cari/fatura modalı için tedarikçi id (canlı)
  const [search, setSearch] = useState('');

  useEffect(() => watchCollection('suppliers', setSuppliers), []);

  // Modal her zaman CANLI tedarikçiyi göstersin (silme/ödeme sonrası bakiye anında güncellensin)
  const cariFor = useMemo(
    () => suppliers.find((s) => s.id === cariForId) || null,
    [suppliers, cariForId],
  );

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.ad?.toLowerCase().includes(q) ||
        s.iletisimAd?.toLowerCase().includes(q) ||
        s.telefon?.toLowerCase().includes(q) ||
        s.kategori?.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const aktifSayisi = suppliers.filter((s) => s.aktif !== false).length;
  const toplamBorc = suppliers.reduce((t, s) => t + (Number(s.bakiye) > 0 ? Number(s.bakiye) : 0), 0);

  const handleDelete = async (s) => {
    if (!confirm(`"${s.ad}" tedarikçisi silinsin mi?`)) return;
    try {
      await removeDoc('suppliers', s.id);
      toast.success('Tedarikçi silindi');
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  };

  const handleToggle = async (s) => {
    try {
      await patchDoc('suppliers', s.id, { aktif: !(s.aktif !== false) });
    } catch (err) {
      console.error(err);
      toast.error('Güncellenemedi');
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Tedarikçiler"
        subtitle="Tedarikçi rehberi, cari hesap (borç) ve fatura/stok girişi"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Yeni Tedarikçi
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Toplam Tedarikçi" value={suppliers.length} icon={Truck} />
        <StatCard label="Aktif" value={aktifSayisi} color="green" />
        <StatCard label="Pasif" value={suppliers.length - aktifSayisi} color="amber" />
        <StatCard label="Toplam Borç" value={formatTL(toplamBorc)} color="red" icon={Wallet} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad / kontak / tel / kategori..."
            className="input pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <Truck size={48} className="text-slate-300" />
          <p>Tedarikçi yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const borc = Number(s.bakiye || 0);
            return (
              <div key={s.id} className={`card ${s.aktif === false ? 'opacity-60' : ''}`}>
                <div className="mb-2 flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-slate-900">{s.ad}</h3>
                    {s.kategori && (
                      <span className="mt-0.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        {s.kategori}
                      </span>
                    )}
                  </div>
                  <Toggle checked={s.aktif !== false} onChange={() => handleToggle(s)} />
                </div>

                {s.iletisimAd && <p className="mb-1 text-sm text-slate-700">{s.iletisimAd}</p>}

                <div className="space-y-1 text-xs text-slate-600">
                  {s.telefon && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={11} className="text-slate-400" />
                      <a href={`tel:${s.telefon}`} className="hover:underline">
                        {s.telefon}
                      </a>
                    </p>
                  )}
                  {s.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail size={11} className="text-slate-400" />
                      <a href={`mailto:${s.email}`} className="hover:underline">
                        {s.email}
                      </a>
                    </p>
                  )}
                  {s.adres && (
                    <p className="flex items-start gap-1.5">
                      <MapPin size={11} className="mt-0.5 shrink-0 text-slate-400" />
                      <span className="line-clamp-2">{s.adres}</span>
                    </p>
                  )}
                </div>

                {/* Cari bakiye */}
                <div
                  className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    borc > 0
                      ? 'bg-red-50 text-red-700'
                      : borc < 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  <span className="font-medium">
                    {borc > 0 ? 'Borç' : borc < 0 ? 'Avans (alacaklı)' : 'Borç yok'}
                  </span>
                  <span className="font-bold">{formatTL(Math.abs(borc))}</span>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setCariForId(s.id)}
                    className="btn-ghost px-2 py-1 text-sm text-emerald-700 hover:bg-emerald-50"
                  >
                    <Receipt size={14} /> Cari / Fatura
                  </button>
                  <button
                    onClick={() => {
                      setEditing(s);
                      setOpen(true);
                    }}
                    className="btn-ghost px-2 py-1 text-sm"
                  >
                    <Pencil size={14} /> Düzenle
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="btn-ghost px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SupplierModal open={open} editing={editing} onClose={() => setOpen(false)} />
      {cariFor && <TedarikciCariModal supplier={cariFor} onClose={() => setCariForId(null)} />}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Cari / Fatura modalı — bakiye, hareket defteri, fatura listesi + fatura ekle
 * -------------------------------------------------------------------------- */
function TedarikciCariModal({ supplier, onClose }) {
  const { user, profile } = useAuthStore();
  const [hareketler, setHareketler] = useState([]);
  const [faturalar, setFaturalar] = useState([]);
  const [faturaOpen, setFaturaOpen] = useState(false);
  const [odemeTutar, setOdemeTutar] = useState('');
  const [odemeYontemi, setOdemeYontemi] = useState('nakit');
  const [busy, setBusy] = useState(false);
  const [removedIds, setRemovedIds] = useState(() => new Set()); // iyimser silme
  const [refreshKey, setRefreshKey] = useState(0); // kayıt/ödeme sonrası dinleyiciyi tazele

  useEffect(
    () =>
      watchCollection('tedarikciHareketleri', setHareketler, where('tedarikciId', '==', supplier.id)),
    [supplier.id, refreshKey],
  );
  useEffect(
    () => watchCollection('tedarikciFaturalari', setFaturalar, where('tedarikciId', '==', supplier.id)),
    [supplier.id, refreshKey],
  );

  const hareketlerSorted = useMemo(
    () =>
      [...hareketler].sort((a, b) => {
        const ta = a.zaman?.toMillis?.() ?? 0;
        const tb = b.zaman?.toMillis?.() ?? 0;
        return tb - ta;
      }),
    [hareketler],
  );
  const faturalarSorted = useMemo(
    () =>
      [...faturalar]
        .filter((f) => !removedIds.has(f.id))
        .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')),
    [faturalar, removedIds],
  );

  const borc = Number(supplier.bakiye || 0);

  const handleFaturaSil = async (f) => {
    if (
      !confirm(
        `${f.faturaNo ? `#${f.faturaNo} ` : ''}faturası silinsin mi?\n\n` +
          `• Tedarikçi borcu ${formatTL(f.tutar)} azalır\n` +
          `• Bu faturadaki malzeme/ürün stoğu geri çıkarılır\n\nBu işlem geri alınamaz.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { dosyaPath } = await silTedarikciFatura({
        faturaId: f.id,
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      // Listeden anında düşür (dinleyici gecikse bile)
      setRemovedIds((s) => new Set(s).add(f.id));
      // Belge dosyasını da temizle (best-effort)
      if (dosyaPath && !SPARK_MODE) {
        try {
          const { ref: storageRef, deleteObject } = await import('firebase/storage');
          const storage = await getStorageRef();
          await deleteObject(storageRef(storage, dosyaPath));
        } catch (e) {
          console.warn('Fatura belgesi silinemedi:', e?.message);
        }
      }
      toast.success('Fatura silindi, borç ve stok geri alındı');
    } catch (err) {
      console.error(err);
      // Zaten silinmişse (çift tık / yenilenmemiş liste) hatayı sessizce düzelt
      if (/bulunamad/i.test(err?.message || '')) {
        setRemovedIds((s) => new Set(s).add(f.id));
        toast('Bu fatura zaten silinmiş', { icon: 'ℹ️' });
      } else {
        toast.error(err.message || 'Fatura silinemedi');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOdeme = async () => {
    const t = Number(odemeTutar);
    if (!(t > 0)) return toast.error('Geçerli bir tutar girin');
    setBusy(true);
    try {
      await tedarikciOdeme({
        tedarikciId: supplier.id,
        tedarikciAd: supplier.ad,
        tutar: t,
        odemeYontemi,
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      toast.success('Ödeme işlendi — borç düştü, gün cirosuna gider yazıldı');
      setOdemeTutar('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Ödeme kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${supplier.ad} — Cari Hesap`} size="lg">
      <div className="space-y-4">
        {/* Bakiye + ödeme */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
          <div>
            <p className="text-xs text-slate-500">Güncel Borç</p>
            <p
              className={`text-2xl font-bold ${
                borc > 0 ? 'text-red-600' : borc < 0 ? 'text-emerald-600' : 'text-slate-700'
              }`}
            >
              {formatTL(Math.abs(borc))}
              {borc < 0 && <span className="ml-1 text-sm font-normal">(avans)</span>}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Ödeme Yap (borç düş)</label>
              <input
                type="number"
                step="0.01"
                value={odemeTutar}
                onChange={(e) => setOdemeTutar(e.target.value)}
                placeholder="0,00"
                className="input max-w-[120px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Yöntem</label>
              <select
                value={odemeYontemi}
                onChange={(e) => setOdemeYontemi(e.target.value)}
                className="input max-w-[110px]"
              >
                <option value="nakit">Nakit</option>
                <option value="kart">Kart</option>
                <option value="havale">Havale/EFT</option>
                <option value="diger">Diğer</option>
              </select>
            </div>
            <button onClick={handleOdeme} disabled={busy} className="btn-secondary disabled:opacity-50">
              <Wallet size={16} /> Öde
            </button>
            <button onClick={() => setFaturaOpen(true)} className="btn-primary">
              <Plus size={16} /> Fatura Ekle
            </button>
          </div>
        </div>

        {/* Faturalar */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FileText size={15} /> Faturalar ({faturalarSorted.length})
          </h4>
          {faturalarSorted.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
              Henüz fatura yok.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {faturalarSorted.map((f) => (
                <details key={f.id} className="rounded-lg border border-slate-200">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {f.faturaNo ? `#${f.faturaNo}` : 'Fatura'}
                      </span>
                      <span className="text-xs text-slate-500">{f.tarih}</span>
                      {f.dosyaUrl && (
                        <a
                          href={f.dosyaUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink size={11} /> belge
                        </a>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-red-600">{formatTL(f.tutar)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFaturaSil(f);
                        }}
                        disabled={busy}
                        title="Faturayı sil (borç + stok geri alınır)"
                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </summary>

                  {f.dosyaUrl && (
                    <div className="border-t border-slate-100 bg-slate-50 p-3">
                      {isImageFile(f.dosyaAd) ? (
                        <a href={f.dosyaUrl} target="_blank" rel="noreferrer" title="Büyütmek için tıkla">
                          <img
                            src={f.dosyaUrl}
                            alt={f.dosyaAd || 'Fatura belgesi'}
                            className="max-h-64 w-auto rounded-lg border border-slate-200 object-contain"
                          />
                        </a>
                      ) : (
                        <a href={f.dosyaUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex">
                          <FileText size={15} /> Faturayı Aç ({f.dosyaAd || 'belge'})
                        </a>
                      )}
                    </div>
                  )}

                  {/* Faturadaki tablo düzeni */}
                  <div className="max-h-72 overflow-auto border-t border-slate-100">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr className="text-left">
                          <th className="px-2 py-1 font-medium">#</th>
                          <th className="px-2 py-1 font-medium">Stok Kodu</th>
                          <th className="px-2 py-1 font-medium">Malzeme/Hizmet Açıklaması</th>
                          <th className="px-2 py-1 text-right font-medium">Miktar</th>
                          <th className="px-2 py-1 font-medium">Birim</th>
                          <th className="px-2 py-1 text-right font-medium">Birim Fiyat</th>
                          <th className="px-2 py-1 text-right font-medium">KDV</th>
                          <th className="px-2 py-1 text-right font-medium">KDV Tutarı</th>
                          <th className="px-2 py-1 text-right font-medium">Mal Hizmet Tutarı</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(f.kalemler || []).map((k, i) => {
                          const kdvTutar = (Number(k.tutar) || 0) * ((Number(k.kdv) || 0) / 100);
                          return (
                            <tr key={i} className="text-slate-700">
                              <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                              <td className="px-2 py-1 text-slate-500">{k.stokKodu || '—'}</td>
                              <td className="px-2 py-1">
                                <span
                                  title={k.tip === 'diger' ? 'Stok dışı' : k.tip === 'product' ? 'Ürün' : 'Malzeme'}
                                >
                                  {k.tip === 'diger' ? '🧴' : k.tip === 'product' ? '🛒' : '🥩'}
                                </span>{' '}
                                {k.ad}
                              </td>
                              <td className="px-2 py-1 text-right">{k.miktar}</td>
                              <td className="px-2 py-1">{k.birim}</td>
                              <td className="px-2 py-1 text-right">{formatTL(k.birimFiyat)}</td>
                              <td className="px-2 py-1 text-right text-slate-500">%{k.kdv ?? 0}</td>
                              <td className="px-2 py-1 text-right text-slate-500">{formatTL(kdvTutar)}</td>
                              <td className="px-2 py-1 text-right font-medium">{formatTL(k.tutar)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-slate-200 bg-slate-50 font-medium text-slate-700">
                        <tr>
                          <td colSpan={8} className="px-2 py-1 text-right">
                            KDV hariç toplam
                          </td>
                          <td className="px-2 py-1 text-right">{formatTL(f.toplamHaric ?? 0)}</td>
                        </tr>
                        <tr className="text-red-700">
                          <td colSpan={8} className="px-2 py-1 text-right">
                            Ödenecek (KDV dahil)
                          </td>
                          <td className="px-2 py-1 text-right font-bold">{formatTL(f.tutar)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        {/* Hareket defteri */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Hareket Defteri</h4>
          {hareketlerSorted.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
              Hareket yok.
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {hareketlerSorted.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-1.5 text-slate-500">{formatDate(h.zaman, 'dd.MM HH:mm')}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            h.tip === 'fatura' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {h.tip === 'fatura'
                            ? 'Fatura (borç)'
                            : h.tip === 'iptal'
                              ? 'Fatura iptal'
                              : 'Ödeme'}
                        </span>
                        {h.faturaNo && <span className="ml-1 text-slate-400">#{h.faturaNo}</span>}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-semibold ${
                          h.tip === 'fatura' ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {h.tip === 'fatura' ? '+' : '−'}
                        {formatTL(h.tutar)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-400">
                        bakiye {formatTL(h.yeniBakiye)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {faturaOpen && (
        <FaturaModal
          supplier={supplier}
          onClose={() => setFaturaOpen(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------------------------
 * Fatura ekleme modalı — PDF'den oku, kalemler (malzeme/ürün/stok dışı), stok girişi
 * -------------------------------------------------------------------------- */
const bosKalem = () => ({
  tip: '',
  refId: '',
  ad: '',
  miktar: '',
  birim: '',
  birimFiyat: '',
  kdv: 20,
  stokKodu: '',
});

const lineHaric = (k) => (Number(k.miktar) || 0) * (Number(k.birimFiyat) || 0);
const lineDahil = (k) => lineHaric(k) * (1 + (Number(k.kdv) || 0) / 100);

function FaturaModal({ supplier, onClose, onSaved }) {
  const { user, profile } = useAuthStore();
  const [ingredients, setIngredients] = useState([]);
  const [products, setProducts] = useState([]);
  const [faturaNo, setFaturaNo] = useState('');
  const [tarih, setTarih] = useState(todayISO());
  const [notlar, setNotlar] = useState('');
  const [kalemler, setKalemler] = useState([bosKalem()]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [faturaOdenecek, setFaturaOdenecek] = useState(0); // PDF'in kendi yazdığı Ödenecek (doğrulama)
  const [hamMetin, setHamMetin] = useState(''); // okunan PDF ham metni (sorun olursa gönderilir)

  useEffect(() => watchCollection('ingredients', setIngredients), []);
  useEffect(() => watchCollection('products', setProducts), []);

  // Birleşik seçim listesi (malzeme + ürün)
  const secenekler = useMemo(() => {
    const ing = ingredients
      .filter((i) => i.aktif !== false)
      .map((i) => ({ tip: 'ingredient', id: i.id, ad: i.ad, birim: i.birim || 'kg' }));
    const prd = products
      .filter((p) => p.aktif !== false && p.stokTakipli !== false)
      .map((p) => ({ tip: 'product', id: p.id, ad: p.ad, birim: 'adet' }));
    return [...ing, ...prd];
  }, [ingredients, products]);

  const setKalem = (idx, patch) =>
    setKalemler((arr) => arr.map((k, i) => (i === idx ? { ...k, ...patch } : k)));
  const addKalem = () => setKalemler((arr) => [...arr, bosKalem()]);
  const removeKalem = (idx) => setKalemler((arr) => arr.filter((_, i) => i !== idx));

  const toplamHaric = useMemo(() => kalemler.reduce((t, k) => t + lineHaric(k), 0), [kalemler]);
  const toplam = useMemo(() => kalemler.reduce((t, k) => t + lineDahil(k), 0), [kalemler]);

  // 📄 PDF'den oku — tarayıcıda metni çıkar, kalemleri ayrıştır, eşleştir (API yok)
  const handlePdfRead = async () => {
    if (!file) return toast.error('Önce fatura PDF dosyası seçin');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) return toast.error('Şimdilik sadece metin tabanlı PDF okunuyor (fotoğraf değil)');
    setAiBusy(true);
    const t = toast.loading('PDF okunuyor…');
    try {
      const katalog = secenekler.map((s) => ({ id: s.id, ad: s.ad, tip: s.tip, birim: s.birim }));
      const res = await pdftenOku(file, katalog);
      // Ayrıştırma zayıfsa düzeni görüp ayarlayabilmek için ham metni sakla/yaz
      const ham = (res.hamSatirlar || []).join('\n');
      setHamMetin(ham);
      console.log('[Fatura ham metin]\n' + ham);

      if (res.faturaNo) setFaturaNo(res.faturaNo);
      if (res.tarih && /^\d{4}-\d{2}-\d{2}$/.test(res.tarih)) setTarih(res.tarih);
      setFaturaOdenecek(res.odenecek || 0);

      const yeni = (res.kalemler || []).map((k) => {
        const match =
          k.eslesmeId && secenekler.find((s) => s.id === k.eslesmeId && s.tip === k.eslesmeTip);
        if (match) {
          return {
            tip: match.tip,
            refId: match.id,
            ad: match.ad,
            birim: k.birim || match.birim,
            anaBirim: match.birim,
            miktar: k.miktar || '',
            birimFiyat: k.birimFiyat || '',
            kdv: k.kdv ?? 20,
            stokKodu: k.stokKodu || '',
          };
        }
        // Eşleşmeyen → stok dışı (temizlik vb.)
        return {
          tip: 'diger',
          refId: '',
          ad: k.ad || '',
          birim: k.birim || 'adet',
          anaBirim: '',
          miktar: k.miktar || '',
          birimFiyat: k.birimFiyat || '',
          kdv: k.kdv ?? 20,
          stokKodu: k.stokKodu || '',
        };
      });

      if (yeni.length === 0) {
        toast.error("PDF'ten kalem çıkarılamadı — düzen farklı olabilir, elle girebilirsin", {
          id: t,
        });
      } else {
        setKalemler(yeni);
        const stokDisi = yeni.filter((k) => k.tip === 'diger').length;
        const hesaplanan = yeni.reduce((s, k) => s + lineDahil(k), 0);
        const fark = res.odenecek ? Math.abs(hesaplanan - res.odenecek) : 0;
        if (res.odenecek && fark > 1) {
          toast(
            `${yeni.length} kalem okundu ama toplam tutmuyor: hesaplanan ${formatTL(hesaplanan)} ≠ faturadaki ${formatTL(res.odenecek)}. Bazı kalemler eksik/yanlış okunmuş olabilir — kontrol et.`,
            { id: t, icon: '⚠️', duration: 7000 },
          );
        } else {
          toast.success(
            `${yeni.length} kalem okundu${stokDisi ? ` (${stokDisi} stok dışı)` : ''} — kontrol edip kaydet`,
            { id: t },
          );
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('PDF okunamadı: ' + (err.message || ''), { id: t });
    } finally {
      setAiBusy(false);
    }
  };

  const handleSubmit = async () => {
    const dolu = kalemler.filter((k) =>
      k.tip === 'diger' ? k.ad?.trim() && Number(k.miktar) > 0 : k.refId && Number(k.miktar) > 0,
    );
    if (dolu.length === 0) return toast.error('En az 1 geçerli kalem girin');
    if (!tarih) return toast.error('Tarih girin');

    setBusy(true);
    try {
      // Dosya varsa Storage'a yükle
      let dosyaUrl = null;
      let dosyaAd = null;
      let dosyaPath = null;
      if (file && !SPARK_MODE) {
        const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const storage = await getStorageRef();
        dosyaPath = `tedarikciFaturalari/${supplier.id}/${Date.now()}-${file.name}`;
        const r = storageRef(storage, dosyaPath);
        await uploadBytes(r, file);
        dosyaUrl = await getDownloadURL(r);
        dosyaAd = file.name;
      } else if (file && SPARK_MODE) {
        toast('Demo modda dosya yükleme kapalı, fatura dosyasız kaydedildi', { icon: 'ℹ️' });
      }

      await kaydetTedarikciFatura({
        tedarikciId: supplier.id,
        tedarikciAd: supplier.ad,
        faturaNo: faturaNo.trim(),
        tarih,
        dosyaUrl,
        dosyaAd,
        dosyaPath,
        kalemler: dolu.map((k) => ({
          tip: k.tip,
          refId: k.refId,
          ad: k.ad,
          stokKodu: k.stokKodu || '',
          miktar: Number(k.miktar),
          birim: k.birim,
          birimFiyat: Number(k.birimFiyat) || 0,
          kdv: Number(k.kdv) || 0,
        })),
        notlar: notlar.trim(),
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Admin',
      });
      toast.success('Fatura kaydedildi, stok ve borç güncellendi');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Fatura kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${supplier.ad} — Yeni Fatura`}
      size="xl"
      footer={
        <>
          <div className="mr-auto text-sm">
            <span className="text-xs text-slate-500">KDV hariç {formatTL(toplamHaric)} · </span>
            Ödenecek (KDV dahil):{' '}
            <span className="text-lg font-bold text-slate-900">{formatTL(toplam)}</span>
            {faturaOdenecek > 0 && Math.abs(faturaOdenecek - toplam) > 1 && (
              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                ⚠ Faturadaki: {formatTL(faturaOdenecek)} — tutmuyor, kontrol et
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? 'Kaydediliyor…' : 'Faturayı Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fatura No</label>
            <input
              value={faturaNo}
              onChange={(e) => setFaturaNo(e.target.value)}
              className="input"
              placeholder="Opsiyonel"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tarih</label>
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fatura Belgesi</label>
            <label className="btn-secondary w-full cursor-pointer justify-center">
              <Upload size={15} /> {file ? file.name.slice(0, 16) : 'Dosya seç'}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        {/* PDF'den otomatik oku */}
        <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
          <button
            onClick={handlePdfRead}
            disabled={!file || aiBusy}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {aiBusy ? 'Okunuyor…' : "PDF'den Oku"}
          </button>
          <p className="text-xs text-violet-700">
            Metin tabanlı fatura <strong>PDF</strong>'ini seç → kalemler otomatik çıkarılıp
            malzeme/ürünlerinle eşleştirilir. Eşleşmeyenler (temizlik vb.) <strong>stok dışı</strong>{' '}
            işaretlenir. Kaydetmeden önce kontrol et.
          </p>
        </div>

        {/* Ham metin — okuma sorunluysa kopyalayıp gönder */}
        {hamMetin && (
          <details className="rounded-lg border border-slate-200 bg-slate-50">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-slate-600">
              <span>🔍 Okunan ham metin (kalemler eksik/yanlışsa kopyala-gönder)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard?.writeText(hamMetin).then(
                    () => toast.success('Ham metin kopyalandı'),
                    () => toast.error('Kopyalanamadı'),
                  );
                }}
                className="btn-secondary px-2 py-1"
              >
                Kopyala
              </button>
            </summary>
            <textarea
              readOnly
              value={hamMetin}
              className="h-40 w-full resize-y rounded-b-lg border-t border-slate-200 bg-white p-2 font-mono text-[10px] text-slate-600"
            />
          </details>
        )}

        {/* Kalemler */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Kalemler</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setKalemler((arr) => [
                    ...arr,
                    { tip: 'diger', refId: '', ad: '', miktar: '', birim: 'adet', birimFiyat: '', anaBirim: '', kdv: 20, stokKodu: '' },
                  ])
                }
                className="btn-ghost px-2 py-1 text-sm text-slate-600"
                title="Stok dışı kalem (temizlik, peçete vb.)"
              >
                <PackageX size={14} /> Stok Dışı
              </button>
              <button onClick={addKalem} className="btn-ghost px-2 py-1 text-sm text-emerald-700">
                <Plus size={14} /> Kalem Ekle
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {/* başlık — faturadaki sütunlara karşılık gelir */}
            <div className="hidden grid-cols-12 gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:grid">
              <div className="col-span-4">Stok Kodu / Açıklama</div>
              <div className="col-span-2">Miktar</div>
              <div className="col-span-2">Birim</div>
              <div className="col-span-2">Birim Fiyat</div>
              <div className="col-span-1">KDV %</div>
              <div className="col-span-1"></div>
            </div>
            {kalemler.map((k, idx) => {
              const isDiger = k.tip === 'diger';
              return (
                <div key={idx} className="grid grid-cols-12 items-start gap-2">
                  <div className="col-span-12 sm:col-span-4">
                    {isDiger ? (
                      <div className="flex items-center gap-1">
                        <span
                          title="Stok dışı kalem (temizlik vb.) — stoğa yazılmaz, sadece borca girer"
                          className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-200 px-1.5 py-1 text-[10px] font-medium text-slate-600"
                        >
                          <PackageX size={12} /> stok dışı
                        </span>
                        <input
                          value={k.ad}
                          onChange={(e) => setKalem(idx, { ad: e.target.value })}
                          placeholder="Kalem adı (örn. Bulaşık deterjanı)"
                          className="input"
                          title={k.ad}
                        />
                      </div>
                    ) : (
                      <KalemPicker
                        secenekler={secenekler}
                        value={k.refId}
                        label={k.ad}
                        onSelect={(opt) =>
                          setKalem(idx, {
                            tip: opt.tip,
                            refId: opt.id || '',
                            ad: opt.ad,
                            birim: opt.birim,
                            anaBirim: opt.tip === 'diger' ? '' : opt.birim,
                          })
                        }
                      />
                    )}
                    {k.stokKodu && (
                      <p className="mt-0.5 px-1 text-[10px] text-slate-400">Stok Kodu: {k.stokKodu}</p>
                    )}
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      value={k.miktar}
                      onChange={(e) => setKalem(idx, { miktar: e.target.value })}
                      placeholder="Miktar"
                      className="input"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    {isDiger ? (
                      <input
                        value={k.birim}
                        onChange={(e) => setKalem(idx, { birim: e.target.value })}
                        placeholder="adet"
                        className="input"
                      />
                    ) : (
                      <select
                        value={k.birim}
                        onChange={(e) => setKalem(idx, { birim: e.target.value })}
                        className="input"
                        disabled={!k.refId}
                      >
                        {(k.tip === 'product'
                          ? ['adet']
                          : recipeUnitOptions(k.anaBirim || k.birim || '')
                        ).map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                        {!k.refId && <option value="">—</option>}
                      </select>
                    )}
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      value={k.birimFiyat}
                      onChange={(e) => setKalem(idx, { birimFiyat: e.target.value })}
                      placeholder="₺"
                      className="input"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <select
                      value={k.kdv ?? 20}
                      onChange={(e) => setKalem(idx, { kdv: Number(e.target.value) })}
                      className="input px-1"
                      title="KDV oranı"
                    >
                      {[0, 1, 8, 10, 18, 20].map((o) => (
                        <option key={o} value={o}>
                          %{o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {kalemler.length > 1 && (
                      <button
                        onClick={() => removeKalem(idx)}
                        className="btn-ghost px-2 py-1.5 text-red-500 hover:bg-red-50"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  {(k.refId || isDiger) && (
                    <div className="col-span-12 -mt-1 px-1 text-right text-xs text-slate-400 sm:hidden">
                      Satır (KDV dahil): {formatTL(lineDahil(k))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Not</label>
          <input
            value={notlar}
            onChange={(e) => setNotlar(e.target.value)}
            className="input"
            placeholder="Opsiyonel"
          />
        </div>

        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠️ Kaydedince: malzeme/ürün <strong>stoğu artar</strong> (KDV hariç maliyetle), tedarikçinin{' '}
          <strong>borcu KDV dahil</strong> tutar kadar yükselir. Stok dışı kalemler (temizlik vb.)
          sadece borca girer.
        </p>
      </div>
    </Modal>
  );
}

/* Aranabilir malzeme/ürün seçici (combobox) */
function KalemPicker({ secenekler, value, label, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? secenekler.filter((o) => o.ad.toLowerCase().includes(q)) : secenekler;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between text-left"
        title={value ? label : ''}
      >
        <span className={value ? 'truncate' : 'text-slate-400'}>{value ? label : '— Seç —'}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Malzeme / ürün ara..."
                className="input pl-8"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-slate-400">Eşleşme yok</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={`${o.tip}-${o.id}`}
                  type="button"
                  onClick={() => {
                    onSelect(o);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 ${
                    o.id === value ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">
                    <span className="mr-1">{o.tip === 'product' ? '🛒' : '🥩'}</span>
                    {o.ad}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {o.tip === 'product' ? 'ürün' : o.birim}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierModal({ open, editing, onClose }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      ad: '',
      iletisimAd: '',
      telefon: '',
      email: '',
      adres: '',
      kategori: '',
      notlar: '',
      aktif: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? { ...editing, aktif: editing.aktif !== false }
          : {
              ad: '',
              iletisimAd: '',
              telefon: '',
              email: '',
              adres: '',
              kategori: '',
              notlar: '',
              aktif: true,
            },
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (data) => {
    // bakiye gibi transaction-yönetimli alanlara dokunma
    const { bakiye, ...rest } = data;
    try {
      if (isEdit) {
        await patchDoc('suppliers', editing.id, rest);
        toast.success('Tedarikçi güncellendi');
      } else {
        await createDoc('suppliers', { ...rest, bakiye: 0 });
        toast.success('Tedarikçi eklendi');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Kayıt hatası');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="supplier-form"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tedarikçi Adı</label>
          <input {...register('ad')} className="input" autoFocus placeholder="Örn: Mehmet Et" />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
            <input {...register('kategori')} className="input" placeholder="Et / Sebze / İçecek..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">İletişim Kişisi</label>
            <input {...register('iletisimAd')} className="input" placeholder="Ad soyad" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
            <input {...register('telefon')} className="input" placeholder="0212 ..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-posta</label>
            <input {...register('email')} type="email" className="input" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Adres</label>
          <textarea {...register('adres')} rows={2} className="input" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Not</label>
          <input {...register('notlar')} className="input" placeholder="Ödeme şartı, sevkiyat günü vs." />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Controller
            control={control}
            name="aktif"
            render={({ field }) => <Toggle checked={!!field.value} onChange={field.onChange} />}
          />
        </div>
      </form>
    </Modal>
  );
}
