import { ChangeDetectionStrategy, Component, ViewChild, input, output, computed } from '@angular/core';
import {
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
} from '@ionic/angular/standalone';
import { IonItemSliding as IonItemSlidingElement } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline, arrowUpCircleOutline } from 'ionicons/icons';

/**
 * Represents the view model required to render an expense inside the balance list.
 */
export interface BalanceExpenseViewModel {
  id: string;
  amountLabel: string;
  description: string;
  timeLabel: string;
  timestamp: number;
}

/**
 * Renders an expense entry using an Ion Item Sliding with quick actions.
 */
@Component({
  selector: 'app-balance-expense-item',
  standalone: true,
  templateUrl: './balance-expense-item.component.html',
  styleUrls: ['./balance-expense-item.component.scss'],
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
export class BalanceExpenseItemComponent {
  @ViewChild(IonItemSlidingElement)
  private readonly slidingItem?: IonItemSlidingElement;

  readonly expenseSignal = input.required<BalanceExpenseViewModel>();

  readonly editRequested = output<void>();

  readonly deleteRequested = output<void>();
  readonly deleteRequestedWithSwipe = output<void>();

  readonly expense = computed(() => this.expenseSignal());

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
