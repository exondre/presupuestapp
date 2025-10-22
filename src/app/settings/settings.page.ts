import {
  Component,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonText,
} from '@ionic/angular/standalone';
import {
  AlertController,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline,
  cloudDownloadOutline,
  warningOutline,
} from 'ionicons/icons';
import { EntryService } from '../shared/services/entry.service';
import { EntryData } from '../shared/models/entry-data.model';

/**
 * Provides application settings such as data import and export utilities.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonText,
  ],
})
export class SettingsPage {
  private static readonly minimumLoaderDuration = 1000;

  @ViewChild('fileInput')
  private readonly fileInput?: ElementRef<HTMLInputElement>;

  private readonly alertController = inject(AlertController);

  private readonly loadingController = inject(LoadingController);

  private readonly toastController = inject(ToastController);

  private readonly entryService = inject(EntryService);

  constructor() {
    addIcons({
      'cloud-upload-outline': cloudUploadOutline,
      'cloud-download-outline': cloudDownloadOutline,
      'warning-outline': warningOutline,
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
   * Processes the file chosen by the user for the import operation.
   *
   * @param event File input change event.
   */
  protected async handleFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.resetFileInput();

    if (file === null) {
      return;
    }

    try {
      await this.withLoader('Importando transacciones…', async () => {
        const fileContent = await file.text();
        const parsedData = JSON.parse(fileContent) as unknown;
        this.entryService.importEntries(parsedData);
      });
      await this.presentToast('Importación completada.');
    } catch (error) {
      await this.presentError(
        'No se pudo importar el archivo. Asegúrate de usar un JSON válido exportado desde la aplicación.',
        error,
      );
    }
  }

  /**
   * Opens the hidden file selector so the user can pick a JSON file.
   */
  private openFileSelector(): void {
    setTimeout(() => {
      this.fileInput?.nativeElement.click();
    }, 0);
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
   */
  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1750,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }

  /**
   * Presents an error alert to the user.
   *
   * @param message Message explaining the failure.
   * @param error Optional error instance for debugging purposes.
   */
  private async presentError(message: string, error: unknown): Promise<void> {
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
