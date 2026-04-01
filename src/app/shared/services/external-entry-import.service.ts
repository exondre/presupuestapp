import { Injectable } from '@angular/core';
import readXlsxFile, { Row } from 'read-excel-file/browser';
import { EntryCreation, EntryData, EntryRecurrenceCreation, EntryType, IdempotencyInfo } from '../models/entry-data.model';
import { UserInfo } from '../models/user-info.model';

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
export type ImportFormat = 'falabella-cmr' | 'bice-provisoria' | 'bice-definitiva';

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
  selfTransfers?: SelfTransferEntry[];
}

/**
 * Result of attempting to auto-detect the import format from raw Excel rows.
 * When format is null, detection failed and the caller should ask the user.
 */
export interface FormatDetectionResult {
  format: ImportFormat | null;
}

/**
 * A parsed entry flagged as a potential self-transfer between the user's own accounts.
 */
export interface SelfTransferEntry {
  entry: ParsedEntry;
  ignored: boolean;
}

/** Number of days of tolerance when comparing dates for fuzzy matching. */
const DATE_TOLERANCE_DAYS = 3;

/** Sentinel error message thrown when auto-detection fails. */
export const FORMAT_DETECTION_FAILED = 'FORMAT_DETECTION_FAILED';

/**
 * Service responsible for importing entries from external files.
 * Handles reading and parsing of different file formats (Excel, etc.)
 */
@Injectable({
  providedIn: 'root',
})
export class ExternalEntryImportService {
  private static readonly SPANISH_MONTHS: Record<string, number> = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  };

  /**
   * Imports entries from an Excel file, auto-detecting the format when not specified.
   * Throws FORMAT_DETECTION_FAILED if the format cannot be determined automatically.
   *
   * @param file The Excel file to import.
   * @param format Optional format override. When omitted, auto-detection is used.
   * @returns Promise with the import result containing parsed entries.
   */
  async importFromExcel(file: File, format?: ImportFormat): Promise<ImportResult> {
    const rows = await readXlsxFile(file);

    const resolvedFormat = format ?? this.detectFormat(rows).format;
    if (!resolvedFormat) {
      throw new Error(FORMAT_DETECTION_FAILED);
    }

    switch (resolvedFormat) {
      case 'falabella-cmr':
        return this.parseFalabellaCmrFormat(rows);
      case 'bice-provisoria':
        return this.parseBiceFormat(rows, 'provisoria');
      case 'bice-definitiva':
        return this.parseBiceFormat(rows, 'definitiva');
      default:
        throw new Error(`Formato de importación no soportado: ${resolvedFormat}`);
    }
  }

  /**
   * Attempts to auto-detect the import format from the raw Excel rows.
   * Returns { format: null } when detection is inconclusive.
   *
   * @param rows The rows read from the Excel file.
   * @returns Detection result with the matched format or null.
   */
  detectFormat(rows: Row[]): FormatDetectionResult {
    if (rows.length === 0) {
      return { format: null };
    }

    // CMR Falabella: header row contains "Descripcion" AND ("Cuotas Pendientes" OR "Valor Cuota")
    const firstRowCells = rows[0].map((cell) => String(cell ?? '').toLowerCase());
    const hasDescripcion = firstRowCells.some((c) => c.includes('descripcion'));
    const hasCuotas = firstRowCells.some((c) => c.includes('cuotas pendientes') || c.includes('valor cuota'));
    if (hasDescripcion && hasCuotas) {
      return { format: 'falabella-cmr' };
    }

    // BICE: look for "Abonos y cargos" section marker in first 45 rows
    const scanLimit = Math.min(rows.length, 45);
    let foundAbonosYCargos = false;
    for (let i = 0; i < scanLimit; i++) {
      const row = rows[i];
      if (!row) continue;
      const hasMarker = row.some((cell) => String(cell ?? '').toLowerCase().includes('abonos y cargos'));
      if (hasMarker) {
        foundAbonosYCargos = true;
        break;
      }
    }

    if (foundAbonosYCargos) {
      // Differentiate by presence of "Saldos diarios" anywhere in the file
      const hasSaldosDiarios = rows.some((row) =>
        row?.some((cell) => String(cell ?? '').toLowerCase().includes('saldos diarios')),
      );
      return { format: hasSaldosDiarios ? 'bice-definitiva' : 'bice-provisoria' };
    }

    return { format: null };
  }

  /**
   * Parses rows in BICE Cuenta Corriente format (both Provisoria and Definitiva variants).
   * Locates the "Abonos y cargos" section dynamically and reads until an empty row or
   * "Saldos diarios" is encountered.
   *
   * Column offsets:
   * - Provisoria: Fecha(1), Categoría(2), Descripción(3), Monto(4)
   * - Definitiva: Fecha(1), Categoría(2), Nº operación(3 — ignored), Descripción(4), Monto(5)
   *
   * @param rows The rows from the Excel file.
   * @param variant Whether this is a 'provisoria' or 'definitiva' cartola.
   * @returns Import result with parsed entries.
   */
  private parseBiceFormat(rows: Row[], variant: 'provisoria' | 'definitiva'): ImportResult {
    // Find the "Abonos y cargos" section marker
    let sectionStartRow = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row?.some((cell) => String(cell ?? '').toLowerCase().includes('abonos y cargos'))) {
        sectionStartRow = i;
        break;
      }
    }

    if (sectionStartRow === -1) {
      console.error('No se encontró la sección "Abonos y cargos" en el archivo BICE.');
      return { entries: [], totalRows: 0, skippedRows: 0 };
    }

    const cols = variant === 'provisoria'
      ? { fecha: 1, categoria: 2, descripcion: 3, monto: 4 }
      : { fecha: 1, categoria: 2, descripcion: 4, monto: 5 };

    const dataStartRow = sectionStartRow + 2; // skip section header + column header row
    const entries: ParsedEntry[] = [];
    let totalRows = 0;
    let skippedRows = 0;

    for (let i = dataStartRow; i < rows.length; i++) {
      const row = rows[i];

      // Stop on empty row or "Saldos diarios" marker
      if (!row || row.every((cell) => cell == null)) break;
      if (row.some((cell) => String(cell ?? '').toLowerCase().includes('saldos diarios'))) break;

      totalRows++;

      try {
        const rawFecha = row[cols.fecha];
        const rawCategoria = row[cols.categoria];
        const rawDescripcion = row[cols.descripcion];
        const rawMonto = row[cols.monto];

        const transactionDate = this.parseSpanishDate(rawFecha);
        if (!transactionDate) {
          skippedRows++;
          continue;
        }

        const categoriaStr = String(rawCategoria ?? '').toLowerCase();
        let type: EntryType;
        if (categoriaStr.includes('cargo')) {
          type = EntryType.EXPENSE;
        } else if (categoriaStr.includes('abono')) {
          type = EntryType.INCOME;
        } else {
          skippedRows++;
          continue;
        }

        const amount = Math.abs(this.parseAmount(rawMonto));
        if (amount === 0) {
          skippedRows++;
          continue;
        }

        const displayDescription = String(rawDescripcion ?? '').trim();
        const normalizedDescription = this.normalizeBiceDescription(displayDescription);

        const entry: ParsedEntry = {
          date: transactionDate,
          description: displayDescription,
          amount,
          type,
          idempotencyInfo: [this.generateIdempotencyInfo(transactionDate, normalizedDescription, amount, type)],
        };

        entries.push(entry);
      } catch (parseError) {
        console.error(`Error al parsear fila BICE ${i + 1}:`, parseError);
        skippedRows++;
      }
    }

    return { entries, totalRows, skippedRows };
  }

  /**
   * Detects parsed entries that are likely self-transfers between the user's own accounts.
   * Requires user info to be registered. Returns entries flagged as ignored by default.
   *
   * Detection heuristics (applied to lowercased description with dots removed):
   * 1. User's RUT appears 2+ times → sender and recipient are the same person.
   * 2. User's RUT appears once + description contains "abono por transferencia" +
   *    at least 2 name parts match → inbound transfer from own account.
   *
   * @param entries The parsed entries to analyze.
   * @param userInfo The registered user info, or null if not available.
   * @returns Array of self-transfer entries, each ignored by default.
   */
  detectSelfTransfers(entries: ParsedEntry[], userInfo: UserInfo | null): SelfTransferEntry[] {
    if (!userInfo) return [];

    // Normalize RUT: remove all non-alphanumeric characters so that any stored
    // format ("256819791", "25681979-1", "25.681.979-1") yields the same string
    // for comparison (e.g. "256819791").
    const normalizedRut = userInfo.idDocument.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Split name into parts of 2+ characters for partial matching
    const nameParts = userInfo.fullName
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 2);

    const selfTransfers: SelfTransferEntry[] = [];

    for (const entry of entries) {
      if (this.isSelfTransfer(entry.description, normalizedRut, nameParts)) {
        selfTransfers.push({ entry, ignored: true });
      }
    }

    return selfTransfers;
  }

  /**
   * Determines whether a transaction description corresponds to a self-transfer.
   *
   * @param description Raw entry description.
   * @param normalizedRut User's RUT with all non-alphanumeric chars removed, lowercased.
   * @param nameParts User's name split into lowercase parts.
   * @returns True if the description matches self-transfer patterns.
   */
  private isSelfTransfer(description: string, normalizedRut: string, nameParts: string[]): boolean {
    const descLower = description.toLowerCase();

    // Strip all non-alphanumeric characters for RUT matching so that "25.681.979-1",
    // "25681979-1" and "256819791" all compare equal against normalizedRut.
    const descForRut = descLower.replace(/[^a-z0-9]/g, '');
    const rutOccurrences = this.countOccurrences(descForRut, normalizedRut);

    // Case 1: RUT appears 2+ times → user is both sender and recipient
    if (rutOccurrences >= 2) return true;

    // Case 2: Inbound transfer from own account
    // ("abono por transferencia" + user's RUT + at least 2 name parts)
    if (rutOccurrences === 1 && descLower.includes('abono por transferencia')) {
      const nameMatchCount = nameParts.filter((part) => descLower.includes(part)).length;
      if (nameMatchCount >= 2) return true;
    }

    return false;
  }

  /**
   * Counts non-overlapping occurrences of a substring within a string.
   *
   * @param haystack The string to search in.
   * @param needle The substring to count.
   * @returns Number of occurrences.
   */
  private countOccurrences(haystack: string, needle: string): number {
    if (!needle) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = haystack.indexOf(needle, pos)) !== -1) {
      count++;
      pos += needle.length;
    }
    return count;
  }

  /**
   * Parses a BICE date string in "DD MMM YYYY" Spanish format to an ISO string.
   * Examples: "30 mar 2026", "2 feb 2026".
   *
   * @param rawDate The raw date value from the Excel cell.
   * @returns ISO date string or null if parsing fails.
   */
  private parseSpanishDate(rawDate: unknown): string | null {
    if (rawDate == null) return null;

    const dateStr = String(rawDate).trim().toLowerCase();
    const match = dateStr.match(
      /^(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+(\d{4})$/,
    );
    if (!match) return null;

    const [, day, monthAbbr, year] = match;
    const monthIndex = ExternalEntryImportService.SPANISH_MONTHS[monthAbbr];
    if (monthIndex === undefined) return null;

    const date = new Date(Number(year), monthIndex, Number(day));
    if (isNaN(date.getTime())) return null;

    return date.toISOString();
  }

  /**
   * Normalizes a BICE description for stable idempotency key generation.
   * The raw description is preserved in the entry for display; this
   * normalized form is used only for the idempotency key.
   *
   * @param rawDescription The raw display description.
   * @returns Lowercased, whitespace-collapsed description.
   */
  private normalizeBiceDescription(rawDescription: string): string {
    return rawDescription.trim().toLowerCase().replace(/\s+/g, ' ');
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
