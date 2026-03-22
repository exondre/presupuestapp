import { TestBed } from '@angular/core/testing';

import { EntryType } from '../models/entry-data.model';
import { ExternalEntryImportService } from './external-entry-import.service';

describe('ExternalEntryImportService', () => {
  let service: ExternalEntryImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExternalEntryImportService);
  });

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
});
