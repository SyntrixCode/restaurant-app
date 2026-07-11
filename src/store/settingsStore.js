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

// Müşteri (QR/Instagram) menüsü anonim okur — bu alanlar settings/public'e aynalanır
// (settings/global anonim okumaya kapalı). Hassas config (vergi, kart IP vb.) dahil edilmez.
const PUBLIC_KEYS = [
  'restoranAd', 'restoranAdres', 'restoranTel', 'garsonCagirmaAcik',
  'instagramUrl', 'googleMapsUrl', 'whatsappNumarasi', 'calismaSaatleri', 'menuKarsilama', 'fisQrUrl',
];

export const useSettingsStore = create((set, get) => ({
  settings: DEFAULTS,
  loading: true,
  unsub: null,

  init: () => {
    // Tek abonelik — listener churn'ü (Firestore çok-sekmeli SDK'sını bozabilir) önlemek için
    // yeniden-bağlanma yok. permission-denied, watchDoc'un varsayılan hata yöneticisiyle
    // sessizce yutulur (uncaught spam olmaz).
    const unsub = watchDoc('settings', 'global', (data) => {
      set({ settings: { ...DEFAULTS, ...(data || {}) }, loading: false });
    });
    set({ unsub });
    return unsub;
  },

  save: async (patch) => {
    await upsertDoc('settings', 'global', patch);
    // Müşteri menüsü için güvenli alanları public aynaya yaz
    const merged = { ...get().settings, ...patch };
    const pub = {};
    PUBLIC_KEYS.forEach((k) => {
      if (merged[k] !== undefined) pub[k] = merged[k];
    });
    try {
      await upsertDoc('settings', 'public', pub);
    } catch (e) {
      console.warn('public ayar aynası yazılamadı:', e?.message || e);
    }
  },
}));
