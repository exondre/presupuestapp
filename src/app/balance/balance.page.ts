import { Component, DestroyRef, computed, CUSTOM_ELEMENTS_SCHEMA, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/common';
import { AlertController, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItemDivider, IonItemGroup, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, informationCircleOutline } from 'ionicons/icons';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryCreation, EntryData, EntryType } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';
import {
  BalanceItemComponent,
  BalanceItemViewModel,
} from './balance-item.component';

interface BalanceDayGroup {
  key: string;
  label: string;
  items: BalanceItemViewModel[];
}

/**
 * Displays the balance sheet with the entries grouped by day using Chile's timezone.
 */
@Component({
  selector: 'app-balance',
  standalone: true,
  templateUrl: './balance.page.html',
  styleUrls: ['./balance.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonLabel,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonIcon,
    BalanceItemComponent,
    IonFab,
    IonFabButton,
    NewEntryModalComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BalancePage {
  @ViewChild('newEntryModal')
  private modal?: NewEntryModalComponent;

  private static readonly chileTimeZone = 'America/Santiago';

  private readonly dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BalancePage.chileTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  private readonly dayLabelFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: BalancePage.chileTimeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  private readonly amountFormatter = new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  private readonly monthLabelFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: BalancePage.chileTimeZone,
    month: 'long',
    year: 'numeric',
  });

  private readonly entryService = inject(EntryService);

  private readonly alertController = inject(AlertController);

  private readonly navController = inject(NavController);

  private readonly activatedRoute = inject(ActivatedRoute);

  private readonly destroyRef = inject(DestroyRef);

  private readonly referenceMonth = signal<Date | null>(null);

  protected readonly filteredEntries = computed(() => {
    const entries = this.entryService.entriesSignal();
    const referenceMonth = this.referenceMonth();
    if (!referenceMonth) {
      return entries;
    }

    return this.entryService.filterEntriesByMonth(referenceMonth);
  });

  protected readonly groups = computed(() =>
    this.buildGroups(this.filteredEntries()),
  );
  protected readonly displayedMonthSummary = computed(() => {
    const entries = this.entryService.entriesSignal();
    const referenceDate = this.referenceMonth() ?? new Date();

    const expensesTotal = this.entryService.calculateMonthlyExpenseTotal(
      entries,
      referenceDate,
    );
    const incomesTotal = this.entryService.calculateMonthlyIncomeTotal(
      entries,
      referenceDate,
    );
    const monthlyBalance = this.entryService.calculateMonthlyBalance(
      entries,
      referenceDate,
    );

    return {
      expensesLabel: this.formatAmount(expensesTotal),
      incomesLabel: this.formatAmount(incomesTotal),
      balanceLabel: this.formatAmount(monthlyBalance),
      subtitle: this.buildMonthSubtitle(referenceDate),
    };
  });
  protected readonly hasReferenceMonth = computed(
    () => this.referenceMonth() !== null,
  );
  protected readonly monthScopeLabel = computed(() =>
    this.hasReferenceMonth() ? 'mes seleccionado' : 'mes en curso',
  );

  protected readonly pageTitle = computed(() =>{
    const referenceMonth = this.referenceMonth();
    if (!referenceMonth) {
      return 'Balance';
    }

    return this.buildMonthSubtitle(referenceMonth);
  })

  constructor() {
    addIcons({
      'information-circle-outline': informationCircleOutline,
      'add-outline': addOutline,
      'chevron-back-outline': chevronBackOutline,
    });

    this.activatedRoute.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const referenceMonth = this.resolveReferenceMonth(
          params.get('year'),
          params.get('month'),
        );

        this.setReferenceMonth(referenceMonth);
      });
  }

  /**
   * Handles the deletion request triggered from the entry item.
   *
   * @param entryId Identifier of the entry to remove.
   */
  protected async handleDeleteEntry(entryId: string, requireConfirmation: boolean = true): Promise<void> {
    if (!requireConfirmation) {
      this.entryService.removeEntry(entryId);
      return;
    }

    const alert = await this.alertController.create({
      header: '¿Eliminar transacción?',
      message: 'Esta acción eliminará la transacción de tu registro.',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.entryService.removeEntry(entryId);
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Placeholder for the upcoming edit functionality.
   *
   * @param entryId Identifier of the entry to edit.
   */
  protected handleEditEntry(entryId: string): void {
    void entryId;
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

  /**
   * Navigates back to the previous view on the navigation stack.
   */
  protected handleNavigateBack(): void {
    this.navController.pop();
  }

  /**
   * Updates the reference month used to render the balance.
   *
   * @param referenceMonth Month used as reference or null to fall back to the current month.
   */
  public setReferenceMonth(referenceMonth: Date | null): void {
    if (!referenceMonth) {
      this.referenceMonth.set(null);
      return;
    }

    const normalizedReference = new Date(referenceMonth);
    if (Number.isNaN(normalizedReference.getTime())) {
      this.referenceMonth.set(null);
      return;
    }

    this.referenceMonth.set(normalizedReference);
  }

  /**
   * Creates the balance groups ordered by day and entry recency.
   *
   * @param entries Entries retrieved from the store.
   * @returns The entries grouped by day.
   */
  private buildGroups(entries: EntryData[]): BalanceDayGroup[] {
    const sorted = [...entries].sort(
      (a, b) =>
        this.normalizeToMillis(b.date) - this.normalizeToMillis(a.date),
    );

    const groups: BalanceDayGroup[] = [];

    sorted.forEach((entry) => {
      const occurrenceDate = new Date(entry.date);
      const descriptor = this.createDayDescriptor(occurrenceDate);
      const targetGroup = this.ensureGroup(groups, descriptor);

      targetGroup.items.push({
        id: entry.id,
        amountLabel: this.formatAmount(entry.amount),
        description: this.resolveDescription(entry.description),
        timeLabel: this.formatTime(occurrenceDate),
        timestamp: occurrenceDate.getTime(),
        type: entry.type,
      });
    });

    return groups.map((group) => ({
      ...group,
      items: group.items.sort((a, b) => b.timestamp - a.timestamp),
    }));
  }

  /**
   * Finds the matching group or creates a new one when necessary.
   *
   * @param groups Current day groups.
   * @param descriptor Descriptor referencing the target day.
   * @returns An existing or newly created group.
   */
  private ensureGroup(
    groups: BalanceDayGroup[],
    descriptor: { key: string; label: string },
  ): BalanceDayGroup {
    const located = groups.find((group) => group.key === descriptor.key);
    if (located) {
      return located;
    }

    const newGroup: BalanceDayGroup = {
      key: descriptor.key,
      label: descriptor.label,
      items: [],
    };
    groups.push(newGroup);
    return newGroup;
  }

  /**
   * Generates the day descriptor for the provided date on Chile's timezone.
   *
   * @param date Date to transform.
   * @returns The group key and label for the specified date.
   */
  private createDayDescriptor(date: Date): { key: string; label: string } {
    const baseParts = new Map(
      this.dayKeyFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const labelParts = new Map(
      this.dayLabelFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );

    const year = baseParts.get('year') ?? '0000';
    const month = baseParts.get('month') ?? '01';
    const day = baseParts.get('day') ?? '01';

    const weekday =
      (labelParts.get('weekday') ?? '').replace('.', '').toLowerCase();
    const monthName =
      (labelParts.get('month') ?? '').replace('.', '').toLowerCase();

    return {
      key: `${year}-${month}-${day}`,
      label: `${weekday} ${day} ${monthName} ${year}`,
    };
  }

  /**
   * Resolves the reference month from the provided query parameter values.
   *
   * @param yearParam Query parameter containing the year.
   * @param monthParam Query parameter containing the month index starting at 1.
   * @returns A date representing the reference month or null when the parameters are invalid.
   */
  private resolveReferenceMonth(
    yearParam: string | null,
    monthParam: string | null,
  ): Date | null {
    if (!yearParam || !monthParam) {
      return null;
    }

    const year = Number.parseInt(yearParam, 10);
    const month = Number.parseInt(monthParam, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return null;
    }

    if (month < 1 || month > 12) {
      return null;
    }

    return new Date(year, month - 1, 1);
  }

  /**
   * Converts the provided ISO string into milliseconds since epoch.
   *
   * @param iso ISO date representation.
   * @returns Milliseconds elapsed since the Unix epoch.
   */
  private normalizeToMillis(iso: string): number {
    const parsed = new Date(iso).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Formats the amount into the required Chilean peso representation.
   *
   * @param amount Amount to format.
   * @returns A formatted CLP amount string.
   */
  private formatAmount(amount: number): string {
    return `$${this.amountFormatter.format(amount).replace(/\u00a0/g, ' ')}`;
  }

  /**
   * Formats the occurrence time using Chile's timezone.
   *
   * @param date Date used to extract the time.
   * @returns The formatted time string.
   */
  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: BalancePage.chileTimeZone,
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(date)
      .toLowerCase();
  }

  /**
   * Ensures the description fallback when no text is available.
   *
   * @param description Optional entry description.
   * @returns The description or a default fallback.
   */
  private resolveDescription(description: string | undefined): string {
    const trimmed = (description ?? '').trim();
    return trimmed.length > 0 ? trimmed : 'transacción';
  }

  /**
   * Creates the subtitle shown in the monthly summary card using the current month and year.
   *
   * @param date Date used to obtain the month descriptor.
   * @returns The subtitle describing the month and year.
   */
  private buildMonthSubtitle(date: Date): string {
    const parts = new Map(
      this.monthLabelFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const month = parts.get('month') ?? '';
    const year = parts.get('year') ?? '';
    const monthDescriptor =
      month.length > 0 ? `${month} ${year}`.trim() : year;

    return monthDescriptor.length > 0
      ? `${monthDescriptor}`
      : '';
  }
}
