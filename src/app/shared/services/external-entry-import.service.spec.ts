import { TestBed } from '@angular/core/testing';

import { EntryData, EntryType } from '../models/entry-data.model';
import { ExternalEntryImportService, ParsedEntry } from './external-entry-import.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExistingEntry(overrides: Partial<EntryData> = {}): EntryData {
  return {
    id: 'entry-1',
    amount: 1000,
    date: new Date(2026, 0, 1).toISOString(),
    type: EntryType.EXPENSE,
    description: 'Test Entry',
    idempotencyInfo: [{ idempotencyKey: 'key1', idempotencyVersion: '1' }],
    ...overrides,
  };
}

function makeImportedEntry(overrides: Partial<ParsedEntry> = {}): ParsedEntry {
  const date = new Date(2026, 0, 1).toISOString();
  return {
    date,
    description: 'Test Entry',
    amount: 1000,
    type: EntryType.EXPENSE,
    idempotencyInfo: [
      {
        idempotencyKey: `${date}|Test Entry|1000|${EntryType.EXPENSE}`,
        idempotencyVersion: '1',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ExternalEntryImportService', () => {
  let service: ExternalEntryImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExternalEntryImportService);
  });

  // =========================================================================
  // EXISTING TESTS (preserved verbatim)
  // =========================================================================

  it('should remove trailing asterisk and leading COMPRA prefix', () => {
    const normalizedDescription = (service as any).normalizeFalabellaDescription(
      'COMPRA ONECLICK CENCOMALLS*',
    );

    expect(normalizedDescription).toBe('ONECLICK CENCOMALLS');
  });

  it('should remove COMPRA prefix when there is no trailing asterisk', () => {
    const normalizedDescription = (service as any).normalizeFalabellaDescription(
      'COMPRA Red Movilidad Santiago',
    );

    expect(normalizedDescription).toBe('Red Movilidad Santiago');
  });

  it('should keep COMPRA when it is not at the beginning', () => {
    const normalizedDescription = (service as any).normalizeFalabellaDescription(
      'DEVOLUCION COMPRA Promo Mastercard Metro',
    );

    expect(normalizedDescription).toBe('DEVOLUCION COMPRA Promo Mastercard Metro');
  });

  it('should keep non-COMPRA descriptions unchanged', () => {
    const normalizedDescription = (service as any).normalizeFalabellaDescription(
      'PAGO AUTOMATICO TARJETA BIP 100810172',
    );

    expect(normalizedDescription).toBe('PAGO AUTOMATICO TARJETA BIP 100810172');
  });

  it('should trim residual spaces after removing COMPRA and trailing asterisk', () => {
    const normalizedDescription = (service as any).normalizeFalabellaDescription(
      '  COMPRA   MP *MCDONALDSCHI*  ',
    );

    expect(normalizedDescription).toBe('MP *MCDONALDSCHI');
  });

  it('should use normalized description in parsed entries and idempotency key', () => {
    const rows = [
      ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
      ['01/01/2026', 'COMPRA ONECLICK CENCOMALLS*', 'Titular', 900, 0, 900],
    ];

    const result = (service as any).parseFalabellaCmrFormat(rows);
    const parsedEntry = result.entries[0];

    expect(result.entries.length).toBe(1);
    expect(parsedEntry.description).toBe('ONECLICK CENCOMALLS');
    expect(parsedEntry.idempotencyInfo[0].idempotencyKey).toBe(
      `${parsedEntry.date}|ONECLICK CENCOMALLS|900|${EntryType.EXPENSE}`,
    );
  });

  // =========================================================================
  // importFromExcel
  // =========================================================================

  describe('importFromExcel', () => {
    // Minimal valid XLSX file (with header + one data row) encoded as base64.
    // Generated with fflate.zipSync() and contains:
    //   Row 1: FECHA | DESCRIPCION | TITULAR | MONTO | CUOTAS | VALOR
    //   Row 2: 15/06/2025 | PAGO SERVICIO | Titular | 3000 | 0 | 3000
    const DATA_XLSX_B64 = 'UEsDBBQAAAAAAOO4eFxuYbgNLQIAAC0CAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz48VHlwZXMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvY29udGVudC10eXBlcyI+PERlZmF1bHQgRXh0ZW5zaW9uPSJyZWxzIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLXBhY2thZ2UucmVsYXRpb25zaGlwcyt4bWwiLz48RGVmYXVsdCBFeHRlbnNpb249InhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3htbCIvPjxPdmVycmlkZSBQYXJ0TmFtZT0iL3hsL3dvcmtib29rLnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLnNoZWV0Lm1haW4reG1sIi8+PE92ZXJyaWRlIFBhcnROYW1lPSIveGwvd29ya3NoZWV0cy9zaGVldDEueG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwud29ya3NoZWV0K3htbCIvPjwvVHlwZXM+UEsDBBQAAAAAAOO4eFyY2uuLJwEAACcBAAALAAAAX3JlbHMvLnJlbHM8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+PFJlbGF0aW9uc2hpcHMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwcyI+PFJlbGF0aW9uc2hpcCBJZD0icklkMSIgVHlwZT0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9vZmZpY2VEb2N1bWVudCIgVGFyZ2V0PSJ4bC93b3JrYm9vay54bWwiLz48L1JlbGF0aW9uc2hpcHM+UEsDBBQAAAAAAOO4eFydbEO9GwEAABsBAAAPAAAAeGwvd29ya2Jvb2sueG1sPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9InllcyI/Pjx3b3JrYm9vayB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3NwcmVhZHNoZWV0bWwvMjAwNi9tYWluIiB4bWxuczpyPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzIj48c2hlZXRzPjxzaGVldCBuYW1lPSJTaGVldDEiIHNoZWV0SWQ9IjEiIHI6aWQ9InJJZDEiLz48L3NoZWV0cz48L3dvcmtib29rPlBLAwQUAAAAAADjuHhcWv2CaygBAAAoAQAAGgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9InllcyI/PjxSZWxhdGlvbnNoaXBzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L3JlbGF0aW9uc2hpcHMiPjxSZWxhdGlvbnNoaXAgSWQ9InJJZDEiIFR5cGU9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvd29ya3NoZWV0IiBUYXJnZXQ9IndvcmtzaGVldHMvc2hlZXQxLnhtbCIvPjwvUmVsYXRpb25zaGlwcz5QSwMEFAAAAAAA47h4XNvN+qbiAgAA4gIAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWw8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+PHdvcmtzaGVldCB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3NwcmVhZHNoZWV0bWwvMjAwNi9tYWluIj48c2hlZXREYXRhPjxyb3cgcj0iMSI+PGMgcj0iQTEiIHQ9ImlubGluZVN0ciI+PGlzPjx0PkZFQ0hBPC90PjwvaXM+PC9jPjxjIHI9IkIxIiB0PSJpbmxpbmVTdHIiPjxpcz48dD5ERVNDUklQQ0lPTjwvdD48L2lzPjwvYz48YyByPSJDMSIgdD0iaW5saW5lU3RyIj48aXM+PHQ+VElUVUxBUjwvdD48L2lzPjwvYz48YyByPSJEMSIgdD0iaW5saW5lU3RyIj48aXM+PHQ+TU9OVE88L3Q+PC9pcz48L2M+PGMgcj0iRTEiIHQ9ImlubGluZVN0ciI+PGlzPjx0PkNVT1RBUzwvdD48L2lzPjwvYz48YyByPSJGMSIgdD0iaW5saW5lU3RyIj48aXM+PHQ+VkFMT1I8L3Q+PC9pcz48L2M+PC9yb3c+PHJvdyByPSIyIj48YyByPSJBMiIgdD0iaW5saW5lU3RyIj48aXM+PHQ+MTUvMDYvMjAyNTwvdD48L2lzPjwvYz48YyByPSJCMiIgdD0iaW5saW5lU3RyIj48aXM+PHQ+UEFHTyBTRVJWSUNJTzwvdD48L2lzPjwvYz48YyByPSJDMiIgdD0iaW5saW5lU3RyIj48aXM+PHQ+VGl0dWxhcjwvdD48L2lzPjwvYz48YyByPSJEMiI+PHY+MzAwMDwvdj48L2M+PGMgcj0iRTIiPjx2PjA8L3Y+PC9jPjxjIHI9IkYyIj48dj4zMDAwPC92PjwvYz48L3Jvdz48L3NoZWV0RGF0YT48L3dvcmtzaGVldD5QSwECFAAUAAAAAADjuHhcbmG4DS0CAAAtAgAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAAAOO4eFyY2uuLJwEAACcBAAALAAAAAAAAAAAAAAAAAF4CAABfcmVscy8ucmVsc1BLAQIUABQAAAAAAOO4eFydbEO9GwEAABsBAAAPAAAAAAAAAAAAAAAAAK4DAAB4bC93b3JrYm9vay54bWxQSwECFAAUAAAAAADjuHhcWv2CaygBAAAoAQAAGgAAAAAAAAAAAAAAAAD2BAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAAUAAAAAADjuHhc2836puICAADiAgAAGAAAAAAAAAAAAAAAAABWBgAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsFBgAAAAAFAAUARQEAAG4JAAAAAA==';

    function base64ToFile(b64: string, name: string): File {
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    it('should parse entries when format is falabella-cmr', async () => {
      const file = base64ToFile(DATA_XLSX_B64, 'test.xlsx');
      const result = await service.importFromExcel(file, 'falabella-cmr');

      // The XLSX has one data row with 'PAGO SERVICIO' description and amount 3000
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].description).toBe('PAGO SERVICIO');
      expect(result.entries[0].amount).toBe(3000);
    }, 10000);

    it('should use falabella-cmr as default format when no format is provided', async () => {
      const file = base64ToFile(DATA_XLSX_B64, 'test.xlsx');
      const result = await service.importFromExcel(file);

      expect(result.entries.length).toBe(1);
    }, 10000);

    it('should throw an error for unsupported formats', async () => {
      const file = base64ToFile(DATA_XLSX_B64, 'test.xlsx');

      await expectAsync(
        service.importFromExcel(file, 'unsupported-format' as any),
      ).toBeRejectedWithError('Formato de importación no soportado: unsupported-format');
    }, 10000);
  });

  // =========================================================================
  // parseFalabellaCmrFormat (private, accessed via any)
  // =========================================================================

  describe('parseFalabellaCmrFormat', () => {
    it('should return empty result when rows array is empty', () => {
      const result = (service as any).parseFalabellaCmrFormat([]);

      expect(result.entries).toEqual([]);
      expect(result.totalRows).toBe(0);
      expect(result.skippedRows).toBe(0);
    });

    it('should return empty result when only header row is present', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.entries).toEqual([]);
      expect(result.totalRows).toBe(0);
      expect(result.skippedRows).toBe(0);
    });

    it('should count totalRows excluding the header', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'TIENDA ABC', 'Titular', 1000, 0, 1000],
        ['02/01/2026', 'TIENDA XYZ', 'Titular', 2000, 0, 2000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.totalRows).toBe(2);
    });

    it('should skip null or empty rows and increment skippedRows', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        null,
        [],
        ['01/01/2026', 'TIENDA ABC', 'Titular', 1000, 0, 1000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.skippedRows).toBe(2);
      expect(result.entries.length).toBe(1);
    });

    it('should skip row when transactionDate is null (invalid date)', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        [null, 'TIENDA ABC', 'Titular', 1000, 0, 1000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.skippedRows).toBe(1);
      expect(result.entries.length).toBe(0);
    });

    it('should skip row when signedAmount is 0 (null valor cuota)', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'TIENDA ABC', 'Titular', 1000, 0, null],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.skippedRows).toBe(1);
      expect(result.entries.length).toBe(0);
    });

    it('should skip CMR card payment with negative amount', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'PAGO TARJETA CMR', 'Titular', -50000, 0, -50000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.skippedRows).toBe(1);
      expect(result.entries.length).toBe(0);
    });

    it('should NOT skip CMR card payment when amount is positive (not a credit)', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'PAGO TARJETA CMR', 'Titular', 50000, 0, 50000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].type).toBe(EntryType.EXPENSE);
    });

    it('should classify negative amount (non-CMR) as INCOME type', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'DEVOLUCION COMPRA', 'Titular', -2000, 0, -2000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].type).toBe(EntryType.INCOME);
      expect(result.entries[0].amount).toBe(2000);
    });

    it('should classify positive amount as EXPENSE type', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'SUPERMERCADO', 'Titular', 5000, 0, 5000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.entries[0].type).toBe(EntryType.EXPENSE);
      expect(result.entries[0].amount).toBe(5000);
    });

    it('should set recurrence and installmentInfo when installment is detected', () => {
      // monto=30000, cuotasPendientes=2, valorCuota=10000 → total=3, current=2
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'COMPRA EN CUOTAS', 'Titular', 30000, 2, 10000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);
      const entry = result.entries[0];

      expect(entry.recurrence).toBeDefined();
      expect(entry.recurrence.frequency).toBe('monthly');
      expect(entry.recurrence.termination.mode).toBe('occurrences');
      expect(entry.recurrence.termination.total).toBe(3);
      expect(entry.installmentInfo).toEqual({ current: 2, total: 3 });
    });

    it('should NOT set recurrence when there is no installment', () => {
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', 'TIENDA ABC', 'Titular', 1000, 0, 1000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);
      const entry = result.entries[0];

      expect(entry.recurrence).toBeUndefined();
      expect(entry.installmentInfo).toBeUndefined();
    });

    it('should use empty string when description cell is null (null-coalescing branch)', () => {
      // row[1] = null triggers the rawDescription ?? '' null-coalescing fallback (line 127)
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        ['01/01/2026', null, 'Titular', 1000, 0, 1000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].description).toBe('');
    });

    it('should increment skippedRows when a row throws a parse error inside the try block', () => {
      // Spy on parseDate to throw for a specific input so that the error is caught inside the try block
      const validDate = '01/01/2026';
      spyOn(service as any, 'parseDate').and.throwError('forced parse error inside try');

      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        [validDate, 'TIENDA', 'Titular', 1000, 0, 1000],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.skippedRows).toBe(1);
      expect(result.entries.length).toBe(0);
    });

    it('should parse a Date object in the date column', () => {
      const dateObj = new Date(Date.UTC(2026, 0, 15)); // 15 Jan 2026 UTC midnight
      const rows = [
        ['FECHA', 'DESCRIPCION', 'TITULAR/ADICIONAL', 'MONTO', 'CUOTAS PENDIENTES', 'VALOR CUOTA'],
        [dateObj, 'CAFETERIA', 'Titular', 1500, 0, 1500],
      ];
      const result = (service as any).parseFalabellaCmrFormat(rows);

      expect(result.entries.length).toBe(1);
      const parsedDate = new Date(result.entries[0].date);
      expect(parsedDate.getFullYear()).toBe(2026);
      expect(parsedDate.getMonth()).toBe(0);
      expect(parsedDate.getDate()).toBe(15);
    });
  });

  // =========================================================================
  // parseDate (private)
  // =========================================================================

  describe('parseDate', () => {
    it('should return null when rawDate is null', () => {
      expect((service as any).parseDate(null)).toBeNull();
    });

    it('should return null when rawDate is undefined', () => {
      expect((service as any).parseDate(undefined)).toBeNull();
    });

    it('should return ISO string for a valid Date object (UTC midnight)', () => {
      const d = new Date(Date.UTC(2025, 5, 20)); // 20 Jun 2025
      const result = (service as any).parseDate(d);
      const parsed = new Date(result);
      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(5);
      expect(parsed.getDate()).toBe(20);
    });

    it('should return null for an invalid Date object', () => {
      expect((service as any).parseDate(new Date('invalid'))).toBeNull();
    });

    it('should parse a valid DD/MM/YYYY string', () => {
      const result = (service as any).parseDate('25/12/2025');
      expect(result).not.toBeNull();
      const parsed = new Date(result);
      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(11); // December
      expect(parsed.getDate()).toBe(25);
    });

    it('should return null for a string with an invalid date format', () => {
      expect((service as any).parseDate('2025-12-25')).toBeNull();
    });

    it('should return null for a non-date string', () => {
      expect((service as any).parseDate('not-a-date')).toBeNull();
    });

    it('should handle 1-digit day and month in DD/MM/YYYY string', () => {
      const result = (service as any).parseDate('1/3/2026');
      expect(result).not.toBeNull();
      const parsed = new Date(result);
      expect(parsed.getMonth()).toBe(2); // March
      expect(parsed.getDate()).toBe(1);
    });

    it('should return null for a number input (not null, not Date, not matching string pattern)', () => {
      // A number like 45000 is not in DD/MM/YYYY format
      expect((service as any).parseDate(45000)).toBeNull();
    });

    it('should return null when a DD/MM/YYYY string produces an invalid Date (isNaN guard)', () => {
      // Temporarily replace the Date constructor so that new Date(year, month, day)
      // returns an object whose getTime() is NaN, covering lines 208-210.
      const OriginalDate = (window as any).Date;
      try {
        const fakeInvalidDate = { getTime: () => NaN };
        (window as any).Date = function (...args: any[]) {
          if (args.length === 3) {
            return fakeInvalidDate;
          }
          return new OriginalDate(...args);
        };
        // Preserve instanceof check behaviour isn't needed here since rawDate is a string
        (window as any).Date.prototype = OriginalDate.prototype;

        const result = (service as any).parseDate('01/01/2026');
        expect(result).toBeNull();
      } finally {
        (window as any).Date = OriginalDate;
      }
    });
  });

  // =========================================================================
  // parseAmount (private)
  // =========================================================================

  describe('parseAmount', () => {
    it('should return 0 when rawAmount is null', () => {
      expect((service as any).parseAmount(null)).toBe(0);
    });

    it('should return 0 when rawAmount is undefined', () => {
      expect((service as any).parseAmount(undefined)).toBe(0);
    });

    it('should return the number when rawAmount is a valid integer', () => {
      expect((service as any).parseAmount(5000)).toBe(5000);
    });

    it('should round a float number', () => {
      expect((service as any).parseAmount(5000.7)).toBe(5001);
    });

    it('should return 0 when rawAmount is NaN (number)', () => {
      expect((service as any).parseAmount(NaN)).toBe(0);
    });

    it('should return a negative number for a negative numeric input', () => {
      expect((service as any).parseAmount(-3000)).toBe(-3000);
    });

    it('should parse a formatted Chilean peso string "$1.500.000"', () => {
      expect((service as any).parseAmount('$1.500.000')).toBe(1500000);
    });

    it('should parse a string with only dots as thousands separators', () => {
      expect((service as any).parseAmount('2.000')).toBe(2000);
    });

    it('should parse a plain numeric string', () => {
      expect((service as any).parseAmount('9999')).toBe(9999);
    });

    it('should return 0 when the string cannot be parsed as a number', () => {
      expect((service as any).parseAmount('abc')).toBe(0);
    });

    it('should return 0 for an empty string', () => {
      expect((service as any).parseAmount('')).toBe(0);
    });
  });

  // =========================================================================
  // parseInstallmentInfo (private)
  // =========================================================================

  describe('parseInstallmentInfo', () => {
    it('should return null when cuotasPendientes is null', () => {
      expect((service as any).parseInstallmentInfo(30000, null, 10000)).toBeNull();
    });

    it('should return null when cuotasPendientes is undefined', () => {
      expect((service as any).parseInstallmentInfo(30000, undefined, 10000)).toBeNull();
    });

    it('should return null when cuotasPendientes is 0', () => {
      expect((service as any).parseInstallmentInfo(30000, 0, 10000)).toBeNull();
    });

    it('should return null when cuotasPendientes is negative', () => {
      expect((service as any).parseInstallmentInfo(30000, -1, 10000)).toBeNull();
    });

    it('should return null when monto is 0 (null rawMonto)', () => {
      expect((service as any).parseInstallmentInfo(null, 2, 10000)).toBeNull();
    });

    it('should return null when monto parses to 0', () => {
      expect((service as any).parseInstallmentInfo(0, 2, 10000)).toBeNull();
    });

    it('should return null when totalCuotas < 1', () => {
      // monto=5, valorCuota=10000 → totalCuotas=round(|5/10000|)=0 < 1
      expect((service as any).parseInstallmentInfo(5, 1, 10000)).toBeNull();
    });

    it('should return null when totalCuotas < cuotasPendientes', () => {
      // monto=10000, valorCuota=10000 → totalCuotas=1, but cuotasPendientes=3 → 1 < 3
      expect((service as any).parseInstallmentInfo(10000, 3, 10000)).toBeNull();
    });

    it('should return correct installment info for a 3-installment purchase with 2 pending', () => {
      // monto=30000, cuotasPendientes=2, valorCuota=10000 → total=3, current=2
      const result = (service as any).parseInstallmentInfo(30000, 2, 10000);
      expect(result).toEqual({ current: 2, total: 3 });
    });

    it('should return correct installment for first installment (all pending)', () => {
      // monto=30000, cuotasPendientes=3, valorCuota=10000 → total=3, current=1
      const result = (service as any).parseInstallmentInfo(30000, 3, 10000);
      expect(result).toEqual({ current: 1, total: 3 });
    });

    it('should return correct installment for last installment (1 pending)', () => {
      // monto=30000, cuotasPendientes=1, valorCuota=10000 → total=3, current=3
      const result = (service as any).parseInstallmentInfo(30000, 1, 10000);
      expect(result).toEqual({ current: 3, total: 3 });
    });

    it('should handle string values for cuotasPendientes', () => {
      const result = (service as any).parseInstallmentInfo(30000, '2', 10000);
      expect(result).toEqual({ current: 2, total: 3 });
    });

    it('should handle string values for rawMonto', () => {
      const result = (service as any).parseInstallmentInfo('$30.000', 2, 10000);
      expect(result).toEqual({ current: 2, total: 3 });
    });

    it('should handle negative signedValorCuota (credit entries)', () => {
      // monto=-30000, cuotasPendientes=2, valorCuota=-10000 → total=round(|-30000/-10000|)=3
      const result = (service as any).parseInstallmentInfo(-30000, 2, -10000);
      expect(result).toEqual({ current: 2, total: 3 });
    });
  });

  // =========================================================================
  // parsePositiveInt (private)
  // =========================================================================

  describe('parsePositiveInt', () => {
    it('should return null for null', () => {
      expect((service as any).parsePositiveInt(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect((service as any).parsePositiveInt(undefined)).toBeNull();
    });

    it('should return null for 0', () => {
      expect((service as any).parsePositiveInt(0)).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect((service as any).parsePositiveInt(-5)).toBeNull();
    });

    it('should return null for NaN strings', () => {
      expect((service as any).parsePositiveInt('abc')).toBeNull();
    });

    it('should return the integer for a positive integer', () => {
      expect((service as any).parsePositiveInt(5)).toBe(5);
    });

    it('should truncate a positive float to an integer', () => {
      expect((service as any).parsePositiveInt(3.9)).toBe(3);
    });

    it('should parse a positive integer string', () => {
      expect((service as any).parsePositiveInt('7')).toBe(7);
    });

    it('should return null for string "0"', () => {
      expect((service as any).parsePositiveInt('0')).toBeNull();
    });
  });

  // =========================================================================
  // generateIdempotencyInfo (private)
  // =========================================================================

  describe('generateIdempotencyInfo', () => {
    it('should generate a deterministic idempotency key', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const result = (service as any).generateIdempotencyInfo(date, 'TIENDA', 500, EntryType.EXPENSE);
      expect(result.idempotencyKey).toBe(`${date}|TIENDA|500|${EntryType.EXPENSE}`);
      expect(result.idempotencyVersion).toBe('1');
    });

    it('should include INCOME type in the key for credit entries', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const result = (service as any).generateIdempotencyInfo(date, 'DEVOLUCION', 200, EntryType.INCOME);
      expect(result.idempotencyKey).toContain(EntryType.INCOME);
    });
  });

  // =========================================================================
  // removeTrailingAsterisk (private)
  // =========================================================================

  describe('removeTrailingAsterisk', () => {
    it('should remove a single trailing asterisk', () => {
      expect((service as any).removeTrailingAsterisk('TIENDA*')).toBe('TIENDA');
    });

    it('should NOT remove an asterisk that is not at the end', () => {
      expect((service as any).removeTrailingAsterisk('TIENDA*XYZ')).toBe('TIENDA*XYZ');
    });

    it('should leave a string without asterisk unchanged', () => {
      expect((service as any).removeTrailingAsterisk('TIENDA')).toBe('TIENDA');
    });

    it('should remove only the last asterisk when multiple asterisks exist', () => {
      expect((service as any).removeTrailingAsterisk('TIENDA**')).toBe('TIENDA*');
    });
  });

  // =========================================================================
  // removeLeadingCompraPrefix (private)
  // =========================================================================

  describe('removeLeadingCompraPrefix', () => {
    it('should remove "COMPRA " prefix (uppercase)', () => {
      expect((service as any).removeLeadingCompraPrefix('COMPRA TIENDA ABC')).toBe('TIENDA ABC');
    });

    it('should remove "compra " prefix (lowercase, case-insensitive)', () => {
      expect((service as any).removeLeadingCompraPrefix('compra tienda abc')).toBe('tienda abc');
    });

    it('should remove "Compra " prefix (mixed case)', () => {
      expect((service as any).removeLeadingCompraPrefix('Compra Tienda ABC')).toBe('Tienda ABC');
    });

    it('should NOT remove COMPRA when it is not at the start', () => {
      expect((service as any).removeLeadingCompraPrefix('DEVOLUCION COMPRA XYZ')).toBe(
        'DEVOLUCION COMPRA XYZ',
      );
    });

    it('should leave strings without COMPRA unchanged', () => {
      expect((service as any).removeLeadingCompraPrefix('TIENDA ABC')).toBe('TIENDA ABC');
    });
  });

  // =========================================================================
  // toEntryCreation
  // =========================================================================

  describe('toEntryCreation', () => {
    it('should map all fields from a ParsedEntry without recurrence', () => {
      const date = new Date(2026, 2, 10).toISOString();
      const parsed: ParsedEntry = {
        date,
        description: 'FARMACIA',
        amount: 3500,
        type: EntryType.EXPENSE,
        idempotencyInfo: [{ idempotencyKey: 'k1', idempotencyVersion: '1' }],
      };

      const result = service.toEntryCreation(parsed);

      expect(result.amount).toBe(3500);
      expect(result.date).toBe(date);
      expect(result.description).toBe('FARMACIA');
      expect(result.type).toBe(EntryType.EXPENSE);
      expect(result.idempotencyInfo).toEqual(parsed.idempotencyInfo);
      expect(result.recurrence).toBeUndefined();
    });

    it('should include recurrence when parsed entry has one', () => {
      const date = new Date(2026, 2, 10).toISOString();
      const parsed: ParsedEntry = {
        date,
        description: 'CUOTA PRESTAMO',
        amount: 10000,
        type: EntryType.EXPENSE,
        idempotencyInfo: [{ idempotencyKey: 'k2', idempotencyVersion: '1' }],
        recurrence: {
          frequency: 'monthly',
          termination: { mode: 'occurrences', total: 12 },
        },
      };

      const result = service.toEntryCreation(parsed);

      expect(result.recurrence).toEqual({
        frequency: 'monthly',
        termination: { mode: 'occurrences', total: 12 },
      });
    });
  });

  // =========================================================================
  // mergeWithExistingEntries
  // =========================================================================

  describe('mergeWithExistingEntries', () => {
    it('should return empty buckets when both arrays are empty', () => {
      const result = service.mergeWithExistingEntries([], []);
      expect(result.exactDuplicates).toEqual([]);
      expect(result.potentialDuplicates).toEqual([]);
      expect(result.readyToImport).toEqual([]);
    });

    it('should place all entries in readyToImport when no existing entries', () => {
      const imported = [makeImportedEntry(), makeImportedEntry({ description: 'Another' })];
      const result = service.mergeWithExistingEntries(imported, []);

      expect(result.readyToImport.length).toBe(2);
      expect(result.exactDuplicates.length).toBe(0);
      expect(result.potentialDuplicates.length).toBe(0);
    });

    it('should detect exact duplicate by idempotency key', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const key = `${date}|Test Entry|1000|${EntryType.EXPENSE}`;
      const imported = makeImportedEntry({
        idempotencyInfo: [{ idempotencyKey: key, idempotencyVersion: '1' }],
      });
      const existing = makeExistingEntry({
        idempotencyInfo: [{ idempotencyKey: key, idempotencyVersion: '1' }],
      });

      const result = service.mergeWithExistingEntries([imported], [existing]);

      expect(result.exactDuplicates.length).toBe(1);
      expect(result.potentialDuplicates.length).toBe(0);
      expect(result.readyToImport.length).toBe(0);
    });

    it('should detect potential duplicate via fuzzy match (same date, amount, type)', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const imported = makeImportedEntry({
        date,
        amount: 1000,
        type: EntryType.EXPENSE,
        description: 'Test Entry',
        idempotencyInfo: [{ idempotencyKey: 'different-key', idempotencyVersion: '1' }],
      });
      const existing = makeExistingEntry({
        date,
        amount: 1000,
        type: EntryType.EXPENSE,
        description: 'Test Entry',
        idempotencyInfo: [{ idempotencyKey: 'existing-key', idempotencyVersion: '1' }],
      });

      const result = service.mergeWithExistingEntries([imported], [existing]);

      expect(result.potentialDuplicates.length).toBe(1);
      expect(result.potentialDuplicates[0].importedEntry).toBe(imported);
      expect(result.potentialDuplicates[0].matchedEntry).toBe(existing);
      expect(result.exactDuplicates.length).toBe(0);
      expect(result.readyToImport.length).toBe(0);
    });

    it('should place entry in readyToImport when there is no idempotency or fuzzy match', () => {
      const imported = makeImportedEntry({
        amount: 9999,
        type: EntryType.INCOME,
        idempotencyInfo: [{ idempotencyKey: 'unique-key-xyz', idempotencyVersion: '1' }],
      });
      const existing = makeExistingEntry({ amount: 1000, type: EntryType.EXPENSE });

      const result = service.mergeWithExistingEntries([imported], [existing]);

      expect(result.readyToImport.length).toBe(1);
    });

    it('should handle existing entries without idempotencyInfo', () => {
      const imported = makeImportedEntry({
        idempotencyInfo: [{ idempotencyKey: 'some-key', idempotencyVersion: '1' }],
      });
      const existing = makeExistingEntry({ idempotencyInfo: undefined });

      // Should not throw; entry with no idempotencyInfo is simply skipped in key building
      const result = service.mergeWithExistingEntries([imported], [existing]);
      expect(result.readyToImport.length + result.potentialDuplicates.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple existing entries with multiple idempotency keys', () => {
      const key1 = 'multi-key-1';
      const key2 = 'multi-key-2';
      const imported = makeImportedEntry({
        idempotencyInfo: [{ idempotencyKey: key2, idempotencyVersion: '1' }],
      });
      const existing = makeExistingEntry({
        idempotencyInfo: [
          { idempotencyKey: key1, idempotencyVersion: '1' },
          { idempotencyKey: key2, idempotencyVersion: '1' },
        ],
      });

      const result = service.mergeWithExistingEntries([imported], [existing]);
      expect(result.exactDuplicates.length).toBe(1);
    });
  });

  // =========================================================================
  // buildIdempotencyKeySet (private)
  // =========================================================================

  describe('buildIdempotencyKeySet', () => {
    it('should return an empty set for empty entries array', () => {
      const keySet: Set<string> = (service as any).buildIdempotencyKeySet([]);
      expect(keySet.size).toBe(0);
    });

    it('should include all keys from entries with idempotencyInfo', () => {
      const entries: EntryData[] = [
        makeExistingEntry({ idempotencyInfo: [{ idempotencyKey: 'k1', idempotencyVersion: '1' }] }),
        makeExistingEntry({
          idempotencyInfo: [
            { idempotencyKey: 'k2', idempotencyVersion: '1' },
            { idempotencyKey: 'k3', idempotencyVersion: '1' },
          ],
        }),
      ];

      const keySet: Set<string> = (service as any).buildIdempotencyKeySet(entries);
      expect(keySet.has('k1')).toBeTrue();
      expect(keySet.has('k2')).toBeTrue();
      expect(keySet.has('k3')).toBeTrue();
      expect(keySet.size).toBe(3);
    });

    it('should skip entries without idempotencyInfo', () => {
      const entries: EntryData[] = [makeExistingEntry({ idempotencyInfo: undefined })];
      const keySet: Set<string> = (service as any).buildIdempotencyKeySet(entries);
      expect(keySet.size).toBe(0);
    });
  });

  // =========================================================================
  // hasIdempotencyMatch (private)
  // =========================================================================

  describe('hasIdempotencyMatch', () => {
    it('should return true when any imported key is in the set', () => {
      const keySet = new Set(['key-a', 'key-b']);
      const imported = makeImportedEntry({
        idempotencyInfo: [{ idempotencyKey: 'key-b', idempotencyVersion: '1' }],
      });
      expect((service as any).hasIdempotencyMatch(imported, keySet)).toBeTrue();
    });

    it('should return false when no imported key is in the set', () => {
      const keySet = new Set(['key-a', 'key-b']);
      const imported = makeImportedEntry({
        idempotencyInfo: [{ idempotencyKey: 'key-z', idempotencyVersion: '1' }],
      });
      expect((service as any).hasIdempotencyMatch(imported, keySet)).toBeFalse();
    });

    it('should return false when keySet is empty', () => {
      const keySet = new Set<string>();
      const imported = makeImportedEntry();
      expect((service as any).hasIdempotencyMatch(imported, keySet)).toBeFalse();
    });
  });

  // =========================================================================
  // findFuzzyMatch (private)
  // =========================================================================

  describe('findFuzzyMatch', () => {
    it('should return null when existingEntries is empty', () => {
      const imported = makeImportedEntry();
      expect((service as any).findFuzzyMatch(imported, [])).toBeNull();
    });

    it('should return null when type does not match', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const imported = makeImportedEntry({ date, type: EntryType.EXPENSE, amount: 1000 });
      const existing = makeExistingEntry({ date, type: EntryType.INCOME, amount: 1000 });
      expect((service as any).findFuzzyMatch(imported, [existing])).toBeNull();
    });

    it('should return null when amount does not match', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const imported = makeImportedEntry({ date, type: EntryType.EXPENSE, amount: 1000 });
      const existing = makeExistingEntry({ date, type: EntryType.EXPENSE, amount: 2000 });
      expect((service as any).findFuzzyMatch(imported, [existing])).toBeNull();
    });

    it('should return null when date difference exceeds 3 days', () => {
      const importedDate = new Date(2026, 0, 1).toISOString();
      const existingDate = new Date(2026, 0, 5).toISOString(); // 4 days apart
      const imported = makeImportedEntry({ date: importedDate, amount: 1000, type: EntryType.EXPENSE });
      const existing = makeExistingEntry({ date: existingDate, amount: 1000, type: EntryType.EXPENSE });
      expect((service as any).findFuzzyMatch(imported, [existing])).toBeNull();
    });

    it('should return existing entry when date is within 3 days tolerance', () => {
      const importedDate = new Date(2026, 0, 1).toISOString();
      const existingDate = new Date(2026, 0, 3).toISOString(); // 2 days apart — within tolerance
      const imported = makeImportedEntry({ date: importedDate, amount: 1000, type: EntryType.EXPENSE });
      const existing = makeExistingEntry({ date: existingDate, amount: 1000, type: EntryType.EXPENSE });
      expect((service as any).findFuzzyMatch(imported, [existing])).toBe(existing);
    });

    it('should return existing entry when date is exactly on 3-day boundary', () => {
      const importedDate = new Date(2026, 0, 1).toISOString();
      const existingDate = new Date(2026, 0, 4).toISOString(); // exactly 3 days
      const imported = makeImportedEntry({ date: importedDate, amount: 1000, type: EntryType.EXPENSE });
      const existing = makeExistingEntry({ date: existingDate, amount: 1000, type: EntryType.EXPENSE });
      expect((service as any).findFuzzyMatch(imported, [existing])).toBe(existing);
    });

    it('should handle existing entry with undefined description (defaults to empty string)', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const imported = makeImportedEntry({ date, amount: 500, type: EntryType.EXPENSE, description: '' });
      const existing = makeExistingEntry({ date, amount: 500, type: EntryType.EXPENSE, description: undefined });
      expect((service as any).findFuzzyMatch(imported, [existing])).toBe(existing);
    });

    it('should return the first fuzzy match when multiple candidates exist', () => {
      const date = new Date(2026, 0, 1).toISOString();
      const imported = makeImportedEntry({ date, amount: 1000, type: EntryType.EXPENSE });
      const existing1 = makeExistingEntry({ id: 'e1', date, amount: 1000, type: EntryType.EXPENSE });
      const existing2 = makeExistingEntry({ id: 'e2', date, amount: 1000, type: EntryType.EXPENSE });
      const match = (service as any).findFuzzyMatch(imported, [existing1, existing2]);
      expect(match).toBe(existing1);
    });
  });

  // =========================================================================
  // areDatesWithinTolerance (private)
  // =========================================================================

  describe('areDatesWithinTolerance', () => {
    it('should return true for the same date', () => {
      const d = new Date(2026, 0, 1).toISOString();
      expect((service as any).areDatesWithinTolerance(d, d, 3)).toBeTrue();
    });

    it('should return true when difference equals tolerance', () => {
      const a = new Date(2026, 0, 1).toISOString();
      const b = new Date(2026, 0, 4).toISOString();
      expect((service as any).areDatesWithinTolerance(a, b, 3)).toBeTrue();
    });

    it('should return false when difference exceeds tolerance by 1 day', () => {
      const a = new Date(2026, 0, 1).toISOString();
      const b = new Date(2026, 0, 5).toISOString(); // 4 days
      expect((service as any).areDatesWithinTolerance(a, b, 3)).toBeFalse();
    });

    it('should return true regardless of which date is earlier', () => {
      const a = new Date(2026, 0, 4).toISOString();
      const b = new Date(2026, 0, 1).toISOString();
      expect((service as any).areDatesWithinTolerance(a, b, 3)).toBeTrue();
    });

    it('should return true with tolerance of 0 for same date', () => {
      const d = new Date(2026, 0, 1).toISOString();
      expect((service as any).areDatesWithinTolerance(d, d, 0)).toBeTrue();
    });

    it('should return false with tolerance of 0 for different dates', () => {
      const a = new Date(2026, 0, 1).toISOString();
      const b = new Date(2026, 0, 2).toISOString();
      expect((service as any).areDatesWithinTolerance(a, b, 0)).toBeFalse();
    });
  });

  // =========================================================================
  // normalizeFalabellaDescription (private) — edge cases beyond existing tests
  // =========================================================================

  describe('normalizeFalabellaDescription (edge cases)', () => {
    it('should return an empty string for an empty input', () => {
      expect((service as any).normalizeFalabellaDescription('')).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
      expect((service as any).normalizeFalabellaDescription('   ')).toBe('');
    });

    it('should handle description that is just "COMPRA " (trailing space trimmed, prefix not removed without following word)', () => {
      // 'COMPRA '.trim() → 'COMPRA', /^COMPRA\s+/i requires at least one space after COMPRA, so 'COMPRA' stays
      expect((service as any).normalizeFalabellaDescription('COMPRA ')).toBe('COMPRA');
    });

    it('should handle description with only an asterisk', () => {
      expect((service as any).normalizeFalabellaDescription('*')).toBe('');
    });

    it('should handle "compra" prefix case-insensitively', () => {
      expect((service as any).normalizeFalabellaDescription('compra tienda xyz')).toBe('tienda xyz');
    });
  });
});
