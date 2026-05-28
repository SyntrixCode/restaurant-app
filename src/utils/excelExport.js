import * as XLSX from 'xlsx';

/**
 * Genel Excel (.xlsx) dışa aktarma yardımcısı.
 *
 * @param {string} fileName - dosya adı (.xlsx eklenir)
 * @param {Array<{name:string, rows:Array<Object>}>} sheets - her biri bir sayfa
 */
export function exportExcel(fileName, sheets) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows || []);
    // Sütun genişliklerini otomatik ayarla (basit)
    const cols = Object.keys((sheet.rows && sheet.rows[0]) || {});
    ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, (sheet.name || 'Sayfa').slice(0, 31));
  }
  const name = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, name);
}

/**
 * Arşivlenen siparişleri Excel'e aktarır.
 */
export function exportArchivedOrders(orders, fileName = 'arsiv') {
  const rows = orders.map((o) => {
    const ts = o.tamamlandiZamani?.toDate
      ? o.tamamlandiZamani.toDate()
      : new Date(o.tamamlandiZamani || Date.now());
    return {
      Tarih: ts.toLocaleDateString('tr-TR'),
      Saat: ts.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      Masa: o.masaAd || 'Paket',
      Garson: o.garsonAd || '',
      Kişi: o.kisiSayisi || '',
      'Ürün Sayısı': o.items?.length || 0,
      'Ara Toplam': Number(o.araToplam || 0),
      İndirim: Number(o.indirim || 0),
      Toplam: Number(o.toplam || 0),
      Ödeme: (o.odemeYontemleri || []).join('+'),
      Durum: o.iptal?.edildi ? 'İPTAL' : 'Tamamlandı',
      'Fiş No': o.id.slice(0, 8).toUpperCase(),
    };
  });
  exportExcel(fileName, [{ name: 'Arşiv', rows }]);
}

/**
 * Ürün satış raporunu Excel'e aktarır.
 */
export function exportProductSales(productRows, fileName = 'urun-satis') {
  exportExcel(fileName, [{ name: 'Ürün Satış', rows: productRows }]);
}

/**
 * Satır dizisini CSV olarak indirir (muhasebe yazılımı import'u için).
 * Türkçe Excel uyumu: ayraç ';' ve başına UTF-8 BOM eklenir.
 */
export function exportCSV(rows, fileName = 'export', { delimiter = ';' } = {}) {
  const list = rows || [];
  const headers = list.length ? Object.keys(list[0]) : [];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(delimiter),
    ...list.map((r) => headers.map((h) => esc(r[h])).join(delimiter)),
  ];
  const csv = '﻿' + lines.join('\r\n'); // BOM + CRLF
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
