export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
  providerId: string | null;
  lastSignInTime: string | null;
  creationTime: string | null;
}
