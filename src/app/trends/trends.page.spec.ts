import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrendsPage } from './trends.page';

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
});
