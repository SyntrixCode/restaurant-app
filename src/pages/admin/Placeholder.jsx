import PageHeader from '../../components/layout/PageHeader';
import { Construction } from 'lucide-react';

export default function AdminPlaceholder({ title, phase }) {
  return (
    <div className="p-8">
      <PageHeader title={title} subtitle={phase ? `Geliştirme aşaması: ${phase}` : null} />
      <div className="card flex flex-col items-center justify-center gap-4 py-16 text-slate-500">
        <Construction size={48} className="text-slate-300" />
        <p>Bu sayfa henüz geliştirme aşamasında.</p>
        {phase && <p className="text-sm">Planlanan faz: {phase}</p>}
      </div>
    </div>
  );
}
