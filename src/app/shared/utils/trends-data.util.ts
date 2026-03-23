import { EntryData, EntryType } from '../models/entry-data.model';
import { resolveInstallmentDisplayDetailsFromEntry } from './recurrence-installment-display.util';

/**
 * Aggregated amounts for a single month, split by entry category.
 */
export interface TrendMonthData {
  monthKey: string;
  month: number;
  year: number;
  income: number;
  commonExpense: number;
  recurringExpense: number;
  installmentExpense: number;
  totalExpense: number;
  isCurrent: boolean;
}

/**
 * Complete chart data including all months and the maximum single-category amount.
 */
export interface TrendsChartData {
  months: TrendMonthData[];
  maxAmount: number;
}

const CHILE_TIMEZONE = 'America/Santiago';

const monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHILE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
});

/**
 * Builds a YYYY-MM month key from a Date using Chile timezone.
 *
 * @param date Date to extract the month key from.
 * @returns A string in YYYY-MM format.
 */
export function buildMonthKey(date: Date): string {
  const parts = new Map(
    monthKeyFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.get('year') ?? '0000'}-${parts.get('month') ?? '01'}`;
}

/**
 * Parses a YYYY-MM month key into month and year numbers.
 *
 * @param key Month key in YYYY-MM format.
 * @returns An object with month (1-12) and year.
 */
function parseMonthKey(key: string): { month: number; year: number } {
  const [yearStr, monthStr] = key.split('-');
  return { month: parseInt(monthStr, 10), year: parseInt(yearStr, 10) };
}

/**
 * Generates a YYYY-MM key from month (1-12) and year numbers.
 *
 * @param month Month number (1-12).
 * @param year Four-digit year.
 * @returns A string in YYYY-MM format.
 */
function toMonthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Adds a number of months to a given month/year pair.
 *
 * @param month Starting month (1-12).
 * @param year Starting year.
 * @param offset Number of months to add (can be negative).
 * @returns The resulting month and year.
 */
function addMonths(
  month: number,
  year: number,
  offset: number,
): { month: number; year: number } {
  const totalMonths = (year * 12 + (month - 1)) + offset;
  return {
    month: (totalMonths % 12) + 1,
    year: Math.floor(totalMonths / 12),
  };
}

/**
 * Compares two month/year pairs. Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * @param a First month/year.
 * @param b Second month/year.
 * @returns Comparison result.
 */
function compareMonths(
  a: { month: number; year: number },
  b: { month: number; year: number },
): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

/**
 * Scans entries for the farthest installment end date.
 *
 * @param entries All entries to scan.
 * @returns The farthest month/year where an installment ends, or null if none found.
 */
export function resolveLastInstallmentMonth(
  entries: EntryData[],
): { month: number; year: number } | null {
  let latest: { month: number; year: number } | null = null;

  for (const entry of entries) {
    if (
      entry.type !== EntryType.EXPENSE ||
      !entry.recurrence ||
      entry.recurrence.frequency !== 'monthly' ||
      entry.recurrence.termination.mode !== 'occurrences'
    ) {
      continue;
    }

    const anchorDate = new Date(entry.recurrence.anchorDate);
    if (Number.isNaN(anchorDate.getTime())) continue;

    const total = entry.recurrence.termination.total;
    if (!Number.isInteger(total) || total < 1) continue;

    const lastDate = new Date(anchorDate);
    lastDate.setUTCMonth(lastDate.getUTCMonth() + total - 1);

    const lastMonthKey = buildMonthKey(lastDate);
    const parsed = parseMonthKey(lastMonthKey);

    if (!latest || compareMonths(parsed, latest) > 0) {
      latest = parsed;
    }
  }

  return latest;
}

/**
 * Builds the complete trends chart data from entries.
 *
 * @param monthEntriesMap Map of YYYY-MM keys to entries for past/current months.
 * @param allEntries All entries (used to project future installments).
 * @param now Reference date for determining the current month.
 * @returns Chart data with month slots and max amount for scaling.
 */
export function buildTrendsData(
  monthEntriesMap: Map<string, EntryData[]>,
  allEntries: EntryData[],
  now: Date,
): TrendsChartData {
  const currentKey = buildMonthKey(now);
  const current = parseMonthKey(currentKey);

  const start = addMonths(current.month, current.year, -2);
  const lastInstallment = resolveLastInstallmentMonth(allEntries);
  const end = lastInstallment && compareMonths(lastInstallment, current) > 0
    ? lastInstallment
    : current;

  // Generate month slots
  const months: TrendMonthData[] = [];
  let cursor = { ...start };
  while (compareMonths(cursor, end) <= 0) {
    const key = toMonthKey(cursor.month, cursor.year);
    months.push({
      monthKey: key,
      month: cursor.month,
      year: cursor.year,
      income: 0,
      commonExpense: 0,
      recurringExpense: 0,
      installmentExpense: 0,
      totalExpense: 0,
      isCurrent: key === currentKey,
    });
    cursor = addMonths(cursor.month, cursor.year, 1);
  }

  // Categorize existing entries for past/current months
  for (const [key, entries] of monthEntriesMap) {
    const slot = months.find((m) => m.monthKey === key);
    if (!slot) continue;

    for (const entry of entries) {
      categorizeEntry(entry, slot);
    }
  }

  // Project future installment amounts
  projectFutureInstallments(allEntries, months, currentKey);

  // Compute totalExpense and maxAmount after all categorization and projection
  let maxAmount = 0;
  for (const m of months) {
    m.totalExpense = m.commonExpense + m.recurringExpense + m.installmentExpense;
    maxAmount = Math.max(
      maxAmount,
      m.income,
      m.totalExpense,
      m.commonExpense,
      m.recurringExpense,
      m.installmentExpense,
    );
  }

  return { months, maxAmount };
}

/**
 * Categorizes a single entry into the appropriate field of a month slot.
 *
 * @param entry The entry to categorize.
 * @param slot The month slot to update.
 */
function categorizeEntry(entry: EntryData, slot: TrendMonthData): void {
  if (entry.type === EntryType.INCOME) {
    slot.income += entry.amount;
    return;
  }

  if (!entry.recurrence) {
    slot.commonExpense += entry.amount;
    return;
  }

  if (entry.recurrence.termination.mode === 'indefinite') {
    slot.recurringExpense += entry.amount;
    return;
  }

  if (entry.recurrence.termination.mode === 'occurrences') {
    slot.installmentExpense += entry.amount;
  }
}

/**
 * Projects installment amounts into future month slots from recurrence metadata.
 *
 * Groups entries by recurrenceId, finds the latest occurrence for each,
 * and projects remaining occurrences into future months.
 *
 * @param allEntries All entries to scan for installment recurrences.
 * @param months The month slots to update with projections.
 * @param currentKey The current month key (projections are only for months after this).
 */
function projectFutureInstallments(
  allEntries: EntryData[],
  months: TrendMonthData[],
  currentKey: string,
): void {
  // Group installment entries by recurrenceId
  const groups = new Map<string, EntryData>();

  for (const entry of allEntries) {
    if (
      entry.type !== EntryType.EXPENSE ||
      !entry.recurrence ||
      entry.recurrence.frequency !== 'monthly' ||
      entry.recurrence.termination.mode !== 'occurrences'
    ) {
      continue;
    }

    const { recurrenceId, occurrenceIndex } = entry.recurrence;
    const existing = groups.get(recurrenceId);
    if (!existing || occurrenceIndex > existing.recurrence!.occurrenceIndex) {
      groups.set(recurrenceId, entry);
    }
  }

  // Project remaining occurrences for each group
  for (const [, entry] of groups) {
    projectEntryOccurrences(entry, months, currentKey);
  }
}

/**
 * Projects remaining occurrences of a single installment entry into month slots.
 *
 * @param entry The installment entry to project.
 * @param months The month slots to update.
 * @param currentKey The current month key (projections are only for months after this).
 */
function projectEntryOccurrences(
  entry: EntryData,
  months: TrendMonthData[],
  currentKey: string,
): void {
  const recurrence = entry.recurrence!;
  const total = (recurrence.termination as { mode: 'occurrences'; total: number }).total;
  const anchorDate = new Date(recurrence.anchorDate);
  if (Number.isNaN(anchorDate.getTime())) return;

  const nextIndex = recurrence.occurrenceIndex + 1;

  for (let i = nextIndex; i < total; i++) {
    const projectedDate = new Date(anchorDate);
    projectedDate.setUTCMonth(projectedDate.getUTCMonth() + i);
    const projectedKey = buildMonthKey(projectedDate);

    // Only project into future months (after current)
    if (projectedKey <= currentKey) continue;

    const slot = months.find((m) => m.monthKey === projectedKey);
    if (slot) {
      slot.installmentExpense += entry.amount;
    }
  }
}

// ---------------------------------------------------------------------------
// Month detail panel data
// ---------------------------------------------------------------------------

/**
 * A single item to display in the month detail panel.
 */
export interface MonthDetailEntry {
  description: string;
  amount: number;
  installmentLabel?: string;
  isProjected: boolean;
}

/**
 * Complete detail data for a selected month.
 */
export interface MonthDetailData {
  monthKey: string;
  monthLabel: string;
  isFutureMonth: boolean;
  income: { total: number; entries: MonthDetailEntry[] };
  commonExpense: { total: number; topEntries: MonthDetailEntry[]; remainingCount: number };
  recurringExpense: { total: number; entries: MonthDetailEntry[] };
  installmentExpense: { total: number; entries: MonthDetailEntry[] };
}

/**
 * Result of categorizing a list of entries into four buckets.
 */
interface CategorizedEntries {
  income: EntryData[];
  common: EntryData[];
  recurring: EntryData[];
  installment: EntryData[];
}

const DETAIL_MONTH_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  timeZone: CHILE_TIMEZONE,
  month: 'long',
});

const DETAIL_YEAR_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  timeZone: CHILE_TIMEZONE,
  year: 'numeric',
});

/**
 * Categorizes entries into four arrays by type and recurrence mode.
 *
 * @param entries Entries to classify.
 * @returns Four arrays: income, common expense, recurring expense, installment expense.
 */
export function categorizeMonthEntries(entries: EntryData[]): CategorizedEntries {
  const result: CategorizedEntries = {
    income: [],
    common: [],
    recurring: [],
    installment: [],
  };

  for (const entry of entries) {
    if (entry.type === EntryType.INCOME) {
      result.income.push(entry);
      continue;
    }

    if (!entry.recurrence) {
      result.common.push(entry);
      continue;
    }

    if (entry.recurrence.termination.mode === 'indefinite') {
      result.recurring.push(entry);
      continue;
    }

    if (entry.recurrence.termination.mode === 'occurrences') {
      result.installment.push(entry);
    }
  }

  return result;
}

/**
 * Builds the detail data for a selected month.
 *
 * @param monthKey The YYYY-MM key of the selected month.
 * @param monthEntries Actual entries for that month (empty for future months).
 * @param allEntries All entries (needed for future installment projection).
 * @param currentKey The current month key to determine if the month is in the future.
 * @returns Complete detail data for rendering the month detail panel.
 */
export function buildMonthDetailData(
  monthKey: string,
  monthEntries: EntryData[],
  allEntries: EntryData[],
  currentKey: string,
): MonthDetailData {
  const parsed = parseMonthKey(monthKey);
  const labelDate = new Date(parsed.year, parsed.month - 1, 1);
  const monthName = DETAIL_MONTH_FORMATTER.format(labelDate);
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${DETAIL_YEAR_FORMATTER.format(labelDate)}`;
  const isFutureMonth = monthKey > currentKey;

  if (isFutureMonth) {
    const projectedEntries = projectFutureInstallmentEntries(allEntries, monthKey);
    const installmentTotal = projectedEntries.reduce((sum, e) => sum + e.amount, 0);

    return {
      monthKey,
      monthLabel,
      isFutureMonth: true,
      income: { total: 0, entries: [] },
      commonExpense: { total: 0, topEntries: [], remainingCount: 0 },
      recurringExpense: { total: 0, entries: [] },
      installmentExpense: { total: installmentTotal, entries: projectedEntries },
    };
  }

  const categorized = categorizeMonthEntries(monthEntries);

  const incomeEntries = toDetailEntries(categorized.income);
  const incomeTotal = incomeEntries.reduce((sum, e) => sum + e.amount, 0);

  const commonSorted = toDetailEntries(categorized.common)
    .sort((a, b) => b.amount - a.amount);
  const commonTotal = commonSorted.reduce((sum, e) => sum + e.amount, 0);
  const topEntries = commonSorted.slice(0, 3);
  const remainingCount = Math.max(0, commonSorted.length - 3);

  const recurringEntries = toDetailEntries(categorized.recurring);
  const recurringTotal = recurringEntries.reduce((sum, e) => sum + e.amount, 0);

  const installmentEntries = toInstallmentDetailEntries(categorized.installment);
  const installmentTotal = installmentEntries.reduce((sum, e) => sum + e.amount, 0);

  return {
    monthKey,
    monthLabel,
    isFutureMonth: false,
    income: { total: incomeTotal, entries: incomeEntries },
    commonExpense: { total: commonTotal, topEntries, remainingCount },
    recurringExpense: { total: recurringTotal, entries: recurringEntries },
    installmentExpense: { total: installmentTotal, entries: installmentEntries },
  };
}

/**
 * Converts raw entries into detail view models.
 *
 * @param entries Entries to convert.
 * @returns Detail entry view models with isProjected false.
 */
function toDetailEntries(entries: EntryData[]): MonthDetailEntry[] {
  return entries.map((entry) => ({
    description: (entry.description ?? '').trim() || 'Sin descripción',
    amount: entry.amount,
    isProjected: false,
  }));
}

/**
 * Converts installment entries into detail view models with installment labels.
 *
 * @param entries Installment entries to convert.
 * @returns Detail entry view models with installment labels.
 */
function toInstallmentDetailEntries(entries: EntryData[]): MonthDetailEntry[] {
  return entries.map((entry) => {
    const details = resolveInstallmentDisplayDetailsFromEntry(entry);
    return {
      description: (entry.description ?? '').trim() || 'Sin descripción',
      amount: entry.amount,
      installmentLabel: details?.installmentLabel,
      isProjected: false,
    };
  });
}

/**
 * Projects individual installment entries for a future month.
 *
 * Groups entries by recurrenceId, takes the latest occurrence per group,
 * and computes which occurrence falls in the target month.
 *
 * @param allEntries All entries to scan for installment recurrences.
 * @param targetMonthKey The YYYY-MM key of the future month.
 * @returns Projected detail entries for the target month.
 */
export function projectFutureInstallmentEntries(
  allEntries: EntryData[],
  targetMonthKey: string,
): MonthDetailEntry[] {
  const groups = new Map<string, EntryData>();

  for (const entry of allEntries) {
    if (
      entry.type !== EntryType.EXPENSE ||
      !entry.recurrence ||
      entry.recurrence.frequency !== 'monthly' ||
      entry.recurrence.termination.mode !== 'occurrences'
    ) {
      continue;
    }

    const { recurrenceId, occurrenceIndex } = entry.recurrence;
    const existing = groups.get(recurrenceId);
    if (!existing || occurrenceIndex > existing.recurrence!.occurrenceIndex) {
      groups.set(recurrenceId, entry);
    }
  }

  const result: MonthDetailEntry[] = [];

  for (const [, entry] of groups) {
    const recurrence = entry.recurrence!;
    const total = (recurrence.termination as { mode: 'occurrences'; total: number }).total;
    const anchorDate = new Date(recurrence.anchorDate);
    if (Number.isNaN(anchorDate.getTime())) continue;

    for (let i = 0; i < total; i++) {
      const projectedDate = new Date(anchorDate);
      projectedDate.setUTCMonth(projectedDate.getUTCMonth() + i);
      const projectedKey = buildMonthKey(projectedDate);

      if (projectedKey === targetMonthKey) {
        const installmentNumber = i + 1;
        result.push({
          description: (entry.description ?? '').trim() || 'Sin descripción',
          amount: entry.amount,
          installmentLabel: `Cuota ${installmentNumber} de ${total}`,
          isProjected: true,
        });
        break;
      }
    }
  }

  return result;
}
