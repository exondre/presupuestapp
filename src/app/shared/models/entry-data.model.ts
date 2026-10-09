/**
 * Enumerates the supported entry types in the application.
 */
export enum EntryType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
}

/**
 * Represents an entry stored in the application.
 *
 * The amount is expressed as a whole number (no decimals).
 */
export interface EntryData {
  id: string;
  amount: number;
  date: string;
  type: EntryType;
  description?: string;
  updatedAt?: string;
  recurrence?: EntryRecurrence;
  idempotencyInfo?: IdempotencyInfo[];
}

/**
 * Represents the payload required to create a new entry.
 */
export type EntryCreation = Omit<EntryData, 'id' | 'recurrence'> & {
  recurrence?: EntryRecurrenceCreation;
};

/**
 * Represents the payload emitted when updating an existing entry through the UI.
 */
export interface EntryUpdatePayload {
  id: string;
  amount?: number;
  date?: string;
  description?: string | null;
}

export type EntryScope = 'single' | 'future' | 'series';

export type EntryChanges = Omit<EntryUpdatePayload, 'id'> & { type?: EntryType };

/** Shared defaults and partial value changes, independent of actual occurrences. */
export interface EntryValueSchedule {
  revision: string;
  baseline: { amount: number; description: string | null };
  changes: Array<{
    fromOccurrenceIndex: number;
    amount?: number;
    description?: string | null;
  }>;
}

/**
 * Enumerates the supported recurrence frequencies.
 */
export type EntryRecurrenceFrequency = 'monthly';

/**
 * Defines the termination rules for a recurring entry.
 */
export type EntryRecurrenceTermination =
  | {
      mode: 'indefinite';
    }
  | {
      mode: 'occurrences';
      total: number;
    };

/**
 * Represents a recurrence definition when creating a new entry.
 */
export interface EntryRecurrenceCreation {
  frequency: EntryRecurrenceFrequency;
  termination: EntryRecurrenceTermination;
}

/**
 * Represents the recurrence metadata stored alongside an entry.
 */
export interface EntryRecurrence extends EntryRecurrenceCreation {
  recurrenceId: string;
  anchorDate: string;
  occurrenceIndex: number;
  excludedOccurrences?: number[];
  valueSchedule?: EntryValueSchedule;
}

export interface IdempotencyInfo {
  idempotencyKey: string;
  idempotencyVersion: string;
}
