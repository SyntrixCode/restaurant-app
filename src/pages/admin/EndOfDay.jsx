import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Wallet, CreditCard, UtensilsCrossed, Calculator, Printer, Save } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { watchCollection, where, createDoc } from '../../firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatTL } from '../../utils/format';
import { toKurus, fromKurus } from '../../utils/paymentMath';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EndOfDay() {
  const { user, profile } = useAuthStore();
  const { settings } = useSettingsStore();
  const [gun, setGun] = useState(todayISO());
  const [payments, setPayments] = useState([]);
  const [archived, setArchived] = useState([]);
  const [acilisKasa, setAcilisKasa] = useState('');
  const [sayilanNakit, setSayilanNakit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubP = watchCollection('payments', setPayments, where('gun', '==', gun));
    const unsubA = watchCollection('archivedOrders', setArchived, where('gun', '==', gun));
    return () => {
      unsubP();
      unsubA();
    };
  }, [gun]);

  // Ödeme yöntemine göre topla — kuruş aritmetik
  const totals = useMemo(() => {
    let nakitK = 0, kartK = 0, yemekK = 0, count = 0;
    for (const p of payments) {
      const k = toKurus(p.tutar);
      count++;
      if (p.yontem === 'nakit') nakitK += k;
      else if (p.yontem === 'kart') kartK += k;
      else if (p.yontem === 'yemekKarti') yemekK += k;
      else nakitK += k; // bilinmeyen → nakit say
    }
    const toplamK = nakitK + kartK + yemekK;
    return {
      nakit: fromKurus(nakitK),
      kart: fromKurus(kartK),
      yemek: fromKurus(yemekK),
      toplam: fromKurus(toplamK),
      count,
      nakitK,
    };
  }, [payments]);

  // İptal edilmeyen arşiv siparişleri
  const validArchived = archived.filter((o) => !o.iptal?.edildi);
  const iptalCount = archived.filter((o) => o.iptal?.edildi).length;
  const ikramToplam = validArchived.reduce((sum, o) => {
    const ik = (o.items || []).reduce(
      (s, it) => s + (it.ikram ? (it.fiyat || 0) * (it.adet || 0) : 0),
      0,
    );
    return sum + ik;
  }, 0);
  // Patron/ücretsiz kapatılan masalar — ciroya yazılmaz, eksi (-) gösterilir
  const patronToplam = validArchived.reduce(
    (sum, o) => sum + (o.patronMasasi ? Number(o.patronTutar || 0) : 0),
    0,
  );
  const patronSayisi = validArchived.filter((o) => o.patronMasasi).length;

  const acilis = parseFloat(acilisKasa) || 0;
  const sayilan = parseFloat(sayilanNakit) || 0;
  const beklenenNakit = acilis + totals.nakit;
  const fark = sayilan - beklenenNakit;

  const handleSave = async () => {
    setSaving(true);
    try {
      await createDoc('zReports', {
        gun,
        kasiyerId: user?.uid || null,
        kasiyerAd: profile?.ad || 'Bilinmiyor',
        acilisKasa: acilis,
        sayilanNakit: sayilan,
        beklenenNakit,
        fark,
        toplamNakit: totals.nakit,
        toplamKart: totals.kart,
        toplamYemekKarti: totals.yemek,
        toplamCiro: totals.toplam,
        odemeSayisi: totals.count,
        siparisSayisi: validArchived.length,
        iptalSayisi: iptalCount,
        ikramToplam,
        patronToplam,
        patronSayisi,
        olusturmaZamani: new Date(),
      });
      toast.success('Z raporu kaydedildi');
    } catch (err) {
      toast.error('Kayıt hatası: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="p-8">
      <PageHeader
        title="Gün Sonu (Z Raporu)"
        subtitle="Vardiya kapanışı — ödeme dökümü ve kasa sayımı"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <input
              type="date"
              value={gun}
              onChange={(e) => setGun(e.target.value)}
              className="input max-w-[160px]"
            />
            <button onClick={handlePrint} className="btn-secondary">
              <Printer size={16} /> Yazdır
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              <Save size={16} /> {saving ? 'Kaydediliyor...' : 'Z Raporu Kaydet'}
            </button>
          </div>
        }
      />

      <div id="zrapor" className="space-y-6">
        {/* Ödeme yöntemi dökümü */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label="Toplam Ciro" value={formatTL(totals.toplam)} color="green" icon={Calculator} />
          <StatCard label="Nakit" value={formatTL(totals.nakit)} color="emerald" icon={Wallet} />
          <StatCard label="Kart" value={formatTL(totals.kart)} color="blue" icon={CreditCard} />
          <StatCard label="Yemek Kartı" value={formatTL(totals.yemek)} color="amber" icon={UtensilsCrossed} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Özet */}
          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Gün Özeti — {gun}</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Ödeme adedi" value={totals.count} />
              <Row label="Tamamlanan sipariş" value={validArchived.length} />
              <Row label="İptal edilen" value={iptalCount} danger={iptalCount > 0} />
              <Row label="Toplam ikram (ürün)" value={formatTL(ikramToplam)} />
              <Row
                label={`Patron / ücretsiz${patronSayisi ? ` (${patronSayisi} masa)` : ''}`}
                value={`- ${formatTL(patronToplam)}`}
                danger={patronToplam > 0}
              />
              <div className="my-2 border-t border-slate-100" />
              <Row label="Nakit" value={formatTL(totals.nakit)} />
              <Row label="Kart" value={formatTL(totals.kart)} />
              <Row label="Yemek Kartı" value={formatTL(totals.yemek)} />
              <div className="my-2 border-t border-slate-200" />
              <Row label="TOPLAM CİRO" value={formatTL(totals.toplam)} bold />
            </dl>
          </div>

          {/* Kasa sayımı */}
          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Kasa Sayımı</h3>
            <div className="space-y-4">
              <div className="print:hidden">
                <label className="mb-1 block text-sm font-medium text-slate-700">Açılış Kasası (TL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={acilisKasa}
                  onChange={(e) => setAcilisKasa(e.target.value)}
                  className="input text-lg tabular-nums"
                  placeholder="Sabah kasada olan nakit"
                />
              </div>
              <div className="print:hidden">
                <label className="mb-1 block text-sm font-medium text-slate-700">Sayılan Nakit (TL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={sayilanNakit}
                  onChange={(e) => setSayilanNakit(e.target.value)}
                  className="input text-lg tabular-nums"
                  placeholder="Kapanışta sayılan nakit"
                />
              </div>

              <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                <Row label="Açılış kasası" value={formatTL(acilis)} />
                <Row label="Nakit ödemeler (+)" value={formatTL(totals.nakit)} />
                <div className="my-1 border-t border-slate-200" />
                <Row label="Beklenen nakit" value={formatTL(beklenenNakit)} bold />
                <Row label="Sayılan nakit" value={formatTL(sayilan)} />
                <div className="my-1 border-t border-slate-200" />
                <Row
                  label="FARK"
                  value={`${fark > 0 ? '+' : ''}${formatTL(fark)}`}
                  bold
                  danger={Math.abs(fark) > 0.005}
                  success={Math.abs(fark) <= 0.005}
                />
              </div>

              {Math.abs(fark) > 0.005 && sayilanNakit !== '' && (
                <p className={`text-sm font-medium ${fark < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {fark < 0
                    ? `Kasada ${formatTL(-fark)} eksik var.`
                    : `Kasada ${formatTL(fark)} fazla var.`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #zrapor, #zrapor * { visibility: visible; }
          #zrapor { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, bold, danger, success }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd
        className={`tabular-nums ${bold ? 'text-lg font-bold' : ''} ${
          danger ? 'text-red-600' : success ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
