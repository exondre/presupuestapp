import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular/standalone';
import { EntryData, EntryType } from '../../models/entry-data.model';
import { EntryActionService } from '../../services/entry-action.service';
import { NewEntryModalComponent } from './new-entry-modal.component';

const entry: EntryData = {
  id: 'rent', amount: 1000, description: 'Arriendo', date: '2026-10-08T12:00:00.069Z', type: EntryType.EXPENSE,
  recurrence: { recurrenceId: 'r', frequency: 'monthly', occurrenceIndex: 2,
    anchorDate: '2026-08-08T12:00:00.069Z', termination: { mode: 'occurrences', total: 12 } },
};

describe('NewEntryModalComponent editing', () => {
  let fixture: ComponentFixture<NewEntryModalComponent>;
  let component: NewEntryModalComponent;
  let actions: jasmine.SpyObj<EntryActionService>;
  let alert: jasmine.SpyObj<AlertController>;

  beforeEach(async () => {
    actions = jasmine.createSpyObj('EntryActionService', ['confirmAndUpdateEntry']);
    actions.confirmAndUpdateEntry.and.resolveTo('saved');
    alert = jasmine.createSpyObj('AlertController', ['create']);
    alert.create.and.resolveTo({ present: async () => undefined,
      onDidDismiss: async () => ({ role: 'cancel' }) } as any);
    await TestBed.configureTestingModule({ imports: [NewEntryModalComponent], providers: [
      { provide: EntryActionService, useValue: actions }, { provide: AlertController, useValue: alert },
    ] }).overrideComponent(NewEntryModalComponent, { set: { template: '' } }).compileComponents();
    fixture = TestBed.createComponent(NewEntryModalComponent);
    component = fixture.componentInstance;
    component.openForEdit(entry);
  });

  it('sends only the changed amount and closes after the shared action saves', async () => {
    (component as any).form.controls.amount.setValue('2000');
    await (component as any).handleSave();
    expect(actions.confirmAndUpdateEntry).toHaveBeenCalledWith({ id: 'rent', amount: 2000 });
    expect((component as any).isOpen).toBeFalse();
  });

  it('sends an explicit description clear and only the selected date when changed', async () => {
    (component as any).form.patchValue({ description: '', date: '2026-10-09T09:00:00-03:00' });
    await (component as any).handleSave();
    expect(actions.confirmAndUpdateEntry).toHaveBeenCalledWith({ id: 'rent', description: null, date: '2026-10-09T12:00:00.000Z' });
  });

  it('does not turn an unchanged date with milliseconds into an edit', async () => {
    await (component as any).handleSave();
    expect(actions.confirmAndUpdateEntry).toHaveBeenCalledWith({ id: 'rent' });
  });

  it('retains the draft and unsaved-change guard on cancellation or failure', async () => {
    actions.confirmAndUpdateEntry.and.resolveTo('cancelled');
    (component as any).form.controls.description.setValue('Nuevo');
    (component as any).form.markAsDirty();
    await (component as any).handleSave();
    expect((component as any).isOpen).toBeTrue();
    expect((component as any).form.controls.description.value).toBe('Nuevo');
    expect((component as any).hasSavedCurrentForm).toBeFalse();
    await component.close();
    expect(alert.create).toHaveBeenCalled();
    expect((component as any).isOpen).toBeTrue();
  });

  it('guards repeated save taps and dismissal while choosing a scope', async () => {
    let finish!: (value: 'saved' | 'cancelled') => void;
    actions.confirmAndUpdateEntry.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    (component as any).form.controls.amount.setValue('2000');
    const saving = (component as any).handleSave();
    await (component as any).handleSave();
    await component.close();
    expect(await (component as any).canDismiss()).toBeFalse();
    expect(actions.confirmAndUpdateEntry).toHaveBeenCalledTimes(1);
    expect((component as any).isOpen).toBeTrue();
    finish('saved');
    await saving;
    expect((component as any).isSaving).toBeFalse();
    expect((component as any).isOpen).toBeFalse();
  });

  it('keeps creation output and validation unchanged', async () => {
    component.open();
    const saved = jasmine.createSpy('saved');
    (component as any).entrySaved.subscribe(saved);
    await (component as any).handleSave();
    expect(saved).not.toHaveBeenCalled();
    expect((component as any).isOpen).toBeTrue();
    (component as any).form.patchValue({ amount: '1500', description: 'Almuerzo' });
    await (component as any).handleSave();
    expect(saved).toHaveBeenCalledWith(jasmine.objectContaining({ amount: 1500, description: 'Almuerzo', type: EntryType.EXPENSE }));
    expect(actions.confirmAndUpdateEntry).not.toHaveBeenCalled();
  });
});
