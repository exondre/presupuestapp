import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  EntryCreation,
  EntryData,
  EntryType,
} from '../models/entry-data.model';
import { MonthSummaryItem } from '../models/month-summary-item.model';
import { LocalStorageService } from './local-storage.service';

type StoredEntry = Partial<EntryData> & {
  amount?: number;
  date?: string;
  description?: string;
  type?: EntryType | string;
};

/**
 * Manages the lifecycle of entries by keeping them in memory and persisting
 * them in the local storage.
 */
@Injectable({
  providedIn: 'root',
})
export class EntryService {
  private static readonly storageKey = 'presupuestapp:entries';
  private static readonly chileTimeZone = 'America/Santiago';

  private readonly localStorageService = inject(LocalStorageService);

  private readonly entriesSubject = new BehaviorSubject<EntryData[]>(
    this.restoreEntriesFromStorage()
  );
  private readonly monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EntryService.chileTimeZone,
    year: 'numeric',
    month: '2-digit',
  });

  readonly entries$ = this.entriesSubject.asObservable();
  readonly entriesSignal = signal<EntryData[]>(this.entriesSubject.value);

  /**
   * Calculates the total amount of expense entries for the month that contains the reference date.
   *
   * @param entries Entries to evaluate.
   * @param referenceDate Date used to determine the target month.
   * @returns The aggregated amount for the specified month considering only expenses.
   */
  calculateMonthlyExpenseTotal(
    entries: EntryData[],
    referenceDate: Date = new Date()
  ): number {
    return this.calculateMonthlyTotalForType(
      entries,
      EntryType.EXPENSE,
      referenceDate
    );
  }

  /**
   * Calculates the total amount of income entries for the month that contains the reference date.
   *
   * @param entries Entries to evaluate.
   * @param referenceDate Date used to determine the target month.
   * @returns The aggregated amount for the specified month considering only incomes.
   */
  calculateMonthlyIncomeTotal(
    entries: EntryData[],
    referenceDate: Date = new Date()
  ): number {
    return this.calculateMonthlyTotalForType(
      entries,
      EntryType.INCOME,
      referenceDate
    );
  }

  calculateMonthlyBalance(
    entries: EntryData[],
    referenceDate: Date = new Date()
  ): number {
    const income = this.calculateMonthlyIncomeTotal(entries, referenceDate);
    const expense = this.calculateMonthlyExpenseTotal(entries, referenceDate);

    return income - expense;
  }

  /**
   * Filters entries to include only those that belong to the month containing the reference date.
   *
   * @param referenceDate Date used to determine the target month.
   * @returns The entries that occur within the reference month.
   */
  filterEntriesByMonth(
    referenceDate: Date = new Date()
  ): EntryData[] {
    const entries = this.entriesSignal();
    const referenceKey = this.buildMonthKey(referenceDate);

    return entries.filter((entry) => {
      const occurrenceDate = new Date(entry.date);
      if (Number.isNaN(occurrenceDate.getTime())) {
        return false;
      }

      return this.buildMonthKey(occurrenceDate) === referenceKey;
    });
  }

  /**
   * Adds a new entry to the in-memory collection and persists it.
   *
   * @param entry Entry data to store.
   */
  addEntry(entry: EntryCreation): void {
    const { type } = this.normalizeType(entry.type);
    const newEntry: EntryData = {
      id: this.generateId(),
      amount: entry.amount,
      date: entry.date,
      description: entry.description,
      type,
    };

    const updatedEntries = [...this.entriesSubject.value, newEntry];
    this.persistEntries(updatedEntries);
  }

  /**
   * Removes the entry matching the provided identifier.
   *
   * @param entryId Identifier of the entry to remove.
   */
  removeEntry(entryId: string): void {
    const currentEntries = this.entriesSubject.value;
    const updatedEntries = currentEntries.filter(
      (entry) => entry.id !== entryId
    );

    if (updatedEntries.length === currentEntries.length) {
      return;
    }

    this.persistEntries(updatedEntries);
  }

  /**
   * Replaces the current entry collection with the data provided in the import payload.
   *
   * @param rawData Data obtained from an import file.
   */
  importEntries(rawData: unknown): void {
    const importedEntries = this.extractImportedEntries(rawData);

    const normalizedEntries: EntryData[] = importedEntries.map((entry) => {
      const normalized = this.normalizeStoredEntry(entry);
      if (!normalized) {
        throw new Error('Invalid entry detected during import.');
      }

      return normalized.entry;
    });

    this.persistEntries(normalizedEntries);
  }

  /**
   * Retrieves an immutable snapshot of the current entry collection.
   *
   * @returns The current entries stored in memory.
   */
  getEntriesSnapshot(): EntryData[] {
    return [...this.entriesSubject.value];
  }

  /**
   * Serializes the provided entries (or the current snapshot) into a JSON string used during exports.
   *
   * @param entries Optional collection to serialize instead of the current snapshot.
   * @returns A prettified JSON string that represents the entries collection.
   */
  serializeEntries(entries: EntryData[] = this.getEntriesSnapshot()): string {
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Persists the provided entries in memory and local storage.
   *
   * @param entries Entries collection to persist.
   */
  private persistEntries(entries: EntryData[]): void {
    this.entriesSubject.next(entries);
    this.entriesSignal.set(entries);
    this.localStorageService.setItem(EntryService.storageKey, entries);
  }

  /**
   * Calculates the monthly total for the provided entry type.
   *
   * @param entries Entries to evaluate.
   * @param type Entry type to include in the aggregation.
   * @param referenceDate Date used to determine the target month.
   * @returns The aggregated amount for the specified month and type.
   */
  private calculateMonthlyTotalForType(
    entries: EntryData[],
    type: EntryType,
    referenceDate: Date
  ): number {
    const referenceKey = this.buildMonthKey(referenceDate);
    return entries.reduce((total, entry) => {
      if (entry.type !== type) {
        return total;
      }

      const occurrenceDate = new Date(entry.date);
      if (Number.isNaN(occurrenceDate.getTime())) {
        return total;
      }

      const matchesReferenceMonth =
        this.buildMonthKey(occurrenceDate) === referenceKey;

      return matchesReferenceMonth ? total + entry.amount : total;
    }, 0);
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
        .map((part) => [part.type, part.value])
    );
    const year = parts.get('year') ?? '0000';
    const month = parts.get('month') ?? '01';
    return `${year}-${month}`;
  }

  /**
   * Restores entries from local storage or returns an empty collection.
   *
   * @returns Entries retrieved from local storage.
   */
  private restoreEntriesFromStorage(): EntryData[] {
    const storedEntries =
      this.localStorageService.getItem<StoredEntry[]>(
        EntryService.storageKey
      ) ?? [];

    if (!Array.isArray(storedEntries)) {
      return [];
    }

    const normalized: EntryData[] = [];
    let requiresPersistence = false;

    storedEntries.forEach((entry) => {
      const normalizedEntry = this.normalizeStoredEntry(entry);
      if (!normalizedEntry) {
        requiresPersistence = true;
        return;
      }

      requiresPersistence ||= normalizedEntry.requiresSync;
      normalized.push(normalizedEntry.entry);
    });

    if (requiresPersistence) {
      this.localStorageService.setItem(EntryService.storageKey, normalized);
    }

    return normalized;
  }

  /**
   * Normalizes the stored entry to conform to the in-memory representation.
   *
   * @param entry Entry retrieved from the storage.
   * @returns The normalized entry and whether it required fixing.
   */
  private normalizeStoredEntry(
    entry: StoredEntry
  ): { entry: EntryData; requiresSync: boolean } | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const amount = this.normalizeAmount(entry.amount);
    const { normalizedDate, requiresSync: dateRequiresSync } =
      this.normalizeDate(entry.date);
    const rawDescription =
      typeof entry.description === 'string' ? entry.description.trim() : '';
    const description = rawDescription.length > 0 ? rawDescription : undefined;
    const { type, requiresSync: typeRequiresSync } = this.normalizeType(
      entry.type
    );

    const id =
      typeof entry.id === 'string' && entry.id.trim().length > 0
        ? entry.id
        : this.generateId();

    const requiresSync =
      dateRequiresSync || id !== entry.id || typeRequiresSync;

    return {
      entry: {
        id,
        amount,
        date: normalizedDate,
        description,
        type,
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
  private normalizeDate(value: unknown): {
    normalizedDate: string;
    requiresSync: boolean;
  } {
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return { normalizedDate: parsed.toISOString(), requiresSync: false };
      }
    }

    return { normalizedDate: new Date().toISOString(), requiresSync: true };
  }

  /**
   * Normalizes the type ensuring it matches one of the supported values.
   *
   * @param value Entry type retrieved from storage or provided by the caller.
   * @returns The normalized type and whether a fix was applied.
   */
  private normalizeType(value: unknown): {
    type: EntryType;
    requiresSync: boolean;
  } {
    if (value === EntryType.EXPENSE || value === EntryType.INCOME) {
      return { type: value, requiresSync: false };
    }

    if (typeof value === 'string') {
      const upperCased = value.toUpperCase();
      if (upperCased === EntryType.EXPENSE) {
        return {
          type: EntryType.EXPENSE,
          requiresSync: value !== EntryType.EXPENSE,
        };
      }

      if (upperCased === EntryType.INCOME) {
        return {
          type: EntryType.INCOME,
          requiresSync: value !== EntryType.INCOME,
        };
      }
    }

    return { type: EntryType.EXPENSE, requiresSync: true };
  }

  /**
   * Generates a unique identifier for a new entry.
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
   * Extracts the entries array from an import payload supporting multiple formats.
   *
   * @param rawData Data read from an import file.
   * @returns Normalized raw entries ready for further validation.
   */
  private extractImportedEntries(rawData: unknown): StoredEntry[] {
    if (Array.isArray(rawData)) {
      this.ensureEveryEntryIsObject(rawData);
      return rawData as StoredEntry[];
    }

    if (rawData && typeof rawData === 'object') {
      const candidate =
        (rawData as { entries?: unknown; expenses?: unknown }).entries ??
        (rawData as { entries?: unknown; expenses?: unknown }).expenses;
      if (Array.isArray(candidate)) {
        this.ensureEveryEntryIsObject(candidate);
        return candidate as StoredEntry[];
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
      (item) => item === null || typeof item !== 'object'
    );
    if (hasInvalid) {
      throw new Error('Invalid entry detected during import.');
    }
  }

  readonly monthsHistory = computed((): MonthSummaryItem[] => {
    const entries = this.entriesSignal();
    const monthsSummary: MonthSummaryItem[] = [];

    // get unique months from entries
    const monthSet = new Set<string>();
    entries.forEach((entry) => {
      const date = new Date(entry.date);
      const monthKey = this.buildMonthKey(date);
      monthSet.add(monthKey);
    });

    monthSet.forEach((monthKey) => {
      const [yearStr, monthStr] = monthKey.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const totalIncome = this.calculateMonthlyIncomeTotal(
        entries,
        new Date(year, month - 1)
      );
      const totalExpense = this.calculateMonthlyExpenseTotal(
        entries,
        new Date(year, month - 1)
      );
      const totalBalance = this.calculateMonthlyBalance(
        entries,
        new Date(year, month - 1)
      );

      monthsSummary.push({
        month,
        year,
        totalIncome,
        totalExpense,
        totalBalance,
      });
    });

    // sort by year and month descending
    monthsSummary.sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      return b.month - a.month;
    });

    return monthsSummary;
  });
}
