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
  private monthsSummary: MonthSummaryItem[] = [];
  monthsSummaryListItems: MonthSummaryListItem[] = [];

  constructor() {
    effect(() => {
      this.monthsSummary = this.entryService.monthsHistory();
      this.monthsSummaryListItems = this.monthsSummary.map((item) => ({
        monthLabel: this.utilsService.buildMonthLabel(item.month, item.year),
        totalIncomeLabel: this.utilsService.formatAmount(item.totalIncome),
        totalExpenseLabel: this.utilsService.formatAmount(item.totalExpense),
        totalBalanceLabel: this.utilsService.formatAmount(item.totalBalance),
      }));
      console.debug(
        'Months summary updated:',
        this.monthsSummary,
        this.monthsSummaryListItems
      );
    });
  }
}

type MonthSummaryListItem = {
  monthLabel: string;
  totalIncomeLabel: string;
  totalExpenseLabel: string;
  totalBalanceLabel: string;
};
