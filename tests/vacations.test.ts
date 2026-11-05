import {
  parseIsoDate, vacationDays, findVacationForDay, validateVacation, vacationConflicts,
} from '../src/lib/vacations';
import { Shift, Vacation } from '../src/types';

let pass = 0, fail = 0;
const eq = (n: string, g: unknown, w: unknown) => {
  const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n.padEnd(58)} ${ok ? '' : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`);
};
const S = (o: Partial<Shift>): Shift => ({ day: 1, month: 7, year: 2026, startTime: '18:00', endTime: '08:00', endDay: 2, endMonth: 7, endYear: 2026, hours: 14, type: 'regular', ...o });
const V = (id: string, a: string, b: string): Vacation => ({ id, startDate: a, endDate: b });

console.log('TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone);

console.log('\n-- Date --');
eq('2026-08-03 valida', parseIsoDate('2026-08-03'), { year: 2026, month: 7, day: 3 });
eq('2026-02-30 inesistente', parseIsoDate('2026-02-30'), null);
eq('formato italiano rifiutato', parseIsoDate('03/08/2026'), null);

console.log('\n-- Durata --');
eq('un solo giorno = 1', vacationDays(V('a', '2026-08-10', '2026-08-10')), 1);
eq('10-21 agosto = 12', vacationDays(V('a', '2026-08-10', '2026-08-21')), 12);
eq('a cavallo del cambio ora (24-26 ott) = 3', vacationDays(V('a', '2026-10-24', '2026-10-26')), 3);
eq('a cavallo d\'anno (30 dic - 2 gen) = 4', vacationDays(V('a', '2026-12-30', '2027-01-02')), 4);

console.log('\n-- Giorno dentro le ferie --');
const list = [V('a', '2026-08-10', '2026-08-21')];
eq('primo giorno incluso', findVacationForDay(list, 2026, 7, 10)?.id, 'a');
eq('ultimo giorno incluso', findVacationForDay(list, 2026, 7, 21)?.id, 'a');
eq('giorno dopo escluso', findVacationForDay(list, 2026, 7, 22), undefined);

console.log('\n-- Validazione --');
eq('fine prima dell\'inizio', validateVacation(V('n', '2026-08-10', '2026-08-01'), []), 'La fine non può precedere l’inizio.');
eq('sovrapposizione rifiutata', validateVacation(V('n', '2026-08-20', '2026-08-25'), list) !== null, true);
eq('periodi adiacenti ammessi', validateVacation(V('n', '2026-08-22', '2026-08-25'), list), null);
eq('modificare se stesso non e\' sovrapposizione', validateVacation(V('a', '2026-08-09', '2026-08-21'), list), null);

console.log('\n-- Conflitti con i turni --');
// ferie 10-21 agosto
let c = vacationConflicts([S({ day: 12, endDay: 13 })], list);
eq('turno 12/08 18:00 -> 13/08 08:00: 14h in conflitto', c.map(x => x.hours), [14]);
c = vacationConflicts([S({ day: 9, endDay: 10 })], list);
eq('turno 9/08 18:00 -> 10/08 08:00: solo le 8h del 10', c.map(x => x.hours), [8]);
c = vacationConflicts([S({ day: 9, startTime: '00:00', endTime: '23:59', endDay: 9 })], list);
eq('turno che finisce alla mezzanotte d\'inizio: nessun conflitto', c.length, 0);
c = vacationConflicts([S({ day: 21, endDay: 22 })], list);
eq('turno 21/08 18:00 -> 22/08 08:00: solo le 6h del 21', c.map(x => x.hours), [6]);
c = vacationConflicts([S({ day: 12, endDay: 13 })], list, new Date(2026, 7, 13, 0, 0).getTime());
eq('da una certa data: conta solo la parte successiva', c.map(x => x.hours), [8]);

console.log(`\n${pass} passati, ${fail} falliti`);
process.exit(fail === 0 ? 0 : 1);
