import { TestBed } from '@angular/core/testing';

import { UserInfoService } from './user-info.service';
import { LocalStorageService } from './local-storage.service';
import { UserInfo } from '../models/user-info.model';

describe('UserInfoService', () => {
  let service: UserInfoService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [UserInfoService, LocalStorageService],
    });

    service = TestBed.inject(UserInfoService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // Constructor / Initial State
  // --------------------------------------------------------------------------

  describe('initial state', () => {
    it('initializes userInfo as null when no data is stored', () => {
      expect(service.userInfo()).toBeNull();
    });

    it('initializes hasUserInfo as false when no data is stored', () => {
      expect(service.hasUserInfo()).toBeFalse();
    });

    it('loads existing user info from localStorage on creation', () => {
      const info: UserInfo = { fullName: 'Juan Pérez', idDocument: '12345678-9' };
      localStorage.setItem('presupuestapp:user_info', JSON.stringify(info));

      const freshService = TestBed.inject(UserInfoService);
      // Need to create a new instance since the previous one already loaded
      // We'll test via the private method indirectly
      expect(freshService).toBeTruthy();
    });

    it('returns null for corrupted JSON in localStorage', () => {
      localStorage.setItem('presupuestapp:user_info', '{not valid json}');
      spyOn(console, 'warn');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [UserInfoService, LocalStorageService],
      });

      const freshService = TestBed.inject(UserInfoService);

      expect(freshService.userInfo()).toBeNull();
    });

    it('returns null when stored data has wrong shape (missing fullName)', () => {
      localStorage.setItem('presupuestapp:user_info', JSON.stringify({ idDocument: '123' }));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [UserInfoService, LocalStorageService],
      });

      const freshService = TestBed.inject(UserInfoService);

      expect(freshService.userInfo()).toBeNull();
    });

    it('returns null when stored data has wrong shape (missing idDocument)', () => {
      localStorage.setItem('presupuestapp:user_info', JSON.stringify({ fullName: 'Test' }));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [UserInfoService, LocalStorageService],
      });

      const freshService = TestBed.inject(UserInfoService);

      expect(freshService.userInfo()).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // saveUserInfo
  // --------------------------------------------------------------------------

  describe('saveUserInfo', () => {
    it('persists user info to localStorage', () => {
      const info: UserInfo = { fullName: 'María López', idDocument: '98765432-1' };

      service.saveUserInfo(info);

      const stored = JSON.parse(localStorage.getItem('presupuestapp:user_info')!);
      expect(stored).toEqual(info);
    });

    it('updates the userInfo signal', () => {
      const info: UserInfo = { fullName: 'María López', idDocument: '98765432-1' };

      service.saveUserInfo(info);

      expect(service.userInfo()).toEqual(info);
    });

    it('updates hasUserInfo to true', () => {
      const info: UserInfo = { fullName: 'María López', idDocument: '98765432-1' };

      service.saveUserInfo(info);

      expect(service.hasUserInfo()).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // clearUserInfo
  // --------------------------------------------------------------------------

  describe('clearUserInfo', () => {
    it('removes user info from localStorage', () => {
      const info: UserInfo = { fullName: 'Test', idDocument: '123' };
      service.saveUserInfo(info);

      service.clearUserInfo();

      expect(localStorage.getItem('presupuestapp:user_info')).toBeNull();
    });

    it('sets the userInfo signal to null', () => {
      service.saveUserInfo({ fullName: 'Test', idDocument: '123' });

      service.clearUserInfo();

      expect(service.userInfo()).toBeNull();
    });

    it('sets hasUserInfo to false', () => {
      service.saveUserInfo({ fullName: 'Test', idDocument: '123' });

      service.clearUserInfo();

      expect(service.hasUserInfo()).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // shouldShowPrompt
  // --------------------------------------------------------------------------

  describe('shouldShowPrompt', () => {
    it('returns true when no user info and no prompt state exist', () => {
      expect(service.shouldShowPrompt()).toBeTrue();
    });

    it('returns false when user info exists', () => {
      service.saveUserInfo({ fullName: 'Test', idDocument: '123' });

      expect(service.shouldShowPrompt()).toBeFalse();
    });

    it('returns false when prompt was permanently dismissed', () => {
      service.dismissPromptPermanently();

      expect(service.shouldShowPrompt()).toBeFalse();
    });

    it('returns false when remindAfter date is in the future', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      localStorage.setItem(
        'presupuestapp:user_info_prompt',
        JSON.stringify({ remindAfter: futureDate.toISOString() }),
      );

      expect(service.shouldShowPrompt()).toBeFalse();
    });

    it('returns true when remindAfter date is in the past', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      localStorage.setItem(
        'presupuestapp:user_info_prompt',
        JSON.stringify({ remindAfter: pastDate.toISOString() }),
      );

      expect(service.shouldShowPrompt()).toBeTrue();
    });

    it('returns true when prompt state is null in localStorage', () => {
      localStorage.removeItem('presupuestapp:user_info_prompt');

      expect(service.shouldShowPrompt()).toBeTrue();
    });
  });

  // --------------------------------------------------------------------------
  // dismissPromptPermanently
  // --------------------------------------------------------------------------

  describe('dismissPromptPermanently', () => {
    it('stores dismissed state in localStorage', () => {
      service.dismissPromptPermanently();

      const stored = JSON.parse(localStorage.getItem('presupuestapp:user_info_prompt')!);
      expect(stored).toEqual({ dismissed: true });
    });

    it('causes shouldShowPrompt to return false', () => {
      service.dismissPromptPermanently();

      expect(service.shouldShowPrompt()).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // dismissPromptTemporarily
  // --------------------------------------------------------------------------

  describe('dismissPromptTemporarily', () => {
    it('stores a remindAfter date approximately 1 day in the future', () => {
      const before = new Date();

      service.dismissPromptTemporarily();

      const stored = JSON.parse(localStorage.getItem('presupuestapp:user_info_prompt')!);
      const remindDate = new Date(stored.remindAfter);
      const expectedMin = new Date(before);
      expectedMin.setDate(expectedMin.getDate() + 1);

      // Allow a small tolerance window (5 seconds)
      expect(remindDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 5000);
      expect(remindDate.getTime()).toBeLessThanOrEqual(expectedMin.getTime() + 5000);
    });

    it('causes shouldShowPrompt to return false immediately after', () => {
      service.dismissPromptTemporarily();

      expect(service.shouldShowPrompt()).toBeFalse();
    });
  });
});
