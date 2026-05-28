import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { repeatOutline } from 'ionicons/icons';
import { EntryType } from '../../models/entry-data.model';

/**
 * Represents the shared view model required to render an entry record row.
 */
export interface EntryRecordViewModel {
  id: string;
  amountLabel: string;
  description: string;
  dateLabel?: string;
  installmentLabel?: string;
  timeLabel?: string;
  timestamp?: number;
  type: EntryType;
  isRecurring: boolean;
}

/**
 * Renders the shared visual content for an entry record without row actions.
 */
@Component({
  selector: 'app-entry-record',
  standalone: true,
  templateUrl: './entry-record.component.html',
  styleUrls: ['./entry-record.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryRecordComponent {
  private static iconsRegistered = false;

  readonly itemSignal = input.required<EntryRecordViewModel>();
  readonly showDate = input(false);
  readonly showTime = input(false);
  readonly compact = input(false);
  readonly coloredAmount = input(true);

  protected readonly entryType = EntryType;
  protected readonly item = computed(() => this.itemSignal());
  protected readonly typeLabel = computed(() =>
    this.item().type === EntryType.INCOME ? 'Ingreso' : 'Egreso',
  );
  protected readonly accessibleLabel = computed(() =>
    `${this.typeLabel()}: ${this.item().description}, ${this.item().amountLabel}`,
  );

  constructor() {
    if (EntryRecordComponent.iconsRegistered) {
      return;
    }

    addIcons({
      'repeat-outline': repeatOutline,
    });
    EntryRecordComponent.iconsRegistered = true;
  }
}
