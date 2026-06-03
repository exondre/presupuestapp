import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  inject,
} from '@angular/core';
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  calendarOutline,
  refreshOutline,
  removeCircleOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import {
  MergeResult,
  ParsedEntry,
  PotentialDuplicate,
  SelfTransferEntry,
} from '../../services/external-entry-import.service';
import { UtilsService } from '../../services/utils.service';

/**
 * Payload emitted when the user confirms the import.
 */
export interface ImportConfirmation {
  entriesToImport: ParsedEntry[];
  confirmedDuplicates: PotentialDuplicate[];
}

/**
 * A full-screen modal that presents the merge result from an Excel import,
 * allowing the user to review potential duplicates and decide which entries
 * to import.
 */
@Component({
  selector: 'app-import-review-modal',
  standalone: true,
  templateUrl: './import-review-modal.component.html',
  styleUrls: ['./import-review-modal.component.scss'],
  imports: [
    IonAccordion,
    IonAccordionGroup,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonText,
    IonTitle,
    IonToolbar,
  ],
})
export class ImportReviewModalComponent {
  /** Controls modal presentation state. */
  readonly isOpen = input<boolean>(false);

  /** Element used for iOS card-style presentation. */
  readonly presentingElement = input<HTMLElement | null>(null);

  /** Initial merge result to populate the review buckets. */
  readonly mergeResult = input.required<MergeResult>();

  /** Emitted with the final list of entries the user approved for import and confirmed duplicates. */
  readonly importConfirmed = output<ImportConfirmation>();

  /** Emitted when the modal is dismissed without importing. */
  readonly dismissed = output<void>();

  protected readonly utils = inject(UtilsService);

  protected readonly potentialDuplicates = signal<PotentialDuplicate[]>([]);
  protected readonly discardedEntries = signal<ParsedEntry[]>([]);
  protected readonly readyToImport = signal<ParsedEntry[]>([]);
  protected readonly selfTransfers = signal<SelfTransferEntry[]>([]);
  protected readonly deferredEntries = signal<Set<ParsedEntry>>(new Set());
  private readonly confirmedDuplicates = signal<PotentialDuplicate[]>([]);
  private static readonly chileTimeZone = 'America/Santiago';

  protected readonly readyCount = computed(() => this.readyToImport().length);
  protected readonly potentialCount = computed(() => this.potentialDuplicates().length);
  protected readonly discardedCount = computed(() => this.discardedEntries().length);
  protected readonly selfTransferCount = computed(() => this.selfTransfers().length);
  protected readonly ignoredSelfTransferCount = computed(
    () => this.selfTransfers().filter((st) => st.ignored).length,
  );
  protected readonly effectiveReadyCount = computed(
    () => this.readyToImport().length - this.ignoredSelfTransferCount(),
  );

  /** Entries in readyToImport that are not self-transfers (shown in the accordion). */
  protected readonly displayReadyToImport = computed(() => {
    const selfTransferEntries = new Set(this.selfTransfers().map((st) => st.entry));
    return this.readyToImport().filter((e) => !selfTransferEntries.has(e));
  });

  constructor() {
    addIcons({
      'add-circle-outline': addCircleOutline,
      'remove-circle-outline': removeCircleOutline,
      'close-circle-outline': closeCircleOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'calendar-outline': calendarOutline,
      'swap-horizontal-outline': swapHorizontalOutline,
      'refresh-outline': refreshOutline,
    });

    effect(() => {
      const result = this.mergeResult();
      this.potentialDuplicates.set([...result.potentialDuplicates]);
      this.discardedEntries.set([...result.exactDuplicates]);
      this.readyToImport.set([...result.readyToImport]);
      this.selfTransfers.set([...(result.selfTransfers ?? []).map((st) => ({ ...st }))]);
      this.confirmedDuplicates.set([]);
      this.deferredEntries.set(new Set());
    });
  }

  /**
   * Moves a potential duplicate to the ready-to-import bucket.
   *
   * @param duplicate The potential duplicate to reclassify as new.
   */
  protected markAsNew(duplicate: PotentialDuplicate): void {
    this.potentialDuplicates.update((list) =>
      list.filter((d) => d !== duplicate),
    );
    this.readyToImport.update((list) => [...list, duplicate.importedEntry]);
  }

  /**
   * Moves a potential duplicate to the discarded bucket.
   *
   * @param duplicate The potential duplicate to discard.
   */
  protected markAsDuplicate(duplicate: PotentialDuplicate): void {
    this.potentialDuplicates.update((list) =>
      list.filter((d) => d !== duplicate),
    );
    this.discardedEntries.update((list) => [...list, duplicate.importedEntry]);
    this.confirmedDuplicates.update((list) => [...list, duplicate]);
  }

  /**
   * Moves a discarded entry back to the ready-to-import bucket.
   *
   * @param entry The entry to restore.
   */
  protected restoreFromDiscarded(entry: ParsedEntry): void {
    this.discardedEntries.update((list) => list.filter((e) => e !== entry));
    this.readyToImport.update((list) => [...list, entry]);
  }

  /**
   * Moves a ready-to-import entry to the discarded bucket.
   *
   * @param entry The entry to remove from the import list.
   */
  protected removeFromReady(entry: ParsedEntry): void {
    this.readyToImport.update((list) => list.filter((e) => e !== entry));
    this.discardedEntries.update((list) => [...list, entry]);
    this.deferredEntries.update((entries) => {
      const next = new Set(entries);
      next.delete(entry);
      return next;
    });
  }

  /**
   * Toggles whether a ready entry should be accounted in the next month.
   *
   * @param entry The ready entry to toggle.
   */
  protected toggleDeferredToNextMonth(entry: ParsedEntry): void {
    this.deferredEntries.update((entries) => {
      const next = new Set(entries);
      if (next.has(entry)) {
        next.delete(entry);
      } else {
        next.add(entry);
      }
      return next;
    });
  }

  /**
   * Checks whether a ready entry will be accounted in the next month.
   *
   * @param entry The entry to inspect.
   * @returns True when the entry is marked for next-month accounting.
   */
  protected isDeferredToNextMonth(entry: ParsedEntry): boolean {
    return this.deferredEntries().has(entry);
  }

  /**
   * Toggles the ignored state of a self-transfer entry.
   *
   * @param selfTransfer The self-transfer entry to toggle.
   */
  protected toggleSelfTransfer(selfTransfer: SelfTransferEntry): void {
    this.selfTransfers.update((list) =>
      list.map((st) => (st === selfTransfer ? { ...st, ignored: !st.ignored } : st)),
    );
  }

  /**
   * Emits the final list of approved entries (excluding ignored self-transfers) and dismisses the modal.
   */
  protected confirmImport(): void {
    const ignoredEntries = new Set(
      this.selfTransfers()
        .filter((st) => st.ignored)
        .map((st) => st.entry),
    );
    const filteredReady = this.readyToImport()
      .filter((e) => !ignoredEntries.has(e))
      .map((entry) => this.applyAccountingDateOverride(entry));
    this.importConfirmed.emit({
      entriesToImport: [...filteredReady],
      confirmedDuplicates: [...this.confirmedDuplicates()],
    });
  }

  /**
   * Handles the modal dismiss event to reset state.
   */
  protected onDidDismiss(): void {
    this.dismissed.emit();
  }

  /**
   * Formats a date string for display in the review list.
   *
   * @param dateStr ISO date string.
   * @returns Localized date string.
   */
  protected formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      timeZone: ImportReviewModalComponent.chileTimeZone,
      year: 'numeric',
    });
  }

  /**
   * Formats the next accounting date for an imported entry.
   *
   * @param dateStr ISO date string from the imported entry.
   * @returns Localized first day of the next accounting month.
   */
  protected formatNextAccountingDate(dateStr: string): string {
    return this.formatDate(this.getNextMonthAccountingDate(dateStr));
  }

  /**
   * Formats the short imported date that will be appended to the description.
   *
   * @param dateStr ISO date string from the imported entry.
   * @returns Short localized date in dd/mm format.
   */
  protected formatOriginalShortDate(dateStr: string): string {
    const parts = this.getChileDateParts(dateStr);
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`;
  }

  /**
   * Formats the month where an entry currently belongs in accounting terms.
   *
   * @param dateStr ISO date string from the imported entry.
   * @returns Localized month and year label.
   */
  protected formatAccountingMonth(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', {
      month: 'short',
      year: 'numeric',
      timeZone: ImportReviewModalComponent.chileTimeZone,
    });
  }

  /**
   * Returns the ISO date for the first day of the month after the imported date.
   *
   * @param dateStr ISO date string from the imported entry.
   * @returns ISO date string for the next accounting month start.
   */
  protected getNextMonthAccountingDate(dateStr: string): string {
    const parts = this.getChileDateParts(dateStr);
    const nextMonthIndex = parts.month === 12 ? 0 : parts.month;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    return this.createChileLocalDateIso(nextYear, nextMonthIndex, 1);
  }

  /**
   * Applies the next-month accounting override when the entry is marked for it.
   *
   * @param entry The entry approved for import.
   * @returns The original entry or a copied entry with accounting date override.
   */
  private applyAccountingDateOverride(entry: ParsedEntry): ParsedEntry {
    if (!this.isDeferredToNextMonth(entry)) {
      return entry;
    }

    return {
      ...entry,
      date: this.getNextMonthAccountingDate(entry.date),
      description: `${entry.description || 'Sin descripción'} (${this.formatOriginalShortDate(entry.date)})`,
    };
  }

  /**
   * Extracts calendar date parts in the app timezone.
   *
   * @param dateStr ISO date string to read.
   * @returns Year, one-based month and day in America/Santiago.
   */
  private getChileDateParts(dateStr: string): { year: number; month: number; day: number } {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: ImportReviewModalComponent.chileTimeZone,
      year: 'numeric',
    });
    const parts = formatter.formatToParts(new Date(dateStr));
    return {
      day: Number(parts.find((part) => part.type === 'day')?.value),
      month: Number(parts.find((part) => part.type === 'month')?.value),
      year: Number(parts.find((part) => part.type === 'year')?.value),
    };
  }

  /**
   * Creates an ISO instant for midnight in America/Santiago.
   *
   * @param year Full local year.
   * @param monthIndex Zero-based local month index.
   * @param day Local day of month.
   * @returns ISO date string for that local date at midnight.
   */
  private createChileLocalDateIso(year: number, monthIndex: number, day: number): string {
    const offsetMinutes = this.getChileOffsetMinutes(new Date(Date.UTC(year, monthIndex, day, 12)));
    return new Date(Date.UTC(year, monthIndex, day) - offsetMinutes * 60_000).toISOString();
  }

  /**
   * Gets the America/Santiago UTC offset for a date.
   *
   * @param date Date used to resolve daylight saving time.
   * @returns Offset minutes from UTC.
   */
  private getChileOffsetMinutes(date: Date): number {
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: ImportReviewModalComponent.chileTimeZone,
      timeZoneName: 'shortOffset',
    });
    const offset = formatter
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')
      ?.value ?? 'GMT-4';
    const match = /^GMT(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?$/.exec(offset);
    if (!match?.groups) {
      return -240;
    }
    const sign = match.groups['sign'] === '+' ? 1 : -1;
    const hours = Number(match.groups['hours']);
    const minutes = Number(match.groups['minutes'] ?? 0);
    return sign * (hours * 60 + minutes);
  }
}
