import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { UserInfoPromptModalComponent } from './user-info-prompt-modal.component';
import { UserInfo } from '../../models/user-info.model';

describe('UserInfoPromptModalComponent', () => {
  let component: UserInfoPromptModalComponent;
  let fixture: ComponentFixture<UserInfoPromptModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserInfoPromptModalComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(UserInfoPromptModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Basic creation
  // -------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Default input values
  // -------------------------------------------------------------------------

  describe('default inputs', () => {
    it('isOpen defaults to false', () => {
      expect(component.isOpen()).toBeFalse();
    });

    it('initialData defaults to null', () => {
      expect(component.initialData()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // View state management
  // -------------------------------------------------------------------------

  describe('view state', () => {
    it('starts in prompt view by default', () => {
      expect((component as any).viewState()).toBe('prompt');
    });

    it('resets form when going back to prompt', () => {
      (component as any).form.patchValue({ fullName: 'Test', idDocument: '123' });

      (component as any).goBackToPrompt();

      expect((component as any).form.getRawValue().fullName).toBe('');
      expect((component as any).form.getRawValue().idDocument).toBe('');
    });

    it('is form when initialData is provided', () => {
      fixture.componentRef.setInput('initialData', { fullName: 'Juan', idDocument: '123' });
      fixture.detectChanges();

      expect((component as any).viewState()).toBe('form');
    });

    it('is form when startInFormMode is true', () => {
      fixture.componentRef.setInput('startInFormMode', true);
      fixture.detectChanges();

      expect((component as any).viewState()).toBe('form');
    });

    it('is form when user navigated to form (goToForm)', () => {
      (component as any).goToForm();

      expect((component as any).viewState()).toBe('form');
    });

    it('is prompt again after goBackToPrompt', () => {
      (component as any).goToForm();
      (component as any).goBackToPrompt();

      expect((component as any).viewState()).toBe('prompt');
    });
  });

  // -------------------------------------------------------------------------
  // Form validation
  // -------------------------------------------------------------------------

  describe('form validation', () => {
    it('form is invalid when both fields are empty', () => {
      expect((component as any).form.invalid).toBeTrue();
    });

    it('form is invalid when only fullName is filled', () => {
      (component as any).form.patchValue({ fullName: 'Test' });

      expect((component as any).form.invalid).toBeTrue();
    });

    it('form is invalid when only idDocument is filled', () => {
      (component as any).form.patchValue({ idDocument: '123' });

      expect((component as any).form.invalid).toBeTrue();
    });

    it('form is valid when both fields are filled', () => {
      (component as any).form.patchValue({ fullName: 'Test', idDocument: '123' });

      expect((component as any).form.valid).toBeTrue();
    });
  });

  // -------------------------------------------------------------------------
  // handleSave
  // -------------------------------------------------------------------------

  describe('handleSave', () => {
    it('emits infoSaved with the entered data when form is valid', () => {
      const emitSpy = spyOn(component.infoSaved, 'emit');
      (component as any).form.patchValue({ fullName: 'María López', idDocument: '98765432-1' });

      (component as any).handleSave();

      expect(emitSpy).toHaveBeenCalledWith({
        fullName: 'María López',
        idDocument: '98765432-1',
      });
    });

    it('trims whitespace from values before emitting', () => {
      const emitSpy = spyOn(component.infoSaved, 'emit');
      (component as any).form.patchValue({ fullName: '  María López  ', idDocument: '  123  ' });

      (component as any).handleSave();

      expect(emitSpy).toHaveBeenCalledWith({
        fullName: 'María López',
        idDocument: '123',
      });
    });

    it('does not emit when form is invalid', () => {
      const emitSpy = spyOn(component.infoSaved, 'emit');

      (component as any).handleSave();

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('emits exactly once', () => {
      const emitSpy = spyOn(component.infoSaved, 'emit');
      (component as any).form.patchValue({ fullName: 'Test', idDocument: '123' });

      (component as any).handleSave();

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // handleRemindLater
  // -------------------------------------------------------------------------

  describe('handleRemindLater', () => {
    it('emits the remindLater output', () => {
      const emitSpy = spyOn(component.remindLater, 'emit');

      (component as any).handleRemindLater();

      expect(emitSpy).toHaveBeenCalled();
    });

    it('emits exactly once', () => {
      const emitSpy = spyOn(component.remindLater, 'emit');

      (component as any).handleRemindLater();

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // handleDontAskAgain
  // -------------------------------------------------------------------------

  describe('handleDontAskAgain', () => {
    it('emits the dontAskAgain output', () => {
      const emitSpy = spyOn(component.dontAskAgain, 'emit');

      (component as any).handleDontAskAgain();

      expect(emitSpy).toHaveBeenCalled();
    });

    it('emits exactly once', () => {
      const emitSpy = spyOn(component.dontAskAgain, 'emit');

      (component as any).handleDontAskAgain();

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // onDidDismiss
  // -------------------------------------------------------------------------

  describe('onDidDismiss', () => {
    it('emits the dismissed output', () => {
      const emitSpy = spyOn(component.dismissed, 'emit');

      (component as any).onDidDismiss();

      expect(emitSpy).toHaveBeenCalled();
    });

    it('viewState returns to prompt after dismiss when no static inputs are set', () => {
      (component as any).goToForm();

      (component as any).onDidDismiss();

      expect((component as any).viewState()).toBe('prompt');
    });

    it('viewState stays form after dismiss when startInFormMode is true', () => {
      fixture.componentRef.setInput('startInFormMode', true);
      fixture.detectChanges();

      (component as any).onDidDismiss();

      expect((component as any).viewState()).toBe('form');
    });

    it('viewState stays form after dismiss when initialData is set', () => {
      fixture.componentRef.setInput('initialData', { fullName: 'Test', idDocument: '123' });
      fixture.detectChanges();

      (component as any).onDidDismiss();

      expect((component as any).viewState()).toBe('form');
    });

    it('re-populates form with initialData after dismiss', () => {
      const info: UserInfo = { fullName: 'Juan', idDocument: '999' };
      fixture.componentRef.setInput('initialData', info);
      fixture.detectChanges();
      (component as any).form.patchValue({ fullName: 'Changed', idDocument: 'Changed' });

      (component as any).onDidDismiss();

      const formValue = (component as any).form.getRawValue();
      expect(formValue.fullName).toBe('Juan');
      expect(formValue.idDocument).toBe('999');
    });

    it('resets form values when no initialData', () => {
      (component as any).form.patchValue({ fullName: 'Test', idDocument: '123' });

      (component as any).onDidDismiss();

      expect((component as any).form.getRawValue().fullName).toBe('');
      expect((component as any).form.getRawValue().idDocument).toBe('');
    });

    it('emits dismissed exactly once', () => {
      const emitSpy = spyOn(component.dismissed, 'emit');

      (component as any).onDidDismiss();

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });
});
