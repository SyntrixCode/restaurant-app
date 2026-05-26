// Bixolon SRP-E300 ağ yazıcısını APK olmadan doğrudan test eder.
// Kullanım:  node scripts/test-bixolon-print.mjs [ip] [port]
//            node scripts/test-bixolon-print.mjs 192.168.88.164 9100
//
// Aynı LAN'da çalışmalısın (laptop ↔ yazıcı aynı router'da).
// ESC/POS raw 9100 portuna gönderir. Türkçe karakter CP857 (DOS Turkish).

import { Socket } from 'node:net';
import { Buffer } from 'node:buffer';

const ip = process.argv[2] || '192.168.88.164';
const port = Number(process.argv[3] || 9100);

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// UTF-8 → CP857 (DOS Türkçe) manuel tablo (Türkçe özel harfler)
const CP857 = {
  'ç': 0x87, 'Ç': 0x80,
  'ğ': 0xA7, 'Ğ': 0xA6,
  'ı': 0x8D, 'İ': 0x98,
  'ö': 0x94, 'Ö': 0x99,
  'ş': 0x9F, 'Ş': 0x9E,
  'ü': 0x81, 'Ü': 0x9A,
};

function encodeCP857(str) {
  const out = [];
  for (const ch of str) {
    if (CP857[ch] != null) out.push(CP857[ch]);
    else if (ch.charCodeAt(0) < 128) out.push(ch.charCodeAt(0));
    else out.push(0x3F); // ?
  }
  return Buffer.from(out);
}

function build() {
  const chunks = [];
  // Init
  chunks.push(Buffer.from([ESC, 0x40]));
  // Codepage 13 = CP857 (DOS Türkçe) — ESC t 13
  chunks.push(Buffer.from([ESC, 0x74, 13]));

  // Center align
  chunks.push(Buffer.from([ESC, 0x61, 1]));
  // Double height + width
  chunks.push(Buffer.from([GS, 0x21, 0x11]));
  // Bold on
  chunks.push(Buffer.from([ESC, 0x45, 1]));
  chunks.push(encodeCP857('SyntrixPos\n'));
  // Bold off
  chunks.push(Buffer.from([ESC, 0x45, 0]));
  // Normal size
  chunks.push(Buffer.from([GS, 0x21, 0x00]));
  chunks.push(encodeCP857('TEST YAZDIRMA\n'));

  // Divider
  chunks.push(Buffer.from([ESC, 0x61, 0])); // left
  chunks.push(encodeCP857('-'.repeat(42) + '\n'));

  // Info
  const now = new Date();
  const tarih = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  chunks.push(encodeCP857(`Tarih:   ${tarih}\n`));
  chunks.push(encodeCP857(`Yazıcı:  Bixolon SRP-E300\n`));
  chunks.push(encodeCP857(`IP:      ${ip}:${port}\n`));
  chunks.push(encodeCP857('-'.repeat(42) + '\n'));

  // Turkish chars
  chunks.push(Buffer.from([ESC, 0x61, 1])); // center
  chunks.push(encodeCP857('Türkçe testi:\n'));
  chunks.push(Buffer.from([ESC, 0x45, 1]));
  chunks.push(encodeCP857('ıİşŞğĞüÜöÖçÇ\n'));
  chunks.push(Buffer.from([ESC, 0x45, 0]));

  // Sample order
  chunks.push(Buffer.from([ESC, 0x61, 0])); // left
  chunks.push(encodeCP857('\n2x Adana Kebap\n'));
  chunks.push(encodeCP857('   (acılı, soğansız)\n'));
  chunks.push(encodeCP857('1x Ayran\n'));
  chunks.push(encodeCP857('1x Künefe\n\n'));

  // Footer
  chunks.push(Buffer.from([ESC, 0x61, 1]));
  chunks.push(encodeCP857('Bağlantı OK ✓\n'));
  chunks.push(encodeCP857('powered by {S} syntrixCode\n\n\n'));

  // Partial cut
  chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00]));

  return Buffer.concat(chunks);
}

console.log(`→ Bixolon'a bağlanılıyor: ${ip}:${port}`);
const socket = new Socket();
const timeout = setTimeout(() => {
  console.error('✗ 8 saniyede yanıt yok — yazıcı kapalı veya farklı ağda olabilir');
  socket.destroy();
  process.exit(2);
}, 8000);

socket.connect(port, ip, () => {
  clearTimeout(timeout);
  console.log('✓ Bağlandı, fiş gönderiliyor…');
  const payload = build();
  socket.write(payload, () => {
    console.log(`✓ ${payload.length} bayt gönderildi`);
    setTimeout(() => {
      socket.end();
      console.log('✓ Tamam. Fiş çıktıysa entegrasyon doğru.');
      process.exit(0);
    }, 1000);
  });
});

socket.on('error', (err) => {
  clearTimeout(timeout);
  console.error(`✗ Hata: ${err.code || err.message}`);
  if (err.code === 'ECONNREFUSED') console.error('  → Yazıcı 9100 portunu dinlemiyor. Yazıcı ayarlarında "raw print" / "9100" açık mı?');
  if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') console.error('  → Yazıcı bu ağda değil. Aynı router\'a bağlı mısın?');
  if (err.code === 'ETIMEDOUT') console.error('  → Bağlantı zaman aşımına uğradı. IP doğru mu? Yazıcı açık mı?');
  process.exit(1);
});
