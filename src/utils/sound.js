/**
 * Basit bildirim sesleri — Web Audio API ile (ses dosyası gerektirmez).
 * Tarayıcı autoplay politikası: ilk kullanıcı etkileşiminden sonra çalışır
 * (POS login zaten bir etkileşim sağlar).
 */

let _ctx = null;
function ctx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

function tone(freq, durationMs, startDelay = 0, type = 'sine', gainValue = 0.18) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ac.destination);
  const t0 = ac.currentTime + startDelay / 1000;
  osc.start(t0);
  // Yumuşak kapanış (klik sesini önle)
  gain.gain.setValueAtTime(gainValue, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.stop(t0 + durationMs / 1000);
}

/**
 * Yeni sipariş bildirimi — iki yükselen ton ("ding-dong").
 */
export function playNewOrderSound() {
  tone(880, 180, 0, 'sine');
  tone(1175, 260, 180, 'sine');
}

/**
 * Yeni paket sipariş — daha dikkat çekici üç ton.
 */
export function playNewPackageSound() {
  tone(660, 150, 0, 'square', 0.14);
  tone(880, 150, 150, 'square', 0.14);
  tone(1100, 220, 300, 'square', 0.14);
}

/**
 * PLATFORM siparişi (Trendyol / Yemeksepeti / Getir) — EN YÜKSEK ve en ayırt edici alarm.
 * Bu siparişler kaçırılırsa ceza/iptal riski var; masa siparişinden net ayrılmalı.
 * Yükselen 3'lü motif × 3 tekrar (siren benzeri), belirgin yüksek ses.
 */
export function playPlatformOrderSound() {
  const G = 0.5; // masa/paket sesinden ~3x yüksek
  for (let r = 0; r < 3; r++) {
    const t = r * 700;
    tone(784, 160, t, 'square', G); // G5
    tone(1047, 160, t + 160, 'square', G); // C6
    tone(1319, 300, t + 320, 'square', G); // E6
  }
}

/**
 * Garson çağırma — alarm tarzı tekrarlı.
 */
export function playWaiterCallSound() {
  tone(1000, 150, 0, 'triangle', 0.2);
  tone(1000, 150, 250, 'triangle', 0.2);
}

/**
 * Ses sistemini kullanıcı etkileşiminde "uyandır" (autoplay kilidi için).
 */
export function warmupAudio() {
  const ac = ctx();
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
}
