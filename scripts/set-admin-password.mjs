/**
 * Tek seferlik script — admin@restoran.com şifresini günceller.
 * Çalıştırma: node scripts/set-admin-password.mjs <yeni-şifre>
 *
 * Auth: Application Default Credentials (ADC).
 * Eğer çalışmazsa: `gcloud auth application-default login` veya
 * `firebase login` sonrası tekrar deneyin. Yine olmazsa Firebase Console'dan
 * manuel: https://console.firebase.google.com/project/alazligida-e77b9/authentication/users
 */
import admin from 'firebase-admin';

const PROJECT_ID = 'alazligida-e77b9';
const EMAIL = 'admin@restoran.com';
const newPassword = process.argv[2];

if (!newPassword) {
  console.error('Kullanım: node scripts/set-admin-password.mjs <yeni-şifre>');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('Şifre en az 6 karakter olmalı');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
} catch (e) {
  console.error('Firebase Admin init başarısız:', e.message);
  console.error('İpucu: gcloud auth application-default login');
  process.exit(1);
}

const user = await admin.auth().getUserByEmail(EMAIL);
console.log(`Bulundu: ${user.email} (uid=${user.uid})`);

await admin.auth().updateUser(user.uid, { password: newPassword });
console.log(`✓ ${EMAIL} şifresi güncellendi`);
process.exit(0);
