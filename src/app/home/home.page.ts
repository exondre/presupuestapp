import { Component, inject } from '@angular/core';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';
import { EntryCreation } from '../shared/models/entry-data.model';
import { EntryService } from '../shared/services/entry.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonButton, NewEntryModalComponent],
})
export class HomePage {
  private readonly entryService = inject(EntryService);

  /**
   * Receives the data emitted when a new entry has been saved.
   *
   * @param entry Entry data captured through the modal.
   */
  protected handleEntrySaved(entry: EntryCreation): void {
    this.entryService.addEntry(entry);
  }
}
