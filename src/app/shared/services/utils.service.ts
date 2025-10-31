import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UtilsService {
  private static readonly chileTimeZone = 'America/Santiago';

  private readonly dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: UtilsService.chileTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  private readonly dayLabelFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: UtilsService.chileTimeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  private readonly amountFormatter = new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  private readonly monthLabelFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: UtilsService.chileTimeZone,
    month: 'long',
    year: 'numeric',
  });

  /**
   * Formats the amount into the required Chilean peso representation.
   *
   * @param amount Amount to format.
   * @returns A formatted CLP amount string.
   */
  formatAmount(amount: number): string {
    return `$${this.amountFormatter.format(amount).replace(/\u00a0/g, ' ')}`;
  }

  /**
   * Formats the occurrence time using Chile's timezone.
   *
   * @param date Date used to extract the time.
   * @returns The formatted time string.
   */
  formatTime(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: UtilsService.chileTimeZone,
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(date)
      .toLowerCase();
  }

  /**
   * Generates the localized month descriptor derived from the supplied date.
   *
   * @param date Date whose month and year determine the label.
   * @returns A Spanish month label (for example, `abril 2024`) or an empty string.
   */
  buildMonthLabelFromDate(date: Date): string {
    const parts = new Map(
      this.monthLabelFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value])
    );
    const month = parts.get('month') ?? '';
    const year = parts.get('year') ?? '';
    const monthDescriptor = month.length > 0 ? `${month} ${year}`.trim() : year;

    return monthDescriptor.length > 0 ? `${monthDescriptor}` : '';
  }

  /**
   * Creates the month label using the provided month and year numbers.
   *
   * @param month Month index starting at 1 for January.
   * @param year Four digit year.
   * @returns The formatted month label.
   */
  buildMonthLabel(month: number, year: number): string {
    const date = new Date(year, month - 1, 1);
    return this.buildMonthLabelFromDate(date);
  }
}
