import { Injectable, NgZone, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseError, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  UserCredential,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  BehaviorSubject,
  Observable,
  Subject,
  distinctUntilChanged,
  filter,
  firstValueFrom,
} from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthUser } from './auth-user.model';
import { LocalStorageService } from '../shared/services/local-storage.service';

export type AuthStatus = 'idle' | 'signing-in' | 'signing-out';

/**
 * Coordinates Firebase authentication, keeping track of the active user and providing
 * utilities to initiate Google based sign-in and sign-out workflows.
 */
@Injectable({
  providedIn: 'root',
})
export class FirebaseAuthService {
  private readonly auth: Auth;

  private readonly zone = inject(NgZone);
  private readonly localStorageService = inject(LocalStorageService);

  private readonly userSubject = new BehaviorSubject<AuthUser | null>(null);
  private readonly rawUserSubject = new BehaviorSubject<any | null>(null);

  private readonly statusSubject = new BehaviorSubject<AuthStatus>('idle');

  private readonly errorsSubject = new Subject<string>();

  private readonly unexpectedSessionSubject = new Subject<void>();

  private hasReceivedInitialSnapshot = false;

  private signOutRequested = false;

  private gAccessToken: string | null = null;

  constructor() {
    if (!getApps().length) {
      initializeApp(environment.firebase);
    }
    this.auth = getAuth(getApp());
    this.configureAuthPersistence().catch(() => {
      // Persistence will fallback to the default session strategy if configuration fails.
    });
    this.observeAuthState();
    void getRedirectResult(this.auth)
      .then((result) => this.handleRedirectResult(result))
      .catch((error) => {
        this.zone.run(() => {
          const message = this.mapErrorToMessage(error);
          this.errorsSubject.next(message);
        });
      });
  }

  /**
   * Emits the current authenticated user, or null when no session exists.
   *
   * @returns Stream with the active user or null.
   */
  get user$(): Observable<AuthUser | null> {
    return this.userSubject.asObservable();
  }

  /**
   * Emits the high level status of the authentication service.
   *
   * @returns Stream with the current auth status.
   */
  get status$(): Observable<AuthStatus> {
    return this.statusSubject.pipe(distinctUntilChanged());
  }

  /**
   * Emits user-friendly error messages describing the last authentication failure.
   *
   * @returns Stream with error messages intended for user feedback.
   */
  get errors$(): Observable<string> {
    return this.errorsSubject.asObservable();
  }

  /**
   * Emits whenever the session ends without an explicit sign-out request, allowing the UI to notify the user.
   *
   * @returns Stream that emits void when a session ends unexpectedly.
   */
  get unexpectedSessionEnd$(): Observable<void> {
    return this.unexpectedSessionSubject.asObservable();
  }

  /**
   * Initiates the Google sign-in flow using a popup when available, falling back to a redirect in environments where popups are unsupported.
   *
   * @returns Promise resolved with the authenticated user details once sign-in completes.
   */
  async signInWithGoogle(): Promise<AuthUser> {
    if (this.statusSubject.value === 'signing-in') {
      throw new Error('LOGIN_ALREADY_IN_PROGRESS');
    }

    this.statusSubject.next('signing-in');
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/drive.appdata');
    provider.setCustomParameters({
      prompt: 'consent',
      access_type: 'offline',
    });

    try {
      if (this.shouldUseRedirectFlow()) {
        await signInWithRedirect(this.auth, provider);
        return this.waitForUser();
      }

      const credential = await signInWithPopup(this.auth, provider);
      const user = this.mapUser(credential.user);
      this.userSubject.next(user);
      this.rawUserSubject.next(credential.user);
      return user;
    } catch (error) {
      console.error('Error during sign-in:', error);
      const message = this.mapErrorToMessage(error);
      this.errorsSubject.next(message);
      throw new Error(message);
    } finally {
      this.statusSubject.next('idle');
    }
  }

  /**
   * Signs the current user out, emitting an unexpected session end event when session loss happens outside of this request.
   *
   * @returns Promise that resolves once Firebase confirms the session termination.
   */
  async signOut(): Promise<void> {
    if (this.statusSubject.value === 'signing-out') {
      return;
    }

    this.statusSubject.next('signing-out');
    this.signOutRequested = true;

    try {
      await signOut(this.auth);
      this.userSubject.next(null);
      this.rawUserSubject.next(null);
    } catch (error) {
      this.signOutRequested = false;
      const message = this.mapErrorToMessage(error);
      this.errorsSubject.next(message);
      throw new Error(message);
    } finally {
      this.statusSubject.next('idle');
    }
  }

  /**
   * Subscribes to Firebase auth state changes and updates the local user representation, emitting
   * a dedicated event when the session disappears without a previous sign-out request.
   */
  private observeAuthState(): void {
    onAuthStateChanged(this.auth, (user) => {
      this.zone.run(() => {
        const mappedUser = user ? this.mapUser(user) : null;
        const previousUser = this.userSubject.value;
        this.userSubject.next(mappedUser);
        this.rawUserSubject.next(this.auth.currentUser);

        if (
          this.hasReceivedInitialSnapshot &&
          previousUser &&
          !mappedUser &&
          !this.signOutRequested
        ) {
          this.unexpectedSessionSubject.next();
        }

        this.hasReceivedInitialSnapshot = true;
        this.signOutRequested = false;
      });
    });
  }

  /**
   * Attempts to persist the authentication session using IndexedDB, falling back to browser storage
   * when the user agent does not allow the preferred persistence layer.
   */
  private async configureAuthPersistence(): Promise<void> {
    try {
      await setPersistence(this.auth, indexedDBLocalPersistence);
    } catch (error) {
      await setPersistence(this.auth, browserLocalPersistence);
    }
  }

  /**
   * Determines whether the sign-in flow should use a redirect strategy instead of popups, which are
   * unsupported on native environments and display-mode standalone PWAs.
   *
   * @returns True when the redirect flow should be used.
   */
  private shouldUseRedirectFlow(): boolean {
    return true;
    if (Capacitor.isNativePlatform()) {
      return true;
    }

    return this.isStandalone();
  }

  /**
   * Checks whether the application is currently running as an installed PWA.
   *
   * @returns True if the display mode corresponds to standalone.
   */
  private isStandalone(): boolean {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false;
    }
    return window.matchMedia('(display-mode: standalone)').matches;
  }

  /**
   * Waits until the auth stream emits a non-null user, returning the latest value once available.
   *
   * @returns Promise resolved with the authenticated user.
   */
  private async waitForUser(): Promise<AuthUser> {
    return firstValueFrom(
      this.user$.pipe(filter((user): user is AuthUser => Boolean(user)))
    );
  }

  private handleRedirectResult(result: UserCredential | null): void {
    if (!result) return;

    console.debug('🔄 Redirect result:', result);

    const googleCred = GoogleAuthProvider.credentialFromResult(result);
    if (googleCred?.accessToken) {
      console.debug("✅ Google OAuth Access Token restaurado vía redirect");
      this.gAccessToken = googleCred.accessToken;
      if (this.gAccessToken) {
        this.localStorageService.gAccessToken = this.gAccessToken;
      }
    }

    const user = this.mapUser(result.user);
    this.userSubject.next(user);
    this.rawUserSubject.next(result.user);
  }

  getGAccessToken(): string | null {
    if (!this.gAccessToken) {
      this.gAccessToken = this.localStorageService.gAccessToken;
    }
    return this.gAccessToken;
  }

  /**
   * Normalizes the Firebase user instance into the structure consumed by the application.
   *
   * @param user Firebase user instance.
   * @returns Application level representation for the authenticated user.
   */
  private mapUser(user: User): AuthUser {
    console.log('Mapping user:', user);
    return {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoUrl: user.photoURL,
      providerId: user.providerData[0]?.providerId ?? null,
      lastSignInTime: user.metadata?.lastSignInTime ?? null,
      creationTime: user.metadata?.creationTime ?? null,
    };
  }

  /**
   * Translates Firebase errors, or unexpected failures, into user friendly messages in Spanish.
   *
   * @param error Error thrown by Firebase or the authentication flow.
   * @returns Localized message ready to be displayed to the user.
   */
  private mapErrorToMessage(error: unknown): string {
    if (
      error instanceof Error &&
      error.message === 'LOGIN_ALREADY_IN_PROGRESS'
    ) {
      return 'Ya hay una autenticación en curso. Espera un momento e inténtalo nuevamente.';
    }

    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/popup-blocked':
          return 'El navegador bloqueó la ventana de inicio de sesión. Permite las ventanas emergentes e inténtalo otra vez.';
        case 'auth/popup-closed-by-user':
          return 'La ventana de autenticación se cerró antes de completar el proceso.';
        case 'auth/cancelled-popup-request':
          return 'Ya hay una solicitud de autenticación activa. Espera a que finalice.';
        case 'auth/network-request-failed':
          return 'No fue posible conectar con el servicio de autenticación. Verifica tu conexión a internet.';
        case 'auth/user-disabled':
          return 'La cuenta de Google seleccionada está inhabilitada.';
        case 'auth/user-not-found':
          return 'La cuenta no existe o fue eliminada.';
        case 'auth/too-many-requests':
          return 'Se detectó actividad inusual. Intenta nuevamente más tarde.';
        default:
          return 'No fue posible completar la autenticación con Google. Intenta nuevamente.';
      }
    }

    return 'Ocurrió un error inesperado durante la autenticación.';
  }
}
