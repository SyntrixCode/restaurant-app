import { Construction } from 'lucide-react';

export default function PosPlaceholder({ title, phase }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-slate-500">
      <Construction size={56} className="text-slate-300" />
      <h2 className="text-2xl font-semibold text-slate-700">{title}</h2>
      <p>Bu ekran henüz geliştirme aşamasında.</p>
      {phase && <p className="text-sm">Planlanan faz: {phase}</p>}
    </div>
  );
}
