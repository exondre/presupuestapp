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
  private static readonly chileTimeZone = 'America/Santiago';

  private readonly localStorageService = inject(LocalStorageService);

  private readonly expensesSubject = new BehaviorSubject<ExpenseData[]>(
    this.restoreExpensesFromStorage(),
  );
  private readonly monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ExpensesService.chileTimeZone,
    year: 'numeric',
    month: '2-digit',
  });

  readonly expenses$ = this.expensesSubject.asObservable();

  /**
   * Calculates the total amount of expenses for the month that contains the reference date.
   *
   * @param expenses Expenses to evaluate.
   * @param referenceDate Date used to determine the target month.
   * @returns The aggregated amount for the specified month.
   */
  calculateMonthlyTotal(
    expenses: ExpenseData[],
    referenceDate: Date = new Date(),
  ): number {
    const referenceKey = this.buildMonthKey(referenceDate);

    return expenses.reduce((total, expense) => {
      const occurrenceDate = new Date(expense.date);
      if (Number.isNaN(occurrenceDate.getTime())) {
        return total;
      }

      const matchesReferenceMonth =
        this.buildMonthKey(occurrenceDate) === referenceKey;

      return matchesReferenceMonth ? total + expense.amount : total;
    }, 0);
  }

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
   * Replaces the current expense collection with the data provided in the import payload.
   *
   * @param rawData Data obtained from an import file.
   */
  importExpenses(rawData: unknown): void {
    const importedExpenses = this.extractImportedExpenses(rawData);

    const normalizedExpenses: ExpenseData[] = importedExpenses.map((expense) => {
      const normalized = this.normalizeStoredExpense(expense);
      if (!normalized) {
        throw new Error('Invalid expense entry detected during import.');
      }

      return normalized.expense;
    });

    this.persistExpenses(normalizedExpenses);
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
   * Generates the month key for the provided date using Chile's timezone.
   *
   * @param date Date used to create the month key.
   * @returns A YYYY-MM string that identifies the month.
   */
  private buildMonthKey(date: Date): string {
    const parts = new Map(
      this.monthKeyFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const year = parts.get('year') ?? '0000';
    const month = parts.get('month') ?? '01';
    return `${year}-${month}`;
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

  /**
   * Extracts the expenses array from an import payload supporting multiple formats.
   *
   * @param rawData Data read from an import file.
   * @returns Normalized raw expenses ready for further validation.
   */
  private extractImportedExpenses(rawData: unknown): StoredExpense[] {
    if (Array.isArray(rawData)) {
      this.ensureEveryEntryIsObject(rawData);
      return rawData as StoredExpense[];
    }

    if (rawData && typeof rawData === 'object') {
      const candidate = (rawData as { expenses?: unknown }).expenses;
      if (Array.isArray(candidate)) {
        this.ensureEveryEntryIsObject(candidate);
        return candidate as StoredExpense[];
      }
    }

    throw new Error('Invalid import payload.');
  }

  /**
   * Validates that every element inside the provided array is an object.
   *
   * @param items Array to validate.
   */
  private ensureEveryEntryIsObject(items: unknown[]): void {
    const hasInvalid = items.some(
      (item) => item === null || typeof item !== 'object',
    );
    if (hasInvalid) {
      throw new Error('Invalid expense entry detected during import.');
    }
  }
}
