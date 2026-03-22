import { EntryData, EntryRecurrence } from '../models/entry-data.model';

/**
 * Describes the installment details derived from a recurring entry.
 */
export interface InstallmentDisplayDetails {
  installmentNumber: number;
  totalInstallments: number;
  installmentLabel: string;
  lastOccurrenceDate: Date;
}

/**
 * Resolves installment information from a full entry when available.
 *
 * @param entry Entry used to derive installment display details.
 * @returns Installment details or null when the entry does not represent a finite monthly series.
 */
export function resolveInstallmentDisplayDetailsFromEntry(
  entry: EntryData,
): InstallmentDisplayDetails | null {
  return resolveInstallmentDisplayDetails(entry.recurrence);
}

/**
 * Resolves installment information from recurrence metadata.
 *
 * @param recurrence Recurrence metadata stored in an entry.
 * @returns Installment details or null when metadata is incomplete or inconsistent.
 */
export function resolveInstallmentDisplayDetails(
  recurrence: EntryRecurrence | undefined,
): InstallmentDisplayDetails | null {
  if (!recurrence || recurrence.frequency !== 'monthly') {
    return null;
  }

  if (recurrence.termination.mode !== 'occurrences') {
    return null;
  }

  const totalInstallments = recurrence.termination.total;
  if (!Number.isInteger(totalInstallments) || totalInstallments < 1) {
    return null;
  }

  const occurrenceIndex = recurrence.occurrenceIndex;
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
    return null;
  }

  const installmentNumber = occurrenceIndex + 1;
  if (installmentNumber > totalInstallments) {
    return null;
  }

  const anchorDate = new Date(recurrence.anchorDate);
  if (Number.isNaN(anchorDate.getTime())) {
    return null;
  }

  return {
    installmentNumber,
    totalInstallments,
    installmentLabel: `Cuota ${installmentNumber} de ${totalInstallments}`,
    lastOccurrenceDate: addUtcMonths(anchorDate, totalInstallments - 1),
  };
}

/**
 * Adds months in UTC preserving the day/time components.
 *
 * @param baseDate Date used as calculation base.
 * @param months Number of months to add.
 * @returns A new Date with the offset applied.
 */
function addUtcMonths(baseDate: Date, months: number): Date {
  const result = new Date(baseDate);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
