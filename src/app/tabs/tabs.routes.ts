import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('../home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'home/movement/:entryId',
        loadComponent: () =>
          import('../movement-detail/movement-detail.page').then(
            (m) => m.MovementDetailPage,
          ),
      },
      {
        path: 'balance',
        loadComponent: () =>
          import('../balance/balance.page').then((m) => m.BalancePage),
      },
      {
        path: 'balance/movement/:entryId',
        loadComponent: () =>
          import('../movement-detail/movement-detail.page').then(
            (m) => m.MovementDetailPage,
          ),
      },
      {
        path: 'trends',
        loadComponent: () =>
          import('../trends/trends.page').then((m) => m.TrendsPage),
      },
      {
        path: 'trends/movement/:entryId',
        loadComponent: () =>
          import('../movement-detail/movement-detail.page').then(
            (m) => m.MovementDetailPage,
          ),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('../history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'history/detail/:year/:month',
        loadComponent: () =>
          import('../balance/balance.page').then(
            (m) => m.BalancePage,
          ),
      },
      {
        path: 'history/detail/:year/:month/movement/:entryId',
        loadComponent: () =>
          import('../movement-detail/movement-detail.page').then(
            (m) => m.MovementDetailPage,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('../settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full',
  },
];
