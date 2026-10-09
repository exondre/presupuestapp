import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { EntryData, EntryScope, EntryType } from '../models/entry-data.model';
import { EntryService } from './entry.service';
import { LocalStorageService } from './local-storage.service';
import { buildTrendsData, projectFutureInstallmentEntries } from '../utils/trends-data.util';
import { buildEntrySeriesViewModel } from '../utils/entry-series-display.util';
import { ExternalEntryImportService } from './external-entry-import.service';

/** Creates a legacy series without effective-value metadata. */
function seriesEntry(index = 0): EntryData {
  return {
    id: `series-${index}`,
    amount: 1000,
    description: 'Arriendo',
    date: `2090-${String(index + 1).padStart(2, '0')}-15T12:00:00.000Z`,
    type: EntryType.EXPENSE,
    recurrence: {
      recurrenceId: 'rent',
      frequency: 'monthly',
      anchorDate: '2090-01-15T12:00:00.000Z',
      occurrenceIndex: index,
      termination: { mode: 'occurrences', total: 12 },
      excludedOccurrences: [],
    },
  };
}

describe('Recurring entry editing', () => {
  let service: EntryService;
  let storage: jasmine.SpyObj<LocalStorageService>;

  beforeEach(() => {
    storage = jasmine.createSpyObj('LocalStorageService', ['getItem', 'setItem']);
    storage.getItem.and.returnValue([]);
    TestBed.configureTestingModule({ providers: [
      EntryService,
      { provide: LocalStorageService, useValue: storage },
    ] });
    service = TestBed.inject(EntryService);
  });

  it('keeps an edit made while generation is pending', fakeAsync(() => {
    service.importEntries([seriesEntry()]);
    (service as any).ensureRecurringEntriesUpTo(new Date('2090-10-20T12:00:00.000Z'));
    service.updateEntry('series-0', { amount: 2000 });
    flushMicrotasks();
    expect(service.entriesSignal().find((entry) => entry.id === 'series-0')?.amount).toBe(2000);
  }));

  /** Generates a fixed horizon so tests do not depend on the execution month. */
  function generateThrough(index: number): void {
    (service as any).ensureRecurringEntriesUpTo(new Date(Date.UTC(2090, index, 20, 12)));
    flushMicrotasks();
  }

  /** Reads one occurrence from the current collection. */
  function occurrence(index: number): EntryData {
    return service.entriesSignal().find((entry) => entry.recurrence?.recurrenceId === 'rent' &&
      entry.recurrence.occurrenceIndex === index)!;
  }

  for (const scope of ['single', 'future', 'series'] as EntryScope[]) {
    for (const field of ['amount', 'description', 'both', 'clear']) {
      it(`applies ${field} with ${scope} scope without changing other fields or identities`, fakeAsync(() => {
        const entries = [0, 1, 2].map((index) => ({ ...seriesEntry(index),
          amount: 1000 + index, description: `Mes ${index}`,
          idempotencyInfo: [{ idempotencyKey: `bank-${index}`, idempotencyVersion: '1' }],
        }));
        const unrelated = { ...seriesEntry(2), id: 'other', recurrence: {
          ...seriesEntry(2).recurrence!, recurrenceId: 'other-series',
        } };
        service.importEntries([...entries, unrelated]);
        const changes = field === 'amount' ? { amount: 2000 } :
          field === 'description' ? { description: 'Nuevo' } :
          field === 'clear' ? { description: null } : { amount: 2000, description: 'Nuevo' };
        const newDate = '2090-07-18T15:00:00.000Z';
        service.updateEntry('series-1', { ...changes, date: newDate }, scope);
        for (const original of entries) {
          const index = original.recurrence!.occurrenceIndex;
          const result = occurrence(index);
          const affected = scope === 'series' || (scope === 'future' ? index >= 1 : index === 1);
          expect(result.amount).toBe(affected && 'amount' in changes ? 2000 : original.amount);
          expect(result.description).toBe(affected && 'description' in changes ? changes.description ?? undefined : original.description);
          expect(result.date).toBe(index === 1 ? newDate : original.date);
          expect(result.idempotencyInfo).toEqual(original.idempotencyInfo);
          expect(result.id).toBe(original.id);
          expect(result.type).toBe(original.type);
        }
        expect(service.entriesSignal().find((entry) => entry.id === 'other')).toEqual({ ...unrelated, updatedAt: undefined });
        const projection = buildEntrySeriesViewModel(occurrence(1), service.entriesSignal())!;
        expect(projection.totalCount).toBe(12);
        expect(projection.items[3].amountLabel).toBe(scope !== 'single' && 'amount' in changes ? '$2.000' : '$1.000');
        generateThrough(12);
        expect(occurrence(11).amount).toBe(scope !== 'single' && 'amount' in changes ? 2000 : 1000);
        expect(occurrence(11).description).toBe(scope !== 'single' && 'description' in changes ? changes.description ?? undefined : 'Mes 0');
        expect(occurrence(12)).toBeUndefined();
        expect(occurrence(11).idempotencyInfo).toBeUndefined();
      }));
    }
  }

  it('keeps a single edit of occurrence zero out of generation, including after restart', fakeAsync(() => {
    service.importEntries([seriesEntry()]);
    service.updateEntry('series-0', { amount: 9000, description: null });
    const backup = service.serializeEntries();
    storage.getItem.and.returnValue(JSON.parse(backup));
    service = TestBed.runInInjectionContext(() => new EntryService());
    generateThrough(1);
    expect(occurrence(0).amount).toBe(9000);
    expect(occurrence(1).amount).toBe(1000);
    expect(occurrence(1).description).toBe('Arriendo');
  }));

  it('replaces later patches only for the changed field and preserves actual single exceptions', fakeAsync(() => {
    service.importEntries([seriesEntry(0), seriesEntry(2), seriesEntry(4), seriesEntry(6)]);
    service.updateEntry('series-2', { amount: 2000 }, 'future');
    service.updateEntry('series-6', { amount: 3000, description: 'Diciembre' }, 'future');
    service.updateEntry('series-2', { amount: 2500 }, 'future');
    expect(occurrence(6).amount).toBe(2500);
    expect(occurrence(6).description).toBe('Diciembre');
    service.updateEntry('series-4', { amount: 9999 }, 'single');
    const backup = service.serializeEntries();
    service.importEntries(JSON.parse(backup));
    generateThrough(8);
    expect(occurrence(4).amount).toBe(9999);
    expect(occurrence(5).amount).toBe(2500);
    expect(occurrence(7).amount).toBe(2500);
    expect(occurrence(7).description).toBe('Diciembre');
    service.updateEntry('series-2', { description: null }, 'series');
    expect(occurrence(0).description).toBeUndefined();
    expect(occurrence(4).amount).toBe(9999);
    generateThrough(9);
    expect(occurrence(9).description).toBeUndefined();
    expect(occurrence(9).amount).toBe(2500);
  }));

  it('handles indefinite recurring incomes and a missing first occurrence', fakeAsync(() => {
    const income = { ...seriesEntry(2), type: EntryType.INCOME, recurrence: {
      ...seriesEntry(2).recurrence!, termination: { mode: 'indefinite' as const }, excludedOccurrences: [0, 1],
    } };
    service.importEntries([income]);
    service.updateEntry(income.id, { amount: 5000 }, 'future');
    generateThrough(14);
    expect(occurrence(14).amount).toBe(5000);
    expect(occurrence(14).type).toBe(EntryType.INCOME);
    expect(occurrence(0)).toBeUndefined();
  }));

  it('leaves no-change and date-only saves free of schedule writes', () => {
    service.importEntries([seriesEntry()]);
    storage.setItem.calls.reset();
    const before = service.entriesSignal();
    service.updateEntry('series-0', { amount: 1000, description: 'Arriendo', date: seriesEntry().date });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(service.entriesSignal()).toBe(before);
    service.updateEntry('series-0', { date: '2090-02-01T12:00:00.000Z' }, 'series');
    expect(occurrence(0).recurrence?.valueSchedule).toBeUndefined();
  });

  it('keeps storage failure atomic for subscribers and signals', () => {
    service.importEntries([seriesEntry(), seriesEntry(1)]);
    const before = service.entriesSignal();
    const published: EntryData[][] = [];
    const subscription = service.entries$.subscribe((entries) => published.push(entries));
    storage.setItem.and.throwError('Quota exceeded');
    expect(() => service.updateEntry('series-1', { amount: 2000 }, 'series')).toThrowError('Quota exceeded');
    expect(service.entriesSignal()).toBe(before);
    expect(published).toEqual([before]);
    subscription.unsubscribe();
  });

  for (const updates of [{ amount: NaN }, { amount: 1.5 }, { amount: Infinity },
    { description: 10 }, { date: 'invalid' }, { occurrenceIndex: 0 }]) {
    it(`rejects invalid edits atomically: ${JSON.stringify(updates)}`, () => {
      service.importEntries([seriesEntry()]);
      storage.setItem.calls.reset();
      expect(() => service.updateEntry('series-0', updates as any, 'series')).toThrowError('Invalid entry update.');
      expect(storage.setItem).not.toHaveBeenCalled();
    });
  }

  it('rejects malformed schedules before replacing or merging the collection', fakeAsync(() => {
    service.importEntries([seriesEntry()]);
    const before = service.entriesSignal();
    const malformed = { ...seriesEntry(1), recurrence: { ...seriesEntry(1).recurrence!, valueSchedule: {
      revision: '2026-10-08T12:00:00.000Z', baseline: { amount: 1000, description: null },
      changes: [{ fromOccurrenceIndex: 1, amount: 1.5 }],
    } } };
    storage.setItem.calls.reset();
    expect(() => service.importEntries([malformed])).toThrow();
    let rejected = false;
    service.compareAndMergeEntries(JSON.stringify([malformed])).catch(() => { rejected = true; });
    flushMicrotasks();
    expect(rejected).toBeTrue();
    expect(service.entriesSignal()).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  }));

  it('preserves legacy heterogeneity through supported wrapper imports', fakeAsync(() => {
    const entries = [seriesEntry(), { ...seriesEntry(1), amount: 2000, description: 'Nombre especial' }];
    service.importEntries({ entries });
    expect(occurrence(1).amount).toBe(2000);
    expect(occurrence(1).description).toBe('Nombre especial');
    expect(occurrence(1).recurrence?.valueSchedule).toBeUndefined();
    generateThrough(2);
    expect(occurrence(2).amount).toBe(1000);
  }));

  for (const removedIndex of [0, 2]) {
    it(`preserves rules after deleting occurrence ${removedIndex}`, fakeAsync(() => {
      service.importEntries([seriesEntry(0), seriesEntry(1), seriesEntry(2)]);
      service.updateEntry('series-2', { amount: 3000, description: null }, 'future');
      service.removeEntry(`series-${removedIndex}`, 'single');
      service.importEntries(JSON.parse(service.serializeEntries()));
      generateThrough(4);
      expect(occurrence(removedIndex)).toBeUndefined();
      expect(occurrence(4).amount).toBe(3000);
      expect(occurrence(4).description).toBeUndefined();
    }));
  }

  it('truncates future deletion and removes the entire series without resurrection', fakeAsync(() => {
    service.importEntries([seriesEntry(), seriesEntry(2)]);
    service.updateEntry('series-2', { amount: 2000 }, 'future');
    service.removeEntry('series-2', 'future');
    generateThrough(11);
    expect(occurrence(1)).toBeDefined();
    expect(occurrence(2)).toBeUndefined();
    expect(occurrence(0).recurrence?.termination).toEqual({ mode: 'occurrences', total: 2 });
    service.removeEntry('series-0', 'series');
    generateThrough(11);
    expect(service.entriesSignal()).toEqual([]);
  }));

  for (const mutation of ['delete', 'import']) {
    it(`recomputes pending generation after ${mutation}`, fakeAsync(() => {
      service.importEntries([seriesEntry()]);
      (service as any).ensureRecurringEntriesUpTo(new Date('2090-10-20T12:00:00.000Z'));
      if (mutation === 'delete') { service.removeEntry('series-0', 'series'); }
      else { service.importEntries([{ ...seriesEntry(), id: 'replacement', recurrence: undefined }]); }
      flushMicrotasks();
      expect(service.entriesSignal().length).toBe(mutation === 'delete' ? 0 : 1);
      expect(service.entriesSignal().some((entry) => entry.id === 'series-0')).toBeFalse();
    }));
  }

  it('stamps shared metadata with one revision while leaving earlier display values unchanged', () => {
    service.importEntries([seriesEntry(), seriesEntry(2)]);
    service.updateEntry('series-2', { amount: 2000 }, 'future');
    expect(occurrence(0).amount).toBe(1000);
    expect(occurrence(0).updatedAt).toBe(occurrence(2).updatedAt);
    expect(occurrence(0).recurrence?.valueSchedule?.revision).toBe(occurrence(2).updatedAt);
    const revision = occurrence(0).recurrence?.valueSchedule?.revision;
    service.updateEntry('series-0', { amount: 5000 }, 'single');
    expect(occurrence(0).recurrence?.valueSchedule?.revision).toBe(revision);
  });

  it('reconciles schedules from older rows while retaining newer single edits and stale added members', fakeAsync(() => {
    service.importEntries([seriesEntry(), seriesEntry(2)]);
    const oldBackup = JSON.parse(service.serializeEntries()) as EntryData[];
    service.updateEntry('series-2', { amount: 2000, description: null }, 'future');
    const newBackup = JSON.parse(service.serializeEntries()) as EntryData[];
    const revision = occurrence(0).recurrence?.valueSchedule?.revision;
    const staleMember = { ...seriesEntry(1), id: 'remote-added', updatedAt: '2099-01-01T12:00:00.000Z' };
    service.compareAndMergeEntries(JSON.stringify([...oldBackup, staleMember]));
    flushMicrotasks();
    expect(service.entriesSignal().every((entry) => entry.recurrence?.valueSchedule?.revision === revision)).toBeTrue();
    service.updateEntry('series-0', { amount: 9000 }, 'single');
    const single = occurrence(0);
    service.compareAndMergeEntries(JSON.stringify(newBackup));
    flushMicrotasks();
    expect(occurrence(0).amount).toBe(single.amount);
    generateThrough(3);
    expect(occurrence(3).amount).toBe(2000);
    expect(occurrence(3).description).toBeUndefined();
    service.importEntries(oldBackup);
    service.compareAndMergeEntries(JSON.stringify(newBackup));
    flushMicrotasks();
    service.compareAndMergeEntries(JSON.stringify(newBackup));
    flushMicrotasks();
    generateThrough(4);
    expect(occurrence(4).amount).toBe(2000);
    expect(occurrence(4).description).toBeUndefined();
  }));

  it('reconciles schedule-only differences regardless of transaction timestamps or occurrence zero', fakeAsync(() => {
    const previous = { ...seriesEntry(2), recurrence: { ...seriesEntry(2).recurrence!, excludedOccurrences: [0, 1] } };
    service.importEntries([previous]);
    const newerRules = { ...previous, recurrence: { ...previous.recurrence, valueSchedule: {
      revision: '2026-10-08T12:00:00.000Z', baseline: { amount: 1000, description: 'Arriendo' },
      changes: [{ fromOccurrenceIndex: 2, amount: 4000 }],
    } } };
    service.compareAndMergeEntries(JSON.stringify([newerRules]));
    flushMicrotasks();
    expect(occurrence(2).amount).toBe(1000);
    generateThrough(3);
    expect(occurrence(3).amount).toBe(4000);
    expect(occurrence(0)).toBeUndefined();
  }));

  it('retains CMR and BICE keys on edited entries without transferring keys to generated members', fakeAsync(() => {
    const importer = TestBed.inject(ExternalEntryImportService);
    const cmrRows = [
      ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
      ['15/01/2090', 'COMPRA TIENDA*', 'Titular', 12000, 12, 1000],
    ];
    const cmr = (importer as any).parseFalabellaCmrFormat(cmrRows).entries[0];
    const biceRows = [
      ['Abonos y cargos'], ['Fecha', 'Categoría', 'Descripción', 'Monto'],
      [null, '15 ene 2090', 'Cargo', 'TRANSFERENCIA', -1000],
    ];
    const bice = (importer as any).parseBiceFormat(biceRows, 'provisoria').entries[0];
    expect(cmr).toBeDefined();
    expect(bice).toBeDefined();
    for (const parsed of [cmr, bice]) {
      service.importEntries([{ ...seriesEntry(), idempotencyInfo: parsed.idempotencyInfo }]);
      service.updateEntry('series-0', { amount: 9000, description: 'Editado' }, 'series');
      generateThrough(1);
      const result = importer.mergeWithExistingEntries([parsed], service.entriesSignal());
      expect(result.exactDuplicates).toEqual([parsed]);
      expect(result.readyToImport).toEqual([]);
      expect(occurrence(1).idempotencyInfo).toBeUndefined();
    }
  }));


  it('rejects scheduled members with invalid identity, anchor, indices, amounts or termination', () => {
    service.importEntries([seriesEntry()]);
    const rules = { revision: '2026-10-08T12:00:00.000Z', baseline: { amount: 1000, description: null }, changes: [] };
    const valid = { ...seriesEntry(), recurrence: { ...seriesEntry().recurrence!, valueSchedule: rules } };
    for (const recurrence of [
      { ...valid.recurrence, occurrenceIndex: -1 }, { ...valid.recurrence, occurrenceIndex: 1.5 },
      { ...valid.recurrence, recurrenceId: '' }, { ...valid.recurrence, anchorDate: 'invalid' },
      { ...valid.recurrence, frequency: 'weekly' }, { ...valid.recurrence, termination: null },
    ]) {
      expect(() => service.importEntries([{ ...valid, recurrence }])).toThrow();
    }
    expect(() => service.importEntries([{ ...valid, amount: 1.5 }])).toThrow();
    expect(occurrence(0).amount).toBe(1000);
  });

  it('keeps monthly totals, historical summaries and trends consistent after a future edit', () => {
    service.importEntries([seriesEntry(), seriesEntry(1), seriesEntry(2)]);
    service.updateEntry('series-1', { amount: 2500 }, 'future');
    const entries = service.entriesSignal();
    expect(service.calculateMonthlyExpenseTotal(entries, new Date('2090-01-20T12:00:00.000Z'))).toBe(1000);
    expect(service.calculateMonthlyBalance(entries, new Date('2090-02-20T12:00:00.000Z'))).toBe(-2500);
    expect(service.monthsHistory().find((month) => month.month === 1)?.totalExpense).toBe(1000);
    expect(service.monthsHistory().find((month) => month.month === 2)?.totalExpense).toBe(2500);
    const trends = buildTrendsData(new Map([['2090-01', [occurrence(0)]], ['2090-02', [occurrence(1)]], ['2090-03', [occurrence(2)]]]), entries, new Date('2090-03-20T12:00:00.000Z'));
    expect(trends.months.find((month) => month.monthKey === '2090-04')?.installmentExpense).toBe(2500);
    expect(trends.months.find((month) => month.monthKey === '2090-02')?.installmentExpense).toBe(2500);
    expect(trends.months.find((month) => month.monthKey === '2090-01')?.totalExpense).toBe(1000);
  });

  it('attaches a confirmed bank key only to the matched occurrence and keeps installment conversion', fakeAsync(() => {
    const importer = TestBed.inject(ExternalEntryImportService);
    service.importEntries([seriesEntry(), seriesEntry(1)]);
    const parsed = { amount: 1000, description: 'Arriendo', date: seriesEntry().date, type: EntryType.EXPENSE,
      idempotencyInfo: [{ idempotencyKey: 'confirmed-source', idempotencyVersion: '1' }] };
    const match = importer.mergeWithExistingEntries([parsed], service.entriesSignal()).potentialDuplicates[0];
    expect(match.matchedEntry.id).toBe('series-0');
    service.appendIdempotencyInfo(match.matchedEntry.id, parsed.idempotencyInfo);
    service.updateEntry('series-0', { amount: 2000 }, 'series');
    expect(occurrence(0).idempotencyInfo).toEqual(parsed.idempotencyInfo);
    expect(occurrence(1).idempotencyInfo).toBeUndefined();
    const ordinary = { ...seriesEntry(), id: 'installment', recurrence: undefined };
    service.importEntries([ordinary]);
    service.convertToRecurring('installment', { frequency: 'monthly', termination: { mode: 'occurrences', total: 3 } });
    service.updateEntry('installment', { amount: 5000 }, 'future');
    generateThrough(4);
    expect(service.entriesSignal().length).toBe(3);
    expect(service.entriesSignal().every((entry) => entry.amount === 5000)).toBeTrue();
  }));


  it('uses scheduled values and actual exceptions in both future trends projections', fakeAsync(() => {
    service.importEntries([seriesEntry(), seriesEntry(2), seriesEntry(4)]);
    service.updateEntry('series-2', { amount: 2500, description: 'Regla' }, 'future');
    service.updateEntry('series-4', { amount: 9999, description: 'Excepción' }, 'single');
    const entries = service.entriesSignal();
    const trends = buildTrendsData(new Map([['2090-01', [occurrence(0)]]]), entries, new Date('2090-01-20T12:00:00.000Z'));
    expect(trends.months.find((month) => month.monthKey === '2090-04')?.installmentExpense).toBe(2500);
    expect(trends.months.find((month) => month.monthKey === '2090-05')?.installmentExpense).toBe(9999);
    expect(trends.months.find((month) => month.monthKey === '2090-06')?.installmentExpense).toBe(2500);
    expect(projectFutureInstallmentEntries(entries, '2090-05')[0]).toEqual(jasmine.objectContaining({ amount: 9999, description: 'Excepción', isProjected: false }));
    expect(projectFutureInstallmentEntries(entries, '2090-06')[0]).toEqual(jasmine.objectContaining({ amount: 2500, description: 'Regla', isProjected: true }));
    generateThrough(5);
    expect(occurrence(5).amount).toBe(2500);
  }));

});
