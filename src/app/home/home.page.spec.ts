import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';

import { HomePage } from './home.page';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryData, EntryType } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';
import { UtilsService } from '../shared/services/utils.service';

@Component({ selector: 'app-new-entry-modal', template: '' })
class MockNewEntryModalComponent {}

class EntryServiceMock {
  readonly entriesSignal = signal<EntryData[]>([]);
  readonly filterEntriesByMonth = jasmine
    .createSpy('filterEntriesByMonth')
    .and.callFake((_referenceDate: Date = new Date()): EntryData[] => this.entriesSignal());
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
}

class UtilsServiceMock {
  buildMonthLabelFromDate(_date: Date): string {
    return 'marzo 2026';
  }

  formatAmount(amount: number): string {
    return `$${amount}`;
  }
}

const FIXED_NOW = new Date('2026-03-22T15:00:00.000Z');

/**
 * Creates an entry fixture with optional overrides.
 *
 * @param overrides Optional partial entry data.
 * @returns A complete entry fixture.
 */
function buildEntry(overrides: Partial<EntryData>): EntryData {
  return {
    id: overrides.id ?? 'entry-id',
    amount: overrides.amount ?? 1000,
    date: overrides.date ?? '2026-03-22T10:00:00.000Z',
    type: overrides.type ?? EntryType.EXPENSE,
    description: overrides.description ?? 'Entrada',
    recurrence: overrides.recurrence,
  };
}

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let entryServiceMock: EntryServiceMock;

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(FIXED_NOW);

    entryServiceMock = new EntryServiceMock();

    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideIonicAngular(),
        { provide: EntryService, useValue: entryServiceMock },
        { provide: UtilsService, useValue: new UtilsServiceMock() },
        {
          provide: NavController,
          useValue: {
            navigateForward: jasmine.createSpy('navigateForward'),
          },
        },
      ],
    })
      .overrideComponent(HomePage, {
        remove: { imports: [NewEntryModalComponent] },
        add: { imports: [MockNewEntryModalComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('filters out current-month future entries keeping only entries up to now', () => {
    entryServiceMock.entriesSignal.set([
      buildEntry({ id: 'past', date: '2026-03-10T10:00:00.000Z' }),
      buildEntry({ id: 'today-before-now', date: '2026-03-22T14:59:00.000Z' }),
      buildEntry({ id: 'today-after-now', date: '2026-03-22T15:01:00.000Z' }),
      buildEntry({ id: 'future-month-day', date: '2026-03-28T09:00:00.000Z' }),
    ]);
    fixture.detectChanges();

    const recentEntries = (component as any).recentEntries() as EntryData[];

    expect(recentEntries.map((entry) => entry.id)).toEqual([
      'today-before-now',
      'past',
    ]);
    expect(entryServiceMock.filterEntriesByMonth).toHaveBeenCalled();
    const [referenceDate] = entryServiceMock.filterEntriesByMonth.calls.mostRecent()
      .args as [Date];
    expect(referenceDate.getTime()).toBe(FIXED_NOW.getTime());
  });

  it('keeps recent entries sorted descending and capped to five items', () => {
    entryServiceMock.entriesSignal.set([
      buildEntry({ id: 'entry-1', date: '2026-03-01T10:00:00.000Z' }),
      buildEntry({ id: 'entry-2', date: '2026-03-02T10:00:00.000Z' }),
      buildEntry({ id: 'entry-3', date: '2026-03-03T10:00:00.000Z' }),
      buildEntry({ id: 'entry-4', date: '2026-03-04T10:00:00.000Z' }),
      buildEntry({ id: 'entry-5', date: '2026-03-05T10:00:00.000Z' }),
      buildEntry({ id: 'entry-6', date: '2026-03-06T10:00:00.000Z' }),
      buildEntry({ id: 'entry-7', date: '2026-03-07T10:00:00.000Z' }),
    ]);
    fixture.detectChanges();

    const recentEntries = (component as any).recentEntries() as EntryData[];

    expect(recentEntries.length).toBe(5);
    expect(recentEntries.map((entry) => entry.id)).toEqual([
      'entry-7',
      'entry-6',
      'entry-5',
      'entry-4',
      'entry-3',
    ]);
  });

  it('builds recurrence metadata with installment label and recurring indicator', () => {
    entryServiceMock.entriesSignal.set([
      buildEntry({
        id: 'recurring-installment',
        date: '2026-03-20T10:00:00.000Z',
        recurrence: {
          recurrenceId: 'series-1',
          anchorDate: '2025-09-20T10:00:00.000Z',
          occurrenceIndex: 6,
          frequency: 'monthly',
          termination: { mode: 'occurrences', total: 10 },
          excludedOccurrences: [],
        },
      }),
      buildEntry({
        id: 'recurring-indefinite',
        date: '2026-03-19T10:00:00.000Z',
        recurrence: {
          recurrenceId: 'series-2',
          anchorDate: '2026-03-19T10:00:00.000Z',
          occurrenceIndex: 0,
          frequency: 'monthly',
          termination: { mode: 'indefinite' },
          excludedOccurrences: [],
        },
      }),
      buildEntry({
        id: 'single',
        date: '2026-03-18T10:00:00.000Z',
      }),
    ]);
    fixture.detectChanges();

    const recentEntries = (component as any).recentEntries() as Array<
      EntryData & { installmentLabel?: string; isRecurring: boolean; dateLabel: string }
    >;

    const installmentEntry = recentEntries.find((entry) => entry.id === 'recurring-installment');
    const indefiniteEntry = recentEntries.find((entry) => entry.id === 'recurring-indefinite');
    const singleEntry = recentEntries.find((entry) => entry.id === 'single');

    expect(installmentEntry?.installmentLabel).toBe('Cuota 7 de 10');
    expect(installmentEntry?.isRecurring).toBeTrue();
    expect(installmentEntry?.dateLabel).toBeTruthy();

    expect(indefiniteEntry?.installmentLabel).toBeUndefined();
    expect(indefiniteEntry?.isRecurring).toBeTrue();

    expect(singleEntry?.installmentLabel).toBeUndefined();
    expect(singleEntry?.isRecurring).toBeFalse();
  });
});
