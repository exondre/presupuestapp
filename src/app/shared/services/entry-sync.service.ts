import { inject, Injectable } from '@angular/core';
import { FirebaseAuthService } from '../../auth/firebase-auth.service';
import { environment } from '../../../environments/environment';
import { time } from 'ionicons/icons';
import { EntryService } from './entry.service';
import { JsonPipe } from '@angular/common';

declare const gapi: any;

/**
 * Placeholder service for the upcoming synchronization between the local data
 * and the remote backend.
 */
@Injectable({
  providedIn: 'root',
})
export class EntrySyncService {
  private readonly firebaseAuthService = inject(FirebaseAuthService);
  private readonly entryService = inject(EntryService);

  private readonly MASTER_FILE_METADATA = {
    appName: 'PresupuestApp',
    master: true,
    version: 1,
    syncTime: null as string | null,
  };

  private readonly MASTER_QUERY =
    "properties.app='PresupuestApp' and properties.master='true'";

  private gapiInitialized = false;

  private async initGapiClient(): Promise<void> {
    try {
      if (this.gapiInitialized) return;

      console.debug('⏳ Initializing GAPI client...');

      await new Promise((resolve) => gapi.load('client', resolve));

      await gapi.client.init({
        discoveryDocs: [
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
        ],
      });

      console.debug('✅ GAPI client initialized');

      this.gapiInitialized = true;
    } catch (error) {
      console.error('❌ Error initializing GAPI client:', error);
      throw error;
    }
  }

  private async ensureToken(): Promise<void> {
    const gAccessToken = this.firebaseAuthService.getGAccessToken();
    if (!gAccessToken) {
      throw new Error('NO_USER_AUTHENTICATED');
    }

    const current = gapi.client.getToken?.();
    if (!current || current.access_token !== gAccessToken) {
      gapi.client.setToken({ access_token: gAccessToken });
    }
  }

  async uploadFile(): Promise<void> {
    console.debug('🚀 Iniciando sincronización con Drive…');

    await this.initGapiClient();
    await this.ensureToken();

    const entries = await this.entryService.serializeEntries();

    if (!entries) {
      throw new Error('NO_ENTRIES_TO_SYNC');
    }

    const existingMasterFile = await this.findMasterFile();

    if (existingMasterFile) {
      await this.updateMasterFile(existingMasterFile.id, entries);
    } else {
      await this.createMasterFile(entries);
    }

    console.debug('✅ Sincronización finalizada con éxito.');
  }

  async printListOfUploadedFiles(): Promise<void> {
    await this.initGapiClient();
    await this.ensureToken();

    const list = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
    });

    console.debug('📂 Archivos en appDataFolder:', list.result.files);
  }

  async printLastUploadedFileContent(): Promise<void> {
    await this.initGapiClient();
    await this.ensureToken();

    const list = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      orderBy: 'createdTime desc',
      pageSize: 1,
    });

    const files = list.result.files || [];
    if (files.length === 0) {
      console.debug('No hay archivos en appDataFolder.');
      return;
    }

    const fileId = files[0].id;
    const file = await gapi.client.drive.files.get({
      fileId: fileId!,
      alt: 'media',
    });

    console.debug('📄 Contenido del último archivo subido:', file.body);
  }

  async clearRemoteData(): Promise<void> {
    await this.initGapiClient();
    await this.ensureToken();

    const list = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
    });

    const files = list.result.files || [];
    for (const file of files) {
      if (file.id) {
        await gapi.client.drive.files.delete({ fileId: file.id });
        console.debug('🗑️ Archivo eliminado con ID:', file.id);
      }
    }
  }

  private async findMasterFile(): Promise<{ id: string; name: string } | null> {
    await this.initGapiClient();
    await this.ensureToken();

    console.debug('🔍 Buscando archivo maestro con query:', this.MASTER_QUERY);

    const res = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      q: "name='presupuestapp-data.json'",
      fields: 'files(id, name, properties)',
    });

    const file =
      (res.result?.files || []).find(
        (f: any) => {
          console.debug('Evaluando archivo:', f);
          return (
            f.properties?.appName === this.MASTER_FILE_METADATA.appName &&
            f.properties?.master === this.MASTER_FILE_METADATA.master.toString()
          );
        }
      ) || null;

    if (file) {
      console.debug('✅ Archivo maestro encontrado:', file);
      return { id: file.id!, name: file.name! };
    } else {
      console.debug('❌ No se encontró archivo maestro.');
      return null;
    }

    return file;
  }

  private async createMasterFile(data: string): Promise<string> {
    console.debug('🆕 Creando nuevo archivo maestro...');

    await this.initGapiClient();
    await this.ensureToken();

    const metadata = {
      name: 'presupuestapp-data.json',
      mimeType: 'application/json',
      parents: ['appDataFolder'],
      properties: this.MASTER_FILE_METADATA,
    };

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', new Blob([data], { type: 'application/json' }));

    const token = gapi.client.getToken()?.access_token;
    if (!token) throw new Error('NO_GOOGLE_ACCESS_TOKEN');

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );

    if (!res.ok) {
      throw new Error(
        `❌ Error creando archivo maestro: ${res.status} ${await res.text()}`
      );
    }

    const json = await res.json();
    console.debug('✅ Archivo maestro creado con ID:', json.id);

    return json.id as string;
  }

  private async updateMasterFile(fileId: string, data: string): Promise<void> {
    console.debug('♻️ Actualizando archivo maestro con ID:', fileId);

    await this.initGapiClient();
    await this.ensureToken();

    const token = gapi.client.getToken()?.access_token;
    if (!token) throw new Error('NO_GOOGLE_ACCESS_TOKEN');

    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: data,
      }
    );

    if (!res.ok) {
      throw new Error(
        `❌ Error actualizando archivo maestro: ${
          res.status
        } ${await res.text()}`
      );
    }

    console.debug('✅ Archivo maestro actualizado correctamente.');
  }

  async doSync(): Promise<void> {
    try {
      console.debug('🚀 Iniciando sincronización y fusión con Drive…');

      await this.initGapiClient();
      await this.ensureToken();

      const existingMasterFile = await this.findMasterFile();

      if (existingMasterFile) {
        console.debug('✅ Archivo maestro encontrado:', existingMasterFile);

        const file = await gapi.client.drive.files.get({
          fileId: existingMasterFile.id!,
          alt: 'media',
        });

        const mergeResult = await this.entryService.compareAndMergeEntries(file.body);
        console.debug('✅ Sincronización y fusión finalizada con éxito:', mergeResult);

        const entriesToSync = await this.entryService.serializeEntries();
        await this.updateMasterFile(existingMasterFile.id, entriesToSync);
        console.debug('✅ Archivo maestro actualizado con éxito.');
      } else {
        console.debug('❌ No se encontró archivo maestro. Creando uno nuevo.');
        const entries = await this.entryService.serializeEntries();
        await this.createMasterFile(entries);
        console.debug('✅ Archivo maestro creado con éxito.');
      }
    } catch (error) {
      console.error('❌ Error durante la sincronización y fusión:', error);
      throw error;
    }
  }

  /**
   * Placeholder method reserved for future synchronization scheduling logic.
   */
  scheduleSync(): void {
    // Synchronization logic will be implemented in a future iteration.
  }
}
