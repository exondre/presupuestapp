import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  ExpenseCreation,
  ExpenseData,
} from '../models/expense-data.model';
import { LocalStorageService } from './local-storage.service';

type StoredExpense = Partial<ExpenseData> & {
  amount?: number;
  date?: string;
  description?: string;
};

/**
 * Manages the lifecycle of expenses by keeping them in memory and persisting
 * them in the local storage.
 */
@Injectable({
  providedIn: 'root',
})
export class ExpensesService {
  private static readonly storageKey = 'presupuestapp:expenses';

  private readonly localStorageService = inject(LocalStorageService);

  private readonly expensesSubject = new BehaviorSubject<ExpenseData[]>(
    this.restoreExpensesFromStorage(),
  );

  readonly expenses$ = this.expensesSubject.asObservable();

  /**
   * Adds a new expense to the in-memory collection and persists it.
   *
   * @param expense Expense data to store.
   */
  addExpense(expense: ExpenseCreation): void {
    const newExpense: ExpenseData = {
      id: this.generateId(),
      amount: expense.amount,
      date: expense.date,
      description: expense.description,
    };

    const updatedExpenses = [...this.expensesSubject.value, newExpense];
    this.persistExpenses(updatedExpenses);
  }

  /**
   * Removes the expense matching the provided identifier.
   *
   * @param expenseId Identifier of the expense to remove.
   */
  removeExpense(expenseId: string): void {
    const currentExpenses = this.expensesSubject.value;
    const updatedExpenses = currentExpenses.filter(
      (expense) => expense.id !== expenseId,
    );

    if (updatedExpenses.length === currentExpenses.length) {
      return;
    }

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
      this.localStorageService.getItem<StoredExpense[]>(
        ExpensesService.storageKey,
      ) ?? [];

    if (!Array.isArray(storedExpenses)) {
      return [];
    }

    const normalized: ExpenseData[] = [];
    let requiresPersistence = false;

    storedExpenses.forEach((expense) => {
      const normalizedExpense = this.normalizeStoredExpense(expense);
      if (!normalizedExpense) {
        requiresPersistence = true;
        return;
      }

      requiresPersistence ||= normalizedExpense.requiresSync;
      normalized.push(normalizedExpense.expense);
    });

    if (requiresPersistence) {
      this.localStorageService.setItem(
        ExpensesService.storageKey,
        normalized,
      );
    }

    return normalized;
  }

  /**
   * Normalizes the stored expense to conform to the in-memory representation.
   *
   * @param expense Expense retrieved from the storage.
   * @returns The normalized expense and whether it required fixing.
   */
  private normalizeStoredExpense(
    expense: StoredExpense,
  ): { expense: ExpenseData; requiresSync: boolean } | null {
    if (!expense || typeof expense !== 'object') {
      return null;
    }

    const amount = this.normalizeAmount(expense.amount);
    const { normalizedDate, requiresSync: dateRequiresSync } =
      this.normalizeDate(expense.date);
    const rawDescription =
      typeof expense.description === 'string'
        ? expense.description.trim()
        : '';
    const description =
      rawDescription.length > 0 ? rawDescription : undefined;

    const id =
      typeof expense.id === 'string' && expense.id.trim().length > 0
        ? expense.id
        : this.generateId();

    const requiresSync = dateRequiresSync || id !== expense.id;

    return {
      expense: {
        id,
        amount,
        date: normalizedDate,
        description,
      },
      requiresSync,
    };
  }

  /**
   * Normalizes the amount ensuring it is stored as an integer.
   *
   * @param amount Amount retrieved from storage.
   * @returns A normalized integer amount.
   */
  private normalizeAmount(amount: unknown): number {
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      return Math.trunc(amount);
    }

    const parsed = Number.parseInt(String(amount ?? '0'), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Normalizes the date ensuring a valid ISO string.
   *
   * @param value Date value retrieved from storage.
   * @returns The normalized date and whether a fix was applied.
   */
  private normalizeDate(
    value: unknown,
  ): { normalizedDate: string; requiresSync: boolean } {
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return { normalizedDate: parsed.toISOString(), requiresSync: false };
      }
    }

    return { normalizedDate: new Date().toISOString(), requiresSync: true };
  }

  /**
   * Generates a unique identifier for a new expense.
   *
   * @returns The generated identifier.
   */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    const segment = () =>
      Number(Math.random() * Number.MAX_SAFE_INTEGER)
        .toString(16)
        .slice(0, 12)
        .padStart(12, '0');

    return `${Date.now().toString(16)}-${segment()}`;
  }
}
