import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

/**
 * Persistenza offline (Fase 3).
 * `persistentLocalCache` usa IndexedDB: turni e interventi restano
 * disponibili anche senza rete — il caso d'uso principale per un'app
 * di reperibilità consultata in cantina o in sala macchine.
 */
/**
 * Il database non è quello di default: il suo ID va passato come TERZO
 * argomento di initializeFirestore, separato dalle impostazioni.
 * Dentro l'oggetto settings viene ignorato e l'SDK cerca '(default)',
 * che in questo progetto non esiste.
 */
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId,
);

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

export const FIRESTORE_ERROR_EVENT = 'firestore-error';

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
