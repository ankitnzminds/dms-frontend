export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dateFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dateTimeFmt.format(new Date(iso));
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '-';
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(iso);
}

/** "expires in 6 days" / "expired 2 days ago" / "No expiry". */
export function formatExpiry(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'No expiry';
  const ms = new Date(iso).getTime() - now;
  const days = Math.ceil(ms / 86400000);
  if (ms <= 0) return `Expired ${formatRelative(iso, now)}`;
  if (days <= 1) {
    const hours = Math.max(1, Math.ceil(ms / 3600000));
    return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `Expires in ${days} days`;
}

export function titleCase(s: string): string {
  const t = s.replace(/[_-]+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
