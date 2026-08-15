import { buildHoursIndex, breakdownForDay, breakdownForMonth, shiftDurationHours, touchesWeekend } from '../src/lib/hours';
import { Shift, Intervention } from '../src/types';

const S = (y:number,mo:number,d:number,st:string, ey:number,emo:number,ed:number,et:string): Shift =>
  ({ day:d, month:mo, year:y, startTime:st, endTime:et, endDay:ed, endMonth:emo, endYear:ey, hours:0, type:'regular' });
const I = (y:number,mo:number,d:number,st:string,et:string): Intervention =>
  ({ id:'i'+Math.random(), title:'t', location:'', startTime:st, endTime:et, type:'maintenance', extraPay:'', dateLabel:'', day:d, month:mo, year:y });

let fails = 0;
const eq = (name:string, got:number, want:number) => {
  const ok = Math.abs(got-want) < 1e-6; if(!ok) fails++;
  console.log(`${ok?'OK  ':'FAIL'} ${name.padEnd(46)} got=${got.toFixed(3).padStart(7)}  want=${want.toFixed(3)}`);
};

console.log('TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone);

// ---------- Settimana standard: lun 5 -> lun 12 gennaio 2026
const week: Shift[] = [
  S(2026,0,5,'18:00', 2026,0,6,'08:00'),
  S(2026,0,6,'18:00', 2026,0,7,'08:00'),
  S(2026,0,7,'18:00', 2026,0,8,'08:00'),
  S(2026,0,8,'18:00', 2026,0,9,'08:00'),
  S(2026,0,9,'18:00', 2026,0,10,'23:59'),   // ven -> sab fine giornata
  S(2026,0,11,'00:00',2026,0,12,'08:00'),   // dom -> lun 08:00
];
let ix = buildHoursIndex(week, []);
console.log('\n-- Settimana standard --');
eq('lun 05 (solo testa)',  breakdownForDay(ix,2026,0,5).onCallHours, 6);
eq('mar 06 (8h coda + 6h testa)', breakdownForDay(ix,2026,0,6).onCallHours, 14);
eq('mer 07', breakdownForDay(ix,2026,0,7).onCallHours, 14);
eq('gio 08', breakdownForDay(ix,2026,0,8).onCallHours, 14);
eq('ven 09', breakdownForDay(ix,2026,0,9).onCallHours, 14);
eq('sab 10 (23:59 = fine giornata)', breakdownForDay(ix,2026,0,10).onCallHours, 24);
eq('dom 11', breakdownForDay(ix,2026,0,11).onCallHours, 24);
eq('lun 12 (solo coda)', breakdownForDay(ix,2026,0,12).onCallHours, 8);
eq('durata turno ven->sab', shiftDurationHours(week[4]), 30);
eq('durata turno dom->lun', shiftDurationHours(week[5]), 32);

// ---------- Cambio ora AVANTI: dom 29 marzo 2026
ix = buildHoursIndex([S(2026,2,27,'18:00',2026,2,28,'23:59'), S(2026,2,29,'00:00',2026,2,30,'08:00')], []);
console.log('\n-- Cambio ora AVANTI (dom 29/03/2026) --');
eq('sab 28', breakdownForDay(ix,2026,2,28).onCallHours, 24);
eq('dom 29 -> 23h', breakdownForDay(ix,2026,2,29).onCallHours, 23);
eq('lun 30', breakdownForDay(ix,2026,2,30).onCallHours, 8);

// ---------- Cambio ora INDIETRO: dom 25 ottobre 2026
ix = buildHoursIndex([S(2026,9,23,'18:00',2026,9,24,'23:59'), S(2026,9,25,'00:00',2026,9,26,'08:00')], []);
console.log('\n-- Cambio ora INDIETRO (dom 25/10/2026) --');
eq('sab 24', breakdownForDay(ix,2026,9,24).onCallHours, 24);
eq('dom 25 -> 25h', breakdownForDay(ix,2026,9,25).onCallHours, 25);
eq('lun 26', breakdownForDay(ix,2026,9,26).onCallHours, 8);

// ---------- Intervento a cavallo del mese
ix = buildHoursIndex([S(2026,0,30,'18:00',2026,0,31,'08:00')], [I(2026,0,30,'23:00','01:00')]);
console.log('\n-- Intervento 30/01 23:00 -> 31/01 01:00 --');
eq('ven 30: reperibilita 6h - 1h', breakdownForDay(ix,2026,0,30).onCallHours, 5);
eq('ven 30: intervento 1h',        breakdownForDay(ix,2026,0,30).interventionHours, 1);
eq('sab 31: reperibilita 8h - 1h', breakdownForDay(ix,2026,0,31).onCallHours, 7);
eq('sab 31: intervento 1h',        breakdownForDay(ix,2026,0,31).interventionHours, 1);

// ---------- Turno + intervento a cavallo dell'anno
ix = buildHoursIndex([S(2026,11,31,'18:00',2027,0,1,'08:00')], [I(2026,11,31,'23:30','00:30')]);
console.log('\n-- Cavallo di anno --');
eq('dic 2026: reperibilita',  breakdownForMonth(ix,2026,11).onCallHours, 5.5);
eq('gen 2027: reperibilita',  breakdownForMonth(ix,2027,0).onCallHours, 7.5);
eq('dic 2026: intervento 0.5h', breakdownForMonth(ix,2026,11).interventionHours, 0.5);
eq('gen 2027: intervento 0.5h', breakdownForMonth(ix,2027,0).interventionHours, 0.5);

// ---------- Doppio conteggio
ix = buildHoursIndex([S(2026,0,5,'18:00',2026,0,6,'08:00'), S(2026,0,5,'20:00',2026,0,6,'06:00')],
                     [I(2026,0,5,'22:00','23:00'), I(2026,0,5,'22:30','23:30')]);
console.log('\n-- Unione (no doppi conteggi) --');
eq('turni fusi: 6h il giorno 5', breakdownForDay(ix,2026,0,5).rawOnCallHours, 6);
eq('interventi fusi: 1.5h',      breakdownForDay(ix,2026,0,5).interventionHours, 1.5);
eq('reperibilita netta: 4.5h',   breakdownForDay(ix,2026,0,5).onCallHours, 4.5);

// ---------- Flag weekend
console.log('\n-- Flag weekend --');
console.log(`${touchesWeekend(week[4])===true?'OK  ':'FAIL'} turno ven->sab e' weekend      got=${touchesWeekend(week[4])}`);
console.log(`${touchesWeekend(week[0])===false?'OK  ':'FAIL'} turno lun->mar non e' weekend   got=${touchesWeekend(week[0])}`);
if(touchesWeekend(week[4])!==true || touchesWeekend(week[0])!==false) fails++;

console.log(`\n${fails===0 ? 'TUTTI I TEST PASSANO' : fails+' TEST FALLITI'}`);
