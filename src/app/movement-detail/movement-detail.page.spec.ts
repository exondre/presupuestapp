import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryData, EntryType } from '../shared/models/entry-data.model';
import { EntryActionService } from '../shared/services/entry-action.service';
import { EntryService } from '../shared/services/entry.service';
import { MovementDetailPage } from './movement-detail.page';

@Component({ selector: 'app-new-entry-modal', template: '' })
class MockNewEntryModalComponent {
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
    originalDescription: overrides.originalDescription,
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

  it('shows the Excel description separately from the editable description', () => {
    entryServiceMock.entriesSignal.set([buildEntry({
      description: 'Almuerzo',
      originalDescription: 'RESTAURANTE',
    })]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Almuerzo');
    expect(text).toContain('Descripción original');
    expect(text).toContain('RESTAURANTE');

    entryServiceMock.entriesSignal.set([buildEntry({
      description: 'Almuerzo',
      originalDescription: 'RESTAURANTE',
      updatedAt: '2026-10-09T12:00:00.000Z',
    })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Almuerzo');
    expect(fixture.nativeElement.textContent).toContain('RESTAURANTE');
    expect(fixture.nativeElement.textContent).not.toContain('COMPRA RESTAURANTE*');
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.movement-detail-list__item p'))
      .map((label) => (label as HTMLElement).textContent);
    expect(labels).toEqual(['Fecha', 'Hora', 'Tipo', 'Descripción original', 'Última actualización']);

    entryServiceMock.entriesSignal.set([buildEntry()]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Descripción original');
  });

  it('hides the original when no import backup exists, including later edits and month changes', () => {
    for (const description of ['RESTAURANTE', 'Almuerzo posterior', 'RESTAURANTE (07/10)']) {
      entryServiceMock.entriesSignal.set([buildEntry({ description })]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Descripción original');
    }
  });

  it('keeps the original visible for an import edit even if the name is later restored', () => {
    entryServiceMock.entriesSignal.set([buildEntry({
      description: 'RESTAURANTE',
      originalDescription: 'RESTAURANTE',
    })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Descripción original');
  });

  it('should delegate deletion', async () => {
    entryServiceMock.entriesSignal.set([buildEntry({ id: 'entry-id' })]);
    fixture.detectChanges();

    await (component as any).handleDeleteEntry();

    expect(entryActionServiceMock.confirmAndDeleteEntry).toHaveBeenCalledWith('entry-id');
  });
});
