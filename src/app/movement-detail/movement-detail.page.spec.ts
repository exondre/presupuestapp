import { Component, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryData, EntryType, EntryUpdatePayload } from '../shared/models/entry-data.model';
import { EntryActionService } from '../shared/services/entry-action.service';
import { EntryService } from '../shared/services/entry.service';
import { MovementDetailPage } from './movement-detail.page';

@Component({ selector: 'app-new-entry-modal', template: '' })
class MockNewEntryModalComponent {
  readonly entryUpdated = output<EntryUpdatePayload>();
}

class EntryServiceMock {
  readonly entriesSignal = signal<EntryData[]>([]);
  readonly updateEntry = jasmine.createSpy('updateEntry');
}

class EntryActionServiceMock {
  readonly confirmAndDeleteEntry = jasmine
    .createSpy('confirmAndDeleteEntry')
    .and.resolveTo(false);
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
    description: overrides.description ?? 'Almuerzo',
    updatedAt: overrides.updatedAt,
    recurrence: overrides.recurrence,
  };
}

describe('MovementDetailPage', () => {
  let component: MovementDetailPage;
  let fixture: ComponentFixture<MovementDetailPage>;
  let entryServiceMock: EntryServiceMock;
  let entryActionServiceMock: EntryActionServiceMock;

  beforeEach(async () => {
    entryServiceMock = new EntryServiceMock();
    entryActionServiceMock = new EntryActionServiceMock();

    await TestBed.configureTestingModule({
      imports: [MovementDetailPage],
      providers: [
        provideIonicAngular(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ entryId: 'entry-id' })) },
        },
        { provide: EntryService, useValue: entryServiceMock },
        { provide: EntryActionService, useValue: entryActionServiceMock },
        {
          provide: NavController,
          useValue: {
            pop: jasmine.createSpy('pop').and.resolveTo(true),
            navigateBack: jasmine.createSpy('navigateBack'),
            navigateForward: jasmine.createSpy('navigateForward'),
          },
        },
      ],
    })
      .overrideComponent(MovementDetailPage, {
        remove: { imports: [NewEntryModalComponent] },
        add: { imports: [MockNewEntryModalComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(MovementDetailPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  it('should build detail for existing entry', () => {
    entryServiceMock.entriesSignal.set([buildEntry({ id: 'entry-id', amount: 2500 })]);
    fixture.detectChanges();

    expect((component as any).detail().amountLabel).toBe('$2.500');
  });

  it('should return null detail when entry is missing', () => {
    fixture.detectChanges();

    expect((component as any).detail()).toBeNull();
  });

  it('should update entry from modal payload', () => {
    const payload: EntryUpdatePayload = {
      id: 'entry-id',
      amount: 3000,
      date: '2026-01-16T10:00:00.000Z',
      description: 'Updated',
    };
    fixture.detectChanges();

    (component as any).handleEntryUpdated(payload);

    expect(entryServiceMock.updateEntry).toHaveBeenCalledWith('entry-id', {
      amount: 3000,
      date: '2026-01-16T10:00:00.000Z',
      description: 'Updated',
    });
  });

  it('should delegate deletion', async () => {
    entryServiceMock.entriesSignal.set([buildEntry({ id: 'entry-id' })]);
    fixture.detectChanges();

    await (component as any).handleDeleteEntry();

    expect(entryActionServiceMock.confirmAndDeleteEntry).toHaveBeenCalledWith('entry-id');
  });
});
