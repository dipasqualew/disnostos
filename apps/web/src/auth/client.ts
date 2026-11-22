import { initializeApp } from 'firebase/app';
import {
  confirmPasswordReset,
  connectAuthEmulator,
  getAuth,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';

export type SessionUser = { uid: string; email: string | null };

/** Everything the app needs from Identity Platform. There is deliberately no sign-up. */
export type AuthClient = {
  subscribe(listener: (user: SessionUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  checkResetCode(code: string): Promise<void>;
  confirmReset(code: string, password: string): Promise<void>;
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
};

export function createAuthClient(): AuthClient {
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'missing-api-key',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  });
  const auth = getAuth(app);
  const emulator = import.meta.env.VITE_AUTH_EMULATOR_URL;
  if (emulator) connectAuthEmulator(auth, emulator, { disableWarnings: true });

  return {
    subscribe: (listener) =>
      onIdTokenChanged(auth, (user) =>
        listener(user && { uid: user.uid, email: user.email }),
      ),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: () => signOut(auth),
    // The continue URL brings the user back here from Google's hosted reset page.
    requestPasswordReset: (email) =>
      sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/` }),
    checkResetCode: async (code) => {
      await verifyPasswordResetCode(auth, code);
    },
    confirmReset: (code, password) => confirmPasswordReset(auth, code, password),
    getIdToken: async (forceRefresh = false) =>
      (await auth.currentUser?.getIdToken(forceRefresh)) ?? null,
  };
}
