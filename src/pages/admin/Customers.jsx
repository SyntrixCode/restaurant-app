import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Phone, Search, Pencil, Trash2, Users, ClipboardList } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { watchCollection, patchDoc, removeDoc } from '../../firebase/firestore';
import { normalizePhone } from '../../firebase/customers';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatDate } from '../../utils/format';
import { exportExcel } from '../../utils/excelExport';

export default function Customers() {
  const { rol } = useAuthStore();
  const { settings } = useSettingsStore();
  const sadakatAktif = !!settings?.sadakatAktif;
  const isAdmin = rol === 'admin';
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => watchCollection('customers', setCustomers), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = normalizePhone(search);
    let list = customers;
    if (q) {
      list = customers.filter(
        (c) =>
          (c.ad || '').toLowerCase().includes(q) ||
          (qDigits && normalizePhone(c.tel).includes(qDigits)),
      );
    }
    return [...list].sort((a, b) => {
      const ta = a.sonSiparis?.toDate?.()?.getTime?.() ?? 0;
      const tb = b.sonSiparis?.toDate?.()?.getTime?.() ?? 0;
      return tb - ta;
    });
  }, [customers, search]);

  const toplamSiparis = customers.reduce((s, c) => s + (c.siparisSayisi || 0), 0);

  const handleDelete = async (c) => {
    if (!confirm(`"${c.ad || c.tel}" defterden silinsin mi?`)) return;
    try {
      await removeDoc('customers', c.id);
      toast.success('Silindi');
    } catch {
      toast.error('Silinemedi');
    }
  };

  const handleExport = () => {
    exportExcel('telefon-defteri', [
      {
        name: 'Müşteriler',
        rows: filtered.map((c) => ({
          Ad: c.ad || '',
          Telefon: c.tel || '',
          Adres: c.adres || '',
          'Sipariş Sayısı': c.siparisSayisi || 0,
          Puan: c.puan || 0,
          'Son Sipariş': c.sonSiparis ? formatDate(c.sonSiparis, 'dd.MM.yyyy') : '',
          Not: c.notlar || '',
        })),
      },
    ]);
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Telefon Defteri"
        subtitle="Paket servis müşterileri — paket alındıkça otomatik kaydedilir"
        actions={
          <button onClick={handleExport} className="btn-secondary">
            <ClipboardList size={16} /> Excel
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Kayıtlı Müşteri" value={customers.length} icon={Users} />
        <StatCard label="Toplam Paket Sipariş" value={toplamSiparis} color="blue" icon={Phone} />
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya telefon ara..."
          className="input pl-10"
        />
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Ad</th>
              <th className="px-3 py-3">Telefon</th>
              <th className="px-3 py-3">Adres</th>
              <th className="px-3 py-3 text-right">Sipariş</th>
              {sadakatAktif && <th className="px-3 py-3 text-right">Puan</th>}
              <th className="px-3 py-3">Son Sipariş</th>
              <th className="px-3 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={sadakatAktif ? 7 : 6} className="py-12 text-center text-slate-500">
                  {customers.length === 0 ? 'Henüz kayıt yok.' : 'Eşleşen müşteri yok.'}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-900">{c.ad || '—'}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{c.tel}</td>
                <td className="px-3 py-2 max-w-xs truncate text-slate-600">{c.adres || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.siparisSayisi || 0}</td>
                {sadakatAktif && (
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-purple-700">
                    {c.puan || 0}
                  </td>
                )}
                <td className="px-3 py-2 text-slate-500">
                  {c.sonSiparis ? formatDate(c.sonSiparis, 'dd.MM.yyyy') : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => setEditing(c)} className="btn-ghost px-2 py-1">
                      <Pencil size={14} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(c)}
                        className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditModal customer={editing} onClose={() => setEditing(null)} sadakatAktif={sadakatAktif} />
    </div>
  );
}

function EditModal({ customer, onClose, sadakatAktif }) {
  const [ad, setAd] = useState('');
  const [adres, setAdres] = useState('');
  const [notlar, setNotlar] = useState('');
  const [puan, setPuan] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setAd(customer.ad || '');
      setAdres(customer.adres || '');
      setNotlar(customer.notlar || '');
      setPuan(String(customer.puan || 0));
    }
  }, [customer]);

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const payload = { ad, adres, notlar };
      if (sadakatAktif) payload.puan = Math.max(0, parseInt(puan, 10) || 0);
      await patchDoc('customers', customer.id, payload);
      toast.success('Güncellendi');
      onClose();
    } catch {
      toast.error('Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!customer}
      onClose={onClose}
      title={`Müşteri — ${customer?.tel || ''}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">İptal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            Kaydet
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ad</label>
          <input value={ad} onChange={(e) => setAd(e.target.value)} className="input" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Adres</label>
          <textarea value={adres} onChange={(e) => setAdres(e.target.value)} rows={2} className="input" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Not</label>
          <input value={notlar} onChange={(e) => setNotlar(e.target.value)} className="input" placeholder="örn. kapı kodu, tercihler" />
        </div>
        {sadakatAktif && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Sadakat Puanı</label>
            <input
              type="number"
              min="0"
              value={puan}
              onChange={(e) => setPuan(e.target.value)}
              className="input tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-500">Manuel düzeltme (iade, düzeltme vb.)</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
