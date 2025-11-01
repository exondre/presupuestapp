import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  EntryCreation,
  EntryData,
  EntryType,
  EntryUpdatePayload,
} from '../../models/entry-data.model';

@Component({
  selector: 'app-new-entry-modal',
  standalone: true,
  templateUrl: './new-entry-modal.component.html',
  styleUrls: ['./new-entry-modal.component.scss'],
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonDatetime,
    IonSegment,
    IonSegmentButton,
    ReactiveFormsModule,
  ],
})
export class NewEntryModalComponent implements AfterViewInit {
  protected readonly entrySaved = output<EntryCreation>();
  protected readonly entryUpdated = output<EntryUpdatePayload>();
  protected readonly entryType = EntryType;
  readonly presetType = input<EntryType | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly alertController = inject(AlertController);

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly amountRequiredValidator: ValidatorFn = (control) => {
    const value = typeof control.value === 'string' ? control.value : '';
    const digits = this.normalizeDigits(this.sanitizeAmount(value));
    return digits.length > 0 && digits !== '0' ? null : { required: true };
  };

  private currentPresetType: EntryType | null = null;
  private manualPresetType: EntryType | null = null;
  private isEditMode = false;
  private editingEntry: EntryData | null = null;

  protected isTypeReadOnly = false;

  protected modalTitle = 'Nueva transacción';

  protected readonly form = this.formBuilder.group({
    amount: ['', [this.amountRequiredValidator]],
    description: [''],
    date: [this.createCurrentChileIsoDate(), [Validators.required]],
    type: [EntryType.EXPENSE, [Validators.required]],
  });

  protected isOpen = false;

  protected presentingElement?: HTMLElement;

  protected readonly canDismiss = () => this.handleCanDismiss();

  private hasSavedCurrentForm = false;

  private skipNextDismissGuard = false;

  private static readonly chileTimeZone = 'America/Santiago';

  constructor() {
    this.setupAmountFormatter();
  }

  /**
   * Applies the preset entry type before opening the modal.
   *
   * @param type Entry type to preset or null to allow user selection.
   */
  setPresetType(type: EntryType | null): void {
    this.manualPresetType = type;
  }

  /**
   * Determines the presenting element so the modal behaves as a card modal.
   */
  ngAfterViewInit(): void {
    const routerOutlet = this.elementRef.nativeElement.closest(
      'ion-router-outlet'
    ) as HTMLElement | null;
    this.presentingElement = routerOutlet ?? this.elementRef.nativeElement;
  }

  /**
   * Opens the modal and prepares the form for user input.
   */
  open(): void {
    const inputPreset = this.presetType();
    const presetType = inputPreset ?? this.manualPresetType;
    this.isEditMode = false;
    this.editingEntry = null;
    this.isTypeReadOnly = false;
    this.manualPresetType = null;
    this.currentPresetType = presetType ?? null;
    this.modalTitle = this.buildModalTitle(this.currentPresetType);
    this.resetForm();
    this.hasSavedCurrentForm = false;
    this.isOpen = true;
  }

  /**
   * Opens the modal in edit mode using the provided entry data.
   *
   * @param entry Entry to edit.
   */
  openForEdit(entry: EntryData): void {
    this.isEditMode = true;
    this.editingEntry = entry;
    this.currentPresetType = entry.type;
    this.isTypeReadOnly = true;
    this.modalTitle = this.buildEditModalTitle(entry.type);
    this.resetForm();
    this.populateFormForEdit(entry);
    this.hasSavedCurrentForm = false;
    this.isOpen = true;
  }

  /**
   * Resolves the modal title depending on the preset entry type.
   *
   * @param presetType Entry type provided before opening the modal.
   * @returns The localized title for the modal header.
   */
  private buildModalTitle(presetType: EntryType | null): string {
    if (presetType === EntryType.EXPENSE) {
      return 'Nuevo gasto';
    }
    if (presetType === EntryType.INCOME) {
      return 'Nuevo ingreso';
    }
    return 'Nueva transacción';
  }

  /**
   * Resolves the modal title for edit mode.
   *
   * @param entryType Entry type being edited.
   * @returns The localized title for the modal header while editing.
   */
  private buildEditModalTitle(entryType: EntryType): string {
    if (entryType === EntryType.EXPENSE) {
      return 'Editar gasto';
    }
    if (entryType === EntryType.INCOME) {
      return 'Editar ingreso';
    }
    return 'Editar transacción';
  }

  /**
   * Attempts to close the modal while preserving unsaved data when necessary.
   */
  async close(): Promise<void> {
    const canDismiss = await this.ensureCanDismiss();
    if (!canDismiss) {
      return;
    }

    this.prepareToBypassDismissGuard();
    this.isOpen = false;
  }

  /**
   * Handles the save action by emitting the entry data once validation succeeds.
   */
  protected handleSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { amount, description, date, type } = this.form.getRawValue();
    const parsedAmount = this.parseAmount(amount);
    const normalizedType = this.normalizeFormType(type);
    const normalizedDescription = this.normalizeDescription(description);
    const normalizedDate = this.normalizeDateToUtcIso(date);

    if (this.isEditMode && this.editingEntry) {
      this.hasSavedCurrentForm = true;
      this.prepareToBypassDismissGuard();
      this.isOpen = false;

      this.entryUpdated.emit({
        id: this.editingEntry.id,
        amount: parsedAmount,
        date: normalizedDate,
        description: normalizedDescription,
      });
      return;
    }

    this.hasSavedCurrentForm = true;
    this.prepareToBypassDismissGuard();
    this.isOpen = false;

    this.entrySaved.emit({
      amount: parsedAmount,
      date: normalizedDate,
      description: normalizedDescription,
      type: normalizedType,
    });
  }

  /**
   * Resets the form once the modal has been dismissed.
   */
  protected handleDidDismiss(): void {
    this.isOpen = false;
    this.resetForm();
    this.hasSavedCurrentForm = false;
    this.skipNextDismissGuard = false;
    this.isEditMode = false;
    this.editingEntry = null;
    this.currentPresetType = null;
    this.modalTitle = this.buildModalTitle(null);
    this.isTypeReadOnly = false;
  }

  /**
   * Generates an ISO string for the current date and time in UTC.
   *
   * @returns An ISO date-time string expressed in UTC.
   */
  private createCurrentUtcIsoDate(): string {
    return new Date().toISOString();
  }

  /**
   * Generates an ISO string representing the current date and time for Chile.
   *
   * @returns ISO string adjusted to the Chile timezone.
   */
  private createCurrentChileIsoDate(): string {
    return this.convertDateToChileIso(new Date());
  }

  /**
   * Normalizes the captured date value so it is stored in UTC.
   *
   * @param value Date value captured from the form.
   * @returns An ISO string representing the same instant in UTC.
   */
  private normalizeDateToUtcIso(value: string | null | undefined): string {
    const dateValue = value ?? '';
    if (dateValue.length === 0) {
      return this.createCurrentUtcIsoDate();
    }

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return this.createCurrentUtcIsoDate();
    }

    return parsedDate.toISOString();
  }

  /**
   * Converts the provided date into an ISO string using the Chile timezone.
   *
   * @param date Date instance to convert.
   * @returns ISO string adjusted to the Chile timezone.
   */
  private convertDateToChileIso(date: Date): string {
    const parts = this.createChileDateTimeParts(date);
    const offset = this.resolveChileOffset(date);

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
  }

  /**
   * Builds the individual date-time parts for the specified date in the Chile timezone.
   *
   * @param date Date instance to format.
   * @returns The date-time parts extracted from the Chile timezone formatting.
   */
  private createChileDateTimeParts(date: Date): {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
  } {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: NewEntryModalComponent.chileTimeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const lookup = new Map(parts.map((part) => [part.type, part.value]));

    return {
      year: lookup.get('year') ?? '0000',
      month: lookup.get('month') ?? '01',
      day: lookup.get('day') ?? '01',
      hour: lookup.get('hour') ?? '00',
      minute: lookup.get('minute') ?? '00',
      second: lookup.get('second') ?? '00',
    };
  }

  /**
   * Determines the timezone offset string for Chile at the specified date.
   *
   * @param date Date used to compute the timezone offset.
   * @returns The timezone offset formatted as ±HH:MM.
   */
  private resolveChileOffset(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: NewEntryModalComponent.chileTimeZone,
      timeZoneName: 'shortOffset',
    });

    const timeZoneName =
      formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')
        ?.value ?? 'GMT+0';
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(timeZoneName);

    if (!match) {
      return '+00:00';
    }

    const [, sign, hourPart, minutePart] = match;
    const hours = hourPart.padStart(2, '0');
    const minutes = (minutePart ?? '00').padStart(2, '0');

    return `${sign}${hours}:${minutes}`;
  }

  /**
   * Restores the form controls to their default state.
   */
  private resetForm(): void {
    this.form.controls.type.enable({ emitEvent: false });
    this.form.setValue(
      {
        amount: '',
        description: '',
        date: this.createCurrentChileIsoDate(),
        type: this.determineInitialType(),
      },
      { emitEvent: false }
    );
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  /**
   * Populates the form using the data from the entry being edited.
   *
   * @param entry Entry data used to populate the form.
   */
  private populateFormForEdit(entry: EntryData): void {
    const chileDate = this.convertDateToChileIso(new Date(entry.date));
    this.form.setValue(
      {
        amount: this.formatAmount(String(entry.amount)),
        description: entry.description ?? '',
        date: chileDate,
        type: entry.type,
      },
      { emitEvent: false }
    );
    this.form.controls.type.disable({ emitEvent: false });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  /**
   * Determines the initial entry type that should populate the form.
   *
   * @returns The entry type to display when the modal opens.
   */
  private determineInitialType(): EntryType {
    return this.currentPresetType ?? EntryType.EXPENSE;
  }

  /**
   * Indicates whether the modal can be dismissed safely without losing unsaved changes.
   *
   * @returns A promise resolving to true when the modal can close.
   */
  private async handleCanDismiss(): Promise<boolean> {
    if (this.skipNextDismissGuard) {
      this.skipNextDismissGuard = false;
      return true;
    }

    return this.ensureCanDismiss();
  }

  /**
   * Verifies whether dismissing the modal requires a confirmation due to unsaved data.
   *
   * @returns A promise resolving to true when the modal can be dismissed.
   */
  private async ensureCanDismiss(): Promise<boolean> {
    if (!this.hasUnsavedChanges() || this.hasSavedCurrentForm) {
      return true;
    }

    const alert = await this.alertController.create({
      header: 'Cambios sin guardar',
      message: this.isEditMode
        ? 'Tienes cambios sin guardar. Si continúas se perderán las modificaciones.'
        : 'Has ingresado un monto sin guardar. Si continúas se perderán los cambios.',
      buttons: [
        {
          text: 'Seguir aquí',
          role: 'cancel',
        },
        {
          text: 'Descartar',
          role: 'confirm',
        },
      ],
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /**
   * Marks the next dismissal to skip the confirmation guard.
   */
  private prepareToBypassDismissGuard(): void {
    this.skipNextDismissGuard = true;
  }

  /**
   * Checks if the amount field has an unsaved value.
   *
   * @returns True when an amount has been entered without saving.
   */
  private hasUnsavedChanges(): boolean {
    if (this.isEditMode) {
      return this.form.dirty;
    }

    const digits = this.sanitizeAmount(this.amountControl.value);
    return digits.length > 0;
  }

  /**
   * Trims the description while keeping undefined for empty content.
   *
   * @param description Description entered in the form.
   * @returns A trimmed description or undefined when empty.
   */
  private normalizeDescription(description: string): string | undefined {
    const trimmed = (description ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Normalizes the type selected in the form ensuring it matches one of the supported values.
   *
   * @param value Type value captured from the form.
   * @returns A normalized entry type.
   */
  private normalizeFormType(
    value: string | EntryType | null | undefined
  ): EntryType {
    if (value === EntryType.EXPENSE || value === EntryType.INCOME) {
      return value;
    }

    if (typeof value === 'string') {
      return value.toUpperCase() === EntryType.INCOME
        ? EntryType.INCOME
        : EntryType.EXPENSE;
    }

    return EntryType.EXPENSE;
  }

  /**
   * Configures the formatter used by the amount input to keep the display value in sync.
   */
  private setupAmountFormatter(): void {
    this.amountControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const digits = this.sanitizeAmount(value);
        const formatted = this.formatAmount(digits);

        if (formatted === value) {
          return;
        }

        this.amountControl.setValue(formatted, { emitEvent: false });
      });
  }

  /**
   * Provides access to the amount form control.
   *
   * @returns The amount form control instance.
   */
  private get amountControl(): FormControl<string> {
    return this.form.controls.amount;
  }

  /**
   * Removes every non-digit character from the provided value.
   *
   * @param value Amount value entered by the user.
   * @returns A string containing only digits.
   */
  private sanitizeAmount(value: string | null | undefined): string {
    return (value ?? '').replace(/\D/g, '');
  }

  /**
   * Eliminates unnecessary leading zeros from the amount representation.
   *
   * @param digits String containing only digits.
   * @returns A normalized digit string without leading zeros.
   */
  private normalizeDigits(digits: string): string {
    if (digits.length === 0) {
      return '';
    }

    return digits.replace(/^0+(?!$)/, '');
  }

  /**
   * Formats the provided digits into a currency-style string.
   *
   * @param digits String containing only digits.
   * @returns The formatted amount prefixed with a dollar sign.
   */
  private formatAmount(digits: string): string {
    if (digits.length === 0) {
      return '';
    }

    const normalized = this.normalizeDigits(digits);
    const groups = normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `$${groups || '0'}`;
  }

  /**
   * Converts the formatted amount into an integer value.
   *
   * @param value Amount value captured from the form.
   * @returns A whole number representing the entry amount.
   */
  private parseAmount(value: string): number {
    const normalized = this.normalizeDigits(this.sanitizeAmount(value));
    if (normalized.length === 0) {
      return 0;
    }

    return Number.parseInt(normalized, 10);
  }
}
