import { Component, computed, inject } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trendingUpOutline } from 'ionicons/icons';
import { EntryData } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';
import { UtilsService } from '../shared/services/utils.service';
import {
  buildMonthKey,
  buildTrendsData,
  TrendMonthData,
  TrendsChartData,
} from '../shared/utils/trends-data.util';

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  month: 'short',
});

const SHORT_YEAR_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  year: '2-digit',
});

@Component({
  selector: 'app-trends',
  templateUrl: './trends.page.html',
  styleUrls: ['./trends.page.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
  ],
})
export class TrendsPage {
  private readonly entryService = inject(EntryService);
  private readonly utilsService = inject(UtilsService);

  constructor() {
    addIcons({ 'trending-up-outline': trendingUpOutline });
  }

  /** Computed trends chart data, reacts to entry changes. */
  protected readonly trendsData = computed((): TrendsChartData => {
    const now = new Date();
    const monthDates = [
      new Date(now.getFullYear(), now.getMonth() - 2, 1),
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      now,
    ];
    const monthEntriesMap = new Map<string, EntryData[]>();
    for (const date of monthDates) {
      const entries = this.entryService.filterEntriesByMonth(date);
      const key = buildMonthKey(date);
      monthEntriesMap.set(key, entries);
    }
    const allEntries = this.entryService.entriesSignal();
    return buildTrendsData(monthEntriesMap, allEntries, now);
  });

  /** Whether there is any data to display. */
  protected readonly hasData = computed(() => {
    const data = this.trendsData();
    return data.maxAmount > 0;
  });

  /**
   * Computes the bar height percentage for a given amount.
   *
   * @param amount The amount to represent.
   * @param maxAmount The maximum amount for scaling.
   * @returns A percentage value (0-100).
   */
  protected barHeight(amount: number, maxAmount: number): number {
    if (maxAmount <= 0) return 0;
    return (amount / maxAmount) * 100;
  }

  /**
   * Formats an amount using the shared utility.
   *
   * @param amount The amount to format.
   * @returns A formatted CLP string.
   */
  protected formatAmount(amount: number): string {
    return this.utilsService.formatAmount(amount);
  }

  /**
   * Builds a short month label like "ene 26".
   *
   * @param month The trend month data.
   * @returns A short localized month label with 2-digit year.
   */
  protected monthLabel(month: TrendMonthData): string {
    const date = new Date(month.year, month.month - 1, 1);
    const m = SHORT_MONTH_FORMATTER.format(date).replace('.', '');
    const y = SHORT_YEAR_FORMATTER.format(date);
    return `${m} ${y}`;
  }
}
