import { Component } from '@angular/core';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { NewExpenseModalComponent } from '../shared/components/new-expense-modal/new-expense-modal.component';
import { ExpenseData } from '../shared/models/expense-data.model';
import { ExpensesService } from '../shared/services/expenses.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonButton, NewExpenseModalComponent],
})
export class HomePage {
  constructor(private readonly expensesService: ExpensesService) {}

  /**
   * Receives the data emitted when a new expense has been saved.
   *
   * @param expense Expense data captured through the modal.
   */
  protected handleExpenseSaved(expense: ExpenseData): void {
    this.expensesService.addExpense(expense);
  }
}
