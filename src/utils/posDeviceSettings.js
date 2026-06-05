/**
 * Bu POS tabletine özel ayarlar — localStorage'da saklanır.
 * 3 tablet (kasa + 2 garson) olduğu için adisyon yazıcısı tablet başına farklı.
 */

const ADISYON_KEY = 'posDeviceAdisyonPrinterId';
const STATION_NAME_KEY = 'posDeviceStationName';

export function getDeviceAdisyonPrinterId() {
  try {
    return localStorage.getItem(ADISYON_KEY) || null;
  } catch {
    return null;
  }
}

export function setDeviceAdisyonPrinterId(id) {
  try {
    if (id) localStorage.setItem(ADISYON_KEY, id);
    else localStorage.removeItem(ADISYON_KEY);
  } catch {}
}

export function getDeviceStationName() {
  try {
    return localStorage.getItem(STATION_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setDeviceStationName(name) {
  try {
    if (name) localStorage.setItem(STATION_NAME_KEY, name);
    else localStorage.removeItem(STATION_NAME_KEY);
  } catch {}
}

/**
 * Adisyon basacak yazıcıyı seç:
 * 1. Cihaz tercihi (localStorage) varsa onu — silinmemişse
 * 2. Yoksa adisyonBas:true + varsayilan:true olan
 * 3. Yoksa adisyonBas:true ilk aktif yazıcı
 * 4. Yoksa null (yazıcı yok / iMin fallback'e düşer)
 */
export function pickAdisyonPrinter(printers) {
  if (!Array.isArray(printers) || printers.length === 0) return null;
  const usable = printers.filter(
    (p) => p && p.aktif && (p.ip || p.baglanti === 'usb'),
  );
  if (usable.length === 0) return null;
  const prefId = getDeviceAdisyonPrinterId();
  if (prefId) {
    const found = usable.find((p) => p.id === prefId);
    if (found) return found;
    // Cihaz tercihi varlığını yitirdi — temizle
    setDeviceAdisyonPrinterId(null);
  }
  const adisyonOnly = usable.filter((p) => p.adisyonBas);
  if (adisyonOnly.length > 0) {
    return adisyonOnly.find((p) => p.varsayilan) || adisyonOnly[0];
  }
  // adisyonBas işaretli yoksa eski davranış — herhangi bir aktif yazıcı (geriye uyumluluk)
  return usable.find((p) => p.varsayilan) || usable[0];
}
