/**
 * Alazlı Konya Mutfağı menü içeriği (PDF'ten çıkarılmış).
 *
 * Yapı:
 *   categories: [{ slug, ad, en, ar, sira, gorsel? }]
 *   products:   [{ slug, ad, en, ar, aciklama?, fiyat, kategori, sira, gorsel? }]
 *
 * gorsel alanı: hosting'den servis edilen yol (örn. /menu-imgs/p03-i02.png).
 * Cloud Function bunu kullanarak Firestore'a yazar.
 */

export const CATEGORIES = [
  { slug: 'kahvalti',         ad: 'Kahvaltı',          en: 'Breakfast',             ar: 'فطور',                 sira: 1 },
  { slug: 'corbalar',         ad: 'Çorbalar',          en: 'Soups',                 ar: 'الشوربات',             sira: 2 },
  { slug: 'ara-sicaklar',     ad: 'Ara Sıcaklar',      en: 'Starters',              ar: 'مقبلات ساخنة',         sira: 3 },
  { slug: 'salatalar',        ad: 'Salatalar',         en: 'Salads',                ar: 'السلطات',              sira: 4 },
  { slug: 'pideler',          ad: 'Pideler',           en: 'Flat Bread',            ar: 'البيد (الفطائر)',      sira: 5 },
  { slug: 'yoresel',          ad: 'Yöresel Lezzetler', en: 'Regional Specialties',  ar: 'الأطباق المحلية',      sira: 6 },
  { slug: 'alazli-special',   ad: 'Alazlı Special',    en: 'Alazlı Special',        ar: 'ألازلي سبيشال',        sira: 7 },
  { slug: 'tatlilar',         ad: 'Tatlılar',          en: 'Desserts',              ar: 'الحلويات',             sira: 8 },
  { slug: 'icecekler',        ad: 'İçecekler',         en: 'Drinks',                ar: 'المشروبات',            sira: 9 },
];

// İçindekiler/açıklama metinleri uzun olanlar için yardımcı
const KOY_KAHVALTI_TR = '4 çeşit peynir, 2 çeşit zeytin, 3 çeşit organik Konya reçelleri, Tahin-Pekmez, Bal-Kaymak, Acuka. Özel sıcaklar: Sıkma (Peynirli), Sündürme, Pişi, Sahanda Yumurta (Sucuklu veya Sade), Patates Kızartması. Taze sebzeler ve mezeler dahil. Meyve tabağı. Hafta içi kahve ikramımız vardır.';
const KOY_KAHVALTI_EN = '4 kinds of cheese, 2 kinds of olives, 3 organic Konya jams, tahini-molasses, honey-clotted cream, acuka. Hot specialties: sıkma, sündürme, pişi, pan-fried eggs (with sucuk or plain), fries. Fresh vegetables and mezes. Fruit plate. Complimentary coffee on weekdays.';
const KOY_KAHVALTI_AR = '4 أنواع من الجبن، نوعان من الزيتون، 3 أنواع من المربى العضوي من قونيا، طحينة بدبس، عسل بقشطة، أجوكا. أطباق ساخنة: صكمة، سوندورمه، بيشي، بيض مقلي (مع سجق أو سادة)، بطاطس مقلية. خضروات طازجة ومقبلات. طبق فاكهة. قهوة مجانية في أيام الأسبوع.';

export const PRODUCTS = [
  // ───────── KAHVALTI ─────────
  { slug: 'koy-kahvaltisi', kategori: 'kahvalti', sira: 1, ad: 'Köy Kahvaltısı', en: 'Village Breakfast (per person)', ar: 'فطور القرية (للشخص)', fiyat: 480, aciklama: KOY_KAHVALTI_TR, aciklamaEn: KOY_KAHVALTI_EN, aciklamaAr: KOY_KAHVALTI_AR, gorsel: '/menu-imgs/koy-kahvaltisi.png' },
  { slug: 'kahvalti-tepsisi', kategori: 'kahvalti', sira: 2, ad: 'Kahvaltı Tepsisi', en: 'Breakfast Tray', ar: 'صينية الفطور', fiyat: 380, gorsel: '/menu-imgs/kahvalti-tepsisi.png' },
  { slug: 'sahanda-yumurta', kategori: 'kahvalti', sira: 3, ad: 'Sahanda Yumurta', en: 'Pan-fried Eggs', ar: 'بيض مقلي', fiyat: 240, gorsel: '/menu-imgs/sahanda-yumurta.png' },
  { slug: 'menemen', kategori: 'kahvalti', sira: 4, ad: 'Menemen', en: 'Menemen (Turkish scrambled eggs)', ar: 'منمن', fiyat: 300, gorsel: '/menu-imgs/menemen.png' },
  { slug: 'mihlama', kategori: 'kahvalti', sira: 5, ad: 'Mıhlama', en: 'Mıhlama (cheese fondue)', ar: 'مهلمة (جبن ذائب)', fiyat: 300, gorsel: '/menu-imgs/mihlama.png' },
  { slug: 'kavurmali-yumurta', kategori: 'kahvalti', sira: 6, ad: 'Kavurmalı Yumurta', en: 'Eggs with Confit Meat', ar: 'بيض مع لحم مكاورمة', fiyat: 330, gorsel: '/menu-imgs/kavurmali-yumurta.png' },
  { slug: 'konya-yag-somunu', kategori: 'kahvalti', sira: 7, ad: 'Konya Yağ Somunu', en: 'Konya Butter Loaf', ar: 'خبز كونيا بالزبدة', fiyat: 300, gorsel: '/menu-imgs/konya-yag-somunu.png' },
  { slug: 'sucuklu-yumurta', kategori: 'kahvalti', sira: 8, ad: 'Sucuklu Yumurta', en: 'Eggs with Sucuk', ar: 'بيض مع سجق', fiyat: 320, gorsel: '/menu-imgs/sucuklu-yumurta.png' },

  // ───────── ÇORBALAR ─────────
  { slug: 'tereyagli-mercimek-corbasi', kategori: 'corbalar', sira: 1, ad: 'Tereyağlı Mercimek Çorbası', en: 'Buttered Lentil Soup', ar: 'شوربة العدس بالزبدة', fiyat: 150, gorsel: '/menu-imgs/mercimek-corbasi.png' },
  { slug: 'tavuksuyu-corbasi', kategori: 'corbalar', sira: 2, ad: 'Tavuksuyu Çorbası', en: 'Chicken Soup', ar: 'شوربة الدجاج', fiyat: 170 },
  { slug: 'arabasi-corbasi', kategori: 'corbalar', sira: 3, ad: 'Arabaşı Çorbası', en: 'Arabaşı Soup', ar: 'شوربة أراباشي', fiyat: 200, gorsel: '/menu-imgs/arabasi-corbasi.png' },
  { slug: 'bamya-corbasi', kategori: 'corbalar', sira: 4, ad: 'Bamya Çorbası', en: 'Okra Soup', ar: 'شوربة البامية', fiyat: 280 },

  // ───────── ARA SICAKLAR ─────────
  { slug: 'sundurme', kategori: 'ara-sicaklar', sira: 1, ad: 'Sündürme', en: 'Sündürme', ar: 'سوندورمه', fiyat: 250, gorsel: '/menu-imgs/sundurme.png' },
  { slug: 'sikma-peynirli', kategori: 'ara-sicaklar', sira: 2, ad: 'Sıkma (Peynirli)', en: 'Sıkma (with cheese)', ar: 'صكمة بالجبن', fiyat: 300, gorsel: '/menu-imgs/sikma-peynirli.png' },
  { slug: 'icli-kofte', kategori: 'ara-sicaklar', sira: 3, ad: 'İçli Köfte', en: 'Stuffed Bulgur Meatballs', ar: 'كبة', fiyat: 120, gorsel: '/menu-imgs/icli-kofte.png' },
  { slug: 'cig-kofte', kategori: 'ara-sicaklar', sira: 4, ad: 'Çiğ Köfte', en: 'Raw Meatballs (Turkish steak tartare)', ar: 'تشي كفتة', fiyat: 200, gorsel: '/menu-imgs/cig-kofte.png' },
  { slug: 'patates-kizartmasi', kategori: 'ara-sicaklar', sira: 5, ad: 'Patates Kızartması', en: 'French Fries', ar: 'بطاطس مقلية', fiyat: 120 },

  // ───────── SALATALAR ─────────
  { slug: 'mevsim-salata', kategori: 'salatalar', sira: 1, ad: 'Mevsim Salata', en: 'Seasonal Salad', ar: 'سلطة موسمية', fiyat: 200 },
  { slug: 'coban-salata', kategori: 'salatalar', sira: 2, ad: 'Çoban Salata', en: "Shepherd's Salad", ar: 'سلطة الراعي', fiyat: 230 },
  { slug: 'cevizli-salata', kategori: 'salatalar', sira: 3, ad: 'Cevizli Salata', en: 'Walnut Salad', ar: 'سلطة الجوز', fiyat: 270 },

  // ───────── PİDELER ─────────
  { slug: 'etli-ekmek', kategori: 'pideler', sira: 1, ad: 'Etli Ekmek', en: 'Konya-style Meat Bread', ar: 'خبز كونيا باللحم', fiyat: 380, gorsel: '/menu-imgs/etli-ekmek.png' },
  { slug: 'kiymali-peynirli-mevlana', kategori: 'pideler', sira: 2, ad: 'Kıymalı Peynirli (Mevlana)', en: 'Minced Meat & Cheese Pide (Mevlana)', ar: 'بيدا باللحم المفروم والجبن (مولانا)', fiyat: 420 },
  { slug: 'peynirli-pide', kategori: 'pideler', sira: 3, ad: 'Peynirli Pide', en: 'Cheese Pide', ar: 'بيدا بالجبن', fiyat: 380 },
  { slug: 'peynirli-yumurtali-pide', kategori: 'pideler', sira: 4, ad: 'Peynirli Yumurtalı Pide', en: 'Cheese & Egg Pide', ar: 'بيدا بالجبن والبيض', fiyat: 410 },
  { slug: 'bicak-arasi', kategori: 'pideler', sira: 5, ad: 'Bıçak Arası', en: 'Bıçak Arası (cubed meat pide)', ar: 'بيدا بقطع اللحم', fiyat: 490, gorsel: '/menu-imgs/bicak-arasi.png' },
  { slug: 'bicak-arasi-peynirli', kategori: 'pideler', sira: 6, ad: 'Bıçak Arası Peynirli', en: 'Bıçak Arası with Cheese', ar: 'بيدا بقطع اللحم والجبن', fiyat: 530 },
  { slug: 'bicak-arasi-yumurtali', kategori: 'pideler', sira: 7, ad: 'Bıçak Arası Yumurtalı', en: 'Bıçak Arası with Egg', ar: 'بيدا بقطع اللحم والبيض', fiyat: 530 },
  { slug: 'bicak-arasi-peynirli-yumurtali', kategori: 'pideler', sira: 8, ad: 'Bıçak Arası Peynirli Yumurtalı', en: 'Bıçak Arası with Cheese & Egg', ar: 'بيدا بقطع اللحم والجبن والبيض', fiyat: 550 },
  { slug: 'sebzeli-pide-peynirli', kategori: 'pideler', sira: 9, ad: 'Sebzeli Pide Peynirli', en: 'Vegetable Pide with Cheese', ar: 'بيدا بالخضار والجبن', fiyat: 450 },
  { slug: 'sebzeli-pide-peynirli-yumurtali', kategori: 'pideler', sira: 10, ad: 'Sebzeli Pide Peynirli Yumurtalı', en: 'Vegetable Pide with Cheese & Egg', ar: 'بيدا بالخضار والجبن والبيض', fiyat: 480 },
  { slug: 'sucuklu-peynirli-pide', kategori: 'pideler', sira: 11, ad: 'Sucuklu Peynirli Pide', en: 'Sucuk & Cheese Pide', ar: 'بيدا بالسجق والجبن', fiyat: 560 },
  { slug: 'sucuklu-peynirli-yumurtali-pide', kategori: 'pideler', sira: 12, ad: 'Sucuklu Peynirli Yumurtalı Pide', en: 'Sucuk, Cheese & Egg Pide', ar: 'بيدا بالسجق والجبن والبيض', fiyat: 580 },
  { slug: 'kavurmali-peynirli-pide', kategori: 'pideler', sira: 13, ad: 'Kavurmalı Peynirli Pide', en: 'Confit Meat & Cheese Pide', ar: 'بيدا باللحم المكاورمة والجبن', fiyat: 610 },
  { slug: 'kavurmali-peynirli-yumurtali-pide', kategori: 'pideler', sira: 14, ad: 'Kavurmalı Peynirli Yumurtalı Pide', en: 'Confit Meat, Cheese & Egg Pide', ar: 'بيدا باللحم المكاورمة والجبن والبيض', fiyat: 640 },
  { slug: 'karisik-pide', kategori: 'pideler', sira: 15, ad: 'Karışık Pide', en: 'Mixed Pide', ar: 'بيدا مشكلة', fiyat: 750 },

  // ───────── YÖRESEL LEZZETLER ─────────
  { slug: 'konya-firin-kebap-250', kategori: 'yoresel', sira: 1, ad: 'Konya Fırın Kebap (250 gr)', en: 'Konya Oven Kebab (250g)', ar: 'كباب فرن كونيا (250 جرام)', fiyat: 720, gorsel: '/menu-imgs/konya-firin-kebap.png' },
  { slug: 'konya-firin-kebap-500', kategori: 'yoresel', sira: 2, ad: 'Konya Fırın Kebap (500 gr)', en: 'Konya Oven Kebab (500g)', ar: 'كباب فرن كونيا (500 جرام)', fiyat: 1440, gorsel: '/menu-imgs/konya-firin-kebap.png' },
  { slug: 'konya-firin-kebap-750', kategori: 'yoresel', sira: 3, ad: 'Konya Fırın Kebap (750 gr)', en: 'Konya Oven Kebab (750g)', ar: 'كباب فرن كونيا (750 جرام)', fiyat: 2100, gorsel: '/menu-imgs/konya-firin-kebap.png' },
  { slug: 'konya-firin-kebap-1kg', kategori: 'yoresel', sira: 4, ad: 'Konya Fırın Kebap (1 kg)', en: 'Konya Oven Kebab (1 kg)', ar: 'كباب فرن كونيا (1 كجم)', fiyat: 2800, gorsel: '/menu-imgs/konya-firin-kebap.png' },
  { slug: 'tavuk-pirzola', kategori: 'yoresel', sira: 5, ad: 'Tavuk Pirzola (320 gr)', en: 'Chicken Chops (320g)', ar: 'بيتزولا الدجاج (320 جرام)', fiyat: 380 },
  { slug: 'tavuk-sis', kategori: 'yoresel', sira: 6, ad: 'Tavuk Şiş (250 gr)', en: 'Chicken Shish (250g)', ar: 'شيش الدجاج (250 جرام)', fiyat: 380 },
  { slug: 'sac-kavurma-kuzu', kategori: 'yoresel', sira: 7, ad: 'Sac Kavurma (Kuzu)', en: 'Sac Kavurma with Lamb', ar: 'صاج كاورمة بلحم الخروف', fiyat: 720, gorsel: '/menu-imgs/sac-kavurma-kuzu.png' },
  { slug: 'konya-usulu-tirit', kategori: 'yoresel', sira: 8, ad: 'Konya Usulü Tirit', en: 'Konya-style Tirit', ar: 'تيريت على طريقة كونيا', fiyat: 720, gorsel: '/menu-imgs/konya-usulu-tirit.png' },

  // ───────── ALAZLI SPECIAL ─────────
  { slug: 'alazli-special-1', kategori: 'alazli-special', sira: 1, ad: 'Alazlı Special (1 kişilik)', en: 'Alazlı Special (1 person)', ar: 'ألازلي سبيشال (شخص واحد)', fiyat: 1600, gorsel: '/menu-imgs/alazli-special.png' },
  { slug: 'alazli-special-2', kategori: 'alazli-special', sira: 2, ad: 'Alazlı Special (2 kişilik - Tepsi)', en: 'Alazlı Special (2 people - Tray)', ar: 'ألازلي سبيشال (شخصان - صينية)', fiyat: 2200, gorsel: '/menu-imgs/alazli-special.png' },
  { slug: 'alazli-special-3', kategori: 'alazli-special', sira: 3, ad: 'Alazlı Special (3 kişilik - Tepsi)', en: 'Alazlı Special (3 people - Tray)', ar: 'ألازلي سبيشال (3 أشخاص - صينية)', fiyat: 2700, gorsel: '/menu-imgs/alazli-special.png' },
  { slug: 'alazli-special-4', kategori: 'alazli-special', sira: 4, ad: 'Alazlı Special (4 kişilik - Tepsi)', en: 'Alazlı Special (4 people - Tray)', ar: 'ألازلي سبيشال (4 أشخاص - صينية)', fiyat: 2800, gorsel: '/menu-imgs/alazli-special.png' },

  // ───────── TATLILAR ─────────
  { slug: 'firin-sutlac', kategori: 'tatlilar', sira: 1, ad: 'Fırın Sütlaç', en: 'Baked Rice Pudding', ar: 'أرز بالحليب مخبوز', fiyat: 180 },
  { slug: 'sac-arasi-tatlisi', kategori: 'tatlilar', sira: 2, ad: 'Sac Arası Tatlısı', en: 'Sac Arası Dessert', ar: 'حلوى صاج آراسي', fiyat: 280, gorsel: '/menu-imgs/sac-arasi-tatlisi.png' },
  { slug: 'sac-arasi-kaymakli', kategori: 'tatlilar', sira: 3, ad: 'Sac Arası Kaymaklı', en: 'Sac Arası with Clotted Cream', ar: 'صاج آراسي مع قشدة', fiyat: 320, gorsel: '/menu-imgs/sac-arasi-tatlisi.png' },
  { slug: 'sac-arasi-dondurmali', kategori: 'tatlilar', sira: 4, ad: 'Sac Arası Dondurmalı', en: 'Sac Arası with Ice Cream', ar: 'صاج آراسي مع بوظة', fiyat: 320, gorsel: '/menu-imgs/sac-arasi-tatlisi.png' },
  { slug: 'kunefe', kategori: 'tatlilar', sira: 5, ad: 'Künefe', en: 'Künefe', ar: 'كنافة', fiyat: 320, gorsel: '/menu-imgs/kunefe.png' },
  { slug: 'kunefe-kaymakli', kategori: 'tatlilar', sira: 6, ad: 'Künefe Kaymaklı', en: 'Künefe with Clotted Cream', ar: 'كنافة مع قشدة', fiyat: 350, gorsel: '/menu-imgs/kunefe.png' },
  { slug: 'kadayif', kategori: 'tatlilar', sira: 7, ad: 'Kadayıf', en: 'Kadayıf', ar: 'كنافة شعرية', fiyat: 180, gorsel: '/menu-imgs/kadayif.png' },
  { slug: 'kabak-tatlisi', kategori: 'tatlilar', sira: 8, ad: 'Kabak Tatlısı', en: 'Oven-Baked Pumpkin in Syrup', ar: 'حلوى القرع المخبوزة', fiyat: 180 },

  // ───────── İÇECEKLER ─────────
  { slug: 'ayran', kategori: 'icecekler', sira: 1, ad: 'Ayran (300 ml)', en: 'Ayran (Buttermilk Drink) 300 ml', ar: 'أيران 300 مل', fiyat: 70 },
  { slug: 'kutu-mesrubat', kategori: 'icecekler', sira: 2, ad: 'Kutu Meşrubat (330 ml)', en: 'Canned Soft Drink 330 ml', ar: 'مشروب غازي معلب 330 مل', fiyat: 80 },
  { slug: 'salgam', kategori: 'icecekler', sira: 3, ad: 'Şalgam (300 ml)', en: 'Şalgam (Fermented Turnip Juice) 300 ml', ar: 'عصير الشلغم 300 مل', fiyat: 80 },
  { slug: 'portakal-suyu', kategori: 'icecekler', sira: 4, ad: 'Portakal Suyu (300 ml)', en: 'Orange Juice 300 ml', ar: 'عصير برتقال 300 مل', fiyat: 150, gorsel: '/menu-imgs/portakal-suyu.png' },
  { slug: 'nar-suyu', kategori: 'icecekler', sira: 5, ad: 'Nar Suyu (300 ml)', en: 'Pomegranate Juice 300 ml', ar: 'عصير الرمان 300 مل', fiyat: 170, gorsel: '/menu-imgs/nar-suyu.png' },
  { slug: 'soda', kategori: 'icecekler', sira: 6, ad: 'Soda (200 ml)', en: 'Soda Water 200 ml', ar: 'صودا 200 مل', fiyat: 50 },
  { slug: 'su', kategori: 'icecekler', sira: 7, ad: 'Su (330 ml)', en: 'Water 330 ml', ar: 'ماء 330 مل', fiyat: 40 },
];
