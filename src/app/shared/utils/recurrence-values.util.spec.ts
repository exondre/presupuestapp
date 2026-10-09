import { EntryData, EntryType, EntryValueSchedule } from '../models/entry-data.model';
import { latestValueSchedule, resolveRecurrenceValues, validateValueSchedule } from './recurrence-values.util';

/** Builds independent effective-value patches. */
function schedule(): EntryValueSchedule {
  return {
    revision: '2026-10-08T12:00:00.000Z',
    baseline: { amount: 100, description: 'Original' },
    changes: [
      { fromOccurrenceIndex: 2, amount: 200 },
      { fromOccurrenceIndex: 4, description: null },
      { fromOccurrenceIndex: 6, amount: 300, description: 'Nuevo' },
    ],
  };
}

/** Builds an actual exception that must not become the series default. */
function entry(valueSchedule?: EntryValueSchedule): EntryData {
  return { id: 'one', amount: 999, description: 'Excepción', date: '2026-01-01T12:00:00.000Z', type: EntryType.INCOME,
    recurrence: { recurrenceId: 'r', occurrenceIndex: 3, frequency: 'monthly',
      anchorDate: '2026-01-01T12:00:00.000Z', termination: { mode: 'indefinite' }, valueSchedule } };
}

describe('Recurrence values', () => {
  it('resolves each field from its own effective patch, including a clear', () => {
    const template = entry(schedule());
    expect(resolveRecurrenceValues(template, 0)).toEqual({ amount: 100, description: 'Original' });
    expect(resolveRecurrenceValues(template, 3)).toEqual({ amount: 200, description: 'Original' });
    expect(resolveRecurrenceValues(template, 5)).toEqual({ amount: 200, description: null });
    expect(resolveRecurrenceValues(template, 7)).toEqual({ amount: 300, description: 'Nuevo' });
    expect(template.amount).toBe(999);
  });

  it('uses the legacy template until explicit rules exist', () => {
    expect(resolveRecurrenceValues(entry(), 5)).toEqual({ amount: 999, description: 'Excepción' });
  });

  it('chooses a revision independently of row order and missing metadata', () => {
    const older = schedule();
    const newer = { ...schedule(), revision: '2026-10-09T12:00:00.000Z' };
    expect(latestValueSchedule([entry(newer), entry(), entry(older)])).toEqual(newer);
    const tied = { ...newer, baseline: { amount: 500, description: null } };
    expect(latestValueSchedule([entry(tied), entry(newer)])).toEqual(latestValueSchedule([entry(newer), entry(tied)]));
  });

  it('validates a JSON round trip with explicit clears', () => {
    expect(validateValueSchedule(JSON.parse(JSON.stringify(schedule())))).toEqual(schedule());
  });

  for (const invalid of [
    null, {}, { ...schedule(), revision: 'invalid' },
    { ...schedule(), baseline: { amount: Infinity, description: null } },
    { ...schedule(), baseline: { amount: 1.5, description: null } },
    { ...schedule(), baseline: { amount: 1 } },
    { ...schedule(), changes: [{ fromOccurrenceIndex: -1, amount: 1 }] },
    { ...schedule(), changes: [{ fromOccurrenceIndex: 1.5, amount: 1 }] },
    { ...schedule(), changes: [{ fromOccurrenceIndex: 1 }] },
    { ...schedule(), changes: [{ fromOccurrenceIndex: 1, date: 'x' }] },
    { ...schedule(), changes: [{ fromOccurrenceIndex: 2, amount: 1 }, { fromOccurrenceIndex: 1, amount: 2 }] },
    { ...schedule(), changes: [{ fromOccurrenceIndex: 1, amount: 1 }, { fromOccurrenceIndex: 1, amount: 2 }] },
  ]) {
    it(`rejects malformed rules: ${JSON.stringify(invalid)}`, () => {
      expect(() => validateValueSchedule(invalid)).toThrowError('Invalid recurring value schedule.');
    });
  }
});
