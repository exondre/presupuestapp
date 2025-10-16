import { Component, computed } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonItemDivider,
  IonLabel,
} from '@ionic/angular/standalone';
import { toSignal } from '@angular/core/rxjs-interop';
import { ExpenseData } from '../shared/models/expense-data.model';
import { ExpensesService } from '../shared/services/expenses.service';

interface BalanceExpenseItem {
  id: string;
  amountLabel: string;
  description: string;
  timeLabel: string;
  timestamp: number;
}

interface BalanceDayGroup {
  key: string;
  label: string;
  expenses: BalanceExpenseItem[];
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
    IonItem,
    IonItemDivider,
    IonLabel,
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

  private readonly expenses = toSignal(this.expensesService.expenses$, {
    initialValue: [],
  });

  protected readonly groups = computed(() => this.buildGroups(this.expenses()));

  constructor(private readonly expensesService: ExpensesService) {}

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

    sorted.forEach((expense, index) => {
      const occurrenceDate = new Date(expense.date);
      const descriptor = this.createDayDescriptor(occurrenceDate);
      const targetGroup = this.ensureGroup(groups, descriptor);

      targetGroup.expenses.push({
        id: `${descriptor.key}-${index}`,
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
}
