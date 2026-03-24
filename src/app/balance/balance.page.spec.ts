import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import {
  ActionSheetController,
  AlertController,
  NavController,
  provideIonicAngular,
} from '@ionic/angular/standalone';

import { BalancePage } from './balance.page';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { PullToSearchComponent } from './pull-to-search/pull-to-search.component';
import { EntryData, EntryType } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';

@Component({ selector: 'app-new-entry-modal', template: '' })
class MockNewEntryModalComponent {}

@Component({ selector: 'app-pull-to-search', template: '' })
class MockPullToSearchComponent {}

class EntryServiceMock {
  readonly entriesSignal = signal<EntryData[]>([]);
  readonly filterEntriesByMonth = jasmine
    .createSpy('filterEntriesByMonth')
    .and.callFake((_ref: Date): EntryData[] => this.entriesSignal());
  readonly calculateMonthlyIncomeTotal = jasmine
    .createSpy('calculateMonthlyIncomeTotal')
    .and.returnValue(0);
  readonly calculateMonthlyExpenseTotal = jasmine
    .createSpy('calculateMonthlyExpenseTotal')
    .and.returnValue(0);
  readonly calculateMonthlyBalance = jasmine
    .createSpy('calculateMonthlyBalance')
    .and.returnValue(0);
  readonly addEntry = jasmine.createSpy('addEntry');
  readonly updateEntry = jasmine.createSpy('updateEntry');
  readonly removeEntry = jasmine.createSpy('removeEntry');
}

const FIXED_NOW = new Date('2026-03-22T15:00:00.000Z');

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
    date: overrides.date ?? '2026-03-22T10:00:00.000Z',
    type: overrides.type ?? EntryType.EXPENSE,
    description: 'description' in overrides ? overrides.description : 'Almuerzo',
    recurrence: overrides.recurrence,
  };
}

describe('BalancePage', () => {
  let component: BalancePage;
  let fixture: ComponentFixture<BalancePage>;
  let entryServiceMock: EntryServiceMock;

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(FIXED_NOW);

    entryServiceMock = new EntryServiceMock();

    await TestBed.configureTestingModule({
      imports: [BalancePage],
      providers: [
        provideIonicAngular(),
        { provide: EntryService, useValue: entryServiceMock },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(new Map()) },
        },
        {
          provide: NavController,
          useValue: { pop: jasmine.createSpy('pop') },
        },
        {
          provide: AlertController,
          useValue: { create: jasmine.createSpy('create').and.resolveTo({ present: jasmine.createSpy('present') }) },
        },
        {
          provide: ActionSheetController,
          useValue: { create: jasmine.createSpy('create').and.resolveTo({ present: jasmine.createSpy('present') }) },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      .overrideComponent(BalancePage, {
        remove: { imports: [NewEntryModalComponent, PullToSearchComponent] },
        add: { imports: [MockNewEntryModalComponent, MockPullToSearchComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(BalancePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Search signal state ──

  describe('search signal state', () => {
    it('should have an empty search term by default', () => {
      expect((component as any).searchTerm()).toBe('');
    });

    it('should report search as inactive when search term is empty', () => {
      expect((component as any).searchActive()).toBeFalse();
    });

    it('should report search as inactive when search term is only whitespace', () => {
      (component as any).searchTerm.set('   ');
      expect((component as any).searchActive()).toBeFalse();
    });

    it('should report search as active when search term has content', () => {
      (component as any).searchTerm.set('alimento');
      expect((component as any).searchActive()).toBeTrue();
    });
  });

  // ── Search filtering by description ──

  describe('search filtering by description', () => {
    it('should filter entries by partial description match (case-insensitive)', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Almuerzo en restaurante' }),
        buildEntry({ id: 'e2', description: 'Transporte' }),
        buildEntry({ id: 'e3', description: 'Supermercado' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('almuerzo');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
      expect(displayed[0].id).toBe('e1');
    });

    it('should match description regardless of case', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'SUPERMERCADO' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('super');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
    });

    it('should match default description fallback when entry has no description', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: undefined }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('transaccion');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
    });
  });

  // ── Search filtering by amount ──

  describe('search filtering by amount', () => {
    it('should match entries by formatted amount', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', amount: 15000 }),
        buildEntry({ id: 'e2', amount: 3000 }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('15');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
      expect(displayed[0].id).toBe('e1');
    });

    it('should match amount with dollar sign prefix', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', amount: 5000 }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('$5');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
    });
  });

  // ── Search filtering by date ──

  describe('search filtering by date', () => {
    it('should match entries by date label content', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'march', date: '2026-03-15T10:00:00.000Z' }),
        buildEntry({ id: 'feb', date: '2026-02-15T10:00:00.000Z' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('mar');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
      expect(displayed[0].id).toBe('march');
    });

    it('should match entries by year in date label', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', date: '2026-03-15T10:00:00.000Z' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('2026');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
    });
  });

  // ── Search filtering edge cases ──

  describe('search filtering edge cases', () => {
    it('should return all entries when search term is empty', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1' }),
        buildEntry({ id: 'e2' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(2);
    });

    it('should return empty array when no entries match', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Almuerzo' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('zzzzz');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(0);
    });

    it('should produce empty groups when no entries match', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Almuerzo' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('zzzzz');

      const groups = (component as any).groups() as any[];
      expect(groups.length).toBe(0);
    });

    it('should match entries across multiple fields simultaneously', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'desc-match', description: 'café', amount: 1500 }),
        buildEntry({ id: 'amount-match', description: 'otro', amount: 15000 }),
        buildEntry({ id: 'no-match', description: 'nada', amount: 200 }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('15');

      const displayed = (component as any).displayedEntries() as EntryData[];
      const ids = displayed.map((e: EntryData) => e.id);
      expect(ids).toContain('amount-match');
      expect(ids).not.toContain('no-match');
    });
  });

  // ── Search context — Balance tab vs History detail ──

  describe('search context', () => {
    it('should search all entries when no reference month is set (Balance tab)', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', date: '2026-01-15T10:00:00.000Z', description: 'Almuerzo enero' }),
        buildEntry({ id: 'e2', date: '2026-03-15T10:00:00.000Z', description: 'Almuerzo marzo' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('almuerzo');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(2);
    });

    it('should search only within the filtered month when reference month is set', () => {
      const marchEntry = buildEntry({
        id: 'march-1',
        date: '2026-03-15T10:00:00.000Z',
        description: 'Almuerzo',
      });
      entryServiceMock.filterEntriesByMonth.and.returnValue([marchEntry]);
      entryServiceMock.entriesSignal.set([
        marchEntry,
        buildEntry({
          id: 'jan-1',
          date: '2026-01-15T10:00:00.000Z',
          description: 'Almuerzo enero',
        }),
      ]);

      component.setReferenceMonth(new Date(2026, 2, 1));
      fixture.detectChanges();

      (component as any).searchTerm.set('almuerzo');

      const displayed = (component as any).displayedEntries() as EntryData[];
      expect(displayed.length).toBe(1);
      expect(displayed[0].id).toBe('march-1');
    });
  });

  // ── Groups computed ──

  describe('groups computed', () => {
    it('should produce groups only for matching entries during search', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', date: '2026-03-15T10:00:00.000Z', description: 'Almuerzo' }),
        buildEntry({ id: 'e2', date: '2026-03-15T10:00:00.000Z', description: 'Transporte' }),
        buildEntry({ id: 'e3', date: '2026-03-16T10:00:00.000Z', description: 'Cena' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('cena');

      const groups = (component as any).groups() as any[];
      expect(groups.length).toBe(1);
      expect(groups[0].items.length).toBe(1);
      expect(groups[0].items[0].description).toBe('Cena');
    });

    it('should show all groups when search term is empty', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', date: '2026-03-15T10:00:00.000Z' }),
        buildEntry({ id: 'e2', date: '2026-03-16T10:00:00.000Z' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('');

      const groups = (component as any).groups() as any[];
      expect(groups.length).toBe(2);
    });
  });

  // ── Event handlers ──

  describe('event handlers', () => {
    it('handleSearchTermChange should update the search term signal', () => {
      (component as any).handleSearchTermChange('café');

      expect((component as any).searchTerm()).toBe('café');
    });

    it('handleSearchCleared should reset the search term to empty', () => {
      (component as any).searchTerm.set('some query');

      (component as any).handleSearchCleared();

      expect((component as any).searchTerm()).toBe('');
    });
  });

  // ── Template rendering ──

  describe('template rendering', () => {
    it('should render the pull-to-search component', () => {
      fixture.detectChanges();

      const pullToSearch = fixture.nativeElement.querySelector(
        'app-pull-to-search',
      );
      expect(pullToSearch).toBeTruthy();
    });

    it('should show wallet empty state when no entries and search is inactive', () => {
      entryServiceMock.entriesSignal.set([]);
      fixture.detectChanges();

      const icon = fixture.nativeElement.querySelector(
        '.empty-state ion-icon[name="wallet-outline"]',
      );
      expect(icon).toBeTruthy();
    });

    it('should show search empty state when search is active with no matches', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Test' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('zzzzz');
      fixture.detectChanges();

      const icon = fixture.nativeElement.querySelector(
        '.empty-state ion-icon[name="search-outline"]',
      );
      const title = fixture.nativeElement.querySelector(
        '.empty-state__title',
      );
      expect(icon).toBeTruthy();
      expect(title?.textContent?.trim()).toBe('Sin resultados');
    });

    it('should hide swiper when search is active', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Test' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('test');
      fixture.detectChanges();

      const swiper = fixture.nativeElement.querySelector('swiper-container');
      expect(swiper).toBeNull();
    });

    it('should show swiper when search is inactive and entries exist', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Test' }),
      ]);
      fixture.detectChanges();

      const swiper = fixture.nativeElement.querySelector('swiper-container');
      expect(swiper).toBeTruthy();
    });

    it('should show transaction list when search matches entries', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: 'Almuerzo' }),
        buildEntry({ id: 'e2', description: 'Transporte' }),
      ]);
      fixture.detectChanges();

      (component as any).searchTerm.set('almuerzo');
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll(
        'app-balance-item',
      );
      expect(items.length).toBe(1);
    });
  });

  // ── Existing functionality preservation ──

  describe('existing functionality', () => {
    it('should build day groups from entries', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', date: '2026-03-15T10:00:00.000Z' }),
        buildEntry({ id: 'e2', date: '2026-03-16T12:00:00.000Z' }),
      ]);
      fixture.detectChanges();

      const groups = (component as any).groups() as any[];
      expect(groups.length).toBe(2);
    });

    it('should sort entries within a group by timestamp descending', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'early', date: '2026-03-15T08:00:00.000Z' }),
        buildEntry({ id: 'late', date: '2026-03-15T18:00:00.000Z' }),
      ]);
      fixture.detectChanges();

      const groups = (component as any).groups() as any[];
      expect(groups[0].items[0].id).toBe('late');
      expect(groups[0].items[1].id).toBe('early');
    });

    it('should handle setReferenceMonth with null', () => {
      component.setReferenceMonth(null);

      expect((component as any).referenceMonth()).toBeNull();
    });

    it('should handle setReferenceMonth with invalid date', () => {
      component.setReferenceMonth(new Date('invalid'));

      expect((component as any).referenceMonth()).toBeNull();
    });

    it('should handle setReferenceMonth with valid date', () => {
      const ref = new Date(2026, 2, 1);
      component.setReferenceMonth(ref);

      expect((component as any).referenceMonth()).toEqual(ref);
    });

    it('should compute page title as Balance when no reference month', () => {
      component.setReferenceMonth(null);

      expect((component as any).pageTitle()).toBe('Balance');
    });

    it('should show month subtitle in page title when reference month is set', () => {
      component.setReferenceMonth(new Date(2026, 2, 1));

      const title = (component as any).pageTitle() as string;
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toBe('Balance');
    });

    it('should display formatted amounts in summary', () => {
      entryServiceMock.calculateMonthlyIncomeTotal.and.returnValue(50000);
      entryServiceMock.calculateMonthlyExpenseTotal.and.returnValue(30000);
      entryServiceMock.calculateMonthlyBalance.and.returnValue(20000);
      entryServiceMock.entriesSignal.set([buildEntry({ id: 'e1' })]);
      fixture.detectChanges();

      const summary = (component as any).displayedMonthSummary();
      expect(summary.incomesLabel).toContain('$');
      expect(summary.expensesLabel).toContain('$');
      expect(summary.balanceLabel).toContain('$');
    });

    it('should resolve description fallback for entries without description', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1', description: undefined }),
      ]);
      fixture.detectChanges();

      const groups = (component as any).groups() as any[];
      expect(groups[0].items[0].description).toBe('transacción');
    });

    it('should detect recurring entries', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({
          id: 'recurring',
          recurrence: {
            recurrenceId: 'r1',
            anchorDate: '2026-01-15T10:00:00.000Z',
            occurrenceIndex: 2,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
          },
        }),
      ]);
      fixture.detectChanges();

      const groups = (component as any).groups() as any[];
      expect(groups[0].items[0].isRecurring).toBeTrue();
    });

    it('should handle entries saved through modal', () => {
      const newEntry = {
        amount: 5000,
        date: '2026-03-22T10:00:00.000Z',
        type: EntryType.EXPENSE,
      };

      (component as any).handleEntrySaved(newEntry);

      expect(entryServiceMock.addEntry).toHaveBeenCalledWith(newEntry);
    });

    it('should handle entries updated through modal', () => {
      const payload = {
        id: 'e1',
        amount: 7000,
        date: '2026-03-22T10:00:00.000Z',
        description: 'Updated',
      };

      (component as any).handleEntryUpdated(payload);

      expect(entryServiceMock.updateEntry).toHaveBeenCalledWith('e1', {
        amount: 7000,
        date: '2026-03-22T10:00:00.000Z',
        description: 'Updated',
      });
    });

    it('should navigate back when handleNavigateBack is called', () => {
      const navController = TestBed.inject(NavController);

      (component as any).handleNavigateBack();

      expect(navController.pop).toHaveBeenCalled();
    });

    it('should return month scope label as mes en curso when no reference month', () => {
      component.setReferenceMonth(null);

      expect((component as any).monthScopeLabel()).toBe('mes en curso');
    });

    it('should return month scope label as mes seleccionado when reference month is set', () => {
      component.setReferenceMonth(new Date(2026, 2, 1));

      expect((component as any).monthScopeLabel()).toBe('mes seleccionado');
    });

    it('should include subtitle in displayed month summary', () => {
      entryServiceMock.entriesSignal.set([buildEntry({ id: 'e1' })]);
      fixture.detectChanges();

      const summary = (component as any).displayedMonthSummary();
      expect(summary.subtitle).toBeTruthy();
    });
  });

  // ── handleDeleteEntry ──

  describe('handleDeleteEntry', () => {
    it('should do nothing when entry is not found', async () => {
      entryServiceMock.entriesSignal.set([]);

      await (component as any).handleDeleteEntry('non-existent');

      expect(entryServiceMock.removeEntry).not.toHaveBeenCalled();
    });

    it('should remove non-recurring entry without confirmation when not required', async () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1' }),
      ]);

      await (component as any).handleDeleteEntry('e1', false);

      expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('e1');
    });

    it('should show alert for non-recurring entry when confirmation is required', async () => {
      const alertController = TestBed.inject(AlertController);
      entryServiceMock.entriesSignal.set([
        buildEntry({ id: 'e1' }),
      ]);

      await (component as any).handleDeleteEntry('e1', true);

      expect(alertController.create).toHaveBeenCalled();
    });

    it('should remove entry when alert destructive button handler is invoked', async () => {
      let capturedConfig: any;
      const alertController = TestBed.inject(AlertController);
      (alertController.create as jasmine.Spy).and.callFake(async (config: any) => {
        capturedConfig = config;
        return { present: jasmine.createSpy('present') };
      });
      entryServiceMock.entriesSignal.set([buildEntry({ id: 'e1' })]);

      await (component as any).handleDeleteEntry('e1', true);

      const destructiveButton = capturedConfig.buttons.find(
        (b: any) => b.role === 'destructive',
      );
      destructiveButton.handler();

      expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('e1');
    });

    it('should remove recurring entry as single when confirmation not required', async () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({
          id: 'recurring-1',
          recurrence: {
            recurrenceId: 'r1',
            anchorDate: '2026-01-15T10:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
          },
        }),
      ]);

      await (component as any).handleDeleteEntry('recurring-1', false);

      expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('recurring-1', 'single');
    });

    it('should show action sheet for recurring entry when confirmation is required', async () => {
      const actionSheetController = TestBed.inject(ActionSheetController);
      entryServiceMock.entriesSignal.set([
        buildEntry({
          id: 'recurring-1',
          recurrence: {
            recurrenceId: 'r1',
            anchorDate: '2026-01-15T10:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
          },
        }),
      ]);

      await (component as any).handleDeleteEntry('recurring-1', true);

      expect(actionSheetController.create).toHaveBeenCalled();
    });

    it('should invoke single remove when action sheet single button is clicked', async () => {
      let capturedConfig: any;
      const actionSheetController = TestBed.inject(ActionSheetController);
      (actionSheetController.create as jasmine.Spy).and.callFake(async (config: any) => {
        capturedConfig = config;
        return { present: jasmine.createSpy('present') };
      });
      entryServiceMock.entriesSignal.set([
        buildEntry({
          id: 'recurring-1',
          recurrence: {
            recurrenceId: 'r1',
            anchorDate: '2026-01-15T10:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
          },
        }),
      ]);

      await (component as any).handleDeleteEntry('recurring-1', true);

      const singleButton = capturedConfig.buttons.find(
        (b: any) => b.text === 'Solo esta transacción',
      );
      singleButton.handler();

      expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('recurring-1', 'single');
    });

    it('should invoke future remove when action sheet future button is clicked', async () => {
      let capturedConfig: any;
      const actionSheetController = TestBed.inject(ActionSheetController);
      (actionSheetController.create as jasmine.Spy).and.callFake(async (config: any) => {
        capturedConfig = config;
        return { present: jasmine.createSpy('present') };
      });
      entryServiceMock.entriesSignal.set([
        buildEntry({
          id: 'recurring-1',
          recurrence: {
            recurrenceId: 'r1',
            anchorDate: '2026-01-15T10:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
          },
        }),
      ]);

      await (component as any).handleDeleteEntry('recurring-1', true);

      const futureButton = capturedConfig.buttons.find(
        (b: any) => b.text === 'Esta y las futuras transacciones',
      );
      futureButton.handler();

      expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('recurring-1', 'future');
    });

    it('should invoke series remove when action sheet destructive button is clicked', async () => {
      let capturedConfig: any;
      const actionSheetController = TestBed.inject(ActionSheetController);
      (actionSheetController.create as jasmine.Spy).and.callFake(async (config: any) => {
        capturedConfig = config;
        return { present: jasmine.createSpy('present') };
      });
      entryServiceMock.entriesSignal.set([
        buildEntry({
          id: 'recurring-1',
          recurrence: {
            recurrenceId: 'r1',
            anchorDate: '2026-01-15T10:00:00.000Z',
            occurrenceIndex: 0,
            frequency: 'monthly',
            termination: { mode: 'indefinite' },
          },
        }),
      ]);

      await (component as any).handleDeleteEntry('recurring-1', true);

      const seriesButton = capturedConfig.buttons.find(
        (b: any) => b.role === 'destructive',
      );
      seriesButton.handler();

      expect(entryServiceMock.removeEntry).toHaveBeenCalledWith('recurring-1', 'series');
    });
  });

  // ── handleEditEntry ──

  describe('handleEditEntry', () => {
    it('should do nothing when modal is not available', () => {
      (component as any).modal = undefined;

      (component as any).handleEditEntry('e1');

      // no error thrown
    });

    it('should do nothing when entry is not found', () => {
      (component as any).modal = { openForEdit: jasmine.createSpy('openForEdit') };
      entryServiceMock.entriesSignal.set([]);

      (component as any).handleEditEntry('non-existent');

      expect((component as any).modal.openForEdit).not.toHaveBeenCalled();
    });

    it('should open modal for edit when entry is found', () => {
      const mockModal = { openForEdit: jasmine.createSpy('openForEdit') };
      (component as any).modal = mockModal;
      const entry = buildEntry({ id: 'e1' });
      entryServiceMock.entriesSignal.set([entry]);

      (component as any).handleEditEntry('e1');

      expect(mockModal.openForEdit).toHaveBeenCalledWith(entry);
    });
  });

  // ── openEntryModal ──

  describe('openEntryModal', () => {
    it('should do nothing when modal is not available', () => {
      (component as any).modal = undefined;

      expect(() => (component as any).openEntryModal(null)).not.toThrow();
    });

    it('should set preset type and open modal', () => {
      const mockModal = {
        setPresetType: jasmine.createSpy('setPresetType'),
        open: jasmine.createSpy('open'),
      };
      (component as any).modal = mockModal;

      (component as any).openEntryModal(EntryType.EXPENSE);

      expect(mockModal.setPresetType).toHaveBeenCalledWith(EntryType.EXPENSE);
      expect(mockModal.open).toHaveBeenCalled();
    });

    it('should accept null as preset type', () => {
      const mockModal = {
        setPresetType: jasmine.createSpy('setPresetType'),
        open: jasmine.createSpy('open'),
      };
      (component as any).modal = mockModal;

      (component as any).openEntryModal(null);

      expect(mockModal.setPresetType).toHaveBeenCalledWith(null);
    });
  });

  // ── resolveReferenceMonth via query params ──

  describe('resolveReferenceMonth', () => {
    it('should return null when year param is missing', () => {
      const result = (component as any).resolveReferenceMonth(null, '3');
      expect(result).toBeNull();
    });

    it('should return null when month param is missing', () => {
      const result = (component as any).resolveReferenceMonth('2026', null);
      expect(result).toBeNull();
    });

    it('should return null when year is not a number', () => {
      const result = (component as any).resolveReferenceMonth('abc', '3');
      expect(result).toBeNull();
    });

    it('should return null when month is not a number', () => {
      const result = (component as any).resolveReferenceMonth('2026', 'abc');
      expect(result).toBeNull();
    });

    it('should return null when month is below 1', () => {
      const result = (component as any).resolveReferenceMonth('2026', '0');
      expect(result).toBeNull();
    });

    it('should return null when month is above 12', () => {
      const result = (component as any).resolveReferenceMonth('2026', '13');
      expect(result).toBeNull();
    });

    it('should return a valid date for valid params', () => {
      const result = (component as any).resolveReferenceMonth('2026', '3');
      expect(result).toEqual(new Date(2026, 2, 1));
    });
  });

  // ── normalizeToMillis ──

  describe('normalizeToMillis', () => {
    it('should convert valid ISO string to milliseconds', () => {
      const millis = (component as any).normalizeToMillis('2026-03-22T10:00:00.000Z');
      expect(millis).toBe(new Date('2026-03-22T10:00:00.000Z').getTime());
    });

    it('should return 0 for invalid ISO string', () => {
      const millis = (component as any).normalizeToMillis('invalid');
      expect(millis).toBe(0);
    });
  });
});
