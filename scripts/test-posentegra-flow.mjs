// Uçtan uca akış testi:
// 1) Webhook endpoint'ine 1 yeni Trendyol siparişi düşür
// 2) Loglardan order'ın oluştuğunu doğrula
// 3) Sonraki adım: POS UI'dan "Kabul Et"e basıp callable'ı tetiklersin
// Bu script sadece webhook tarafını test ediyor.
const BASE = 'https://europe-west1-alazligida-e77b9.cloudfunctions.net/posentegraOrder';
const BEARER = 'cae79ff5-d741-4047-ad19-8ee8e5d54736';

const payload = {
  provider: { slug: 'ty', kaynak: 'Trendyol Yemek' },
  pid: 'TY-FLOW-' + Date.now(),
  client: {
    name: 'Test Müşteri',
    clientPhoneNumber: '05551234567',
    deliveryAddress: {
      address: 'Selçuklu Mah. test sk. No:1',
      city: 'Konya',
      district: 'Selçuklu',
    },
  },
  totalPrice: 250, totalDiscount: 0, totalDiscountedPrice: 250,
  clientNote: 'Az pişmiş olsun',
  paymentMethod: 0, paymentMethodText: { tr: 'Kapıda Nakit' },
  posPaymentMethod: 'Nakit',
  products: [{
    id: '1', count: 1, name: { tr: 'Cağ Kebabı' },
    price: 250, priceWithOption: 250, totalPriceWithOption: 250,
    optionCategories: [], removedIngredients: [], extraIngredients: [],
  }],
  confirmationId: 'TEST-FLOW',
};

const res = await fetch(BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BEARER}` },
  body: JSON.stringify(payload),
});
const json = await res.json();
console.log(`HTTP ${res.status}:`, json);
console.log(`\nFirestore order ID: ${json.pos_ticket}`);
console.log(`Posentegra pid: ${payload.pid}`);
console.log(`\nŞimdi POS'a git → Aktif Siparişler → "YENİ" etiketli Trendyol siparişini gör.`);
console.log(`"Kabul Et" → callable çağrısı, "Reddet" → modal açılır.`);
