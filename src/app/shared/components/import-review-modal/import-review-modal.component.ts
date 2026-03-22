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
  private readonly confirmedDuplicates = signal<PotentialDuplicate[]>([]);

  protected readonly readyCount = computed(() => this.readyToImport().length);
  protected readonly potentialCount = computed(() => this.potentialDuplicates().length);
  protected readonly discardedCount = computed(() => this.discardedEntries().length);

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
   * Emits the final list of approved entries and dismisses the modal.
   */
  protected confirmImport(): void {
    this.importConfirmed.emit({
      entriesToImport: [...this.readyToImport()],
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
