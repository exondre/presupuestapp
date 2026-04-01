import { Injectable, computed, inject, signal } from '@angular/core';

import { LocalStorageService } from './local-storage.service';
import { UserInfo, UserInfoPromptState } from '../models/user-info.model';

/**
 * Manages the user's personal identification data and the prompt dismissal
 * state. All data is persisted exclusively in local storage and never
 * transmitted over the network.
 */
@Injectable({
  providedIn: 'root',
})
export class UserInfoService {
  private static readonly USER_INFO_KEY = 'presupuestapp:user_info';
  private static readonly PROMPT_STATE_KEY = 'presupuestapp:user_info_prompt';
  private static readonly REMIND_LATER_DAYS = 1;

  private readonly localStorageService = inject(LocalStorageService);

  /** Reactive signal holding the current user info, or null when not registered. */
  readonly userInfo = signal<UserInfo | null>(this.loadUserInfo());

  /** Whether the user has registered their personal info. */
  readonly hasUserInfo = computed(() => this.userInfo() !== null);

  /**
   * Persists the provided user info to local storage and updates the reactive signal.
   *
   * @param info Personal identification data to store.
   */
  saveUserInfo(info: UserInfo): void {
    this.localStorageService.setItem(UserInfoService.USER_INFO_KEY, info);
    this.userInfo.set(info);
  }

  /**
   * Removes stored user info from local storage and clears the reactive signal.
   */
  clearUserInfo(): void {
    this.localStorageService.removeItem(UserInfoService.USER_INFO_KEY);
    this.userInfo.set(null);
  }

  /**
   * Determines whether the user info prompt should be presented.
   *
   * The prompt is shown when no user info is registered and the prompt has not
   * been permanently dismissed or temporarily postponed to a future date.
   *
   * @returns True when the prompt should be displayed.
   */
  shouldShowPrompt(): boolean {
    if (this.userInfo() !== null) {
      return false;
    }

    const state = this.loadPromptState();

    if (state === null) {
      return true;
    }

    if ('dismissed' in state && state.dismissed) {
      return false;
    }

    if ('remindAfter' in state) {
      const remindDate = new Date(state.remindAfter);
      return new Date() >= remindDate;
    }

    return true;
  }

  /**
   * Records a permanent dismissal of the user info prompt so it is never
   * shown again.
   */
  dismissPromptPermanently(): void {
    const state: UserInfoPromptState = { dismissed: true };
    this.localStorageService.setItem(UserInfoService.PROMPT_STATE_KEY, state);
  }

  /**
   * Postpones the user info prompt for the configured number of days.
   */
  dismissPromptTemporarily(): void {
    const remindAfter = new Date();
    remindAfter.setDate(remindAfter.getDate() + UserInfoService.REMIND_LATER_DAYS);
    const state: UserInfoPromptState = { remindAfter: remindAfter.toISOString() };
    this.localStorageService.setItem(UserInfoService.PROMPT_STATE_KEY, state);
  }

  /**
   * Loads the stored user info from local storage.
   *
   * @returns The persisted user info or null when absent or invalid.
   */
  private loadUserInfo(): UserInfo | null {
    const stored = this.localStorageService.getItem<UserInfo>(UserInfoService.USER_INFO_KEY);

    if (
      stored !== null &&
      typeof stored === 'object' &&
      typeof stored.fullName === 'string' &&
      typeof stored.idDocument === 'string'
    ) {
      return stored;
    }

    return null;
  }

  /**
   * Loads the prompt dismissal state from local storage.
   *
   * @returns The persisted prompt state or null when absent.
   */
  private loadPromptState(): UserInfoPromptState | null {
    return this.localStorageService.getItem<UserInfoPromptState>(
      UserInfoService.PROMPT_STATE_KEY,
    );
  }
}
