import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ExpenseData } from '../models/expense-data.model';
import { LocalStorageService } from './local-storage.service';

/**
 * Manages the lifecycle of expenses by keeping them in memory and persisting
 * them in the local storage.
 */
@Injectable({
  providedIn: 'root',
})
export class ExpensesService {
  private static readonly storageKey = 'presupuestapp:expenses';

  private readonly expensesSubject = new BehaviorSubject<ExpenseData[]>(
    this.restoreExpensesFromStorage(),
  );

  readonly expenses$ = this.expensesSubject.asObservable();

  constructor(private readonly localStorageService: LocalStorageService) {}

  /**
   * Adds a new expense to the in-memory collection and persists it.
   *
   * @param expense Expense data to store.
   */
  addExpense(expense: ExpenseData): void {
    const updatedExpenses = [...this.expensesSubject.value, expense];
    this.persistExpenses(updatedExpenses);
  }

  /**
   * Retrieves an immutable snapshot of the current expense collection.
   *
   * @returns The current expenses stored in memory.
   */
  getExpensesSnapshot(): ExpenseData[] {
    return [...this.expensesSubject.value];
  }

  /**
   * Persists the provided expenses in memory and local storage.
   *
   * @param expenses Expenses collection to persist.
   */
  private persistExpenses(expenses: ExpenseData[]): void {
    this.expensesSubject.next(expenses);
    this.localStorageService.setItem(ExpensesService.storageKey, expenses);
  }

  /**
   * Restores expenses from local storage or returns an empty collection.
   *
   * @returns Expenses retrieved from local storage.
   */
  private restoreExpensesFromStorage(): ExpenseData[] {
    const storedExpenses =
      this.localStorageService.getItem<ExpenseData[]>(
        ExpensesService.storageKey,
      ) ?? [];

    if (!Array.isArray(storedExpenses)) {
      return [];
    }

    return storedExpenses.map((expense) => ({
      amount: expense.amount,
      date: expense.date,
      description: expense.description,
    }));
  }
}
