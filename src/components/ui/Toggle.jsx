export default function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <span className="relative inline-flex h-6 w-11 items-center">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600" />
        <span className="absolute left-0.5 h-5 w-5 transform rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}
