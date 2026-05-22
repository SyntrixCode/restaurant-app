# Restoran POS — Proje Durumu

**Son güncelleme:** 2026-05-23
**Firebase Project ID:** `alazligida-e77b9`
**Bölge:** `europe-west3` (Frankfurt)
**Plan:** Spark (ücretsiz) — Cloud Functions ve Storage **kapalı**

---

## 1. Hızlı Başlangıç (Klasör Taşıdıktan Sonra)

```powershell
# 1. Bağımlılıkları yükle
npm install

# 2. Functions klasörü için de yükle (Blaze'e geçilirse lazım)
cd functions
npm install
cd ..

# 3. Firebase CLI'ye giriş
npx firebase login
npx firebase use alazligida-e77b9

# 4. Dev server'ı başlat
npm run dev
```

Tarayıcı: <http://localhost:5173/admin/login>

---

## 2. Test Bilgileri

### Admin Paneli
- **URL:** `http://localhost:5173/admin/login`
- **Email:** `admin@restoran.com`
- **Şifre:** `Admin123!`

### POS (4 haneli kod)
- **URL:** `http://localhost:5173/pos/login`

| Kod  | Kullanıcı           | Rol     |
|------|---------------------|---------|
| 1234 | Ali Yılmaz          | garson  |
| 2345 | Ayşe Demir          | garson  |
| 9999 | Mehmet Kaya         | kasiyer |

### QR Menü
- `http://localhost:5173/menu/t1` (Masa 1, public)

---

## 3. Yapılanlar (Faz 1, 2, 4 kısmi)

### ✅ Faz 1 — Temel Altyapı (TAMAM)
- Vite + React 18 + Tailwind 3 + Firebase 10 SDK kurulumu
- React Router 6 (`/admin/*`, `/pos/*`, `/menu/:masaId`)
- Zustand store'ları (`authStore`, `settingsStore`, `cartStore`)
- Admin login (email/şifre, 5/60sn rate limit, Beni Hatırla)
- POS login (4 haneli numerik klavye, **derived email/password** mantığıyla — Spark uyumlu)
- Dashboard (KPI kartları + canlı Firestore listener)
- Kategori yönetimi (drag-drop sıralama @dnd-kit + yazıcı atama)
- Ürün yönetimi (CRUD, stok rozetleri; görsel upload Spark'ta kapalı)
- Yazıcı (printers) yönetimi (yeni koleksiyon, varsayılan yazıcı işaretleme)
- Kullanıcı yönetimi (secondary Firebase app pattern ile POS user yaratma)
- QR Müşteri Menüsü (mobile-first, scroll-spy)
- Firebase Console: proje + Auth + Firestore + Web App
- Firestore rules (doc-lookup, custom claims yok)
- Firestore composite index'leri deploy
- Seed script (admin + 3 POS user + 8 kategori + 20 ürün + 6 masa + 2 yazıcı + ayarlar)

### ✅ Faz 2 — Sipariş Çekirdeği (TAMAM)
- POS Tables sayfası (zone sekmeli, renkli durum kartları)
- POS NewOrder sayfası (3 bölümlü: kategori bar / ürün grid / sepet panel)
- POS ActiveOrders sayfası (filtreli sekmeler, durum geçişleri)
- Firestore transaction ile sipariş oluşturma:
  - `orders` yazma
  - `products.stok` atomik düşürme
  - `tables.durum` → "dolu"
  - `stockMovements` audit kaydı (Faz 1 kararı gereği baştan yazılıyor)
- Mevcut siparişe ekleme (transaction ile yeni stok düşürme)
- Dolu masa modal'ı (Sipariş Ekle / Ödeme Al butonları)
- Realtime senkron (Firestore listeners)

### ✅ Faz 4 — Ödeme Ekranı (KISMEN TAMAM)
- POS Payment sayfası (sol özet, sağ ödeme yöntemi butonları)
- Nakit akışı (verilen tutar + para üstü hesabı)
- Kart akışı (mock POS spinner, marka kararı bekleniyor)
- Yemek kartı (7 marka: Multinet, Sodexo, Ticket, Setcard, Edenred, Metropol, Diğer)
- Bölünmüş ödeme (her parça ayrı `payments` kaydı)
- Firestore transaction ile ödeme tamamlama:
  - `payments` koleksiyonuna kayıt
  - `orders.durum` → `tamamlandi`
  - `archivedOrders/{id}`'ye kopya (rapor için)
  - `tables.durum` → `bos`
- Fiş önizleme + tarayıcı yazdırma (`window.print`, 80mm + A4)
- Otomatik fiş bas toggle (settings'ten)

### Faz 4'ten Kalan (Capacitor Aşamasında)
- ❌ Capacitor APK üretme (iMin Swan 1 deploy için)
- ❌ iMin Printer SDK native plugin (Kotlin)
- ❌ iMin Dual Screen SDK (ikincil müşteri ekranı)
- ❌ Banka POS gerçek entegrasyon (marka kararı bekleniyor: Ingenico/Verifone/PayFlex)

---

## 4. Sıradaki Fazlar (Planlanan)

### 📋 Faz 3 — Masa Yönetimi
- Admin → Masalar sayfasında **drag-drop layout editor** (canvas üzerine masa yerleştir, taşı, sil)
- Yeni masa ekleme (2/4/6/8 kişilik tipleri)
- Bar/Bölüm Duvarı dekoratif öğeler
- **Masa birleştirme** (5px yakınlık → `tableGroups` dokümanı, ana masa ataması)
- Rezervasyon yönetimi (sağ-tık menüsü, `reservations` koleksiyonu)
- POS'ta canvas görünümü (read-only, x/y koordinatlarına göre)

### 📋 Faz 5 — Admin Sipariş Yönetimi + Bildirimler
- `/admin/orders` — aktif + tamamlanan sekmeleri, filtreler, detay modal
- `/admin/archive` — 90 günlük arşiv, Excel export
- `/admin/notifications` — bildirim listesi + ayarlar modal'ı
- **Sorun:** Cloud Functions olmadan scheduled bildirimler (gecikme/düşük stok) yapılamaz.
  - **Workaround A:** Client-side periodic check (kullanıcı oturum açtığında her dakika)
  - **Workaround B:** Blaze'e geçiş

### 📋 Faz 6 — Raporlama
- `/admin/reports` — tarih filtreleri + KPI kartları
- Recharts grafikleri (saatlik/günlük satış, kategori dağılımı, garson performansı)
- Excel export (`xlsx` kütüphanesi, çok sekmeli)

### 📋 Faz 7 — Kampanya + Kupon
- `/admin/campaigns` ve `/admin/coupons` CRUD ekranları
- Saat/gün/tarih aralığı programları
- Ödeme ekranında kupon/kampanya uygulama
- "En büyük indirim" kuralı (kümülatif değil)

### 📋 Faz 8 — Paket Servis + CallerID
- `/admin/packages` ve `/pos/packages`
- Manuel paket sipariş girişi
- CallerID popup (5sn, sağ üstte)
- **Yemeksepeti webhook** — Cloud Functions gerekli (Blaze)
- **Getir webhook** — Cloud Functions gerekli (Blaze)
- IP telefon entegrasyonu — Faz 8 başlangıcında karar verilecek

### 📋 Faz 9 — QR Menü İyileştirme
- Admin: masa başına QR kod üretici + A6 PDF yazdır
- Service worker (offline cache, vite-plugin-pwa)
- "Garsonu Çağır" butonu (opsiyonel, sonra)

### 📋 Faz 10 — Detaylı Stok + Finans
- `stockMovements` UI (geçmiş listesi, filtreler)
- Reçete bazlı stok (1 köfte = 150g kıyma + 1 yumurta)
- Sayım modu, fire takibi, tedarikçi yönetimi
- Finans modülü tüm sekmeleri (Gelir/Gider, Kasa, Bütçe, Faturalar)

---

## 5. Mimari Kararlar (Önemli)

### Spark Planı için Yapılan Adaptasyonlar
1. **Cloud Functions yok** → POS login client-side derived email/password ile yapılıyor (`src/utils/hash.js` SHA-256 → email + password türetir)
2. **Storage yok** → Ürün görseli upload UI'si Spark mode'da disabled (`SPARK_MODE` flag'i `.env.local`'de)
3. **stockMovements trigger yerine** → Sipariş transaction'ı içinde client-side yazılıyor (`src/firebase/orders.js`)
4. **scheduled checkLateOrders yerine** → Faz 5'te client-side polling planlanıyor
5. **Custom claims yerine** → Firestore rules `get(users/{uid}).rol` doc-lookup yapıyor

### Firestore Rules — Staff Yazma Yetkileri (Önemli)
Spark planında client-side transaction çalıştığı için staff'a (garson/kasiyer) belirli alanlarda yazma izni verildi:

| Koleksiyon | Staff yetkisi | Admin yetkisi |
|---|---|---|
| `products` | Sadece `stok` + `updatedAt` (diff kontrolü ile) | Tüm alanlar |
| `tables` | Sadece `durum`, `grupId`, `rezervasyonNotu` | Tüm alanlar |
| `stockMovements` | create (audit log) | tam yetki |
| `archivedOrders` | kasiyer + admin create | update/delete |
| `payments` | kasiyer + admin create | update/delete |

`request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` ile fiyat değiştirme gibi yetki aşımı engelleniyor.

### Sözleşilmiş Tasarım Kararları (8 soruya verilen yanıtlar)
1. **Kupon ekranı** → Ayrı sayfa (`/admin/coupons`), Word doküman yapısı
2. **Mutfak yazıcısı** → Kategori → yazıcı eşleme. Yeni `printers` koleksiyonu + `categories.yaziciId` alanı
3. **Rezervasyon bitişi** → Zorunlu, sabit süre
4. **Stok hareketleri** → Faz 1'den itibaren `stockMovements`'a yazılıyor
5. **Banka POS markası** → Karar bekleniyor (mock kullanılıyor)
6. **CallerID donanımı** → Müşteride IP telefon var, VoIP yönünde, donanım teyidi bekleniyor
7. **Yemeksepeti/Getir** → Her ikisi entegre edilecek (Faz 8)
8. **Test stratejisi** → Playwright E2E + Vitest unit (henüz kurulmadı)

---

## 6. Açık Konular / Karar Bekleyenler

| # | Konu | Durum | Son tarih |
|---|---|---|---|
| 1 | Banka POS markası (Ingenico/Verifone/PayFlex) | Müşteriden bilgi bekleniyor | Faz 4 native (Capacitor APK) |
| 2 | CallerID donanımı (IP telefon detayı) | Müşteri araştırması bekleniyor | Faz 8 başı |
| 3 | Spark → Blaze geçişi | Bekliyor | Faz 5/8'den önce gerekecek |
| 4 | Custom domain | Bekliyor | Production deploy öncesi |
| 5 | iMin Swan 1 cihaz alımı | Bekliyor | Faz 4 native |

---

## 7. Önemli Dosyalar (Klasör Taşıma Sonrası Bilmen Gerekenler)

```
RestorantPos/
├── PROJECT_STATUS.md          ← Bu dosya
├── restoran-pos-schema.json   ← Tam spec (1221 satır, 16 koleksiyon, 10 faz, testing)
├── Restoran-POS-Teknik-Sartname.docx  ← İnsan-okunabilir şartname
├── package.json               ← Scripts: dev, build, seed, deploy:rules, ...
├── firebase.json              ← Functions, rules, indexes, storage, hosting config
├── firestore.rules            ← GÜVENLİK: doc-lookup yetkilendirme
├── firestore.indexes.json     ← users.kodHash + diğer composite index'ler
├── storage.rules              ← Blaze'e geçince kullanılacak
├── .env.local                 ← Firebase config (real values, gitignored)
├── .firebaserc                ← project: alazligida-e77b9
├── functions/                 ← Cloud Functions kodu (Blaze'e geçince deploy)
│   ├── index.js               ← verifyUserCode, hashUserCode (kullanılmıyor şu an)
│   └── package.json
├── scripts/
│   └── seed.mjs               ← Web SDK ile seed (Admin SDK gerektirmez)
└── src/
    ├── App.jsx                ← Tüm route'lar
    ├── main.jsx
    ├── firebase/
    │   ├── config.js          ← Firebase init + SPARK_MODE + secondary app helper
    │   ├── auth.js            ← loginAdmin, loginPos (derived), createPosUser
    │   ├── firestore.js       ← CRUD helpers (createDoc, patchDoc, watchCollection)
    │   ├── orders.js          ← createOrder, addItemsToOrder transaction'ları
    │   └── payments.js        ← recordPayment transaction'ı (archive + masa boşalt)
    ├── store/
    │   ├── authStore.js       ← Firebase Auth state + Firestore profile
    │   ├── settingsStore.js   ← settings/global doc listener
    │   └── cartStore.js       ← POS sipariş sepeti
    ├── utils/
    │   ├── hash.js            ← SHA-256 + POS credential türetme
    │   ├── format.js          ← TL, tarih, "5dk önce"
    │   └── validators.js      ← Zod şemaları
    ├── components/
    │   ├── ui/                ← Modal, Toggle, StatCard
    │   ├── layout/            ← AdminLayout, PosLayout, PageHeader, ProtectedRoute
    │   └── ReceiptPreview.jsx ← Fiş yazdırma modal'ı
    └── pages/
        ├── admin/
        │   ├── Login.jsx
        │   ├── Dashboard.jsx
        │   ├── Categories.jsx
        │   ├── Products.jsx
        │   ├── Printers.jsx
        │   ├── Users.jsx
        │   └── Placeholder.jsx (Faz 3, 5-10 için)
        ├── pos/
        │   ├── Login.jsx      ← 4 haneli klavye
        │   ├── Tables.jsx     ← Masa listesi (Faz 2)
        │   ├── NewOrder.jsx   ← Sipariş giriş (Faz 2)
        │   ├── ActiveOrders.jsx (Faz 2)
        │   ├── Payment.jsx    ← Ödeme (Faz 4)
        │   └── Placeholder.jsx
        └── menu/
            └── Menu.jsx       ← QR public menü
```

---

## 8. Bilinen Sorunlar / Notlar

- **Bundle size 1MB+** — code splitting yapılmadı, Faz 9 PWA aşamasında manuel chunks ile böleceğiz.
- **Görsel upload kapalı** — Spark planında Storage olmadığı için. `.env.local`'de `VITE_SPARK_MODE=false` yap + Blaze'e geç → otomatik aktive olur.
- **Bildirimler scheduled değil** — `checkLateOrders` ve `checkLowStock` Cloud Functions gerektiriyor. Faz 5'te client-side polling alternatifi yazılacak.
- **Banka POS mock** — Faz 4 sayfası 1.2sn spinner ile onayı simüle ediyor. Marka kararı sonrası gerçek SDK entegrasyonu.
- **Test suite yok** — Playwright + Vitest schema'da kararlaştırıldı ama henüz kurulmadı. Faz 5'ten önce kurmak gerek.

---

## 9. Sonraki Önerilen Adım

İki yol var:

**A) Faz 3 — Masa Yönetimi:** Drag-drop layout editor + masa birleştirme + rezervasyon.
Gerekçe: Şu an masalar seed'den geliyor, admin düzenleyemiyor. Faz 5'ten önce yapmak mantıklı.

**B) Faz 5 — Admin Sipariş Yönetimi + Bildirimler:** Admin'in tüm operasyonu tek ekranda görmesi.
Gerekçe: Ödeme ekranı çalışıyor; tamamlanan siparişleri görüntülemek + arşiv işlevsel kullanım için kritik.

Önerim: **Faz 5** önce, sonra **Faz 3** (masalar daha az sık değişir, müşteri Faz 5'i daha çok kullanır).
