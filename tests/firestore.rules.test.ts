/**
 * Test delle regole Firestore.
 *
 * Richiede l'emulatore. Da eseguire con:
 *
 *   npm install -D @firebase/rules-unit-testing tsx
 *   firebase emulators:exec --only firestore "npx tsx tests/firestore.rules.test.ts"
 *
 * L'emulatore ha bisogno di Java 11+ e scarica un .jar da storage.googleapis.com
 * al primo avvio: dietro il proxy aziendale potrebbe servire configurarlo.
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const PROJECT_ID = 'portale-reperibilita-test';
const ALICE = 'alice-uid';
const BOB = 'bob-uid';

let testEnv: RulesTestEnvironment;
let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`OK   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Turno valido: venerdì 18:00 -> sabato 24:00 (30h, notazione 23:59). */
const validShift = {
  day: 9,
  month: 0,
  year: 2026,
  startTime: '18:00',
  endTime: '23:59',
  endDay: 10,
  endMonth: 0,
  endYear: 2026,
  hours: 30,
  type: 'weekend',
  notes: null,
};

const validIntervention = {
  id: 'int-1',
  title: 'Intervento Tecnico',
  location: '',
  startTime: '23:00',
  endTime: '01:00',
  type: 'maintenance',
  extraPay: '2h',
  dateLabel: '9 gen 2026',
  day: 9,
  month: 0,
  year: 2026,
};

const validSettings = { onCallRate: '12,50', interventionRate: '45,00', taxPercentage: 23 };

const validSolidarity = { id: 'solidarity-2026-12-28', day: 28, month: 11, year: 2026, dateStr: '2026-12-28' };

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await testEnv.clearFirestore();

  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  const anon = testEnv.unauthenticatedContext().firestore();
  const adminClaim = testEnv.authenticatedContext('admin-uid', { admin: true }).firestore();

  console.log('\n-- Isolamento fra utenti --');
  await it('alice scrive un turno proprio', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/shifts/s1`), validShift)));
  await it('bob NON legge i turni di alice', () =>
    assertFails(getDoc(doc(bob, `users/${ALICE}/shifts/s1`))));
  await it('bob NON scrive nei turni di alice', () =>
    assertFails(setDoc(doc(bob, `users/${ALICE}/shifts/s2`), validShift)));
  await it('anonimo NON legge nulla', () =>
    assertFails(getDoc(doc(anon, `users/${ALICE}/shifts/s1`))));
  await it('alice cancella un turno proprio', () =>
    assertSucceeds(deleteDoc(doc(alice, `users/${ALICE}/shifts/s1`))));

  console.log('\n-- Validazione turni --');
  await it('turno valido accettato', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/shifts/s3`), validShift)));
  await it('orario 99:99 rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/shifts/s4`), { ...validShift, startTime: '99:99' })));
  await it('orario legacy 8:00 accettato', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/shifts/s5`), { ...validShift, startTime: '8:00' })));
  await it('mese 12 rifiutato (0-11)', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/shifts/s6`), { ...validShift, month: 12 })));
  await it('hours = 500 rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/shifts/s7`), { ...validShift, hours: 500 })));
  await it('campo estraneo rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/shifts/s8`), { ...validShift, hacked: true })));
  await it('type sconosciuto rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/shifts/s9`), { ...validShift, type: 'festivo' })));

  console.log('\n-- Validazione interventi --');
  await it('intervento valido accettato', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/interventions/i1`), validIntervention)));
  await it('type security accettato', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/interventions/i2`), { ...validIntervention, type: 'security' })));
  await it('title vuoto rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/interventions/i3`), { ...validIntervention, title: '' })));
  await it('id mancante rifiutato', () => {
    const { id, ...noId } = validIntervention;
    return assertFails(setDoc(doc(alice, `users/${ALICE}/interventions/i4`), noId));
  });

  console.log('\n-- Validazione impostazioni --');
  await it('settings valide accettate', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/settings/current`), validSettings)));
  await it('taxPercentage 23.5 rifiutato (deve essere int)', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/settings/current`), { ...validSettings, taxPercentage: 23.5 })));
  await it('taxPercentage 150 rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/settings/current`), { ...validSettings, taxPercentage: 150 })));
  await it('tariffa "abc" rifiutata', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/settings/current`), { ...validSettings, onCallRate: 'abc' })));

  console.log('\n-- Solidarietà --');
  await it('data valida accettata', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/solidarityDates/d1`), validSolidarity)));
  await it('dateStr malformata rifiutata', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/solidarityDates/d2`), { ...validSolidarity, dateStr: '28/12/2026' })));

  console.log('\n-- Ferie --');
  const validVacation = { id: 'vacation-1', startDate: '2026-08-10', endDate: '2026-08-21', note: null };
  await it('periodo valido accettato', () =>
    assertSucceeds(setDoc(doc(alice, `users/${ALICE}/vacations/v1`), validVacation)));
  await it('data in formato italiano rifiutata', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/vacations/v2`), { ...validVacation, startDate: '10/08/2026' })));
  await it('nota oltre 200 caratteri rifiutata', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/vacations/v3`), { ...validVacation, note: 'x'.repeat(201) })));
  await it('campo estraneo rifiutato', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}/vacations/v4`), { ...validVacation, ore: 8 })));
  await it('bob NON legge le ferie di alice', () =>
    assertFails(getDoc(doc(bob, `users/${ALICE}/vacations/v1`))));

  console.log('\n-- Admin --');
  await it('admin via custom claim legge i turni di alice', () =>
    assertSucceeds(getDoc(doc(adminClaim, `users/${ALICE}/shifts/s3`))));
  await it('utente normale NON crea se stesso admin', () =>
    assertFails(setDoc(doc(alice, 'admins/alice-uid'), {})));
  await it('admin via claim NON scrive /admins', () =>
    assertFails(setDoc(doc(adminClaim, 'admins/chiunque'), {})));
  await it('alice NON legge /admins', () =>
    assertFails(getDoc(doc(alice, 'admins/alice-uid'))));

  console.log('\n-- Default deny --');
  await it('la vecchia test/connection e negata', () =>
    assertFails(getDoc(doc(alice, 'test/connection'))));
  await it('collection arbitraria negata', () =>
    assertFails(setDoc(doc(alice, 'qualsiasi/cosa'), { x: 1 })));
  await it('users/{uid} non e scrivibile', () =>
    assertFails(setDoc(doc(alice, `users/${ALICE}`), { role: 'admin' })));

  await testEnv.cleanup();

  console.log(`\n${passed} passati, ${failed} falliti`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
