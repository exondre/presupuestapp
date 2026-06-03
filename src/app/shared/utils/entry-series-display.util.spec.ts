import { EntryData, EntryType } from '../models/entry-data.model';
import { buildEntrySeriesViewModel } from './entry-series-display.util';

/**
 * Creates an entry fixture with optional overrides.
 *
 * @param overrides Optional partial entry data.
 * @returns A complete entry fixture.
 */
function buildEntry(overrides: Partial<EntryData> = {}): EntryData {
  return {
    id: overrides.id ?? 'entry-id',
    amount: overrides.amount ?? 1000,
    date: overrides.date ?? '2026-01-15T10:00:00.000Z',
    type: overrides.type ?? EntryType.EXPENSE,
    description: overrides.description,
    recurrence: overrides.recurrence,
  };
}

describe('buildEntrySeriesViewModel', () => {
  it('should return null for non-recurring entries', () => {
    const viewModel = buildEntrySeriesViewModel(buildEntry(), []);

    expect(viewModel).toBeNull();
  });

  it('should limit indefinite recurring series to 12 visible entries', () => {
    const entries = Array.from({ length: 15 }, (_, index) =>
      buildEntry({
        id: `entry-${index}`,
        date: `2026-${String(index + 1).padStart(2, '0')}-15T10:00:00.000Z`,
        recurrence: {
          recurrenceId: 'recurrence-id',
          anchorDate: '2026-01-15T10:00:00.000Z',
          occurrenceIndex: index,
          frequency: 'monthly',
          termination: { mode: 'indefinite' },
        },
      }),
    );

    const viewModel = buildEntrySeriesViewModel(entries[8], entries);

    expect(viewModel?.type).toBe('indefinite');
    expect(viewModel?.items.length).toBe(12);
    expect(viewModel?.hiddenCount).toBe(3);
    expect(viewModel?.items.some((item) => item.status === 'current')).toBeTrue();
  });

  it('should project every installment in finite series', () => {
    const current = buildEntry({
      id: 'entry-1',
      recurrence: {
        recurrenceId: 'installment-id',
        anchorDate: '2026-01-15T10:00:00.000Z',
        occurrenceIndex: 1,
        frequency: 'monthly',
        termination: { mode: 'occurrences', total: 4 },
        excludedOccurrences: [3],
      },
    });
    const first = buildEntry({
      id: 'entry-0',
      recurrence: {
        recurrenceId: 'installment-id',
        anchorDate: '2026-01-15T10:00:00.000Z',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'occurrences', total: 4 },
        excludedOccurrences: [3],
      },
    });

    const viewModel = buildEntrySeriesViewModel(current, [current, first]);

    expect(viewModel?.type).toBe('installments');
    expect(viewModel?.items.length).toBe(4);
    expect(viewModel?.items.map((item) => item.status)).toEqual([
      'registered',
      'current',
      'projected',
      'excluded',
    ]);
    expect(viewModel?.hiddenCount).toBe(0);
  });
});
