import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

import { SettingsPage } from './settings.page';
import { EntryService } from '../shared/services/entry.service';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { EntrySyncService } from '../shared/services/entry-sync.service';
import { ExternalEntryImportService } from '../shared/services/external-entry-import.service';
import { AlertController, LoadingController, ToastController } from '@ionic/angular/standalone';
import { ImportReviewModalComponent } from '../shared/components/import-review-modal/import-review-modal.component';
import { UserInfoPromptModalComponent } from '../shared/components/user-info-prompt-modal/user-info-prompt-modal.component';
import { UserInfoService } from '../shared/services/user-info.service';

// ---------------------------------------------------------------------------
// Stub for ImportReviewModalComponent so the template compiles without errors
// ---------------------------------------------------------------------------
@Component({
  selector: 'app-import-review-modal',
  standalone: true,
  template: '',
})
class MockImportReviewModalComponent {}

@Component({
  selector: 'app-user-info-prompt-modal',
  standalone: true,
  template: '',
})
class MockUserInfoPromptModalComponent {}

// ---------------------------------------------------------------------------
// Helper: build a mock HTMLInputElement-like ElementRef
// ---------------------------------------------------------------------------
function makeInputRef(value = ''): { nativeElement: HTMLInputElement } {
  const el = { value, click: jasmine.createSpy('click') } as unknown as HTMLInputElement;
  return { nativeElement: el };
}

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;

  // Service mocks
  let entryServiceMock: jasmine.SpyObj<EntryService>;
  let firebaseAuthServiceMock: {
    user$: BehaviorSubject<any>;
    status$: BehaviorSubject<any>;
    errors$: Subject<string>;
    unexpectedSessionEnd$: Subject<void>;
    signInWithGoogle: jasmine.Spy;
    signOut: jasmine.Spy;
  };
  let entrySyncServiceMock: jasmine.SpyObj<EntrySyncService>;
  let externalEntryImportServiceMock: jasmine.SpyObj<ExternalEntryImportService>;
  let userInfoServiceMock: jasmine.SpyObj<UserInfoService> & {
    userInfo: jasmine.Spy;
    hasUserInfo: jasmine.Spy;
  };
  let alertControllerMock: jasmine.SpyObj<AlertController>;
  let loadingControllerMock: jasmine.SpyObj<LoadingController>;
  let toastControllerMock: jasmine.SpyObj<ToastController>;

  // Captured overlay objects
  let alertObj: { present: jasmine.Spy; buttons?: any[] };
  let loaderObj: { present: jasmine.Spy; dismiss: jasmine.Spy };
  let toastObj: { present: jasmine.Spy };

  beforeEach(async () => {
    // --- Loader ---
    loaderObj = { present: jasmine.createSpy('present'), dismiss: jasmine.createSpy('dismiss') };
    loaderObj.present.and.returnValue(Promise.resolve());
    loaderObj.dismiss.and.returnValue(Promise.resolve());

    // --- Alert ---
    alertObj = { present: jasmine.createSpy('present') };
    alertObj.present.and.returnValue(Promise.resolve());

    // --- Toast ---
    toastObj = { present: jasmine.createSpy('present') };
    toastObj.present.and.returnValue(Promise.resolve());

    // --- EntryService ---
    entryServiceMock = jasmine.createSpyObj('EntryService', [
      'getEntriesSnapshot',
      'serializeEntries',
      'importEntries',
      'addEntries',
      'appendIdempotencyInfo',
      'convertToRecurring',
      'deleteAllData',
    ]);
    entryServiceMock.getEntriesSnapshot.and.returnValue([]);
    entryServiceMock.serializeEntries.and.returnValue('{}');
    entryServiceMock.deleteAllData.and.returnValue(Promise.resolve());

    // --- FirebaseAuthService ---
    firebaseAuthServiceMock = {
      user$: new BehaviorSubject<any>(null),
      status$: new BehaviorSubject<any>('idle'),
      errors$: new Subject<string>(),
      unexpectedSessionEnd$: new Subject<void>(),
      signInWithGoogle: jasmine.createSpy('signInWithGoogle'),
      signOut: jasmine.createSpy('signOut'),
    };
    firebaseAuthServiceMock.signInWithGoogle.and.returnValue(Promise.resolve({ displayName: 'Test User' }));
    firebaseAuthServiceMock.signOut.and.returnValue(Promise.resolve());

    // --- EntrySyncService ---
    entrySyncServiceMock = jasmine.createSpyObj('EntrySyncService', [
      'doSync',
      'uploadFile',
      'printListOfUploadedFiles',
      'printLastUploadedFileContent',
      'clearRemoteData',
    ]);
    entrySyncServiceMock.doSync.and.returnValue(Promise.resolve());
    entrySyncServiceMock.uploadFile.and.returnValue(Promise.resolve());
    entrySyncServiceMock.printListOfUploadedFiles.and.returnValue(Promise.resolve());
    entrySyncServiceMock.printLastUploadedFileContent.and.returnValue(Promise.resolve());
    entrySyncServiceMock.clearRemoteData.and.returnValue(Promise.resolve());

    // --- UserInfoService ---
    userInfoServiceMock = jasmine.createSpyObj('UserInfoService', [
      'saveUserInfo',
      'clearUserInfo',
    ], {
      userInfo: jasmine.createSpy('userInfo').and.returnValue(null),
      hasUserInfo: jasmine.createSpy('hasUserInfo').and.returnValue(false),
    });

    // --- ExternalEntryImportService ---
    externalEntryImportServiceMock = jasmine.createSpyObj('ExternalEntryImportService', [
      'importFromExcel',
      'mergeWithExistingEntries',
      'toEntryCreation',
    ]);
    externalEntryImportServiceMock.importFromExcel.and.returnValue(
      Promise.resolve({ entries: [], totalRows: 0, skippedRows: 0 }),
    );
    externalEntryImportServiceMock.mergeWithExistingEntries.and.returnValue({
      exactDuplicates: [],
      potentialDuplicates: [],
      readyToImport: [],
    });
    externalEntryImportServiceMock.toEntryCreation.and.returnValue({} as any);

    // --- AlertController ---
    alertControllerMock = jasmine.createSpyObj('AlertController', ['create']);
    alertControllerMock.create.and.callFake((options: any) => {
      alertObj = { present: jasmine.createSpy('present'), buttons: options?.buttons };
      alertObj.present.and.returnValue(Promise.resolve());
      return Promise.resolve(alertObj as any);
    });

    // --- LoadingController ---
    loadingControllerMock = jasmine.createSpyObj('LoadingController', ['create']);
    loadingControllerMock.create.and.callFake(() => Promise.resolve(loaderObj as any));

    // --- ToastController ---
    toastControllerMock = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerMock.create.and.callFake(() => {
      toastObj = { present: jasmine.createSpy('present') };
      toastObj.present.and.returnValue(Promise.resolve());
      return Promise.resolve(toastObj as any);
    });

    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideIonicAngular(),
        { provide: EntryService, useValue: entryServiceMock },
        { provide: FirebaseAuthService, useValue: firebaseAuthServiceMock },
        { provide: EntrySyncService, useValue: entrySyncServiceMock },
        { provide: ExternalEntryImportService, useValue: externalEntryImportServiceMock },
        { provide: UserInfoService, useValue: userInfoServiceMock },
        { provide: AlertController, useValue: alertControllerMock },
        { provide: LoadingController, useValue: loadingControllerMock },
        { provide: ToastController, useValue: toastControllerMock },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      .overrideComponent(SettingsPage, {
        remove: { imports: [ImportReviewModalComponent, UserInfoPromptModalComponent] },
        add: { imports: [MockImportReviewModalComponent, MockUserInfoPromptModalComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // =========================================================================
  // Basic creation
  // =========================================================================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =========================================================================
  // appVersion
  // =========================================================================

  it('should expose appVersion from package.json', () => {
    expect((component as any).appVersion).toBeTruthy();
    expect(typeof (component as any).appVersion).toBe('string');
  });

  // =========================================================================
  // shouldShowAuthDebugInfo
  // =========================================================================

  it('shouldShowAuthDebugInfo should reflect environment value', () => {
    // environment.features.authDebugInfo is false in test env
    expect(typeof (component as any).shouldShowAuthDebugInfo).toBe('boolean');
  });

  // =========================================================================
  // Constructor subscriptions
  // =========================================================================

  describe('constructor subscriptions', () => {
    it('should update authStatus when status$ emits', () => {
      firebaseAuthServiceMock.status$.next('signing-in');
      expect((component as any).authStatus()).toBe('signing-in');

      firebaseAuthServiceMock.status$.next('idle');
      expect((component as any).authStatus()).toBe('idle');
    });

    it('isSigningIn computed returns true when authStatus is signing-in', () => {
      firebaseAuthServiceMock.status$.next('signing-in');
      expect((component as any).isSigningIn()).toBeTrue();
    });

    it('isSigningOut computed returns true when authStatus is signing-out', () => {
      firebaseAuthServiceMock.status$.next('signing-out');
      expect((component as any).isSigningOut()).toBeTrue();
    });

    it('should call presentError when errors$ emits', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      firebaseAuthServiceMock.errors$.next('some auth error');
      tick();
      expect((component as any).presentError).toHaveBeenCalledWith('some auth error');
    }));

    it('should present warning toast when unexpectedSessionEnd$ emits', fakeAsync(() => {
      spyOn<any>(component, 'presentToast').and.returnValue(Promise.resolve());
      firebaseAuthServiceMock.unexpectedSessionEnd$.next();
      tick();
      expect((component as any).presentToast).toHaveBeenCalledWith(
        jasmine.stringContaining('sesión'),
        'warning',
      );
    }));
  });

  // =========================================================================
  // handleImport
  // =========================================================================

  describe('handleImport()', () => {
    it('should open file selector directly when no existing entries', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      entryServiceMock.getEntriesSnapshot.and.returnValue([]);

      (component as any).handleImport();
      tick();

      expect(inputRef.nativeElement.click).toHaveBeenCalled();
    }));

    it('should present confirm alert when entries exist', fakeAsync(() => {
      entryServiceMock.getEntriesSnapshot.and.returnValue([{} as any]);

      (component as any).handleImport();
      tick();

      expect(alertControllerMock.create).toHaveBeenCalled();
      expect(alertObj.present).toHaveBeenCalled();
    }));

    it('alert confirm handler calls openFileSelector', fakeAsync(() => {
      entryServiceMock.getEntriesSnapshot.and.returnValue([{} as any]);
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;

      (component as any).handleImport();
      tick();

      // Find confirm button handler and invoke it
      const confirmBtn = alertObj.buttons?.find((b: any) => b.role === 'confirm');
      expect(confirmBtn).toBeTruthy();
      confirmBtn.handler();

      expect(inputRef.nativeElement.click).toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // openFileSelector / resetFileInput
  // =========================================================================

  describe('openFileSelector()', () => {
    it('should click hidden file input when present', () => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      (component as any).openFileSelector();
      expect(inputRef.nativeElement.click).toHaveBeenCalled();
    });

    it('should not throw when fileInput is undefined', () => {
      (component as any).fileInput = undefined;
      expect(() => (component as any).openFileSelector()).not.toThrow();
    });
  });

  describe('resetFileInput()', () => {
    it('should reset file input value when present', () => {
      const inputRef = makeInputRef('old-value');
      (component as any).fileInput = inputRef;
      (component as any).resetFileInput();
      expect(inputRef.nativeElement.value).toBe('');
    });

    it('should not throw when fileInput is undefined', () => {
      (component as any).fileInput = undefined;
      expect(() => (component as any).resetFileInput()).not.toThrow();
    });
  });

  // =========================================================================
  // handleExport
  // =========================================================================

  describe('handleExport()', () => {
    it('should serialize entries, download them, and show success toast', fakeAsync(() => {
      entryServiceMock.serializeEntries.and.returnValue('{"data":"test"}');

      // Spy on document.createElement and URL helpers
      const anchor = {
        href: '',
        download: '',
        rel: '',
        click: jasmine.createSpy('click'),
      } as unknown as HTMLAnchorElement;
      spyOn(document, 'createElement').and.returnValue(anchor);
      spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(URL, 'revokeObjectURL');

      (component as any).handleExport();
      tick(1000); // withLoader minimum duration
      tick(0);    // revokeObjectURL setTimeout

      expect(entryServiceMock.serializeEntries).toHaveBeenCalled();
      expect(anchor.click).toHaveBeenCalled();
      expect(toastControllerMock.create).toHaveBeenCalled();
    }));

    it('should presentError on export failure', fakeAsync(() => {
      entryServiceMock.serializeEntries.and.throwError('serialize failed');
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      (component as any).handleExport();
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // downloadEntries
  // =========================================================================

  describe('downloadEntries()', () => {
    it('should create blob, anchor element, click it, and revoke object URL', fakeAsync(() => {
      const anchor = {
        href: '',
        download: '',
        rel: '',
        click: jasmine.createSpy('click'),
      } as unknown as HTMLAnchorElement;
      spyOn(document, 'createElement').and.returnValue(anchor);
      const createObjectSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:url');
      const revokeSpy = spyOn(URL, 'revokeObjectURL');

      (component as any).downloadEntries('{"key":"val"}');
      tick(0); // execute the setTimeout for revokeObjectURL

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(createObjectSpy).toHaveBeenCalled();
      expect(anchor.click).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledWith('blob:url');
    }));
  });

  // =========================================================================
  // handleFileSelected
  // =========================================================================

  describe('handleFileSelected()', () => {
    function makeFileEvent(file: File | null): Event {
      const input = { files: file ? [file] : [] } as unknown as HTMLInputElement;
      return { target: input } as unknown as Event;
    }

    function makeFile(content: string, name = 'test.json'): File {
      return new File([content], name, { type: 'application/json' });
    }

    it('should presentError when no file selected', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const event = { target: { files: [] } } as unknown as Event;
      (component as any).handleFileSelected(event);
      tick();

      expect((component as any).presentError).toHaveBeenCalledWith(
        'No se seleccionó ningún archivo.',
        null,
      );
      // resetFileInput called in finally
      expect(inputRef.nativeElement.value).toBe('');
    }));

    it('should throw and presentError when file.text() rejects', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const mockFile = {
        text: () => Promise.reject(new Error('read error')),
      } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
      expect(inputRef.nativeElement.value).toBe('');
    }));

    it('should throw and presentError when JSON.parse fails', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const mockFile = {
        text: () => Promise.resolve('not-valid-json{{'),
      } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
      expect(inputRef.nativeElement.value).toBe('');
    }));

    it('should throw when parsed data is null', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const mockFile = { text: () => Promise.resolve('null') } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
    }));

    it('should throw when parsed data is an empty array', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const mockFile = { text: () => Promise.resolve('[]') } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
    }));

    it('should throw and presentError when importEntries throws', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      entryServiceMock.importEntries.and.throwError('import fail');

      const mockFile = { text: () => Promise.resolve('{"valid":true}') } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
      expect(inputRef.nativeElement.value).toBe('');
    }));

    it('should import entries and show success toast for valid JSON object', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;

      const mockFile = { text: () => Promise.resolve('{"entries":[]}') } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick(1000);

      expect(entryServiceMock.importEntries).toHaveBeenCalledWith({ entries: [] });
      expect(toastControllerMock.create).toHaveBeenCalled();
      expect(inputRef.nativeElement.value).toBe('');
    }));

    it('should presentError with non-Error exception message in catch', fakeAsync(() => {
      const inputRef = makeInputRef();
      (component as any).fileInput = inputRef;

      // Cause a non-Error throw by making withLoader itself reject with a string
      spyOn<any>(component, 'withLoader').and.returnValue(Promise.reject('plain string error'));
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const mockFile = { text: () => Promise.resolve('{"valid":true}') } as unknown as File;
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleFileSelected(event);
      tick();

      expect((component as any).presentError).toHaveBeenCalledWith(
        'Ocurrió un error inesperado durante la importación.',
        'plain string error',
      );
    }));
  });

  // =========================================================================
  // handleXlsxFileSelected
  // =========================================================================

  describe('handleXlsxFileSelected()', () => {
    it('should presentError when no file selected', fakeAsync(() => {
      const xlsxRef = makeInputRef();
      (component as any).xlsxFileInput = xlsxRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const event = { target: { files: [] } } as unknown as Event;
      (component as any).handleXlsxFileSelected(event);
      tick();

      expect((component as any).presentError).toHaveBeenCalledWith(
        'No se seleccionó ningún archivo.',
        null,
      );
      expect(xlsxRef.nativeElement.value).toBe('');
    }));

    it('should process xlsx file, set mergeResult and open modal on success', fakeAsync(() => {
      const xlsxRef = makeInputRef();
      (component as any).xlsxFileInput = xlsxRef;

      const mockFile = new File([], 'test.xlsx');
      const event = { target: { files: [mockFile] } } as unknown as Event;

      const importResult = { entries: [{ id: 'e1' }], totalRows: 1, skippedRows: 0 };
      externalEntryImportServiceMock.importFromExcel.and.returnValue(Promise.resolve(importResult as any));
      entryServiceMock.getEntriesSnapshot.and.returnValue([]);
      externalEntryImportServiceMock.mergeWithExistingEntries.and.returnValue({
        exactDuplicates: [],
        potentialDuplicates: [],
        readyToImport: [{ id: 'e1' } as any],
      });

      (component as any).handleXlsxFileSelected(event);
      tick(1000);

      expect(externalEntryImportServiceMock.importFromExcel).toHaveBeenCalled();
      expect((component as any).isImportReviewOpen()).toBeTrue();
      expect(xlsxRef.nativeElement.value).toBe('');
    }));

    it('should presentError on xlsx import failure', fakeAsync(() => {
      const xlsxRef = makeInputRef();
      (component as any).xlsxFileInput = xlsxRef;
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      externalEntryImportServiceMock.importFromExcel.and.returnValue(
        Promise.reject(new Error('xlsx error')),
      );

      const mockFile = new File([], 'test.xlsx');
      const event = { target: { files: [mockFile] } } as unknown as Event;

      (component as any).handleXlsxFileSelected(event);
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalled();
      expect(xlsxRef.nativeElement.value).toBe('');
    }));
  });

  // =========================================================================
  // openXlsxFileSelector / resetXlsxFileInput
  // =========================================================================

  describe('openXlsxFileSelector()', () => {
    it('should click hidden xlsx file input when present', () => {
      const xlsxRef = makeInputRef();
      (component as any).xlsxFileInput = xlsxRef;
      (component as any).openXlsxFileSelector();
      expect(xlsxRef.nativeElement.click).toHaveBeenCalled();
    });

    it('should not throw when xlsxFileInput is undefined', () => {
      (component as any).xlsxFileInput = undefined;
      expect(() => (component as any).openXlsxFileSelector()).not.toThrow();
    });
  });

  describe('resetXlsxFileInput()', () => {
    it('should reset xlsx file input value when present', () => {
      const xlsxRef = makeInputRef('old');
      (component as any).xlsxFileInput = xlsxRef;
      (component as any).resetXlsxFileInput();
      expect(xlsxRef.nativeElement.value).toBe('');
    });

    it('should not throw when xlsxFileInput is undefined', () => {
      (component as any).xlsxFileInput = undefined;
      expect(() => (component as any).resetXlsxFileInput()).not.toThrow();
    });
  });

  // =========================================================================
  // handleImportConfirmed
  // =========================================================================

  describe('handleImportConfirmed()', () => {
    it('should close review, add entries, and show success toast', fakeAsync(() => {
      const fakeEntry = {
        date: '2024-01-01',
        description: 'Test',
        amount: 100,
        type: 'expense',
        idempotencyInfo: [],
      } as any;

      const confirmation = {
        entriesToImport: [fakeEntry],
        confirmedDuplicates: [],
      };

      externalEntryImportServiceMock.toEntryCreation.and.returnValue({ amount: 100 } as any);

      (component as any).handleImportConfirmed(confirmation);
      tick(1000);

      expect((component as any).isImportReviewOpen()).toBeFalse();
      expect(entryServiceMock.addEntries).toHaveBeenCalled();
      expect(toastControllerMock.create).toHaveBeenCalled();
    }));

    it('should handle confirmedDuplicates with recurrence', fakeAsync(() => {
      const importedEntry = {
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 6 } },
        idempotencyInfo: [{ idempotencyKey: 'key1', idempotencyVersion: '1' }],
      } as any;
      const matchedEntry = { id: 'existing-id', recurrence: undefined } as any;

      const confirmation = {
        entriesToImport: [],
        confirmedDuplicates: [{ importedEntry, matchedEntry }],
      };

      (component as any).handleImportConfirmed(confirmation);
      tick(1000);

      expect(entryServiceMock.appendIdempotencyInfo).toHaveBeenCalledWith(
        'existing-id',
        importedEntry.idempotencyInfo,
      );
      expect(entryServiceMock.convertToRecurring).toHaveBeenCalledWith(
        'existing-id',
        importedEntry.recurrence,
      );
    }));

    it('should not call convertToRecurring when matched entry already has recurrence', fakeAsync(() => {
      const importedEntry = {
        recurrence: { frequency: 'monthly', termination: { mode: 'occurrences', total: 6 } },
        idempotencyInfo: [{ idempotencyKey: 'key1', idempotencyVersion: '1' }],
      } as any;
      const matchedEntry = { id: 'existing-id', recurrence: { frequency: 'monthly' } } as any;

      const confirmation = {
        entriesToImport: [],
        confirmedDuplicates: [{ importedEntry, matchedEntry }],
      };

      (component as any).handleImportConfirmed(confirmation);
      tick(1000);

      expect(entryServiceMock.convertToRecurring).not.toHaveBeenCalled();
    }));

    it('should presentError when withLoader throws', fakeAsync(() => {
      spyOn<any>(component, 'withLoader').and.returnValue(Promise.reject(new Error('import fail')));
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      const confirmation = { entriesToImport: [], confirmedDuplicates: [] };
      (component as any).handleImportConfirmed(confirmation);
      tick();

      expect((component as any).presentError).toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // handleImportReviewDismissed
  // =========================================================================

  describe('handleImportReviewDismissed()', () => {
    it('should set isImportReviewOpen to false', () => {
      (component as any).isImportReviewOpen.set(true);
      (component as any).handleImportReviewDismissed();
      expect((component as any).isImportReviewOpen()).toBeFalse();
    });
  });

  // =========================================================================
  // withLoader
  // =========================================================================

  describe('withLoader()', () => {
    it('should present loader, run operation, and dismiss loader', fakeAsync(() => {
      let resolved = false;
      const op = () => Promise.resolve(42);

      (component as any).withLoader('Loading…', op).then((v: number) => {
        resolved = true;
        expect(v).toBe(42);
      });

      tick(1000);
      expect(loaderObj.present).toHaveBeenCalled();
      expect(loaderObj.dismiss).toHaveBeenCalled();
      expect(resolved).toBeTrue();
    }));

    it('should wait minimum duration when operation completes quickly', fakeAsync(() => {
      let dismissed = false;
      loaderObj.dismiss.and.callFake(() => {
        dismissed = true;
        return Promise.resolve();
      });

      const quickOp = () => Promise.resolve('fast');
      (component as any).withLoader('msg', quickOp);

      // Before minimum duration elapses, dismiss should not yet be called
      tick(0);
      // Still waiting for minimum 1000ms
      tick(999);
      // After tick(1000) total, it should have dismissed
      tick(1);
      expect(dismissed).toBeTrue();
    }));

    it('should dismiss loader even when operation throws', fakeAsync(() => {
      const failOp = () => Promise.reject(new Error('op failed'));
      let caught = false;

      (component as any)
        .withLoader('msg', failOp)
        .catch(() => {
          caught = true;
        });

      tick(1000);

      expect(loaderObj.dismiss).toHaveBeenCalled();
      expect(caught).toBeTrue();
    }));
  });

  // =========================================================================
  // presentToast
  // =========================================================================

  describe('presentToast()', () => {
    it('should create toast with success color by default', fakeAsync(() => {
      (component as any).presentToast('done');
      tick();
      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ color: 'success', message: 'done' }),
      );
      expect(toastObj.present).toHaveBeenCalled();
    }));

    it('should create toast with warning color', fakeAsync(() => {
      (component as any).presentToast('warn msg', 'warning');
      tick();
      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ color: 'warning' }),
      );
    }));

    it('should create toast with danger color', fakeAsync(() => {
      (component as any).presentToast('error msg', 'danger');
      tick();
      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ color: 'danger' }),
      );
    }));
  });

  // =========================================================================
  // presentError
  // =========================================================================

  describe('presentError()', () => {
    it('should create alert with provided message', fakeAsync(() => {
      (component as any).presentError('Something went wrong');
      tick();
      expect(alertControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Something went wrong' }),
      );
      expect(alertObj.present).toHaveBeenCalled();
    }));

    it('should console.error when error is an Error instance', fakeAsync(() => {
      spyOn(console, 'error');
      const err = new Error('test error');
      (component as any).presentError('msg', err);
      tick();
      expect(console.error).toHaveBeenCalledWith(err);
    }));

    it('should not console.error when error is not an Error instance', fakeAsync(() => {
      spyOn(console, 'error');
      (component as any).presentError('msg', 'just a string');
      tick();
      // console.error should not be called with the string itself
      expect(console.error).not.toHaveBeenCalledWith('just a string');
    }));

    it('should work without error argument', fakeAsync(() => {
      expectAsync((component as any).presentError('msg without error')).toBeResolved();
      tick();
    }));
  });

  // =========================================================================
  // handleGoogleSignIn
  // =========================================================================

  describe('handleGoogleSignIn()', () => {
    it('should sign in and show toast with displayName', fakeAsync(() => {
      firebaseAuthServiceMock.signInWithGoogle.and.returnValue(
        Promise.resolve({ displayName: 'John Doe' }),
      );

      (component as any).handleGoogleSignIn();
      tick(1000);

      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Sesión iniciada como John Doe.' }),
      );
    }));

    it('should show generic toast when displayName is null', fakeAsync(() => {
      firebaseAuthServiceMock.signInWithGoogle.and.returnValue(
        Promise.resolve({ displayName: null }),
      );

      (component as any).handleGoogleSignIn();
      tick(1000);

      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Sesión iniciada correctamente.' }),
      );
    }));

    it('should not show toast when user is null/falsy', fakeAsync(() => {
      firebaseAuthServiceMock.signInWithGoogle.and.returnValue(Promise.resolve(null));

      (component as any).handleGoogleSignIn();
      tick(1000);

      expect(toastControllerMock.create).not.toHaveBeenCalled();
    }));

    it('should log Error instance on failure', fakeAsync(() => {
      spyOn(console, 'error');
      const err = new Error('auth failed');
      firebaseAuthServiceMock.signInWithGoogle.and.returnValue(Promise.reject(err));

      (component as any).handleGoogleSignIn();
      tick(1000);

      expect(console.error).toHaveBeenCalledWith(err);
    }));

    it('should log unexpected error when non-Error thrown', fakeAsync(() => {
      spyOn(console, 'error');
      firebaseAuthServiceMock.signInWithGoogle.and.returnValue(Promise.reject('plain string'));

      (component as any).handleGoogleSignIn();
      tick(1000);

      expect(console.error).toHaveBeenCalledWith(
        'Unexpected error during Google sign-in.',
        'plain string',
      );
    }));
  });

  // =========================================================================
  // handleGoogleSignOut
  // =========================================================================

  describe('handleGoogleSignOut()', () => {
    it('should sign out and show success toast', fakeAsync(() => {
      firebaseAuthServiceMock.signOut.and.returnValue(Promise.resolve());

      (component as any).handleGoogleSignOut();
      tick(1000);

      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Sesión cerrada correctamente.' }),
      );
    }));

    it('should log Error instance on sign-out failure', fakeAsync(() => {
      spyOn(console, 'error');
      const err = new Error('sign-out failed');
      firebaseAuthServiceMock.signOut.and.returnValue(Promise.reject(err));

      (component as any).handleGoogleSignOut();
      tick(1000);

      expect(console.error).toHaveBeenCalledWith(err);
    }));

    it('should log unexpected error when non-Error thrown during sign-out', fakeAsync(() => {
      spyOn(console, 'error');
      firebaseAuthServiceMock.signOut.and.returnValue(Promise.reject(42));

      (component as any).handleGoogleSignOut();
      tick(1000);

      expect(console.error).toHaveBeenCalledWith(
        'Unexpected error during Google sign-out.',
        42,
      );
    }));
  });

  // =========================================================================
  // handleSync
  // =========================================================================

  describe('handleSync()', () => {
    it('should set isSyncing true during sync and false after', fakeAsync(() => {
      entrySyncServiceMock.doSync.and.returnValue(Promise.resolve());

      (component as any).handleSync();
      expect((component as any).isSyncing).toBeTrue();

      tick();
      expect((component as any).isSyncing).toBeFalse();
    }));

    it('should present error alert on 401 status', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      entrySyncServiceMock.doSync.and.returnValue(Promise.reject({ status: 401 }));

      (component as any).handleSync();
      tick();

      expect((component as any).presentError).toHaveBeenCalledWith(
        'No autorizado. Por favor, inicia sesión nuevamente.',
      );
      expect((component as any).isSyncing).toBeFalse();
    }));

    it('should present error alert on 403 status', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      entrySyncServiceMock.doSync.and.returnValue(Promise.reject({ status: 403 }));

      (component as any).handleSync();
      tick();

      expect((component as any).presentError).toHaveBeenCalled();
      expect((component as any).isSyncing).toBeFalse();
    }));

    it('should not present error alert on other status codes', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      spyOn(console, 'error');
      entrySyncServiceMock.doSync.and.returnValue(Promise.reject({ status: 500 }));

      (component as any).handleSync();
      tick();

      // status 500 matches the 403 branch due to operator precedence but not 401
      // The condition: typeof status === 'number' && (status === 401) || status === 403
      // equals: (typeof status === 'number' && status === 401) || status === 403
      // For 500: false || false → no presentError
      expect((component as any).presentError).not.toHaveBeenCalled();
      expect((component as any).isSyncing).toBeFalse();
    }));

    it('should not present error alert when error has no status', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      spyOn(console, 'error');
      entrySyncServiceMock.doSync.and.returnValue(Promise.reject(new Error('network')));

      (component as any).handleSync();
      tick();

      expect((component as any).presentError).not.toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // handleUploadFile
  // =========================================================================

  describe('handleUploadFile()', () => {
    it('should upload file and clear isSyncing', fakeAsync(() => {
      entrySyncServiceMock.uploadFile.and.returnValue(Promise.resolve());

      (component as any).handleUploadFile();
      expect((component as any).isSyncing).toBeTrue();
      tick();
      expect((component as any).isSyncing).toBeFalse();
    }));

    it('should present error alert on 401 status during upload', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      entrySyncServiceMock.uploadFile.and.returnValue(Promise.reject({ status: 401 }));

      (component as any).handleUploadFile();
      tick();

      expect((component as any).presentError).toHaveBeenCalledWith(
        'No autorizado. Por favor, inicia sesión nuevamente.',
      );
    }));

    it('should present error alert on 403 status during upload', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      entrySyncServiceMock.uploadFile.and.returnValue(Promise.reject({ status: 403 }));

      (component as any).handleUploadFile();
      tick();

      expect((component as any).presentError).toHaveBeenCalled();
    }));

    it('should not present error alert for other upload errors', fakeAsync(() => {
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());
      spyOn(console, 'error');
      entrySyncServiceMock.uploadFile.and.returnValue(Promise.reject({ status: 500 }));

      (component as any).handleUploadFile();
      tick();

      expect((component as any).presentError).not.toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // handleShowUploadedFiles
  // =========================================================================

  describe('handleShowUploadedFiles()', () => {
    it('should call printListOfUploadedFiles', fakeAsync(() => {
      entrySyncServiceMock.printListOfUploadedFiles.and.returnValue(Promise.resolve());

      (component as any).handleShowUploadedFiles();
      tick();

      expect(entrySyncServiceMock.printListOfUploadedFiles).toHaveBeenCalled();
    }));

    it('should log error when printListOfUploadedFiles throws', fakeAsync(() => {
      spyOn(console, 'error');
      entrySyncServiceMock.printListOfUploadedFiles.and.returnValue(
        Promise.reject(new Error('list error')),
      );

      (component as any).handleShowUploadedFiles();
      tick();

      expect(console.error).toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // handleShowLastUploadedFileContent
  // =========================================================================

  describe('handleShowLastUploadedFileContent()', () => {
    it('should call printLastUploadedFileContent and manage isSyncing', fakeAsync(() => {
      entrySyncServiceMock.printLastUploadedFileContent.and.returnValue(Promise.resolve());

      (component as any).handleShowLastUploadedFileContent();
      expect((component as any).isSyncing).toBeTrue();
      tick();
      expect((component as any).isSyncing).toBeFalse();
      expect(entrySyncServiceMock.printLastUploadedFileContent).toHaveBeenCalled();
    }));

    it('should log error and clear isSyncing when printLastUploadedFileContent throws', fakeAsync(() => {
      spyOn(console, 'error');
      entrySyncServiceMock.printLastUploadedFileContent.and.returnValue(
        Promise.reject(new Error('content error')),
      );

      (component as any).handleShowLastUploadedFileContent();
      tick();

      expect(console.error).toHaveBeenCalled();
      expect((component as any).isSyncing).toBeFalse();
    }));
  });

  // =========================================================================
  // handleClearRemoteData
  // =========================================================================

  describe('handleClearRemoteData()', () => {
    it('should call clearRemoteData and manage isSyncing', fakeAsync(() => {
      entrySyncServiceMock.clearRemoteData.and.returnValue(Promise.resolve());

      (component as any).handleClearRemoteData();
      expect((component as any).isSyncing).toBeTrue();
      tick();
      expect((component as any).isSyncing).toBeFalse();
      expect(entrySyncServiceMock.clearRemoteData).toHaveBeenCalled();
    }));

    it('should log error and clear isSyncing when clearRemoteData throws', fakeAsync(() => {
      spyOn(console, 'error');
      entrySyncServiceMock.clearRemoteData.and.returnValue(
        Promise.reject(new Error('clear error')),
      );

      (component as any).handleClearRemoteData();
      tick();

      expect(console.error).toHaveBeenCalled();
      expect((component as any).isSyncing).toBeFalse();
    }));
  });

  // =========================================================================
  // handleDeleteAllData
  // =========================================================================

  describe('handleDeleteAllData()', () => {
    it('should present a confirm alert', fakeAsync(() => {
      (component as any).handleDeleteAllData();
      tick();

      expect(alertControllerMock.create).toHaveBeenCalled();
      expect(alertObj.present).toHaveBeenCalled();
    }));

    it('confirm handler invokes doDeleteAllData', fakeAsync(() => {
      spyOn<any>(component, 'doDeleteAllData').and.returnValue(Promise.resolve());

      (component as any).handleDeleteAllData();
      tick();

      const confirmBtn = alertObj.buttons?.find((b: any) => b.role === 'confirm');
      expect(confirmBtn).toBeTruthy();
      confirmBtn.handler();
      tick(1000);

      expect((component as any).doDeleteAllData).toHaveBeenCalled();
    }));
  });

  // =========================================================================
  // doDeleteAllData
  // =========================================================================

  describe('doDeleteAllData()', () => {
    it('should delete all data and show success toast', fakeAsync(() => {
      entryServiceMock.deleteAllData.and.returnValue(Promise.resolve());

      (component as any).doDeleteAllData();
      tick(1000);

      expect(entryServiceMock.deleteAllData).toHaveBeenCalled();
      expect(toastControllerMock.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          message: 'Todas las transacciones han sido eliminadas.',
        }),
      );
    }));

    it('should presentError when deleteAllData throws', fakeAsync(() => {
      entryServiceMock.deleteAllData.and.returnValue(Promise.reject(new Error('delete failed')));
      spyOn<any>(component, 'presentError').and.returnValue(Promise.resolve());

      (component as any).doDeleteAllData();
      tick(1000);

      expect((component as any).presentError).toHaveBeenCalledWith(
        'No se pudieron eliminar las transacciones. Intenta nuevamente.',
        jasmine.any(Error),
      );
    }));
  });

  // =========================================================================
  // User info
  // =========================================================================

  describe('user info', () => {
    it('exposes userInfo signal from the service', () => {
      expect((component as any).userInfo()).toBeNull();
    });

    it('exposes hasUserInfo signal from the service', () => {
      expect((component as any).hasUserInfo()).toBeFalse();
    });

    it('isUserInfoFormOpen defaults to false', () => {
      expect((component as any).isUserInfoFormOpen()).toBeFalse();
    });

    describe('handleEditUserInfo', () => {
      it('opens the user info form modal', () => {
        (component as any).handleEditUserInfo();

        expect((component as any).isUserInfoFormOpen()).toBeTrue();
      });
    });

    describe('handleUserInfoSaved', () => {
      it('saves user info via the service', () => {
        const info = { fullName: 'Test User', idDocument: '12345678-9' };

        (component as any).handleUserInfoSaved(info);

        expect(userInfoServiceMock.saveUserInfo).toHaveBeenCalledWith(info);
      });

      it('closes the form modal', () => {
        (component as any).isUserInfoFormOpen.set(true);

        (component as any).handleUserInfoSaved({ fullName: 'Test', idDocument: '123' });

        expect((component as any).isUserInfoFormOpen()).toBeFalse();
      });
    });

    describe('handleUserInfoFormDismissed', () => {
      it('closes the form modal', () => {
        (component as any).isUserInfoFormOpen.set(true);

        (component as any).handleUserInfoFormDismissed();

        expect((component as any).isUserInfoFormOpen()).toBeFalse();
      });
    });
  });
});
