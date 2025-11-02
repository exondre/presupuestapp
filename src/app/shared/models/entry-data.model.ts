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
  amount: number;
  date: string;
  description?: string;
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
}
