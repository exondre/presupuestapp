import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';

import { TabsPage } from './tabs.page';
import { UserInfoService } from '../shared/services/user-info.service';
import { UserInfoPromptModalComponent } from '../shared/components/user-info-prompt-modal/user-info-prompt-modal.component';

// ---------------------------------------------------------------------------
// Stub for UserInfoPromptModalComponent
// ---------------------------------------------------------------------------
@Component({
  selector: 'app-user-info-prompt-modal',
  standalone: true,
  template: '',
})
class MockUserInfoPromptModalComponent {}

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;
  let userInfoServiceMock: jasmine.SpyObj<UserInfoService>;

  beforeEach(async () => {
    userInfoServiceMock = jasmine.createSpyObj('UserInfoService', [
      'shouldShowPrompt',
      'saveUserInfo',
      'dismissPromptTemporarily',
      'dismissPromptPermanently',
    ]);
    userInfoServiceMock.shouldShowPrompt.and.returnValue(false);

    await TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [
        provideRouter([]),
        { provide: UserInfoService, useValue: userInfoServiceMock },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      .overrideComponent(TabsPage, {
        remove: { imports: [UserInfoPromptModalComponent] },
        add: { imports: [MockUserInfoPromptModalComponent] },
      })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // User info prompt — visibility
  // -------------------------------------------------------------------------

  describe('user info prompt visibility', () => {
    it('does not open prompt when shouldShowPrompt returns false', () => {
      expect((component as any).isUserInfoPromptOpen()).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // User info prompt — handlers
  // -------------------------------------------------------------------------

  describe('handleUserInfoSaved', () => {
    it('saves user info via service', () => {
      const info = { fullName: 'Test', idDocument: '123' };

      (component as any).handleUserInfoSaved(info);

      expect(userInfoServiceMock.saveUserInfo).toHaveBeenCalledWith(info);
    });

    it('closes the prompt modal', () => {
      (component as any).isUserInfoPromptOpen.set(true);

      (component as any).handleUserInfoSaved({ fullName: 'Test', idDocument: '123' });

      expect((component as any).isUserInfoPromptOpen()).toBeFalse();
    });
  });

  describe('handleUserInfoRemindLater', () => {
    it('dismisses prompt temporarily via service', () => {
      (component as any).handleUserInfoRemindLater();

      expect(userInfoServiceMock.dismissPromptTemporarily).toHaveBeenCalled();
    });

    it('closes the prompt modal', () => {
      (component as any).isUserInfoPromptOpen.set(true);

      (component as any).handleUserInfoRemindLater();

      expect((component as any).isUserInfoPromptOpen()).toBeFalse();
    });
  });

  describe('handleUserInfoDontAskAgain', () => {
    it('dismisses prompt permanently via service', () => {
      (component as any).handleUserInfoDontAskAgain();

      expect(userInfoServiceMock.dismissPromptPermanently).toHaveBeenCalled();
    });

    it('closes the prompt modal', () => {
      (component as any).isUserInfoPromptOpen.set(true);

      (component as any).handleUserInfoDontAskAgain();

      expect((component as any).isUserInfoPromptOpen()).toBeFalse();
    });
  });

  describe('handleUserInfoPromptDismissed', () => {
    it('dismisses prompt temporarily when modal was open', () => {
      (component as any).isUserInfoPromptOpen.set(true);

      (component as any).handleUserInfoPromptDismissed();

      expect(userInfoServiceMock.dismissPromptTemporarily).toHaveBeenCalled();
    });

    it('closes the prompt modal', () => {
      (component as any).isUserInfoPromptOpen.set(true);

      (component as any).handleUserInfoPromptDismissed();

      expect((component as any).isUserInfoPromptOpen()).toBeFalse();
    });

    it('does not call service when modal was already closed', () => {
      (component as any).isUserInfoPromptOpen.set(false);

      (component as any).handleUserInfoPromptDismissed();

      expect(userInfoServiceMock.dismissPromptTemporarily).not.toHaveBeenCalled();
    });
  });
});
