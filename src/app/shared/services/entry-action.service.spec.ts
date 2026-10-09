import { TestBed } from '@angular/core/testing';
import { ActionSheetController, AlertController } from '@ionic/angular/standalone';
import { signal } from '@angular/core';
import { EntryData, EntryType } from '../models/entry-data.model';
import { EntryService } from './entry.service';
import { EntryActionService } from './entry-action.service';

class EntryServiceMock {
  readonly entriesSignal = signal<EntryData[]>([]);
  readonly removeEntry = jasmine.createSpy('removeEntry');
  readonly updateEntry = jasmine.createSpy('updateEntry');
}

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

describe('EntryActionService', () => {
  let service: EntryActionService;
  let entryServiceMock: EntryServiceMock;
  let alertControllerMock: jasmine.SpyObj<AlertController>;
  let actionSheetControllerMock: jasmine.SpyObj<ActionSheetController>;

  beforeEach(() => {
    entryServiceMock = new EntryServiceMock();
    alertControllerMock = jasmine.createSpyObj('AlertController', ['create']);
    actionSheetControllerMock = jasmine.createSpyObj('ActionSheetController', ['create']);

    alertControllerMock.create.and.resolveTo({
      present: jasmine.createSpy('present'),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({}),
    } as any);
    actionSheetControllerMock.create.and.resolveTo({
      present: jasmine.createSpy('present'),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({}),
    } as any);

    TestBed.configureTestingModule({
      providers: [
        EntryActionService,
        { provide: EntryService, useValue: entryServiceMock },
        { provide: AlertController, useValue: alertControllerMock },
        { provide: ActionSheetController, useValue: actionSheetControllerMock },
      ],
    });

    service = TestBed.inject(EntryActionService);
  });

  it('should return false when entry does not exist', async () => {
    const result = await service.confirmAndDeleteEntry('missing');

    expect(result).toBeFalse();
    expect(entryServiceMock.removeEntry).not.toHaveBeenCalled();
  });

  it('should remove non-recurring entry without confirmation', async () => {
    entryServiceMock.entriesSignal.set([buildEntry({ id: 'entry-id' })]);

    const result = await service.confirmAndDeleteEntry('entry-id', false);

    expect(result).toBeTrue();
    expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('entry-id');
  });

  it('should remove recurring entry as single without confirmation', async () => {
    entryServiceMock.entriesSignal.set([
      buildEntry({
        id: 'entry-id',
        recurrence: {
          recurrenceId: 'recurrence-id',
          anchorDate: '2026-01-15T10:00:00.000Z',
          occurrenceIndex: 0,
          frequency: 'monthly',
          termination: { mode: 'indefinite' },
        },
      }),
    ]);

    const result = await service.confirmAndDeleteEntry('entry-id', false);

    expect(result).toBeTrue();
    expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('entry-id', 'single');
  });

  it('should wire non-recurring alert destructive button', async () => {
    let capturedConfig: any;
    alertControllerMock.create.and.callFake(async (config: any) => {
      capturedConfig = config;
      return {
        present: jasmine.createSpy('present'),
        onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({}),
      } as any;
    });
    entryServiceMock.entriesSignal.set([buildEntry({ id: 'entry-id' })]);

    const promise = service.confirmAndDeleteEntry('entry-id');
    await Promise.resolve();
    const destructiveButton = capturedConfig.buttons.find(
      (button: any) => button.role === 'destructive',
    );
    destructiveButton.handler();

    await expectAsync(promise).toBeResolvedTo(true);
    expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('entry-id');
  });

  it('should wire recurring series action', async () => {
    let capturedConfig: any;
    actionSheetControllerMock.create.and.callFake(async (config: any) => {
      capturedConfig = config;
      return {
        present: jasmine.createSpy('present'),
        onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({}),
      } as any;
    });
    entryServiceMock.entriesSignal.set([
      buildEntry({
        id: 'entry-id',
        recurrence: {
          recurrenceId: 'recurrence-id',
          anchorDate: '2026-01-15T10:00:00.000Z',
          occurrenceIndex: 0,
          frequency: 'monthly',
          termination: { mode: 'indefinite' },
        },
      }),
    ]);

    const promise = service.confirmAndDeleteEntry('entry-id');
    await Promise.resolve();
    const seriesButton = capturedConfig.buttons.find(
      (button: any) => button.role === 'destructive',
    );
    seriesButton.handler();

    await expectAsync(promise).toBeResolvedTo(true);
    expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('entry-id', 'series');
  });

  describe('editing', () => {
    beforeEach(() => {
      entryServiceMock.entriesSignal.set([buildEntry({ recurrence: {
        recurrenceId: 'r', anchorDate: '2026-01-15T10:00:00.000Z', occurrenceIndex: 2,
        frequency: 'monthly', termination: { mode: 'indefinite' },
      } })]);
    });

    for (const scope of ['single', 'future', 'series']) {
      it(`selects ${scope} using dismissal data with no preselected broader scope`, async () => {
        actionSheetControllerMock.create.and.resolveTo({ present: async () => undefined,
          onDidDismiss: async () => ({ data: scope }) } as any);
        const result = await service.confirmAndUpdateEntry({ id: 'entry-id', amount: 2000, date: '2026-02-01T12:00:00.000Z' });
        const config = actionSheetControllerMock.create.calls.mostRecent().args[0]!;
        expect((config.buttons as any[]).map((button) => button.text)).toEqual([
          'Solo esta transacción', 'Esta y las futuras transacciones',
          'Toda la serie (incluye meses anteriores)', 'Cancelar',
        ]);
        expect(config.subHeader).toContain('La fecha cambia solo en esta transacción');
        expect(result).toBe('saved');
        expect(entryServiceMock.updateEntry).toHaveBeenCalledWith('entry-id', {
          amount: 2000, date: '2026-02-01T12:00:00.000Z',
        }, scope);
      });
    }

    for (const dismissal of [{ role: 'cancel' }, { role: 'backdrop' }, {}]) {
      it(`does not save on dismissal ${JSON.stringify(dismissal)}`, async () => {
        actionSheetControllerMock.create.and.resolveTo({ present: async () => undefined,
          onDidDismiss: async () => dismissal } as any);
        expect(await service.confirmAndUpdateEntry({ id: 'entry-id', amount: 2000 })).toBe('cancelled');
        expect(entryServiceMock.updateEntry).not.toHaveBeenCalled();
      });
    }

    for (const payload of [{ id: 'entry-id' }, { id: 'entry-id', amount: 1000 },
      { id: 'entry-id', date: '2026-02-01T12:00:00.000Z' }]) {
      it(`skips the selector without actual value changes: ${JSON.stringify(payload)}`, async () => {
        expect(await service.confirmAndUpdateEntry(payload)).toBe('saved');
        expect(actionSheetControllerMock.create).not.toHaveBeenCalled();
      });
    }

    it('skips the selector for a non-recurring entry', async () => {
      entryServiceMock.entriesSignal.set([buildEntry()]);
      expect(await service.confirmAndUpdateEntry({ id: 'entry-id', description: 'Nuevo' })).toBe('saved');
      expect(actionSheetControllerMock.create).not.toHaveBeenCalled();
    });

    it('rechecks the target after asynchronous scope selection', async () => {
      actionSheetControllerMock.create.and.resolveTo({ present: async () => undefined,
        onDidDismiss: async () => { entryServiceMock.entriesSignal.set([]); return { data: 'future' }; } } as any);
      expect(await service.confirmAndUpdateEntry({ id: 'entry-id', amount: 2000 })).toBe('cancelled');
      expect(entryServiceMock.updateEntry).not.toHaveBeenCalled();
      expect(alertControllerMock.create).toHaveBeenCalledWith(jasmine.objectContaining({ header: 'No se pudo guardar' }));
    });

    it('returns cancellation and a localized error on persistence failure', async () => {
      entryServiceMock.updateEntry.and.throwError('Quota exceeded');
      expect(await service.confirmAndUpdateEntry({ id: 'entry-id', date: '2026-02-01T12:00:00.000Z' })).toBe('cancelled');
      expect(alertControllerMock.create).toHaveBeenCalledWith(jasmine.objectContaining({ header: 'No se pudo guardar' }));
    });
  });

});
