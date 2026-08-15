import { shiftInterval, dayRange } from '../src/lib/hours';
import { Shift } from '../src/types';

let pass=0, fail=0;
const eq=(n:string,g:unknown,w:unknown)=>{const ok=g===w;ok?pass++:fail++;console.log(`${ok?'OK  ':'FAIL'} ${n.padEnd(56)} ${ok?'':`got=${g} want=${w}`}`);};

// replica della logica nuova
const conflict = (s: Shift, sol:{day:number;month:number;year:number}) => {
  const iv = shiftInterval(s); if(!iv) return 0;
  const d = dayRange(sol.year, sol.month, sol.day);
  const a = Math.max(iv.start, d.start), b = Math.min(iv.end, d.end);
  return a>=b ? 0 : (b-a)/3600000;
};
const S=(o:Partial<Shift>):Shift=>({day:1,month:5,year:2026,startTime:'18:00',endTime:'08:00',endDay:2,endMonth:5,endYear:2026,hours:14,type:'regular',...o} as Shift);
const sol1giu={day:1,month:5,year:2026};

console.log('-- Il caso segnalato --');
eq('turno che FINISCE alle 00:00 del 1/6 -> nessun conflitto',
   conflict(S({day:31,month:4,startTime:'00:00',endTime:'00:00',endDay:1,endMonth:5}), sol1giu), 0);

console.log('\n-- Conflitti veri (devono scattare) --');
eq('turno 1/6 18:00 -> 2/6 08:00 = 6h sul 1/6',
   conflict(S({day:1,startTime:'18:00',endTime:'08:00',endDay:2}), sol1giu), 6);
eq('turno 31/5 18:00 -> 1/6 08:00 = 8h sul 1/6',
   conflict(S({day:31,month:4,startTime:'18:00',endTime:'08:00',endDay:1,endMonth:5}), sol1giu), 8);
eq('turno che copre tutto il 1/6 = 24h',
   conflict(S({day:1,startTime:'00:00',endTime:'23:59',endDay:1}), sol1giu), 24);

console.log('\n-- Altri estremi --');
eq('turno che INIZIA alle 00:00 del 2/6 -> nessun conflitto col 1/6',
   conflict(S({day:2,startTime:'00:00',endTime:'08:00',endDay:2}), sol1giu), 0);
eq('turno tutto in un altro giorno -> nessun conflitto',
   conflict(S({day:10,startTime:'18:00',endTime:'08:00',endDay:11}), sol1giu), 0);

console.log(`\n${pass} passati, ${fail} falliti`);
process.exit(fail===0?0:1);
