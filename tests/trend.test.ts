import { trendWindow, classifyTrend } from '../src/lib/trend';
let pass = 0, fail = 0;
const eq = (n: string, g: unknown, w: unknown) => {
  const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n.padEnd(56)} ${ok ? '' : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`);
};
const oggi = new Date(2026, 10, 5); // 5 novembre 2026
console.log('-- Finestra --');
eq('anno in corso, 5 nov: parte da agosto', trendWindow(2026, oggi), { year: 2026, month: 7 });
eq('anno passato: ottobre-dicembre', trendWindow(2025, oggi), { year: 2025, month: 9 });
eq('anno futuro: nessun trend', trendWindow(2027, oggi), null);
eq('a febbraio: novembre dell\'anno prima', trendWindow(2026, new Date(2026, 1, 10)), { year: 2025, month: 10 });
eq('a gennaio: ottobre dell\'anno prima', trendWindow(2026, new Date(2026, 0, 1)), { year: 2025, month: 9 });
console.log('\n-- Classificazione --');
eq('+10% -> positivo', classifyTrend(110, 100).kind, 'up');
eq('-10% -> negativo', classifyTrend(90, 100).kind, 'down');
eq('+4,9% -> stabile', classifyTrend(104.9, 100).kind, 'flat');
eq('-5% esatto -> negativo', classifyTrend(95, 100).kind, 'down');
eq('anno prima a zero -> nessun confronto', classifyTrend(50, 0).kind, 'none');
eq('percentuale calcolata', Math.round(classifyTrend(412, 380).pct * 10) / 10, 8.4);
console.log(`\n${pass} passati, ${fail} falliti`);
process.exit(fail === 0 ? 0 : 1);
