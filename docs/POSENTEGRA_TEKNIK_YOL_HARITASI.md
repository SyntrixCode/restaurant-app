# Posentegra Entegrasyonu — Teknik Yol Haritası

**Bu dosya geliştirici notudur — müşteri ile paylaşılmaz.**

## 🎯 Hedef

Posentegra → Cloudflare Worker → Firestore → POS tablet zinciri kurulması.
Müşteri Posentegra'dan kendi API key'ini alır, biz POS tarafını entegre ederiz.

## 📐 Mimari

```
┌────────────────────────────────────────────────────────────┐
│  Yemeksepeti / Getir / Trendyol / Migros                   │
│  (4 platform — restoranın doğrudan üyeliği)                │
└─────────────────────────┬──────────────────────────────────┘
                          │ webhook (HTTPS POST)
                          ▼
              ┌──────────────────────────┐
              │  Posentegra Cloud        │
              │  (aggregator, $9.99-15.99/ay) │
              │  Restoran kendi öder    │
              └────────┬─────────────────┘
                       │ webhook → bizim relay
                       ▼
       ┌──────────────────────────────────────┐
       │  Cloudflare Worker (relay)            │
       │  Maliyet: 0 ₺ (free tier yeter)       │
       │  URL: pos-relay.alazligida.workers.dev│
       └────────┬──────────────────────────────┘
                │ Firestore Admin SDK REST
                ▼
       ┌──────────────────────────┐
       │  Firestore: orders        │
       │  paketMi=true             │
       │  paketKaynak: 'yemeksepeti'│
       │  ...                      │
       └────────┬──────────────────┘
                │ realtime listener
                ▼
       ┌──────────────────────────┐
       │  Tablet (Capacitor APK)  │
       │  POS Açık Siparişler     │
       └──────────────────────────┘
```

## 🔧 Adım 1: Cloudflare Worker setup (öncelikli iş — şimdi yap)

### 1.1 Cloudflare hesabı (varsa)

- Hesabı yoksa kullanıcıdan iste (`cloudflare.com/sign-up`)
- Workers free tier: 100K request/gün — yeterli

### 1.2 Worker projesi

```bash
npm create cloudflare@latest pos-relay -- --type=hello-world --no-deploy
cd pos-relay
```

### 1.3 Worker kod taslağı (`src/index.js`)

```javascript
/**
 * Posentegra webhook receiver → Firestore relay
 * 
 * Posentegra event'leri:
 * - new_order: yeni sipariş
 * - status_update: durum değişikliği
 * - cancel: iptal
 * 
 * URL format:
 * POST /webhook/{restaurantId}?token=XXX
 */

import { signJWT } from './jwt'; // service account JWT için

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const restaurantId = url.pathname.split('/')[2];
    const token = url.searchParams.get('token');

    // 1. Auth: API key restaurant ile eşleşmeli
    if (!await verifyToken(restaurantId, token, env)) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await request.json();

    // 2. Posentegra payload'unu bizim orders schema'mıza map et
    const order = mapPosentegraOrder(body, restaurantId);

    // 3. Firestore'a yaz (Admin SDK REST üzerinden)
    const accessToken = await getFirestoreAccessToken(env);
    const result = await writeToFirestore(order, accessToken, env);

    return new Response(JSON.stringify({ ok: true, orderId: result.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

function mapPosentegraOrder(p, restaurantId) {
  // Posentegra'nın provider field'ı: ys|getir|migros|ty
  const kaynakMap = {
    ys: 'yemeksepeti',
    getir: 'getir',
    ty: 'trendyol',
    migros: 'migros',
  };

  return {
    restaurantId,
    masaId: null,
    masaAd: `Paket - ${p.customer.name}`,
    kisiSayisi: null,
    paketMi: true,
    paketKaynak: kaynakMap[p.provider] || 'diger',
    musteriAd: p.customer.name,
    musteriTel: p.customer.phone,
    musteriAdres: p.customer.address,
    notlar: p.note || '',
    items: p.items.map((it) => ({
      productId: null, // map by name match or skip
      ad: it.name,
      fiyat: it.unit_price,
      adet: it.quantity,
      notlar: it.note || '',
      eklenmeZamani: new Date(),
    })),
    araToplam: p.subtotal,
    indirim: p.discount || 0,
    toplam: p.total,
    kuponKodu: null,
    kampanyaId: null,
    durum: 'aktif',
    posentegraId: p.id,
    posentegraStatus: p.status,
    garsonId: null,
    garsonAd: 'Online',
    olusturmaZamani: new Date(p.created_at),
  };
}

async function verifyToken(restaurantId, token, env) {
  // KV'den restoran token'ını oku
  const expected = await env.KV_TOKENS.get(`restaurant:${restaurantId}`);
  return expected && expected === token;
}

async function getFirestoreAccessToken(env) {
  // Service account JWT → Google OAuth → access token
  const jwt = await signJWT({
    iss: env.GCP_SA_EMAIL,
    sub: env.GCP_SA_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  }, env.GCP_SA_PRIVATE_KEY);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  return data.access_token;
}

async function writeToFirestore(order, accessToken, env) {
  const projectId = env.GCP_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: encodeFirestoreFields(order) }),
  });
  return await resp.json();
}

function encodeFirestoreFields(obj) {
  // Recursive Firestore REST field encoding
  // ... boilerplate
}
```

### 1.4 KV ve secret'lar

```bash
# Worker secrets
wrangler secret put GCP_SA_EMAIL
wrangler secret put GCP_SA_PRIVATE_KEY  
wrangler secret put GCP_PROJECT_ID

# KV namespace (restoran token'ları)
wrangler kv:namespace create "TOKENS"
# wrangler.toml'a [[kv_namespaces]] eklenir
```

### 1.5 Deploy

```bash
wrangler deploy
# → https://pos-relay.YOUR-SUBDOMAIN.workers.dev
```

## 🔧 Adım 2: Settings sayfasına entegrasyon bölümü ekle

Yeni section: "Online Entegrasyon"

```jsx
// src/pages/admin/Settings.jsx — yeni Section

<Section title="Online Sipariş Entegrasyonu" icon={Smartphone}>
  <Field label="Sağlayıcı">
    <select {...register('entegrasyonSaglayici')} className="input">
      <option value="">Devre dışı</option>
      <option value="posentegra">Posentegra</option>
    </select>
  </Field>

  <Field label="API Anahtarı (Posentegra'dan alınan)">
    <div className="flex gap-2">
      <input
        type="password"
        {...register('posentegraApiKey')}
        className="input font-mono"
        placeholder="******"
      />
      <button type="button" onClick={testConnection} className="btn-secondary shrink-0">
        Test Et
      </button>
    </div>
  </Field>

  <Field label="Webhook URL (Posentegra panele yapıştır)">
    <input
      readOnly
      value={`https://pos-relay.workers.dev/webhook/${restaurantId}?token=${token}`}
      className="input font-mono text-xs"
    />
    <button onClick={copyWebhookUrl} className="text-xs text-blue-700 hover:underline">
      📋 Kopyala
    </button>
  </Field>

  <p className="text-xs text-slate-500">
    Posentegra panelinden bu URL'yi webhook hedefi olarak ayarlayın.
    Aşağıdaki platformlar otomatik açılır.
  </p>

  <div className="grid grid-cols-2 gap-2">
    {[
      { id: 'yemeksepeti', label: 'Yemeksepeti' },
      { id: 'getir', label: 'Getir Yemek' },
      { id: 'trendyol', label: 'Trendyol GO' },
      { id: 'migros', label: 'Migros Yemek' },
    ].map((p) => (
      <ToggleField
        key={p.id}
        label={p.label}
        control={control}
        name={`platform.${p.id}`}
      />
    ))}
  </div>
</Section>
```

## 🔧 Adım 3: Sipariş geldiğinde POS davranışı

Mevcut akış zaten hazır:
- Firestore'a paketMi=true sipariş düşüyor
- POS ActiveOrders zaten paket bölümünde gösteriyor
- "Yola Çıkar" / "App ile Ödendi" butonları var

**Tek eklenecek:** Status update outbound — POS'tan Posentegra'ya status değişikliği

```js
// src/firebase/posentegraSync.js (yeni)
export async function syncOrderStatusToPosentegra(order, newStatus) {
  if (!order.posentegraId) return; // online değilse atla

  const url = 'https://pos-relay.workers.dev/sync-status';
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      posentegraId: order.posentegraId,
      status: newStatus,
      restaurantId: order.restaurantId,
    }),
  });
}
```

Worker'a karşılık gelen endpoint:

```js
// Worker'da yeni endpoint
if (url.pathname === '/sync-status') {
  // POS → Worker → Posentegra
  // POS'tan gelen status'u Posentegra format'ına çevir
  const { posentegraId, status, restaurantId } = body;
  const eventType = mapStatusToPosentegraEvent(status);
  // ys|getir|migros|ty hangisi olduğunu order'dan oku
  const provider = order.paketKaynak; // gerekirse Firestore'dan oku
  
  await fetch(`https://api.posentegra.com/${provider}/order/${eventType}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.POSENTEGRA_KEY}`,
    },
    body: JSON.stringify({ orderId: posentegraId }),
  });
}

function mapStatusToPosentegraEvent(status) {
  return {
    'aktif': 'verify',       // sipariş kabul
    'masayaGitti': 'pickup',  // kurye aldı
    'tamamlandi': 'complete', // teslim edildi
  }[status] || null;
}
```

## 🔧 Adım 4: Test akışı

### Lokal test (Posentegra olmadan)

```bash
# Bir test webhook payload'u POST et
curl -X POST https://pos-relay.workers.dev/webhook/test-restaurant?token=test \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ys",
    "id": "TEST-001",
    "customer": {"name":"Test Müşteri","phone":"5551234567","address":"Test Mah."},
    "items": [{"name":"Karışık Pide","quantity":1,"unit_price":300}],
    "subtotal": 300,
    "total": 300,
    "status": "received",
    "created_at": "2026-05-23T19:00:00Z"
  }'
```

Firestore'da `orders` koleksiyonunda yeni doc oluşmalı, tablette anında düşmeli.

### Sandbox test (Posentegra ile)

- Posentegra ile partner görüşmesi yap
- Sandbox API key al
- Worker'a yapıştır
- Her platform için 1 test siparişi geçir

### Production geçiş

- Restoran kendi Posentegra hesabını açar
- API key bizim worker'a yapıştırılır
- 4 platforma 1'er test siparişi
- Canlı

## 🔧 Adım 5: Hata yönetimi + monitoring

- Worker logs → Cloudflare dashboard
- Firestore write hatası → retry (3x exponential backoff)
- Posentegra status update başarısız → Firestore'a "syncFailed" işareti, admin görsün
- Webhook duplicate (aynı orderId 2x gelirse) → idempotent (Firestore'da posentegraId index unique)

## 📋 Yapılacaklar Listesi (sıralı)

### Pre-launch (müşteri kararından önce yapılabilir)
- [ ] Cloudflare hesabı + Worker proje iskeleti
- [ ] Worker kodu yaz (mock payload ile test)
- [ ] Firestore Admin SDK auth setup (service account JSON)
- [ ] Settings sayfasına "Online Entegrasyon" section ekle (UI only, henüz çalışmıyor)
- [ ] Sync endpoint (POS → Posentegra status)

### Müşteri kararı sonrası
- [ ] Posentegra ile partner görüşmesi (bayi indirimi var mı?)
- [ ] Müşteri Posentegra hesabı açar (kendi adına)
- [ ] API key alınır, Settings'e girilir
- [ ] Sandbox testleri (Posentegra sandbox)
- [ ] 4 platform için 1'er test siparişi
- [ ] Personel eğitimi (2 saat)
- [ ] Canlıya alma

### Süreç sonrası
- [ ] 30 gün yakın takip (loglar, hata oranı)
- [ ] Müşteriden geri bildirim al
- [ ] Bir sonraki restoran için template haline getir

## 💡 Notlar

### Posentegra'nın public API'sı
Gist'te paylaşılmış public doküman:
```
PUT /{provider}/order/{eventType}
provider: ys | getir | migros | ty
eventType: verify | cancel | prepare | pickup | complete
```

Bu basit yapı işimizi kolaylaştırıyor — her platform için ayrı kod yazmamıza gerek yok.

### Spark planında kalabilir miyiz?

**Evet.** Cloud Functions yok ama Cloudflare Worker'la dışarıdan Firestore'a yazıyoruz. Firebase Web SDK quota'ları:
- Firestore: 50K reads + 20K writes + 20K deletes / gün — küçük restoran için fazlasıyla yeter
- Outbound bandwidth: 10 GB/ay
- Sınırlar aşılırsa Blaze'e geç (kullanım kadar öde, küçük hacim ~$1-5/ay)

### Maliyetler özet (bizim taraf)
- Cloudflare Workers: 0 ₺ (free tier)
- Firebase Spark: 0 ₺ (limitler aşılana kadar)
- Geliştirme efor: ~1 hafta (Worker + Settings UI + Sync)

### Maliyetler özet (restoran taraf)
- Posentegra abonelik: yıllık ödemede ~₺3.000/yıl (4'lü paket)
- Kurulum (bize): ₺2.500
