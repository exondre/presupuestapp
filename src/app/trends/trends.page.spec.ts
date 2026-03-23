import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrendsPage } from './trends.page';
import { buildMonthKey } from '../shared/utils/trends-data.util';
import { EntryService } from '../shared/services/entry.service';
import { EntryData, EntryType } from '../shared/models/entry-data.model';

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

  beforeEach(() => {
    fixture = TestBed.createComponent(TrendsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
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
    it('renders trends-month elements for each month', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const monthEls = fixture.nativeElement.querySelectorAll('.trends-month');
      expect(monthEls.length).toBeGreaterThanOrEqual(3);
    });

    it('applies trends-month--selected class to the selected month', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const selectedEls = fixture.nativeElement.querySelectorAll('.trends-month--selected');
      expect(selectedEls.length).toBe(1);
    });

    it('clicking a month bar changes selection', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const monthEls = fixture.nativeElement.querySelectorAll('.trends-month');
      if (monthEls.length > 1) {
        monthEls[0].click();
        fixture.detectChanges();
        expect(monthEls[0].classList.contains('trends-month--selected')).toBeTrue();
      }
    });

    it('renders detail panel when data exists', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const detailEl = fixture.nativeElement.querySelector('.trends-detail');
      expect(detailEl).toBeTruthy();
    });

    it('renders detail section headers', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const sectionHeaders = fixture.nativeElement.querySelectorAll('.trends-detail__section-header');
      expect(sectionHeaders.length).toBe(4);
    });

    it('renders detail title with month label', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const titleEl = fixture.nativeElement.querySelector('.trends-detail__title');
      expect(titleEl).toBeTruthy();
      expect(titleEl.textContent).toContain(new Date().getFullYear().toString());
    });

    it('does not render future note for current month', () => {
      const entryService = TestBed.inject(EntryService);
      const entry = buildEntry({
        type: EntryType.INCOME,
        amount: 100000,
      });
      entryService.addEntry(entry);
      fixture.detectChanges();

      const futureNote = fixture.nativeElement.querySelector('.trends-detail__future-note');
      expect(futureNote).toBeNull();
    });
  });
});
