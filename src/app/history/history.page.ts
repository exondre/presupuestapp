import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { MonthSummaryItem } from '../shared/models/month-summary-item.model';
import { EntryService } from '../shared/services/entry.service';
import { UtilsService } from '../shared/services/utils.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    IonList,
    IonItem,
    IonLabel,
  ],
})
export class HistoryPage {
  private readonly entryService = inject(EntryService);
  private readonly utilsService = inject(UtilsService);
  private readonly navController = inject(NavController);
  private monthsSummary: MonthSummaryItem[] = [];
  monthsSummaryListItems: MonthSummaryListItem[] = [];

  constructor() {
    effect(() => {
      this.monthsSummary = this.entryService.monthsHistory();
      this.monthsSummaryListItems = this.monthsSummary.map((item) => ({
        id: this.buildMonthIdentifier(item.month, item.year),
        monthLabel: this.utilsService.buildMonthLabel(item.month, item.year),
        totalIncomeLabel: this.utilsService.formatAmount(item.totalIncome),
        totalExpenseLabel: this.utilsService.formatAmount(item.totalExpense),
        totalBalanceLabel: this.utilsService.formatAmount(item.totalBalance),
        month: item.month,
        year: item.year,
      }));
      console.debug(
        'Months summary updated:',
        this.monthsSummary,
        this.monthsSummaryListItems
      );
    });
  }

  /**
   * Navigates to the balance page displaying the selected month.
   *
   * @param item Month summary descriptor used to derive the reference date.
   */
  protected handleMonthSelected(item: MonthSummaryListItem): void {
    const referenceMonth = new Date(item.year, item.month - 1, 1);

    void this.navController.navigateForward('/tabs/history/detail', {
      queryParams: {
        year: referenceMonth.getFullYear(),
        month: referenceMonth.getMonth() + 1,
      },
    });
  }

  /**
   * Generates the identifier used to track each summary item in the template.
   *
   * @param month Month index starting at 1 for January.
   * @param year Four digit year.
   * @returns A string identifier in the format YYYY-MM.
   */
  private buildMonthIdentifier(month: number, year: number): string {
    const normalizedMonth = String(month).padStart(2, '0');
    return `${year}-${normalizedMonth}`;
  }
}

type MonthSummaryListItem = {
  id: string;
  monthLabel: string;
  totalIncomeLabel: string;
  totalExpenseLabel: string;
  totalBalanceLabel: string;
  month: number;
  year: number;
};
