import { Injectable } from '@angular/core';

/**
 * Provides a centralized API to interact with the browser local storage while
 * handling scenarios where the storage might be unavailable.
 */
@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private readonly isStorageSupported = this.detectLocalStorageSupport();

  private readonly memoryStorage = new Map<string, string>();

  /**
   * Stores the provided value under the specified key.
   *
   * @param key Storage key to associate with the value.
   * @param value Value to persist in the storage.
   */
  setItem<T>(key: string, value: T): void {
    const serialized = JSON.stringify(value);
    if (!this.isStorageSupported) {
      this.memoryStorage.set(key, serialized);
      return;
    }

    window.localStorage.setItem(key, serialized);
  }

  /**
   * Retrieves the value stored under the specified key.
   *
   * @param key Storage key associated with the desired value.
   * @returns The parsed value or null when not found.
   */
  getItem<T>(key: string): T | null {
    const serialized = this.isStorageSupported
      ? window.localStorage.getItem(key)
      : this.memoryStorage.get(key) ?? null;

    if (serialized === null) {
      return null;
    }

    try {
      return JSON.parse(serialized) as T;
    } catch (error) {
      console.warn(`Failed to parse local storage item for key "${key}".`, error);
      return null;
    }
  }

  /**
   * Removes the value stored under the specified key.
   *
   * @param key Storage key to clear.
   */
  removeItem(key: string): void {
    if (!this.isStorageSupported) {
      this.memoryStorage.delete(key);
      return;
    }

    window.localStorage.removeItem(key);
  }

  /**
   * Determines whether the browser local storage is available.
   *
   * @returns True when the local storage API can be used safely.
   */
  private detectLocalStorageSupport(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }

      const testKey = '__presupuestapp_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}
