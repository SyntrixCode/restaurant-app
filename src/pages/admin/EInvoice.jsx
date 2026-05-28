import { FileCheck2, AlertTriangle, CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';

const PREREQS = [
  {
    done: false,
    baslik: 'Sunucu altyapısı (Blaze plan veya harici sunucu)',
    detay: 'Entegratör API çağrıları gizli anahtar gerektirir; istemciden yapılamaz. Cloud Functions (Blaze) veya küçük bir aracı sunucu kurulmalı.',
  },
  {
    done: false,
    baslik: 'Entegratör anlaşması (Posentegra vb.)',
    detay: 'e-Fatura / e-Arşiv için özel entegratör veya GİB portalı hesabı ve test ortamı bilgileri alınmalı.',
  },
  {
    done: false,
    baslik: 'Mali onay — GMP-3 ÖKC',
    detay: 'Ödeme kaydedici cihaz (yeni nesil ÖKC) ve GMP-3 entegrasyonu yasal sertifikasyon gerektirir. Mali mühür / cihaz onayı zorunludur.',
  },
  {
    done: false,
    baslik: 'Mükellef bilgileri (VKN, ünvan, e-Fatura mükellefiyeti)',
    detay: 'Firmanın e-Fatura/e-Arşiv mükellefi olup olmadığı ve vergi bilgileri ayarlardan tanımlanmalı.',
  },
];

const PLAN = [
  'Aracı sunucu/Functions üzerinden entegratör API\'sine bağlanılır (anahtarlar sunucuda saklanır).',
  'Ödeme tamamlandığında fiş verisi sunucuya gönderilir, e-Arşiv/e-Fatura oluşturulur.',
  'GMP-3 uyumlu ÖKC ile ödeme + mali fiş tek akışta birleştirilir.',
  'Oluşan belgenin numarası/QR\'ı müşteri fişine basılır ve siparişe işlenir.',
];

export default function EInvoice() {
  return (
    <div className="p-8">
      <PageHeader
        title="E-Dönüşüm / Entegrasyon"
        subtitle="e-Fatura · e-Arşiv · Posentegra · GMP-3 ÖKC — planlama ve ön gereksinimler"
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={22} />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Bu modül planlama aşamasındadır.</p>
          <p className="mt-1">
            e-Fatura/e-Arşiv ve GMP-3 ÖKC entegrasyonu <strong>yasal sertifikasyon</strong> ve
            <strong> harici sunucu altyapısı</strong> gerektirir. Mevcut Firebase Spark (ücretsiz)
            planında sunucu tarafı kod çalıştırılamadığından bu özellik henüz aktif değildir.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FileCheck2 size={18} /> Ön Gereksinimler
          </h3>
          <ul className="space-y-3">
            {PREREQS.map((p, i) => (
              <li key={i} className="flex gap-3">
                {p.done ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.baslik}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{p.detay}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Planlanan Akış</h3>
          <ol className="space-y-3">
            {PLAN.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Geçici çözüm</p>
            <p className="mt-1">
              Entegrasyon tamamlanana kadar satışlar <strong>Muhasebe Aktarımı</strong> sayfasından
              Excel/CSV olarak dışa aktarılıp mali müşavire iletilebilir.
            </p>
          </div>

          <a
            href="https://ebelge.gib.gov.tr"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink size={14} /> GİB e-Belge bilgi sayfası
          </a>
        </div>
      </div>
    </div>
  );
}
