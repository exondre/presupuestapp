import { EntryData } from '../models/entry-data.model';
import { formatEntryAmount, formatEntryCompactDate, formatEntryMonth } from './entry-display.util';
import { resolveInstallmentDisplayDetailsFromEntry } from './recurrence-installment-display.util';

export type EntrySeriesType = 'indefinite' | 'installments';

export type EntrySeriesItemStatus = 'current' | 'registered' | 'projected' | 'excluded';

export interface EntrySeriesItemViewModel {
  occurrenceIndex: number;
  label: string;
  dateLabel: string;
  amountLabel: string;
  status: EntrySeriesItemStatus;
  entryId?: string;
}

export interface EntrySeriesViewModel {
  type: EntrySeriesType;
  title: string;
  subtitle: string;
  items: EntrySeriesItemViewModel[];
  totalCount: number;
  visibleCount: number;
  hiddenCount: number;
  currentInstallmentLabel?: string;
  endDateLabel?: string;
}

const indefiniteVisibleLimit = 12;

/**
 * Builds the series view model associated with the provided entry.
 *
 * @param entry Entry used as the current movement.
 * @param entries Entries available in storage.
 * @returns The series view model or null when the entry is not recurring.
 */
export function buildEntrySeriesViewModel(
  entry: EntryData,
  entries: EntryData[],
): EntrySeriesViewModel | null {
  const recurrence = entry.recurrence;
  if (!recurrence || recurrence.frequency !== 'monthly') {
    return null;
  }

  const associatedEntries = entries
    .filter((item) => item.recurrence?.recurrenceId === recurrence.recurrenceId)
    .sort(
      (a, b) =>
        (a.recurrence?.occurrenceIndex ?? 0) -
        (b.recurrence?.occurrenceIndex ?? 0),
    );

  if (recurrence.termination.mode === 'occurrences') {
    return buildInstallmentSeries(entry, associatedEntries);
  }

  return buildIndefiniteSeries(entry, associatedEntries);
}

/**
 * Adds months in UTC preserving the day/time components.
 *
 * @param date Base date.
 * @param months Number of months to add.
 * @returns The projected occurrence date.
 */
function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Builds the view model for an indefinite recurring series.
 *
 * @param entry Current entry.
 * @param associatedEntries Existing entries from the same series.
 * @returns The indefinite series view model.
 */
function buildIndefiniteSeries(
  entry: EntryData,
  associatedEntries: EntryData[],
): EntrySeriesViewModel {
  const totalCount = associatedEntries.length;
  const visibleEntries = resolveVisibleIndefiniteEntries(entry, associatedEntries);
  const items = visibleEntries.map((item) => buildRegisteredItem(item, entry.id));

  return {
    type: 'indefinite',
    title: 'Serie recurrente',
    subtitle: `Mensual · ${totalCount} ${totalCount === 1 ? 'movimiento generado' : 'movimientos generados'}`,
    items,
    totalCount,
    visibleCount: items.length,
    hiddenCount: Math.max(totalCount - items.length, 0),
  };
}

/**
 * Selects up to 12 entries for an indefinite series while keeping the current entry visible.
 *
 * @param entry Current entry.
 * @param associatedEntries Existing entries from the same series.
 * @returns The visible entries.
 */
function resolveVisibleIndefiniteEntries(
  entry: EntryData,
  associatedEntries: EntryData[],
): EntryData[] {
  if (associatedEntries.length <= indefiniteVisibleLimit) {
    return associatedEntries;
  }

  const currentIndex = Math.max(
    associatedEntries.findIndex((item) => item.id === entry.id),
    0,
  );
  const halfWindow = Math.floor(indefiniteVisibleLimit / 2);
  const start = Math.min(
    Math.max(currentIndex - halfWindow, 0),
    associatedEntries.length - indefiniteVisibleLimit,
  );

  return associatedEntries.slice(start, start + indefiniteVisibleLimit);
}

/**
 * Builds the view model for a finite installment series including projected items.
 *
 * @param entry Current entry.
 * @param associatedEntries Existing entries from the same series.
 * @returns The installment series view model.
 */
function buildInstallmentSeries(
  entry: EntryData,
  associatedEntries: EntryData[],
): EntrySeriesViewModel {
  const recurrence = entry.recurrence;
  if (!recurrence || recurrence.termination.mode !== 'occurrences') {
    throw new Error('Installment series requires an occurrences recurrence.');
  }

  const totalCount = recurrence.termination.total;
  const anchorDate = new Date(recurrence.anchorDate);
  const excludedOccurrences = recurrence.excludedOccurrences ?? [];
  const installmentDetails = resolveInstallmentDisplayDetailsFromEntry(entry);
  const items = Array.from({ length: totalCount }, (_, occurrenceIndex) => {
    const existingEntry = associatedEntries.find(
      (item) => item.recurrence?.occurrenceIndex === occurrenceIndex,
    );
    const projectedDate = addUtcMonths(anchorDate, occurrenceIndex);
    const isExcluded = excludedOccurrences.includes(occurrenceIndex);
    const status = resolveInstallmentStatus(entry.id, existingEntry, isExcluded);

    return {
      occurrenceIndex,
      label: `Cuota ${occurrenceIndex + 1}`,
      dateLabel: formatEntryCompactDate(existingEntry ? new Date(existingEntry.date) : projectedDate),
      amountLabel: formatEntryAmount(existingEntry?.amount ?? entry.amount),
      status,
      entryId: existingEntry?.id,
    };
  });

  return {
    type: 'installments',
    title: 'Serie de cuotas',
    subtitle: `${installmentDetails?.installmentLabel ?? `Cuota ${recurrence.occurrenceIndex + 1} de ${totalCount}`} · Termina en ${formatEntryMonth(installmentDetails?.lastOccurrenceDate ?? addUtcMonths(anchorDate, totalCount - 1))}`,
    items,
    totalCount,
    visibleCount: items.length,
    hiddenCount: 0,
    currentInstallmentLabel: installmentDetails?.installmentLabel,
    endDateLabel: formatEntryMonth(installmentDetails?.lastOccurrenceDate ?? addUtcMonths(anchorDate, totalCount - 1)),
  };
}

/**
 * Builds a registered series item for an existing entry.
 *
 * @param entry Entry to transform.
 * @param currentEntryId Identifier of the current entry.
 * @returns A registered series item view model.
 */
function buildRegisteredItem(entry: EntryData, currentEntryId: string): EntrySeriesItemViewModel {
  return {
    occurrenceIndex: entry.recurrence?.occurrenceIndex ?? 0,
    label: `Movimiento ${(entry.recurrence?.occurrenceIndex ?? 0) + 1}`,
    dateLabel: formatEntryCompactDate(new Date(entry.date)),
    amountLabel: formatEntryAmount(entry.amount),
    status: entry.id === currentEntryId ? 'current' : 'registered',
    entryId: entry.id,
  };
}

/**
 * Resolves the display status for an installment row.
 *
 * @param currentEntryId Identifier of the current entry.
 * @param existingEntry Matching stored entry when available.
 * @param isExcluded Whether this occurrence has been excluded.
 * @returns The installment row status.
 */
function resolveInstallmentStatus(
  currentEntryId: string,
  existingEntry: EntryData | undefined,
  isExcluded: boolean,
): EntrySeriesItemStatus {
  if (existingEntry?.id === currentEntryId) {
    return 'current';
  }

  if (isExcluded) {
    return 'excluded';
  }

  if (existingEntry) {
    return 'registered';
  }

  return 'projected';
}
