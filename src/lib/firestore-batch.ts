import { WriteBatch, writeBatch, Firestore, DocumentReference } from 'firebase/firestore';

/**
 * Firestore accetta al massimo 500 operazioni per batch.
 * Restiamo sotto la soglia con un margine di sicurezza.
 */
export const MAX_BATCH_OPERATIONS = 450;

type BatchOp = (batch: WriteBatch) => void;

/**
 * Esegue una lista arbitraria di operazioni spezzandola in più batch.
 * Prima di questa funzione, importare un anno di turni o svuotare l'account
 * falliva silenziosamente non appena si superavano le 500 scritture.
 */
export async function commitInChunks(db: Firestore, operations: BatchOp[]): Promise<number> {
  let committed = 0;

  for (let i = 0; i < operations.length; i += MAX_BATCH_OPERATIONS) {
    const slice = operations.slice(i, i + MAX_BATCH_OPERATIONS);
    const batch = writeBatch(db);
    slice.forEach((op) => op(batch));
    await batch.commit();
    committed += slice.length;
  }

  return committed;
}

/** Scorciatoia: cancella una lista di documenti, in batch. */
export async function deleteAllInChunks(db: Firestore, refs: DocumentReference[]): Promise<number> {
  return commitInChunks(
    db,
    refs.map((ref) => (batch: WriteBatch) => batch.delete(ref)),
  );
}
