/**
 * Adisyon (hesap fişi) görselini tek bir bitmap olarak canvas'a çizer.
 * Termal yazıcıya tek resim olarak basılır (kutular, ızgara, kişi-başı
 * bölüşme ve bahşiş yüzleri satır-metin moduyla çizilemediği için).
 *
 * Çıktı: 1-bit (siyah/beyaz) PNG. `dataUrl` ekranda <img>, `base64` native
 * yazıcıya gönderilir.
 */

// Tasarım canvas'ı 576 nokta (80mm @ 203dpi) genişliğinde çizilir, ardından
// yazıcının GÜVENLİ basılabilir genişliğine küçültülür. Bazı 80mm yazıcılar
// 576 noktanın tamamını basamayıp sağ kenarı kırpıyor; 512 güvenli değer.
// Hâlâ sağ taraf taşarsa bu değeri düşür (ör. 384 = 58mm), tamamı sığarsa 576 yap.
const WIDTH = 576;
const TARGET_WIDTH = 512; // güvenli basılabilir genişlik (sağ kenar kırpılmasını önler)
const PAD = 18;
const RIGHT = WIDTH - PAD;

function fmt(n) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * @param {{ order, settings }} opts
 * @returns {Promise<{ dataUrl: string, base64: string } | null>}
 */
export async function renderAdisyonBitmap({ order, settings = {} }) {
  if (typeof document === 'undefined' || !order) return null;

  const logo =
    settings.fisLogoBas !== false ? await loadImage('/branding/alazli-logo-receipt.png') : null;

  // İlk geçiş: yüksek bir canvas'a çiz, içeriğin bittiği y'yi öğren, sonra kırp.
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = 2400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  let y = PAD;

  // ── Logo + başlık ──
  if (logo) {
    const lw = 300;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (WIDTH - lw) / 2, y, lw, lh);
    y += lh + 8;
  }
  const baslik = settings.fisBasligi || settings.restoranAd || 'RESTORAN';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(baslik.toLocaleUpperCase('tr-TR'), WIDTH / 2, y + 26);
  y += 44;

  // ── Üst bilgi kutusu (ADİSYON NO / GARSON / TARİH&SAAT / MASA NO) ──
  const now = new Date();
  const tarih = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}  ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const fisNo = String(order.id || '').slice(0, 8).toUpperCase();
  const labelX = PAD + 10;
  const valX = PAD + 168;
  const rows = [
    { l: 'ADİSYON NO:', v: fisNo, big: false },
    { l: 'GARSON:', v: order.garsonAd || '-', big: false },
    { l: 'TARİH&SAAT:', v: tarih, big: false },
    { l: 'MASA NO:', v: order.masaAd || 'Paket', big: true },
  ];
  const boxTop = y;
  ctx.lineWidth = 2;
  ctx.textAlign = 'left';
  let ry = y;
  for (const r of rows) {
    const rowH = r.big ? 56 : 36;
    // satır çizgisi (üst)
    ctx.beginPath();
    ctx.moveTo(PAD, ry);
    ctx.lineTo(RIGHT, ry);
    ctx.stroke();
    const midY = ry + rowH / 2;
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(r.l, labelX, midY);
    if (r.big) {
      ctx.font = 'bold 40px Arial';
    } else {
      ctx.font = '22px Arial';
    }
    ctx.fillText(r.v, valX, midY);
    ry += rowH;
  }
  // kutu dış çerçeve + dikey ayraç
  ctx.beginPath();
  ctx.rect(PAD, boxTop, RIGHT - PAD, ry - boxTop);
  ctx.moveTo(valX - 12, boxTop);
  ctx.lineTo(valX - 12, ry);
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  y = ry + 14;

  // ── Ürün tablosu ──
  // başlık satırı
  const colMik = PAD + 300;
  const colFiyat = PAD + 390;
  const colTutar = RIGHT;
  const itemsTop = y;
  ctx.lineWidth = 2;
  ctx.font = 'bold 20px Arial';
  ctx.textBaseline = 'middle';
  const headH = 32;
  ctx.textAlign = 'left';
  ctx.fillText('ÜRÜN ADI', labelX, y + headH / 2);
  ctx.textAlign = 'right';
  ctx.fillText('MİK.', colMik, y + headH / 2);
  ctx.fillText('FİYAT', colFiyat, y + headH / 2);
  ctx.fillText('TUTAR', colTutar - 6, y + headH / 2);
  y += headH;
  // başlık altı çizgi
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(RIGHT, y);
  ctx.stroke();

  const items = order.items || [];
  for (const it of items) {
    const adet = it.adet % 1 === 0 ? String(it.adet) : it.adet.toFixed(1).replace('.', ',');
    const isIkram = !!it.ikram;
    const tutar = isIkram ? 0 : (it.fiyat || 0) * (it.adet || 0);
    const rowH = 34;
    const midY = y + rowH / 2;
    ctx.font = '21px Arial';
    ctx.textAlign = 'left';
    // ürün adı (gerekirse kısalt)
    let ad = (it.ad || '').toLocaleUpperCase('tr-TR') + (isIkram ? ' (İKRAM)' : '');
    while (ctx.measureText(ad).width > colMik - labelX - 50 && ad.length > 4) {
      ad = ad.slice(0, -2);
    }
    ctx.fillText(ad, labelX, midY);
    ctx.textAlign = 'right';
    ctx.fillText(adet, colMik, midY);
    ctx.fillText(fmt(it.fiyat || 0), colFiyat, midY);
    ctx.fillText(fmt(tutar), colTutar - 6, midY);
    y += rowH;
  }
  // ürün tablosu dış çerçeve
  ctx.beginPath();
  ctx.rect(PAD, itemsTop, RIGHT - PAD, y - itemsTop);
  ctx.stroke();
  y += 16;

  // ── Toplamlar kutusu ──
  const araToplam = Number(order.araToplam || 0);
  const indirim = Number(order.indirim || 0);
  const toplam = Number(order.toplam != null ? order.toplam : araToplam);
  const totalsTop = y;
  const totRows = [
    { l: 'NET TUTAR:', v: fmt(araToplam), bold: false },
    { l: 'İSKONTO TOPLAMI:', v: fmt(indirim), bold: false },
    { l: 'ALINAN TUTAR:', v: fmt(0), bold: false },
    { l: 'TOPLAM TUTAR:', v: fmt(toplam), bold: true },
  ];
  ctx.textBaseline = 'middle';
  for (const r of totRows) {
    const rowH = 38;
    const midY = y + rowH / 2;
    ctx.font = r.bold ? 'bold 26px Arial' : '23px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(r.l, PAD + 14, midY);
    ctx.textAlign = 'right';
    ctx.fillText(r.v, RIGHT - 12, midY);
    y += rowH;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(RIGHT, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.rect(PAD, totalsTop, RIGHT - PAD, y - totalsTop);
  ctx.stroke();
  y += 24;

  // ── "AFİYET OLSUN YİNE BEKLERİZ" (kesik çizgi çerçeve) ──
  const bannerH = 44;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(PAD, y, RIGHT - PAD, bannerH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AFİYET OLSUN YİNE BEKLERİZ', WIDTH / 2, y + bannerH / 2);
  y += bannerH + 22;

  // ── Hesabı Paylaşın (2-12 kişi, 2 satır × 6 hücre) ──
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = '22px Arial';
  ctx.fillText('Hesabı Paylaşın', PAD, y + 18);
  y += 32;
  const splitRows = [
    [2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12],
  ];
  const cellsPerRow = 6;
  const cellW = (RIGHT - PAD) / cellsPerRow;
  const cellHeadH = 30;
  const cellValH = 34;
  ctx.lineWidth = 2;
  for (const row of splitRows) {
    row.forEach((n, i) => {
      const x = PAD + i * cellW;
      // başlık hücresi (gri dolgu)
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(x, y, cellW, cellHeadH);
      ctx.fillStyle = '#000';
      ctx.strokeRect(x, y, cellW, cellHeadH);
      ctx.strokeRect(x, y + cellHeadH, cellW, cellValH);
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${n} Kişi`, x + cellW / 2, y + cellHeadH / 2);
      ctx.font = '20px Arial';
      ctx.fillText(fmt(toplam / n), x + cellW / 2, y + cellHeadH + cellValH / 2);
    });
    y += cellHeadH + cellValH;
  }
  y += 26;

  // ── Alt notlar ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '18px Arial';
  ctx.fillText('Bu adisyon mali belge değildir', WIDTH / 2, y + 16);
  y += 28;
  ctx.font = '16px Arial';
  ctx.fillText('powered by {S} syntrixCode', WIDTH / 2, y + 14);
  y += 30;

  const contentH = Math.ceil(y);

  // Hedef yazıcı genişliğine indirge (WIDTH → TARGET_WIDTH) ve içerik yüksekliğine kırp
  const scale = TARGET_WIDTH / WIDTH;
  const targetH = Math.max(1, Math.round(contentH * scale));
  const out = document.createElement('canvas');
  out.width = TARGET_WIDTH;
  out.height = targetH;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, TARGET_WIDTH, targetH);
  octx.drawImage(canvas, 0, 0, WIDTH, contentH, 0, 0, TARGET_WIDTH, targetH);

  // 1-bit eşikleme (termal için keskin siyah/beyaz, ölçeklenmiş kenarları sertleştirir)
  const imgData = octx.getImageData(0, 0, TARGET_WIDTH, targetH);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < 180 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  octx.putImageData(imgData, 0, 0);

  const dataUrl = out.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] || '';
  return { dataUrl, base64 };
}

