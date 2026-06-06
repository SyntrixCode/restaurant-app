import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  masaId: null,
  masaAd: null,
  items: [],

  start: (masaId, masaAd) => set({ masaId, masaAd, items: [] }),

  addItem: (product, initialNotes = '') => {
    const items = [...get().items];
    const existing = items.find((it) => it.productId === product.id);
    if (existing) {
      existing.adet += 1;
      // Mevcut notları koru, üzerine yazma. Garson düzenle butonundan değiştirebilir.
    } else {
      items.push({
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

  changeQuantity: (productId, delta) => {
    let items = [...get().items];
    const item = items.find((it) => it.productId === productId);
    if (!item) return;
    item.adet = Math.round((item.adet + delta) * 2) / 2; // 0.5 step'e snap
    if (item.adet <= 0) {
      items = items.filter((it) => it.productId !== productId);
    }
    set({ items });
  },

  toggleHalf: (productId) => {
    let items = get().items.map((it) => {
      if (it.productId !== productId) return it;
      const integerPart = Math.floor(it.adet);
      const isHalf = it.adet > integerPart;
      // 1 → 1.5, 1.5 → 1, 2 → 2.5, 2.5 → 2, 0.5 → 0
      const newAdet = isHalf ? integerPart : integerPart + 0.5;
      return { ...it, adet: newAdet };
    });
    items = items.filter((it) => it.adet > 0);
    set({ items });
  },

  removeItem: (productId) =>
    set({ items: get().items.filter((it) => it.productId !== productId) }),

  setNote: (productId, notlar) => {
    const items = get().items.map((it) =>
      it.productId === productId ? { ...it, notlar } : it,
    );
    set({ items });
  },

  clear: () => set({ masaId: null, masaAd: null, items: [] }),

  total: () => get().items.reduce((sum, it) => sum + it.fiyat * it.adet, 0),
}));
