/**
 * Represents an expense stored in the application.
 *
 * The amount is expressed as a whole number (no decimals).
 */
export interface ExpenseData {
  id: string;
  amount: number;
  date: string;
  description?: string;
}

/**
 * Represents the payload required to create a new expense.
 */
export type ExpenseCreation = Omit<ExpenseData, 'id'>;
