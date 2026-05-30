// Üç platformun (Migros / Trendyol / Yemeksepeti) gerçek payload örneklerini
// posentegraOrder endpoint'ine atar, response'u ve Firestore'daki order'ı doğrular.
const BASE = 'https://europe-west1-alazligida-e77b9.cloudfunctions.net/posentegraOrder';
const BEARER = 'cae79ff5-d741-4047-ad19-8ee8e5d54736'; // restaurant id

const samples = {
  migros: {
    provider: { slug: 'migros', kaynak: 'Migros Yemek', id: '63c55fd52ca13bf485fd7753' },
    pid: 'MIGROS-TEST-' + Date.now(),
    client: {
      name: 'Mehmet İ.',
      clientPhoneNumber: '5060957232',
      deliveryAddress: {
        address: 'Balcalı Mh. Güney kampüs 5.sokak Bina No:2',
        aptNo: '2', floor: '5', doorNo: '610',
        district: 'Balcalı Mh.', city: 'Adana',
        description: 'Çukurova erkek KYK yurdu',
      },
    },
    totalPrice: 400, totalDiscount: 0, totalDiscountedPrice: 400,
    clientNote: 'iyi pişmiş olsun',
    paymentMethod: 2, paymentMethodText: { tr: 'Online Ödeme', en: 'Online' },
    posPaymentMethod: 'Migros Online',
    products: [{
      id: '3282944350', count: 1, name: { tr: 'Tüm Kızarmış Tavuk' },
      price: 400, optionPrice: 0, priceWithOption: 400, totalPriceWithOption: 400,
      optionCategories: [], removedIngredients: [], extraIngredients: [],
    }],
    confirmationId: 872515187, shortCode: 872515187,
  },
  trendyol: {
    provider: { slug: 'ty', kaynak: 'Trendyol Yemek' },
    pid: 'TY-TEST-' + Date.now(),
    client: {
      name: 'seçil ö.', clientPhoneNumber: '02123653403',
      deliveryAddress: {
        address: 'Adnan Menderes, susam sk.no 6-8',
        aptNo: '6-8', floor: '1', doorNo: '3',
        district: 'Kapaklı', city: 'Tekirdağ',
        description: 'Adnan Menderes mh. susam sk.',
      },
    },
    totalPrice: 590, totalDiscount: 0, totalDiscountedPrice: 590,
    clientNote: 'Servis İstiyorum',
    paymentMethod: 0, paymentMethodText: { tr: 'PAY_WITH_CARD' },
    posPaymentMethod: '',
    products: [
      {
        id: '7865907', count: 1, name: { tr: 'Kuru Biber Patlıcan Dolması' },
        price: 100, optionPrice: 150, priceWithOption: 250, totalPriceWithOption: 250,
        optionCategories: [{
          name: { tr: 'Kuru Biber Patlıcan Dolması' },
          options: [{ name: { tr: '500 Gram' }, price: 150 }],
        }],
        removedIngredientsV2: [
          { id: '871151', name: 'Kuru Patlıcan' },
          { id: '871152', name: 'Kuru Biber' },
        ],
        extraIngredients: [],
      },
      {
        id: '1857328', count: 1, name: { tr: 'Çiğköfte (500gr) 2,3 Kişilik' },
        price: 340, priceWithOption: 340, totalPriceWithOption: 340,
        optionCategories: [], removedIngredients: [], extraIngredients: [],
      },
    ],
    confirmationId: '11215641226',
  },
  yemeksepeti: {
    provider: { slug: 'ys', kaynak: 'Yemek Sepeti' },
    pid: 'YS-TEST-' + Date.now(),
    client: {
      name: 'Orhan Gençkiren', clientPhoneNumber: '5421803474',
      deliveryAddress: {
        address: '190. Sk.', aptNo: '8-C', floor: 'Giriş', doorNo: '0',
        district: 'Ayazağa Sarıyer', city: 'İstanbul', description: '0',
      },
    },
    totalPrice: 400, totalDiscount: 60, totalDiscountedPrice: 340,
    clientNote: 'ÇATAL-BIÇAK GÖNDERMEYİN',
    paymentMethod: '1', paymentMethodText: { tr: 'Nakit' },
    posPaymentMethod: 'Nakit',
    products: [{
      id: '3294488', count: 1, name: { tr: 'Tam Ekmek Arası Karışık Izgara' },
      note: 'turşu olmasın içinde lütfen',
      price: 400, priceWithOption: 400, totalPriceWithOption: 400,
      optionCategories: [],
      extraIngredients: [{ id: '446389', name: 'ACILI', price: 0 }],
    }],
    confirmationId: 'YS-CONF-TEST',
  },
};

for (const [platform, body] of Object.entries(samples)) {
  console.log(`\n──── ${platform.toUpperCase()} ────`);
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BEARER}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(`HTTP ${res.status}:`, json);
  if (json.pos_ticket) {
    console.log(`  → Firestore order ID: ${json.pos_ticket}`);
    console.log(`  → Posentegra pid: ${body.pid}`);
  }
}
