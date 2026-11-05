import { SolidarityDate } from '../types';

/**
 * Costruisce una giornata di solidarietà.
 *
 * L'ID ha lo stesso formato usato dall'import del file .ics
 * (`solidarity-AAAA-MM-GG`): una data aggiunta a mano e la stessa data
 * importata dal calendario aziendale finiscono sullo stesso documento,
 * senza duplicati.
 *
 * @param month mese 0-11, come nel resto del modello dati.
 */
export function makeSolidarityDate(year: number, month: number, day: number): SolidarityDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
  return { id: `solidarity-${dateStr}`, day, month, year, dateStr };
}
