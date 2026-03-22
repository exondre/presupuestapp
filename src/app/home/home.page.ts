import { Component, ViewChild, computed, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  NavController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { repeatOutline } from 'ionicons/icons';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import {
  EntryCreation,
  EntryData,
  EntryType,
} from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';
import { UtilsService } from '../shared/services/utils.service';
import { resolveInstallmentDisplayDetailsFromEntry } from '../shared/utils/recurrence-installment-display.util';

interface HomeRecentEntryViewModel extends EntryData {
  dateLabel: string;
  installmentLabel?: string;
  isRecurring: boolean;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonContent,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    NewEntryModalComponent,
  ],
})
export class HomePage {
  private static readonly chileTimeZone = 'America/Santiago';

  @ViewChild('newEntryModal')
  private modal?: NewEntryModalComponent;

  private readonly entryService = inject(EntryService);
  private readonly utilsService = inject(UtilsService);
  private readonly navController = inject(NavController);
  private readonly recentDateFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: HomePage.chileTimeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  protected readonly entryType = EntryType;

  constructor() {
    addIcons({
      'repeat-outline': repeatOutline,
    });
  }

  /** Localized label for the current month (e.g. "marzo 2026"). */
  protected readonly currentMonthLabel = computed(() => {
    this.entryService.entriesSignal();
    return this.utilsService.buildMonthLabelFromDate(new Date());
  });

  /** Formatted total income for the current month. */
  protected readonly incomeLabel = computed(() => {
    const entries = this.entryService.entriesSignal();
    const total = this.entryService.calculateMonthlyIncomeTotal(entries);
    return this.utilsService.formatAmount(total);
  });

  /** Formatted total expenses for the current month. */
  protected readonly expenseLabel = computed(() => {
    const entries = this.entryService.entriesSignal();
    const total = this.entryService.calculateMonthlyExpenseTotal(entries);
    return this.utilsService.formatAmount(total);
  });

  /** Formatted balance for the current month. */
  protected readonly balanceLabel = computed(() => {
    const entries = this.entryService.entriesSignal();
    const total = this.entryService.calculateMonthlyBalance(entries);
    return this.utilsService.formatAmount(total);
  });

  /** Most recent entries for the current month (up to 5). */
  protected readonly recentEntries = computed(() => {
    const now = new Date();
    const entries = this.entryService
      .filterEntriesByMonth(now)
      .filter((entry) => {
        const occurrenceDate = new Date(entry.date);
        if (Number.isNaN(occurrenceDate.getTime())) {
          return false;
        }

        return occurrenceDate.getTime() <= now.getTime();
      });

    return [...entries]
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, 5)
      .map((entry) => this.buildRecentEntryViewModel(entry));
  });

  /**
   * Formats an entry amount using the shared utility.
   *
   * @param entry The entry whose amount should be formatted.
   * @returns The formatted amount string.
   */
  protected formatEntryAmount(entry: EntryData): string {
    return this.utilsService.formatAmount(entry.amount);
  }

  /**
   * Builds the view model used to render a recent entry row.
   *
   * @param entry Entry to transform.
   * @returns A home-specific recent entry view model.
   */
  private buildRecentEntryViewModel(entry: EntryData): HomeRecentEntryViewModel {
    return {
      ...entry,
      dateLabel: this.formatRecentDate(entry.date),
      installmentLabel: resolveInstallmentDisplayDetailsFromEntry(entry)?.installmentLabel,
      isRecurring: entry.recurrence?.frequency === 'monthly',
    };
  }

  /**
   * Formats an ISO date into a compact localized date-time label.
   *
   * @param isoDate ISO date string to format.
   * @returns Formatted date-time label in Spanish locale.
   */
  private formatRecentDate(isoDate: string): string {
    const parsedDate = new Date(isoDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return this.recentDateFormatter
      .format(parsedDate)
      .replace('.', '')
      .toLowerCase();
  }

  /**
   * Receives the data emitted when a new entry has been saved.
   *
   * @param entry Entry data captured through the modal.
   */
  protected handleEntrySaved(entry: EntryCreation): void {
    this.entryService.addEntry(entry);
  }

  /**
   * Opens the entry modal optionally locking the type selection.
   *
   * @param type Entry type to preset or null to allow selection.
   */
  protected openEntryModal(type: EntryType | null): void {
    const modal = this.modal;
    if (!modal) {
      return;
    }

    modal.setPresetType(type);
    modal.open();
  }

  /** Navigates to the Balance tab. */
  protected navigateToBalance(): void {
    this.navController.navigateForward('/tabs/balance');
  }
}
