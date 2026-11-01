export default function StatCard({ label, value, color = 'slate', icon: Icon }) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    emerald: 'text-emerald-600',
    red: 'text-red-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };
  // Telefonda kompakt: küçük sayı, ikon gizli → 2'li ızgarada kartlar sığar. sm+ eski görünüm.
  return (
    <div className="kpi-card flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 sm:text-xs">{label}</p>
        <p className={`mt-1 break-words text-xl font-bold sm:text-3xl ${tones[color]}`}>{value}</p>
      </div>
      {Icon && <Icon className="hidden shrink-0 text-slate-300 sm:block" size={36} />}
    </div>
  );
}
