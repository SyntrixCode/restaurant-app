export default function PageHeader({ title, subtitle, actions }) {
  // Telefonda: başlık üstte, işlem butonları altta (sarılabilir). Eskiden yan yana dizilince
  // başlık daracık sütuna sıkışıyor, butonlar ekran dışına taşıyordu. sm+ eski yerleşim.
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}
