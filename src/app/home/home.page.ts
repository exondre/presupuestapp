import { Component, inject } from '@angular/core';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { NewExpenseModalComponent } from '../shared/components/new-expense-modal/new-expense-modal.component';
import { ExpenseCreation } from '../shared/models/expense-data.model';
import { ExpensesService } from '../shared/services/expenses.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonButton, NewExpenseModalComponent],
})
export class HomePage {
  private readonly expensesService = inject(ExpensesService);

  /**
   * Receives the data emitted when a new expense has been saved.
   *
   * @param expense Expense data captured through the modal.
   */
  protected handleExpenseSaved(expense: ExpenseCreation): void {
    this.expensesService.addExpense(expense);
  }
}
