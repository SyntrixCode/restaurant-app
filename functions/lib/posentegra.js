/**
 * Posentegra (FastSipariş) outbound API client.
 * Auth: Authorization: Bearer <apiKey>  (POSENTEGRA_API_KEY secret)
 *
 * Endpoint'ler swagger'dan:
 *   POST /orders/verify/{pid}           → sipariş kabul
 *   POST /orders/cancel/{pid}           → sipariş red (body: reason, note)
 *   POST /orders/change-status/{pid}    → durum güncelle (body: status)
 *   GET  /orders/reasons/{pid}          → iptal nedenleri
 *   GET  /orders/{pid}                  → sipariş detayı
 */

const BASE = 'https://api.v1.fastsiparis.com/web-api/v1';

async function call(method, path, apiKey, body) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    // Hata mesajı genelde json.error.message veya json.message altında
    const msg =
      json?.error?.message ||
      json?.message ||
      (typeof json?.error === 'string' ? json.error : null) ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(`Posentegra ${method} ${path} (${res.status}): ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export const posentegraApi = {
  verifyOrder: (apiKey, pid) => call('POST', `/orders/verify/${pid}`, apiKey),
  // Swagger: body sadece { reason: string } — reason 24-hex ObjectId olmalı (Getir kuralı).
  cancelOrder: (apiKey, pid, reason) =>
    call('POST', `/orders/cancel/${pid}`, apiKey, { reason }),
  changeStatus: (apiKey, pid, status) =>
    call('POST', `/orders/change-status/${pid}`, apiKey, { status }),
  getCancelReasons: (apiKey, pid) => call('GET', `/orders/reasons/${pid}`, apiKey),
  getOrder: (apiKey, pid) => call('GET', `/orders/${pid}`, apiKey),
};

// Bizim `orders.durum` → Posentegra `status` kodu.
// Posentegra'nın kesin durum kodları dokümante edilmemiş; örnek payload'lardan
// gözlemlenen kodlar baz alındı (400=preparing, 500=on-way, 900=completed).
// Canlı kullanımda Posentegra'nın geri dönüşüne göre ince ayar yapılabilir.
export const POSENTEGRA_STATUS_MAP = {
  hazirlandi: 400, // mutfak hazırladı
  masayaGitti: 500, // kuryeye verildi / yola çıktı
  tamamlandi: 900, // teslim edildi / kapandı
  // 'aktif' başlangıç (verify ayrı akışta), 'iptal' cancel ayrı akışta
};
