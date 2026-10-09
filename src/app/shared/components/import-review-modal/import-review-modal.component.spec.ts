import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';

import {
  ImportReviewModalComponent,
  ImportConfirmation,
} from './import-review-modal.component';
import {
  MergeResult,
  ParsedEntry,
  PotentialDuplicate,
  SelfTransferEntry,
  ExternalEntryImportService,
} from '../../services/external-entry-import.service';
import { UtilsService } from '../../services/utils.service';
import { EntryType } from '../../models/entry-data.model';
import { EntryService } from '../../services/entry.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { buildMonthDetailData } from '../../utils/trends-data.util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal ParsedEntry fixture.
 *
 * @param overrides Optional partial overrides.
 * @returns A complete ParsedEntry fixture.
 */
function buildParsedEntry(overrides: Partial<ParsedEntry> = {}): ParsedEntry {
  return {
    date: overrides.date ?? '2026-01-15T00:00:00.000Z',
    description: overrides.description ?? 'Test entry',
    amount: overrides.amount ?? 5000,
    type: overrides.type ?? EntryType.EXPENSE,
    idempotencyInfo: overrides.idempotencyInfo ?? [
      { idempotencyKey: 'key-1', idempotencyVersion: '1' },
    ],
    ...overrides,
  };
}

/**
 * Creates a minimal PotentialDuplicate fixture.
 *
 * @param entry Optional imported entry; a default is used when omitted.
 * @returns A PotentialDuplicate fixture.
 */
function buildPotentialDuplicate(
  entry?: ParsedEntry,
): PotentialDuplicate {
  const importedEntry = entry ?? buildParsedEntry();
  return {
    importedEntry,
    matchedEntry: {
      id: 'existing-1',
      amount: importedEntry.amount,
      date: importedEntry.date,
      type: importedEntry.type,
    },
  };
}

/**
 * Creates an empty MergeResult fixture.
 *
 * @param overrides Optional partial overrides for the three buckets.
 * @returns A MergeResult fixture.
 */
function buildMergeResult(overrides: Partial<MergeResult> = {}): MergeResult {
  return {
    exactDuplicates: overrides.exactDuplicates ?? [],
    potentialDuplicates: overrides.potentialDuplicates ?? [],
    readyToImport: overrides.readyToImport ?? [],
    selfTransfers: overrides.selfTransfers,
  };
}

function buildSelfTransferEntry(entry?: ParsedEntry, ignored = true): SelfTransferEntry {
  return { entry: entry ?? buildParsedEntry({ description: 'Auto-transferencia' }), ignored };
}

/**
 * Formats an ISO date as a calendar key in the app timezone.
 *
 * @param dateStr ISO date string.
 * @returns Date key in yyyy-mm-dd format for America/Santiago.
 */
function getChileDateKey(dateStr: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Santiago',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(new Date(dateStr));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// UtilsService stub – used in template only, no method calls under test
// ---------------------------------------------------------------------------

class UtilsServiceStub {
  formatAmount(_amount: number): string {
    return '$0';
  }
  formatTime(_date: Date): string {
    return '00:00';
  }
  buildMonthLabel(_month: number, _year: number): string {
    return '';
  }
  buildMonthLabelFromDate(_date: Date): string {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ImportReviewModalComponent', () => {
  let component: ImportReviewModalComponent;
  let fixture: ComponentFixture<ImportReviewModalComponent>;
  let alertController: jasmine.SpyObj<AlertController>;
  let descriptionAlert: { present: jasmine.Spy; onDidDismiss: jasmine.Spy };

  /**
   * Initialises the component with a given MergeResult and runs change
   * detection so that the constructor effect fires.
   *
   * @param mergeResult The initial merge result to set.
   */
  function setupComponent(mergeResult: MergeResult): void {
    fixture.componentRef.setInput('mergeResult', mergeResult);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    descriptionAlert = {
      present: jasmine.createSpy('present').and.resolveTo(),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({ role: 'cancel' }),
    };
    alertController = jasmine.createSpyObj('AlertController', ['create']);
    alertController.create.and.resolveTo(descriptionAlert as unknown as HTMLIonAlertElement);
    await TestBed.configureTestingModule({
      imports: [ImportReviewModalComponent],
      providers: [
        { provide: UtilsService, useClass: UtilsServiceStub },
        { provide: AlertController, useValue: alertController },
        { provide: LocalStorageService, useValue: {
          getItem: () => [],
          setItem: jasmine.createSpy('setItem'),
        } },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ImportReviewModalComponent);
    component = fixture.componentInstance;
  });

  // -------------------------------------------------------------------------
  // Basic creation
  // -------------------------------------------------------------------------

  it('should create', () => {
    setupComponent(buildMergeResult());
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Constructor effect — syncs mergeResult into internal signals
  // -------------------------------------------------------------------------

  describe('constructor effect', () => {
    it('populates potentialDuplicates from mergeResult', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      expect((component as any).potentialDuplicates()).toEqual([dup]);
    });

    it('populates discardedEntries from exactDuplicates in mergeResult', () => {
      const exact = buildParsedEntry({ description: 'Exact dup' });
      setupComponent(buildMergeResult({ exactDuplicates: [exact] }));

      expect((component as any).discardedEntries()).toEqual([exact]);
    });

    it('populates readyToImport from mergeResult', () => {
      const ready = buildParsedEntry({ description: 'Ready entry' });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));

      expect((component as any).readyToImport()).toEqual([ready]);
    });

    it('resets confirmedDuplicates to an empty array', () => {
      setupComponent(buildMergeResult());

      expect((component as any).confirmedDuplicates()).toEqual([]);
    });

    it('resets deferredEntries to an empty set', () => {
      const firstReady = buildParsedEntry({ description: 'First' });
      const secondReady = buildParsedEntry({ description: 'Second' });
      setupComponent(buildMergeResult({ readyToImport: [firstReady] }));
      (component as any).toggleDeferredToNextMonth(firstReady);

      fixture.componentRef.setInput(
        'mergeResult',
        buildMergeResult({ readyToImport: [secondReady] }),
      );
      fixture.detectChanges();

      expect((component as any).deferredEntries().size).toBe(0);
    });

    it('re-runs when mergeResult input changes', () => {
      const firstReady = buildParsedEntry({ description: 'First' });
      setupComponent(buildMergeResult({ readyToImport: [firstReady] }));

      const secondReady = buildParsedEntry({ description: 'Second' });
      fixture.componentRef.setInput(
        'mergeResult',
        buildMergeResult({ readyToImport: [secondReady] }),
      );
      fixture.detectChanges();

      expect((component as any).readyToImport()).toEqual([secondReady]);
    });

    it('stores independent copies of the input arrays (spread)', () => {
      const ready = buildParsedEntry();
      const originalArray = [ready];
      setupComponent(buildMergeResult({ readyToImport: originalArray }));

      // Mutating the original should not affect the internal signal
      originalArray.push(buildParsedEntry({ description: 'Extra' }));

      expect((component as any).readyToImport()).toEqual([ready]);
    });
  });

  // -------------------------------------------------------------------------
  // Computed signals
  // -------------------------------------------------------------------------

  describe('computed signals', () => {
    it('readyCount reflects the length of readyToImport', () => {
      const r1 = buildParsedEntry({ description: 'R1' });
      const r2 = buildParsedEntry({ description: 'R2' });
      setupComponent(buildMergeResult({ readyToImport: [r1, r2] }));

      expect((component as any).readyCount()).toBe(2);
    });

    it('potentialCount reflects the length of potentialDuplicates', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      expect((component as any).potentialCount()).toBe(1);
    });

    it('discardedCount reflects the length of discardedEntries', () => {
      const exact1 = buildParsedEntry({ description: 'E1' });
      const exact2 = buildParsedEntry({ description: 'E2' });
      setupComponent(
        buildMergeResult({ exactDuplicates: [exact1, exact2] }),
      );

      expect((component as any).discardedCount()).toBe(2);
    });

    it('readyCount is 0 when readyToImport is empty', () => {
      setupComponent(buildMergeResult());

      expect((component as any).readyCount()).toBe(0);
    });

    it('potentialCount is 0 when potentialDuplicates is empty', () => {
      setupComponent(buildMergeResult());

      expect((component as any).potentialCount()).toBe(0);
    });

    it('discardedCount is 0 when discardedEntries is empty', () => {
      setupComponent(buildMergeResult());

      expect((component as any).discardedCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // markAsNew
  // -------------------------------------------------------------------------

  describe('markAsNew', () => {
    it('removes the duplicate from potentialDuplicates', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsNew(dup);

      expect((component as any).potentialDuplicates()).toEqual([]);
    });

    it('adds the importedEntry to readyToImport', () => {
      const entry = buildParsedEntry({ description: 'New entry' });
      const dup = buildPotentialDuplicate(entry);
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsNew(dup);

      expect((component as any).readyToImport()).toContain(entry);
    });

    it('preserves other potential duplicates when only one is resolved', () => {
      const dup1 = buildPotentialDuplicate(buildParsedEntry({ description: 'D1' }));
      const dup2 = buildPotentialDuplicate(buildParsedEntry({ description: 'D2' }));
      setupComponent(
        buildMergeResult({ potentialDuplicates: [dup1, dup2] }),
      );

      (component as any).markAsNew(dup1);

      expect((component as any).potentialDuplicates()).toEqual([dup2]);
    });

    it('does not add the entry to discardedEntries', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsNew(dup);

      expect((component as any).discardedEntries()).not.toContain(
        dup.importedEntry,
      );
    });
  });

  // -------------------------------------------------------------------------
  // markAsDuplicate
  // -------------------------------------------------------------------------

  describe('markAsDuplicate', () => {
    it('removes the duplicate from potentialDuplicates', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsDuplicate(dup);

      expect((component as any).potentialDuplicates()).toEqual([]);
    });

    it('adds the importedEntry to discardedEntries', () => {
      const entry = buildParsedEntry({ description: 'To discard' });
      const dup = buildPotentialDuplicate(entry);
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsDuplicate(dup);

      expect((component as any).discardedEntries()).toContain(entry);
    });

    it('adds the duplicate to confirmedDuplicates', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsDuplicate(dup);

      expect((component as any).confirmedDuplicates()).toContain(dup);
    });

    it('preserves existing confirmedDuplicates when adding a new one', () => {
      const dup1 = buildPotentialDuplicate(buildParsedEntry({ description: 'D1' }));
      const dup2 = buildPotentialDuplicate(buildParsedEntry({ description: 'D2' }));
      setupComponent(
        buildMergeResult({ potentialDuplicates: [dup1, dup2] }),
      );

      (component as any).markAsDuplicate(dup1);
      (component as any).markAsDuplicate(dup2);

      expect((component as any).confirmedDuplicates()).toEqual([dup1, dup2]);
    });

    it('does not add the entry to readyToImport', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));

      (component as any).markAsDuplicate(dup);

      expect((component as any).readyToImport()).not.toContain(
        dup.importedEntry,
      );
    });
  });

  // -------------------------------------------------------------------------
  // restoreFromDiscarded
  // -------------------------------------------------------------------------

  describe('restoreFromDiscarded', () => {
    it('removes the entry from discardedEntries', () => {
      const entry = buildParsedEntry({ description: 'Discarded' });
      setupComponent(buildMergeResult({ exactDuplicates: [entry] }));

      (component as any).restoreFromDiscarded(entry);

      expect((component as any).discardedEntries()).not.toContain(entry);
    });

    it('adds the entry to readyToImport', () => {
      const entry = buildParsedEntry({ description: 'Discarded' });
      setupComponent(buildMergeResult({ exactDuplicates: [entry] }));

      (component as any).restoreFromDiscarded(entry);

      expect((component as any).readyToImport()).toContain(entry);
    });

    it('preserves other discarded entries when restoring only one', () => {
      const entry1 = buildParsedEntry({ description: 'E1' });
      const entry2 = buildParsedEntry({ description: 'E2' });
      setupComponent(
        buildMergeResult({ exactDuplicates: [entry1, entry2] }),
      );

      (component as any).restoreFromDiscarded(entry1);

      expect((component as any).discardedEntries()).toEqual([entry2]);
    });
  });

  // -------------------------------------------------------------------------
  // removeFromReady
  // -------------------------------------------------------------------------

  describe('removeFromReady', () => {
    it('removes the entry from readyToImport', () => {
      const entry = buildParsedEntry({ description: 'Ready' });
      setupComponent(buildMergeResult({ readyToImport: [entry] }));

      (component as any).removeFromReady(entry);

      expect((component as any).readyToImport()).not.toContain(entry);
    });

    it('adds the entry to discardedEntries', () => {
      const entry = buildParsedEntry({ description: 'Ready' });
      setupComponent(buildMergeResult({ readyToImport: [entry] }));

      (component as any).removeFromReady(entry);

      expect((component as any).discardedEntries()).toContain(entry);
    });

    it('preserves other ready entries when removing only one', () => {
      const entry1 = buildParsedEntry({ description: 'R1' });
      const entry2 = buildParsedEntry({ description: 'R2' });
      setupComponent(
        buildMergeResult({ readyToImport: [entry1, entry2] }),
      );

      (component as any).removeFromReady(entry1);

      expect((component as any).readyToImport()).toEqual([entry2]);
    });

    it('clears the next-month marker for the removed entry', () => {
      const entry = buildParsedEntry({ description: 'Ready' });
      setupComponent(buildMergeResult({ readyToImport: [entry] }));
      (component as any).toggleDeferredToNextMonth(entry);

      (component as any).removeFromReady(entry);

      expect((component as any).isDeferredToNextMonth(entry)).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // next-month accounting
  // -------------------------------------------------------------------------

  describe('next-month accounting', () => {
    it('marks a ready entry for next-month accounting', () => {
      const entry = buildParsedEntry();
      setupComponent(buildMergeResult({ readyToImport: [entry] }));

      (component as any).toggleDeferredToNextMonth(entry);

      expect((component as any).isDeferredToNextMonth(entry)).toBeTrue();
    });

    it('unmarks a ready entry when toggled twice', () => {
      const entry = buildParsedEntry();
      setupComponent(buildMergeResult({ readyToImport: [entry] }));

      (component as any).toggleDeferredToNextMonth(entry);
      (component as any).toggleDeferredToNextMonth(entry);

      expect((component as any).isDeferredToNextMonth(entry)).toBeFalse();
    });

    it('returns the first day of the next month in America/Santiago', () => {
      setupComponent(buildMergeResult());

      const result = (component as any).getNextMonthAccountingDate('2026-05-29T04:00:00.000Z');

      expect(getChileDateKey(result)).toBe('2026-06-01');
    });

    it('handles December to January rollover', () => {
      setupComponent(buildMergeResult());

      const result = (component as any).getNextMonthAccountingDate('2026-12-29T03:00:00.000Z');

      expect(getChileDateKey(result)).toBe('2027-01-01');
    });

    it('formats original short date using day and month', () => {
      setupComponent(buildMergeResult());

      const result = (component as any).formatOriginalShortDate('2026-05-29T04:00:00.000Z');

      expect(result).toContain('29');
      expect(result).toContain('05');
    });
  });

  // -------------------------------------------------------------------------
  // confirmImport
  // -------------------------------------------------------------------------

  describe('confirmImport', () => {
    it('keeps CMR normalization and data through review, JSON, trends and reimport', async () => {
      const importer = TestBed.inject(ExternalEntryImportService);
      const entries = TestBed.inject(EntryService);
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['07/10/2026', 'COMPRA PedidosYa*Factory Nine*', 'Titular', 13670, 0, 13670],
        ['07/10/2026', 'COMPRA PedidosYa*Colaciones M*', 'Titular', 6000, 0, 6000],
        ['06/10/2026', 'COMPRA TUU* LARRABIATA*', 'Titular', 8942, 0, 8942],
      ];
      const parsed: ParsedEntry[] = (importer as any).parseFalabellaCmrFormat(rows).entries;
      setupComponent(importer.mergeWithExistingEntries(parsed, []));
      expect(parsed.map((entry) => (component as any).reviewDescription(entry))).toEqual([
        'PedidosYa*Factory Nine', 'PedidosYa*Colaciones M', 'TUU* LARRABIATA',
      ]);

      descriptionAlert.onDidDismiss.and.resolveTo({
        role: 'confirm', data: { values: { description: '  Almuerzo  ' } },
      });
      await (component as any).promptDescriptionEdit(parsed[2]);
      const emit = spyOn(component.importConfirmed, 'emit');
      (component as any).confirmImport();
      const approved = emit.calls.mostRecent().args[0].entriesToImport;
      approved.forEach((entry, index) => {
        expect(entry.originalDescription).toBe(index === 2 ? parsed[index].description : undefined);
        expect(entry.amount).toBe(parsed[index].amount);
        expect(entry.date).toBe(parsed[index].date);
        expect(entry.type).toBe(EntryType.EXPENSE);
        expect(entry.idempotencyInfo).toEqual(parsed[index].idempotencyInfo);
        expect(entry.idempotencyInfo[0].idempotencyKey).toBe(
          `${entry.date}|${parsed[index].description}|${entry.amount}|EXPENSE`,
        );
      });
      entries.addEntries(approved.map((entry) => importer.toEntryCreation(entry)));
      entries.importEntries(JSON.parse(entries.serializeEntries()));
      const restored = entries.getEntriesSnapshot();
      expect(restored.map((entry) => entry.description)).toEqual([
        'PedidosYa*Factory Nine', 'PedidosYa*Colaciones M', 'Almuerzo',
      ]);
      expect(restored.map((entry) => entry.originalDescription)).toEqual([undefined, undefined, parsed[2].description]);
      const exported = JSON.parse(entries.serializeEntries()) as Record<string, unknown>[];
      expect(Object.hasOwn(exported[0], 'originalDescription')).toBeFalse();
      expect(exported.every((entry) => !Object.hasOwn(entry, 'originalNormalizedDescription'))).toBeTrue();
      const trends = buildMonthDetailData('2026-10', restored, restored, '2026-10');
      expect(trends.commonExpense.total).toBe(28612);
      expect(trends.commonExpense.topEntries.map((entry) => entry.description)).toContain('Almuerzo');
      const reimport = importer.mergeWithExistingEntries(parsed, restored);
      expect(reimport.exactDuplicates.length).toBe(3);
      expect(reimport.readyToImport.length).toBe(0);
      expect(reimport.potentialDuplicates.length).toBe(0);
    });

    it('keeps the Excel text and keys when a renamed entry is deferred', () => {
      const ready = buildParsedEntry({
        date: '2026-05-29T04:00:00.000Z',
        description: 'TIENDA',
        originalDescription: 'TIENDA',
      });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');
      (component as any).editDescription(ready, '  Supermercado  ');
      (component as any).toggleDeferredToNextMonth(ready);
      (component as any).confirmImport();

      const imported = emitSpy.calls.mostRecent().args[0].entriesToImport[0];
      expect(imported.description).toBe('Supermercado (29/05)');
      expect(imported.originalDescription).toBe('TIENDA');
      expect(imported.idempotencyInfo).toEqual(ready.idempotencyInfo);
      expect(getChileDateKey(imported.date)).toBe('2026-06-01');
      expect(ready.description).toBe('TIENDA');
    });

    it('omits original descriptions when the final description matches the original', () => {
      const ready = buildParsedEntry({ description: 'TIENDA', originalDescription: 'TIENDA' });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      const emit = spyOn(component.importConfirmed, 'emit');
      (component as any).editDescription(ready, 'Otra');
      (component as any).editDescription(ready, '  TIENDA  ');
      (component as any).confirmImport();
      const approved = emit.calls.mostRecent().args[0].entriesToImport[0];
      expect(Object.hasOwn(approved, 'originalDescription')).toBeFalse();
      expect(Object.hasOwn(approved, 'originalNormalizedDescription')).toBeFalse();
    });

    it('retains drafts through discard/restore and clears them for the next review', () => {
      const ready = buildParsedEntry();
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      (component as any).editDescription(ready, 'Personalizada');
      (component as any).removeFromReady(ready);
      (component as any).restoreFromDiscarded(ready);
      expect((component as any).reviewDescription(ready)).toBe('Personalizada');

      fixture.componentRef.setInput('mergeResult', buildMergeResult({ readyToImport: [ready] }));
      fixture.detectChanges();
      expect((component as any).reviewDescription(ready)).toBe(ready.description);
    });

    it('can clear a description without losing the original text', () => {
      const ready = buildParsedEntry();
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');
      (component as any).editDescription(ready, '   ');
      (component as any).confirmImport();
      const imported = emitSpy.calls.mostRecent().args[0].entriesToImport[0];
      expect(imported.description).toBe('');
      expect(imported.originalDescription).toBe(ready.description);
    });

    it('renames included self-transfers while keeping ignored ones out of the import', () => {
      const included = buildSelfTransferEntry(buildParsedEntry(), false);
      const ignored = buildSelfTransferEntry(buildParsedEntry());
      setupComponent(buildMergeResult({
        readyToImport: [included.entry, ignored.entry],
        selfTransfers: [included, ignored],
      }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');
      (component as any).editDescription(included.entry, 'Entre mis cuentas');
      (component as any).confirmImport();
      const entries = emitSpy.calls.mostRecent().args[0].entriesToImport;
      expect(entries.length).toBe(1);
      expect(entries[0].description).toBe('Entre mis cuentas');
      expect(entries[0].originalDescription).toBe(included.entry.description);
    });

    it('emits importConfirmed with the current readyToImport entries', () => {
      const ready = buildParsedEntry({ description: 'Import me' });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.entriesToImport).toEqual([ready]);
    });

    it('emits importConfirmed with confirmedDuplicates', () => {
      const dup = buildPotentialDuplicate();
      setupComponent(buildMergeResult({ potentialDuplicates: [dup] }));
      (component as any).markAsDuplicate(dup);
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.confirmedDuplicates).toEqual([dup]);
    });

    it('emits an independent copy of readyToImport (spread)', () => {
      const ready = buildParsedEntry();
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.entriesToImport).not.toBe(
        (component as any).readyToImport(),
      );
    });

    it('emits an independent copy of confirmedDuplicates (spread)', () => {
      setupComponent(buildMergeResult());
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.confirmedDuplicates).not.toBe(
        (component as any).confirmedDuplicates(),
      );
    });

    it('emits importConfirmed exactly once', () => {
      setupComponent(buildMergeResult());
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('moves marked entries to the first day of the next accounting month', () => {
      const ready = buildParsedEntry({
        date: '2026-05-29T04:00:00.000Z',
        description: 'Supermercado Lider',
      });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      (component as any).toggleDeferredToNextMonth(ready);
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(getChileDateKey(payload.entriesToImport[0].date)).toBe('2026-06-01');
    });

    it('appends the original short date to deferred entry descriptions', () => {
      const ready = buildParsedEntry({
        date: '2026-05-29T04:00:00.000Z',
        description: 'Supermercado Lider',
      });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      (component as any).toggleDeferredToNextMonth(ready);
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.entriesToImport[0].description).toBe('Supermercado Lider (29/05)');
      expect(Object.hasOwn(payload.entriesToImport[0], 'originalDescription')).toBeFalse();
      expect(Object.hasOwn(payload.entriesToImport[0], 'originalNormalizedDescription')).toBeFalse();
    });

    it('does not mutate the original ready entry when applying the accounting override', () => {
      const ready = buildParsedEntry({
        date: '2026-05-29T04:00:00.000Z',
        description: 'Original',
      });
      setupComponent(buildMergeResult({ readyToImport: [ready] }));
      (component as any).toggleDeferredToNextMonth(ready);
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.entriesToImport[0]).not.toBe(ready);
      expect(ready.date).toBe('2026-05-29T04:00:00.000Z');
      expect(ready.description).toBe('Original');
    });
  });

  describe('description editor', () => {
    it('prefills the normalized description and saves only the confirmed edit', async () => {
      const entry = buildParsedEntry({ description: 'TUU* LARRABIATA', originalDescription: 'TUU* LARRABIATA' });
      setupComponent(buildMergeResult({ readyToImport: [entry] }));
      descriptionAlert.onDidDismiss.and.resolveTo({
        role: 'confirm', data: { values: { description: '  Almuerzo  ' } },
      });
      await (component as any).promptDescriptionEdit(entry);

      const options = alertController.create.calls.mostRecent().args[0]!;
      expect(options.inputs![0].value).toBe('TUU* LARRABIATA');
      expect(options.subHeader).toBe('Original: TUU* LARRABIATA');
      expect((component as any).reviewDescription(entry)).toBe('Almuerzo');
      expect(entry.description).toBe('TUU* LARRABIATA');
      expect(entry.originalDescription).toBe('TUU* LARRABIATA');
      await (component as any).promptDescriptionEdit(entry);
      expect(alertController.create.calls.mostRecent().args[0]!.subHeader).toBe('Original: TUU* LARRABIATA');
      expect(alertController.create.calls.mostRecent().args[0]!.inputs![0].value).toBe('Almuerzo');
    });

    it('preserves the previous draft when cancelled or when dismissal has no value', async () => {
      const entry = buildParsedEntry();
      setupComponent(buildMergeResult({ readyToImport: [entry] }));
      (component as any).editDescription(entry, 'Anterior');
      descriptionAlert.onDidDismiss.and.resolveTo({
        role: 'cancel', data: { values: { description: 'No guardar' } },
      });
      await (component as any).promptDescriptionEdit(entry);
      expect((component as any).reviewDescription(entry)).toBe('Anterior');
      descriptionAlert.onDidDismiss.and.resolveTo({ role: 'confirm' });
      await (component as any).promptDescriptionEdit(entry);
      expect((component as any).reviewDescription(entry)).toBe('Anterior');
    });
  });

  // -------------------------------------------------------------------------
  // onDidDismiss
  // -------------------------------------------------------------------------

  describe('onDidDismiss', () => {
    it('emits the dismissed output', () => {
      setupComponent(buildMergeResult());
      const emitSpy = spyOn(component.dismissed, 'emit');

      (component as any).onDidDismiss();

      expect(emitSpy).toHaveBeenCalled();
    });

    it('emits dismissed exactly once', () => {
      setupComponent(buildMergeResult());
      const emitSpy = spyOn(component.dismissed, 'emit');

      (component as any).onDidDismiss();

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // formatDate
  // -------------------------------------------------------------------------

  describe('formatDate', () => {
    it('formats an ISO date string to a localised es-CL date', () => {
      setupComponent(buildMergeResult());

      const result = (component as any).formatDate('2026-01-15T00:00:00.000Z');

      // Should contain the year
      expect(result).toContain('2026');
    });

    it('produces a non-empty string for a valid ISO date', () => {
      setupComponent(buildMergeResult());

      const result = (component as any).formatDate('2025-12-25T12:00:00.000Z');

      expect(result.length).toBeGreaterThan(0);
    });

    it('uses day 2-digit format (contains at least two characters for day portion)', () => {
      setupComponent(buildMergeResult());

      // "2026-01-05" — the day 05 should be formatted as "05"
      const result = (component as any).formatDate('2026-01-05T12:00:00.000Z');

      expect(result).toContain('05');
    });

    it('includes a short month abbreviation', () => {
      setupComponent(buildMergeResult());

      // January in es-CL is "ene"
      const result = (component as any).formatDate('2026-01-15T00:00:00.000Z');

      // The result contains at least letters (not only numbers)
      expect(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(result)).toBeTrue();
    });
  });

  // -------------------------------------------------------------------------
  // selfTransfers — constructor effect + signals
  // -------------------------------------------------------------------------

  describe('selfTransfers', () => {
    it('populates selfTransfers from mergeResult.selfTransfers', () => {
      const st = buildSelfTransferEntry();
      setupComponent(buildMergeResult({ selfTransfers: [st] }));

      expect((component as any).selfTransfers()).toEqual([st]);
    });

    it('defaults selfTransfers to empty when mergeResult has no selfTransfers', () => {
      setupComponent(buildMergeResult());

      expect((component as any).selfTransfers()).toEqual([]);
    });

    it('selfTransferCount reflects length of selfTransfers', () => {
      const st1 = buildSelfTransferEntry();
      const st2 = buildSelfTransferEntry();
      setupComponent(buildMergeResult({ selfTransfers: [st1, st2] }));

      expect((component as any).selfTransferCount()).toBe(2);
    });

    it('ignoredSelfTransferCount counts only ignored entries', () => {
      const ignored = buildSelfTransferEntry(undefined, true);
      const included = buildSelfTransferEntry(buildParsedEntry({ description: 'Incluida' }), false);
      setupComponent(buildMergeResult({ selfTransfers: [ignored, included] }));

      expect((component as any).ignoredSelfTransferCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // toggleSelfTransfer
  // -------------------------------------------------------------------------

  describe('toggleSelfTransfer()', () => {
    it('toggles ignored from true to false', () => {
      const st = buildSelfTransferEntry(undefined, true);
      setupComponent(buildMergeResult({ selfTransfers: [st] }));

      (component as any).toggleSelfTransfer((component as any).selfTransfers()[0]);

      expect((component as any).selfTransfers()[0].ignored).toBeFalse();
    });

    it('toggles ignored from false to true', () => {
      const st = buildSelfTransferEntry(undefined, false);
      setupComponent(buildMergeResult({ selfTransfers: [st] }));

      (component as any).toggleSelfTransfer((component as any).selfTransfers()[0]);

      expect((component as any).selfTransfers()[0].ignored).toBeTrue();
    });

    it('only toggles the target entry, leaving others unchanged', () => {
      const st1 = buildSelfTransferEntry(buildParsedEntry({ description: 'ST1' }), true);
      const st2 = buildSelfTransferEntry(buildParsedEntry({ description: 'ST2' }), true);
      setupComponent(buildMergeResult({ selfTransfers: [st1, st2] }));

      (component as any).toggleSelfTransfer((component as any).selfTransfers()[0]);

      expect((component as any).selfTransfers()[0].ignored).toBeFalse();
      expect((component as any).selfTransfers()[1].ignored).toBeTrue();
    });
  });

  // -------------------------------------------------------------------------
  // effectiveReadyCount
  // -------------------------------------------------------------------------

  describe('effectiveReadyCount', () => {
    it('equals readyToImport length when no self-transfers', () => {
      const r1 = buildParsedEntry({ description: 'R1' });
      const r2 = buildParsedEntry({ description: 'R2' });
      setupComponent(buildMergeResult({ readyToImport: [r1, r2] }));

      expect((component as any).effectiveReadyCount()).toBe(2);
    });

    it('subtracts ignored self-transfers from readyToImport length', () => {
      const entry = buildParsedEntry({ description: 'Auto' });
      const st = buildSelfTransferEntry(entry, true);
      setupComponent(buildMergeResult({ readyToImport: [entry], selfTransfers: [st] }));

      expect((component as any).effectiveReadyCount()).toBe(0);
    });

    it('does not subtract included (non-ignored) self-transfers', () => {
      const entry = buildParsedEntry({ description: 'Auto' });
      const st = buildSelfTransferEntry(entry, false);
      setupComponent(buildMergeResult({ readyToImport: [entry], selfTransfers: [st] }));

      expect((component as any).effectiveReadyCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // confirmImport with self-transfers
  // -------------------------------------------------------------------------

  describe('confirmImport() with self-transfers', () => {
    it('excludes ignored self-transfer entries from entriesToImport', () => {
      const normalEntry = buildParsedEntry({ description: 'Normal' });
      const stEntry = buildParsedEntry({ description: 'Auto' });
      const st = buildSelfTransferEntry(stEntry, true);
      setupComponent(buildMergeResult({ readyToImport: [normalEntry, stEntry], selfTransfers: [st] }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.entriesToImport).toContain(jasmine.objectContaining(normalEntry));
      expect(payload.entriesToImport).not.toContain(jasmine.objectContaining(stEntry));
    });

    it('includes self-transfer entries that are not ignored', () => {
      const stEntry = buildParsedEntry({ description: 'Auto incluida' });
      const st = buildSelfTransferEntry(stEntry, false);
      setupComponent(buildMergeResult({ readyToImport: [stEntry], selfTransfers: [st] }));
      const emitSpy = spyOn(component.importConfirmed, 'emit');

      (component as any).confirmImport();

      const payload = emitSpy.calls.mostRecent().args[0] as ImportConfirmation;
      expect(payload.entriesToImport).toContain(jasmine.objectContaining(stEntry));
    });
  });

  // -------------------------------------------------------------------------
  // Input defaults
  // -------------------------------------------------------------------------

  describe('optional inputs', () => {
    it('isOpen defaults to false', () => {
      setupComponent(buildMergeResult());

      expect(component.isOpen()).toBeFalse();
    });

    it('presentingElement defaults to null', () => {
      setupComponent(buildMergeResult());

      expect(component.presentingElement()).toBeNull();
    });

    it('accepts a truthy isOpen value', () => {
      setupComponent(buildMergeResult());
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      expect(component.isOpen()).toBeTrue();
    });

    it('accepts a non-null presentingElement', () => {
      setupComponent(buildMergeResult());
      const el = document.createElement('div');
      fixture.componentRef.setInput('presentingElement', el);
      fixture.detectChanges();

      expect(component.presentingElement()).toBe(el);
    });
  });
});
