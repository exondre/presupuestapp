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
  private readonly confirmedDuplicates = signal<PotentialDuplicate[]>([]);

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
    const filteredReady = this.readyToImport().filter((e) => !ignoredEntries.has(e));
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
      year: 'numeric',
    });
  }
}
