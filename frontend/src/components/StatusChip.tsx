export function StatusChip({ status }: { status: 'PENDING' | 'SUCCESS' | 'FAILED' }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`chip chip--${status}`}>{label}</span>;
}