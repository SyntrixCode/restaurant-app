import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().min(1, 'Email zorunlu').email('Geçersiz email'),
  password: z.string().min(6, 'Şifre en az 6 karakter'),
  rememberMe: z.boolean().optional(),
});

export const userSchema = z.object({
  ad: z.string().min(2, 'Ad en az 2 karakter').max(100),
  rol: z.enum(['garson', 'kasiyer']),
  kod: z
    .string()
    .regex(/^\d{4}$/, '4 haneli sayı olmalı'),
  aktif: z.boolean(),
});

export const categorySchema = z.object({
  ad: z.string().min(1, 'Kategori adı zorunlu').max(100),
  aktif: z.boolean(),
  yaziciId: z.string().nullable().optional(),
});

export const productSchema = z.object({
  ad: z.string().min(1, 'Ürün adı zorunlu').max(200),
  categoryId: z.string().min(1, 'Kategori seçin'),
  fiyat: z.coerce.number().positive('Fiyat 0 dan büyük olmalı'),
  stok: z.coerce.number().int().min(0, 'Stok 0 veya pozitif'),
  dusukStokEsigi: z.coerce.number().int().nonnegative().nullable().optional(),
  aciklama: z.string().optional(),
  aktif: z.boolean(),
});

export const tableSchema = z.object({
  ad: z.string().min(1, 'Masa adı zorunlu').max(50),
  zone: z.string().min(1, 'Bölge seçin').max(50),
  kapasite: z.coerce.number().int().min(1).max(20),
});

export const reservationSchema = z.object({
  musteriAd: z.string().min(2, 'Ad en az 2 karakter').max(100),
  musteriTel: z
    .string()
    .min(7, 'Geçerli bir telefon girin')
    .max(20)
    .regex(/^[0-9\s+()-]+$/, 'Sadece rakam ve telefon karakterleri'),
  tarih: z.string().min(1, 'Tarih zorunlu'),
  saat: z.string().regex(/^\d{2}:\d{2}$/, 'Saat HH:MM formatında olmalı'),
  kisiSayisi: z.coerce.number().int().min(1, 'En az 1 kişi').max(50),
  notlar: z.string().max(200).optional(),
});

export const settingsSchema = z.object({
  restoranAd: z.string().min(1, 'Restoran adı zorunlu').max(100),
  restoranAdres: z.string().max(200).optional().or(z.literal('')),
  restoranTel: z.string().max(30).optional().or(z.literal('')),
  vergiNo: z.string().max(30).optional().or(z.literal('')),
  paraBirimi: z.string().min(1).max(10),
  vergiOrani: z.coerce.number().min(0, 'Vergi oranı 0 veya pozitif').max(100, 'En fazla %100'),
  kdvDahilFiyat: z.boolean(),
  kasaAcilis: z.string().regex(/^\d{2}:\d{2}$/, 'Saat HH:MM formatında olmalı'),
  kasaKapanis: z.string().regex(/^\d{2}:\d{2}$/, 'Saat HH:MM formatında olmalı'),
  gecikmeEsigiDk: z.coerce.number().int().min(1, 'En az 1 dk').max(180),
  dusukStokEsigi: z.coerce.number().int().min(0, '0 veya pozitif').max(1000),
  fisBasligi: z.string().max(50).optional().or(z.literal('')),
  fisAltMesaji: z.string().max(200).optional().or(z.literal('')),
  otomatikFisBas: z.boolean(),
  bildirimAyarlari: z.object({
    gecikme: z.boolean(),
    dusukStok: z.boolean(),
    yeniPaket: z.boolean(),
    callerID: z.boolean(),
    rezervasyon: z.boolean(),
    sesliUyari: z.boolean(),
  }),
});

export const ingredientSchema = z.object({
  ad: z.string().min(1, 'Malzeme adı zorunlu').max(100),
  birim: z.enum(['adet', 'kg', 'gram', 'lt', 'ml', 'paket']),
  stok: z.coerce.number().nonnegative('Stok 0 veya pozitif').default(0),
  dusukStokEsigi: z.coerce.number().nonnegative().optional().nullable(),
  birimMaliyet: z.coerce.number().nonnegative().optional().nullable(),
  tedarikciId: z.string().optional().or(z.literal('')),
  kategori: z.string().max(50).optional().or(z.literal('')),
  aktif: z.boolean(),
});

export const recipeSchema = z.object({
  productId: z.string().min(1),
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        miktar: z.coerce.number().positive(),
      }),
    )
    .min(1, 'Reçetede en az 1 malzeme olmalı'),
});

export const supplierSchema = z.object({
  ad: z.string().min(1, 'Tedarikçi adı zorunlu').max(100),
  iletisimAd: z.string().max(100).optional().or(z.literal('')),
  telefon: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Geçersiz email').max(100).optional().or(z.literal('')),
  adres: z.string().max(300).optional().or(z.literal('')),
  kategori: z.string().max(100).optional().or(z.literal('')),
  notlar: z.string().max(500).optional().or(z.literal('')),
  aktif: z.boolean(),
});

export const stockMovementManualSchema = z.object({
  productId: z.string().min(1, 'Ürün seçin'),
  tip: z.enum(['giris', 'cikis']),
  miktar: z.coerce.number().positive('Miktar 0\'dan büyük olmalı'),
  kaynak: z.enum(['manuel', 'fire', 'tedarik', 'iade', 'sayim']),
  tedarikciId: z.string().optional().or(z.literal('')),
  aciklama: z.string().max(300).optional().or(z.literal('')),
});

export const financeTxSchema = z.object({
  tarih: z.string().min(1, 'Tarih zorunlu'),
  tip: z.enum(['gelir', 'gider']),
  kategori: z.string().min(1, 'Kategori seçin'),
  miktar: z.coerce.number().positive('Tutar 0\'dan büyük olmalı'),
  aciklama: z.string().max(300).optional().or(z.literal('')),
  odemeYontemi: z.enum(['nakit', 'kart', 'havale', 'diger']).optional(),
  belgeNo: z.string().max(50).optional().or(z.literal('')),
});

export const paketSchema = z.object({
  musteriAd: z.string().min(2, 'Ad en az 2 karakter').max(100),
  musteriTel: z
    .string()
    .min(7, 'Telefon en az 7 karakter')
    .max(20)
    .regex(/^[0-9\s+()-]+$/, 'Sadece rakam ve telefon karakterleri'),
  musteriAdres: z.string().min(5, 'Adres en az 5 karakter').max(500),
  paketKaynak: z.enum(['manuel', 'telefon', 'yemeksepeti', 'getir', 'trendyol', 'diger']),
  paketNotlar: z.string().max(300).optional().or(z.literal('')),
});

export const campaignSchema = z.object({
  ad: z.string().min(1, 'Kampanya adı zorunlu').max(100),
  aciklama: z.string().max(300).optional().or(z.literal('')),
  indirimTipi: z.enum(['yuzde', 'sabit']),
  indirimDeger: z.coerce.number().positive('İndirim 0\'dan büyük olmalı'),
  minTutar: z.coerce.number().nonnegative().default(0),
  aktif: z.boolean(),
  baslangicTarih: z.string().optional().or(z.literal('')),
  bitisTarih: z.string().optional().or(z.literal('')),
  gunler: z.array(z.number().int().min(0).max(6)).default([]),
  baslangicSaat: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  bitisSaat: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
});

export const couponSchema = z.object({
  kod: z.string().min(2, 'Kod en az 2 karakter').max(30).regex(/^[A-Z0-9_-]+$/, 'Sadece büyük harf, rakam, _ veya -'),
  aciklama: z.string().max(200).optional().or(z.literal('')),
  indirimTipi: z.enum(['yuzde', 'sabit']),
  indirimDeger: z.coerce.number().positive('İndirim 0\'dan büyük olmalı'),
  minTutar: z.coerce.number().nonnegative().default(0),
  maxKullanim: z.coerce.number().int().nonnegative().default(0),
  sonGecerlilik: z.string().optional().or(z.literal('')),
  aktif: z.boolean(),
});

export const printerSchema = z.object({
  ad: z.string().min(1).max(50),
  model: z.string().default('SRP-E300'),
  ip: z
    .string()
    .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Geçerli IP girin (örn. 192.168.1.50)'),
  port: z.coerce.number().int().min(1).max(65535).default(9100),
  varsayilan: z.boolean(),
  aktif: z.boolean(),
});

export function randomCode4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
