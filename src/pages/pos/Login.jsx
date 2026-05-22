import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Delete, Check } from 'lucide-react';
import { loginPos } from '../../firebase/auth';
import { useAuthStore } from '../../store/authStore';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 60_000;
const DEVICE_NAME = import.meta.env.VITE_DEVICE_NAME || 'POS Cihazı';

export default function PosLogin() {
  const navigate = useNavigate();
  const { user, loading } = useAuthStore();
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate('/pos/tables', { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const isLocked = lockedUntil > now;
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (code.length === 4) submit(code);
  }, [code]);

  const handleKey = (digit) => {
    if (isLocked || busy) return;
    if (code.length < 4) setCode((c) => c + digit);
  };

  const clearAll = () => setCode('');

  const submit = async (kod) => {
    setBusy(true);
    try {
      await loginPos(kod);
      setAttempts(0);
      toast.success('Hoşgeldiniz');
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      const tries = attempts + 1;
      setAttempts(tries);
      setCode('');
      if (navigator.vibrate) navigator.vibrate(200);
      if (tries >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCK_DURATION);
        setAttempts(0);
        toast.error('Çok fazla hatalı deneme. 60 saniye kilitli.');
      } else {
        toast.error(`Kod hatalı (${tries}/${MAX_ATTEMPTS})`);
      }
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-900 p-4 text-white">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold">Restoran POS</h1>
        <p className="mt-1 text-slate-400">Kodunuzu Girin</p>
      </div>

      <div className={`mb-6 flex gap-3 ${shake ? 'animate-pulse' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex h-16 w-14 items-center justify-center rounded-xl border-2 text-3xl font-bold transition ${
              code.length > i
                ? 'border-blue-500 bg-blue-500/20'
                : 'border-slate-600 bg-slate-800'
            }`}
          >
            {code[i] ? '•' : ''}
          </div>
        ))}
      </div>

      {isLocked && (
        <div className="mb-4 rounded-lg bg-red-900/60 px-4 py-2 text-sm text-red-200">
          Cihaz kilitli. {remaining}s sonra tekrar deneyin.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <Keypad key={n} label={String(n)} onClick={() => handleKey(String(n))} disabled={isLocked || busy} />
        ))}
        <Keypad icon={Delete} onClick={clearAll} disabled={isLocked || busy} kind="ghost" />
        <Keypad label="0" onClick={() => handleKey('0')} disabled={isLocked || busy} />
        <Keypad icon={Check} onClick={() => code.length === 4 && submit(code)} disabled={isLocked || busy || code.length !== 4} kind="primary" />
      </div>

      <div className="mt-8 text-center text-xs text-slate-500">
        <p>{DEVICE_NAME}</p>
        <a href="/admin/login" className="mt-2 inline-block text-blue-400 hover:underline">
          Admin Girişi →
        </a>
      </div>
    </div>
  );
}

function Keypad({ label, icon: Icon, onClick, disabled, kind }) {
  const styles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    ghost: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
    default: 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700',
  };
  const cls = styles[kind || 'default'];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-semibold transition active:scale-95 disabled:opacity-40 ${cls}`}
    >
      {Icon ? <Icon size={28} /> : label}
    </button>
  );
}
