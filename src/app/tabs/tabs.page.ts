import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { homeOutline, statsChartOutline, cogOutline, home, statsChart, cog } from 'ionicons/icons';
import { MetaThemeColorService } from '../shared/services/meta-theme-color.service'; // ajusta la ruta si es distinta

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  private readonly metaTheme = inject(MetaThemeColorService);

  private readonly themeColorByTab: Record<string, string> = {
    home: '#ffffff',
    balance: '#f7f7f7',
    settings: '#f7f7f7',
  };

  private applyThemeForTab(tab?: string) {
    const color = (tab && this.themeColorByTab[tab]) ? this.themeColorByTab[tab] : '#ffffff';
    this.metaTheme.set(color);
  }

  selectedTab = 'home';

  constructor() {
    addIcons({ homeOutline, statsChartOutline, cogOutline, home, statsChart, cog });
    this.applyThemeForTab(this.selectedTab);
  }

  setSelectedTab(event: { tab: string }) {
    this.selectedTab = event.tab;
    this.applyThemeForTab(event.tab);
  }
}
