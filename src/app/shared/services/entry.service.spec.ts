import { TestBed } from '@angular/core/testing';

import { EntryData, EntryType, IdempotencyInfo } from '../models/entry-data.model';
import { EntryService } from './entry.service';
import { LocalStorageService } from './local-storage.service';

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
  // normalizeStoredEntry — idempotencyInfo preservation
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
  });

  // --------------------------------------------------------------------------
  // importEntries — idempotencyInfo preservation
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
  });

  // --------------------------------------------------------------------------
  // restoreEntriesFromStorage — idempotencyInfo preservation
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
  });

  // --------------------------------------------------------------------------
  // updateEntry — idempotencyInfo preservation
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
  });
});
