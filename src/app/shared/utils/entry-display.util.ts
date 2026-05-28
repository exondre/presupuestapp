const chileTimeZone = 'America/Santiago';

const amountFormatter = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: chileTimeZone,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const compactDateFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: chileTimeZone,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: chileTimeZone,
  hour: '2-digit',
  minute: '2-digit',
});

const monthFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: chileTimeZone,
  month: 'long',
  year: 'numeric',
});

/**
 * Formats the amount into the Chilean peso representation used by entries.
 *
 * @param amount Amount to format.
 * @returns A formatted CLP amount string.
 */
export function formatEntryAmount(amount: number): string {
  return `$${amountFormatter.format(amount).replace(/\u00a0/g, ' ')}`;
}

/**
 * Resolves the fallback description shown for entries without text.
 *
 * @param description Optional entry description.
 * @returns The description or a display-safe fallback.
 */
export function resolveEntryDescription(description: string | undefined): string {
  const trimmed = (description ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Sin descripción';
}

/**
 * Formats an entry date as a complete localized date label.
 *
 * @param date Date to format.
 * @returns A localized date label or an empty string when invalid.
 */
export function formatEntryDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return dateFormatter.format(date).replace('.', '').toLowerCase();
}

/**
 * Formats an entry date as a compact localized date label.
 *
 * @param date Date to format.
 * @returns A compact localized date label or an empty string when invalid.
 */
export function formatEntryCompactDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return compactDateFormatter.format(date).replace('.', '').toLowerCase();
}

/**
 * Formats an entry time using Chile's timezone.
 *
 * @param date Date used to extract the time.
 * @returns The formatted time string or an empty string when invalid.
 */
export function formatEntryTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return timeFormatter.format(date).toLowerCase();
}

/**
 * Formats an entry date-time using separate date and time labels.
 *
 * @param date Date to format.
 * @returns A localized date-time label or an empty string when invalid.
 */
export function formatEntryDateTime(date: Date): string {
  const dateLabel = formatEntryDate(date);
  const timeLabel = formatEntryTime(date);
  if (!dateLabel || !timeLabel) {
    return '';
  }

  return `${dateLabel}, ${timeLabel}`;
}

/**
 * Formats a month-year label using Chile's timezone.
 *
 * @param date Date whose month should be formatted.
 * @returns A localized month-year label or an empty string when invalid.
 */
export function formatEntryMonth(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return monthFormatter.format(date).toLowerCase();
}
