import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  FormControl,
  ValidatorFn,
} from '@angular/forms';
import {
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
} from '@ionic/angular/standalone';
import { AlertController } from '@ionic/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ExpenseCreation } from '../../models/expense-data.model';

@Component({
  selector: 'app-new-expense-modal',
  standalone: true,
  templateUrl: './new-expense-modal.component.html',
  styleUrls: ['./new-expense-modal.component.scss'],
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
    ReactiveFormsModule,
  ],
})
export class NewExpenseModalComponent implements AfterViewInit {
  protected readonly expenseSaved = output<ExpenseCreation>();

  private readonly destroyRef = inject(DestroyRef);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly alertController = inject(AlertController);

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly amountRequiredValidator: ValidatorFn = (control) => {
    const value = typeof control.value === 'string' ? control.value : '';
    const digits = this.normalizeDigits(this.sanitizeAmount(value));
    return digits.length > 0 && digits !== '0' ? null : { required: true };
  };

  protected readonly form = this.formBuilder.group({
    amount: ['', [this.amountRequiredValidator]],
    description: [''],
    date: [this.createCurrentChileIsoDate(), [Validators.required]],
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
   * Determines the presenting element so the modal behaves as a card modal.
   */
  ngAfterViewInit(): void {
    const routerOutlet = this.elementRef.nativeElement.closest(
      'ion-router-outlet',
    ) as HTMLElement | null;
    this.presentingElement = routerOutlet ?? this.elementRef.nativeElement;
  }

  /**
   * Opens the modal and prepares the form for user input.
   */
  open(): void {
    this.resetForm();
    this.hasSavedCurrentForm = false;
    this.isOpen = true;
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
   * Handles the save action by emitting the expense data once validation succeeds.
   */
  protected handleSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { amount, description, date } = this.form.getRawValue();
    const parsedAmount = this.parseAmount(amount);
    this.hasSavedCurrentForm = true;
    this.prepareToBypassDismissGuard();
    this.isOpen = false;

    this.expenseSaved.emit({
      amount: parsedAmount,
      date: this.normalizeDateToUtcIso(date),
      description: this.normalizeDescription(description),
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
      timeZone: NewExpenseModalComponent.chileTimeZone,
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
      timeZone: NewExpenseModalComponent.chileTimeZone,
      timeZoneName: 'shortOffset',
    });

    const timeZoneName =
      formatter
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0';
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
    this.form.setValue(
      {
        amount: '',
        description: '',
        date: this.createCurrentChileIsoDate(),
      },
      { emitEvent: false },
    );
    this.form.markAsPristine();
    this.form.markAsUntouched();
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
    if (!this.hasUnsavedAmount() || this.hasSavedCurrentForm) {
      return true;
    }

    const alert = await this.alertController.create({
      header: 'Cambios sin guardar',
      message:
        'Has ingresado un monto sin guardar. Si continúas se perderán los cambios.',
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
  private hasUnsavedAmount(): boolean {
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
   * @returns A whole number representing the expense amount.
   */
  private parseAmount(value: string): number {
    const normalized = this.normalizeDigits(this.sanitizeAmount(value));
    if (normalized.length === 0) {
      return 0;
    }

    return Number.parseInt(normalized, 10);
  }
}
