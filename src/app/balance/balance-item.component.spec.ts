import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { EntryType } from '../shared/models/entry-data.model';
import { BalanceItemComponent, BalanceItemViewModel } from './balance-item.component';

const item: BalanceItemViewModel = {
  id: 'entry-id',
  amountLabel: '$1.000',
  description: 'Almuerzo',
  timeLabel: '10:00',
  timestamp: 1,
  type: EntryType.EXPENSE,
  isRecurring: false,
};

describe('BalanceItemComponent', () => {
  let component: BalanceItemComponent;
  let fixture: ComponentFixture<BalanceItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BalanceItemComponent],
      providers: [provideIonicAngular()],
    }).compileComponents();

    fixture = TestBed.createComponent(BalanceItemComponent);
    fixture.componentRef.setInput('itemSignal', item);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit view request', () => {
    spyOn((component as any).viewRequested, 'emit');

    (component as any).handleView();

    expect((component as any).viewRequested.emit).toHaveBeenCalled();
  });

  it('should emit edit request', async () => {
    spyOn((component as any).editRequested, 'emit');

    await (component as any).handleEdit();

    expect((component as any).editRequested.emit).toHaveBeenCalled();
  });

  it('should emit delete request', async () => {
    spyOn((component as any).deleteRequested, 'emit');

    await (component as any).handleDelete();

    expect((component as any).deleteRequested.emit).toHaveBeenCalled();
  });
});
