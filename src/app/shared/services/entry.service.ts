import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  EntryCreation,
  EntryData,
  EntryRecurrence,
  EntryRecurrenceCreation,
  EntryRecurrenceTermination,
  EntryType,
} from '../models/entry-data.model';
import { MonthSummaryItem } from '../models/month-summary-item.model';
import { LocalStorageService } from './local-storage.service';

type StoredEntry = Partial<EntryData> & {
  amount?: number;
  date?: string;
  description?: string;
  type?: EntryType | string;
  updatedAt?: string;
};

type RecurrenceRemovalScope = 'single' | 'future' | 'series';

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

  constructor() {
    this.ensureRecurringEntriesUpTo(new Date());
  }

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
    this.ensureRecurringEntriesUpTo(referenceDate);
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
      updatedAt: new Date().toISOString(),
    };
    const recurrence = this.createRecurrenceMetadata(entry.recurrence, newEntry.date);
    if (recurrence) {
      newEntry.recurrence = recurrence;
    }

    const updatedEntries = [...this.entriesSubject.value, newEntry];
    this.persistEntries(updatedEntries);
    if (recurrence) {
      this.ensureRecurringEntriesUpTo(new Date());
    }
  }

  /**
   * Updates the entry matching the provided identifier with the supplied changes.
   *
   * @param entryId Identifier of the entry to update.
   * @param updates Partial data to merge into the existing entry.
   */
  updateEntry(
    entryId: string,
    updates: Partial<Omit<EntryData, 'id'>> & { type?: EntryType | string }
  ): void {
    const currentEntries = this.entriesSubject.value;
    const entryIndex = currentEntries.findIndex((entry) => entry.id === entryId);

    if (entryIndex === -1) {
      return;
    }

    const currentEntry = currentEntries[entryIndex];
    const candidate: StoredEntry = {
      ...currentEntry,
      ...updates,
      id: currentEntry.id,
    };
    candidate.recurrence = currentEntry.recurrence;

    const normalized = this.normalizeStoredEntry(candidate);
    if (!normalized) {
      return;
    }

    const updatedEntry = normalized.entry;
    const isUnchanged =
      updatedEntry.amount === currentEntry.amount &&
      updatedEntry.date === currentEntry.date &&
      updatedEntry.description === currentEntry.description &&
      updatedEntry.type === currentEntry.type &&
      this.areRecurrencesEqual(updatedEntry.recurrence, currentEntry.recurrence);

    if (isUnchanged) {
      return;
    }

    const patchedEntry: EntryData = {
      ...updatedEntry,
      updatedAt: new Date().toISOString(),
    };

    const updatedEntries = [...currentEntries];
    updatedEntries[entryIndex] = patchedEntry;
    this.persistEntries(updatedEntries);
  }

  /**
   * Calculates the largest occurrence index that should exist up to the provided date.
   *
   * @param recurrence Recurrence metadata.
   * @param targetDate Date used to limit the recurrence expansion.
   * @returns The highest required occurrence index or null when no expansion is needed.
   */
  private resolveMaxOccurrenceIndex(
    recurrence: EntryRecurrence,
    targetDate: Date
  ): number | null {
    const anchorDate = new Date(recurrence.anchorDate);
    if (Number.isNaN(anchorDate.getTime())) {
      return null;
    }

    if (anchorDate.getTime() > targetDate.getTime()) {
      return null;
    }

    const monthDistance = this.calculateMonthDistance(anchorDate, targetDate);
    if (monthDistance < 0) {
      return null;
    }

    if (recurrence.termination.mode === 'occurrences') {
      const limit = recurrence.termination.total - 1;
      if (limit < 0) {
        return null;
      }

      return Math.min(monthDistance, limit);
    }

    return monthDistance;
  }

  /**
   * Computes the number of months between the start and end dates.
   *
   * @param start Starting date.
   * @param end Ending date.
   * @returns The month distance between the provided dates.
   */
  private calculateMonthDistance(start: Date, end: Date): number {
    return (
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth())
    );
  }

  /**
   * Generates a new date by adding the specified number of months while preserving the time.
   *
   * @param date Base date for the calculation.
   * @param months Number of months to add.
   * @returns The resulting date.
   */
  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }

  /**
   * Builds the recurrence metadata for a newly created entry.
   *
   * @param recurrence Recurrence creation payload.
   * @param normalizedDate Entry date in ISO format.
   * @returns The recurrence metadata or undefined when the payload is invalid.
   */
  private createRecurrenceMetadata(
    recurrence: EntryRecurrenceCreation | undefined,
    normalizedDate: string
  ): EntryRecurrence | undefined {
    if (!recurrence || recurrence.frequency !== 'monthly') {
      return undefined;
    }

    const termination = this.sanitizeTermination(recurrence.termination);
    if (!termination) {
      return undefined;
    }

    return {
      recurrenceId: this.generateId(),
      anchorDate: normalizedDate,
      occurrenceIndex: 0,
      frequency: recurrence.frequency,
      termination,
      excludedOccurrences: [],
    };
  }

  /**
   * Normalizes the recurrence metadata retrieved from the storage.
   *
   * @param value Raw recurrence metadata.
   * @param fallbackAnchor Anchor date used when the stored value is invalid.
   * @returns The normalized recurrence metadata and whether a fix was required.
   */
  private normalizeStoredRecurrence(
    value: unknown,
    fallbackAnchor: string
  ): { recurrence?: EntryRecurrence; requiresSync: boolean } {
    if (value === undefined) {
      return { recurrence: undefined, requiresSync: false };
    }

    if (!value || typeof value !== 'object') {
      return { recurrence: undefined, requiresSync: true };
    }

    const candidate = value as Partial<EntryRecurrence> & {
      termination?: unknown;
      frequency?: unknown;
      excludedOccurrences?: unknown;
    };

    if (candidate.frequency !== 'monthly') {
      return { recurrence: undefined, requiresSync: true };
    }

    const recurrenceId =
      typeof candidate.recurrenceId === 'string' &&
      candidate.recurrenceId.trim().length > 0
        ? candidate.recurrenceId
        : this.generateId();

    let requiresSync = recurrenceId !== candidate.recurrenceId;

    const anchorSource =
      typeof candidate.anchorDate === 'string'
        ? candidate.anchorDate
        : fallbackAnchor;
    const anchor = new Date(anchorSource);
    const anchorDate = Number.isNaN(anchor.getTime())
      ? fallbackAnchor
      : anchor.toISOString();

    if (anchorDate !== candidate.anchorDate) {
      requiresSync = true;
    }

    const occurrenceIndex =
      typeof candidate.occurrenceIndex === 'number' &&
      Number.isInteger(candidate.occurrenceIndex) &&
      candidate.occurrenceIndex >= 0
        ? candidate.occurrenceIndex
        : 0;

    if (occurrenceIndex !== candidate.occurrenceIndex) {
      requiresSync = true;
    }

    const terminationNormalization = this.normalizeTerminationInput(
      candidate.termination
    );
    if (!terminationNormalization.termination) {
      return { recurrence: undefined, requiresSync: true };
    }

    requiresSync ||= terminationNormalization.requiresSync;

    const excludedNormalization = this.normalizeExcludedOccurrences(
      candidate.excludedOccurrences
    );
    requiresSync ||= excludedNormalization.requiresSync;

    return {
      recurrence: {
        recurrenceId,
        anchorDate,
        occurrenceIndex,
        frequency: 'monthly',
        termination: terminationNormalization.termination,
        excludedOccurrences: excludedNormalization.values,
      },
      requiresSync,
    };
  }

  /**
   * Validates and normalizes a termination object retrieved from storage.
   *
   * @param value Termination value retrieved from storage.
   * @returns The normalized termination and whether a fix was applied.
   */
  private normalizeTerminationInput(
    value: unknown
  ): {
    termination?: EntryRecurrenceTermination;
    requiresSync: boolean;
  } {
    if (!value || typeof value !== 'object') {
      return { termination: undefined, requiresSync: true };
    }

    const candidate = value as { mode?: unknown; total?: unknown };

    if (candidate.mode === 'indefinite') {
      return {
        termination: { mode: 'indefinite' },
        requiresSync: false,
      };
    }

    if (candidate.mode === 'occurrences') {
      const totalValue =
        typeof candidate.total === 'number'
          ? candidate.total
          : Number.parseInt(String(candidate.total ?? ''), 10);
      if (
        Number.isFinite(totalValue) &&
        totalValue !== null &&
        totalValue >= 1
      ) {
        const normalizedTotal = Math.trunc(totalValue);
        return {
          termination: { mode: 'occurrences', total: normalizedTotal },
          requiresSync: normalizedTotal !== totalValue,
        };
      }

      return { termination: undefined, requiresSync: true };
    }

    return { termination: undefined, requiresSync: true };
  }

  /**
   * Normalizes the excluded occurrences array retrieved from storage.
   *
   * @param value Raw excluded occurrences value.
   * @returns The normalized occurrence indexes and whether a fix was applied.
   */
  private normalizeExcludedOccurrences(
    value: unknown
  ): { values: number[]; requiresSync: boolean } {
    if (value === undefined) {
      return { values: [], requiresSync: false };
    }

    if (!Array.isArray(value)) {
      return { values: [], requiresSync: true };
    }

    let requiresSync = false;
    const normalized = value.reduce<number[]>((acc, item) => {
      const parsed =
        typeof item === 'number'
          ? item
          : Number.parseInt(String(item ?? ''), 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        requiresSync = true;
        return acc;
      }

      acc.push(parsed);
      return acc;
    }, []);

    const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
    if (unique.length !== normalized.length) {
      requiresSync = true;
    }

    return { values: unique, requiresSync };
  }

  /**
   * Validates the termination payload provided during entry creation.
   *
   * @param termination Termination payload.
   * @returns The sanitized termination or null when invalid.
   */
  private sanitizeTermination(
    termination: EntryRecurrenceTermination | undefined
  ): EntryRecurrenceTermination | null {
    if (!termination) {
      return null;
    }

    if (termination.mode === 'indefinite') {
      return { mode: 'indefinite' };
    }

    if (termination.mode === 'occurrences') {
      const total = Math.trunc(termination.total);
      if (Number.isNaN(total) || total < 1) {
        return null;
      }

      return { mode: 'occurrences', total };
    }

    return null;
  }

  /**
   * Determines whether two recurrence metadata instances are equivalent.
   *
   * @param left First recurrence metadata.
   * @param right Second recurrence metadata.
   * @returns True when both recurrences describe the same series.
   */
  private areRecurrencesEqual(
    left?: EntryRecurrence,
    right?: EntryRecurrence
  ): boolean {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return (
      left.recurrenceId === right.recurrenceId &&
      left.anchorDate === right.anchorDate &&
      left.occurrenceIndex === right.occurrenceIndex &&
      left.frequency === right.frequency &&
      this.areTerminationsEqual(left.termination, right.termination) &&
      this.areExcludedOccurrencesEqual(
        left.excludedOccurrences,
        right.excludedOccurrences
      )
    );
  }

  /**
   * Compares two termination definitions.
   *
   * @param left First termination.
   * @param right Second termination.
   * @returns True when both terminations are equivalent.
   */
  private areTerminationsEqual(
    left: EntryRecurrenceTermination,
    right: EntryRecurrenceTermination
  ): boolean {
    if (left.mode !== right.mode) {
      return false;
    }

    if (left.mode === 'occurrences' && right.mode === 'occurrences') {
      return left.total === right.total;
    }

    return true;
  }

  /**
   * Compares two excluded occurrences arrays.
   *
   * @param left First excluded occurrences array.
   * @param right Second excluded occurrences array.
   * @returns True when both arrays contain the same indexes.
   */
  private areExcludedOccurrencesEqual(
    left: number[] | undefined,
    right: number[] | undefined
  ): boolean {
    const normalizedLeft = [...(left ?? [])].sort((a, b) => a - b);
    const normalizedRight = [...(right ?? [])].sort((a, b) => a - b);

    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }

    for (let index = 0; index < normalizedLeft.length; index += 1) {
      if (normalizedLeft[index] !== normalizedRight[index]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Adjusts the recurrence termination after removing occurrences above the cutoff index.
   *
   * @param termination Original termination definition.
   * @param cutoffIndex Cutoff occurrence index (exclusive upper bound).
   * @returns The adjusted termination definition.
   */
  private truncateTerminationAfterCutoff(
    termination: EntryRecurrenceTermination,
    cutoffIndex: number
  ): EntryRecurrenceTermination {
    const safeCutoff = Math.max(cutoffIndex, 0);

    if (termination.mode === 'indefinite') {
      return {
        mode: 'occurrences',
        total: safeCutoff,
      };
    }

    const total = Math.min(termination.total, safeCutoff);
    return {
      mode: 'occurrences',
      total,
    };
  }

  /**
   * Removes the entry matching the provided identifier.
   *
   * @param entryId Identifier of the entry to remove.
   */
  removeEntry(
    entryId: string,
    scope: RecurrenceRemovalScope = 'single'
  ): void {
    const currentEntries = this.entriesSubject.value;
    const targetEntry = currentEntries.find((entry) => entry.id === entryId);

    if (!targetEntry) {
      return;
    }

    if (!this.isMonthlyRecurringEntry(targetEntry)) {
      const updatedEntries = currentEntries.filter((entry) => entry.id !== entryId);
      if (updatedEntries.length === currentEntries.length) {
        return;
      }
      this.persistEntries(updatedEntries);
      return;
    }

    const recurrenceId = targetEntry.recurrence.recurrenceId;
    const occurrenceIndex = targetEntry.recurrence.occurrenceIndex;

    if (scope === 'series' || (scope === 'future' && occurrenceIndex === 0)) {
      const updatedEntries = currentEntries.filter(
        (entry) =>
          !(
            this.isMonthlyRecurringEntry(entry) &&
            entry.recurrence.recurrenceId === recurrenceId
          )
      );

      if (updatedEntries.length === currentEntries.length) {
        return;
      }

      this.persistEntries(updatedEntries);
      return;
    }

    if (scope === 'future') {
      const retainedEntries = currentEntries.filter((entry) => {
        if (!this.isMonthlyRecurringEntry(entry)) {
          return entry.id !== entryId;
        }

        if (entry.recurrence.recurrenceId !== recurrenceId) {
          return entry.id !== entryId;
        }

        return entry.recurrence.occurrenceIndex < occurrenceIndex;
      });

      if (retainedEntries.length === currentEntries.length) {
        return;
      }

      const updatedTermination = this.truncateTerminationAfterCutoff(
        targetEntry.recurrence.termination,
        occurrenceIndex
      );

      const sanitizedEntries = retainedEntries.map((entry) => {
        if (
          !this.isMonthlyRecurringEntry(entry) ||
          entry.recurrence.recurrenceId !== recurrenceId
        ) {
          return entry;
        }

        const filteredExcluded = (entry.recurrence.excludedOccurrences ?? []).filter(
          (value) => value < occurrenceIndex
        );

        return {
          ...entry,
          updatedAt: new Date().toISOString(),
          recurrence: {
            ...entry.recurrence,
            termination: updatedTermination,
            excludedOccurrences: filteredExcluded,
          },
        };
      });

      this.persistEntries(sanitizedEntries);
      return;
    }

    const withoutTarget = currentEntries.filter((entry) => entry.id !== entryId);
    const updatedEntries = withoutTarget.map((entry) => {
      if (
        !this.isMonthlyRecurringEntry(entry) ||
        entry.recurrence.recurrenceId !== recurrenceId
      ) {
        return entry;
      }

      const excludedSet = new Set(entry.recurrence.excludedOccurrences ?? []);
      excludedSet.add(occurrenceIndex);
      const excludedOccurrences = Array.from(excludedSet).sort((a, b) => a - b);

      return {
        ...entry,
        updatedAt: new Date().toISOString(),
        recurrence: {
          ...entry.recurrence,
          excludedOccurrences,
        },
      };
    });

    this.persistEntries(updatedEntries);
  }

  /**
   * Replaces the current entry collection with the data provided in the import payload.
   *
   * @param rawData Data obtained from an import file.
   */
  importEntries(rawData: unknown): void {
    const normalizedEntries: EntryData[] = this.extractAndNormalizeImportedEntries(rawData);

    this.persistEntries(normalizedEntries);
    this.ensureRecurringEntriesUpTo(new Date());
  }

  /**
   * Retrieves an immutable snapshot of the current entry collection.
   *
   * @returns The current entries stored in memory.
   */
  getEntriesSnapshot(): EntryData[] {
    this.ensureRecurringEntriesUpTo(new Date());
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
   * Generates additional occurrences for recurring entries up to the month that contains the provided date.
   *
   * @param targetDate Date whose month bounds the recurrence expansion.
   */
  private ensureRecurringEntriesUpTo(targetDate: Date): void {
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
      return;
    }

    const currentEntries = this.entriesSubject.value;
    if (currentEntries.length === 0) {
      return;
    }

    const recurringEntries = currentEntries.filter(
      (entry): entry is EntryData & { recurrence: EntryRecurrence } =>
        this.isMonthlyRecurringEntry(entry)
    );

    if (recurringEntries.length === 0) {
      return;
    }

    const grouped = new Map<
      string,
      {
        template: EntryData & { recurrence: EntryRecurrence };
        occurrences: Array<EntryData & { recurrence: EntryRecurrence }>;
      }
    >();

    recurringEntries.forEach((entry) => {
      const recurrence = entry.recurrence;
      const existing = grouped.get(recurrence.recurrenceId);
      if (!existing) {
        grouped.set(recurrence.recurrenceId, {
          template: entry,
          occurrences: [entry],
        });
        return;
      }

      existing.occurrences.push(entry);
      if (recurrence.occurrenceIndex === 0) {
        existing.template = entry;
      }
    });

    if (grouped.size === 0) {
      return;
    }

    let mutated = false;
    const updatedEntries = [...currentEntries];

    grouped.forEach(({ template, occurrences }) => {
      const recurrence = template.recurrence;

      const maxIndex = this.resolveMaxOccurrenceIndex(recurrence, targetDate);
      if (maxIndex === null) {
        return;
      }

      const existingIndices = new Set(
        occurrences.map((item) => item.recurrence.occurrenceIndex)
      );
      const excludedSet = new Set(recurrence.excludedOccurrences ?? []);

      for (let index = 0; index <= maxIndex; index += 1) {
        if (existingIndices.has(index) || excludedSet.has(index)) {
          continue;
        }

        const anchorDate = new Date(recurrence.anchorDate);
        if (Number.isNaN(anchorDate.getTime())) {
          break;
        }

        const occurrenceDate = this.addMonths(anchorDate, index);
        const normalizedDate = occurrenceDate.toISOString();
        const newEntry: EntryData = {
          id: this.generateId(),
          amount: template.amount,
          date: normalizedDate,
          description: template.description,
          type: template.type,
          updatedAt: new Date().toISOString(),
          recurrence: {
            ...recurrence,
            occurrenceIndex: index,
            excludedOccurrences: [...(recurrence.excludedOccurrences ?? [])],
          },
        };

        updatedEntries.push(newEntry);
        mutated = true;
      }
    });

    if (!mutated) {
      return;
    }

    updatedEntries.sort(
      (left, right) =>
        new Date(left.date).getTime() - new Date(right.date).getTime()
    );

    void Promise.resolve().then(() => {
      this.persistEntries(updatedEntries);
    });
  }

  /**
   * Determines whether the provided entry has monthly recurrence metadata.
   *
   * @param entry Entry to evaluate.
   * @returns True when the entry belongs to a monthly recurrence series.
   */
  private isMonthlyRecurringEntry(
    entry: EntryData
  ): entry is EntryData & { recurrence: EntryRecurrence } {
    return (
      entry.recurrence !== undefined &&
      entry.recurrence.frequency === 'monthly'
    );
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
    _entries: EntryData[],
    type: EntryType,
    referenceDate: Date
  ): number {
    this.ensureRecurringEntriesUpTo(referenceDate);
    const dataset = this.entriesSubject.value;
    const referenceKey = this.buildMonthKey(referenceDate);
    return dataset.reduce((total, entry) => {
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
    let updatedAt: string | undefined;
    let updatedAtRequiresSync = false;
    if (entry.updatedAt !== undefined) {
      const result = this.normalizeDate(entry.updatedAt);
      updatedAt = result.normalizedDate;
      updatedAtRequiresSync = result.requiresSync;
    }
    const {
      recurrence,
      requiresSync: recurrenceRequiresSync,
    } = this.normalizeStoredRecurrence(entry.recurrence, normalizedDate);

    const id =
      typeof entry.id === 'string' && entry.id.trim().length > 0
        ? entry.id
        : this.generateId();

    const requiresSync =
      dateRequiresSync ||
      id !== entry.id ||
      typeRequiresSync ||
      updatedAtRequiresSync ||
      recurrenceRequiresSync;

    return {
      entry: {
        id,
        amount,
        date: normalizedDate,
        description,
        type,
        updatedAt,
        recurrence,
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

  extractAndNormalizeImportedEntries(importedData: any): EntryData[] {
      console.debug('Extracting and normalizing imported entries.', importedData);
      const importedEntries = this.extractImportedEntries(importedData);

      const normalizedImported: EntryData[] = [];
      importedEntries.forEach((entry) => {
        const normalized = this.normalizeStoredEntry(entry);
        if (!normalized) {
          throw new Error('Invalid entry detected during import.');
        }
        normalizedImported.push(normalized.entry);
      });
      return normalizedImported;
  }

  async compareAndMergeEntries(importedData: unknown): Promise<{
    added: number;
    updated: number;
    skipped: number;
  }> {
    let parsedData: any;
    try {
      parsedData = JSON.parse(importedData as string);
    } catch (error) {
      throw new Error('Failed to parse import data as JSON.');
    }

    const normalizedImported = this.extractAndNormalizeImportedEntries(parsedData);

    const currentEntries = this.entriesSubject.value;
    const currentEntriesMap = new Map<string, EntryData>();
    currentEntries.forEach((entry) => {
      currentEntriesMap.set(entry.id, entry);
    });

    let added = 0;
    let updated = 0;
    let skipped = 0;

    normalizedImported.forEach((importedEntry) => {
      const existingEntry = currentEntriesMap.get(importedEntry.id);
      if (!existingEntry) {
        currentEntriesMap.set(importedEntry.id, importedEntry);
        added += 1;
        return;
      }

      const isUnchanged =
        importedEntry.amount === existingEntry.amount &&
        importedEntry.date === existingEntry.date &&
        importedEntry.description === existingEntry.description &&
        importedEntry.type === existingEntry.type &&
        this.areRecurrencesEqual(
          importedEntry.recurrence,
          existingEntry.recurrence
        );

      if (isUnchanged) {
        skipped += 1;
        return;
      }

      // check which entry is more recent
      const importedUpdatedAt = importedEntry.updatedAt
        ? new Date(importedEntry.updatedAt)
        : null;
      const existingUpdatedAt = existingEntry.updatedAt
        ? new Date(existingEntry.updatedAt)
        : null;

      const importedIsMoreRecent =
        importedUpdatedAt &&
        (!existingUpdatedAt || importedUpdatedAt > existingUpdatedAt);

      currentEntriesMap.set(importedEntry.id, importedIsMoreRecent ? importedEntry : existingEntry);
      updated += 1;
    });

    const mergedEntries = Array.from(currentEntriesMap.values());
    this.persistEntries(mergedEntries);
    this.ensureRecurringEntriesUpTo(new Date());

    return { added, updated, skipped };
  }

  async deleteAllData(): Promise<void> {
    this.persistEntries([]);
  }
}
