import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
  buildMonthDetailData,
  buildMonthKey,
  buildTrendsData,
  MonthDetailData,
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
export class TrendsPage implements AfterViewInit {
  private readonly entryService = inject(EntryService);
  private readonly utilsService = inject(UtilsService);

  @ViewChild('chartScroll')
  private chartScroll?: ElementRef<HTMLElement>;

  private hasInitializedView = false;
  private hasPositionedInitialChartScroll = false;
  private initialChartScrollFrameId: number | null = null;

  /** Currently selected month key for the detail panel. */
  protected readonly selectedMonthKey = signal<string>(buildMonthKey(new Date()));

  constructor() {
    addIcons({ 'trending-up-outline': trendingUpOutline });

    effect(() => {
      const data = this.trendsData();
      if (data.maxAmount <= 0) return;

      this.scheduleInitialChartScroll();
    });
  }

  /**
   * Starts the one-time initial chart positioning once Angular has rendered the view.
   */
  ngAfterViewInit(): void {
    this.hasInitializedView = true;
    this.scheduleInitialChartScroll();
  }

  /** Computed trends chart data, reacts to entry changes. */
  protected readonly trendsData = computed((): TrendsChartData => {
    const now = new Date();
    const previousMonthsCount = now.getMonth();
    const monthDates = previousMonthsCount <= 1
      ? [
        new Date(now.getFullYear(), now.getMonth() - 2, 1),
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
        new Date(now.getFullYear(), now.getMonth(), 1),
      ]
      : Array.from({ length: previousMonthsCount + 1 }, (_, index) => (
        new Date(now.getFullYear(), index, 1)
      ));
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

  /** Detail data for the selected month. */
  protected readonly selectedMonthDetail = computed((): MonthDetailData | null => {
    const monthKey = this.selectedMonthKey();
    if (!monthKey) return null;

    const currentKey = buildMonthKey(new Date());
    const isFuture = monthKey > currentKey;

    const allEntries = this.entryService.entriesSignal();
    let monthEntries: EntryData[] = [];

    if (!isFuture) {
      const parsed = monthKey.split('-');
      const year = parseInt(parsed[0], 10);
      const month = parseInt(parsed[1], 10);
      const refDate = new Date(year, month - 1, 15);
      monthEntries = this.entryService.filterEntriesByMonth(refDate);
    }

    return buildMonthDetailData(monthKey, monthEntries, allEntries, currentKey);
  });

  /**
   * Selects a month to display its detail panel.
   *
   * @param monthKey The YYYY-MM key of the month to select.
   */
  protected selectMonth(monthKey: string): void {
    this.selectedMonthKey.set(monthKey);
  }

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

  /**
   * Schedules the initial chart scroll when the chart exists and contains data.
   */
  private scheduleInitialChartScroll(): void {
    if (
      !this.hasInitializedView ||
      this.hasPositionedInitialChartScroll ||
      this.initialChartScrollFrameId !== null ||
      !this.hasData()
    ) {
      return;
    }

    this.initialChartScrollFrameId = window.requestAnimationFrame(() => {
      this.initialChartScrollFrameId = null;
      this.positionInitialChartScroll();
    });
  }

  /**
   * Centers the current month in the horizontal chart on the first component render.
   */
  private positionInitialChartScroll(): void {
    if (this.hasPositionedInitialChartScroll) return;

    const chartScrollEl = this.chartScroll?.nativeElement;
    const currentMonthEl = chartScrollEl?.querySelector<HTMLElement>('.trends-month--current');
    if (!chartScrollEl || !currentMonthEl) return;

    const targetLeft = currentMonthEl.offsetLeft
      - ((chartScrollEl.clientWidth - currentMonthEl.offsetWidth) / 2);

    chartScrollEl.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'auto',
    });
    this.hasPositionedInitialChartScroll = true;
  }
}
