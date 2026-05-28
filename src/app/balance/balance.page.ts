import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItemDivider, IonItemGroup, IonLabel, IonList, IonTitle, IonToolbar, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, informationCircleOutline, searchOutline, walletOutline } from 'ionicons/icons';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryCreation, EntryData, EntryType, EntryUpdatePayload } from '../shared/models/entry-data.model';
import { EntryActionService } from '../shared/services/entry-action.service';
import { EntryService } from '../shared/services/entry.service';
import { resolveInstallmentDisplayDetailsFromEntry } from '../shared/utils/recurrence-installment-display.util';
import {
  BalanceItemComponent,
  BalanceItemViewModel,
} from './balance-item.component';
import { PullToSearchComponent } from './pull-to-search/pull-to-search.component';

interface BalanceDayGroup {
  key: string;
  label: string;
  items: BalanceItemViewModel[];
}

type SearchScope = 'visible' | 'all';

/**
 * Displays the balance sheet with the entries grouped by day using Chile's timezone.
 */
@Component({
  selector: 'app-balance',
  standalone: true,
  templateUrl: './balance.page.html',
  styleUrls: ['./balance.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonLabel,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonIcon,
    BalanceItemComponent,
    IonFab,
    IonFabButton,
    NewEntryModalComponent,
    PullToSearchComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BalancePage {
  @ViewChild('newEntryModal')
  private modal?: NewEntryModalComponent;

  private static readonly chileTimeZone = 'America/Santiago';

  private static readonly loadMoreDays = 5;

  private static readonly searchResultsPageSize = 50;

  private readonly dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BalancePage.chileTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  private readonly dayLabelFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: BalancePage.chileTimeZone,
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
    timeZone: BalancePage.chileTimeZone,
    month: 'long',
    year: 'numeric',
  });

  private readonly entryService = inject(EntryService);
  private readonly entryActionService = inject(EntryActionService);

  private readonly navController = inject(NavController);

  private readonly activatedRoute = inject(ActivatedRoute);

  private readonly destroyRef = inject(DestroyRef);

  private readonly referenceMonth = signal<Date | null>(null);

  private readonly visibleStartDayKey = signal(
    this.getInitialVisibleStartDayKey(new Date()),
  );

  private readonly visibleEndDayKey = signal(
    this.getCurrentMonthEndDayKey(new Date()),
  );

  private readonly searchScope = signal<SearchScope>('visible');

  private readonly searchResultsLimit = signal(
    BalancePage.searchResultsPageSize,
  );

  protected readonly searchTerm = signal('');

  protected readonly searchActive = computed(
    () => this.searchTerm().trim().length > 0,
  );

  protected readonly visibleEntries = computed(() => {
    const entries = this.entryService.entriesSignal();
    const referenceMonth = this.referenceMonth();
    if (!referenceMonth) {
      return entries.filter((entry) => this.isEntryInsideVisibleRange(entry));
    }

    return this.entryService.filterEntriesByMonth(referenceMonth);
  });

  protected readonly filteredEntries = computed(() => this.visibleEntries());

  protected readonly displayedEntries = computed(() => {
    const term = this.normalizeSearchText(this.searchTerm());
    const entries = this.resolveSearchBaseEntries(term);

    if (term.length === 0) {
      return entries;
    }

    const matches = entries.filter((entry) => this.matchesSearchTerm(entry, term));

    if (this.searchScope() !== 'all' || this.hasReferenceMonth()) {
      return matches;
    }

    return this.sortEntriesByDateDescending(matches).slice(
      0,
      this.searchResultsLimit(),
    );
  });

  protected readonly globalSearchMatchesCount = computed(() => {
    const term = this.normalizeSearchText(this.searchTerm());

    if (term.length === 0 || this.searchScope() !== 'all' || this.hasReferenceMonth()) {
      return 0;
    }

    return this.entryService
      .entriesSignal()
      .filter((entry) => this.matchesSearchTerm(entry, term)).length;
  });

  protected readonly hasMoreMovements = computed(() => {
    if (this.hasReferenceMonth() || this.searchActive() || this.searchScope() === 'all') {
      return false;
    }

    return this.entryService
      .entriesSignal()
      .some((entry) => this.isEntryBeforeVisibleRange(entry));
  });

  protected readonly canExpandSearchToAll = computed(() => {
    const term = this.normalizeSearchText(this.searchTerm());

    if (term.length === 0 || this.hasReferenceMonth() || this.searchScope() === 'all') {
      return false;
    }

    return this.entryService
      .entriesSignal()
      .some((entry) =>
        !this.isEntryInsideVisibleRange(entry)
        && this.matchesSearchTerm(entry, term),
      );
  });

  protected readonly hasStoredEntries = computed(() =>
    this.entryService.entriesSignal().length > 0,
  );

  protected readonly hasMoreGlobalSearchResults = computed(() =>
    this.searchScope() === 'all'
    && this.globalSearchMatchesCount() > this.searchResultsLimit(),
  );

  protected readonly searchResultsStatusLabel = computed(() => {
    if (this.searchScope() !== 'all') {
      return '';
    }

    const total = this.globalSearchMatchesCount();
    const displayed = Math.min(this.searchResultsLimit(), total);

    return `Mostrando ${displayed} de ${total} resultados`;
  });

  protected readonly groups = computed(() =>
    this.buildGroups(this.displayedEntries()),
  );
  protected readonly displayedMonthSummary = computed(() => {
    const entries = this.entryService.entriesSignal();
    const referenceDate = this.referenceMonth() ?? new Date();

    const expensesTotal = this.entryService.calculateMonthlyExpenseTotal(
      entries,
      referenceDate,
    );
    const incomesTotal = this.entryService.calculateMonthlyIncomeTotal(
      entries,
      referenceDate,
    );
    const monthlyBalance = this.entryService.calculateMonthlyBalance(
      entries,
      referenceDate,
    );

    return {
      expensesLabel: this.formatAmount(expensesTotal),
      incomesLabel: this.formatAmount(incomesTotal),
      balanceLabel: this.formatAmount(monthlyBalance),
      subtitle: this.buildMonthSubtitle(referenceDate),
    };
  });
  protected readonly hasReferenceMonth = computed(
    () => this.referenceMonth() !== null,
  );
  protected readonly monthScopeLabel = computed(() =>
    this.hasReferenceMonth() ? 'mes seleccionado' : 'mes en curso',
  );

  protected readonly pageTitle = computed(() =>{
    const referenceMonth = this.referenceMonth();
    if (!referenceMonth) {
      return 'Balance';
    }

    return this.buildMonthSubtitle(referenceMonth);
  })

  constructor() {
    addIcons({
      'information-circle-outline': informationCircleOutline,
      'add-outline': addOutline,
      'chevron-back-outline': chevronBackOutline,
      'wallet-outline': walletOutline,
      'search-outline': searchOutline,
    });

    this.activatedRoute.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const referenceMonth = this.resolveReferenceMonth(
          params.get('year'),
          params.get('month'),
        );

        this.setReferenceMonth(referenceMonth);
      });
  }

  /**
   * Handles the deletion request triggered from the entry item.
   *
   * @param entryId Identifier of the entry to remove.
   */
  protected async handleDeleteEntry(entryId: string, requireConfirmation: boolean = true): Promise<void> {
    await this.entryActionService.confirmAndDeleteEntry(entryId, requireConfirmation);
  }

  /**
   * Navigates to the movement detail for the requested entry.
   *
   * @param entryId Identifier of the entry to inspect.
   */
  protected handleViewEntry(entryId: string): void {
    void this.navController.navigateForward(`/tabs/balance/movement/${entryId}`);
  }

  /**
   * Opens the entry modal in edit mode for the specified entry.
   *
   * @param entryId Identifier of the entry to edit.
   */
  protected handleEditEntry(entryId: string): void {
    const modal = this.modal;
    if (!modal) {
      return;
    }

    const entry = this.entryService
      .entriesSignal()
      .find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    modal.openForEdit(entry);
  }

  /**
   * Receives the data emitted when a new entry has been saved.
   *
   * @param entry Entry data captured through the modal.
   */
  protected handleEntrySaved(entry: EntryCreation): void {
    this.entryService.addEntry(entry);
  }

  /**
   * Receives the data emitted when an entry has been edited.
   *
   * @param payload Entry data modifications captured through the modal.
   */
  protected handleEntryUpdated(payload: EntryUpdatePayload): void {
    this.entryService.updateEntry(payload.id, {
      amount: payload.amount,
      date: payload.date,
      description: payload.description,
    });
  }

  /**
   * Opens the entry modal optionally locking the type selection.
   *
   * @param type Entry type to preset or null to allow selection.
   */
  protected openEntryModal(type: EntryType | null): void {
    const modal = this.modal;
    if (!modal) {
      return;
    }

    modal.setPresetType(type);
    modal.open();
  }

  /**
   * Navigates back to the previous view on the navigation stack.
   */
  protected handleNavigateBack(): void {
    this.navController.pop();
  }

  /**
   * Updates the reference month used to render the balance.
   *
   * @param referenceMonth Month used as reference or null to fall back to the current month.
   */
  public setReferenceMonth(referenceMonth: Date | null): void {
    if (!referenceMonth) {
      this.referenceMonth.set(null);
      this.resetVisibleRange();
      return;
    }

    const normalizedReference = new Date(referenceMonth);
    if (Number.isNaN(normalizedReference.getTime())) {
      this.referenceMonth.set(null);
      this.resetVisibleRange();
      return;
    }

    this.referenceMonth.set(normalizedReference);
  }

  /**
   * Updates the search term used to filter transactions.
   *
   * @param term Current search input value.
   */
  protected handleSearchTermChange(term: string): void {
    this.resetSearchScope();
    this.searchTerm.set(term);
  }

  /**
   * Resets the search term and restores the full transaction list.
   */
  protected handleSearchCleared(): void {
    this.searchTerm.set('');
    this.resetSearchScope();
  }

  /**
   * Extends the visible movement window backwards by a fixed amount of days.
   */
  protected loadMoreMovements(): void {
    this.visibleStartDayKey.update((dayKey) =>
      this.shiftDayKey(dayKey, -BalancePage.loadMoreDays),
    );
  }

  /**
   * Enables searching across the complete local movement history.
   */
  protected expandSearchToAllMovements(): void {
    if (!this.searchActive() || this.hasReferenceMonth()) {
      return;
    }

    this.searchScope.set('all');
    this.searchResultsLimit.set(BalancePage.searchResultsPageSize);
  }

  /**
   * Increases the number of rendered global search results.
   */
  protected loadMoreSearchResults(): void {
    this.searchResultsLimit.update(
      (limit) => limit + BalancePage.searchResultsPageSize,
    );
  }

  /**
   * Selects the entry collection used by the current search mode.
   *
   * @param normalizedTerm Search term normalized for comparison.
   * @returns Entries available to the visible list pipeline.
   */
  private resolveSearchBaseEntries(normalizedTerm: string): EntryData[] {
    if (
      normalizedTerm.length > 0
      && this.searchScope() === 'all'
      && !this.hasReferenceMonth()
    ) {
      return this.entryService.entriesSignal();
    }

    return this.visibleEntries();
  }

  /**
   * Restores the current Balance date window using today's Chilean date.
   */
  private resetVisibleRange(): void {
    const referenceDate = new Date();

    this.visibleStartDayKey.set(this.getInitialVisibleStartDayKey(referenceDate));
    this.visibleEndDayKey.set(this.getCurrentMonthEndDayKey(referenceDate));
  }

  /**
   * Restores visible-only search mode and its result limit.
   */
  private resetSearchScope(): void {
    this.searchScope.set('visible');
    this.searchResultsLimit.set(BalancePage.searchResultsPageSize);
  }

  /**
   * Calculates the first visible day for the current Balance list.
   *
   * @param referenceDate Date used to resolve the current Chilean month.
   * @returns The first visible day key.
   */
  private getInitialVisibleStartDayKey(referenceDate: Date): string {
    const parts = this.getChileDateParts(referenceDate);

    if (parts.day < 5) {
      return this.getPreviousMonthTailStartDayKey(parts.year, parts.month);
    }

    return this.buildDayKey(parts.year, parts.month, 1);
  }

  /**
   * Calculates the last day of the Chilean month that contains the provided date.
   *
   * @param referenceDate Date used to resolve the current Chilean month.
   * @returns The month end day key.
   */
  private getCurrentMonthEndDayKey(referenceDate: Date): string {
    const { year, month } = this.getChileDateParts(referenceDate);
    const lastDay = this.getMonthLastDay(year, month);

    return this.buildDayKey(year, month, lastDay);
  }

  /**
   * Calculates the first of the last five days from the previous month.
   *
   * @param currentYear Chilean calendar year of the current month.
   * @param currentMonth Chilean calendar month starting at 1.
   * @returns The day key that starts the previous month tail.
   */
  private getPreviousMonthTailStartDayKey(currentYear: number, currentMonth: number): string {
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const lastDay = this.getMonthLastDay(previousMonthYear, previousMonth);

    return this.buildDayKey(
      previousMonthYear,
      previousMonth,
      lastDay - BalancePage.loadMoreDays + 1,
    );
  }

  /**
   * Checks whether an entry belongs to the current visible date window.
   *
   * @param entry Entry to evaluate.
   * @returns True when the entry day is inside the visible range.
   */
  private isEntryInsideVisibleRange(entry: EntryData): boolean {
    const dayKey = this.getEntryDayKey(entry);

    return dayKey >= this.visibleStartDayKey()
      && dayKey <= this.visibleEndDayKey();
  }

  /**
   * Checks whether an entry is older than the current visible date window.
   *
   * @param entry Entry to evaluate.
   * @returns True when the entry day is before the visible start day.
   */
  private isEntryBeforeVisibleRange(entry: EntryData): boolean {
    return this.getEntryDayKey(entry) < this.visibleStartDayKey();
  }

  /**
   * Extracts an entry Chilean calendar key.
   *
   * @param entry Entry with an ISO occurrence date.
   * @returns The date key used for visible range comparisons.
   */
  private getEntryDayKey(entry: EntryData): string {
    const { year, month, day } = this.getChileDateParts(new Date(entry.date));

    return this.buildDayKey(year, month, day);
  }

  /**
   * Sorts entries by occurrence date from newest to oldest.
   *
   * @param entries Entries to sort.
   * @returns A sorted copy of the provided entries.
   */
  private sortEntriesByDateDescending(entries: EntryData[]): EntryData[] {
    return [...entries].sort(
      (a, b) => this.normalizeToMillis(b.date) - this.normalizeToMillis(a.date),
    );
  }

  /**
   * Extracts Chilean calendar parts from a date.
   *
   * @param date Date to inspect.
   * @returns Numeric year, month, and day in Chile's timezone.
   */
  private getChileDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = new Map(
      this.dayKeyFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );

    return {
      year: Number(parts.get('year') ?? 0),
      month: Number(parts.get('month') ?? 1),
      day: Number(parts.get('day') ?? 1),
    };
  }

  /**
   * Moves a calendar day key by the requested number of days.
   *
   * @param dayKey Date key using YYYY-MM-DD format.
   * @param days Amount of calendar days to add or subtract.
   * @returns The shifted day key.
   */
  private shiftDayKey(dayKey: string, days: number): string {
    const [year, month, day] = dayKey.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day));
    shifted.setUTCDate(shifted.getUTCDate() + days);

    return this.buildDayKey(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
    );
  }

  /**
   * Builds a sortable date key.
   *
   * @param year Full calendar year.
   * @param month Calendar month starting at 1.
   * @param day Calendar day of month.
   * @returns A zero-padded date key.
   */
  private buildDayKey(year: number, month: number, day: number): string {
    return [
      year.toString().padStart(4, '0'),
      month.toString().padStart(2, '0'),
      day.toString().padStart(2, '0'),
    ].join('-');
  }

  /**
   * Gets the last day number for the provided calendar month.
   *
   * @param year Full calendar year.
   * @param month Calendar month starting at 1.
   * @returns Last day number for the month.
   */
  private getMonthLastDay(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Determines whether the entry matches the search term across its searchable fields.
   *
   * @param entry Entry to test.
   * @param term Lowercase, trimmed search term.
   * @returns True when the entry matches the term on description, formatted amount, or formatted date.
   */
  private matchesSearchTerm(entry: EntryData, term: string): boolean {
    const description = this.normalizeSearchText(this.resolveDescription(entry.description));
    if (description.includes(term)) {
      return true;
    }

    const amountLabel = this.normalizeSearchText(this.formatAmount(entry.amount));
    if (amountLabel.includes(term)) {
      return true;
    }

    const normalizedAmountLabel = this.normalizeAmountSearchText(amountLabel);
    const normalizedAmountTerm = this.normalizeAmountSearchText(term);
    if (
      normalizedAmountTerm.length > 0
      && normalizedAmountLabel.includes(normalizedAmountTerm)
    ) {
      return true;
    }

    const occurrenceDate = new Date(entry.date);
    const dayDescriptor = this.createDayDescriptor(occurrenceDate);
    if (this.normalizeSearchText(dayDescriptor.label).includes(term)) {
      return true;
    }

    return false;
  }

  /**
   * Normalizes a text value for accent-insensitive, case-insensitive comparison.
   *
   * @param value Text to normalize.
   * @returns Lowercase string with diacritical marks stripped, or empty string for nullish input.
   */
  private normalizeSearchText(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Keeps only numeric characters from a search value for amount comparisons.
   *
   * @param value Text to normalize as an amount search value.
   * @returns Numeric search text without currency symbols or separators.
   */
  private normalizeAmountSearchText(value: string): string {
    return value.replace(/\D/g, '');
  }

  /**
   * Creates the balance groups ordered by day and entry recency.
   *
   * @param entries Entries retrieved from the store.
   * @returns The entries grouped by day.
   */
  private buildGroups(entries: EntryData[]): BalanceDayGroup[] {
    const sorted = [...entries].sort(
      (a, b) =>
        this.normalizeToMillis(b.date) - this.normalizeToMillis(a.date),
    );

    const groups: BalanceDayGroup[] = [];

    sorted.forEach((entry) => {
      const occurrenceDate = new Date(entry.date);
      const descriptor = this.createDayDescriptor(occurrenceDate);
      const targetGroup = this.ensureGroup(groups, descriptor);

      targetGroup.items.push({
        id: entry.id,
        amountLabel: this.formatAmount(entry.amount),
        description: this.resolveDescription(entry.description),
        installmentLabel: this.resolveInstallmentLabel(entry),
        timeLabel: this.formatTime(occurrenceDate),
        timestamp: occurrenceDate.getTime(),
        type: entry.type,
        isRecurring: entry.recurrence?.frequency === 'monthly',
      });
    });

    return groups.map((group) => ({
      ...group,
      items: group.items.sort((a, b) => b.timestamp - a.timestamp),
    }));
  }

  /**
   * Finds the matching group or creates a new one when necessary.
   *
   * @param groups Current day groups.
   * @param descriptor Descriptor referencing the target day.
   * @returns An existing or newly created group.
   */
  private ensureGroup(
    groups: BalanceDayGroup[],
    descriptor: { key: string; label: string },
  ): BalanceDayGroup {
    const located = groups.find((group) => group.key === descriptor.key);
    if (located) {
      return located;
    }

    const newGroup: BalanceDayGroup = {
      key: descriptor.key,
      label: descriptor.label,
      items: [],
    };
    groups.push(newGroup);
    return newGroup;
  }

  /**
   * Generates the day descriptor for the provided date on Chile's timezone.
   *
   * @param date Date to transform.
   * @returns The group key and label for the specified date.
   */
  private createDayDescriptor(date: Date): { key: string; label: string } {
    const baseParts = new Map(
      this.dayKeyFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const labelParts = new Map(
      this.dayLabelFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );

    const year = baseParts.get('year') ?? '0000';
    const month = baseParts.get('month') ?? '01';
    const day = baseParts.get('day') ?? '01';

    const weekday =
      (labelParts.get('weekday') ?? '').replace('.', '').toLowerCase();
    const monthName =
      (labelParts.get('month') ?? '').replace('.', '').toLowerCase();

    return {
      key: `${year}-${month}-${day}`,
      label: `${weekday} ${day} ${monthName} ${year}`,
    };
  }

  /**
   * Resolves the installment progress label shown for fixed monthly recurrences.
   *
   * @param entry Entry used to derive installment details.
   * @returns A localized installment label or undefined when not applicable.
   */
  private resolveInstallmentLabel(entry: EntryData): string | undefined {
    return resolveInstallmentDisplayDetailsFromEntry(entry)?.installmentLabel;
  }

  /**
   * Resolves the reference month from the provided query parameter values.
   *
   * @param yearParam Query parameter containing the year.
   * @param monthParam Query parameter containing the month index starting at 1.
   * @returns A date representing the reference month or null when the parameters are invalid.
   */
  private resolveReferenceMonth(
    yearParam: string | null,
    monthParam: string | null,
  ): Date | null {
    if (!yearParam || !monthParam) {
      return null;
    }

    const year = Number.parseInt(yearParam, 10);
    const month = Number.parseInt(monthParam, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return null;
    }

    if (month < 1 || month > 12) {
      return null;
    }

    return new Date(year, month - 1, 1);
  }

  /**
   * Converts the provided ISO string into milliseconds since epoch.
   *
   * @param iso ISO date representation.
   * @returns Milliseconds elapsed since the Unix epoch.
   */
  private normalizeToMillis(iso: string): number {
    const parsed = new Date(iso).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Formats the amount into the required Chilean peso representation.
   *
   * @param amount Amount to format.
   * @returns A formatted CLP amount string.
   */
  private formatAmount(amount: number): string {
    return `$${this.amountFormatter.format(amount).replace(/\u00a0/g, ' ')}`;
  }

  /**
   * Formats the occurrence time using Chile's timezone.
   *
   * @param date Date used to extract the time.
   * @returns The formatted time string.
   */
  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: BalancePage.chileTimeZone,
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(date)
      .toLowerCase();
  }

  /**
   * Ensures the description fallback when no text is available.
   *
   * @param description Optional entry description.
   * @returns The description or a default fallback.
   */
  private resolveDescription(description: string | undefined): string {
    const trimmed = (description ?? '').trim();
    return trimmed.length > 0 ? trimmed : 'transacción';
  }

  /**
   * Creates the subtitle shown in the monthly summary card using the current month and year.
   *
   * @param date Date used to obtain the month descriptor.
   * @returns The subtitle describing the month and year.
   */
  private buildMonthSubtitle(date: Date): string {
    const parts = new Map(
      this.monthLabelFormatter
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const month = parts.get('month') ?? '';
    const year = parts.get('year') ?? '';
    const monthDescriptor =
      month.length > 0 ? `${month} ${year}`.trim() : year;

    return monthDescriptor.length > 0
      ? `${monthDescriptor}`
      : '';
  }
}
