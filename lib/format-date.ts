const cairoDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Cairo',
});

function dateParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Object.fromEntries(
    cairoDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function formatCairoDate(value: string | Date) {
  const parts = dateParts(value);
  if (!parts) return '—';
  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatCairoDateTime(value: string | Date) {
  const parts = dateParts(value);
  if (!parts) return '—';
  return `${parts.day}/${parts.month}/${parts.year}، ${parts.hour}:${parts.minute}`;
}

export function formatUtcDayMonth(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}`;
}
