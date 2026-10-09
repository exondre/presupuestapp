import { Injectable, inject } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular/standalone';
import { EntryService } from './entry.service';
import { EntryScope, EntryUpdatePayload } from '../models/entry-data.model';

/**
 * Coordinates shared user actions that mutate entries.
 */
@Injectable({
  providedIn: 'root',
})
export class EntryActionService {
  private readonly entryService = inject(EntryService);
  private readonly alertController = inject(AlertController);
  private readonly actionSheetController = inject(ActionSheetController);

  /** Selects an edit scope and saves only after dismissal, preserving drafts on failure. */
  async confirmAndUpdateEntry(payload: EntryUpdatePayload): Promise<'saved' | 'cancelled'> {
    try {
      const entry = this.entryService.entriesSignal().find((item) => item.id === payload.id);
      if (!entry) {
        throw new Error('Entry no longer exists.');
      }
      const { id, ...updates } = payload;
      const valueChanged = (updates.amount !== undefined && updates.amount !== entry.amount) ||
        ('description' in updates && (updates.description?.trim() || undefined) !== entry.description);
      let scope: EntryScope = 'single';
      if (entry.recurrence && valueChanged) {
        const actionSheet = await this.actionSheetController.create({
          header: '¿Qué transacciones quieres modificar?',
          subHeader: updates.date !== undefined
            ? 'El monto y la descripción se aplican al alcance elegido. La fecha cambia solo en esta transacción.'
            : 'Se aplicarán solo los campos modificados.',
          buttons: [
            { text: 'Solo esta transacción', data: 'single' },
            { text: 'Esta y las futuras transacciones', data: 'future' },
            { text: 'Toda la serie (incluye meses anteriores)', data: 'series' },
            { text: 'Cancelar', role: 'cancel' },
          ],
        });
        await actionSheet.present();
        const { data, role } = await actionSheet.onDidDismiss<EntryScope>();
        if (role === 'cancel' || !data || !['single', 'future', 'series'].includes(data)) {
          return 'cancelled';
        }
        scope = data;
      }
      if (!this.entryService.entriesSignal().some((item) => item.id === id)) {
        throw new Error('Entry no longer exists.');
      }
      this.entryService.updateEntry(id, updates, scope);
      return 'saved';
    } catch {
      const alert = await this.alertController.create({
        header: 'No se pudo guardar',
        message: 'No se guardaron los cambios. Conservamos el formulario para que puedas intentarlo nuevamente.',
        buttons: ['Aceptar'],
      });
      await alert.present();
      return 'cancelled';
    }
  }

  /**
   * Confirms and removes the requested entry using the correct recurrence scope.
   *
   * @param entryId Identifier of the entry to remove.
   * @param requireConfirmation Whether a confirmation UI should be presented.
   * @returns True when a removal action was executed; otherwise false.
   */
  async confirmAndDeleteEntry(
    entryId: string,
    requireConfirmation: boolean = true,
  ): Promise<boolean> {
    const entry = this.entryService
      .entriesSignal()
      .find((item) => item.id === entryId);

    if (!entry) {
      return false;
    }

    const isRecurring = entry.recurrence?.frequency === 'monthly';
    if (!isRecurring) {
      return this.confirmAndDeleteSingleEntry(entryId, requireConfirmation);
    }

    return this.confirmAndDeleteRecurringEntry(entryId, requireConfirmation);
  }

  /**
   * Confirms and removes a non-recurring entry.
   *
   * @param entryId Identifier of the entry to remove.
   * @param requireConfirmation Whether a confirmation UI should be presented.
   * @returns True when a removal action was executed; otherwise false.
   */
  private async confirmAndDeleteSingleEntry(
    entryId: string,
    requireConfirmation: boolean,
  ): Promise<boolean> {
    if (!requireConfirmation) {
      this.entryService.removeEntry(entryId);
      return true;
    }

    return new Promise<boolean>(async (resolve) => {
      const resolveOnce = this.createSingleResolver(resolve);
      const alert = await this.alertController.create({
        header: '¿Eliminar transacción?',
        message: 'Esta acción eliminará la transacción de tu registro.',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            handler: () => resolveOnce(false),
          },
          {
            text: 'Eliminar',
            role: 'destructive',
            handler: () => {
              this.entryService.removeEntry(entryId);
              resolveOnce(true);
            },
          },
        ],
      });

      await alert.present();
      await alert.onDidDismiss();
      resolveOnce(false);
    });
  }

  /**
   * Confirms and removes a recurring entry using a selected scope.
   *
   * @param entryId Identifier of the entry to remove.
   * @param requireConfirmation Whether a confirmation UI should be presented.
   * @returns True when a removal action was executed; otherwise false.
   */
  private async confirmAndDeleteRecurringEntry(
    entryId: string,
    requireConfirmation: boolean,
  ): Promise<boolean> {
    if (!requireConfirmation) {
      this.entryService.removeEntry(entryId, 'single');
      return true;
    }

    return new Promise<boolean>(async (resolve) => {
      const resolveOnce = this.createSingleResolver(resolve);
      const actionSheet = await this.actionSheetController.create({
        header: '¿Eliminar gasto recurrente?',
        subHeader: 'Selecciona el alcance de la eliminación.',
        buttons: [
          {
            text: 'Solo esta transacción',
            handler: () => {
              this.entryService.removeEntry(entryId, 'single');
              resolveOnce(true);
            },
          },
          {
            text: 'Esta y las futuras transacciones',
            handler: () => {
              this.entryService.removeEntry(entryId, 'future');
              resolveOnce(true);
            },
          },
          {
            text: 'Eliminar serie completa',
            role: 'destructive',
            handler: () => {
              this.entryService.removeEntry(entryId, 'series');
              resolveOnce(true);
            },
          },
          {
            text: 'Cancelar',
            role: 'cancel',
            handler: () => resolveOnce(false),
          },
        ],
      });

      await actionSheet.present();
      await actionSheet.onDidDismiss();
      resolveOnce(false);
    });
  }

  /**
   * Creates a resolver that can settle a promise only once.
   *
   * @param resolve Promise resolver to wrap.
   * @returns A guarded resolver.
   */
  private createSingleResolver(resolve: (value: boolean) => void): (value: boolean) => void {
    let isResolved = false;

    return (value: boolean) => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      resolve(value);
    };
  }
}
