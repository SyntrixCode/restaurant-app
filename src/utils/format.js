import { format as fmtDate, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

export function formatTL(value) {
  if (value == null || isNaN(value)) return '0,00 TL';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(date, pattern = 'dd.MM.yyyy HH:mm') {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return fmtDate(d, pattern, { locale: tr });
}

export function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

export function minutesSince(date) {
  if (!date) return 0;
  const d = date.toDate ? date.toDate() : new Date(date);
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export function formatAdet(n) {
  if (n == null || isNaN(n)) return '0';
  // 1 → "1", 1.5 → "1,5", 2.5 → "2,5"
  return n % 1 === 0 ? String(n) : n.toFixed(1).replace('.', ',');
}
