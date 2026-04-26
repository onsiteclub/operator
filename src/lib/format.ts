/**
 * Shared formatting utilities — ported from onsite-timekeeper.
 * Used by Calendar (formatCompact), day modal, and the future invoice
 * wizard (formatMoney, BREAK_PRESETS).
 */

/** Format a Date to "h:mm AM/PM" */
export function formatTimeDisplay(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}

/** Split time into { time: "8:00", period: "AM" } for card display */
export function splitTimeDisplay(date: Date): { time: string; period: string } {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, '0');
  return { time: `${h}:${m}`, period: ampm };
}

/** Format minutes as compact string: "2h30" or "45m" or "3h" */
export function formatCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

/** Format amount as "$1,234.56" */
export function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Get 1-2 letter initials from a name */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Standard break presets for time entry */
export const BREAK_PRESETS = [
  { label: 'No break', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
];
