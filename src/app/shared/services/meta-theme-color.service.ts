import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MetaThemeColorService {
  constructor() {}

  private getDoc(): Document | null {
    // Evita errores cuando no hay DOM disponible (SSR/testing)
    return typeof document !== 'undefined' ? document : null;
  }

  set(color: string) {
    const doc = this.getDoc();
    if (!doc) return;

    let tag = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!tag) {
      tag = doc.createElement('meta');
      tag.name = 'theme-color';
      doc.head.appendChild(tag);
    }

    // Reemplazo para forzar refresco en Safari/iOS
    const clone = tag.cloneNode(true) as HTMLMetaElement;
    clone.setAttribute('content', color);
    tag.replaceWith(clone);
  }
}
