import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, QrCode, ExternalLink, Globe } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { watchCollection, orderBy } from '../../firebase/firestore';
import { useSettingsStore } from '../../store/settingsStore';

const ZONE_LABELS = {
  ic: 'İç Salon',
  dis: 'Dış Mekan',
  bahce: 'Bahçe',
  bar: 'Meşrubat',
  kapali: 'Kapalı Alan',
};

export default function AdminQrCodes() {
  const [tables, setTables] = useState([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [zone, setZone] = useState('all');
  const { settings } = useSettingsStore();

  useEffect(() => watchCollection('tables', setTables, orderBy('siraNo', 'asc')), []);

  useEffect(() => {
    // localStorage'da saklı custom URL varsa onu kullan, yoksa origin
    const saved = localStorage.getItem('qr.baseUrl');
    setBaseUrl(saved || window.location.origin);
  }, []);

  const saveBaseUrl = (val) => {
    const clean = val.replace(/\/$/, '');
    setBaseUrl(clean);
    localStorage.setItem('qr.baseUrl', clean);
  };

  const zones = useMemo(() => {
    const set = new Set(tables.map((t) => t.zone || 'ic'));
    return ['all', ...set];
  }, [tables]);

  const visibleTables = useMemo(() => {
    if (zone === 'all') return tables;
    return tables.filter((t) => (t.zone || 'ic') === zone);
  }, [tables, zone]);

  const printAll = () => window.print();

  return (
    <div className="p-8 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="QR Kodları"
          subtitle="Masa başına QR kod — A6 boyutta yazdırılabilir"
          actions={
            <button
              onClick={printAll}
              disabled={visibleTables.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              <Printer size={16} /> Hepsini Yazdır
            </button>
          }
        />

        {/* Base URL ayarı */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <label className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            <Globe size={12} /> QR'lerin Yöneleceği Adres
          </label>
          <div className="flex gap-2">
            <input
              value={baseUrl}
              onChange={(e) => saveBaseUrl(e.target.value)}
              placeholder="https://restoran.web.app"
              className="input font-mono text-sm"
            />
            <button
              onClick={() => saveBaseUrl(window.location.origin)}
              className="btn-secondary text-sm shrink-0"
              title="Şu anki adresi kullan"
            >
              Bu Adres
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            QR kodları <code className="bg-slate-100 px-1">{baseUrl}/menu/&lt;masaId&gt;</code> URL'sine yönelir.
            Production'da Firebase Hosting URL veya kendi alan adınız olmalı.
          </p>
        </div>

        {/* Zone filtresi */}
        <div className="mb-4 flex gap-1 overflow-x-auto">
          {zones.map((z) => (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
                zone === z
                  ? 'bg-blue-100 font-medium text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {z === 'all' ? 'Tümü' : ZONE_LABELS[z] || z}
            </button>
          ))}
        </div>
      </div>

      {visibleTables.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <QrCode size={48} className="text-slate-300" />
          <p>Masa yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 print:grid-cols-2 print:gap-0">
          {visibleTables.map((t) => (
            <QrCard
              key={t.id}
              table={t}
              url={`${baseUrl}/menu/${t.id}`}
              restoran={settings?.restoranAd}
            />
          ))}
        </div>
      )}

      {/* A6 print styles: her QR ayrı bir A6 sayfada */}
      <style>{`
        @media print {
          @page {
            size: A6 portrait;
            margin: 8mm;
          }
          body { background: white; }
          .qr-card {
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            width: 100%;
            min-height: 100vh;
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .qr-card:last-child {
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}

function QrCard({ table, url, restoran }) {
  return (
    <div className="qr-card flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500 print:text-sm">
        {restoran || 'Restoran'}
      </p>
      <h3 className="text-2xl font-bold text-slate-900 print:text-4xl">{table.ad}</h3>
      <div className="my-2 rounded-lg bg-white p-2 print:p-0">
        <QRCodeSVG
          value={url}
          size={200}
          level="M"
          marginSize={2}
          fgColor="#0f172a"
          bgColor="#ffffff"
        />
      </div>
      <p className="text-xs font-medium text-slate-700">Menüyü görmek için</p>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">QR'yi telefonla okutun</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline print:hidden"
      >
        <ExternalLink size={10} />
        {url.length > 36 ? url.slice(0, 36) + '…' : url}
      </a>
    </div>
  );
}
