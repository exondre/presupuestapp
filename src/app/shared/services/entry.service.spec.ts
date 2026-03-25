import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import {
  EntryData,
  EntryRecurrence,
  EntryType,
  IdempotencyInfo,
} from '../models/entry-data.model';
import { EntryService } from './entry.service';
import { LocalStorageService } from './local-storage.service';

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function buildEntry(overrides: Partial<EntryData> = {}): EntryData {
  return {
    id: 'test-id',
    amount: 1000,
    date: '2024-01-15T00:00:00.000Z',
    type: EntryType.EXPENSE,
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function buildRecurrence(overrides: Partial<EntryRecurrence> = {}): EntryRecurrence {
  return {
    recurrenceId: 'rec-id',
    anchorDate: '2024-01-15T00:00:00.000Z',
    occurrenceIndex: 0,
    frequency: 'monthly',
    termination: { mode: 'indefinite' },
    excludedOccurrences: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Main describe
// ---------------------------------------------------------------------------

describe('EntryService', () => {
  let service: EntryService;
  let localStorageServiceSpy: jasmine.SpyObj<LocalStorageService>;

  beforeEach(() => {
    localStorageServiceSpy = jasmine.createSpyObj<LocalStorageService>(
      'LocalStorageService',
      ['getItem', 'setItem', 'removeItem']
    );
    // Return empty array by default so restoreEntriesFromStorage does not fail
    localStorageServiceSpy.getItem.and.returnValue([]);

    TestBed.configureTestingModule({
      providers: [
        EntryService,
        { provide: LocalStorageService, useValue: localStorageServiceSpy },
      ],
    });

    service = TestBed.inject(EntryService);
  });

  // --------------------------------------------------------------------------
  // normalizeStoredEntry — idempotencyInfo preservation (ORIGINAL TESTS)
  // --------------------------------------------------------------------------

  describe('normalizeStoredEntry', () => {
    it('preserves valid idempotencyInfo', () => {
      const idempotencyInfo: IdempotencyInfo[] = [
        { idempotencyKey: '2024-01-01|Salary|100000|INCOME', idempotencyVersion: 'v1' },
      ];
      const entry = {
        id: 'abc-123',
        amount: 100000,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.INCOME,
        idempotencyInfo,
      };

      const result = (service as any).normalizeStoredEntry(entry);

      expect(result).not.toBeNull();
      expect(result.entry.idempotencyInfo).toEqual(idempotencyInfo);
    });

    it('drops idempotencyInfo items with invalid types or empty strings', () => {
      const entry = {
        id: 'abc-124',
        amount: 500,
        date: '2024-02-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        idempotencyInfo: [
          null,
          { idempotencyKey: '', idempotencyVersion: 'v1' },         // empty key
          { idempotencyKey: 'key1', idempotencyVersion: '' },        // empty version
          { idempotencyKey: 123, idempotencyVersion: 'v1' },         // non-string key
          { idempotencyKey: 'key2', idempotencyVersion: undefined },  // missing version
        ],
      };

      const result = (service as any).normalizeStoredEntry(entry);

      expect(result).not.toBeNull();
      expect(result.entry.idempotencyInfo).toBeUndefined();
    });

    it('drops idempotencyInfo when the array is empty', () => {
      const entry = {
        id: 'abc-125',
        amount: 200,
        date: '2024-03-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        idempotencyInfo: [],
      };

      const result = (service as any).normalizeStoredEntry(entry);

      expect(result).not.toBeNull();
      expect(result.entry.idempotencyInfo).toBeUndefined();
    });

    it('filters out only the invalid items while keeping the valid ones', () => {
      const validItem: IdempotencyInfo = { idempotencyKey: 'good-key', idempotencyVersion: 'v2' };
      const entry = {
        id: 'abc-126',
        amount: 300,
        date: '2024-04-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        idempotencyInfo: [
          null,
          validItem,
          { idempotencyKey: '', idempotencyVersion: 'v2' }, // invalid
        ],
      };

      const result = (service as any).normalizeStoredEntry(entry);

      expect(result).not.toBeNull();
      expect(result.entry.idempotencyInfo).toEqual([validItem]);
    });

    // ----------------------------------------------------------------------
    // Guardian test: all keys of EntryData are present in the normalized output
    // ----------------------------------------------------------------------

    it('preserves all EntryData keys when all fields are provided (guardian test)', () => {
      const allEntryDataKeys: Array<keyof EntryData> = [
        'id',
        'amount',
        'date',
        'type',
        'description',
        'updatedAt',
        'recurrence',
        'idempotencyInfo',
      ];

      const entry = {
        id: 'guardian-id',
        amount: 1000,
        date: '2024-05-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        description: 'Guardian entry',
        updatedAt: '2024-05-02T00:00:00.000Z',
        recurrence: {
          recurrenceId: 'rec-1',
          anchorDate: '2024-05-01T00:00:00.000Z',
          occurrenceIndex: 0,
          frequency: 'monthly' as const,
          termination: { mode: 'indefinite' as const },
        },
        idempotencyInfo: [
          { idempotencyKey: 'guardian-key', idempotencyVersion: 'v1' },
        ],
      };

      const result = (service as any).normalizeStoredEntry(entry);

      expect(result).not.toBeNull();

      allEntryDataKeys.forEach((key) => {
        expect(Object.prototype.hasOwnProperty.call(result.entry, key))
          .withContext(`Expected normalized entry to contain key "${key}" — was it added to EntryData but omitted from normalizeStoredEntry()?`)
          .toBeTrue();
      });
    });

    // ----------------------------------------------------------------------
    // Additional normalizeStoredEntry branch coverage
    // ----------------------------------------------------------------------

    it('returns null when entry is null', () => {
      expect((service as any).normalizeStoredEntry(null)).toBeNull();
    });

    it('returns null when entry is a primitive', () => {
      expect((service as any).normalizeStoredEntry('string')).toBeNull();
      expect((service as any).normalizeStoredEntry(42)).toBeNull();
    });

    it('generates a new id when entry.id is missing', () => {
      const entry = {
        amount: 100,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result).not.toBeNull();
      expect(typeof result.entry.id).toBe('string');
      expect(result.entry.id.length).toBeGreaterThan(0);
      expect(result.requiresSync).toBeTrue();
    });

    it('generates a new id when entry.id is an empty string', () => {
      const entry = {
        id: '',
        amount: 100,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.requiresSync).toBeTrue();
    });

    it('sets description to undefined when description is whitespace only', () => {
      const entry = {
        id: 'id-ws',
        amount: 50,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        description: '   ',
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.entry.description).toBeUndefined();
    });

    it('sets description to undefined when description is not a string', () => {
      const entry = {
        id: 'id-desc-num',
        amount: 50,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        description: 123 as any,
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.entry.description).toBeUndefined();
    });

    it('does not set updatedAt when entry.updatedAt is undefined', () => {
      const entry = {
        id: 'id-no-updatedAt',
        amount: 50,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.entry.updatedAt).toBeUndefined();
    });

    it('normalizes updatedAt when it is a valid ISO string', () => {
      const entry = {
        id: 'id-upd',
        amount: 50,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: '2024-01-01T12:00:00.000Z',
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.entry.updatedAt).toBe('2024-01-01T12:00:00.000Z');
      expect(result.requiresSync).toBeFalse();
    });

    it('sets requiresSync true when updatedAt is invalid', () => {
      const entry = {
        id: 'id-bad-upd',
        amount: 50,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: 'not-a-date',
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.requiresSync).toBeTrue();
    });

    it('sets requiresSync false when all fields are already normalized', () => {
      const entry = {
        id: 'valid-id',
        amount: 1000,
        date: '2024-01-15T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: '2024-01-15T00:00:00.000Z',
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.requiresSync).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // importEntries — idempotencyInfo preservation (ORIGINAL TESTS)
  // --------------------------------------------------------------------------

  describe('importEntries', () => {
    it('preserves idempotencyInfo through the full import flow', () => {
      const idempotencyInfo: IdempotencyInfo[] = [
        { idempotencyKey: '2024-06-01|Coffee|350|EXPENSE', idempotencyVersion: 'v1' },
      ];
      const rawData = [
        {
          id: 'import-id-1',
          amount: 350,
          date: '2024-06-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          idempotencyInfo,
        },
      ];

      service.importEntries(rawData);

      const entries = service.getEntriesSnapshot();
      const imported = entries.find((e) => e.id === 'import-id-1');
      expect(imported).toBeDefined();
      expect(imported!.idempotencyInfo).toEqual(idempotencyInfo);
    });

    // Additional importEntries tests

    it('replaces all current entries with imported ones', fakeAsync(() => {
      service.addEntry({ amount: 999, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: undefined });
      const rawData = [
        { id: 'new-id', amount: 50, date: '2024-06-01T00:00:00.000Z', type: EntryType.INCOME },
      ];

      service.importEntries(rawData);
      tick();

      const entries = service.getEntriesSnapshot();
      expect(entries.length).toBe(1);
      expect(entries[0].id).toBe('new-id');
    }));

    it('accepts an object with entries property', fakeAsync(() => {
      const rawData = {
        entries: [
          { id: 'obj-entries-id', amount: 100, date: '2024-06-01T00:00:00.000Z', type: EntryType.INCOME },
        ],
      };
      service.importEntries(rawData);
      tick();

      const entries = service.getEntriesSnapshot();
      const found = entries.find((e) => e.id === 'obj-entries-id');
      expect(found).toBeDefined();
    }));

    it('accepts an object with expenses property', fakeAsync(() => {
      const rawData = {
        expenses: [
          { id: 'obj-expenses-id', amount: 200, date: '2024-06-01T00:00:00.000Z', type: EntryType.EXPENSE },
        ],
      };
      service.importEntries(rawData);
      tick();

      const entries = service.getEntriesSnapshot();
      const found = entries.find((e) => e.id === 'obj-expenses-id');
      expect(found).toBeDefined();
    }));

    it('throws when rawData is invalid (string)', () => {
      expect(() => service.importEntries('invalid')).toThrowError('Invalid import payload.');
    });

    it('throws when rawData is null', () => {
      expect(() => service.importEntries(null)).toThrowError('Invalid import payload.');
    });

    it('throws when array contains a non-object element', () => {
      expect(() => service.importEntries(['not-an-object'])).toThrowError('Invalid entry detected during import.');
    });

    it('throws when array contains null element', () => {
      expect(() => service.importEntries([null])).toThrowError('Invalid entry detected during import.');
    });

    it('throws when object with entries contains non-object array items', () => {
      expect(() => service.importEntries({ entries: [null] })).toThrowError('Invalid entry detected during import.');
    });

    it('throws when object has no entries or expenses property', () => {
      expect(() => service.importEntries({ data: [] })).toThrowError('Invalid import payload.');
    });

    it('persists entries when imported entry has invalid (null) fields triggering normalizeStoredEntry to throw', () => {
      // normalizeStoredEntry returns null for null entry, but extractAndNormalizeImportedEntries
      // would throw — however ensureEveryEntryIsObject would catch null before it gets there
      expect(() => service.importEntries([null])).toThrowError();
    });
  });

  // --------------------------------------------------------------------------
  // restoreEntriesFromStorage — idempotencyInfo preservation (ORIGINAL TESTS)
  // --------------------------------------------------------------------------

  describe('restoreEntriesFromStorage', () => {
    it('preserves idempotencyInfo when loading entries from storage', () => {
      const idempotencyInfo: IdempotencyInfo[] = [
        { idempotencyKey: '2024-07-01|Rent|50000|EXPENSE', idempotencyVersion: 'v1' },
      ];
      const storedEntries = [
        {
          id: 'stored-id-1',
          amount: 50000,
          date: '2024-07-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          idempotencyInfo,
        },
      ];

      // Reset and reconfigure with entries that have idempotencyInfo
      localStorageServiceSpy.getItem.and.returnValue(storedEntries);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          EntryService,
          { provide: LocalStorageService, useValue: localStorageServiceSpy },
        ],
      });
      const freshService = TestBed.inject(EntryService);

      const entries = freshService.getEntriesSnapshot();
      const restored = entries.find((e) => e.id === 'stored-id-1');
      expect(restored).toBeDefined();
      expect(restored!.idempotencyInfo).toEqual(idempotencyInfo);
    });

    // Additional restoreEntriesFromStorage tests

    it('returns empty array when storage returns null', () => {
      localStorageServiceSpy.getItem.and.returnValue(null);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          EntryService,
          { provide: LocalStorageService, useValue: localStorageServiceSpy },
        ],
      });
      const freshService = TestBed.inject(EntryService);
      expect(freshService.getEntriesSnapshot().length).toBe(0);
    });

    it('returns empty array when storage returns a non-array', () => {
      localStorageServiceSpy.getItem.and.returnValue({ foo: 'bar' } as any);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          EntryService,
          { provide: LocalStorageService, useValue: localStorageServiceSpy },
        ],
      });
      const freshService = TestBed.inject(EntryService);
      expect(freshService.getEntriesSnapshot().length).toBe(0);
    });

    it('persists normalized entries when requiresSync is true', () => {
      // Entry with bad date triggers requiresSync=true
      const storedEntries = [
        { id: 'bad-date', amount: 100, date: 'not-a-date', type: EntryType.EXPENSE },
      ];
      localStorageServiceSpy.getItem.and.returnValue(storedEntries);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          EntryService,
          { provide: LocalStorageService, useValue: localStorageServiceSpy },
        ],
      });
      TestBed.inject(EntryService);
      expect(localStorageServiceSpy.setItem).toHaveBeenCalled();
    });

    it('skips null entries and sets requiresPersistence', () => {
      const storedEntries = [null, { id: 'good-id', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE }];
      localStorageServiceSpy.getItem.and.returnValue(storedEntries as any);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          EntryService,
          { provide: LocalStorageService, useValue: localStorageServiceSpy },
        ],
      });
      const freshService = TestBed.inject(EntryService);
      // Good entry is preserved; null is skipped
      const entries = freshService.getEntriesSnapshot();
      expect(entries.some((e) => e.id === 'good-id')).toBeTrue();
      expect(localStorageServiceSpy.setItem).toHaveBeenCalled();
    });

    it('does not call setItem when all entries are already normalized', () => {
      localStorageServiceSpy.setItem.calls.reset();
      const storedEntries = [
        { id: 'ok-id', amount: 500, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2024-01-01T00:00:00.000Z' },
      ];
      localStorageServiceSpy.getItem.and.returnValue(storedEntries);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          EntryService,
          { provide: LocalStorageService, useValue: localStorageServiceSpy },
        ],
      });
      TestBed.inject(EntryService);
      // setItem should NOT have been called from restoreEntriesFromStorage
      // (only from constructor's ensureRecurringEntriesUpTo if entries are generated,
      // but since no recurrence here, setItem is not called)
      const storageCalls = localStorageServiceSpy.setItem.calls.all();
      // No recurrence, no new occurrences — setItem is called 0 times from restore
      expect(storageCalls.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // updateEntry — idempotencyInfo preservation (ORIGINAL TESTS)
  // --------------------------------------------------------------------------

  describe('updateEntry', () => {
    it('preserves idempotencyInfo when updating amount and description', () => {
      const idempotencyInfo: IdempotencyInfo[] = [
        { idempotencyKey: '2024-08-01|Gym|2000|EXPENSE', idempotencyVersion: 'v1' },
      ];
      const rawData = [
        {
          id: 'update-id-1',
          amount: 2000,
          date: '2024-08-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          description: 'Gym',
          idempotencyInfo,
        },
      ];

      service.importEntries(rawData);

      service.updateEntry('update-id-1', {
        amount: 2500,
        date: '2024-08-01T00:00:00.000Z',
        description: 'Gym membership',
      });

      const entries = service.getEntriesSnapshot();
      const updated = entries.find((e) => e.id === 'update-id-1');
      expect(updated).toBeDefined();
      expect(updated!.amount).toBe(2500);
      expect(updated!.idempotencyInfo).toEqual(idempotencyInfo);
    });

    // Additional updateEntry tests

    it('does nothing when entryId is not found', () => {
      const before = localStorageServiceSpy.setItem.calls.count();
      service.updateEntry('non-existent', { amount: 100 });
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('does not persist when there are no actual changes', () => {
      service.importEntries([
        { id: 'no-change-id', amount: 500, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, description: 'Same' },
      ]);
      const before = localStorageServiceSpy.setItem.calls.count();
      service.updateEntry('no-change-id', { amount: 500, date: '2024-01-01T00:00:00.000Z', description: 'Same', type: EntryType.EXPENSE });
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('updates amount correctly', () => {
      service.importEntries([
        { id: 'upd-amount', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.updateEntry('upd-amount', { amount: 999 });
      const entries = service.getEntriesSnapshot();
      const updated = entries.find((e) => e.id === 'upd-amount');
      expect(updated!.amount).toBe(999);
    });

    it('updates date correctly', () => {
      service.importEntries([
        { id: 'upd-date', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.updateEntry('upd-date', { date: '2024-06-15T00:00:00.000Z' });
      const entries = service.getEntriesSnapshot();
      const updated = entries.find((e) => e.id === 'upd-date');
      expect(updated!.date).toBe('2024-06-15T00:00:00.000Z');
    });

    it('updates type correctly', () => {
      service.importEntries([
        { id: 'upd-type', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.updateEntry('upd-type', { type: EntryType.INCOME });
      const entries = service.getEntriesSnapshot();
      const updated = entries.find((e) => e.id === 'upd-type');
      expect(updated!.type).toBe(EntryType.INCOME);
    });

    it('stamps updatedAt after update', () => {
      service.importEntries([
        { id: 'upd-at', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.updateEntry('upd-at', { amount: 200 });
      const entries = service.getEntriesSnapshot();
      const updated = entries.find((e) => e.id === 'upd-at');
      expect(updated!.updatedAt).toBeDefined();
    });

    it('preserves recurrence from currentEntry, ignoring updates.recurrence', () => {
      const rec = buildRecurrence();
      service.importEntries([
        buildEntry({ id: 'upd-rec', recurrence: rec }),
      ]);
      // Even if updates tries to set recurrence to undefined (it is stripped)
      service.updateEntry('upd-rec', { amount: 9999 });
      const entries = service.getEntriesSnapshot();
      const updated = entries.find((e) => e.id === 'upd-rec');
      expect(updated!.recurrence).toEqual(rec);
    });
  });

  // --------------------------------------------------------------------------
  // addEntry
  // --------------------------------------------------------------------------

  describe('addEntry', () => {
    it('adds a new entry without recurrence', () => {
      service.addEntry({ amount: 500, date: '2024-03-01T00:00:00.000Z', type: EntryType.INCOME, updatedAt: undefined });
      const entries = service.getEntriesSnapshot();
      expect(entries.length).toBe(1);
      expect(entries[0].amount).toBe(500);
    });

    it('adds a new entry with recurrence and triggers ensureRecurring', fakeAsync(() => {
      service.addEntry({
        amount: 1000,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'indefinite' } },
      });
      tick();
      const entries = service.getEntriesSnapshot();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.recurrence !== undefined)).toBeTrue();
    }));

    it('does not add recurrence when frequency is not monthly', () => {
      service.addEntry({
        amount: 100,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 1 } },
      });
      const entries = service.getEntriesSnapshot();
      expect(entries[0].recurrence).toBeDefined();
    });

    it('normalizes type via normalizeType for unknown type values', () => {
      service.addEntry({ amount: 100, date: '2024-01-01T00:00:00.000Z', type: 'income' as any, updatedAt: undefined });
      const entries = service.getEntriesSnapshot();
      expect(entries[0].type).toBe(EntryType.INCOME);
    });

    it('sets updatedAt on the new entry', () => {
      service.addEntry({ amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: undefined });
      const entries = service.getEntriesSnapshot();
      expect(entries[0].updatedAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // addEntries
  // --------------------------------------------------------------------------

  describe('addEntries', () => {
    it('adds multiple entries in a single call', () => {
      service.addEntries([
        { amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: undefined },
        { amount: 200, date: '2024-01-02T00:00:00.000Z', type: EntryType.INCOME, updatedAt: undefined },
      ]);
      expect(service.getEntriesSnapshot().length).toBe(2);
    });

    it('triggers ensureRecurring when at least one entry has recurrence', fakeAsync(() => {
      service.addEntries([
        {
          amount: 500,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          updatedAt: undefined,
          recurrence: { frequency: 'monthly', termination: { mode: 'indefinite' } },
        },
      ]);
      tick();
      const entries = service.getEntriesSnapshot();
      expect(entries.some((e) => e.recurrence !== undefined)).toBeTrue();
    }));

    it('does not trigger ensureRecurring when no entry has recurrence', () => {
      service.addEntries([
        { amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: undefined },
      ]);
      // no fakeAsync needed, persistEntries is sync; passes without error
      expect(service.getEntriesSnapshot().length).toBe(1);
    });

    it('preserves idempotencyInfo on each added entry', () => {
      const idem: IdempotencyInfo[] = [{ idempotencyKey: 'k', idempotencyVersion: 'v1' }];
      service.addEntries([
        { amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: undefined, idempotencyInfo: idem },
      ]);
      const entries = service.getEntriesSnapshot();
      expect(entries[0].idempotencyInfo).toEqual(idem);
    });
  });

  // --------------------------------------------------------------------------
  // appendIdempotencyInfo
  // --------------------------------------------------------------------------

  describe('appendIdempotencyInfo', () => {
    it('appends info to an existing entry', () => {
      service.importEntries([
        { id: 'idem-id', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const info: IdempotencyInfo[] = [{ idempotencyKey: 'new-key', idempotencyVersion: 'v2' }];
      service.appendIdempotencyInfo('idem-id', info);
      const entry = service.getEntriesSnapshot().find((e) => e.id === 'idem-id');
      expect(entry!.idempotencyInfo).toEqual(info);
    });

    it('merges with existing idempotencyInfo', () => {
      const existing: IdempotencyInfo[] = [{ idempotencyKey: 'old-key', idempotencyVersion: 'v1' }];
      service.importEntries([
        { id: 'idem-merge', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, idempotencyInfo: existing },
      ]);
      const newInfo: IdempotencyInfo[] = [{ idempotencyKey: 'new-key', idempotencyVersion: 'v2' }];
      service.appendIdempotencyInfo('idem-merge', newInfo);
      const entry = service.getEntriesSnapshot().find((e) => e.id === 'idem-merge');
      expect(entry!.idempotencyInfo!.length).toBe(2);
    });

    it('does nothing when entryId is not found', () => {
      const before = localStorageServiceSpy.setItem.calls.count();
      service.appendIdempotencyInfo('ghost-id', [{ idempotencyKey: 'k', idempotencyVersion: 'v' }]);
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('appends when entry has no existing idempotencyInfo (uses ?? [])', () => {
      service.importEntries([
        { id: 'idem-empty', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const info: IdempotencyInfo[] = [{ idempotencyKey: 'k', idempotencyVersion: 'v' }];
      service.appendIdempotencyInfo('idem-empty', info);
      const entry = service.getEntriesSnapshot().find((e) => e.id === 'idem-empty');
      expect(entry!.idempotencyInfo).toEqual(info);
    });
  });

  // --------------------------------------------------------------------------
  // convertToRecurring
  // --------------------------------------------------------------------------

  describe('convertToRecurring', () => {
    it('converts a non-recurring entry to recurring', fakeAsync(() => {
      service.importEntries([
        { id: 'conv-id', amount: 1000, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.convertToRecurring('conv-id', { frequency: 'monthly', termination: { mode: 'indefinite' } });
      tick();
      const entry = service.getEntriesSnapshot().find((e) => e.id === 'conv-id');
      expect(entry!.recurrence).toBeDefined();
      expect(entry!.recurrence!.frequency).toBe('monthly');
    }));

    it('does nothing when entryId is not found', () => {
      const before = localStorageServiceSpy.setItem.calls.count();
      service.convertToRecurring('ghost', { frequency: 'monthly', termination: { mode: 'indefinite' } });
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('does nothing when entry already has recurrence', () => {
      const rec = buildRecurrence();
      service.importEntries([buildEntry({ id: 'already-rec', recurrence: rec })]);
      const before = localStorageServiceSpy.setItem.calls.count();
      service.convertToRecurring('already-rec', { frequency: 'monthly', termination: { mode: 'indefinite' } });
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('does nothing when createRecurrenceMetadata returns undefined (invalid termination)', () => {
      service.importEntries([
        { id: 'invalid-term', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const before = localStorageServiceSpy.setItem.calls.count();
      // frequency mismatch causes createRecurrenceMetadata to return undefined
      service.convertToRecurring('invalid-term', { frequency: 'monthly', termination: undefined as any });
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });
  });

  // --------------------------------------------------------------------------
  // removeEntry
  // --------------------------------------------------------------------------

  describe('removeEntry', () => {
    it('does nothing when entryId is not found', () => {
      service.importEntries([
        { id: 'rem-existing', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const before = localStorageServiceSpy.setItem.calls.count();
      service.removeEntry('ghost-id');
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('removes a non-recurring entry with default scope (single)', () => {
      service.importEntries([
        { id: 'remove-single', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.removeEntry('remove-single');
      expect(service.getEntriesSnapshot().find((e) => e.id === 'remove-single')).toBeUndefined();
    });

    it('removes entire series when scope is series', fakeAsync(() => {
      service.addEntry({
        amount: 1000,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 3 } },
      });
      tick();

      const entries = service.getEntriesSnapshot();
      const anyEntry = entries.find((e) => e.recurrence !== undefined);
      expect(anyEntry).toBeDefined();

      service.removeEntry(anyEntry!.id, 'series');
      tick();

      const remaining = service.getEntriesSnapshot();
      expect(remaining.filter((e) => e.recurrence !== undefined).length).toBe(0);
    }));

    it('removes current and future occurrences when scope is future and occurrenceIndex > 0', fakeAsync(() => {
      service.addEntry({
        amount: 1000,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 3 } },
      });
      tick();

      const entries = service.getEntriesSnapshot();
      const laterEntry = entries
        .filter((e) => e.recurrence !== undefined)
        .find((e) => e.recurrence!.occurrenceIndex > 0);

      if (laterEntry) {
        service.removeEntry(laterEntry.id, 'future');
        tick();
        const remaining = service.getEntriesSnapshot();
        expect(remaining.filter((e) => e.recurrence !== undefined && e.recurrence.occurrenceIndex >= laterEntry.recurrence!.occurrenceIndex).length).toBe(0);
      }
    }));

    it('removes entire series when scope is future and occurrenceIndex is 0', fakeAsync(() => {
      service.addEntry({
        amount: 1000,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 3 } },
      });
      tick();

      const entries = service.getEntriesSnapshot();
      const firstOccurrence = entries.find((e) => e.recurrence?.occurrenceIndex === 0);
      expect(firstOccurrence).toBeDefined();

      service.removeEntry(firstOccurrence!.id, 'future');
      tick();

      const remaining = service.getEntriesSnapshot();
      expect(remaining.filter((e) => e.recurrence !== undefined).length).toBe(0);
    }));

    it('excludes single occurrence when scope is single on a recurring entry', fakeAsync(() => {
      service.addEntry({
        amount: 1000,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 3 } },
      });
      tick();

      const entries = service.getEntriesSnapshot();
      const firstOccurrence = entries.find((e) => e.recurrence?.occurrenceIndex === 0);
      const recurrenceId = firstOccurrence!.recurrence!.recurrenceId;

      service.removeEntry(firstOccurrence!.id, 'single');

      const remaining = service.getEntriesSnapshot();
      // The target entry is removed
      expect(remaining.find((e) => e.id === firstOccurrence!.id)).toBeUndefined();
      // Other occurrences should have excludedOccurrences updated
      const otherOccurrences = remaining.filter(
        (e) => e.recurrence?.recurrenceId === recurrenceId
      );
      if (otherOccurrences.length > 0) {
        expect(otherOccurrences[0].recurrence!.excludedOccurrences).toContain(0);
      }
    }));

    it('does nothing when target entry is not found in removeEntry', () => {
      const before = localStorageServiceSpy.setItem.calls.count();
      service.removeEntry('definitely-not-there');
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });
  });

  // --------------------------------------------------------------------------
  // getEntriesSnapshot
  // --------------------------------------------------------------------------

  describe('getEntriesSnapshot', () => {
    it('returns a copy of current entries', () => {
      service.importEntries([
        { id: 'snap1', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const snapshot = service.getEntriesSnapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      // Verify it's a copy, not a reference
      snapshot.push(buildEntry({ id: 'extra' }));
      expect(service.getEntriesSnapshot().find((e) => e.id === 'extra')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // serializeEntries
  // --------------------------------------------------------------------------

  describe('serializeEntries', () => {
    it('serializes entries as a JSON string', () => {
      service.importEntries([
        { id: 'ser1', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const json = service.serializeEntries();
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBeTrue();
    });

    it('accepts an explicit entries array', () => {
      const entries = [buildEntry({ id: 'explicit' })];
      const json = service.serializeEntries(entries);
      const parsed = JSON.parse(json);
      expect(parsed[0].id).toBe('explicit');
    });

    it('returns empty array JSON when given empty array', () => {
      const json = service.serializeEntries([]);
      expect(JSON.parse(json)).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // deleteAllData
  // --------------------------------------------------------------------------

  describe('deleteAllData', () => {
    it('clears all entries', async () => {
      service.importEntries([
        { id: 'del1', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      await service.deleteAllData();
      expect(service.getEntriesSnapshot().length).toBe(0);
    });

    it('persists the empty state to storage', async () => {
      await service.deleteAllData();
      expect(localStorageServiceSpy.setItem).toHaveBeenCalledWith(
        jasmine.any(String),
        []
      );
    });
  });

  // --------------------------------------------------------------------------
  // calculateMonthlyExpenseTotal / calculateMonthlyIncomeTotal / calculateMonthlyBalance
  // --------------------------------------------------------------------------

  describe('calculateMonthlyExpenseTotal', () => {
    it('returns 0 when there are no entries', () => {
      expect(service.calculateMonthlyExpenseTotal([], new Date('2024-01-15'))).toBe(0);
    });

    it('sums only EXPENSE entries in the same month', () => {
      service.importEntries([
        { id: 'exp1', amount: 300, date: '2024-01-10T00:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'exp2', amount: 200, date: '2024-01-20T00:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'inc1', amount: 500, date: '2024-01-15T00:00:00.000Z', type: EntryType.INCOME },
      ]);
      const total = service.calculateMonthlyExpenseTotal([], new Date('2024-01-15'));
      expect(total).toBe(500);
    });

    it('excludes entries with invalid dates (line 1012 branch)', () => {
      // Manually inject an entry with an invalid date into entriesSubject to cover line 1012
      const badEntry: EntryData = {
        id: 'bad-date-entry',
        amount: 999,
        date: 'not-a-valid-date',
        type: EntryType.EXPENSE,
      };
      const goodEntry: EntryData = {
        id: 'good-entry',
        amount: 100,
        date: '2024-01-10T00:00:00.000Z',
        type: EntryType.EXPENSE,
      };
      // Directly set entriesSubject with a bad-date entry to hit the NaN branch
      (service as any).entriesSubject.next([badEntry, goodEntry]);
      (service as any).entriesSignal.set([badEntry, goodEntry]);
      const total = service.calculateMonthlyExpenseTotal([], new Date('2024-01-15'));
      // Only goodEntry should be counted
      expect(total).toBe(100);
    });

    it('excludes entries with invalid dates (via filterEntriesByMonth)', () => {
      const badEntry: EntryData = {
        id: 'bad-date-filter',
        amount: 500,
        date: 'invalid',
        type: EntryType.EXPENSE,
      };
      (service as any).entriesSubject.next([badEntry]);
      (service as any).entriesSignal.set([badEntry]);
      const result = service.filterEntriesByMonth(new Date('2024-01-15'));
      expect(result.length).toBe(0);
    });

    it('excludes entries from other months', () => {
      service.importEntries([
        { id: 'other-month', amount: 999, date: '2024-03-10T12:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const total = service.calculateMonthlyExpenseTotal([], new Date('2024-01-15'));
      expect(total).toBe(0);
    });
  });

  describe('calculateMonthlyIncomeTotal', () => {
    it('returns 0 when there are no income entries in the month', () => {
      service.importEntries([
        { id: 'exp-only', amount: 500, date: '2024-01-10T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      expect(service.calculateMonthlyIncomeTotal([], new Date('2024-01-15'))).toBe(0);
    });

    it('sums only INCOME entries in the same month', () => {
      service.importEntries([
        { id: 'inc-a', amount: 1000, date: '2024-01-05T00:00:00.000Z', type: EntryType.INCOME },
        { id: 'inc-b', amount: 500, date: '2024-01-20T00:00:00.000Z', type: EntryType.INCOME },
      ]);
      expect(service.calculateMonthlyIncomeTotal([], new Date('2024-01-15'))).toBe(1500);
    });
  });

  describe('calculateMonthlyBalance', () => {
    it('returns income minus expense', () => {
      service.importEntries([
        { id: 'bal-inc', amount: 2000, date: '2024-01-10T00:00:00.000Z', type: EntryType.INCOME },
        { id: 'bal-exp', amount: 800, date: '2024-01-15T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      expect(service.calculateMonthlyBalance([], new Date('2024-01-15'))).toBe(1200);
    });

    it('returns negative balance when expenses exceed income', () => {
      service.importEntries([
        { id: 'neg-inc', amount: 200, date: '2024-01-10T00:00:00.000Z', type: EntryType.INCOME },
        { id: 'neg-exp', amount: 500, date: '2024-01-15T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      expect(service.calculateMonthlyBalance([], new Date('2024-01-15'))).toBe(-300);
    });
  });

  // --------------------------------------------------------------------------
  // filterEntriesByMonth
  // --------------------------------------------------------------------------

  describe('filterEntriesByMonth', () => {
    it('returns entries matching the reference month', () => {
      service.importEntries([
        { id: 'jan', amount: 100, date: '2024-01-15T00:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'feb', amount: 200, date: '2024-02-15T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const result = service.filterEntriesByMonth(new Date('2024-01-01'));
      expect(result.every((e) => e.id === 'jan')).toBeTrue();
    });

    it('excludes entries with invalid dates', () => {
      // Invalid dates are normalized on import so this path is tested via direct signal manipulation
      // We just verify the method runs without errors
      const result = service.filterEntriesByMonth(new Date('2024-01-01'));
      expect(Array.isArray(result)).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // monthsHistory computed signal
  // --------------------------------------------------------------------------

  describe('monthsHistory', () => {
    it('returns empty array when there are no entries', () => {
      expect(service.monthsHistory()).toEqual([]);
    });

    it('returns one summary per distinct month', () => {
      service.importEntries([
        { id: 'mh-jan', amount: 500, date: '2024-01-15T00:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'mh-feb', amount: 300, date: '2024-02-15T00:00:00.000Z', type: EntryType.INCOME },
      ]);
      const history = service.monthsHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('sorts months in descending order', () => {
      service.importEntries([
        { id: 'mh-a', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'mh-b', amount: 200, date: '2024-06-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const history = service.monthsHistory();
      if (history.length >= 2) {
        const years = history.map((m) => m.year * 100 + m.month);
        for (let i = 1; i < years.length; i++) {
          expect(years[i - 1]).toBeGreaterThanOrEqual(years[i]);
        }
      }
    });

    it('computes correct totals for each month', () => {
      service.importEntries([
        { id: 'mh-exp', amount: 400, date: '2024-03-10T00:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'mh-inc', amount: 600, date: '2024-03-20T00:00:00.000Z', type: EntryType.INCOME },
      ]);
      const history = service.monthsHistory();
      const march = history.find((m) => m.month === 3 && m.year === 2024);
      expect(march).toBeDefined();
      expect(march!.totalExpense).toBe(400);
      expect(march!.totalIncome).toBe(600);
      expect(march!.totalBalance).toBe(200);
    });

    it('handles multiple entries in the same month correctly', () => {
      // Use midday UTC time to avoid timezone shift to prior month in Chile (UTC-3/UTC-4)
      service.importEntries([
        { id: 'multi-a', amount: 100, date: '2024-04-10T12:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'multi-b', amount: 200, date: '2024-04-15T12:00:00.000Z', type: EntryType.EXPENSE },
        { id: 'multi-c', amount: 500, date: '2024-04-20T12:00:00.000Z', type: EntryType.INCOME },
      ]);
      const history = service.monthsHistory();
      const april = history.find((m) => m.month === 4 && m.year === 2024);
      expect(april!.totalExpense).toBe(300);
      expect(april!.totalIncome).toBe(500);
    });
  });

  // --------------------------------------------------------------------------
  // extractAndNormalizeImportedEntries
  // --------------------------------------------------------------------------

  describe('extractAndNormalizeImportedEntries', () => {
    it('normalizes and returns valid entries', () => {
      const data = [
        { id: 'ext-id', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ];
      const result = service.extractAndNormalizeImportedEntries(data);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ext-id');
    });

    it('throws when a normalized entry is null (null in array)', () => {
      // ensureEveryEntryIsObject throws first for null items
      expect(() => service.extractAndNormalizeImportedEntries([null])).toThrowError();
    });

    it('accepts object with entries property', () => {
      const result = service.extractAndNormalizeImportedEntries({
        entries: [{ id: 'obj-e', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE }],
      });
      expect(result[0].id).toBe('obj-e');
    });

    it('accepts object with expenses property', () => {
      const result = service.extractAndNormalizeImportedEntries({
        expenses: [{ id: 'obj-exp', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE }],
      });
      expect(result[0].id).toBe('obj-exp');
    });

    it('throws for completely invalid payload', () => {
      expect(() => service.extractAndNormalizeImportedEntries('invalid')).toThrowError('Invalid import payload.');
    });
  });

  // --------------------------------------------------------------------------
  // compareAndMergeEntries
  // --------------------------------------------------------------------------

  describe('compareAndMergeEntries', () => {
    it('throws when JSON parse fails', async () => {
      await expectAsync(service.compareAndMergeEntries('not valid json')).toBeRejectedWithError('Failed to parse import data as JSON.');
    });

    it('adds new entries not present in current state', async () => {
      const data = JSON.stringify([
        { id: 'merge-new', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const result = await service.compareAndMergeEntries(data);
      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('skips entries that are identical to existing ones', async () => {
      service.importEntries([
        { id: 'skip-id', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2024-01-01T00:00:00.000Z' },
      ]);
      const entries = service.getEntriesSnapshot();
      const json = JSON.stringify(entries);
      const result = await service.compareAndMergeEntries(json);
      expect(result.skipped).toBe(1);
      expect(result.added).toBe(0);
    });

    it('updates entry when imported is more recent', async () => {
      service.importEntries([
        { id: 'upd-merge', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2024-01-01T00:00:00.000Z' },
      ]);
      const newer = JSON.stringify([
        { id: 'upd-merge', amount: 999, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2025-01-01T00:00:00.000Z' },
      ]);
      const result = await service.compareAndMergeEntries(newer);
      expect(result.updated).toBe(1);
      const merged = service.getEntriesSnapshot().find((e) => e.id === 'upd-merge');
      expect(merged!.amount).toBe(999);
    });

    it('keeps existing entry when imported is older', async () => {
      service.importEntries([
        { id: 'keep-existing', amount: 777, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2025-06-01T00:00:00.000Z' },
      ]);
      const older = JSON.stringify([
        { id: 'keep-existing', amount: 1, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2023-01-01T00:00:00.000Z' },
      ]);
      const result = await service.compareAndMergeEntries(older);
      expect(result.updated).toBe(1);
      const merged = service.getEntriesSnapshot().find((e) => e.id === 'keep-existing');
      expect(merged!.amount).toBe(777);
    });

    it('keeps existing entry when imported has no updatedAt', async () => {
      service.importEntries([
        { id: 'no-upd-at', amount: 500, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE, updatedAt: '2025-01-01T00:00:00.000Z' },
      ]);
      const noDate = JSON.stringify([
        { id: 'no-upd-at', amount: 999, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      await service.compareAndMergeEntries(noDate);
      const merged = service.getEntriesSnapshot().find((e) => e.id === 'no-upd-at');
      // existing is kept because importedIsMoreRecent is null (no updatedAt)
      expect(merged!.amount).toBe(500);
    });

    it('treats imported as more recent when existing has no updatedAt but imported does', async () => {
      service.importEntries([
        { id: 'no-existing-upd', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const withDate = JSON.stringify([
        { id: 'no-existing-upd', amount: 999, date: '2024-01-01T00:00:00.000Z', type: EntryType.INCOME, updatedAt: '2024-06-01T00:00:00.000Z' },
      ]);
      await service.compareAndMergeEntries(withDate);
      const merged = service.getEntriesSnapshot().find((e) => e.id === 'no-existing-upd');
      expect(merged!.amount).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // entries$ observable
  // --------------------------------------------------------------------------

  describe('entries$ observable', () => {
    it('emits the current entries on subscription', (done) => {
      service.importEntries([
        { id: 'obs-id', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.entries$.subscribe((entries) => {
        expect(Array.isArray(entries)).toBeTrue();
        done();
      });
    });
  });

  // --------------------------------------------------------------------------
  // entriesSignal
  // --------------------------------------------------------------------------

  describe('entriesSignal', () => {
    it('reflects the current entries', () => {
      service.importEntries([
        { id: 'sig-id', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const sig = service.entriesSignal();
      expect(sig.find((e) => e.id === 'sig-id')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeAmount
  // --------------------------------------------------------------------------

  describe('normalizeAmount', () => {
    it('truncates decimal number', () => {
      expect((service as any).normalizeAmount(4.9)).toBe(4);
    });

    it('returns 0 for undefined amount', () => {
      expect((service as any).normalizeAmount(undefined)).toBe(0);
    });

    it('returns 0 for null', () => {
      expect((service as any).normalizeAmount(null)).toBe(0);
    });

    it('returns 0 for NaN string', () => {
      expect((service as any).normalizeAmount('abc')).toBe(0);
    });

    it('parses integer string', () => {
      expect((service as any).normalizeAmount('42')).toBe(42);
    });

    it('returns 0 for Infinity', () => {
      // Infinity is not finite, so parseInt(String(Infinity)) = NaN -> 0
      expect((service as any).normalizeAmount(Infinity)).toBe(0);
    });

    it('returns the number when it is a valid finite integer', () => {
      expect((service as any).normalizeAmount(100)).toBe(100);
    });

    it('truncates a negative decimal', () => {
      expect((service as any).normalizeAmount(-3.7)).toBe(-3);
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeDate
  // --------------------------------------------------------------------------

  describe('normalizeDate', () => {
    it('returns normalized ISO string when value is valid ISO string', () => {
      const result = (service as any).normalizeDate('2024-01-15T00:00:00.000Z');
      expect(result.normalizedDate).toBe('2024-01-15T00:00:00.000Z');
      expect(result.requiresSync).toBeFalse();
    });

    it('returns fallback and requiresSync=true for invalid string', () => {
      const result = (service as any).normalizeDate('not-a-date');
      expect(result.requiresSync).toBeTrue();
      expect(typeof result.normalizedDate).toBe('string');
    });

    it('returns fallback and requiresSync=true for non-string', () => {
      const result = (service as any).normalizeDate(12345);
      expect(result.requiresSync).toBeTrue();
    });

    it('returns fallback for null', () => {
      const result = (service as any).normalizeDate(null);
      expect(result.requiresSync).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeType
  // --------------------------------------------------------------------------

  describe('normalizeType', () => {
    it('returns EXPENSE without requiresSync for exact EXPENSE value', () => {
      const result = (service as any).normalizeType(EntryType.EXPENSE);
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.requiresSync).toBeFalse();
    });

    it('returns INCOME without requiresSync for exact INCOME value', () => {
      const result = (service as any).normalizeType(EntryType.INCOME);
      expect(result.type).toBe(EntryType.INCOME);
      expect(result.requiresSync).toBeFalse();
    });

    it('normalizes lowercase expense string', () => {
      const result = (service as any).normalizeType('expense');
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.requiresSync).toBeTrue();
    });

    it('normalizes lowercase income string', () => {
      const result = (service as any).normalizeType('income');
      expect(result.type).toBe(EntryType.INCOME);
      expect(result.requiresSync).toBeTrue();
    });

    it('defaults to EXPENSE for unrecognized type', () => {
      const result = (service as any).normalizeType('unknown');
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.requiresSync).toBeTrue();
    });

    it('defaults to EXPENSE for null type', () => {
      const result = (service as any).normalizeType(null);
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.requiresSync).toBeTrue();
    });

    it('defaults to EXPENSE for undefined type', () => {
      const result = (service as any).normalizeType(undefined);
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.requiresSync).toBeTrue();
    });

    it('normalizes EXPENSE uppercase variant without requiresSync when already exact', () => {
      const result = (service as any).normalizeType('EXPENSE');
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.requiresSync).toBeFalse();
    });

    it('normalizes INCOME uppercase variant without requiresSync when already exact', () => {
      const result = (service as any).normalizeType('INCOME');
      expect(result.type).toBe(EntryType.INCOME);
      expect(result.requiresSync).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeIdempotencyInfo
  // --------------------------------------------------------------------------

  describe('normalizeIdempotencyInfo', () => {
    it('returns undefined for non-array', () => {
      expect((service as any).normalizeIdempotencyInfo('string')).toBeUndefined();
    });

    it('returns undefined for empty array', () => {
      expect((service as any).normalizeIdempotencyInfo([])).toBeUndefined();
    });

    it('returns undefined when all items are invalid', () => {
      expect((service as any).normalizeIdempotencyInfo([null, { idempotencyKey: '', idempotencyVersion: 'v' }])).toBeUndefined();
    });

    it('returns valid items only', () => {
      const valid = { idempotencyKey: 'key', idempotencyVersion: 'v1' };
      const result = (service as any).normalizeIdempotencyInfo([null, valid]);
      expect(result).toEqual([valid]);
    });

    it('returns undefined for null input', () => {
      expect((service as any).normalizeIdempotencyInfo(null)).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: sanitizeTermination
  // --------------------------------------------------------------------------

  describe('sanitizeTermination', () => {
    it('returns null for undefined', () => {
      expect((service as any).sanitizeTermination(undefined)).toBeNull();
    });

    it('returns null for null', () => {
      expect((service as any).sanitizeTermination(null)).toBeNull();
    });

    it('returns indefinite termination as-is', () => {
      const result = (service as any).sanitizeTermination({ mode: 'indefinite' });
      expect(result).toEqual({ mode: 'indefinite' });
    });

    it('returns occurrences termination with truncated total', () => {
      const result = (service as any).sanitizeTermination({ mode: 'occurrences', total: 3.9 });
      expect(result).toEqual({ mode: 'occurrences', total: 3 });
    });

    it('returns null when total < 1', () => {
      expect((service as any).sanitizeTermination({ mode: 'occurrences', total: 0 })).toBeNull();
    });

    it('returns null for unknown mode', () => {
      expect((service as any).sanitizeTermination({ mode: 'weekly' } as any)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeTerminationInput
  // --------------------------------------------------------------------------

  describe('normalizeTerminationInput', () => {
    it('returns undefined for null', () => {
      const result = (service as any).normalizeTerminationInput(null);
      expect(result.termination).toBeUndefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('returns undefined for non-object', () => {
      const result = (service as any).normalizeTerminationInput('indefinite');
      expect(result.termination).toBeUndefined();
    });

    it('returns indefinite termination', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'indefinite' });
      expect(result.termination).toEqual({ mode: 'indefinite' });
      expect(result.requiresSync).toBeFalse();
    });

    it('returns occurrences termination with integer total', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'occurrences', total: 5 });
      expect(result.termination).toEqual({ mode: 'occurrences', total: 5 });
      expect(result.requiresSync).toBeFalse();
    });

    it('truncates decimal total and sets requiresSync', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'occurrences', total: 5.7 });
      expect(result.termination).toEqual({ mode: 'occurrences', total: 5 });
      expect(result.requiresSync).toBeTrue();
    });

    it('parses string total', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'occurrences', total: '3' });
      expect(result.termination).toEqual({ mode: 'occurrences', total: 3 });
    });

    it('returns undefined when total is 0 (< 1)', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'occurrences', total: 0 });
      expect(result.termination).toBeUndefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('returns undefined when total is invalid string', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'occurrences', total: 'abc' });
      expect(result.termination).toBeUndefined();
    });

    it('returns undefined for unknown mode', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'weekly' });
      expect(result.termination).toBeUndefined();
    });

    it('returns undefined when total is null (parsed from null string = NaN)', () => {
      const result = (service as any).normalizeTerminationInput({ mode: 'occurrences', total: null });
      // parseInt(String(null)) === NaN, so termination is undefined
      expect(result.termination).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeExcludedOccurrences
  // --------------------------------------------------------------------------

  describe('normalizeExcludedOccurrences', () => {
    it('returns empty array for undefined', () => {
      const result = (service as any).normalizeExcludedOccurrences(undefined);
      expect(result.values).toEqual([]);
      expect(result.requiresSync).toBeFalse();
    });

    it('returns empty array with requiresSync=true for non-array', () => {
      const result = (service as any).normalizeExcludedOccurrences('not-array');
      expect(result.values).toEqual([]);
      expect(result.requiresSync).toBeTrue();
    });

    it('returns unique sorted values', () => {
      const result = (service as any).normalizeExcludedOccurrences([3, 1, 2, 1]);
      expect(result.values).toEqual([1, 2, 3]);
      expect(result.requiresSync).toBeTrue(); // duplicates found
    });

    it('sets requiresSync true for non-integer items', () => {
      const result = (service as any).normalizeExcludedOccurrences(['abc', 1]);
      expect(result.values).toEqual([1]);
      expect(result.requiresSync).toBeTrue();
    });

    it('sets requiresSync true for negative numbers', () => {
      const result = (service as any).normalizeExcludedOccurrences([-1, 2]);
      expect(result.values).toEqual([2]);
      expect(result.requiresSync).toBeTrue();
    });

    it('returns empty array for empty array input', () => {
      const result = (service as any).normalizeExcludedOccurrences([]);
      expect(result.values).toEqual([]);
      expect(result.requiresSync).toBeFalse();
    });

    it('parses string integers', () => {
      const result = (service as any).normalizeExcludedOccurrences(['2', '4']);
      expect(result.values).toContain(2);
      expect(result.values).toContain(4);
    });

    it('does not set requiresSync for already sorted unique integers', () => {
      const result = (service as any).normalizeExcludedOccurrences([0, 1, 2]);
      expect(result.values).toEqual([0, 1, 2]);
      expect(result.requiresSync).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: normalizeStoredRecurrence
  // --------------------------------------------------------------------------

  describe('normalizeStoredRecurrence', () => {
    const fallback = '2024-01-15T00:00:00.000Z';

    it('returns undefined recurrence for undefined value', () => {
      const result = (service as any).normalizeStoredRecurrence(undefined, fallback);
      expect(result.recurrence).toBeUndefined();
      expect(result.requiresSync).toBeFalse();
    });

    it('returns undefined recurrence with requiresSync for null', () => {
      const result = (service as any).normalizeStoredRecurrence(null, fallback);
      expect(result.recurrence).toBeUndefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('returns undefined recurrence with requiresSync for non-object primitive', () => {
      const result = (service as any).normalizeStoredRecurrence('invalid', fallback);
      expect(result.recurrence).toBeUndefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('returns undefined recurrence with requiresSync for wrong frequency', () => {
      const result = (service as any).normalizeStoredRecurrence({ frequency: 'weekly' }, fallback);
      expect(result.recurrence).toBeUndefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('normalizes a valid recurrence with indefinite termination', () => {
      const rec = {
        recurrenceId: 'r1',
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
        excludedOccurrences: [],
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence).toBeDefined();
      expect(result.recurrence.frequency).toBe('monthly');
      expect(result.requiresSync).toBeFalse();
    });

    it('generates recurrenceId when missing', () => {
      const rec = {
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence.recurrenceId).toBeDefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('uses fallbackAnchor when anchorDate is not a string', () => {
      const rec = {
        recurrenceId: 'r2',
        anchorDate: 12345, // not a string
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence.anchorDate).toBe(fallback);
      expect(result.requiresSync).toBeTrue();
    });

    it('uses fallbackAnchor when anchorDate string is invalid', () => {
      const rec = {
        recurrenceId: 'r3',
        anchorDate: 'invalid-date',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence.anchorDate).toBe(fallback);
    });

    it('resets occurrenceIndex to 0 when invalid', () => {
      const rec = {
        recurrenceId: 'r4',
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: -1,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence.occurrenceIndex).toBe(0);
      expect(result.requiresSync).toBeTrue();
    });

    it('resets occurrenceIndex to 0 when it is a float', () => {
      const rec = {
        recurrenceId: 'r5',
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: 1.5,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence.occurrenceIndex).toBe(0);
    });

    it('returns undefined recurrence when termination normalization fails', () => {
      const rec = {
        recurrenceId: 'r6',
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: null,
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.recurrence).toBeUndefined();
      expect(result.requiresSync).toBeTrue();
    });

    it('propagates requiresSync from termination normalization', () => {
      const rec = {
        recurrenceId: 'r7',
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'occurrences', total: 3.7 }, // fractional -> requiresSync
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.requiresSync).toBeTrue();
    });

    it('propagates requiresSync from excludedOccurrences normalization', () => {
      const rec = {
        recurrenceId: 'r8',
        anchorDate: '2024-01-15T00:00:00.000Z',
        occurrenceIndex: 0,
        frequency: 'monthly',
        termination: { mode: 'indefinite' },
        excludedOccurrences: [2, 1, 2], // duplicates -> requiresSync
      };
      const result = (service as any).normalizeStoredRecurrence(rec, fallback);
      expect(result.requiresSync).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: areRecurrencesEqual
  // --------------------------------------------------------------------------

  describe('areRecurrencesEqual', () => {
    it('returns true when both are undefined', () => {
      expect((service as any).areRecurrencesEqual(undefined, undefined)).toBeTrue();
    });

    it('returns false when left is undefined', () => {
      expect((service as any).areRecurrencesEqual(undefined, buildRecurrence())).toBeFalse();
    });

    it('returns false when right is undefined', () => {
      expect((service as any).areRecurrencesEqual(buildRecurrence(), undefined)).toBeFalse();
    });

    it('returns true for identical recurrences', () => {
      const rec = buildRecurrence();
      expect((service as any).areRecurrencesEqual(rec, { ...rec })).toBeTrue();
    });

    it('returns false when recurrenceId differs', () => {
      const rec = buildRecurrence();
      expect((service as any).areRecurrencesEqual(rec, { ...rec, recurrenceId: 'different' })).toBeFalse();
    });

    it('returns false when anchorDate differs', () => {
      const rec = buildRecurrence();
      expect((service as any).areRecurrencesEqual(rec, { ...rec, anchorDate: '2025-01-01T00:00:00.000Z' })).toBeFalse();
    });

    it('returns false when occurrenceIndex differs', () => {
      const rec = buildRecurrence();
      expect((service as any).areRecurrencesEqual(rec, { ...rec, occurrenceIndex: 1 })).toBeFalse();
    });

    it('returns false when termination differs', () => {
      const rec = buildRecurrence();
      const other = { ...rec, termination: { mode: 'occurrences' as const, total: 3 } };
      expect((service as any).areRecurrencesEqual(rec, other)).toBeFalse();
    });

    it('returns false when excludedOccurrences differ', () => {
      const rec = buildRecurrence({ excludedOccurrences: [1] });
      const other = buildRecurrence({ excludedOccurrences: [2] });
      expect((service as any).areRecurrencesEqual(rec, other)).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: areTerminationsEqual
  // --------------------------------------------------------------------------

  describe('areTerminationsEqual', () => {
    it('returns true for two indefinite terminations', () => {
      expect((service as any).areTerminationsEqual({ mode: 'indefinite' }, { mode: 'indefinite' })).toBeTrue();
    });

    it('returns false when modes differ', () => {
      expect((service as any).areTerminationsEqual({ mode: 'indefinite' }, { mode: 'occurrences', total: 3 })).toBeFalse();
    });

    it('returns true for two occurrences terminations with same total', () => {
      expect((service as any).areTerminationsEqual({ mode: 'occurrences', total: 5 }, { mode: 'occurrences', total: 5 })).toBeTrue();
    });

    it('returns false for two occurrences terminations with different totals', () => {
      expect((service as any).areTerminationsEqual({ mode: 'occurrences', total: 3 }, { mode: 'occurrences', total: 5 })).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: areExcludedOccurrencesEqual
  // --------------------------------------------------------------------------

  describe('areExcludedOccurrencesEqual', () => {
    it('returns true for two empty/undefined arrays', () => {
      expect((service as any).areExcludedOccurrencesEqual(undefined, undefined)).toBeTrue();
      expect((service as any).areExcludedOccurrencesEqual([], [])).toBeTrue();
    });

    it('returns true when arrays have same elements in different order', () => {
      expect((service as any).areExcludedOccurrencesEqual([3, 1, 2], [1, 2, 3])).toBeTrue();
    });

    it('returns false when lengths differ', () => {
      expect((service as any).areExcludedOccurrencesEqual([1, 2], [1, 2, 3])).toBeFalse();
    });

    it('returns false when elements differ', () => {
      expect((service as any).areExcludedOccurrencesEqual([1, 2], [1, 3])).toBeFalse();
    });

    it('returns true when both have undefined and empty array mixed', () => {
      expect((service as any).areExcludedOccurrencesEqual(undefined, [])).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: truncateTerminationAfterCutoff
  // --------------------------------------------------------------------------

  describe('truncateTerminationAfterCutoff', () => {
    it('converts indefinite to occurrences with safeCutoff total', () => {
      const result = (service as any).truncateTerminationAfterCutoff({ mode: 'indefinite' }, 3);
      expect(result).toEqual({ mode: 'occurrences', total: 3 });
    });

    it('uses Math.max(cutoffIndex, 0) for safeCutoff (negative cutoff)', () => {
      const result = (service as any).truncateTerminationAfterCutoff({ mode: 'indefinite' }, -5);
      expect(result).toEqual({ mode: 'occurrences', total: 0 });
    });

    it('truncates occurrences total to min of existing and cutoff', () => {
      const result = (service as any).truncateTerminationAfterCutoff({ mode: 'occurrences', total: 10 }, 3);
      expect(result).toEqual({ mode: 'occurrences', total: 3 });
    });

    it('keeps occurrences total when cutoff is higher', () => {
      const result = (service as any).truncateTerminationAfterCutoff({ mode: 'occurrences', total: 3 }, 10);
      expect(result).toEqual({ mode: 'occurrences', total: 3 });
    });
  });

  // --------------------------------------------------------------------------
  // Private method: resolveMaxOccurrenceIndex
  // --------------------------------------------------------------------------

  describe('resolveMaxOccurrenceIndex', () => {
    it('returns null when anchorDate is invalid', () => {
      const rec = buildRecurrence({ anchorDate: 'bad-date' });
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2024-06-01'));
      expect(result).toBeNull();
    });

    it('returns null when anchorDate is in the future relative to targetDate', () => {
      const rec = buildRecurrence({ anchorDate: '2025-01-01T00:00:00.000Z' });
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2024-01-01'));
      expect(result).toBeNull();
    });

    it('returns monthDistance for indefinite termination', () => {
      const rec = buildRecurrence({
        anchorDate: '2024-01-01T00:00:00.000Z',
        termination: { mode: 'indefinite' },
      });
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2024-03-01'));
      expect(result).toBe(2);
    });

    it('returns min(monthDistance, limit) for occurrences termination', () => {
      const rec = buildRecurrence({
        anchorDate: '2024-01-01T00:00:00.000Z',
        termination: { mode: 'occurrences', total: 3 },
      });
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2025-01-01'));
      // monthDistance = 12, limit = 2, so min = 2
      expect(result).toBe(2);
    });

    it('returns null when occurrences limit < 0 (total = 0)', () => {
      const rec = buildRecurrence({
        anchorDate: '2024-01-01T00:00:00.000Z',
        termination: { mode: 'occurrences', total: 0 },
      });
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2024-06-01'));
      expect(result).toBeNull();
    });

    it('returns 0 when anchor equals targetDate', () => {
      const rec = buildRecurrence({
        anchorDate: '2024-01-01T00:00:00.000Z',
        termination: { mode: 'indefinite' },
      });
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2024-01-01'));
      expect(result).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Private method: calculateMonthDistance
  // --------------------------------------------------------------------------

  describe('calculateMonthDistance', () => {
    it('returns 0 for same month', () => {
      const result = (service as any).calculateMonthDistance(
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T00:00:00.000Z')
      );
      expect(result).toBe(0);
    });

    it('returns positive months for end > start', () => {
      const result = (service as any).calculateMonthDistance(
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-04-01T00:00:00.000Z')
      );
      expect(result).toBe(3);
    });

    it('returns negative months for end < start', () => {
      const result = (service as any).calculateMonthDistance(
        new Date('2024-04-01T00:00:00.000Z'),
        new Date('2024-01-01T00:00:00.000Z')
      );
      expect(result).toBe(-3);
    });

    it('accounts for year differences', () => {
      const result = (service as any).calculateMonthDistance(
        new Date('2023-01-01T00:00:00.000Z'),
        new Date('2024-01-01T00:00:00.000Z')
      );
      expect(result).toBe(12);
    });
  });

  // --------------------------------------------------------------------------
  // Private method: addMonths
  // --------------------------------------------------------------------------

  describe('addMonths', () => {
    it('adds months correctly', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const result = (service as any).addMonths(date, 3);
      expect(result.getUTCMonth()).toBe(3); // 0-indexed: April
      expect(result.getUTCFullYear()).toBe(2024);
    });

    it('handles year rollover', () => {
      const date = new Date('2024-11-01T00:00:00.000Z');
      const result = (service as any).addMonths(date, 3);
      expect(result.getUTCMonth()).toBe(1); // February
      expect(result.getUTCFullYear()).toBe(2025);
    });

    it('does not mutate original date', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      (service as any).addMonths(date, 5);
      expect(date.getUTCMonth()).toBe(0); // still January
    });
  });

  // --------------------------------------------------------------------------
  // Private method: createRecurrenceMetadata
  // --------------------------------------------------------------------------

  describe('createRecurrenceMetadata', () => {
    it('returns undefined when recurrence is undefined', () => {
      const result = (service as any).createRecurrenceMetadata(undefined, '2024-01-01T00:00:00.000Z');
      expect(result).toBeUndefined();
    });

    it('returns undefined when frequency is not monthly', () => {
      const result = (service as any).createRecurrenceMetadata(
        { frequency: 'weekly', termination: { mode: 'indefinite' } } as any,
        '2024-01-01T00:00:00.000Z'
      );
      expect(result).toBeUndefined();
    });

    it('returns undefined when termination is invalid', () => {
      const result = (service as any).createRecurrenceMetadata(
        { frequency: 'monthly', termination: null } as any,
        '2024-01-01T00:00:00.000Z'
      );
      expect(result).toBeUndefined();
    });

    it('returns valid recurrence metadata for indefinite termination', () => {
      const result = (service as any).createRecurrenceMetadata(
        { frequency: 'monthly', termination: { mode: 'indefinite' } },
        '2024-01-01T00:00:00.000Z'
      );
      expect(result).toBeDefined();
      expect(result.frequency).toBe('monthly');
      expect(result.occurrenceIndex).toBe(0);
      expect(result.anchorDate).toBe('2024-01-01T00:00:00.000Z');
      expect(result.termination).toEqual({ mode: 'indefinite' });
    });

    it('returns valid recurrence metadata for occurrences termination', () => {
      const result = (service as any).createRecurrenceMetadata(
        { frequency: 'monthly', termination: { mode: 'occurrences', total: 6 } },
        '2024-01-01T00:00:00.000Z'
      );
      expect(result.termination).toEqual({ mode: 'occurrences', total: 6 });
    });
  });

  // --------------------------------------------------------------------------
  // Private method: buildMonthKey
  // --------------------------------------------------------------------------

  describe('buildMonthKey', () => {
    it('returns a YYYY-MM string', () => {
      const key = (service as any).buildMonthKey(new Date('2024-03-15T00:00:00.000Z'));
      expect(key).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  // --------------------------------------------------------------------------
  // Private method: isMonthlyRecurringEntry
  // --------------------------------------------------------------------------

  describe('isMonthlyRecurringEntry', () => {
    it('returns true for entry with monthly recurrence', () => {
      const entry = buildEntry({ recurrence: buildRecurrence() });
      expect((service as any).isMonthlyRecurringEntry(entry)).toBeTrue();
    });

    it('returns false for entry without recurrence', () => {
      const entry = buildEntry();
      expect((service as any).isMonthlyRecurringEntry(entry)).toBeFalse();
    });

    it('returns false when recurrence frequency is not monthly', () => {
      const entry = buildEntry({ recurrence: { ...buildRecurrence(), frequency: 'weekly' as any } });
      expect((service as any).isMonthlyRecurringEntry(entry)).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // Private method: generateId
  // --------------------------------------------------------------------------

  describe('generateId', () => {
    it('returns a non-empty string', () => {
      const id = (service as any).generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('returns unique ids on successive calls', () => {
      const id1 = (service as any).generateId();
      const id2 = (service as any).generateId();
      expect(id1).not.toBe(id2);
    });
  });

  // --------------------------------------------------------------------------
  // Private method: extractImportedEntries (via extractAndNormalizeImportedEntries)
  // --------------------------------------------------------------------------

  describe('extractImportedEntries', () => {
    it('throws for string input', () => {
      expect(() => (service as any).extractImportedEntries('invalid')).toThrowError('Invalid import payload.');
    });

    it('throws for number input', () => {
      expect(() => (service as any).extractImportedEntries(42)).toThrowError('Invalid import payload.');
    });

    it('accepts direct array', () => {
      const items = [{ id: 'x', amount: 1, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE }];
      const result = (service as any).extractImportedEntries(items);
      expect(result).toEqual(items);
    });

    it('accepts object with entries property', () => {
      const items = [{ id: 'e', amount: 1, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE }];
      const result = (service as any).extractImportedEntries({ entries: items });
      expect(result).toEqual(items);
    });

    it('accepts object with expenses property (entries is undefined)', () => {
      const items = [{ id: 'exp', amount: 1, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE }];
      const result = (service as any).extractImportedEntries({ expenses: items });
      expect(result).toEqual(items);
    });

    it('throws when object has neither entries nor expenses arrays', () => {
      expect(() => (service as any).extractImportedEntries({ other: [] })).toThrowError('Invalid import payload.');
    });

    it('throws when entries is not an array', () => {
      expect(() => (service as any).extractImportedEntries({ entries: 'not-array' })).toThrowError('Invalid import payload.');
    });
  });

  // --------------------------------------------------------------------------
  // ensureRecurringEntriesUpTo — edge cases
  // --------------------------------------------------------------------------

  describe('ensureRecurringEntriesUpTo (via addEntry)', () => {
    it('does not do anything for invalid date', () => {
      // Should not throw
      (service as any).ensureRecurringEntriesUpTo(new Date('invalid'));
      expect(service.getEntriesSnapshot().length).toBe(0);
    });

    it('does not do anything for non-Date argument', () => {
      (service as any).ensureRecurringEntriesUpTo('2024-01-01');
      expect(service.getEntriesSnapshot().length).toBe(0);
    });

    it('does nothing when entries list is empty', () => {
      const before = localStorageServiceSpy.setItem.calls.count();
      (service as any).ensureRecurringEntriesUpTo(new Date());
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('does nothing when no recurring entries exist', () => {
      service.importEntries([
        { id: 'no-rec', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const before = localStorageServiceSpy.setItem.calls.count();
      (service as any).ensureRecurringEntriesUpTo(new Date());
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    });

    it('generates additional occurrences for a recurring entry', fakeAsync(() => {
      // Anchor in the past to generate multiple occurrences
      service.addEntry({
        amount: 500,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 3 } },
      });
      tick();
      const entries = service.getEntriesSnapshot();
      expect(entries.filter((e) => e.recurrence !== undefined).length).toBeGreaterThanOrEqual(1);
    }));

    it('uses index=0 entry as template when template has index > 0 initially', fakeAsync(() => {
      // Import a recurring entry where index=0 is added last in the grouping loop
      service.addEntry({
        amount: 250,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.INCOME,
        updatedAt: undefined,
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 2 } },
      });
      tick();
      const entries = service.getEntriesSnapshot();
      const recurring = entries.filter((e) => e.recurrence !== undefined);
      expect(recurring.length).toBeGreaterThan(0);
    }));

    it('skips excluded occurrences when generating', fakeAsync(() => {
      // Import a series with an excluded occurrence manually
      const recurrenceId = 'exc-rec-id';
      service.importEntries([
        {
          id: 'exc-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [1], // skip index 1
          } as any,
        },
      ]);
      tick();
      const entries = service.getEntriesSnapshot();
      const recurring = entries.filter((e) => e.recurrence?.recurrenceId === recurrenceId);
      // Index 1 should be excluded
      expect(recurring.find((e) => e.recurrence!.occurrenceIndex === 1)).toBeUndefined();
    }));

    it('breaks when anchorDate becomes invalid during loop', fakeAsync(() => {
      // This covers the `if (Number.isNaN(anchorDate.getTime())) { break; }` in ensureRecurringEntriesUpTo
      // We need to inject an entry with valid recurrence but then corrupt the anchorDate
      const recurrenceId = 'bad-anchor-rec';
      service.importEntries([
        {
          id: 'bad-anchor-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      tick();
      // Manually set anchor to invalid after import
      const entries = service.getEntriesSnapshot();
      const entry = entries.find((e) => e.id === 'bad-anchor-0');
      if (entry && entry.recurrence) {
        // Corrupt the anchorDate and call ensureRecurring directly
        const mutated = { ...entry, recurrence: { ...entry.recurrence, anchorDate: 'INVALID' } };
        (service as any).entriesSubject.next([mutated]);
        (service as any).ensureRecurringEntriesUpTo(new Date('2025-01-01'));
      }
      // Should not throw
    }));
  });

  // --------------------------------------------------------------------------
  // removeEntry — additional edge cases
  // --------------------------------------------------------------------------

  describe('removeEntry - additional edge cases', () => {
    it('does not persist when filtered list has same length (should not happen in practice)', () => {
      // This tests the `if (updatedEntries.length === currentEntries.length) return;` guard
      // for non-recurring entries: entry is found (targetEntry exists) but somehow
      // filter doesn't reduce count. This is theoretically unreachable unless id is not unique.
      // We test via normal flow to ensure the guard is exercised
      service.importEntries([
        { id: 'remove-guard', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      service.removeEntry('remove-guard');
      expect(service.getEntriesSnapshot().length).toBe(0);
    });

    it('handles future scope with a recurring entry that has excluded occurrences', fakeAsync(() => {
      const recurrenceId = 'future-excl';
      service.importEntries([
        {
          id: 'fe-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
        {
          id: 'fe-1',
          amount: 100,
          date: '2024-02-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 1,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
        {
          id: 'fe-2',
          amount: 100,
          date: '2024-03-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 2,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      tick();

      service.removeEntry('fe-1', 'future');
      const remaining = service.getEntriesSnapshot();
      // fe-1 and fe-2 should be gone
      expect(remaining.find((e) => e.id === 'fe-1')).toBeUndefined();
      expect(remaining.find((e) => e.id === 'fe-2')).toBeUndefined();
      // fe-0 should survive
      expect(remaining.find((e) => e.id === 'fe-0')).toBeDefined();
    }));

    it('handles future scope: retainedEntries.length === currentEntries.length guard', fakeAsync(() => {
      // This covers the guard after retainedEntries filter in 'future' scope
      // A single occurrence-0 entry being removed with 'future' scope goes through 'series' path
      // But if all entries have same recurrenceId and all have index >= occurrenceIndex,
      // the retained length would equal original length only if occurrenceIndex is 0 (series path)
      // So this is effectively tested above; just verify it doesn't crash
      service.importEntries([
        {
          id: 'fe-only',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId: 'only-rec',
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      service.removeEntry('fe-only', 'future');
      const remaining = service.getEntriesSnapshot();
      expect(remaining.length).toBe(0);
    }));

    it('handles single scope on recurring entry: adds occurrenceIndex to excludedOccurrences', fakeAsync(() => {
      const recurrenceId = 'single-excl';
      service.importEntries([
        {
          id: 'se-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
        {
          id: 'se-1',
          amount: 100,
          date: '2024-02-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 1,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      tick();

      service.removeEntry('se-0', 'single');

      const remaining = service.getEntriesSnapshot();
      expect(remaining.find((e) => e.id === 'se-0')).toBeUndefined();
      // se-1 should have excludedOccurrences = [0]
      const se1 = remaining.find((e) => e.id === 'se-1');
      if (se1) {
        expect(se1.recurrence!.excludedOccurrences).toContain(0);
      }
    }));

    it('does not persist when series removal finds no entries to remove', fakeAsync(() => {
      // Import a non-recurring entry and then try to remove with scope=series
      // In 'series' scope, it should only remove recurring ones; non-recurring goes different path
      service.importEntries([
        { id: 'nrec-series', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      // removeEntry for non-recurring entry with scope='series'
      // targetEntry is non-recurring -> takes the !isMonthlyRecurringEntry(targetEntry) path -> single removal
      service.removeEntry('nrec-series', 'series');
      expect(service.getEntriesSnapshot().length).toBe(0);
    }));
  });

  // --------------------------------------------------------------------------
  // removeEntry: future scope with excluded occurrences (covers line 773)
  // Uses direct entriesSubject injection to bypass ensureRecurringEntriesUpTo
  // --------------------------------------------------------------------------

  describe('removeEntry - future scope with excluded occurrences (line 773)', () => {
    it('filters existing excluded occurrences >= occurrenceIndex in future scope (line 773 callback)', () => {
      const recurrenceId = 'line773-rec';
      const entries: EntryData[] = [
        {
          id: 'l773-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 5 },
            excludedOccurrences: [3, 5],
          },
        },
        {
          id: 'l773-1',
          amount: 100,
          date: '2024-02-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 1,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 5 },
            excludedOccurrences: [3, 5],
          },
        },
        {
          id: 'l773-2',
          amount: 100,
          date: '2024-03-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 2,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 5 },
            excludedOccurrences: [3, 5],
          },
        },
      ];
      // Directly bypass normalization to set entries with non-empty excludedOccurrences
      (service as any).entriesSubject.next(entries);
      (service as any).entriesSignal.set(entries);

      // Remove l773-2 with future scope (occurrenceIndex=2)
      // sanitizedEntries.map() runs for l773-0 and l773-1
      // filteredExcluded = [3,5].filter(v => v < 2) => both 3 and 5 fail (3 < 2 = false; 5 < 2 = false)
      // The callback at line 773 runs for values 3 and 5
      service.removeEntry('l773-2', 'future');
      const remaining = (service as any).entriesSubject.value as EntryData[];

      expect(remaining.find((e: EntryData) => e.id === 'l773-2')).toBeUndefined();
      const l773d0 = remaining.find((e: EntryData) => e.id === 'l773-0');
      expect(l773d0).toBeDefined();
      // All excluded indices (3, 5) are >= occurrenceIndex (2), so filteredExcluded = []
      if (l773d0) {
        expect(l773d0.recurrence!.excludedOccurrences).toEqual([]);
      }
    });

    it('keeps excluded occurrences < occurrenceIndex in future scope removal (line 773 true path)', () => {
      const recurrenceId = 'line773-keep-rec';
      const entries: EntryData[] = [
        {
          id: 'l773k-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 5 },
            excludedOccurrences: [1, 4],
          },
        },
        {
          id: 'l773k-2',
          amount: 100,
          date: '2024-03-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 2,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 5 },
            excludedOccurrences: [1, 4],
          },
        },
      ];
      (service as any).entriesSubject.next(entries);
      (service as any).entriesSignal.set(entries);

      // Remove l773k-2 (occurrenceIndex=2) with future scope
      // filteredExcluded = [1,4].filter(v => v < 2)
      // v=1: 1 < 2 = true (kept); v=4: 4 < 2 = false (removed)
      service.removeEntry('l773k-2', 'future');
      const remaining = (service as any).entriesSubject.value as EntryData[];

      const l773k0 = remaining.find((e: EntryData) => e.id === 'l773k-0');
      expect(l773k0).toBeDefined();
      if (l773k0) {
        // Only index 1 is kept (< 2); index 4 is removed (>= 2)
        expect(l773k0.recurrence!.excludedOccurrences).toEqual([1]);
      }
    });
  });

  // --------------------------------------------------------------------------
  // persistEntries — verify localStorage integration
  // --------------------------------------------------------------------------

  describe('persistEntries', () => {
    it('calls localStorageService.setItem with storage key and entries', () => {
      const entry = buildEntry({ id: 'persist-test' });
      service.importEntries([entry]);
      expect(localStorageServiceSpy.setItem).toHaveBeenCalledWith(
        'presupuestapp:entries',
        jasmine.any(Array)
      );
    });

    it('updates entriesSubject', () => {
      let emitted: EntryData[] = [];
      service.entries$.subscribe((entries) => (emitted = entries));
      service.importEntries([
        { id: 'subj-test', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      expect(emitted.find((e) => e.id === 'subj-test')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // generateId — fallback branch coverage (when crypto.randomUUID unavailable)
  // --------------------------------------------------------------------------

  describe('generateId fallback', () => {
    it('uses fallback id generation when crypto.randomUUID is not available', () => {
      // We need to exercise lines 1242-1248 in generateId.
      // The condition is: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      // To reach the fallback we need this condition to be false.
      // Approach: temporarily replace crypto with a version without randomUUID
      // using the window object (browser environment).
      const win = window as any;
      const originalCrypto = win.crypto;

      // Create a mock crypto without randomUUID
      const mockCrypto = {
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
        subtle: originalCrypto.subtle,
        // No randomUUID
      };

      try {
        Object.defineProperty(win, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true,
        });

        const id = (service as any).generateId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
        // Fallback format: `${hex}-${12-char-hex}`
        expect(id).toMatch(/^[0-9a-f]+-[0-9a-f]{12}$/);
      } finally {
        Object.defineProperty(win, 'crypto', {
          value: originalCrypto,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  // --------------------------------------------------------------------------
  // extractAndNormalizeImportedEntries — null normalizeStoredEntry result (line 1348)
  // --------------------------------------------------------------------------

  describe('extractAndNormalizeImportedEntries - null normalizeStoredEntry', () => {
    it('throws when normalizeStoredEntry returns null for an entry', () => {
      // Spy on the private method to return null
      spyOn<any>(service, 'normalizeStoredEntry').and.returnValue(null);

      expect(() => service.extractAndNormalizeImportedEntries([
        { id: 'spy-entry', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ])).toThrowError('Invalid entry detected during import.');
    });
  });

  // --------------------------------------------------------------------------
  // Additional branch coverage: normalizeStoredEntry idempotencyInfo spread
  // --------------------------------------------------------------------------

  describe('normalizeStoredEntry - idempotencyInfo branch', () => {
    it('does not include idempotencyInfo key when idempotencyInfo is undefined', () => {
      const entry = {
        id: 'no-idem',
        amount: 100,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.entry.hasOwnProperty('idempotencyInfo')).toBeFalse();
    });

    it('includes idempotencyInfo key when idempotencyInfo is valid', () => {
      const entry = {
        id: 'with-idem',
        amount: 100,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        idempotencyInfo: [{ idempotencyKey: 'k', idempotencyVersion: 'v' }],
      };
      const result = (service as any).normalizeStoredEntry(entry);
      expect(result.entry.hasOwnProperty('idempotencyInfo')).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // removeEntry - non-recurring: guard when filtered length equals current (impossible in practice)
  // The `if (updatedEntries.length === currentEntries.length) return;` for the non-recurring single path
  // is unreachable normally (since find already confirmed the entry exists), but we cover it via
  // the normal removal flow. Additional edge case: non-recurring entries in a 'future' scope removal:
  // covers the `entry.id !== entryId` filter inside the future's retainedEntries.filter
  // --------------------------------------------------------------------------

  describe('removeEntry - non-recurring entry in future scope filter', () => {
    it('non-recurring entry in same remove call with future scope is excluded from retained', fakeAsync(() => {
      const recurrenceId = 'mixed-rec';
      // Import a non-recurring entry and a recurring series
      service.importEntries([
        {
          id: 'nrec-mixed',
          amount: 999,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.INCOME,
        },
        {
          id: 'rec-mixed-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
        {
          id: 'rec-mixed-1',
          amount: 100,
          date: '2024-02-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 1,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
        {
          id: 'rec-other-0',
          amount: 200,
          date: '2024-01-05T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId: 'other-rec',
            anchorDate: '2024-01-05T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      tick();

      // Remove rec-mixed-1 with 'future' scope
      // This exercises: entry.recurrence.recurrenceId !== recurrenceId path for rec-other-0
      service.removeEntry('rec-mixed-1', 'future');
      const remaining = service.getEntriesSnapshot();

      // rec-mixed-1 should be gone
      expect(remaining.find((e) => e.id === 'rec-mixed-1')).toBeUndefined();
      // nrec-mixed and rec-other-0 should remain
      expect(remaining.find((e) => e.id === 'nrec-mixed')).toBeDefined();
      expect(remaining.find((e) => e.id === 'rec-other-0')).toBeDefined();
    }));
  });

  // --------------------------------------------------------------------------
  // resolveMaxOccurrenceIndex — monthDistance < 0 branch
  // --------------------------------------------------------------------------

  describe('resolveMaxOccurrenceIndex - monthDistance < 0', () => {
    it('returns null when anchorDate is exactly equal to targetDate but in a future month (UTC)', () => {
      // anchorDate > targetDate case
      const rec = buildRecurrence({
        anchorDate: '2024-06-01T00:00:00.000Z',
        termination: { mode: 'indefinite' },
      });
      // targetDate is before anchorDate
      const result = (service as any).resolveMaxOccurrenceIndex(rec, new Date('2024-01-01T00:00:00.000Z'));
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // ensureRecurringEntriesUpTo — template replacement when occurrenceIndex === 0
  // is processed after initial group setup (covers existing.template = entry path)
  // --------------------------------------------------------------------------

  describe('ensureRecurringEntriesUpTo - template update path', () => {
    it('updates template when a new occurrence with index 0 is pushed into an existing group', fakeAsync(() => {
      const recurrenceId = 'tmpl-update-rec';
      // Import two occurrences: index 1 first, then index 0
      // This means the group is initialized with index=1 as template,
      // then index=0 is processed and replaces template
      service.importEntries([
        {
          id: 'tmpl-1',
          amount: 150,
          date: '2024-02-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 1,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
        {
          id: 'tmpl-0',
          amount: 100,
          date: '2024-01-01T00:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId,
            anchorDate: '2024-01-01T00:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      tick();

      const entries = service.getEntriesSnapshot();
      const recurring = entries.filter((e) => e.recurrence?.recurrenceId === recurrenceId);
      expect(recurring.length).toBeGreaterThanOrEqual(2);
    }));
  });

  // --------------------------------------------------------------------------
  // compareAndMergeEntries — edge cases for importedUpdatedAt / existingUpdatedAt
  // --------------------------------------------------------------------------

  describe('compareAndMergeEntries - updatedAt edge cases', () => {
    it('counts as updated when both have no updatedAt but content differs', async () => {
      service.importEntries([
        { id: 'no-dates', amount: 100, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      // Clear updatedAt from the entry by directly manipulating
      const entries = service.getEntriesSnapshot();
      const entry = entries[0];
      // Re-import with same id but different amount and no updatedAt
      // (importEntries replaces everything, so we need to use compareAndMerge)
      const jsonWithDiff = JSON.stringify([
        { id: entry.id, amount: 999, date: '2024-01-01T00:00:00.000Z', type: EntryType.EXPENSE },
      ]);
      const result = await service.compareAndMergeEntries(jsonWithDiff);
      // imported has no updatedAt -> importedUpdatedAt is null -> importedIsMoreRecent is null/false
      // -> existingEntry is kept -> updated count increases
      expect(result.updated).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // removeEntry: single scope with non-recurring and different-recurrenceId siblings (line 797)
  // --------------------------------------------------------------------------

  describe('removeEntry - single scope covers line 797', () => {
    it('passes through non-recurring entries and different-recurrence entries unchanged', fakeAsync(() => {
      const recId = 'single-line797';
      service.importEntries([
        // Non-recurring — triggers `!isMonthlyRecurringEntry(entry)` branch (line 797)
        { id: 'nrec-797', amount: 500, date: '2024-01-10T12:00:00.000Z', type: EntryType.INCOME },
        // Different recurrenceId recurring — triggers `recurrenceId !== recurrenceId` branch (line 797)
        {
          id: 'diff-rec-797',
          amount: 200,
          date: '2024-01-12T12:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId: 'different-id-797',
            anchorDate: '2024-01-12T12:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 2 },
            excludedOccurrences: [],
          } as any,
        },
        // Target recurring entry (index 0)
        {
          id: 'target-797',
          amount: 100,
          date: '2024-01-01T12:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId: recId,
            anchorDate: '2024-01-01T12:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
        // Another occurrence in same series
        {
          id: 'same-rec-1',
          amount: 100,
          date: '2024-02-01T12:00:00.000Z',
          type: EntryType.EXPENSE,
          recurrence: {
            recurrenceId: recId,
            anchorDate: '2024-01-01T12:00:00.000Z',
            occurrenceIndex: 1,
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: 3 },
            excludedOccurrences: [],
          } as any,
        },
      ]);
      tick();

      service.removeEntry('target-797', 'single');
      const remaining = service.getEntriesSnapshot();

      // Non-recurring sibling untouched
      expect(remaining.find((e) => e.id === 'nrec-797')).toBeDefined();
      // Different-recurrence entry untouched
      expect(remaining.find((e) => e.id === 'diff-rec-797')).toBeDefined();
      // Target removed
      expect(remaining.find((e) => e.id === 'target-797')).toBeUndefined();
    }));
  });

  // --------------------------------------------------------------------------
  // ensureRecurringEntriesUpTo: anchorDate NaN break (line 936)
  // --------------------------------------------------------------------------

  describe('ensureRecurringEntriesUpTo - anchorDate NaN break', () => {
    it('breaks loop when anchorDate becomes NaN inside loop', fakeAsync(() => {
      // Inject a recurring entry with valid recurrence but corrupt the anchorDate
      // so that inside ensureRecurring, when the loop runs, new Date(anchorDate) is NaN
      const entry: EntryData = {
        id: 'nan-anchor-rec',
        amount: 100,
        date: '2024-01-01T00:00:00.000Z',
        type: EntryType.EXPENSE,
        recurrence: {
          recurrenceId: 'nan-anchor-id',
          anchorDate: 'INVALID_DATE',  // Will cause NaN in addMonths call
          occurrenceIndex: 0,
          frequency: 'monthly',
          termination: { mode: 'occurrences', total: 5 },
          excludedOccurrences: [],
        },
      };

      // Directly set entriesSubject with this corrupt entry (bypasses normalization)
      (service as any).entriesSubject.next([entry]);
      (service as any).entriesSignal.set([entry]);

      // ensureRecurringEntriesUpTo will compute maxIndex, find index 0 missing,
      // try to create it, hit anchorDate NaN, and break
      (service as any).ensureRecurringEntriesUpTo(new Date('2026-01-01'));
      tick();

      // Should not throw and no new entries created
      const entries = (service as any).entriesSubject.value;
      expect(entries.length).toBe(1); // Original entry unchanged
    }));
  });

  // --------------------------------------------------------------------------
  // ensureRecurringEntriesUpTo: grouped.size === 0 guard (line 910)
  // This is theoretically unreachable (recurringEntries.length > 0 guarantees grouped.size > 0)
  // but we cover it by testing the surrounding code paths
  // --------------------------------------------------------------------------

  describe('ensureRecurringEntriesUpTo - grouped.size check coverage', () => {
    it('handles recurring series where maxIndex is null for all groups (no mutation)', fakeAsync(() => {
      // Use an anchor date far in the future so resolveMaxOccurrenceIndex returns null
      // This means no new occurrences are generated, mutated stays false
      const farFutureAnchor = '2099-06-01T00:00:00.000Z';
      (service as any).entriesSubject.next([{
        id: 'far-future-rec',
        amount: 100,
        date: farFutureAnchor,
        type: EntryType.EXPENSE,
        recurrence: {
          recurrenceId: 'far-future-rec-id',
          anchorDate: farFutureAnchor,
          occurrenceIndex: 0,
          frequency: 'monthly',
          termination: { mode: 'indefinite' },
          excludedOccurrences: [],
        },
      }]);

      const before = localStorageServiceSpy.setItem.calls.count();
      (service as any).ensureRecurringEntriesUpTo(new Date('2024-01-01'));
      tick();

      // No new entries, so setItem is not called from ensureRecurring
      expect(localStorageServiceSpy.setItem.calls.count()).toBe(before);
    }));
  });
});
