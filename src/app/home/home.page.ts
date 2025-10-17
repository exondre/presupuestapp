import { Component, ViewChild, inject } from '@angular/core';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryCreation, EntryType } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonButton, NewEntryModalComponent],
})
export class HomePage {
  @ViewChild('newEntryModal')
  private modal?: NewEntryModalComponent;

  private readonly entryService = inject(EntryService);

  /**
   * Receives the data emitted when a new entry has been saved.
   *
   * @param entry Entry data captured through the modal.
   */
  protected handleEntrySaved(entry: EntryCreation): void {
    this.entryService.addEntry(entry);
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
}
