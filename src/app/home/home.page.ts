import { Component, ViewChild, computed, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  NavController,
} from '@ionic/angular/standalone';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import {
  EntryCreation,
  EntryData,
  EntryType,
} from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';
import { UtilsService } from '../shared/services/utils.service';

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
    NewEntryModalComponent,
  ],
})
export class HomePage {
  @ViewChild('newEntryModal')
  private modal?: NewEntryModalComponent;

  private readonly entryService = inject(EntryService);
  private readonly utilsService = inject(UtilsService);
  private readonly navController = inject(NavController);

  protected readonly entryType = EntryType;

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
    const entries = this.entryService.filterEntriesByMonth();
    return [...entries]
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, 5);
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
