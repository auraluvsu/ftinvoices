export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
