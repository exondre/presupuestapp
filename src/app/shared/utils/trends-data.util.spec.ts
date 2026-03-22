import { EntryData, EntryType } from '../models/entry-data.model';
import {
  buildMonthKey,
  buildTrendsData,
  resolveLastInstallmentMonth,
  TrendsChartData,
} from './trends-data.util';

/**
 * Builds a basic expense entry fixture.
 *
 * @param overrides Partial overrides for the entry.
 * @returns An EntryData fixture.
 */
function buildEntry(overrides: Partial<EntryData> = {}): EntryData {
  return {
    id: 'e-1',
    amount: 10000,
    date: '2026-03-15T12:00:00.000Z',
    type: EntryType.EXPENSE,
    ...overrides,
  };
}

/**
 * Builds an installment expense entry fixture.
 *
 * @param anchorDate ISO date string for the recurrence anchor.
 * @param occurrenceIndex Current occurrence index (0-based).
 * @param total Total number of occurrences.
 * @param amount Entry amount.
 * @param recurrenceId Unique recurrence identifier.
 * @returns An EntryData fixture with installment recurrence.
 */
function buildInstallmentEntry(
  anchorDate: string,
  occurrenceIndex: number,
  total: number,
  amount: number = 50000,
  recurrenceId: string = 'rec-1',
): EntryData {
  const entryDate = new Date(anchorDate);
  entryDate.setUTCMonth(entryDate.getUTCMonth() + occurrenceIndex);

  return buildEntry({
    id: `e-inst-${recurrenceId}-${occurrenceIndex}`,
    amount,
    date: entryDate.toISOString(),
    recurrence: {
      recurrenceId,
      anchorDate,
      occurrenceIndex,
      frequency: 'monthly',
      termination: { mode: 'occurrences', total },
    },
  });
}

/**
 * Builds a recurring indefinite expense entry fixture.
 *
 * @param date ISO date string for the entry.
 * @param amount Entry amount.
 * @returns An EntryData fixture with indefinite recurrence.
 */
function buildRecurringEntry(
  date: string,
  amount: number = 30000,
): EntryData {
  return buildEntry({
    id: `e-rec-${date}`,
    amount,
    date,
    recurrence: {
      recurrenceId: 'rec-indef-1',
      anchorDate: '2025-01-15T12:00:00.000Z',
      occurrenceIndex: 0,
      frequency: 'monthly',
      termination: { mode: 'indefinite' },
    },
  });
}

/**
 * Creates a reference Date and a map of month entries for the given month entries.
 *
 * @param now The reference date.
 * @param entries Entries to distribute into a month map.
 * @returns A map keyed by YYYY-MM with entries for each month.
 */
function buildMonthMap(
  now: Date,
  entries: EntryData[],
): Map<string, EntryData[]> {
  const map = new Map<string, EntryData[]>();

  // Initialize the 3 past/current months
  for (let i = -2; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = buildMonthKey(d);
    map.set(key, []);
  }

  // Distribute entries into matching months
  for (const entry of entries) {
    const entryDate = new Date(entry.date);
    if (Number.isNaN(entryDate.getTime())) continue;
    const key = buildMonthKey(entryDate);
    if (map.has(key)) {
      map.get(key)!.push(entry);
    }
  }

  return map;
}

describe('trends data util', () => {
  // Use a fixed "now" for deterministic tests: March 15, 2026
  const now = new Date(2026, 2, 15);
  const currentKey = buildMonthKey(now);

  describe('buildMonthKey', () => {
    it('returns YYYY-MM format', () => {
      const key = buildMonthKey(new Date('2026-03-15T12:00:00.000Z'));
      expect(key).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('resolveLastInstallmentMonth', () => {
    it('returns null when no entries', () => {
      expect(resolveLastInstallmentMonth([])).toBeNull();
    });

    it('returns null when no installment entries exist', () => {
      const entries = [
        buildEntry({ type: EntryType.INCOME }),
        buildEntry(),
        buildRecurringEntry('2026-03-15T12:00:00.000Z'),
      ];
      expect(resolveLastInstallmentMonth(entries)).toBeNull();
    });

    it('returns the last month of an installment series', () => {
      // Anchor: Sep 2025, total: 10 → last occurrence: Jun 2026 (index 9)
      const entry = buildInstallmentEntry(
        '2025-09-25T00:00:00.000Z', 6, 10,
      );
      const result = resolveLastInstallmentMonth([entry]);
      expect(result).toEqual({ month: 6, year: 2026 });
    });

    it('returns the farthest month across multiple installment series', () => {
      const entry1 = buildInstallmentEntry(
        '2025-09-25T00:00:00.000Z', 6, 10, 50000, 'rec-1',
      ); // ends Jun 2026
      const entry2 = buildInstallmentEntry(
        '2026-01-15T00:00:00.000Z', 2, 12, 30000, 'rec-2',
      ); // ends Dec 2026
      const result = resolveLastInstallmentMonth([entry1, entry2]);
      expect(result).toEqual({ month: 12, year: 2026 });
    });

    it('returns null for entries with invalid anchor dates', () => {
      const entry = buildEntry({
        id: 'e-invalid',
        amount: 50000,
        date: '2026-03-15T12:00:00.000Z',
        recurrence: {
          recurrenceId: 'rec-invalid',
          anchorDate: 'invalid-date',
          occurrenceIndex: 0,
          frequency: 'monthly',
          termination: { mode: 'occurrences', total: 5 },
        },
      });
      expect(resolveLastInstallmentMonth([entry])).toBeNull();
    });
  });

  describe('buildTrendsData', () => {
    describe('month range', () => {
      it('returns exactly 3 months when no installment entries exist', () => {
        const map = buildMonthMap(now, []);
        const result = buildTrendsData(map, [], now);
        expect(result.months.length).toBe(3);
      });

      it('includes current month and 2 prior months', () => {
        const map = buildMonthMap(now, []);
        const result = buildTrendsData(map, [], now);

        expect(result.months[0].monthKey).toBe('2026-01');
        expect(result.months[1].monthKey).toBe('2026-02');
        expect(result.months[2].monthKey).toBe('2026-03');
      });

      it('extends to future months when installment entries have remaining occurrences', () => {
        // Anchor: Jan 2026, index 2, total 6 → ends Jun 2026
        const entry = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 6,
        );
        const entries = [entry];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        // Should show Jan, Feb, Mar (current), Apr, May, Jun = 6 months
        expect(result.months.length).toBe(6);
        expect(result.months[5].monthKey).toBe('2026-06');
      });

      it('does not extend beyond the last installment final occurrence', () => {
        // Anchor: Feb 2026, index 1, total 3 → ends Apr 2026
        const entry = buildInstallmentEntry(
          '2026-02-15T00:00:00.000Z', 1, 3,
        );
        const entries = [entry];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        // Jan, Feb, Mar, Apr = 4 months
        expect(result.months.length).toBe(4);
        expect(result.months[3].monthKey).toBe('2026-04');
      });

      it('shows only 3 months when installment ends in current month', () => {
        // Anchor: Jan 2026, index 2, total 3 → ends Mar 2026 (current)
        const entry = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 3,
        );
        const entries = [entry];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        expect(result.months.length).toBe(3);
      });
    });

    describe('entry categorization', () => {
      it('categorizes income entries into income', () => {
        const income = buildEntry({
          type: EntryType.INCOME,
          amount: 500000,
          date: '2026-03-10T12:00:00.000Z',
        });
        const entries = [income];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const march = result.months.find((m) => m.monthKey === '2026-03')!;
        expect(march.income).toBe(500000);
        expect(march.commonExpense).toBe(0);
      });

      it('categorizes non-recurring expenses into commonExpense', () => {
        const expense = buildEntry({
          amount: 20000,
          date: '2026-03-10T12:00:00.000Z',
        });
        const entries = [expense];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const march = result.months.find((m) => m.monthKey === '2026-03')!;
        expect(march.commonExpense).toBe(20000);
      });

      it('categorizes indefinite recurring expenses into recurringExpense', () => {
        const recurring = buildRecurringEntry('2026-03-10T12:00:00.000Z', 30000);
        const entries = [recurring];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const march = result.months.find((m) => m.monthKey === '2026-03')!;
        expect(march.recurringExpense).toBe(30000);
      });

      it('categorizes installment expenses into installmentExpense', () => {
        const installment = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 6, 50000,
        );
        const entries = [installment];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const march = result.months.find((m) => m.monthKey === '2026-03')!;
        expect(march.installmentExpense).toBe(50000);
      });

      it('aggregates multiple entries of the same type in the same month', () => {
        const inc1 = buildEntry({
          id: 'i1', type: EntryType.INCOME, amount: 100000,
          date: '2026-03-05T12:00:00.000Z',
        });
        const inc2 = buildEntry({
          id: 'i2', type: EntryType.INCOME, amount: 200000,
          date: '2026-03-20T12:00:00.000Z',
        });
        const entries = [inc1, inc2];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const march = result.months.find((m) => m.monthKey === '2026-03')!;
        expect(march.income).toBe(300000);
      });
    });

    describe('future projections', () => {
      it('projects installment amounts into future month slots', () => {
        // Anchor: Jan 2026, index 2 (current at Mar), total 6
        // Future projections: Apr (idx 3), May (idx 4), Jun (idx 5)
        const entry = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 6, 50000,
        );
        const entries = [entry];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const apr = result.months.find((m) => m.monthKey === '2026-04')!;
        const may = result.months.find((m) => m.monthKey === '2026-05')!;
        const jun = result.months.find((m) => m.monthKey === '2026-06')!;
        expect(apr.installmentExpense).toBe(50000);
        expect(may.installmentExpense).toBe(50000);
        expect(jun.installmentExpense).toBe(50000);
      });

      it('does not project recurring indefinite expenses into future months', () => {
        // Add an installment to extend the chart, plus a recurring indefinite
        const installment = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 6, 50000,
        );
        const recurring = buildRecurringEntry('2026-03-10T12:00:00.000Z', 30000);
        const entries = [installment, recurring];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const apr = result.months.find((m) => m.monthKey === '2026-04')!;
        expect(apr.recurringExpense).toBe(0);
      });

      it('groups by recurrenceId to avoid duplicate projections', () => {
        // Two entries from the same recurrence (indexes 1 and 2, total 5)
        const e1 = buildInstallmentEntry('2026-01-15T00:00:00.000Z', 1, 5, 50000, 'rec-1');
        const e2 = buildInstallmentEntry('2026-01-15T00:00:00.000Z', 2, 5, 50000, 'rec-1');
        const entries = [e1, e2];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        // Only indexes 3 and 4 should be projected (from the latest occurrence idx=2)
        const apr = result.months.find((m) => m.monthKey === '2026-04')!;
        const may = result.months.find((m) => m.monthKey === '2026-05')!;
        expect(apr.installmentExpense).toBe(50000);
        expect(may.installmentExpense).toBe(50000);
      });

      it('uses the highest occurrenceIndex entry amount for projections', () => {
        // Same recurrence, different amounts (user edited one)
        const e1 = buildInstallmentEntry('2026-01-15T00:00:00.000Z', 0, 5, 40000, 'rec-1');
        const e2 = buildInstallmentEntry('2026-01-15T00:00:00.000Z', 2, 5, 60000, 'rec-1');
        const entries = [e1, e2];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const apr = result.months.find((m) => m.monthKey === '2026-04')!;
        expect(apr.installmentExpense).toBe(60000);
      });
    });

    describe('current month flag', () => {
      it('sets isCurrent true only on the current month', () => {
        const map = buildMonthMap(now, []);
        const result = buildTrendsData(map, [], now);

        const currentMonths = result.months.filter((m) => m.isCurrent);
        expect(currentMonths.length).toBe(1);
        expect(currentMonths[0].monthKey).toBe(currentKey);
      });

      it('sets isCurrent false on all other months', () => {
        const map = buildMonthMap(now, []);
        const result = buildTrendsData(map, [], now);

        const nonCurrent = result.months.filter((m) => !m.isCurrent);
        expect(nonCurrent.length).toBe(2);
      });
    });

    describe('totalExpense', () => {
      it('equals the sum of commonExpense, recurringExpense, and installmentExpense', () => {
        const common = buildEntry({
          id: 'c1', amount: 20000, date: '2026-03-05T12:00:00.000Z',
        });
        const recurring = buildRecurringEntry('2026-03-10T12:00:00.000Z', 30000);
        const installment = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 6, 50000,
        );
        const entries = [common, recurring, installment];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const march = result.months.find((m) => m.monthKey === '2026-03')!;
        expect(march.totalExpense).toBe(20000 + 30000 + 50000);
      });

      it('is 0 when there are no expenses', () => {
        const income = buildEntry({
          type: EntryType.INCOME, amount: 100000,
          date: '2026-03-10T12:00:00.000Z',
        });
        const entries = [income];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        for (const month of result.months) {
          expect(month.totalExpense).toBe(0);
        }
      });

      it('includes projected installment amounts in totalExpense for future months', () => {
        const entry = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 6, 50000,
        );
        const entries = [entry];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        const apr = result.months.find((m) => m.monthKey === '2026-04')!;
        expect(apr.totalExpense).toBe(50000);
      });
    });

    describe('maxAmount', () => {
      it('returns 0 when all amounts are 0', () => {
        const map = buildMonthMap(now, []);
        const result = buildTrendsData(map, [], now);
        expect(result.maxAmount).toBe(0);
      });

      it('returns the highest single-category amount across all months', () => {
        const income = buildEntry({
          type: EntryType.INCOME,
          amount: 1000000,
          date: '2026-03-10T12:00:00.000Z',
        });
        const expense = buildEntry({
          id: 'e2',
          amount: 500000,
          date: '2026-02-10T12:00:00.000Z',
        });
        const entries = [income, expense];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        expect(result.maxAmount).toBe(1000000);
      });

      it('uses totalExpense when it exceeds individual categories', () => {
        const common = buildEntry({
          id: 'c1', amount: 400000, date: '2026-03-05T12:00:00.000Z',
        });
        const recurring = buildRecurringEntry('2026-03-10T12:00:00.000Z', 400000);
        const entries = [common, recurring];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        // totalExpense = 800000 which is > either individual (400000)
        expect(result.maxAmount).toBe(800000);
      });
    });

    describe('edge cases', () => {
      it('returns 3 months with all zeros for empty entries', () => {
        const map = buildMonthMap(now, []);
        const result = buildTrendsData(map, [], now);

        expect(result.months.length).toBe(3);
        for (const month of result.months) {
          expect(month.income).toBe(0);
          expect(month.commonExpense).toBe(0);
          expect(month.recurringExpense).toBe(0);
          expect(month.installmentExpense).toBe(0);
          expect(month.totalExpense).toBe(0);
        }
      });

      it('ignores entries outside the computed month range', () => {
        const oldEntry = buildEntry({
          date: '2025-06-15T12:00:00.000Z',
          amount: 99999,
        });
        const map = buildMonthMap(now, [oldEntry]);
        const result = buildTrendsData(map, [oldEntry], now);

        for (const month of result.months) {
          expect(month.commonExpense).toBe(0);
        }
      });

      it('handles multiple installment series with different end dates', () => {
        const short = buildInstallmentEntry(
          '2026-02-15T00:00:00.000Z', 1, 3, 20000, 'rec-short',
        ); // ends Apr 2026
        const long = buildInstallmentEntry(
          '2026-01-15T00:00:00.000Z', 2, 8, 30000, 'rec-long',
        ); // ends Aug 2026
        const entries = [short, long];
        const map = buildMonthMap(now, entries);
        const result = buildTrendsData(map, entries, now);

        // Should extend to Aug 2026: Jan..Aug = 8 months
        expect(result.months.length).toBe(8);
        expect(result.months[7].monthKey).toBe('2026-08');
      });
    });
  });
});
