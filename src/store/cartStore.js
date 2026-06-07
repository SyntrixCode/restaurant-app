import { create } from 'zustand';

// Sepet satırlarına benzersiz id — aynı üründen birden fazla satır olabildiği için
// (ör. 1,5 yarım porsiyon + ayrı 1 tam porsiyon) productId tek başına yetmez.
let lineCounter = 0;
const newLineId = () => `L${++lineCounter}`;

export const useCartStore = create((set, get) => ({
  masaId: null,
  masaAd: null,
  items: [],

  start: (masaId, masaAd) => set({ masaId, masaAd, items: [] }),

  addItem: (product, initialNotes = '') => {
    const items = [...get().items];
    // Aynı üründen TAM SAYILI (kesirsiz) bir satır varsa onu arttır; yoksa yeni satır aç.
    // Böylece 1,5 (yarım) satır varken ürüne tekrar dokunmak onu 2,5 yapmaz — ayrı satır olur.
    const whole = items.find(
      (it) => it.productId === product.id && Number.isInteger(it.adet),
    );
    if (whole) {
      whole.adet += 1;
    } else {
      items.push({
        lineId: newLineId(),
        productId: product.id,
        ad: product.ad,
        fiyat: product.fiyat,
        adet: 1,
        notlar: initialNotes || '',
        // Mutfak yazıcı yönlendirmesi için (anlık fiş + grup bölme)
        categoryId: product.categoryId || null,
        yaziciIds: Array.isArray(product.yaziciIds) ? product.yaziciIds : [],
      });
    }
    set({ items });
  },

  changeQuantity: (lineId, delta) => {
    let items = [...get().items];
    const item = items.find((it) => it.lineId === lineId);
    if (!item) return;
    item.adet = Math.round((item.adet + delta) * 2) / 2; // 0.5 step'e snap
    if (item.adet <= 0) {
      items = items.filter((it) => it.lineId !== lineId);
    }
    set({ items });
  },

  toggleHalf: (lineId) => {
    let items = get().items.map((it) => {
      if (it.lineId !== lineId) return it;
      const integerPart = Math.floor(it.adet);
      const isHalf = it.adet > integerPart;
      // 1 → 1.5, 1.5 → 1, 2 → 2.5, 2.5 → 2, 0.5 → 0
      const newAdet = isHalf ? integerPart : integerPart + 0.5;
      return { ...it, adet: newAdet };
    });
    items = items.filter((it) => it.adet > 0);
    set({ items });
  },

  removeItem: (lineId) =>
    set({ items: get().items.filter((it) => it.lineId !== lineId) }),

  setNote: (lineId, notlar) => {
    const items = get().items.map((it) =>
      it.lineId === lineId ? { ...it, notlar } : it,
    );
    set({ items });
  },

  clear: () => set({ masaId: null, masaAd: null, items: [] }),

  total: () => get().items.reduce((sum, it) => sum + it.fiyat * it.adet, 0),
}));
