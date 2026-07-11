import { useEffect, useRef, useState } from 'react';

/**
 * Hareketsizlik (idle) sayacı + otomatik çıkış.
 * Kullanıcı belirtilen süre boyunca hiçbir işlem yapmazsa onTimeout tetiklenir.
 * Dokunma/tıklama/tuş/kaydırma "işlem" sayılır; fare hareketi sayılmaz (gürültülü).
 *
 * @param {{ timeoutMs?: number, onTimeout: () => void, enabled?: boolean }} opts
 * @returns {number} kalan milisaniye (sayaç gösterimi için)
 */
export function useIdleLogout({ timeoutMs = 120000, onTimeout, enabled = true }) {
  const [remainingMs, setRemainingMs] = useState(timeoutMs);
  const lastRef = useRef(Date.now());
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) {
      setRemainingMs(timeoutMs);
      return;
    }
    lastRef.current = Date.now();
    firedRef.current = false;
    setRemainingMs(timeoutMs);

    const reset = () => {
      lastRef.current = Date.now();
      firedRef.current = false;
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'click', 'scroll', 'wheel'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }));

    const id = setInterval(() => {
      const left = timeoutMs - (Date.now() - lastRef.current);
      setRemainingMs(left > 0 ? left : 0);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeoutRef.current?.();
      }
    }, 1000);

    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, reset, { capture: true }));
    };
  }, [timeoutMs, enabled]);

  return remainingMs;
}
