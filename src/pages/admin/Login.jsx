import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { loginAdmin } from '../../firebase/auth';
import { adminLoginSchema } from '../../utils/validators';
import { useAuthStore } from '../../store/authStore';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 60_000;

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, loading } = useAuthStore();
  const [showPwd, setShowPwd] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  useEffect(() => {
    if (!loading && user) navigate('/admin/dashboard', { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const isLocked = lockedUntil > now;
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  const onSubmit = async ({ email, password, rememberMe }) => {
    if (isLocked) return;
    try {
      await loginAdmin(email, password, rememberMe);
      setAttempts(0);
      toast.success('Giriş başarılı');
    } catch (err) {
      const tries = attempts + 1;
      setAttempts(tries);
      if (tries >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCK_DURATION);
        setAttempts(0);
        toast.error('Çok fazla hatalı deneme. 60 saniye kilitli.');
      } else {
        toast.error(`Email veya şifre hatalı (${tries}/${MAX_ATTEMPTS})`);
      }
      console.error(err);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <ShieldCheck className="text-blue-600" size={28} />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-wide text-slate-900">
            SyntrixPos
          </h1>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Admin Girişi</h2>
          <p className="mt-1 text-sm text-slate-500">Yönetim panelinize hoş geldiniz</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              autoComplete="email"
              {...register('email')}
              className="input"
              placeholder="admin@restoran.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Şifre</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                {...register('password')}
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...register('rememberMe')} className="h-4 w-4 rounded" />
            Beni Hatırla (30 gün)
          </label>

          {isLocked && (
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">
              Hesap geçici olarak kilitlendi. {remaining} saniye sonra tekrar deneyin.
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isLocked}
            className="btn-primary w-full text-base disabled:opacity-60"
          >
            {isSubmitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/pos/login" className="text-sm text-blue-600 hover:underline">
            POS Cihazı Girişi →
          </a>
        </div>
      </div>
    </div>
  );
}
