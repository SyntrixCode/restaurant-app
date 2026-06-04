import { useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { changeAdminPassword } from '../../firebase/auth';

/**
 * Admin'in kendi şifresini değiştirme kartı (Settings sayfasında).
 * Mevcut şifre + yeni şifre + tekrar → Firebase Auth reauthenticate + updatePassword.
 */
export default function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Yeni şifre en az 6 karakter olmalı');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Yeni şifre tekrarı eşleşmiyor');
      return;
    }
    setBusy(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      toast.success('Şifre güncellendi');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const code = err?.code || '';
      const msg = code.includes('wrong-password') || code.includes('invalid-credential')
        ? 'Mevcut şifre hatalı'
        : code.includes('weak-password')
          ? 'Yeni şifre çok zayıf'
          : code.includes('requires-recent-login')
            ? 'Yeniden giriş yapın ve tekrar deneyin'
            : err?.message || 'Şifre güncellenemedi';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound size={18} className="text-slate-600" />
        <h3 className="text-base font-semibold text-slate-900">Hesap Şifresi</h3>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Mevcut şifrenizi girip yenisini belirleyin. Şifre değiştikten sonra "Beni Hatırla" da güncellenir.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Mevcut Şifre</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="input pr-10"
              placeholder="mevcut şifreniz"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Yeni Şifre</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="input pr-10"
              placeholder="en az 6 karakter"
              required
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
              tabIndex={-1}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Yeni Şifre (tekrar)</label>
          <input
            type={showNew ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            className="input"
            placeholder="yeni şifreyi tekrar girin"
            required
          />
        </div>

        <button
          type="submit"
          disabled={busy || !currentPassword || !newPassword || !confirmPassword}
          className="btn-primary w-full disabled:opacity-50"
        >
          {busy ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
        </button>
      </form>
    </div>
  );
}
