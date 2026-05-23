# Restoran POS — Proje Durumu

**Son güncelleme:** 2026-05-23
**Firebase Project ID:** `alazligida-e77b9`
**Bölge:** `europe-west3` (Frankfurt)
**Plan:** Spark (ücretsiz) — Cloud Functions ve Storage **kapalı**
**Repo:** [SyntrixOps/restaurant-app](https://github.com/SyntrixOps/restaurant-app)
**Hedef cihaz:** iMin Swan 1 Pro (Android 11+, dahili termal yazıcı)

---

## 1. Hızlı Başlangıç

```powershell
# 1. Bağımlılıkları yükle
npm install

# 2. Dev sunucusu
npm run dev
# → http://localhost:5173/admin/login

# 3. Firestore rules deploy (rules değişirse)
npm run deploy:rules

# 4. APK al (GitHub Actions, manuel tetikleme)
# https://github.com/SyntrixOps/restaurant-app/actions/workflows/build-apk.yml
# → "Run workflow" → main → debug
```

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

## 3. Tamamlanan Fazlar

### ✅ Faz 1 — Temel Altyapı
- Vite + React 18 + Tailwind 3 + Firebase 10 SDK
- React Router 6 (`/admin/*`, `/pos/*`, `/menu/:masaId`)
- Zustand store'ları (`authStore`, `settingsStore`, `cartStore`)
- Admin login (email/şifre, Beni Hatırla persistence, rate-limit)
- POS login (4 haneli numerik klavye, derived email/password — Spark uyumlu)
- Dashboard (KPI kartları + canlı Firestore listener)
- Kategori yönetimi (drag-drop sıralama + yazıcı atama)
- Ürün yönetimi (CRUD, stok rozetleri)
- Yazıcı yönetimi (eski yapı, tek-yazıcı modeline geçti — bkz. Faz 4)
- Kullanıcı yönetimi (secondary Firebase app pattern)
- QR Müşteri Menüsü (mobile-first, scroll-spy)
- Seed script (admin + 3 POS user + kategori/ürün/masa)
- Firestore rules (doc-lookup yetkilendirme, custom claims yok)

### ✅ Faz 2 — Sipariş Çekirdeği
- POS Tables (canvas görünüm, x/y koordinatları)
- POS NewOrder (3 bölüm: kategori/ürün/sepet)
- POS ActiveOrders (sadeleştirilmiş — tek liste, masa+paket bölümleri)
- Firestore transaction ile sipariş oluşturma:
  - `orders` yazma
  - `products.stok` atomik düşürme
  - `tables.durum` → "dolu"
  - `stockMovements` audit
- Mevcut siparişe ekleme (`addItemsToOrder` transaction)
- Realtime senkron

### ✅ Faz 3 — Masa Yönetimi
- Admin → Masalar drag-drop canvas layout editor
- Masa ekle/sil/düzenle (kapasite seç: 2/4/6/8)
- Bölge (zone) yönetimi (İç Salon / Teras / serbest)
- Dekoratif öğeler: Bar / Mutfak / WC / Çıkış / Duvar / Yazı (tabela tarzı, 90° dönebilir)
- **Drag-to-merge**: POS'ta boş masayı sürükleyip başka boş masanın üstüne bırak → "Birleştir?" modalı → grup oluşur
- Grup için bounding-box hull + "Grup · N kişilik" rozeti
- **Ödeme sonrası otomatik grup dağılma** (atomik transaction)
- Kişi sayısı zorunluluğu (sipariş modal'ında girilir, fişte görünür)
- Rezervasyon sistemi:
  - POS'ta boş masaya tıkla → "Rezerve Et" geçişi
  - Form: ad, telefon, tarih, saat, kişi, not
  - Rezerve masa canvas'ta "Ahmet · 20:30" gösterir
  - `/admin/reservations` listele/iptal/tamamlandı
- POS'ta canvas görünüm (admin koordinatları)

### ✅ Faz 4 — Ödeme + Native Yazıcı
- POS Payment sayfası (sol özet, sağ ödeme yöntemi)
- **Yarım porsiyon desteği** (½ butonu, 0.5 step, fiyat otomatik 1.5×)
- Nakit (verilen tutar + para üstü)
- Kart (mock 1.2 sn spinner — gerçek banka POS markası bekliyor)
- Yemek kartı (Multinet/Sodexo/Ticket/Setcard/Edenred/Metropol/Diğer)
- **Bölünmüş ödeme** (her parça ayrı `payments` doc)
- Firestore transaction ile ödeme tamamlama:
  - `payments` koleksiyonuna kayıt
  - `orders.durum` → `tamamlandi`
  - `archivedOrders/{id}` kopya
  - `tables.durum` → `bos`
  - Auto-dissolve group (eğer grup masaysa)
  - Kupon kullanılırsa sayaç artışı
- **iMin termal yazıcı entegrasyonu** (Capacitor plugin):
  - `IminPrinterPlugin.java` (com.imin.printer.PrinterHelper SDK)
  - JS API: `IminPrinter.printReceipt({ lines, cut, feedLines })`
  - Mutfak adisyonu (sipariş alınınca otomatik): masa/kişi/garson/saat + ürün listesi (fiyat yok)
  - Hesap fişi (ödeme sonu): tüm detaylar
  - Tarayıcıda fallback: `window.print()`
- **Sipariş durum akışı sadeleştirildi:**
  - Masa: `aktif → tamamlandi` (ödeme ile)
  - Paket: `aktif → yolda → tamamlandi` (kurye gönderildiğinde + ödeme ile)

### ✅ Faz 5 — Admin Sipariş Yönetimi + Bildirimler
- `/admin/orders` — açık masa siparişleri, garson filtresi, arama, detay modal, iptal
- `/admin/archive` — tamamlanan siparişler, tarih aralığı, CSV export (Excel uyumlu)
- `/admin/notifications` — pasif uyarı listesi:
  - Geciken siparişler
  - Düşük stoklu ürünler (settings eşiği veya per-ürün override)
  - Yaklaşan rezervasyonlar (2 saat içinde)
  - 30sn'de bir geçen süreler yenilenir

### ✅ Faz 6 — Raporlama
- `/admin/reports` — Recharts grafikleri:
  - Günlük ciro trendi (LineChart)
  - Saatlik satış dağılımı (BarChart)
  - Garson performansı top 8 (yatay BarChart)
  - Ürün/kategori dağılımı top 10 (PieChart)
  - Ödeme yöntemi dağılımı (Donut)
  - En çok satan ürünler tablosu
- KPI: ciro, sipariş, ortalama sepet, kişi, kişi başı
- Tarih filtreleri (Bugün / 7 / 30 / 90 gün + serbest)
- **Excel export** (xlsx): 6 sekme

### ✅ Faz 7 — Kampanya + Kupon
- `/admin/campaigns` — kampanya CRUD
  - Tarih/gün/saat aralığı programları
  - %/sabit indirim, min sepet
  - "Şu an geçerli" rozeti realtime
- `/admin/coupons` — kupon CRUD
  - Kod (büyük harf+rakam+_/-), max kullanım, son geçerlilik
  - Kullanım sayacı (auto-increment)
- Ödeme ekranında:
  - Aktif kampanya otomatik gösterilir + uygulanır
  - Kupon kodu manuel girilir
  - **"En büyük indirim" kuralı** — kümülatif değil, biri seçilir
  - Order'a `indirim` + `kampanyaId/kuponKod` atomik yazılır

### ✅ Faz 8 (kısmi) — Paket Servis + CallerID
- **POS `/pos/packages`** — manuel paket sipariş girişi
  - Müşteri formu (ad/tel/adres/not) + kaynak (Manuel/Telefon/YS/Getir/Trendyol/Diğer)
  - Sepet (yarım porsiyon, not, ürün picker)
  - Mutfak adisyonu otomatik
- **Admin `/admin/packages`** — paket sipariş yönetimi
  - 2 sekme: Yeni / Yolda
  - Kaynak filtresi + arama
  - "Yola Çıkar" butonu (kurye gönderildiğinde)
  - Detay modal: tel'e tıkla = arama, adres göster
- **CallerID popup** ([CallerIdPopup.jsx](src/components/CallerIdPopup.jsx)):
  - Sağ üstte 30sn açık kalan mavi popup
  - Geçmiş siparişler (archivedOrders'tan musteriTel match)
  - "Paket Sipariş Aç" → `/pos/packages?tel=X` form auto-fill
  - **Mock test:** `window.__mockCall("0555 555 55 55")` (DevTools)
  - settings.bildirimAyarlari.callerID toggle'a saygı

**Atlanan (üçüncü taraf bekliyor):**
- ❌ Yemeksepeti webhook — Cloud Functions gerek (Blaze)
- ❌ Getir webhook — aynı
- ❌ Gerçek IP telefon entegrasyonu — donanım kararı

### ✅ Faz 9 — QR Menü + PWA
- `/admin/qr-codes` — her masa için canlı QR kod (qrcode.react)
- Base URL ayarlanabilir (localStorage)
- Bölge filtresi
- **A6 PDF yazdırma** (CSS `@page A6 portrait` — her QR ayrı sayfa)
- Vite PWA plugin: auto-update service worker, static asset cache, manifest.json link

### ✅ Faz 10 — Detaylı Stok + Finans
- **`/admin/stock`** — stok hareketleri (tüm stockMovements):
  - Filtre: tarih, tip (giriş/çıkış), kaynak, ürün, arama
  - **Manuel hareket** modal: tedarik geldi / fire / iade / sayım düzeltme
  - Excel export
  - Düşük stok uyarı paneli
- **`/admin/suppliers`** — tedarikçi rehberi (CRUD)
  - Kategori, iletişim, tel, email, adres, not
  - Manuel stok hareketinde "Tedarik" kaynağı seçildiğinde dropdown'a düşer
- **`/admin/inventory`** — sayım modu
  - "Yeni Sayım Başlat" → tüm aktif ürünlerin snapshot
  - Sayım modal: her ürün için sistem stoğu + fiziksel stok
  - "Sayımı Kapat" → atomik finalize (products.stok güncellenir, audit yazılır)
  - Geçmiş sayımlar listesi
- **`/admin/ingredients`** — malzemeler (hammadde)
  - Birim: adet/kg/g/lt/ml/paket
  - Stok, eşik, birim maliyet, tedarikçi
  - Düşük stok uyarı paneli
- **`/admin/recipes`** — ürün bazlı reçete
  - Ürün → malzemeler + miktar
  - Otomatik maliyet ve kar % hesabı
  - **Sipariş entegrasyonu**: reçeteli ürün satılınca ingredients.stok atomik düşer
  - Reçetesi olmayan ürünler eski akışla (sadece product.stok)
- **`/admin/finance`** — gelir/gider defteri
  - Predefined kategoriler (Kira, Elektrik, Maaş, vb.)
  - Tarih + tip + kategori filtreleri
  - KPI: gelir/gider/net
  - Excel export (Hareketler + Kategori Özeti)
  - **POS satışları HARİÇ** — onlar Raporlar'da

### ✅ Settings (Faz 5 alt başlığı, ayrı çıkarıldı)
- `/admin/settings` — react-hook-form + zod
  - Restoran bilgileri (ad, adres, tel, vergi no)
  - Operasyon (vergi oranı, KDV dahil, kasa saatleri, eşikler)
  - Fiş (başlık, alt mesaj, otomatik bas)
  - 6 bildirim kategori toggle

### ✅ DevOps / CI
- **GitHub Actions:**
  - `build-apk.yml` — **manuel tetiklemeli** (her commit'te değil)
  - `deploy-firestore.yml` — `firestore.rules` veya indexes değişirse otomatik deploy
- **Capacitor Android:**
  - JitPack: `com.github.iminsoftware:IminPrinterLibrary:V2.0.0.19`
  - Native plugin Kotlin değil Java (MainActivity ile tutarlı)
  - JDK 21, Android SDK 34, Node 22

---

## 4. Bekleyen (üçüncü taraf bağımlı)

| # | Konu | Bağımlılık | Etki |
|---|---|---|---|
| 1 | Banka POS markası | Müşteriden seçim (Ingenico/Verifone/PayFlex) | Şu an mock spinner, gerçek SDK gelecek |
| 2 | Yemeksepeti webhook | Blaze plan + müşterinin YS hesabı | Manuel paket girişi var, otomatik webhook yok |
| 3 | Getir webhook | Blaze plan + Getir hesabı | Aynı |
| 4 | IP telefon entegrasyonu | Donanım/VoIP detayı | Mock CallerID popup hazır |
| 5 | Custom domain | İsteğe bağlı | Production deploy öncesi |
| 6 | iMin Dual Screen (varsa) | Donanım var mı? | İkincil ekran için ayrı plugin |

---

## 5. Mimari Kararlar

### Spark Planı Adaptasyonları
1. **Cloud Functions yok** → POS login client-side derived email/password (`src/utils/hash.js`)
2. **Storage yok** → Ürün görseli upload UI'si disabled (`SPARK_MODE` flag)
3. **stockMovements trigger yerine** → client-side transaction
4. **Scheduled checkLateOrders yerine** → client-side polling (Notifications + Dashboard)
5. **Custom claims yerine** → Firestore rules `get(users/{uid}).rol` doc-lookup

### Önemli Tasarım Kararları
1. **Tek fiş modeli (kategori → yazıcı routing YOK)** — kullanıcı kararı: "mutfaktan ayrı garsondan ayrı fiş çıkmayacak"
2. **Mutfak adisyonu = fiyatsız sipariş listesi** — sipariş alınınca otomatik basılır
3. **Hesap fişi = ödeme sonu detaylı** — `ReceiptPreview` + iMin native
4. **Yarım porsiyon = adet decimal (0.5 step)** — schema değişikliği gerektirmedi, mevcut `fiyat × adet` çalışıyor
5. **Reçete bazlı stok = hibrit** — reçeteli ürün ingredients düşer, reçetesiz ürün product.stok düşer
6. **Sipariş durumu = 2 state** — `aktif → tamamlandi` (masa), `aktif → yolda → tamamlandi` (paket). KDS yok, ara state gereksiz.
7. **Drag-to-merge** — POS'ta boş masa sürükle bırak, ödeme sonrası otomatik dağıl
8. **"En büyük indirim" kuralı** — kampanya + kupon aynı anda olsa biri seçilir
9. **APK build manuel tetiklemeli** — kullanıcı tercihi, her commit'te otomatik APK yok

### Firestore Koleksiyonları (tam liste)
| Koleksiyon | Read | Write | Notlar |
|---|---|---|---|
| users | self/admin | self/admin | rol field |
| categories | public | admin | yaziciId artık kullanılmıyor (tek fiş) |
| products | public | admin (+ staff stok update) | |
| printers | staff | admin | Tek yazıcı modeline geçti, UI gizlenmedi |
| tables | public | admin (+ staff durum/grupId/rezervasyonNotu) | |
| tableGroups | staff | staff | drag-merge için staff yazar |
| decorations | public | admin | |
| orders | staff | staff | |
| archivedOrders | staff | kasiyer/admin | |
| payments | staff | kasiyer/admin | |
| campaigns | staff | admin | |
| coupons | staff | admin (+ staff kullanılan update) | |
| notifications | staff | admin | |
| settings | staff/public | admin | |
| callerLogs | admin/kasiyer | admin | |
| reservations | staff | admin/kasiyer | |
| stockMovements | admin | staff (create) | |
| suppliers | staff | admin | |
| transactions | admin/kasiyer | admin | finans gelir/gider |
| ingredients | staff | admin (+ staff stok update) | |
| recipes | staff | admin | |
| inventoryCounts | admin | admin | sayım sessiyonları |

---

## 6. Bilinen Sorunlar / Sınırlar

- **Banka POS mock** — Faz 4 1.2sn spinner ile onayı simüle eder
- **Bundle 1MB+** — Code splitting yapılmadı (Faz 9 PWA aşamasında route-level lazy yapılabilir)
- **Görsel upload kapalı** — Spark + Storage yok
- **Bildirim push yok** — Pasif liste var, gerçek push (ses/popup) Cloud Functions gerek
- **Test suite yok** — Playwright + Vitest schema'da kararlaştırıldı, henüz kurulmadı
- **Sayım modu sadece products için** — ingredients için ayrı sayım UI yok (gelecek sürüm)
- **Reçete cascade silme yok** — Bir ürün silindiğinde reçetesi kalır (orphan); bir malzeme silindiğinde reçetelerde orphan referans kalır
- **Floating-point ödeme toleransı 0.005 TL** — Olağan senaryolarda yeterli

---

## 7. Sıradaki Adım

Tüm geliştirilebilir özellikler bitti. Şimdi:

1. **Tablette uçtan uca test** (en son APK ile):
   - Mutfak adisyonu termal yazıcıdan çıkıyor mu?
   - Hesap fişi otomatik basıyor mu?
   - Reçete entegrasyonu (malzeme stoğu düşüyor mu?)
   - Sayım akışı
   - Paket sipariş + CallerID mock
2. **Müşteriye demo** — tüm akışları göster
3. **Müşteri kararlarını bekle:**
   - Banka POS markası → SDK entegrasyonu
   - Yemeksepeti/Getir hesap → webhook (Blaze geçişi)
   - IP telefon detayı → CallerID gerçek tetikleyici
4. **Production deploy öncesi:**
   - Custom domain (opsiyonel)
   - Firebase Hosting deploy (`firebase deploy --only hosting`)
   - Release APK + signing (production keystore)
   - Test suite kurulumu (Playwright + Vitest)

---

## 8. Son Commit'ler (özet)

```
a57bbcb Faz 10 final: Sayım modu + Reçete bazlı stok
ad26b20 Faz 10 başlangıç: Stok hareketleri + Tedarikçiler + Finans
d44b8db Sadeleştir: ara durum (Hazırlandı / Masaya Gitti) kaldırıldı
ce55107 Faz 8 (kısmi): Manuel paket sipariş + CallerID iskeleti
a754efb Faz 9: QR Menü iyileştirme — admin QR üretici + PWA
f42d2bd Faz 7: Kampanya + Kupon sistemi
092e97e Settings ekranı + Faz 5: Orders, Archive, Notifications
a6f993c Faz 6: Raporlama — recharts grafikleri + Excel export
318ff49 Yarım porsiyon desteği + mutfak adisyonu fişi
339eee9 Fix: doğru iMin Printer SDK'sı (IminPrinterLibrary)
664fd5f iMin termal yazıcı Capacitor plugin entegrasyonu
cefcdb7 Faz 3: Masa Yönetimi, Birleştirme, Dekorlar, Kişi Sayısı, Rezervasyon
bc1b8bd Add Capacitor Android platform and GitHub Actions APK build
```
