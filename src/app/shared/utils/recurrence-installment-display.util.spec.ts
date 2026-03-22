import { EntryData, EntryRecurrence, EntryType } from '../models/entry-data.model';
import {
  resolveInstallmentDisplayDetails,
  resolveInstallmentDisplayDetailsFromEntry,
} from './recurrence-installment-display.util';

/**
 * Builds a recurring entry fixture used by installment display tests.
 *
 * @param recurrenceOverrides Recurrence overrides applied to the default fixture.
 * @returns A recurring entry fixture.
 */
function buildRecurringEntry(
  recurrenceOverrides: Partial<EntryRecurrence> = {},
): EntryData {
  return {
    id: 'entry-1',
    amount: 142999,
    date: '2026-03-25T00:00:00.000Z',
    type: EntryType.EXPENSE,
    recurrence: {
      recurrenceId: 'recurrence-1',
      anchorDate: '2025-09-25T00:00:00.000Z',
      occurrenceIndex: 6,
      frequency: 'monthly',
      termination: {
        mode: 'occurrences',
        total: 10,
      },
      excludedOccurrences: [],
      ...recurrenceOverrides,
    },
  };
}

describe('recurrence installment display util', () => {
  it('resolves cuota 7 de 10 and the last occurrence in June 2026 for the real CMR scenario', () => {
    const entry = buildRecurringEntry();

    const details = resolveInstallmentDisplayDetailsFromEntry(entry);

    expect(details).not.toBeNull();
    expect(details?.installmentNumber).toBe(7);
    expect(details?.totalInstallments).toBe(10);
    expect(details?.installmentLabel).toBe('Cuota 7 de 10');
    expect(details?.lastOccurrenceDate.toISOString()).toBe('2026-06-25T00:00:00.000Z');
  });

  it('returns null for indefinite recurrence', () => {
    const entry = buildRecurringEntry({
      termination: { mode: 'indefinite' },
    });

    const details = resolveInstallmentDisplayDetailsFromEntry(entry);

    expect(details).toBeNull();
  });

  it('returns null when occurrence index is outside the recurrence total', () => {
    const entry = buildRecurringEntry({
      occurrenceIndex: 11,
    });

    const details = resolveInstallmentDisplayDetailsFromEntry(entry);

    expect(details).toBeNull();
  });

  it('returns null when anchor date is invalid', () => {
    const entry = buildRecurringEntry({
      anchorDate: 'invalid-date',
    });

    const details = resolveInstallmentDisplayDetailsFromEntry(entry);

    expect(details).toBeNull();
  });

  it('returns null when recurrence metadata is missing', () => {
    const details = resolveInstallmentDisplayDetails(undefined);

    expect(details).toBeNull();
  });
});
