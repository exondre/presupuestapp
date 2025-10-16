/**
 * Represents the data captured for an expense entry.
 *
 * The amount is expressed as a whole number (no decimals).
 */
export interface ExpenseData {
  amount: number;
  date: string;
  description?: string;
}
