/**
 * Tüm kategori + ürünlerin TR adlarını/açıklamalarını EN ve AR'a çevirir,
 * `ceviri.en.ad`, `ceviri.en.aciklama`, `ceviri.ar.ad`, `ceviri.ar.aciklama`
 * alanlarına yazar. localized() menü ekranında bunları okuyup TR'ye düşer.
 *
 * Strateji:
 *  1) Yerleşik Konya/Türk yemek sözlüğü (doğruluk için) — sırada öncelikli
 *  2) Bilinmeyenler için Google Translate ücretsiz uç noktası (anahtar gerektirmez)
 *
 * Çalıştırma:
 *   1. Firebase Console → Project Settings → Service Accounts →
 *      "Generate new private key" indir
 *   2. İndirilen JSON'u proje köküne `service-account.json` adıyla kaydet
 *   3. node scripts/translate-menu.mjs              # uygula
 *      node scripts/translate-menu.mjs --dry-run    # önizle (yazma yok)
 *      node scripts/translate-menu.mjs --force      # mevcut çevirileri ezer
 *   4. Bitince güvenlik için service-account.json'ı sil
 *
 * Notlar:
 *  - Mevcut çeviri varsa (en.ad doluysa) atlanır — yeniden çalıştırmak güvenli
 *  - Yanlış çıkan tek tek çeviri admin panel → Ürünler → "Çeviriler (QR menü)"
 *    bölümünden elle düzeltilebilir
 */
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

const KEY_PATH = process.env.SERVICE_ACCOUNT_PATH || 'service-account.json';
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

if (!existsSync(KEY_PATH)) {
  console.error(`
✗ ${KEY_PATH} bulunamadı.

Nasıl alınır (30 saniye):
  1. https://console.firebase.google.com/project/alazligida-e77b9/settings/serviceaccounts/adminsdk
  2. "Generate new private key" → indir
  3. İndirilen dosyayı projede ${KEY_PATH} adıyla kaydet
  4. Bu komutu tekrar çalıştır
  5. İşlem bitince güvenlik için ${KEY_PATH} dosyasını sil
`);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) });
const db = admin.firestore();

// ── Konya/Türk yemek sözlüğü — anahtarlar küçük harf, boşluk normalleştirilmiş
const DICT = {
  // Kahvaltı
  'menemen': { en: 'Menemen (Turkish scrambled eggs)', ar: 'منمن (بيض مخفوق بالطماطم)' },
  'serpme kahvaltı': { en: 'Traditional Turkish breakfast platter', ar: 'فطور تركي تقليدي شامل' },
  'kahvaltı tabağı': { en: 'Breakfast plate', ar: 'طبق فطور' },
  'omlet': { en: 'Omelette', ar: 'عجة' },
  'sucuklu yumurta': { en: 'Eggs with sucuk', ar: 'بيض مع سجق' },
  'sahanda yumurta': { en: 'Pan-fried eggs', ar: 'بيض مقلي' },
  'kaymak': { en: 'Clotted cream', ar: 'قشدة' },
  'bal': { en: 'Honey', ar: 'عسل' },
  'reçel': { en: 'Jam', ar: 'مربى' },
  'zeytin': { en: 'Olives', ar: 'زيتون' },

  // Pide
  'pide': { en: 'Pide (Turkish flatbread)', ar: 'بيدا تركية' },
  'karışık pide': { en: 'Mixed pide', ar: 'بيدا مشكلة' },
  'kıymalı pide': { en: 'Minced meat pide', ar: 'بيدا باللحم المفروم' },
  'kuşbaşılı pide': { en: 'Cubed beef pide', ar: 'بيدا بقطع اللحم' },
  'kuşbaşı pide': { en: 'Cubed beef pide', ar: 'بيدا بقطع اللحم' },
  'kaşarlı pide': { en: 'Cheese pide', ar: 'بيدا بالجبن' },
  'sucuklu pide': { en: 'Pide with sucuk', ar: 'بيدا بالسجق' },
  'peynirli pide': { en: 'Cheese pide', ar: 'بيدا بالجبنة' },
  'ıspanaklı pide': { en: 'Spinach pide', ar: 'بيدا بالسبانخ' },
  'pastırmalı pide': { en: 'Pastrami pide', ar: 'بيدا بالبسطرمة' },
  'yumurtalı pide': { en: 'Pide with egg', ar: 'بيدا بالبيض' },

  // Etli ekmek / Konya
  'etli ekmek': { en: 'Konya-style meat bread (Etli Ekmek)', ar: 'خبز كونيا باللحم' },
  'fırın kebabı': { en: 'Oven kebab (Konya style)', ar: 'كباب الفرن (على طريقة كونيا)' },
  'tirit': { en: 'Tirit (bread soaked in broth)', ar: 'تيريت (خبز بمرق اللحم)' },

  // Kebap / et
  'cağ kebabı': { en: 'Cag kebab (horizontal-spit lamb)', ar: 'كباب جاغ' },
  'cağ çökertme': { en: 'Cag kebab – Çökertme style', ar: 'كباب جاغ بطريقة شوكرتمي' },
  'çökertme': { en: 'Çökertme kebab', ar: 'كباب شوكرتمي' },
  'çökertme kebabı': { en: 'Çökertme kebab', ar: 'كباب شوكرتمي' },
  'adana kebap': { en: 'Adana kebab (spicy minced meat)', ar: 'كباب أضنة (لحم مفروم حار)' },
  'adana': { en: 'Adana kebab', ar: 'أضنة' },
  'urfa kebap': { en: 'Urfa kebab (mild minced meat)', ar: 'كباب أورفا' },
  'urfa': { en: 'Urfa kebab', ar: 'أورفا' },
  'şiş kebap': { en: 'Shish kebab', ar: 'كباب الشيش' },
  'şiş': { en: 'Shish (skewered grill)', ar: 'شيش' },
  'tavuk şiş': { en: 'Chicken shish kebab', ar: 'شيش الدجاج' },
  'kuzu şiş': { en: 'Lamb shish kebab', ar: 'شيش الخروف' },
  'beyti': { en: 'Beyti kebab', ar: 'كباب بيتي' },
  'iskender': { en: 'İskender kebab', ar: 'إسكندر كباب' },
  'iskender kebap': { en: 'İskender kebab', ar: 'إسكندر كباب' },
  'döner': { en: 'Döner', ar: 'دونر' },
  'tavuk döner': { en: 'Chicken döner', ar: 'دونر الدجاج' },
  'et döner': { en: 'Meat döner', ar: 'دونر اللحم' },
  'tantuni': { en: 'Tantuni (Mersin-style wrap)', ar: 'تنتوني (لفائف مرسين)' },
  'lahmacun': { en: 'Lahmacun (Turkish flatbread with meat)', ar: 'لحم بعجين' },

  // Köfte
  'köfte': { en: 'Turkish meatballs (Köfte)', ar: 'كفتة' },
  'izgara köfte': { en: 'Grilled meatballs', ar: 'كفتة مشوية' },
  'dana köfte': { en: 'Beef meatballs', ar: 'كفتة بقري' },
  'tavuk köfte': { en: 'Chicken meatballs', ar: 'كفتة دجاج' },

  // Çorba
  'çorba': { en: 'Soup', ar: 'شوربة' },
  'mercimek çorbası': { en: 'Lentil soup', ar: 'شوربة العدس' },
  'ezogelin çorbası': { en: 'Ezogelin soup (lentil & bulgur)', ar: 'شوربة إيزوجلين' },
  'işkembe çorbası': { en: 'Tripe soup', ar: 'شوربة الكرشة' },
  'tarhana çorbası': { en: 'Tarhana soup', ar: 'شوربة الترهنة' },

  // Ana yemek / pilav
  'pilav': { en: 'Rice pilaf', ar: 'أرز' },
  'bulgur pilavı': { en: 'Bulgur pilaf', ar: 'برغل مفلفل' },
  'kuru fasulye': { en: 'White beans stew', ar: 'فاصولياء بيضاء' },
  'mantı': { en: 'Mantı (Turkish dumplings)', ar: 'منتي (شيش برك تركي)' },
  'içli köfte': { en: 'Stuffed bulgur meatballs (İçli Köfte)', ar: 'كبة' },
  'sigara böreği': { en: 'Cigar pastry (sigara böreği)', ar: 'سيجارة بورك' },
  'su böreği': { en: 'Water börek', ar: 'بورك بالماء' },

  // İçecek
  'ayran': { en: 'Ayran (yogurt drink)', ar: 'أيران (شراب لبني)' },
  'çay': { en: 'Turkish tea', ar: 'شاي تركي' },
  'türk kahvesi': { en: 'Turkish coffee', ar: 'قهوة تركية' },
  'kahve': { en: 'Coffee', ar: 'قهوة' },
  'su': { en: 'Water', ar: 'ماء' },
  'maden suyu': { en: 'Sparkling water', ar: 'ماء غازي' },
  'soda': { en: 'Soda water', ar: 'صودا' },
  'kola': { en: 'Coke', ar: 'كولا' },
  'fanta': { en: 'Fanta', ar: 'فانتا' },
  'sprite': { en: 'Sprite', ar: 'سبرايت' },
  'meşrubat': { en: 'Soft drink', ar: 'مشروبات غازية' },
  'şalgam': { en: 'Şalgam (fermented turnip juice)', ar: 'عصير الشلغم' },
  'limonata': { en: 'Lemonade', ar: 'عصير ليمون' },
  'portakal suyu': { en: 'Orange juice', ar: 'عصير برتقال' },
  'sıkma portakal': { en: 'Freshly squeezed orange juice', ar: 'عصير برتقال طازج' },

  // Tatlı
  'baklava': { en: 'Baklava', ar: 'بقلاوة' },
  'künefe': { en: 'Künefe', ar: 'كنافة' },
  'sütlaç': { en: 'Rice pudding (Sütlaç)', ar: 'أرز بالحليب' },
  'kazandibi': { en: 'Caramelized milk pudding (Kazandibi)', ar: 'كزن ديبي (حلوى الحليب)' },
  'kemalpaşa': { en: 'Kemalpaşa dessert', ar: 'حلوى كمال باشا' },
  'aşure': { en: 'Aşure (Noah\'s pudding)', ar: 'عاشوراء (حلوى نوح)' },
  'revani': { en: 'Revani (semolina cake)', ar: 'رواني (كيك السميد)' },
  'dondurma': { en: 'Ice cream', ar: 'بوظة' },
  'künefe peynirli': { en: 'Cheese künefe', ar: 'كنافة بالجبن' },

  // Salata / meze
  'salata': { en: 'Salad', ar: 'سلطة' },
  'çoban salatası': { en: 'Shepherd\'s salad', ar: 'سلطة الراعي' },
  'mevsim salata': { en: 'Seasonal salad', ar: 'سلطة موسمية' },
  'roka': { en: 'Arugula', ar: 'جرجير' },
  'cacık': { en: 'Cacık (yogurt with cucumber)', ar: 'تساتسيكي' },
  'meze': { en: 'Meze (appetizers)', ar: 'مزة' },
  'humus': { en: 'Hummus', ar: 'حمص' },
  'haydari': { en: 'Haydari (yogurt dip)', ar: 'حيدري' },
  'patlıcan ezmesi': { en: 'Eggplant dip', ar: 'متبل الباذنجان' },

  // Genel
  'tavuk': { en: 'Chicken', ar: 'دجاج' },
  'tavuk göğsü': { en: 'Chicken breast', ar: 'صدر دجاج' },
  'tavuk kanat': { en: 'Chicken wings', ar: 'أجنحة دجاج' },
  'pirzola': { en: 'Lamb chops', ar: 'قطع لحم الخروف' },
  'antrikot': { en: 'Ribeye', ar: 'إنتركوت' },
  'biftek': { en: 'Beef steak', ar: 'بفتيك' },
  'kuzu': { en: 'Lamb', ar: 'خروف' },
  'dana': { en: 'Beef', ar: 'بقري' },
};

const KEY = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gtranslate(text, tl) {
  await sleep(120); // ücretsiz uçtaki rate limit'e nazik ol
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.[0]?.map((s) => s?.[0]).filter(Boolean).join('') || null;
  } catch {
    return null;
  }
}

async function translate(text, lang) {
  if (!text) return '';
  const k = KEY(text);
  if (DICT[k]?.[lang]) return DICT[k][lang];
  const t = await gtranslate(text, lang);
  return t || text;
}

async function processCollection(name, fields) {
  const snap = await db.collection(name).get();
  console.log(`\n=== ${name} (${snap.size} kayıt) ===`);
  let updated = 0, skipped = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const cev = JSON.parse(JSON.stringify(d.ceviri || {}));
    let changed = false;
    for (const lang of ['en', 'ar']) {
      for (const field of fields) {
        const src = d[field];
        if (!src) continue;
        if (!FORCE && cev[lang]?.[field]) continue;
        const t = await translate(src, lang);
        if (!cev[lang]) cev[lang] = {};
        cev[lang][field] = t;
        changed = true;
      }
    }
    if (!changed) { skipped++; continue; }
    console.log(`  ✓ ${d.ad}`);
    if (cev.en?.ad) console.log(`     EN: ${cev.en.ad}${cev.en.aciklama ? ` — ${cev.en.aciklama}` : ''}`);
    if (cev.ar?.ad) console.log(`     AR: ${cev.ar.ad}${cev.ar.aciklama ? ` — ${cev.ar.aciklama}` : ''}`);
    if (!DRY) {
      try {
        await doc.ref.update({ ceviri: cev });
      } catch (e) {
        console.warn(`     ⚠ yazılamadı: ${e.message}`);
      }
    }
    updated++;
  }
  console.log(`> ${name}: ${updated} güncellendi, ${skipped} atlandı.${DRY ? ' (dry-run)' : ''}`);
}

console.log(`Proje: alazligida-e77b9${DRY ? '  [DRY-RUN]' : ''}${FORCE ? '  [FORCE]' : ''}`);
await processCollection('categories', ['ad']);
await processCollection('products', ['ad', 'aciklama']);
console.log('\nTamam.');
process.exit(0);
