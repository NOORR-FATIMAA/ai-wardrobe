/** Local calendar date as YYYY-MM-DD, offset by whole days. */
export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Today", "Tomorrow", "Yesterday" or e.g. "Thu 30 Oct". */
export function dayLabel(isoDate: string): string {
  if (isoDate === localDate(0)) return 'Today';
  if (isoDate === localDate(1)) return 'Tomorrow';
  if (isoDate === localDate(-1)) return 'Yesterday';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function nextDays(count: number, from = 0): string[] {
  return Array.from({ length: count }, (_, i) => localDate(from + i));
}
