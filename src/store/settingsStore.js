import { create } from 'zustand';
import { watchDoc, upsertDoc } from '../firebase/firestore';

const DEFAULTS = {
  gecikmeEsigiDk: 15,
  dusukStokEsigi: 5,
  restoranAd: 'Restoran',
  restoranAdres: '',
  restoranTel: '',
  vergiNo: '',
  vergiOrani: 10,
  paraBirimi: 'TL',
  kdvDahilFiyat: true,
  kasaAcilis: '08:00',
  kasaKapanis: '23:00',
  fisBasligi: '',
  fisAltMesaji: 'Teşekkür ederiz',
  otomatikFisBas: true,
  bildirimAyarlari: {
    gecikme: true,
    dusukStok: true,
    yeniPaket: true,
    callerID: true,
    rezervasyon: true,
    sesliUyari: true,
  },
  cardPaymentProvider: 'manual',
  cardTerminalIp: '',
  cardTerminalPort: 9100,
};

export const useSettingsStore = create((set) => ({
  settings: DEFAULTS,
  loading: true,
  unsub: null,

  init: () => {
    const unsub = watchDoc('settings', 'global', (data) => {
      set({ settings: { ...DEFAULTS, ...(data || {}) }, loading: false });
    });
    set({ unsub });
    return unsub;
  },

  save: async (patch) => {
    await upsertDoc('settings', 'global', patch);
  },
}));
