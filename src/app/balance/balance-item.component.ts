import { ChangeDetectionStrategy, Component, ViewChild, computed, input, output } from '@angular/core';
import {
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonItemSliding as IonItemSlidingElement,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowUpCircleOutline, createOutline, trashOutline } from 'ionicons/icons';
import { EntryType } from '../shared/models/entry-data.model';

/**
 * Represents the view model required to render an entry inside the balance list.
 */
export interface BalanceItemViewModel {
  id: string;
  amountLabel: string;
  description: string;
  timeLabel: string;
  timestamp: number;
  type: EntryType;
}

/**
 * Renders an entry using an Ion Item Sliding with quick actions.
 */
@Component({
  selector: 'app-balance-item',
  standalone: true,
  templateUrl: './balance-item.component.html',
  styleUrls: ['./balance-item.component.scss'],
  imports: [
    IonItemSliding,
    IonItem,
    IonLabel,
    IonItemOptions,
    IonItemOption,
    IonIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceItemComponent {
  @ViewChild(IonItemSlidingElement)
  private readonly slidingItem?: IonItemSlidingElement;

  readonly itemSignal = input.required<BalanceItemViewModel>();
  protected readonly entryType = EntryType;

  readonly editRequested = output<void>();

  readonly deleteRequested = output<void>();
  readonly deleteRequestedWithSwipe = output<void>();

  readonly item = computed(() => this.itemSignal());

  constructor() {
    addIcons({
      'create-outline': createOutline,
      'trash-outline': trashOutline,
      'arrow-up-circle-outline': arrowUpCircleOutline,
    });
  }

  /**
   * Emits an event indicating that the edit action was requested.
   */
  protected async handleEdit(): Promise<void> {
    await this.closeSliding();
    this.editRequested.emit();
  }

  /**
   * Emits an event indicating that the delete action was requested.
   *
   */
  protected async handleDelete(): Promise<void> {
    await this.closeSliding();
    this.deleteRequested.emit();
  }

  /**
   * Emits an event indicating that the delete action was requested
   * via a swipe gesture and should not require confirmation.
   *
   * This is triggered by a swipe action.
   */
  protected async handleDeleteWithSwipe(): Promise<void> {
    await this.closeSliding();
    this.deleteRequestedWithSwipe.emit();
  }

  /**
   * Closes the sliding item to reset its state after an action.
   */
  private async closeSliding(): Promise<void> {
    const sliding = this.slidingItem;
    if (!sliding) {
      return;
    }

    await sliding.close();
  }
}
