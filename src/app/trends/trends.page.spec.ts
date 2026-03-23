import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { TrendsPage } from './trends.page';
import { buildMonthKey } from '../shared/utils/trends-data.util';
import { EntryService } from '../shared/services/entry.service';
import { UtilsService } from '../shared/services/utils.service';
import { EntryData, EntryType } from '../shared/models/entry-data.model';

class EntryServiceMock {
  readonly entriesSignal = signal<EntryData[]>([]);
  readonly filterEntriesByMonth = jasmine
    .createSpy('filterEntriesByMonth')
    .and.callFake((_referenceDate: Date = new Date()): EntryData[] => this.entriesSignal());
}

class UtilsServiceMock {
  formatAmount(amount: number): string {
    return `$${amount}`;
  }
}

const FIXED_NOW = new Date('2026-03-22T15:00:00.000Z');

/**
 * Builds a basic entry fixture for testing.
 *
 * @param overrides Partial overrides for the entry.
 * @returns An EntryData fixture.
 */
function buildEntry(overrides: Partial<EntryData> = {}): EntryData {
  return {
    id: 'e-1',
    amount: 10000,
    date: new Date().toISOString(),
    type: EntryType.EXPENSE,
    ...overrides,
  };
}

describe('TrendsPage', () => {
  let component: TrendsPage;
  let fixture: ComponentFixture<TrendsPage>;
  let entryServiceMock: EntryServiceMock;

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(FIXED_NOW);

    entryServiceMock = new EntryServiceMock();

    await TestBed.configureTestingModule({
      imports: [TrendsPage],
      providers: [
        provideIonicAngular(),
        { provide: EntryService, useValue: entryServiceMock },
        { provide: UtilsService, useValue: new UtilsServiceMock() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrendsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute hasData as false when no entries exist', () => {
    expect(component['hasData']()).toBeFalse();
  });

  it('should return trendsData with 3 months when no entries', () => {
    const data = component['trendsData']();
    expect(data.months.length).toBe(3);
    expect(data.maxAmount).toBe(0);
    for (const month of data.months) {
      expect(month.totalExpense).toBe(0);
    }
  });

  it('barHeight returns 0 when maxAmount is 0', () => {
    expect(component['barHeight'](1000, 0)).toBe(0);
  });

  it('barHeight returns correct percentage', () => {
    expect(component['barHeight'](500, 1000)).toBe(50);
  });

  it('monthLabel returns a short localized label', () => {
    const label = component['monthLabel']({
      monthKey: '2026-03',
      month: 3,
      year: 2026,
      income: 0,
      commonExpense: 0,
      recurringExpense: 0,
      installmentExpense: 0,
      totalExpense: 0,
      isCurrent: true,
    });
    expect(label).toContain('mar');
    expect(label).toContain('26');
  });

  describe('month selection', () => {
    it('selectedMonthKey defaults to current month', () => {
      const currentKey = buildMonthKey(new Date());
      expect(component['selectedMonthKey']()).toBe(currentKey);
    });

    it('selectMonth updates selectedMonthKey', () => {
      component['selectMonth']('2026-01');
      expect(component['selectedMonthKey']()).toBe('2026-01');
    });

    it('selectedMonthDetail returns data for current month by default', () => {
      const detail = component['selectedMonthDetail']();
      expect(detail).toBeTruthy();
      expect(detail!.monthKey).toBe(buildMonthKey(new Date()));
    });

    it('selectedMonthDetail returns data for a different month after selection', () => {
      component['selectMonth']('2026-01');
      const detail = component['selectedMonthDetail']();
      expect(detail).toBeTruthy();
      expect(detail!.monthKey).toBe('2026-01');
    });

    it('selectedMonthDetail sets isFutureMonth for future months', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const futureKey = buildMonthKey(futureDate);
      component['selectMonth'](futureKey);
      const detail = component['selectedMonthDetail']();
      expect(detail).toBeTruthy();
      expect(detail!.isFutureMonth).toBeTrue();
    });

    it('selectedMonthDetail sets isFutureMonth false for current month', () => {
      const detail = component['selectedMonthDetail']();
      expect(detail).toBeTruthy();
      expect(detail!.isFutureMonth).toBeFalse();
    });

    it('selectedMonthDetail includes monthLabel with year', () => {
      const detail = component['selectedMonthDetail']();
      expect(detail).toBeTruthy();
      const currentYear = new Date().getFullYear().toString();
      expect(detail!.monthLabel).toContain(currentYear);
    });
  });

  describe('template rendering', () => {
    it('renders month selection buttons for each month', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const monthEls = fixture.nativeElement.querySelectorAll('button.trends-month');
      expect(monthEls.length).toBeGreaterThanOrEqual(3);
    });

    it('applies trends-month--selected class to the selected month', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const selectedEls = fixture.nativeElement.querySelectorAll('.trends-month--selected');
      expect(selectedEls.length).toBe(1);
    });

    it('sets aria-pressed for the selected month button', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const selectedEl = fixture.nativeElement.querySelector('button.trends-month--selected');
      expect(selectedEl).toBeTruthy();
      expect(selectedEl.getAttribute('aria-pressed')).toBe('true');
    });

    it('clicking a month bar changes selection', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const monthEls = fixture.nativeElement.querySelectorAll('button.trends-month');
      if (monthEls.length > 1) {
        monthEls[0].click();
        fixture.detectChanges();
        expect(monthEls[0].classList.contains('trends-month--selected')).toBeTrue();
      }
    });

    it('renders detail panel when data exists', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const detailEl = fixture.nativeElement.querySelector('.trends-detail');
      expect(detailEl).toBeTruthy();
    });

    it('renders detail section headers', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const sectionHeaders = fixture.nativeElement.querySelectorAll('.trends-detail__section-header');
      expect(sectionHeaders.length).toBe(4);
    });

    it('renders detail title with month label', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const titleEl = fixture.nativeElement.querySelector('.trends-detail__title');
      expect(titleEl).toBeTruthy();
      expect(titleEl.textContent).toContain(new Date().getFullYear().toString());
    });

    it('does not render future note for current month', () => {
      entryServiceMock.entriesSignal.set([
        buildEntry({ type: EntryType.INCOME, amount: 100000 }),
      ]);
      fixture.detectChanges();

      const futureNote = fixture.nativeElement.querySelector('.trends-detail__future-note');
      expect(futureNote).toBeNull();
    });
  });
});
