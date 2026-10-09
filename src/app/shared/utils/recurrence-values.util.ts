import { EntryData, EntryValueSchedule } from '../models/entry-data.model';

/** Resolves defaults at an occurrence without changing materialized exceptions. */
export function resolveRecurrenceValues(
  template: EntryData,
  occurrenceIndex: number,
): { amount: number; description: string | null } {
  const schedule = template.recurrence?.valueSchedule;
  const values = { ...(schedule?.baseline ?? {
    amount: template.amount,
    description: template.description ?? null,
  }) };
  for (const change of schedule?.changes ?? []) {
    if (change.fromOccurrenceIndex > occurrenceIndex) {
      break;
    }
    if (change.amount !== undefined) {
      values.amount = change.amount;
    }
    if (change.description !== undefined) {
      values.description = change.description;
    }
  }
  return values;
}

/** Rejects malformed rules before storage or an import can lose future values. */
export function validateValueSchedule(value: unknown): EntryValueSchedule {
  const invalid = (): never => { throw new Error('Invalid recurring value schedule.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid();
  }
  const schedule = value as EntryValueSchedule;
  if (Object.keys(schedule).some((key) => !['revision', 'baseline', 'changes'].includes(key)) ||
      typeof schedule.revision !== 'string' ||
      !Number.isFinite(Date.parse(schedule.revision)) ||
      new Date(schedule.revision).toISOString() !== schedule.revision ||
      !schedule.baseline || typeof schedule.baseline !== 'object' ||
      Array.isArray(schedule.baseline) ||
      Object.keys(schedule.baseline).some((key) => !['amount', 'description'].includes(key)) ||
      !Number.isSafeInteger(schedule.baseline.amount) ||
      !(schedule.baseline.description === null || typeof schedule.baseline.description === 'string') ||
      !Array.isArray(schedule.changes)) {
    return invalid();
  }
  let previousIndex = -1;
  for (const change of schedule.changes) {
    if (!change || typeof change !== 'object' || Array.isArray(change) ||
        Object.keys(change).some((key) => !['fromOccurrenceIndex', 'amount', 'description'].includes(key)) ||
        !Number.isSafeInteger(change.fromOccurrenceIndex) || change.fromOccurrenceIndex <= previousIndex ||
        (change.amount === undefined && change.description === undefined) ||
        ('amount' in change && !Number.isSafeInteger(change.amount)) ||
        ('description' in change && !(change.description === null || typeof change.description === 'string'))) {
      return invalid();
    }
    previousIndex = change.fromOccurrenceIndex;
  }
  return schedule;
}

/** Selects rules by their revision, with a deterministic tie-break for offline replicas. */
export function latestValueSchedule(entries: EntryData[]): EntryValueSchedule | undefined {
  let latest: EntryValueSchedule | undefined;
  for (const entry of entries) {
    const candidate = entry.recurrence?.valueSchedule;
    if (candidate && (!latest || candidate.revision > latest.revision ||
        (candidate.revision === latest.revision && JSON.stringify(candidate) > JSON.stringify(latest)))) {
      latest = candidate;
    }
  }
  return latest;
}
