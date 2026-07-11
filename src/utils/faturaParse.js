// API'siz fatura okuma: metin tabanlı (dijital) PDF'in gömülü metnini çıkarır,
// satır kalemlerini kurallarla ayrıştırır ve işletme kataloğuyla eşleştirir.
// Tarayıcıda çalışır — Cloud Function/AI anahtarı gerektirmez.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** PDF'i konumlu metne çevirir → satır satır (üstten alta) diziler döndürür. */
export async function extractPdfRows(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const rows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str && it.str.trim() !== '')
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    // Aynı satırdaki parçaları y'ye göre kümele (yukarıdan aşağıya)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of items) {
      if (!cur || Math.abs(cur.y - it.y) > 3) {
        cur = { y: it.y, cells: [it] };
        rows.push(cur);
      } else {
        cur.cells.push(it);
      }
    }
  }
  return rows.map((r) => ({
    y: r.y,
    text: r.cells
      .sort((a, b) => a.x - b.x)
      .map((c) => c.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

/** Türkçe sayı: "1.234,56"→1234.56, "12,5"→12.5, "1.250"→1250, "1.5"→1.5 */
export function parseTRNumber(raw) {
  let s = String(raw).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.'); // . binlik, , ondalık
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    // sadece nokta: son parça 3 hane ise binlik ayraç, değilse ondalık
    const parts = s.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) s = parts.join('');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function normalize(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[^0-9a-zğüşıöç ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Katalogdan (malzeme+ürün) en yakın kaydı bul — basit token/içerik benzerliği. */
export function eslestir(ad, katalog) {
  const a = normalize(ad);
  if (!a) return null;
  const aTokens = new Set(a.split(' ').filter((t) => t.length >= 3));
  let best = null;
  let bestScore = 0;
  for (const k of katalog) {
    const kn = normalize(k.ad);
    if (!kn) continue;
    let score = 0;
    if (a.includes(kn) || kn.includes(a)) {
      score = 0.9 + Math.min(0.1, kn.length / 100);
    } else {
      const kTokens = kn.split(' ').filter((t) => t.length >= 3);
      if (kTokens.length) {
        const overlap = kTokens.filter((t) => aTokens.has(t)).length;
        score = overlap / kTokens.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  // Eşik 0.65: tek ortak kelime (örn. "toz") yanlış eşleşme yapmasın
  return bestScore >= 0.65 ? best : null;
}

const BIRIM_NORM = {
  kg: 'kg', kilo: 'kg', kilogram: 'kg', gr: 'gram', gram: 'gram',
  lt: 'lt', litre: 'lt', ml: 'ml', adet: 'adet', ad: 'adet',
  paket: 'paket', pkt: 'paket', koli: 'koli', kutu: 'kutu',
  çift: 'çift', cift: 'çift', çuval: 'çuval', teneke: 'teneke',
  deste: 'deste', top: 'top', rulo: 'rulo', düzine: 'düzine',
};

const UNIT = 'Adet|Kg|KG|Gram|Gr|Lt|Litre|Ml|Paket|Pkt|Koli|Kutu|Çift|Cift|Çuval|Teneke|Deste|Top|Rulo|Düzine';

// Satır "kuyruğu" — başlık/adres satırlarında olmadığı için kalemleri kesin ayırır.
// İki yaygın e-fatura/e-arşiv düzenini destekleriz:
// Format 1 (boşluklu): "<miktar> <birim> <fiyat> TL %<kdv> <kdvTutarı> TL <netTutar> TL"
const TAIL_KRC = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s+(${UNIT})\\s+([\\d.,]+)\\s*TL\\s+%\\s*([\\d.,]+)\\s+([\\d.,]+)\\s*TL\\s+([\\d.,]+)\\s*TL`,
  'i',
);
// Format 2 (bitişik + iskonto): "<miktar><BİRİM> <fiyat>TL ...iskonto... %<kdv> <kdvTutarı>TL <brüt>TL <net>TL"
const TAIL_CAM = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})\\s+([\\d.,]+)\\s*TL\\b[\\s\\S]*?%\\s*([\\d.,]+)\\s+([\\d.,]+)\\s*TL\\s+([\\d.,]+)\\s*TL\\s+([\\d.,]+)\\s*TL`,
  'i',
);

// Bir metinde satır kuyruğunu (sayısal kısmı) yakalar; hangi format uyarsa ondan döner.
function matchTail(text) {
  let m = text.match(TAIL_KRC);
  if (m)
    return { miktar: m[1], birim: m[2], birimFiyat: m[3], kdv: m[4], kdvTutar: m[5], tutar: m[6], index: m.index, length: m[0].length };
  m = text.match(TAIL_CAM);
  if (m)
    return { miktar: m[1], birim: m[2], birimFiyat: m[3], kdv: m[4], kdvTutar: m[5], tutar: m[7], index: m.index, length: m[0].length };
  return null;
}

// Kalem ön-metninden "Sıra No + (Stok/Malzeme Kodu) + açıklama" ayrıştırır.
// Kod hem harfli (KRC00047) hem sayısal (15003) olabilir; en az 1 rakam içermeli.
function splitSiraKod(pre) {
  const t = pre.trim();
  let pm = t.match(/^(\d{1,3})\s+([A-Za-z0-9]*\d[A-Za-z0-9._\-]*)\b\s*([\s\S]*)$/);
  if (pm) return { sira: Number(pm[1]), code: pm[2], desc: pm[3] };
  pm = t.match(/^(\d{1,3})\s+([\s\S]*)$/);
  if (pm) return { sira: Number(pm[1]), code: '', desc: pm[2] };
  return { sira: null, code: '', desc: t };
}

// pre içindeki SON "sıra kodu" bloğunu bulup sonrasını açıklama say (yedek tarama için).
function lastSiraKod(pre) {
  const re = /(\d{1,3})\s+([A-Za-z0-9]*\d[A-Za-z0-9._\-]*)\s+/g;
  let m;
  let last = null;
  while ((m = re.exec(pre))) last = m;
  if (last)
    return { sira: Number(last[1]), code: last[2], desc: pre.slice(last.index + last[0].length) };
  return { sira: null, code: '', desc: pre };
}

// Tüm metni tarayıp sırayla bütün satır kuyruklarını döndürür (satır kümeleme başarısızsa yedek).
function matchAllTails(text) {
  const out = [];
  let pos = 0;
  let guard = 0;
  while (pos < text.length && guard++ < 1000) {
    const t = matchTail(text.slice(pos));
    if (!t) break;
    out.push({ ...t, index: pos + t.index, length: t.length });
    pos = pos + t.index + t.length;
  }
  return out;
}

/**
 * e-Arşiv/dijital fatura PDF metninden fatura no/tarih + kalemleri çözer, kataloga eşleştirir.
 * Kalem alanları: { siraNo, stokKodu, ad, miktar, birim, birimFiyat(KDV hariç), kdv(%),
 *                   kdvTutar, tutar(KDV hariç), eslesmeId, eslesmeTip }
 */
export function parseFatura(rows, katalog = []) {
  const blob = rows.map((r) => r.text).join('\n');
  const hamSatirlar = rows.map((r) => r.text);

  // Fatura no
  let faturaNo = '';
  const noM =
    blob.match(/Fatura\s*No\s*:?\s*([A-Z0-9][A-Z0-9\-_/]{4,})/i) ||
    blob.match(/\b([A-Z]{2,4}\d{10,})\b/);
  if (noM) faturaNo = noM[1].trim();

  // Tarih → YYYY-MM-DD (tireler arası boşluklu formatlara da toleranslı)
  let tarih = '';
  const dM =
    blob.match(/Fatura\s*Tarihi\s*:?\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})/i) ||
    blob.match(/\b(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})\b/);
  if (dM) tarih = `${dM[3]}-${dM[2].padStart(2, '0')}-${dM[1].padStart(2, '0')}`;

  // Faturanın kendi yazdığı toplamlar (doğrulama için)
  const oM =
    blob.match(/Ödenecek\s*Tutar[ıi]?\s*:?\s*([\d.,]+)\s*TL/i) ||
    blob.match(/Vergiler\s*Dahil\s*Toplam\s*Tutar[ıi]?\s*:?\s*([\d.,]+)\s*TL/i);
  const odenecek = oM ? parseTRNumber(oM[1]) || 0 : 0;
  const hM =
    blob.match(/Mal\s*\/?\s*Hizmet\s*Toplam\s*Tutar[ıi]?\s*:?\s*([\d.,]+)\s*TL/i) ||
    blob.match(/Net\s*Toplam\s*Tutar[ıi]?\s*:?\s*([\d.,]+)\s*TL/i);
  const malHizmetToplam = hM ? parseTRNumber(hM[1]) || 0 : 0;

  const mk = ({ siraNo, stokKodu, adRaw, miktarRaw, birimRaw, fiyatRaw, kdvRaw, kdvTutarRaw, tutarRaw }) => {
    const ad = String(adRaw).replace(/\s+/g, ' ').trim();
    const birim = BIRIM_NORM[String(birimRaw).toLowerCase()] || String(birimRaw).toLowerCase();
    const match = eslestir(ad, katalog);
    return {
      siraNo: Number(siraNo) || null,
      stokKodu: stokKodu || '',
      ad,
      miktar: parseTRNumber(miktarRaw) || 0,
      birim,
      birimFiyat: parseTRNumber(fiyatRaw) || 0,
      kdv: parseTRNumber(kdvRaw) || 0,
      kdvTutar: parseTRNumber(kdvTutarRaw) || 0,
      tutar: parseTRNumber(tutarRaw) || 0,
      eslesmeId: match ? match.id : '',
      eslesmeTip: match ? match.tip : '',
    };
  };

  // KONUM (y) TABANLI: çok satırlı açıklamalar için sağlam yöntem.
  // Sayıların olduğu "ana satır"ı bul. Açıklama PDF'te çok satıra bölünmüş olabilir
  // (kod/sayılar dikey ortada, ad satırın üstünde/altında). Bu "yetim" açıklama
  // satırlarını en yakın ana satıra atayıp y sırasıyla birleştir.
  const SKIP =
    /Mal\s*\/?\s*Hizmet|Hesaplanan\s*KDV|Matrah|Net\s*(Tutar|Toplam)|Brüt\s*Toplam|Vergiler\s*Dahil|Ödenecek|Toplam\s*Tutar|Toplam\s*İskonto|Sıra\s*No|Malzeme\s*Kodu|Stok\s*Kodu|Açıklama|İskonto|Banka|IBAN|Şube|Yalnız|İrsaliye|Fatura\s*(No|Tip|Tarih|Saat)|Düzenleme|VKN|TCKN|Mersis|Vergi\s*Dair|Senaryo|Özelleştirme|ETTN|SAYIN|Web\s*Sit|E-?Posta|e-?FATURA|E-?Arşiv|Tel\s*:/i;

  const mains = [];
  const orphans = [];
  for (const r of rows) {
    const tail = matchTail(r.text);
    if (tail) {
      const pre = r.text.slice(0, tail.index);
      const { sira, code, desc } = splitSiraKod(pre);
      const after = r.text.slice(tail.index + tail.length);
      const frags = [];
      const inline = (desc + ' ' + after).replace(/\s+/g, ' ').trim();
      if (inline) frags.push({ y: r.y, text: inline });
      mains.push({ y: r.y, sira, code, frags, tail });
    } else {
      if (SKIP.test(r.text)) continue;
      const t = r.text.trim();
      // En az 2 harf içermeyen (saf sayı/sembol) satırları açıklama sayma
      if (t && /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(t)) orphans.push({ y: r.y, text: t });
    }
  }

  // Yetim açıklama satırlarını en yakın ana satıra ata (yakınsa)
  for (const o of orphans) {
    let best = null;
    let bestD = Infinity;
    for (const m of mains) {
      const d = Math.abs(m.y - o.y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best && bestD <= 40) best.frags.push({ y: o.y, text: o.text });
  }

  let kalemler = mains.map((m) => {
    const adRaw = m.frags
      .sort((a, b) => b.y - a.y) // üstten alta
      .map((f) => f.text)
      .join(' ');
    const t = m.tail;
    return mk({
      siraNo: m.sira,
      stokKodu: m.code,
      adRaw,
      miktarRaw: t.miktar,
      birimRaw: t.birim,
      fiyatRaw: t.birimFiyat,
      kdvRaw: t.kdv,
      kdvTutarRaw: t.kdvTutar,
      tutarRaw: t.tutar,
    });
  });

  // YEDEK: satır kümeleme hiç kalem bulamadıysa tüm metni tara (konum bilgisi olmadan)
  if (kalemler.length === 0) {
    const joined = rows.map((r) => r.text).join(' \n ');
    const tails = matchAllTails(joined);
    let prevEnd = 0;
    kalemler = tails.map((t) => {
      const pre = joined.slice(prevEnd, t.index);
      prevEnd = t.index + t.length;
      const { sira, code, desc } = lastSiraKod(pre);
      return mk({
        siraNo: sira,
        stokKodu: code,
        adRaw: desc,
        miktarRaw: t.miktar,
        birimRaw: t.birim,
        fiyatRaw: t.birimFiyat,
        kdvRaw: t.kdv,
        kdvTutarRaw: t.kdvTutar,
        tutarRaw: t.tutar,
      });
    });
  }

  return { faturaNo, tarih, kalemler, hamSatirlar, odenecek, malHizmetToplam };
}

/** Tek adımda: File → yapısal fatura. */
export async function pdftenOku(file, katalog) {
  const rows = await extractPdfRows(file);
  return parseFatura(rows, katalog);
}
