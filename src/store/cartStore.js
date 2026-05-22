import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  masaId: null,
  masaAd: null,
  items: [],

  start: (masaId, masaAd) => set({ masaId, masaAd, items: [] }),

  addItem: (product) => {
    const items = [...get().items];
    const existing = items.find((it) => it.productId === product.id);
    if (existing) {
      existing.adet += 1;
    } else {
      items.push({
        productId: product.id,
        ad: product.ad,
        fiyat: product.fiyat,
        adet: 1,
        notlar: '',
      });
    }
    set({ items });
  },

  changeQuantity: (productId, delta) => {
    let items = [...get().items];
    const item = items.find((it) => it.productId === productId);
    if (!item) return;
    item.adet += delta;
    if (item.adet <= 0) {
      items = items.filter((it) => it.productId !== productId);
    }
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
