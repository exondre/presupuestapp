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
}

/**
 * Represents the payload required to create a new entry.
 */
export type EntryCreation = Omit<EntryData, 'id'>;

/**
 * Represents the payload emitted when updating an existing entry through the UI.
 */
export interface EntryUpdatePayload {
  id: string;
  amount: number;
  date: string;
  description?: string;
}
