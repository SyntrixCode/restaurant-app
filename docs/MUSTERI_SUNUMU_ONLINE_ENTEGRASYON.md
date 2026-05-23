# Online Sipariş Otomasyonu — Müşteri Sunumu

**Hazırlayan:** SyntrixOps
**Tarih:** 2026-05-23
**Hedef müşteri:** Online platformlardan (Yemeksepeti, Getir Yemek, Trendyol GO, Migros Yemek) sipariş alan restoranlar

---

## 🎯 Sorun

Şu an restoranınızda **online platformlardan gelen siparişler** nasıl işleniyor?

❌ Yemeksepeti'nden bir bildirim geliyor → personel tabletten okuyor
❌ Aynı anda Getir'den arama geliyor → telefon kayboluyor
❌ Personel siparişi POS'a **elle giriyor** (ürün ürün, müşteri bilgisi, adres)
❌ Hata payı yüksek (yanlış ürün, yanlış adres, eksik not)
❌ "Hazırlanıyor" / "Yola çıktı" durumlarını **uygulamalarda da ayrıca güncellemek** gerekiyor → unutuluyor → müşteri şikayeti

**Yoğun bir Cuma akşamı:**
- 30 sipariş geliyor → 4 farklı uygulamadan
- Personel 30 × ~2 dakika = **1 saat** sadece veri girişiyle uğraşıyor
- Hata oranı sektör ortalaması %5-8 → 30 siparişten 2 sipariş yanlış teslim
- Yanlış siparişin maliyeti: ürün iadesi + müşteri kaybı + kötü yorum

---

## ✅ Çözüm — Tek POS, Tüm Platformlar

Restoran POS sistemimize **Online Sipariş Otomasyonu** modülünü ekliyoruz.

### Nasıl çalışır?

```
┌─────────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐
│ Yemeksepeti │  │  Getir   │  │ Trendyol  │  │ Migros │
└──────┬──────┘  └────┬─────┘  └─────┬─────┘  └───┬────┘
       └────────────┬─┴──────────────┴─────────────┘
                    ▼
          ┌──────────────────┐
          │   Posentegra     │  ← Tek API ile 4 platformu birleştirir
          └─────────┬────────┘
                    ▼
          ┌──────────────────┐
          │  Restoran POS    │  ← Tablet/cihazınız
          │  (otomatik)      │
          └──────────────────┘
```

### Neler değişir?

| Önce (manuel) | Sonra (otomatik) |
|---|---|
| Personel siparişi elle giriyor | **Sipariş kendiliğinden POS'a düşer** |
| Mutfak fişi sonra basılıyor | Sipariş geldiği an **otomatik mutfak fişi** |
| "Hazırlanıyor" güncellemesi unutuluyor | Tek tıkla "Yola Çıkar" → 4 platforma anlık iletilir |
| Yanlış ürün/adres riski | Sıfır manuel veri girişi → sıfır hata |
| Personel siparişten siparişe koşuyor | Personel sadece **hazırlamaya** odaklanıyor |

---

## 💰 Maliyet

### Restoran tarafı (aylık)

| Paket | Aylık (USD) | Yıllık Ödeme (Aylık karşılığı) | Kapsam |
|---|---|---|---|
| **Entegrasyon Paketi** | $9.99 | ~$4/ay (₺160) | 4 platform giriş seviyesi |
| **3'lü Paket** | $13.99 | ~$5.6/ay (₺224) | YS + Getir + Trendyol |
| **4'lü Paket** ⭐ | $15.99 | ~$6.4/ay (₺256) | **Tüm 4 platform** (önerilen) |

> 💡 Yıllık ödemede **~%60 indirim**. 4'lü paketin yıllık ödemesi ~3.000 ₺ (aylık 256 ₺'ye denk).

### SyntrixOps tarafı (kurulum + bakım)

| Kalem | Bedel | Tip |
|---|---|---|
| **Kurulum + entegrasyon** | **2.500 ₺ + KDV** | Tek seferlik |
| **Aylık bakım + destek** | Mevcut POS aboneliğine dahil | — |

Kurulum ücreti şunları kapsar:
- Posentegra hesap kurulumu (sizin adınıza)
- 4 platforma API bağlantısı
- POS sisteminize entegrasyon
- Personel eğitimi (2 saat)
- 30 gün ücretsiz teknik destek
- Test siparişleri (her platformdan en az 1)

### Toplam Yıllık Maliyet (örnek: 4'lü Paket)

| Yıl 1 | Yıl 2+ |
|---|---|
| Kurulum: ₺2.500 | — |
| Posentegra (yıllık): ₺3.000 | Posentegra (yıllık): ₺3.000 |
| **Toplam: ₺5.500** | **Toplam: ₺3.000/yıl** |

---

## 📊 ROI Hesabı

### Senaryo: Orta hacimli restoran (günde 30 online sipariş)

**Mevcut maliyet (manuel):**
- Personel zamanı: 30 sipariş × 2 dk = 1 saat/gün
- Aylık personel maliyeti: 30 saat × 80 ₺/saat = **₺2.400/ay**
- Hata kaynaklı kayıp: 2 yanlış sipariş/gün × 100 ₺ × 30 gün = **₺6.000/ay**
- **Toplam aylık kayıp: ₺8.400**

**Otomasyon sonrası:**
- Posentegra: ₺256/ay
- Personel zamanı: ~5 dk/gün (sadece kontrol) = ₺200/ay
- Hata oranı: sıfıra yakın
- **Toplam aylık maliyet: ₺456**

**Aylık net tasarruf: ₺7.944**
**Kurulum geri ödeme süresi: 10 gün**
**Yıllık net tasarruf: ~₺95.000**

---

## 🎁 Sistem İçinde Ekstra Özellikler

Online entegrasyon modülü ile birlikte gelen ek özellikler:

✅ **Otomatik mutfak fişi** — sipariş geldiği an termal yazıcıdan çıkar
✅ **Müşteri telefon defteri** — geçmiş siparişlerden müşteri bilgisi otomatik
✅ **Platforma göre raporlama** — "Hangi platformda en çok satıyoruz?" sorusu cevaplanır
✅ **Kurye gönderim takibi** — "Yola çıktı" butonu tek tıkla tüm platformlara iletir
✅ **App üzerinden ödeme bilgisi** — Yemeksepeti'nden ödenmiş siparişler otomatik arşivlenir, kasa sıkıntısı yok
✅ **Stok senkronizasyonu** — ürün biterse 4 platforma anlık "tükendi" bildirimi
✅ **Menü senkronizasyonu** — fiyat değişikliği tek yerden yapılır, 4 platformda güncellenir

---

## ⏱️ Uygulama Takvimi

| Gün | Aşama |
|---|---|
| **1. gün** | Sözleşme + Posentegra hesap başvurusu |
| **2-3. gün** | Posentegra API anahtarları gelir, ayarlar yapılır |
| **4-5. gün** | Her platform için test siparişi (Yemeksepeti, Getir, Trendyol, Migros) |
| **6. gün** | Personel eğitimi + canlı kullanım |
| **7-30. gün** | İlk ay yakın takip, sorun varsa anında müdahale |

**Toplam:** 1 hafta içinde canlıya geçiş.

---

## 🛡️ Garanti ve Destek

- **30 gün koşulsuz para iadesi** — Posentegra entegrasyonu beklediğiniz gibi çalışmazsa kurulum ücreti iade
- **7/24 teknik destek** — WhatsApp veya telefon üzerinden
- **Posentegra Türkçe destek** — sözleşme uyuşmazlıklarında aracılık ederiz
- **Veri güvenliği** — KVKK uyumlu, müşteri verisi sadece sizin POS'unuzda saklanır

---

## ❓ Sıkça Sorulan Sorular

### "Posentegra aboneliğini ben mi öderim?"
Evet, doğrudan kendi adınıza abone olursunuz. Aylık veya yıllık seçim sizde. SyntrixOps olarak sadece teknik entegrasyon ücretini alırız.

### "Aboneliği iptal edersem POS çalışır mı?"
Evet. Online sipariş özelliği durur ama POS'un tüm diğer fonksiyonları (masa, kasa, ödeme, raporlar) çalışmaya devam eder. Tekrar abone olursanız 1 saatte yeniden aktif olur.

### "Sipariş kaybı olur mu?"
Hayır. Posentegra siparişleri 7 gün arşivler. Geçici internet kesintilerinde sipariş Posentegra'da bekler, internet gelince POS'a düşer.

### "Birden fazla şubem var, hepsi tek aboneliğe sığar mı?"
Evet. Posentegra aboneliği **sınırsız restoran** kapsar (4'lü paket için). Her şubenin ayrı POS cihazı olsa bile tek abonelik yeterli.

### "Ben kendi sitemi açtım, oradan da sipariş geliyor. Bağlanır mı?"
Posentegra şu an sadece 4 büyük platforma odaklı. Kendi sitenizi entegre etmek için ayrı bir paket konuşulabilir (ek modül olarak fiyatlandırılır).

### "Yemeksepeti / Getir bizden ek ücret alıyor mu Posentegra için?"
Hayır. Posentegra arka planda çalışan bir entegratör. Yemeksepeti / Getir / Trendyol size her zamanki komisyonlarını uygular (~%15-25). Posentegra ek komisyon almaz, sadece sabit abonelik.

### "POS abonelik ücreti ile bu fiyat aynı mı?"
Hayır, **ayrı**. POS sistemimizin temel aboneliği aylık [X] ₺. Online entegrasyon modülü ile birlikte toplam aylık [X + Posentegra abonelik] ₺ olur.

---

## 📞 Sonraki Adım

Bu sunum size uygun görünüyorsa:

1. **Karar verin:** Hangi paket (4'lü önerilen) + ödeme şekli (aylık / yıllık)
2. **Sözleşme imzala** (PDF + e-imza)
3. **Posentegra başvurusu** — biz sizin adınıza yapıyoruz
4. **1 hafta içinde aktif**

📞 **İletişim:**
- Telefon: [Senin telefon]
- E-posta: [Senin email]
- WhatsApp: [WhatsApp linki]

---

## 📎 Ek 1 — Teknik Detaylar (geliştirici/yetkili için)

### Veri Akışı

1. Müşteri Yemeksepeti uygulamasından sipariş verir
2. Yemeksepeti → Posentegra webhook (HTTPS POST)
3. Posentegra → SyntrixOps Worker (relay)
4. Worker → Firebase Firestore (siparişi yazar)
5. Restoran POS tablet → Firestore realtime listener (siparişi alır)
6. Mutfak adisyonu termal yazıcıdan otomatik çıkar
7. Garson "Yola Çıkar" der → status update → Posentegra → Yemeksepeti
8. Müşteri uygulamada "Yola çıktı" bildirimi alır

### Güvenlik

- TLS 1.2+ tüm bağlantılarda
- API key Firestore'da AES şifrelenmiş (sadece admin görür)
- IP whitelist Posentegra → Worker (Cloudflare Access)
- KVKK uyumlu veri saklama

### Yedekleme

- Tüm siparişler 90 gün archivedOrders'da
- Excel/CSV export her zaman mümkün
- Veri kaybı senaryosunda Posentegra arşivinden re-fetch

---

**Son söz:** Bu modül "olabilirse iyi olur" değil, yoğun restoranlar için bir gerekliliktir. Personel zaman tasarrufu + hata azalması + müşteri memnuniyeti birlikte değerlendirildiğinde 2 hafta içinde kendini amorti eder.

Karar size kalmış. Sorularınız varsa hemen arayın. ☎️
