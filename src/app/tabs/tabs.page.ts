import { Component, EnvironmentInjector, afterNextRender, inject, signal } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cog,
  cogOutline,
  home,
  homeOutline,
  trendingUp,
  trendingUpOutline,
  time,
  timeOutline,
  wallet,
  walletOutline,
} from 'ionicons/icons';
import { MetaThemeColorService } from '../shared/services/meta-theme-color.service';
import { UserInfoService } from '../shared/services/user-info.service';
import { UserInfoPromptModalComponent } from '../shared/components/user-info-prompt-modal/user-info-prompt-modal.component';
import { UserInfo } from '../shared/models/user-info.model';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, UserInfoPromptModalComponent],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  private readonly metaTheme = inject(MetaThemeColorService);

  private readonly userInfoService = inject(UserInfoService);

  protected readonly isUserInfoPromptOpen = signal(false);

  private readonly themeColorByTab: Record<string, string> = {
    home: '#ffffff',
    balance: '#f7f7f7',
    trends: '#f7f7f7',
    history: '#f7f7f7',
    settings: '#f7f7f7',
  };

  private applyThemeForTab(tab?: string) {
    const color =
      tab && this.themeColorByTab[tab] ? this.themeColorByTab[tab] : '#ffffff';
    this.metaTheme.set(color);
  }

  selectedTab = 'home';

  constructor() {
    addIcons({
      homeOutline,
      walletOutline,
      trendingUpOutline,
      cogOutline,
      home,
      wallet,
      trendingUp,
      cog,
      time,
      timeOutline,
    });
    this.applyThemeForTab(this.selectedTab);

    afterNextRender(() => {
      if (this.userInfoService.shouldShowPrompt()) {
        this.isUserInfoPromptOpen.set(true);
      }
    });
  }

  /**
   * Handles the user saving their personal info from the prompt modal.
   *
   * @param info The user info entered in the form.
   */
  protected handleUserInfoSaved(info: UserInfo): void {
    this.userInfoService.saveUserInfo(info);
    this.isUserInfoPromptOpen.set(false);
  }

  /**
   * Handles the "remind me later" action from the prompt modal.
   */
  protected handleUserInfoRemindLater(): void {
    this.userInfoService.dismissPromptTemporarily();
    this.isUserInfoPromptOpen.set(false);
  }

  /**
   * Handles the "don't ask again" action from the prompt modal.
   */
  protected handleUserInfoDontAskAgain(): void {
    this.userInfoService.dismissPromptPermanently();
    this.isUserInfoPromptOpen.set(false);
  }

  /**
   * Handles the prompt modal being dismissed without explicit action.
   */
  protected handleUserInfoPromptDismissed(): void {
    if (this.isUserInfoPromptOpen()) {
      this.userInfoService.dismissPromptTemporarily();
      this.isUserInfoPromptOpen.set(false);
    }
  }

  setSelectedTab(event: { tab: string }) {
    this.selectedTab = event.tab;
    this.applyThemeForTab(event.tab);
  }
}
