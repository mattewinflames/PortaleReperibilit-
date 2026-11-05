/**
 * Trend delle ore: gli ultimi 3 mesi COMPLETI contro gli stessi 3 mesi
 * dell'anno precedente.
 *
 * Il mese in corso è escluso: essendo parziale, darebbe sempre un calo.
 * Per un anno già concluso la finestra è ottobre–dicembre di quell'anno.
 * A inizio anno la finestra può attraversare il capodanno (es. a febbraio:
 * novembre–gennaio), ed è voluto: sono comunque i 3 mesi più recenti.
 */

export const TREND_MONTHS = 3;
/** Sotto questa variazione percentuale il trend è considerato stabile. */
export const TREND_FLAT_THRESHOLD = 5;

/** Primo mese della finestra (mese 0-11; può essere negativo o oltre 11, Date lo normalizza). */
export function trendWindow(selectedYear: number, now: Date): { year: number; month: number } | null {
  if (selectedYear < now.getFullYear()) return { year: selectedYear, month: 12 - TREND_MONTHS };
  if (selectedYear > now.getFullYear()) return null;
  const start = new Date(now.getFullYear(), now.getMonth() - TREND_MONTHS, 1);
  return { year: start.getFullYear(), month: start.getMonth() };
}

export type TrendKind = 'up' | 'down' | 'flat' | 'none';

export function classifyTrend(current: number, previous: number): { kind: TrendKind; pct: number } {
  // Senza ore nell'anno prima non esiste una base di confronto.
  if (previous <= 0) return { kind: 'none', pct: 0 };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < TREND_FLAT_THRESHOLD) return { kind: 'flat', pct };
  return { kind: pct > 0 ? 'up' : 'down', pct };
}
