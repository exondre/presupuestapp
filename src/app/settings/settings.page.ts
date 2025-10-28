import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AlertController,
  IonAvatar,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  LoadingController,
  ToastController,
} from '@ionic/angular/standalone';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addIcons } from 'ionicons';
import {
  cloudDownloadOutline,
  cloudUploadOutline,
  logoGoogle,
  warningOutline,
} from 'ionicons/icons';
import packageInfo from '../../../package.json';
import { EntryData } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';
import { FirebaseAuthService, AuthStatus } from '../auth/firebase-auth.service';
import { environment } from '../../environments/environment';

/**
 * Provides application settings such as data import and export utilities.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    AsyncPipe,
    JsonPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonAvatar,
    IonButton,
    IonSpinner,
    IonText,
  ],
})
export class SettingsPage {
  private static readonly minimumLoaderDuration = 1000;

  protected readonly appVersion = packageInfo.version;

  @ViewChild('fileInput')
  private readonly fileInput?: ElementRef<HTMLInputElement>;

  private readonly alertController = inject(AlertController);

  private readonly loadingController = inject(LoadingController);

  private readonly toastController = inject(ToastController);

  private readonly entryService = inject(EntryService);

  private readonly firebaseAuthService = inject(FirebaseAuthService);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly shouldShowAuthDebugInfo = environment.features.authDebugInfo;

  protected readonly authUser$ = this.firebaseAuthService.user$;

  protected readonly authStatus = signal<AuthStatus>('idle');

  protected readonly isSigningIn = computed(() => this.authStatus() === 'signing-in');

  protected readonly isSigningOut = computed(() => this.authStatus() === 'signing-out');

  constructor() {
    addIcons({
      'cloud-upload-outline': cloudUploadOutline,
      'cloud-download-outline': cloudDownloadOutline,
      'logo-google': logoGoogle,
      'warning-outline': warningOutline,
    });

    this.firebaseAuthService.status$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        this.authStatus.set(status);
      });

    this.firebaseAuthService.errors$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => {
        void this.presentError(message);
      });

    this.firebaseAuthService.unexpectedSessionEnd$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const warningMessage = 'Tu sesión con Google se cerró inesperadamente. Inicia sesión nuevamente si lo necesitas.';
        void this.presentToast(warningMessage, 'warning');
      });
  }

  /**
   * Handles the user interaction to import entries from a JSON file.
   */
  protected async handleImport(): Promise<void> {
    const entries = this.entryService.getEntriesSnapshot();
    if (entries.length > 0) {
      const alert = await this.alertController.create({
        header: 'Sobrescribir datos',
        message:
          'Ya existen transacciones almacenadas. Si continúas se reemplazarán por el contenido del archivo.',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
          },
          {
            text: 'Sobrescribir',
            role: 'confirm',
            handler: () => {
              this.openFileSelector();
            }
          },
        ],
      });

      await alert.present();
      return;
    }

    this.openFileSelector();
  }

  /**
   * Initiates the export of all entries into a JSON file.
   */
  protected async handleExport(): Promise<void> {
    try {
      await this.withLoader('Exportando transacciones…', async () => {
        const entries = this.entryService.getEntriesSnapshot();
        this.downloadEntries(entries);
      });
      await this.presentToast('Exportación completada.');
    } catch (error) {
      await this.presentError(
        'No se pudo generar el archivo de exportación. Intenta nuevamente.',
        error,
      );
    }
  }

  /**
   * Initiates the optional Google authentication flow.
   */
  protected async handleGoogleSignIn(): Promise<void> {
    try {
      const user = await this.withLoader('Iniciando sesión…', () =>
        this.firebaseAuthService.signInWithGoogle(),
      );

      if (user) {
        console.log('Authenticated user:', user);
        const greeting = user.displayName
          ? `Sesión iniciada como ${user.displayName}.`
          : 'Sesión iniciada correctamente.';
        await this.presentToast(greeting);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      } else {
        console.error('Unexpected error during Google sign-in.', error);
      }
    }
  }

  /**
   * Signs the current user out from the optional authentication flow.
   */
  protected async handleGoogleSignOut(): Promise<void> {
    try {
      await this.withLoader('Cerrando sesión…', () =>
        this.firebaseAuthService.signOut(),
      );
      await this.presentToast('Sesión cerrada correctamente.');
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      } else {
        console.error('Unexpected error during Google sign-out.', error);
      }
    }
  }

  /**
   * Processes the file chosen by the user for the import operation.
   *
   * @param event File input change event.
   */
  protected async handleFileSelected(event: Event): Promise<void> {
    try {
      const input = event.target as HTMLInputElement | null;
      const file = input?.files?.[0] ?? null;

      if (!file) {
        await this.presentError('No se seleccionó ningún archivo.', null);
        return;
      }

      await this.withLoader('Importando transacciones…', async () => {
        let fileContent: string;
        try {
          fileContent = await file.text();
        } catch (readError) {
          console.error('Error al leer el archivo:', readError);
          throw new Error('No se pudo leer el archivo seleccionado.');
        }

        let parsedData: unknown;
        try {
          parsedData = JSON.parse(fileContent);
        } catch (parseError) {
          console.error('Error al parsear el JSON:', parseError);
          throw new Error(
            'El archivo no contiene un JSON válido. Por favor, selecciona un archivo exportado desde la aplicación.',
          );
        }

        if (
          parsedData === null ||
          typeof parsedData !== 'object' ||
          (Array.isArray(parsedData) && parsedData.length === 0)
        ) {
          throw new Error(
            'El archivo JSON está vacío o no contiene datos válidos para importar.',
          );
        }

        try {
          this.entryService.importEntries(parsedData);
        } catch (importError) {
          console.error('Error al importar las entradas:', importError);
          throw new Error(
            'No se pudo importar el archivo. Asegúrate de usar un JSON válido exportado desde la aplicación.',
          );
        }
      });
      await this.presentToast('Importación completada.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Ocurrió un error inesperado durante la importación.';
      await this.presentError(message, error);
    } finally {
      this.resetFileInput();
    }
  }

  /**
   * Opens the hidden file selector so the user can pick a JSON file.
   */
  private openFileSelector(): void {
    this.fileInput?.nativeElement.click();
  }

  /**
   * Resets the hidden file input value to allow selecting the same file again.
   */
  private resetFileInput(): void {
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  /**
   * Wraps an asynchronous operation with a loading indicator shown for at least one second.
   *
   * @param message Message to show alongside the loader.
   * @param operation Operation to execute while the loader is displayed.
   * @returns Result of the operation.
   */
  private async withLoader<T>(
    message: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const loader = await this.loadingController.create({
      message,
      spinner: 'crescent',
    });

    await loader.present();
    const start = Date.now();

    try {
      const result = await operation();
      const elapsed = Date.now() - start;
      if (elapsed < SettingsPage.minimumLoaderDuration) {
        await new Promise((resolve) =>
          setTimeout(resolve, SettingsPage.minimumLoaderDuration - elapsed),
        );
      }
      return result;
    } finally {
      await loader.dismiss();
    }
  }

  /**
   * Creates a downloadable JSON file containing the provided entries.
   *
   * @param entries Entries to include in the export file.
   */
  private downloadEntries(entries: EntryData[]): void {
    const serialized = JSON.stringify(entries, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:]/g, '-');

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `presupuestapp-transacciones-${timestamp}.json`;
    anchor.rel = 'noopener';

    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }

  /**
   * Displays a toast with the provided message.
   *
   * @param message Message to present.
   * @param color Visual style applied to the toast.
   */
  private async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success',
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1750,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  /**
   * Presents an error alert to the user.
   *
   * @param message Message explaining the failure.
   * @param error Optional error instance for debugging purposes.
   */
  private async presentError(message: string, error?: unknown): Promise<void> {
    if (error instanceof Error) {
      console.error(error);
    }

    const alert = await this.alertController.create({
      header: 'Operación no completada',
      message,
      buttons: [
        {
          text: 'Entendido',
          role: 'confirm',
        },
      ],
    });

    await alert.present();
  }
}
