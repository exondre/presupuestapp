import { Injectable } from '@angular/core';
import readXlsxFile, { Row } from 'read-excel-file/browser';
import { EntryCreation, EntryData, EntryRecurrenceCreation, EntryType, IdempotencyInfo } from '../models/entry-data.model';

/**
 * Represents a parsed entry from an external file import.
 */
export interface ParsedEntry {
  date: string;
  description: string;
  amount: number;
  type: EntryType;
  idempotencyInfo: IdempotencyInfo[];
  recurrence?: EntryRecurrenceCreation;
  installmentInfo?: InstallmentInfo;
}

/**
 * Display-only metadata describing the installment position of a parsed entry.
 */
export interface InstallmentInfo {
  current: number;
  total: number;
}

/**
 * Supported import formats for external files.
 */
export type ImportFormat = 'falabella-cmr';

/**
 * Result of an import operation.
 */
export interface ImportResult {
  entries: ParsedEntry[];
  totalRows: number;
  skippedRows: number;
}

/**
 * Represents an imported entry that fuzzy-matched an existing entry.
 */
export interface PotentialDuplicate {
  importedEntry: ParsedEntry;
  matchedEntry: EntryData;
}

/**
 * Result of merging imported entries against the user's existing data.
 */
export interface MergeResult {
  exactDuplicates: ParsedEntry[];
  potentialDuplicates: PotentialDuplicate[];
  readyToImport: ParsedEntry[];
}

/** Number of days of tolerance when comparing dates for fuzzy matching. */
const DATE_TOLERANCE_DAYS = 3;

/**
 * Service responsible for importing entries from external files.
 * Handles reading and parsing of different file formats (Excel, etc.)
 */
@Injectable({
  providedIn: 'root',
})
export class ExternalEntryImportService {
  /**
   * Imports entries from an Excel file using the specified format.
   *
   * @param file The Excel file to import.
   * @param format The format to use for parsing (default: 'falabella-cmr').
   * @returns Promise with the import result containing parsed entries.
   */
  async importFromExcel(file: File, format: ImportFormat = 'falabella-cmr'): Promise<ImportResult> {
    const rows = await readXlsxFile(file);

    // Debug: log raw rows to see how read-excel-file delivers the data
    console.log('Raw rows from Excel file:', rows);
    // if (rows.length > 1) {
    //   console.log('First data row sample:', rows[1]);
    // }

    switch (format) {
      case 'falabella-cmr':
        return this.parseFalabellaCmrFormat(rows);
      default:
        throw new Error(`Formato de importación no soportado: ${format}`);
    }
  }

  /**
   * Parses rows in Falabella/CMR format and extracts entry data.
   * Expected columns: Fecha, Descripcion, Titular/Adicional, Monto, Cuotas Pendientes, Valor Cuota
   *
   * @param rows The rows from the Excel file.
   * @returns Import result with parsed entries.
   */
  private parseFalabellaCmrFormat(rows: Row[]): ImportResult {
    const totalRows = rows.length > 0 ? rows.length - 1 : 0; // Exclude header
    let skippedRows = 0;

    if (rows.length < 2) {
      console.error('El archivo no contiene datos suficientes.');
      return { entries: [], totalRows: 0, skippedRows: 0 };
    }

    const entries: ParsedEntry[] = [];

    // Skip header row (index 0), process data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) {
        skippedRows++;
        continue;
      }

      // Columns: 0=Fecha, 1=Descripcion, 2=Titular/Adicional, 3=Monto, 4=Cuotas Pendientes, 5=Valor Cuota
      const rawDate = row[0];
      const rawDescription = row[1];
      const rawMonto = row[3];
      const rawCuotasPendientes = row[4];
      const rawValorCuota = row[5];

      try {
        const transactionDate = this.parseDate(rawDate);
        const description = this.normalizeFalabellaDescription(String(rawDescription ?? ''));
        const signedAmount = this.parseAmount(rawValorCuota);

        if (!transactionDate || signedAmount === 0) {
          skippedRows++;
          continue;
        }

        // Skip CMR card payments that appear as negative (credit) transactions
        if (signedAmount < 0 && description.toUpperCase() === 'PAGO TARJETA CMR') {
          skippedRows++;
          continue;
        }

        const type = signedAmount < 0 ? EntryType.INCOME : EntryType.EXPENSE;
        const amount = Math.abs(signedAmount);

        const installment = this.parseInstallmentInfo(rawMonto, rawCuotasPendientes, signedAmount);

        const entry: ParsedEntry = {
          date: transactionDate,
          description,
          amount,
          type,
          idempotencyInfo: [this.generateIdempotencyInfo(transactionDate, description, amount, type)],
        };

        if (installment) {
          entry.recurrence = {
            frequency: 'monthly',
            termination: { mode: 'occurrences', total: installment.total },
          };
          entry.installmentInfo = installment;
        }

        entries.push(entry);
      } catch (parseError) {
        console.error(`Error al parsear fila ${i + 1}:`, parseError);
        skippedRows++;
      }
    }

    return { entries, totalRows, skippedRows };
  }

  /**
   * Parses a date value to ISO string.
   * Handles both Date objects (from read-excel-file) and DD/MM/YYYY strings.
   *
   * @param rawDate The raw date value from the Excel cell.
   * @returns ISO date string or null if parsing fails.
   */
  private parseDate(rawDate: unknown): string | null {
    if (rawDate == null) {
      return null;
    }

    // Handle Date objects (read-excel-file parses Excel dates automatically).
    // The library places dates at UTC midnight, but the Excel dates represent
    // local midnight, so we extract the UTC components and reconstruct as local.
    if (rawDate instanceof Date) {
      if (isNaN(rawDate.getTime())) {
        console.error('Fecha inválida (Date object):', rawDate);
        return null;
      }
      const localDate = new Date(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate());
      return localDate.toISOString();
    }

    // Handle string format DD/MM/YYYY
    const dateStr = String(rawDate).trim();
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (!match) {
      console.error(`Formato de fecha inválido: ${dateStr}`);
      return null;
    }

    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    if (isNaN(date.getTime())) {
      console.error(`Fecha inválida: ${dateStr}`);
      return null;
    }

    return date.toISOString();
  }

  /**
   * Parses an amount value to a number.
   * Handles both numbers (from read-excel-file) and $000.000 formatted strings.
   *
   * @param rawAmount The raw amount value from the Excel cell.
   * @returns Parsed amount as a signed integer (negative for credits), or 0 if parsing fails.
   */
  private parseAmount(rawAmount: unknown): number {
    if (rawAmount == null) {
      return 0;
    }

    // Handle numbers directly (read-excel-file parses Excel numbers automatically)
    if (typeof rawAmount === 'number') {
      if (isNaN(rawAmount)) {
        return 0;
      }
      return Math.round(rawAmount);
    }

    // Handle string format $000.000
    const amountStr = String(rawAmount).trim();
    // Remove currency symbol ($) and thousand separator (.)
    const cleanedAmount = amountStr.replace(/[$\.]/g, '');
    const amount = parseInt(cleanedAmount, 10);

    if (isNaN(amount)) {
      console.error(`Monto inválido: ${amountStr}`);
      return 0;
    }

    return amount;
  }

  /**
   * Compares imported entries against the user's existing entries and classifies
   * each imported entry into one of three buckets:
   * - exactDuplicates: matched by idempotency key (already imported before).
   * - potentialDuplicates: fuzzy-matched by fields (needs user review).
   * - readyToImport: no match found, safe to add.
   *
   * @param importedEntries The entries parsed from the external file.
   * @param existingEntries The user's current stored entries.
   * @returns A MergeResult classifying each imported entry.
   */
  mergeWithExistingEntries(importedEntries: ParsedEntry[], existingEntries: EntryData[]): MergeResult {
    const exactDuplicates: ParsedEntry[] = [];
    const potentialDuplicates: PotentialDuplicate[] = [];
    const readyToImport: ParsedEntry[] = [];

    const existingKeySet = this.buildIdempotencyKeySet(existingEntries);

    for (const imported of importedEntries) {
      if (this.hasIdempotencyMatch(imported, existingKeySet)) {
        exactDuplicates.push(imported);
        continue;
      }

      const fuzzyMatch = this.findFuzzyMatch(imported, existingEntries);
      if (fuzzyMatch) {
        potentialDuplicates.push({ importedEntry: imported, matchedEntry: fuzzyMatch });
      } else {
        readyToImport.push(imported);
      }
    }

    return { exactDuplicates, potentialDuplicates, readyToImport };
  }

  /**
   * Builds a Set of all idempotency keys present in the existing entries.
   *
   * @param entries The user's stored entries.
   * @returns A Set containing every idempotency key.
   */
  private buildIdempotencyKeySet(entries: EntryData[]): Set<string> {
    const keySet = new Set<string>();
    for (const entry of entries) {
      if (entry.idempotencyInfo) {
        for (const info of entry.idempotencyInfo) {
          keySet.add(info.idempotencyKey);
        }
      }
    }
    return keySet;
  }

  /**
   * Checks whether any of the imported entry's idempotency keys exist in the set.
   *
   * @param imported The parsed imported entry.
   * @param existingKeySet Set of known idempotency keys.
   * @returns True if at least one key matches.
   */
  private hasIdempotencyMatch(imported: ParsedEntry, existingKeySet: Set<string>): boolean {
    return imported.idempotencyInfo.some((info) => existingKeySet.has(info.idempotencyKey));
  }

  /**
   * Searches for a fuzzy match between an imported entry and existing entries.
   * Requires the same EntryType and amount, plus at least one additional
   * matching field: date (±3 days) or description (exact).
   *
   * @param imported The parsed imported entry.
   * @param existingEntries The user's stored entries.
   * @returns The first matching EntryData, or null if none found.
   */
  private findFuzzyMatch(imported: ParsedEntry, existingEntries: EntryData[]): EntryData | null {
    for (const existing of existingEntries) {
      if (imported.type !== existing.type || imported.amount !== existing.amount) {
        continue;
      }

      const dateMatch = this.areDatesWithinTolerance(imported.date, existing.date, DATE_TOLERANCE_DAYS);
      if (!dateMatch) {
        continue;
      }

      const descriptionMatch = imported.description === (existing.description ?? '');

      if (dateMatch || descriptionMatch) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Determines whether two ISO date strings are within a given number of days.
   *
   * @param dateA First ISO date string.
   * @param dateB Second ISO date string.
   * @param toleranceDays Maximum allowed difference in days.
   * @returns True if the absolute day difference is within tolerance.
   */
  private areDatesWithinTolerance(dateA: string, dateB: string, toleranceDays: number): boolean {
    const msPerDay = 86_400_000;
    const diff = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime());
    return diff <= toleranceDays * msPerDay;
  }

  /**
   * Generates idempotency info for a parsed entry.
   * The description should already be normalized by the format-specific
   * parser before calling this method.
   *
   * @param date The entry date.
   * @param description The normalized entry description.
   * @param amount The entry amount.
   * @param type The entry type.
   * @returns Idempotency info with a deterministic key and version.
   */
  private generateIdempotencyInfo(date: string, description: string, amount: number, type: EntryType): IdempotencyInfo {
    const idempotencyKey = `${date}|${description}|${amount}|${type}`;
    const idempotencyVersion = '1';

    return {
      idempotencyKey,
      idempotencyVersion,
    };
  }

  /**
   * Removes a single trailing asterisk from a description string.
   * Falabella/CMR marks unconfirmed transactions with a trailing "*".
   * Once confirmed the asterisk disappears, so we strip it to keep
   * idempotency keys stable across both states.
   *
   * @param description The raw description string.
   * @returns The description without a trailing asterisk.
   */
  private removeTrailingAsterisk(description: string): string {
    return description.replace(/\*$/, '');
  }

  /**
   * Removes the Falabella purchase prefix when it appears at the start.
   *
   * @param description The description to normalize.
   * @returns The description without a leading "COMPRA" prefix.
   */
  private removeLeadingCompraPrefix(description: string): string {
    return description.replace(/^COMPRA\s+/i, '');
  }

  /**
   * Normalizes a Falabella/CMR description for stable storage and idempotency:
   * trims outer spaces, removes a trailing unconfirmed marker (*), removes a
   * leading "COMPRA" prefix, and trims again.
   *
   * @param rawDescription Raw description value from the import file.
   * @returns The normalized description string.
   */
  private normalizeFalabellaDescription(rawDescription: string): string {
    const trimmedDescription = rawDescription.trim();
    const withoutTrailingAsterisk = this.removeTrailingAsterisk(trimmedDescription);
    const withoutCompraPrefix = this.removeLeadingCompraPrefix(withoutTrailingAsterisk);
    return withoutCompraPrefix.trim();
  }

  /**
   * Converts a parsed entry into the payload required to create a new entry.
   *
   * @param parsed The parsed entry from an external file.
   * @returns An EntryCreation object ready for persistence.
   */
  toEntryCreation(parsed: ParsedEntry): EntryCreation {
    return {
      amount: parsed.amount,
      date: parsed.date,
      description: parsed.description,
      type: parsed.type,
      idempotencyInfo: parsed.idempotencyInfo,
      recurrence: parsed.recurrence,
    };
  }

  /**
   * Parses installment information from the CMR Monto and Cuotas Pendientes columns.
   * Returns null when the transaction is not an installment purchase.
   *
   * @param rawMonto Raw value from the Monto column (total purchase amount).
   * @param rawCuotasPendientes Raw value from the Cuotas Pendientes column.
   * @param signedValorCuota Parsed signed installment amount.
   * @returns Installment info or null.
   */
  private parseInstallmentInfo(
    rawMonto: unknown,
    rawCuotasPendientes: unknown,
    signedValorCuota: number,
  ): InstallmentInfo | null {
    const cuotasPendientes = this.parsePositiveInt(rawCuotasPendientes);
    if (cuotasPendientes === null || cuotasPendientes <= 0) {
      return null;
    }

    const monto = this.parseAmount(rawMonto);
    if (monto === 0) {
      return null;
    }

    const totalCuotas = Math.round(Math.abs(monto / signedValorCuota));
    if (totalCuotas < 1 || totalCuotas < cuotasPendientes) {
      return null;
    }

    const cuotasPagadas = totalCuotas - cuotasPendientes;
    return { current: cuotasPagadas + 1, total: totalCuotas };
  }

  /**
   * Parses a value as a positive integer. Returns null on failure or non-positive values.
   *
   * @param value Raw value to parse.
   * @returns Positive integer or null.
   */
  private parsePositiveInt(value: unknown): number | null {
    if (value == null) {
      return null;
    }

    const num = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (isNaN(num) || num <= 0) {
      return null;
    }

    return Math.trunc(num);
  }
}
