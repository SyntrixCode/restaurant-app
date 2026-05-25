/**
 * Kart ödeme akışı abstraction — iki sağlayıcı destekler:
 *
 *   1) simulation    — banka entegrasyonu yokken, demo akışı (varsayılan)
 *   2) verifone-tcp  — gerçek T650p entegrasyonu (banka ECR onayı bekleniyor)
 *
 * Çağıran taraf `chargeCard({ amount, orderId, onStage })` çağırır.
 * `onStage(stage, detail)` her aşamada UI'a haber verir — modal'da gösterilir.
 *
 * Stage'ler:
 *   'connecting'  → POS cihazına bağlanılıyor
 *   'sending'     → Tutar gönderildi, T650p ekranında
 *   'waiting'     → Kart okutması bekleniyor
 *   'processing'  → Banka ile onay alınıyor
 *   'approved'    → Onaylandı (sonuç)
 *   'declined'    → Reddedildi
 *   'cancelled'   → Müşteri iptal etti
 *   'error'       → Bağlantı / sistem hatası
 *
 * Provider seçimi: Firestore settings.cardPayment.provider veya default 'simulation'.
 */

const PROVIDERS = {
  simulation: simulationProvider,
  'verifone-tcp': verifoneTcpProvider,
};

/**
 * @param {{amount:number, orderId:string, onStage?:(stage:string,detail?:object)=>void, provider?:string, terminalIp?:string}} opts
 * @returns {Promise<{ ok:true, approvalCode:string, cardLastFour?:string, cardType?:string } | { ok:false, reason:string }>}
 */
export async function chargeCard(opts) {
  const providerKey = opts.provider || 'simulation';
  const provider = PROVIDERS[providerKey] || simulationProvider;
  return provider(opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) SIMULATION provider — demo amaçlı, banka entegrasyonu yokken
// ─────────────────────────────────────────────────────────────────────────────

async function simulationProvider({ amount, onStage }) {
  const emit = (stage, detail) => onStage?.(stage, detail);

  // Aşama 1: bağlanma (200-400ms)
  emit('connecting', { message: 'T650p\'ye bağlanılıyor...' });
  await sleep(rand(200, 400));

  // Aşama 2: tutar gönderme (300-500ms)
  emit('sending', { message: `${formatTL(amount)} T650p ekranına gönderildi`, amount });
  await sleep(rand(300, 500));

  // Aşama 3: müşteri kartı okutmasını bekle (1500-2500ms — demo'da hızlı olsun)
  emit('waiting', { message: 'Müşteri kartını okutuyor...' });
  await sleep(rand(1500, 2500));

  // Aşama 4: bankadan onay alınıyor (700-1200ms)
  emit('processing', { message: 'Banka onayı alınıyor...' });
  await sleep(rand(700, 1200));

  // Sonuç: demo'da %95 onay, %5 ret (simülasyon, çeşit göstermek için)
  const success = Math.random() < 0.95;
  if (success) {
    const result = {
      ok: true,
      approvalCode: String(Math.floor(100000 + Math.random() * 900000)),
      cardLastFour: String(Math.floor(1000 + Math.random() * 9000)),
      cardType: pickRandom(['Visa', 'MasterCard', 'Troy', 'Amex']),
      mode: 'simulation',
    };
    emit('approved', result);
    return result;
  } else {
    const result = { ok: false, reason: 'Kart reddedildi — bakiye yetersiz', mode: 'simulation' };
    emit('declined', result);
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) VERIFONE TCP provider — banka onayı geldikten sonra aktif olacak
// ─────────────────────────────────────────────────────────────────────────────

async function verifoneTcpProvider({ amount, orderId, onStage, terminalIp }) {
  const emit = (stage, detail) => onStage?.(stage, detail);

  // TODO: Banka belirlenince:
  //   1. Native plugin 'VerifoneEcr' eklenecek (TCP socket → terminalIp:port)
  //   2. Banka protokolüne göre mesaj formatı (GMP-3 / OPI / vendor-specific)
  //   3. Sale komutu gönder, ekrandan kart okumasını bekle, sonucu parse et
  //
  // Şu an placeholder — banka entegrasyonu hazır olunca burayı dolduracağız.

  emit('error', {
    message: 'Verifone T650p entegrasyonu henüz aktif değil. Banka onayı bekleniyor.',
    needsBankApproval: true,
  });
  return {
    ok: false,
    reason: 'verifone-tcp sağlayıcısı bağlı değil. Şimdilik simulation kullanın.',
    mode: 'verifone-tcp',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTL(n) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + ' TL';
}
