import { TestBed } from '@angular/core/testing';

import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [LocalStorageService],
    });

    service = TestBed.inject(LocalStorageService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // setItem
  // --------------------------------------------------------------------------

  describe('setItem', () => {
    it('stores a serialized value in localStorage when storage is supported', () => {
      service.setItem('test-key', { foo: 'bar' });

      expect(localStorage.getItem('test-key')).toBe('{"foo":"bar"}');
    });

    it('stores a serialized value in memoryStorage when localStorage is not supported', () => {
      (service as any).isStorageSupported = false;

      service.setItem('mem-key', 42);

      expect((service as any).memoryStorage.get('mem-key')).toBe('42');
      // localStorage should not have been touched
      expect(localStorage.getItem('mem-key')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getItem
  // --------------------------------------------------------------------------

  describe('getItem', () => {
    it('returns the parsed value from localStorage when the key exists', () => {
      localStorage.setItem('existing-key', '"hello"');

      const result = service.getItem<string>('existing-key');

      expect(result).toBe('hello');
    });

    it('returns null from localStorage when the key does not exist', () => {
      const result = service.getItem<string>('missing-key');

      expect(result).toBeNull();
    });

    it('returns the parsed value from memoryStorage when the key exists', () => {
      (service as any).isStorageSupported = false;
      (service as any).memoryStorage.set('mem-key', '"world"');

      const result = service.getItem<string>('mem-key');

      expect(result).toBe('world');
    });

    it('returns null from memoryStorage when the key does not exist (covers ?? null branch)', () => {
      (service as any).isStorageSupported = false;
      // 'absent-key' is intentionally not set so Map.get() returns undefined

      const result = service.getItem<string>('absent-key');

      expect(result).toBeNull();
    });

    it('returns null and logs a warning when the stored value is invalid JSON', () => {
      localStorage.setItem('bad-json-key', '{not valid json}');
      spyOn(console, 'warn');

      const result = service.getItem<object>('bad-json-key');

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('bad-json-key'),
        jasmine.anything(),
      );
    });
  });

  // --------------------------------------------------------------------------
  // removeItem
  // --------------------------------------------------------------------------

  describe('removeItem', () => {
    it('removes the item from localStorage when storage is supported', () => {
      localStorage.setItem('remove-key', '"value"');

      service.removeItem('remove-key');

      expect(localStorage.getItem('remove-key')).toBeNull();
    });

    it('removes the item from memoryStorage when localStorage is not supported', () => {
      (service as any).isStorageSupported = false;
      (service as any).memoryStorage.set('mem-remove-key', '"value"');

      service.removeItem('mem-remove-key');

      expect((service as any).memoryStorage.has('mem-remove-key')).toBeFalse();
    });
  });

  // --------------------------------------------------------------------------
  // gAccessToken setter
  // --------------------------------------------------------------------------

  describe('gAccessToken setter', () => {
    it('calls removeItem when value is null', () => {
      const removeItemSpy = spyOn(service, 'removeItem');

      service.gAccessToken = null;

      expect(removeItemSpy).toHaveBeenCalledWith('presupuestapp:gaccess_token');
    });

    it('calls setItem when value is a non-null string', () => {
      const setItemSpy = spyOn(service, 'setItem');

      service.gAccessToken = 'my-token';

      expect(setItemSpy).toHaveBeenCalledWith('presupuestapp:gaccess_token', 'my-token');
    });
  });

  // --------------------------------------------------------------------------
  // gAccessToken getter
  // --------------------------------------------------------------------------

  describe('gAccessToken getter', () => {
    it('returns the stored token', () => {
      service.gAccessToken = 'stored-token';

      expect(service.gAccessToken).toBe('stored-token');
    });

    it('returns null when no token has been stored', () => {
      expect(service.gAccessToken).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // detectLocalStorageSupport (private)
  // --------------------------------------------------------------------------

  describe('detectLocalStorageSupport', () => {
    it('returns true in a normal browser environment where localStorage is available', () => {
      const result = (service as any).detectLocalStorageSupport();

      expect(result).toBeTrue();
    });

    it('returns false when localStorage.setItem throws (e.g. private-browsing quota error)', () => {
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError');

      const result = (service as any).detectLocalStorageSupport();

      expect(result).toBeFalse();
    });

    it('returns false when window.localStorage is falsy', () => {
      const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

      Object.defineProperty(window, 'localStorage', {
        value: null,
        configurable: true,
        writable: true,
      });

      const result = (service as any).detectLocalStorageSupport();

      // Restore the original descriptor
      if (originalLocalStorage) {
        Object.defineProperty(window, 'localStorage', originalLocalStorage);
      }

      expect(result).toBeFalse();
    });
  });
});
