/**
 * Admin "Beni Hatırla" — credential'ı Capacitor Preferences'a yazar.
 *
 * Neden Firebase persistence değil de bu? Capacitor WebView'da Firebase'in
 * IDB/localStorage persistence'ı güvenilmez; uygulama tamamen kapanınca bazen
 * restore edemiyor. Preferences native Android SharedPreferences kullanıyor,
 * uygulama silinene kadar kalıcı. Storage sandbox'lı — başka uygulamalar okuyamaz.
 *
 * Web ortamında localStorage fallback'ine düşer (Capacitor web shim).
 */
import { Preferences } from '@capacitor/preferences';

const KEY_EMAIL = 'syntrixpos.admin.remember.email';
const KEY_PASSWORD = 'syntrixpos.admin.remember.password';

export async function saveAdminCredentials(email, password) {
  await Preferences.set({ key: KEY_EMAIL, value: email });
  await Preferences.set({ key: KEY_PASSWORD, value: password });
}

export async function getAdminCredentials() {
  const [{ value: email }, { value: password }] = await Promise.all([
    Preferences.get({ key: KEY_EMAIL }),
    Preferences.get({ key: KEY_PASSWORD }),
  ]);
  if (!email || !password) return null;
  return { email, password };
}

export async function clearAdminCredentials() {
  await Promise.all([
    Preferences.remove({ key: KEY_EMAIL }),
    Preferences.remove({ key: KEY_PASSWORD }),
  ]);
}
