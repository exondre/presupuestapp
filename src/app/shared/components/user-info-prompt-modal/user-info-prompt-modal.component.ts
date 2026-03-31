import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { lockClosedOutline, shieldCheckmarkOutline } from 'ionicons/icons';

import { UserInfo } from '../../models/user-info.model';

/**
 * A modal that prompts the user to register their personal identification data
 * or allows editing existing data. Supports two internal views:
 *
 * - **prompt**: Shows a disclaimer and three action choices (enter data, remind
 *   later, or dismiss permanently).
 * - **form**: Collects the full name and ID document from the user.
 *
 * When `initialData` is provided the component starts directly in form mode
 * with pre-populated fields, which is useful for editing from Settings.
 */
@Component({
  selector: 'app-user-info-prompt-modal',
  standalone: true,
  templateUrl: './user-info-prompt-modal.component.html',
  styleUrls: ['./user-info-prompt-modal.component.scss'],
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonModal,
    IonTitle,
    IonToolbar,
  ],
})
export class UserInfoPromptModalComponent {
  /** Controls modal presentation state. */
  readonly isOpen = input<boolean>(false);

  /**
   * When provided, the component starts directly in form mode with the fields
   * pre-populated. Used from the Settings page to edit existing data.
   */
  readonly initialData = input<UserInfo | null>(null);

  /**
   * When true, the component skips the disclaimer prompt and opens directly in
   * form mode, regardless of whether `initialData` is set. Use this when the
   * user opens the modal with an explicit intent to edit (e.g. from Settings).
   */
  readonly startInFormMode = input<boolean>(false);

  /** Emitted when the user saves their personal info. */
  readonly infoSaved = output<UserInfo>();

  /** Emitted when the user chooses "Recordármelo más tarde". */
  readonly remindLater = output<void>();

  /** Emitted when the user chooses "No volver a preguntar". */
  readonly dontAskAgain = output<void>();

  /** Emitted when the modal is dismissed by any means. */
  readonly dismissed = output<void>();

  /** Tracks whether the user has explicitly navigated from the prompt to the form. */
  private readonly userNavigatedToForm = signal(false);

  /**
   * Derives the current view from static inputs and the user's navigation action.
   * Never set manually — always computed from its sources.
   */
  protected readonly viewState = computed<'prompt' | 'form'>(() =>
    this.startInFormMode() || this.initialData() !== null || this.userNavigatedToForm()
      ? 'form'
      : 'prompt',
  );

  private readonly formBuilder = inject(FormBuilder).nonNullable;

  protected readonly form = this.formBuilder.group({
    fullName: ['', [Validators.required]],
    idDocument: ['', [Validators.required]],
  });

  constructor() {
    addIcons({
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'lock-closed-outline': lockClosedOutline,
    });

    // Pre-populate form whenever initialData changes (e.g. user saves data
    // while modal is closed, then reopens it).
    effect(() => {
      const data = this.initialData();
      if (data) {
        this.form.patchValue({ fullName: data.fullName, idDocument: data.idDocument });
      }
    });
  }

  /**
   * Switches from the disclaimer prompt to the data entry form.
   */
  protected goToForm(): void {
    this.userNavigatedToForm.set(true);
  }

  /**
   * Returns from the form view to the disclaimer prompt.
   */
  protected goBackToPrompt(): void {
    this.userNavigatedToForm.set(false);
    this.form.reset();
  }

  /**
   * Validates and emits the entered user info.
   */
  protected handleSave(): void {
    if (this.form.invalid) {
      return;
    }

    const { fullName, idDocument } = this.form.getRawValue();
    this.infoSaved.emit({ fullName: fullName.trim(), idDocument: idDocument.trim() });
  }

  /**
   * Emits the remind-later event.
   */
  protected handleRemindLater(): void {
    this.remindLater.emit();
  }

  /**
   * Emits the permanent dismissal event.
   */
  protected handleDontAskAgain(): void {
    this.dontAskAgain.emit();
  }

  /**
   * Handles the modal dismiss event, resets internal state.
   */
  protected onDidDismiss(): void {
    this.dismissed.emit();
    this.userNavigatedToForm.set(false);
    this.form.reset();
    const data = this.initialData();
    if (data) {
      this.form.patchValue({ fullName: data.fullName, idDocument: data.idDocument });
    }
  }
}
