/**
 * "powered by {S} syntrixCode" — sistem genelinde footer/attribution metni.
 *
 * Logosuz, tipografi tabanlı. Renkler:
 *   { } = cyan accent (#06b6d4 = cyan-600)
 *   S, syntrix = koyu slate (#334155 / #475569)
 *   Code = cyan accent
 *
 * Kullanım:
 *   <PoweredBy />                — varsayılan (text-xs, slate-400)
 *   <PoweredBy size="sm" />      — biraz daha büyük (text-sm)
 *   <PoweredBy className="..." /> — ek class
 *   <PoweredBy mono />           — mono font (fiş için)
 */
export default function PoweredBy({ size = 'xs', className = '', mono = false }) {
  const sizeClass = size === 'sm' ? 'text-sm' : 'text-xs';
  const fontClass = mono ? 'font-mono' : '';
  return (
    <span
      className={`${sizeClass} ${fontClass} text-slate-400 ${className}`}
      aria-label="Powered by SyntrixCode"
    >
      powered by{' '}
      <span className="font-mono text-cyan-600">{'{'}</span>
      <span className="font-bold text-slate-700">S</span>
      <span className="font-mono text-cyan-600">{'}'}</span>{' '}
      <span className="font-semibold text-slate-700">syntrix</span>
      <span className="font-mono font-semibold text-cyan-600">Code</span>
    </span>
  );
}
