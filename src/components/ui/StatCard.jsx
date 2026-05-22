export default function StatCard({ label, value, color = 'slate', icon: Icon }) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };
  return (
    <div className="kpi-card flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`mt-1 text-3xl font-bold ${tones[color]}`}>{value}</p>
      </div>
      {Icon && <Icon className="text-slate-300" size={36} />}
    </div>
  );
}
