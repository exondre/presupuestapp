import { Component, computed, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
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
} from '@ionic/angular/standalone';
import { AlertController } from '@ionic/angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { ExpenseData } from '../shared/models/expense-data.model';
import { ExpensesService } from '../shared/services/expenses.service';
import {
  BalanceExpenseItemComponent,
  BalanceExpenseViewModel,
} from './balance-expense-item.component';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';

interface BalanceDayGroup {
  key: string;
  label: string;
  expenses: BalanceExpenseViewModel[];
}

/**
 * Displays the balance sheet with the expenses grouped by day using Chile's timezone.
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
    BalanceExpenseItemComponent,
  ],
})
export class BalancePage {
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

  private readonly expensesService = inject(ExpensesService);

  private readonly alertController = inject(AlertController);

  private readonly expenses = toSignal(this.expensesService.expenses$, {
    initialValue: [],
  });

  protected readonly groups = computed(() => this.buildGroups(this.expenses()));
  protected readonly currentMonthSummary = computed(() => {
    const today = new Date();
    const total = this.expensesService.calculateMonthlyTotal(
      this.expenses(),
      today,
    );

    return {
      totalLabel: this.formatAmount(total),
      subtitle: this.buildMonthSubtitle(today),
    };
  });

  constructor() {
    addIcons({
      'information-circle-outline': informationCircleOutline,
    });
  }

  /**
   * Handles the deletion request triggered from the expense item.
   *
   * @param expenseId Identifier of the expense to remove.
   */
  protected async handleDeleteExpense(expenseId: string, requireConfirmation: boolean = true): Promise<void> {
    if (!requireConfirmation) {
      this.expensesService.removeExpense(expenseId);
      return;
    }

    const alert = await this.alertController.create({
      header: '¿Eliminar gasto?',
      message: 'Esta acción eliminará el gasto de tu registro.',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.expensesService.removeExpense(expenseId);
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Placeholder for the upcoming edit functionality.
   *
   * @param expenseId Identifier of the expense to edit.
   */
  protected handleEditExpense(expenseId: string): void {
    void expenseId;
  }

  /**
   * Creates the balance groups ordered by day and expense recency.
   *
   * @param expenses Expenses retrieved from the store.
   * @returns The expenses grouped by day.
   */
  private buildGroups(expenses: ExpenseData[]): BalanceDayGroup[] {
    const sorted = [...expenses].sort(
      (a, b) =>
        this.normalizeToMillis(b.date) - this.normalizeToMillis(a.date),
    );

    const groups: BalanceDayGroup[] = [];

    sorted.forEach((expense) => {
      const occurrenceDate = new Date(expense.date);
      const descriptor = this.createDayDescriptor(occurrenceDate);
      const targetGroup = this.ensureGroup(groups, descriptor);

      targetGroup.expenses.push({
        id: expense.id,
        amountLabel: this.formatAmount(expense.amount),
        description: this.resolveDescription(expense.description),
        timeLabel: this.formatTime(occurrenceDate),
        timestamp: occurrenceDate.getTime(),
      });
    });

    return groups.map((group) => ({
      ...group,
      expenses: group.expenses.sort((a, b) => b.timestamp - a.timestamp),
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
      expenses: [],
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
   * @param description Optional expense description.
   * @returns The description or a default fallback.
   */
  private resolveDescription(description: string | undefined): string {
    const trimmed = (description ?? '').trim();
    return trimmed.length > 0 ? trimmed : 'gasto';
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
