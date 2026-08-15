import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  message: string;
  operationType: OperationType;
  path: string | null;
  userId?: string;
}

/** Nome dell'evento emesso su `window` a ogni errore Firestore. */
export const FIRESTORE_ERROR_EVENT = 'firestore-error';

/**
 * Registra un errore Firestore e lo notifica alla UI.
 *
 * NON lancia più un'eccezione: veniva chiamata anche dentro le callback di
 * `onSnapshot`, che sono asincrone. Un `throw` lì dentro non viene intercettato
 * dall'ErrorBoundary (che copre solo il render) e finiva in unhandled rejection,
 * lasciando l'interfaccia muta.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): FirestoreErrorInfo {
  const info: FirestoreErrorInfo = {
    message: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    userId: auth.currentUser?.uid,
  };

  console.error('[Firestore]', info);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<FirestoreErrorInfo>(FIRESTORE_ERROR_EVENT, { detail: info }));
  }

  return info;
}

export const signIn = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);
