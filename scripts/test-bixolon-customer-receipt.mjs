// Bixolon SRP-E300'e örnek MÜŞTERİ HESAP FİŞİ basar.
// Kullanım:  node scripts/test-bixolon-customer-receipt.mjs [ip] [port]

import { Socket } from 'node:net';
import { Buffer } from 'node:buffer';

const ip = process.argv[2] || '192.168.1.125';
const port = Number(process.argv[3] || 9100);

const ESC = 0x1b;
const GS = 0x1d;

const CP857 = {
  'ç': 0x87, 'Ç': 0x80,
  'ğ': 0xA7, 'Ğ': 0xA6,
  'ı': 0x8D, 'İ': 0x98,
  'ö': 0x94, 'Ö': 0x99,
  'ş': 0x9F, 'Ş': 0x9E,
  'ü': 0x81, 'Ü': 0x9A,
};

function cp857(str) {
  const out = [];
  for (const ch of str) {
    if (CP857[ch] != null) out.push(CP857[ch]);
    else if (ch.charCodeAt(0) < 128) out.push(ch.charCodeAt(0));
    else out.push(0x3F);
  }
  return Buffer.from(out);
}

const W = 42;       // 80mm kâğıt @ Font A
const fmt = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pad = (left, right) => {
  const space = Math.max(1, W - left.length - right.length);
  return left + ' '.repeat(space) + right;
};

function build() {
  const c = [];
  c.push(Buffer.from([ESC, 0x40]));            // init
  c.push(Buffer.from([ESC, 0x74, 13]));        // CP857 (Türkçe)

  // Başlık
  c.push(Buffer.from([ESC, 0x61, 1]));         // center
  c.push(Buffer.from([GS, 0x21, 0x11]));       // 2x size
  c.push(Buffer.from([ESC, 0x45, 1]));         // bold on
  c.push(cp857('ALAZLI KONYA MUTFAĞI\n'));
  c.push(Buffer.from([ESC, 0x45, 0]));
  c.push(Buffer.from([GS, 0x21, 0x00]));       // normal
  c.push(cp857('Konya / Selçuklu\n'));
  c.push(cp857('Tel: 0332 555 12 34\n'));

  c.push(Buffer.from([ESC, 0x61, 0]));         // left
  c.push(cp857('-'.repeat(W) + '\n'));

  // Bilgi
  const now = new Date();
  const tarih = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  c.push(cp857(pad('Tarih:', tarih) + '\n'));
  c.push(cp857(pad('Masa:', '12') + '\n'));
  c.push(cp857(pad('Kişi:', '4') + '\n'));
  c.push(cp857(pad('Garson:', 'Mehmet Can') + '\n'));
  c.push(cp857(pad('Fiş No:', 'A1B2C3D4') + '\n'));
  c.push(cp857('-'.repeat(W) + '\n'));

  // Ürünler
  const items = [
    { adet: '2', ad: 'Adana Kebap', fiyat: 350.00, notlar: 'acılı, soğansız' },
    { adet: '1', ad: 'Ali Nazik', fiyat: 380.00 },
    { adet: '1', ad: 'Tirit', fiyat: 280.00 },
    { adet: '4', ad: 'Ayran', fiyat: 25.00 },
    { adet: '2', ad: 'Künefe', fiyat: 220.00 },
    { adet: '1', ad: 'Türk Kahvesi', fiyat: 50.00 },
  ];
  for (const it of items) {
    const left = `${it.adet}x ${it.ad}`;
    const right = `${fmt(it.fiyat * Number(it.adet))} TL`;
    c.push(cp857(pad(left, right) + '\n'));
    if (it.notlar) {
      c.push(cp857(`   (${it.notlar})\n`));
    }
  }

  c.push(cp857('-'.repeat(W) + '\n'));

  // Toplam blok
  const araToplam = items.reduce((s, it) => s + it.fiyat * Number(it.adet), 0);
  const indirim = 50;
  const toplam = araToplam - indirim;
  c.push(cp857(pad('Ara Toplam:', fmt(araToplam) + ' TL') + '\n'));
  c.push(cp857(pad('İndirim:', '-' + fmt(indirim) + ' TL') + '\n'));

  // TOPLAM — büyük
  c.push(Buffer.from([GS, 0x21, 0x11]));       // 2x size
  c.push(Buffer.from([ESC, 0x45, 1]));         // bold
  c.push(cp857(pad('TOPLAM:', fmt(toplam) + ' TL') + '\n'));
  c.push(Buffer.from([ESC, 0x45, 0]));
  c.push(Buffer.from([GS, 0x21, 0x00]));

  // Ödeme
  c.push(cp857('-'.repeat(W) + '\n'));
  c.push(cp857(pad('NAKİT:', '2.000,00 TL') + '\n'));
  c.push(cp857(pad('Para Üstü:', '0,00 TL') + '\n'));

  // Footer
  c.push(Buffer.from([ESC, 0x61, 1]));         // center
  c.push(cp857('\nTeşekkür ederiz\nAfiyet olsun ✓\n\n'));
  c.push(cp857('powered by {S} syntrixCode\n\n\n'));

  // Cut
  c.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
  return Buffer.concat(c);
}

console.log(`→ Bixolon'a bağlanılıyor: ${ip}:${port}`);
const socket = new Socket();
const t = setTimeout(() => {
  console.error('✗ 8 saniyede yanıt yok');
  socket.destroy();
  process.exit(2);
}, 8000);

socket.connect(port, ip, () => {
  clearTimeout(t);
  console.log('✓ Bağlandı, müşteri fişi gönderiliyor…');
  const payload = build();
  socket.write(payload, () => {
    console.log(`✓ ${payload.length} bayt gönderildi`);
    setTimeout(() => {
      socket.end();
      console.log('✓ Tamam. Fiş çıktıysa müşteri formatı da doğru.');
      process.exit(0);
    }, 1000);
  });
});

socket.on('error', (err) => {
  clearTimeout(t);
  console.error(`✗ Hata: ${err.code || err.message}`);
  process.exit(1);
});
