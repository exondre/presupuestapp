import { Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  calendarOutline,
  cashOutline,
  chevronDownOutline,
  createOutline,
  repeatOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryData, EntryType, EntryUpdatePayload } from '../shared/models/entry-data.model';
import { EntryActionService } from '../shared/services/entry-action.service';
import { EntryService } from '../shared/services/entry.service';
import {
  formatEntryAmount,
  formatEntryDate,
  formatEntryDateTime,
  formatEntryTime,
  resolveEntryDescription,
} from '../shared/utils/entry-display.util';
import {
  EntrySeriesItemStatus,
  EntrySeriesItemViewModel,
  buildEntrySeriesViewModel,
} from '../shared/utils/entry-series-display.util';
import { resolveInstallmentDisplayDetailsFromEntry } from '../shared/utils/recurrence-installment-display.util';

interface MovementDetailViewModel {
  id: string;
  type: EntryType;
  typeLabel: string;
  amountLabel: string;
  description: string;
  dateLabel: string;
  timeLabel: string;
  updatedAtLabel?: string;
  recurrenceLabel?: string;
  installmentLabel?: string;
}

/**
 * Displays the read-only details for a movement with edit and delete shortcuts.
 */
@Component({
  selector: 'app-movement-detail',
  standalone: true,
  templateUrl: './movement-detail.page.html',
  styleUrls: ['./movement-detail.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
    IonChip,
    IonBadge,
    IonList,
    IonItem,
    IonLabel,
    NewEntryModalComponent,
  ],
})
export class MovementDetailPage {
  @ViewChild('newEntryModal')
  private modal?: NewEntryModalComponent;

  protected readonly entryType = EntryType;

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly entryService = inject(EntryService);
  private readonly entryActionService = inject(EntryActionService);
  private readonly navController = inject(NavController);
  private readonly router = inject(Router);
  private readonly entryId = signal<string | null>(null);
  protected readonly isSeriesExpanded = signal(false);

  protected readonly entry = computed(() => {
    const entryId = this.entryId();
    if (!entryId) {
      return null;
    }

    return this.entryService
      .entriesSignal()
      .find((item) => item.id === entryId) ?? null;
  });

  protected readonly detail = computed(() => {
    const entry = this.entry();
    return entry ? this.buildDetailViewModel(entry) : null;
  });

  protected readonly series = computed(() => {
    const entry = this.entry();
    return entry
      ? buildEntrySeriesViewModel(entry, this.entryService.entriesSignal())
      : null;
  });

  constructor() {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'calendar-outline': calendarOutline,
      'cash-outline': cashOutline,
      'chevron-down-outline': chevronDownOutline,
      'create-outline': createOutline,
      'repeat-outline': repeatOutline,
      'time-outline': timeOutline,
      'trash-outline': trashOutline,
    });

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.entryId.set(params.get('entryId')));
  }

  /**
   * Navigates back to the previous view or to Balance when there is no stack.
   */
  protected async handleNavigateBack(): Promise<void> {
    const didPop = await this.navController.pop();
    if (!didPop) {
      await this.navController.navigateBack(this.resolveParentPath());
    }
  }

  /**
   * Opens the edit modal with the current entry.
   */
  protected handleEditEntry(): void {
    const entry = this.entry();
    const modal = this.modal;
    if (!entry || !modal) {
      return;
    }

    modal.openForEdit(entry);
  }

  /**
   * Receives the data emitted when an entry has been edited.
   *
   * @param payload Entry data modifications captured through the modal.
   */
  protected handleEntryUpdated(payload: EntryUpdatePayload): void {
    this.entryService.updateEntry(payload.id, {
      amount: payload.amount,
      date: payload.date,
      description: payload.description,
    });
  }

  /**
   * Confirms and deletes the current entry.
   */
  protected async handleDeleteEntry(): Promise<void> {
    const entryId = this.entryId();
    if (!entryId) {
      return;
    }

    const deleted = await this.entryActionService.confirmAndDeleteEntry(entryId);
    if (deleted && !this.entry()) {
      await this.handleNavigateBack();
    }
  }

  /**
   * Navigates to another registered movement from the same series.
   *
   * @param item Series item selected by the user.
   */
  protected handleSeriesItemSelected(item: EntrySeriesItemViewModel): void {
    if (!item.entryId || item.entryId === this.entryId()) {
      return;
    }

    void this.navController.navigateForward(this.buildSiblingMovementPath(item.entryId));
  }

  /**
   * Shows or hides the generated movement series details.
   */
  protected toggleSeriesExpanded(): void {
    this.isSeriesExpanded.update((isExpanded) => !isExpanded);
  }

  /**
   * Resolves the parent route for the current movement detail URL.
   *
   * @returns Parent path used as fallback when Ionic has no stack to pop.
   */
  private resolveParentPath(): string {
    const path = this.router.url.split('?')[0];
    const movementIndex = path.lastIndexOf('/movement/');

    if (movementIndex === -1) {
      return '/tabs/balance';
    }

    return path.slice(0, movementIndex);
  }

  /**
   * Builds a movement detail path inside the current navigation stack.
   *
   * @param entryId Identifier of the sibling entry to open.
   * @returns Route path for the sibling movement detail screen.
   */
  private buildSiblingMovementPath(entryId: string): string {
    return `${this.resolveParentPath()}/movement/${entryId}`;
  }

  /**
   * Resolves the visual color used for a series status badge.
   *
   * @param status Series item status.
   * @returns Ionic color name.
   */
  protected resolveStatusColor(status: EntrySeriesItemStatus): string {
    if (status === 'current') {
      return 'primary';
    }
    if (status === 'registered') {
      return 'success';
    }
    if (status === 'excluded') {
      return 'medium';
    }
    return 'tertiary';
  }

  /**
   * Resolves the Spanish label used for a series status badge.
   *
   * @param status Series item status.
   * @returns Localized status label.
   */
  protected resolveStatusLabel(status: EntrySeriesItemStatus): string {
    if (status === 'current') {
      return 'Actual';
    }
    if (status === 'registered') {
      return 'Pagada';
    }
    if (status === 'excluded') {
      return 'Excluida';
    }
    return 'Proyectada';
  }

  /**
   * Builds the view model used by the detail template.
   *
   * @param entry Entry to transform.
   * @returns The movement detail view model.
   */
  private buildDetailViewModel(entry: EntryData): MovementDetailViewModel {
    const occurrenceDate = new Date(entry.date);
    const updatedAt = entry.updatedAt ? new Date(entry.updatedAt) : null;
    const installmentDetails = resolveInstallmentDisplayDetailsFromEntry(entry);

    return {
      id: entry.id,
      type: entry.type,
      typeLabel: entry.type === EntryType.INCOME ? 'Ingreso' : 'Egreso',
      amountLabel: formatEntryAmount(entry.amount),
      description: resolveEntryDescription(entry.description),
      dateLabel: formatEntryDate(occurrenceDate),
      timeLabel: formatEntryTime(occurrenceDate),
      updatedAtLabel: updatedAt ? formatEntryDateTime(updatedAt) : undefined,
      recurrenceLabel: this.resolveRecurrenceLabel(entry),
      installmentLabel: installmentDetails?.installmentLabel,
    };
  }

  /**
   * Resolves the recurrence label shown in the movement detail.
   *
   * @param entry Entry used to inspect recurrence metadata.
   * @returns A localized recurrence label or undefined when not recurring.
   */
  private resolveRecurrenceLabel(entry: EntryData): string | undefined {
    const recurrence = entry.recurrence;
    if (!recurrence || recurrence.frequency !== 'monthly') {
      return undefined;
    }
    // Temporaryly using a generic label for all recurrences
    return 'Recurrente';

    // if (recurrence.termination.mode === 'occurrences') {
    //   return 'Serie de cuotas mensual';
    // }

    // return 'Recurrente mensual';
  }
}
