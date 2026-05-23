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

export const printerSchema = z.object({
  ad: z.string().min(1).max(50),
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
