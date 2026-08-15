import { readFileSync } from 'fs';
import {
  decodeCsv, splitCsvLine, parseInfowebDateTime, parseInfowebCsv,
  diffShifts, validateShifts, shiftKey,
} from '../src/lib/import-diff';
import { buildHoursIndex, breakdownForYear } from '../src/lib/hours';
import { Shift } from '../src/types';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(52)} ${ok ? '' : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};

console.log('TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone);

// ---------- decodifica
const buf = readFileSync('tests/fixtures-Reperibili.csv');
const text = decodeCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
console.log('\n-- Decodifica (il file e Windows-1252) --');
eq('nessun carattere di sostituzione', text.includes('\uFFFD'), false);
eq('lineetta decodificata correttamente', text.includes('Storage \u2013 Bologna'), true);

// ---------- splitter CSV
console.log('\n-- Splitter CSV --');
eq('virgolette rimosse', splitCsvLine('"a";"b";"c"'), ['a', 'b', 'c']);
eq('punto e virgola dentro le virgolette', splitCsvLine('"a";"b;c";"d"'), ['a', 'b;c', 'd']);
eq('virgolette raddoppiate', splitCsvLine('"a";"di ""prova""";"c"'), ['a', 'di "prova"', 'c']);
eq('campo vuoto finale', splitCsvLine('"a";"b";""'), ['a', 'b', '']);

// ---------- date
console.log('\n-- Date Infoweb (d/m/yyyy senza zero iniziale) --');
eq('2/1/2026 18:00', parseInfowebDateTime('2/1/2026 18:00'), { year: 2026, month: 0, day: 2, time: '18:00' });
eq('11/12/2026 23:59', parseInfowebDateTime('11/12/2026 23:59'), { year: 2026, month: 11, day: 11, time: '23:59' });
eq('formato ISO rifiutato', parseInfowebDateTime('2026-01-02 18:00'), null);
eq('ora 25 rifiutata', parseInfowebDateTime('2/1/2026 25:00'), null);

// ---------- parsing del file reale
const { shifts, errors } = parseInfowebCsv(text);
console.log('\n-- Parsing del file reale --');
eq('98 righe importate', shifts.length, 98);
eq('nessun errore di riga', errors.length, 0);
eq('solo inizi 00:00 / 18:00', [...new Set(shifts.map(s => s.startTime))].sort(), ['00:00', '18:00']);
eq('solo fini 08:00 / 23:59', [...new Set(shifts.map(s => s.endTime))].sort(), ['08:00', '23:59']);

// `hours` e' derivato, mai letto dal file.
// Infoweb spezza a mezzanotte: una riga 18:00 -> 23:59 vale 6h, non 30.
const tail = shifts.find(s => s.startTime === '18:00' && s.endTime === '23:59')!;
eq('riga 18:00 -> 23:59 vale 6h (23:59 = mezzanotte)', tail.hours, 6);
const weekday = shifts.find(s => s.startTime === '18:00' && s.endTime === '08:00')!;
eq('riga feriale 18:00 -> 08:00 vale 14h', weekday.hours, 14);
const fullDay = shifts.find(s => s.startTime === '00:00' && s.endTime === '23:59')!;
eq('riga 00:00 -> 23:59 vale 24h', fullDay.hours, 24);
const morning = shifts.find(s => s.startTime === '00:00' && s.endTime === '08:00')!;
eq('coda 00:00 -> 08:00 vale 8h', morning.hours, 8);

// ore totali dell'anno via hours.ts
const idx = buildHoursIndex(shifts, []);
eq('ore 2026 dopo la fusione', Math.round(breakdownForYear(idx, 2026).onCallHours * 100) / 100, 1460);

// sei giorni con due turni che iniziano
const byDay = new Map<string, number>();
shifts.forEach(s => { const k = `${s.year}-${s.month}-${s.day}`; byDay.set(k, (byDay.get(k) ?? 0) + 1); });
eq('6 giorni con due turni distinti', [...byDay.values()].filter(n => n > 1).length, 6);
eq('98 chiavi tutte distinte', new Set(shifts.map(shiftKey)).size, 98);

// ---------- validazione: il file reale e pulito
console.log('\n-- Validazione del file reale --');
const anomalies = validateShifts(shifts, []);
eq('nessun errore bloccante', anomalies.filter(a => a.severity === 'error').length, 0);
eq('nessun avviso', anomalies.filter(a => a.severity === 'warning').length, 0);

// ---------- validazione: anomalie iniettate
console.log('\n-- Validazione: anomalie iniettate --');
const base: Shift = { day: 5, month: 0, year: 2026, startTime: '18:00', endTime: '08:00', endDay: 6, endMonth: 0, endYear: 2026, hours: 14, type: 'regular' };
const overlap: Shift = { ...base, day: 5, startTime: '00:00', endTime: '23:59', endDay: 5, hours: 24 };
eq('sovrapposizione = errore', validateShifts([base, overlap]).some(a => a.severity === 'error'), true);
eq('orario 07:00 = avviso', validateShifts([{ ...base, endTime: '07:00' }]).filter(a => a.severity === 'warning').length, 1);
eq('duplicato = errore', validateShifts([base, { ...base }]).some(a => a.severity === 'error'), true);
eq('solidarieta = avviso', validateShifts([base], [{ id: 'x', day: 5, month: 0, year: 2026, dateStr: '2026-01-05' }]).some(a => a.severity === 'warning'), true);

// ---------- diff
console.log('\n-- Diff --');
const half = shifts.slice(0, 50);
const d1 = diffShifts(shifts, half);
eq('50 identici, 48 nuovi', [d1.counts.identical, d1.counts.new], [50, 48]);
eq('nessuna rimozione proposta', d1.counts.onlyInPortal, 0);

const changed = shifts.map((s, i) => (i === 3 ? { ...s, endTime: '07:00' } : s));
const d2 = diffShifts(changed, shifts);
eq('1 modificato, 97 identici', [d2.counts.modified, d2.counts.identical], [1, 97]);
eq('cambio rilevato su endTime', d2.entries.find(e => e.category === 'modified')!.changes[0].field, 'endTime');

// hours divergente NON deve produrre "modificato"
const legacy = shifts.map(s => ({ ...s, hours: s.hours - 0.0166667 }));
eq('hours diverso non conta come modifica', diffShifts(shifts, legacy).counts.modified, 0);

// assenze: solo dentro la finestra del file
const jan = shifts.filter(s => s.month === 0);
const d3 = diffShifts(jan, shifts);
eq('assenze contate solo nella finestra', d3.counts.onlyInPortal, 0);
const extra: Shift = { ...base, day: 20, month: 0, year: 2026, startTime: '00:00', endTime: '08:00', endDay: 20, hours: 8 };
const d4 = diffShifts(jan, [...jan, extra]);
eq('turno assente dentro la finestra segnalato', d4.counts.onlyInPortal, 1);

console.log(`\n${pass} passati, ${fail} falliti`);
process.exit(fail === 0 ? 0 : 1);
