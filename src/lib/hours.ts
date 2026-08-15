import { Intervention, Shift } from '../types';

/**
 * ============================================================================
 *  UNICA FONTE DI VERITÀ PER IL CALCOLO DELLE ORE
 * ============================================================================
 *
 *  REGOLE DEL DOMINIO (confermate)
 *
 *  1) TEMPO REALE TRASCORSO, NON ORE DA CALENDARIO.
 *     Nella notte del cambio ora si lavora davvero un'ora in più o in meno,
 *     e va pagata così. Gli istanti sono `Date` locali e le durate sono
 *     differenze di millisecondi: la domenica del cambio ora dura 23 o 25 ore
 *     e il calcolo se ne accorge da solo, senza casi speciali.
 *
 *  2) OGNI GIORNATA VA DA MEZZANOTTE LOCALE A MEZZANOTTE LOCALE.
 *     Un turno che scavalca la mezzanotte lascia la sua quota parte al primo
 *     giorno e il resto al secondo. Idem per i mesi e per gli anni.
 *     Nessuna entità viene mai attribuita per intero al suo giorno di inizio.
 *
 *  3) INTERVENTI E TURNI SI RITAGLIANO ALLO STESSO MODO.
 *     Un intervento 31/01 23:00 -> 01/02 01:00 mette un'ora a gennaio e una a
 *     febbraio, sia come ore pagate sia come ore sottratte alla reperibilità.
 *
 *  4) LE ORE SI CONTANO UNA VOLTA SOLA.
 *     Turni sovrapposti fra loro, o interventi che ricadono dentro più turni,
 *     vengono fusi (unione di intervalli) prima del conteggio.
 *
 *  5) NESSUNA MAGGIORAZIONE.
 *     Due sole tariffe: reperibilità e intervento. Festivi, notturni e weekend
 *     non cambiano nulla. Nessun minimo garantito per chiamata.
 *
 *  6) `23:59` COME FINE TURNO SIGNIFICA "FINE GIORNATA".
 *     È la notazione con cui Infoweb esporta una copertura fino a mezzanotte.
 *     La normalizzazione vale solo per i turni, non per gli interventi.
 */

const HOUR_MS = 3_600_000;

/** Marcatore Infoweb di fine giornata. Vedi regola 6. */
const END_OF_DAY_MARKER = '23:59';

export interface Interval {
  /** millisecondi epoch (tempo reale) */
  start: number;
  end: number;
}

export interface Breakdown {
  /** Ore di reperibilità al netto degli interventi sovrapposti. */
  onCallHours: number;
  /** Ore di reperibilità lorde, prima della sottrazione. */
  rawOnCallHours: number;
  /** Ore assorbite dagli interventi (rawOnCallHours - onCallHours). */
  overlapHours: number;
  /** Ore di intervento ricadenti nell'intervallo. */
  interventionHours: number;
  /** onCallHours + interventionHours */
  totalHours: number;
}

const EMPTY_BREAKDOWN: Breakdown = {
  onCallHours: 0,
  rawOnCallHours: 0,
  overlapHours: 0,
  interventionHours: 0,
  totalHours: 0,
};

/* -------------------------------------------------------------------------- */
/* Istanti locali                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Istante locale in millisecondi. `time` in formato HH:mm.
 *
 * Il costruttore `Date(y, m, d, h, min)` interpreta i campi come ora locale e
 * risolve da sé le transizioni di ora legale. Overflow su giorno e mese sono
 * gestiti nativamente: `localTime(2026, 0, 32)` è il 1° febbraio.
 */
export function localTime(year: number, month: number, day: number, time = '00:00'): number {
  const parts = (time || '00:00').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return new Date(year, month, day, h, m, 0, 0).getTime();
}

/** Mezzanotte locale del giorno indicato. */
export function startOfLocalDay(year: number, month: number, day: number): number {
  return new Date(year, month, day, 0, 0, 0, 0).getTime();
}

/** Il giorno dura 23, 24 o 25 ore a seconda del cambio ora. */
export function dayRange(year: number, month: number, day: number): Interval {
  return { start: startOfLocalDay(year, month, day), end: startOfLocalDay(year, month, day + 1) };
}

export function monthRange(year: number, month: number): Interval {
  return { start: startOfLocalDay(year, month, 1), end: startOfLocalDay(year, month + 1, 1) };
}

export function yearRange(year: number): Interval {
  return { start: startOfLocalDay(year, 0, 1), end: startOfLocalDay(year + 1, 0, 1) };
}

/** Durata reale di una giornata, in ore. 23 e 25 nei giorni di cambio ora. */
export function hoursInDay(year: number, month: number, day: number): number {
  const { start, end } = dayRange(year, month, day);
  return (end - start) / HOUR_MS;
}

/* -------------------------------------------------------------------------- */
/* Da entità a intervalli                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Intervallo coperto da un turno di reperibilità.
 *
 * - `endTime === '23:59'` viene normalizzato alla mezzanotte del giorno dopo.
 * - I documenti legacy privi di startTime/endTime usano `hours` a partire dalla
 *   mezzanotte del giorno di inizio.
 */
export function shiftInterval(shift: Shift): Interval | null {
  if (!shift || typeof shift.year !== 'number') return null;

  if (!shift.startTime || !shift.endTime) {
    const hours = typeof shift.hours === 'number' ? shift.hours : 0;
    if (hours <= 0) return null;
    const start = startOfLocalDay(shift.year, shift.month, shift.day);
    return { start, end: start + hours * HOUR_MS };
  }

  const start = localTime(shift.year, shift.month, shift.day, shift.startTime);

  const endYear = shift.endYear ?? shift.year;
  const endMonth = shift.endMonth ?? shift.month;
  const endDay = shift.endDay ?? shift.day;

  let end =
    shift.endTime === END_OF_DAY_MARKER
      ? startOfLocalDay(endYear, endMonth, endDay + 1)
      : localTime(endYear, endMonth, endDay, shift.endTime);

  // Difesa per date di fine non salvate: il turno scavalca la mezzanotte.
  if (end <= start) {
    end =
      shift.endTime === END_OF_DAY_MARKER
        ? startOfLocalDay(endYear, endMonth, endDay + 2)
        : localTime(endYear, endMonth, endDay + 1, shift.endTime);
  }

  return { start, end };
}

/**
 * Intervallo coperto da un intervento.
 * Non ha data di fine: se `endTime <= startTime` scavalca la mezzanotte.
 * Nessuna normalizzazione del `23:59`: lì il minuto è un dato reale.
 */
export function interventionInterval(intervention: Intervention): Interval | null {
  if (!intervention || !intervention.startTime || !intervention.endTime) return null;

  const { year, month, day } = intervention;
  const start = localTime(year, month, day, intervention.startTime);
  let end = localTime(year, month, day, intervention.endTime);
  if (end <= start) end = localTime(year, month, day + 1, intervention.endTime);

  return { start, end };
}

/** Durata reale di un intervento, in ore. Tiene conto del cambio ora. */
export function interventionDurationHours(intervention: Intervention): number {
  const iv = interventionInterval(intervention);
  return iv ? (iv.end - iv.start) / HOUR_MS : 0;
}

/** Durata reale di un turno, in ore. */
export function shiftDurationHours(shift: Shift): number {
  const iv = shiftInterval(shift);
  return iv ? (iv.end - iv.start) / HOUR_MS : 0;
}

/* -------------------------------------------------------------------------- */
/* Algebra degli intervalli                                                    */
/* -------------------------------------------------------------------------- */

/** Fonde intervalli sovrapposti o adiacenti. Input non ordinato ammesso. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** Ritaglia una lista di intervalli dentro un intervallo di confine. */
export function clipIntervals(intervals: Interval[], bounds: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of intervals) {
    const start = Math.max(iv.start, bounds.start);
    const end = Math.min(iv.end, bounds.end);
    if (start < end) out.push({ start, end });
  }
  return out;
}

/** Differenza insiemistica A \ B. Entrambe le liste devono essere fuse e ordinate. */
export function subtractIntervals(a: Interval[], b: Interval[]): Interval[] {
  if (b.length === 0) return a.map((iv) => ({ ...iv }));

  const out: Interval[] = [];
  for (const iv of a) {
    let cursor = iv.start;
    for (const cut of b) {
      if (cut.end <= cursor) continue;
      if (cut.start >= iv.end) break;
      if (cut.start > cursor) out.push({ start: cursor, end: Math.min(cut.start, iv.end) });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= iv.end) break;
    }
    if (cursor < iv.end) out.push({ start: cursor, end: iv.end });
  }
  return out;
}

export function totalHours(intervals: Interval[]): number {
  return intervals.reduce((acc, iv) => acc + (iv.end - iv.start), 0) / HOUR_MS;
}

/* -------------------------------------------------------------------------- */
/* Indice precalcolato                                                         */
/* -------------------------------------------------------------------------- */

export interface HoursIndex {
  /** Intervalli di reperibilità già fusi. */
  onCall: Interval[];
  /** Intervalli di intervento già fusi. */
  interventions: Interval[];
}

const EMPTY_INDEX: HoursIndex = { onCall: [], interventions: [] };

/**
 * Costruisce l'indice una sola volta per set di dati. Da avvolgere in useMemo:
 * il costo è O(n log n), mentre `breakdown()` è lineare sugli intervalli.
 */
export function buildHoursIndex(shifts: Shift[], interventions: Intervention[]): HoursIndex {
  const shiftIntervals: Interval[] = [];
  for (const s of shifts) {
    const iv = shiftInterval(s);
    if (iv) shiftIntervals.push(iv);
  }

  const interventionIntervals: Interval[] = [];
  for (const i of interventions) {
    const iv = interventionInterval(i);
    if (iv) interventionIntervals.push(iv);
  }

  return {
    onCall: mergeIntervals(shiftIntervals),
    interventions: mergeIntervals(interventionIntervals),
  };
}

/* -------------------------------------------------------------------------- */
/* Calcolo                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Riepilogo delle ore su un intervallo arbitrario (giorno, mese, anno...).
 * Turni e interventi vengono ritagliati con lo stesso criterio.
 */
export function breakdown(index: HoursIndex, range: Interval): Breakdown {
  if (!index) return { ...EMPTY_BREAKDOWN };

  const onCallClipped = clipIntervals(index.onCall, range);
  const interventionsClipped = clipIntervals(index.interventions, range);

  const rawOnCallHours = totalHours(onCallClipped);
  const onCallHours = totalHours(subtractIntervals(onCallClipped, interventionsClipped));
  const interventionHours = totalHours(interventionsClipped);

  return {
    onCallHours,
    rawOnCallHours,
    overlapHours: rawOnCallHours - onCallHours,
    interventionHours,
    totalHours: onCallHours + interventionHours,
  };
}

export function breakdownForDay(index: HoursIndex, year: number, month: number, day: number): Breakdown {
  return breakdown(index, dayRange(year, month, day));
}

export function breakdownForMonth(index: HoursIndex, year: number, month: number): Breakdown {
  return breakdown(index, monthRange(year, month));
}

export function breakdownForYear(index: HoursIndex, year: number): Breakdown {
  return breakdown(index, yearRange(year));
}

/** Vero se l'utente è reperibile nell'istante indicato (default: adesso). */
export function isOnCallAt(index: HoursIndex, date: Date = new Date()): boolean {
  const ms = date.getTime();
  return index.onCall.some((iv) => ms >= iv.start && ms < iv.end);
}

/** Vero se il giorno indicato è coperto, anche solo in parte, da un turno. */
export function hasShiftOnDay(index: HoursIndex, year: number, month: number, day: number): boolean {
  const range = dayRange(year, month, day);
  return index.onCall.some((iv) => iv.start < range.end && iv.end > range.start);
}

/**
 * Vero se il turno tocca un sabato o una domenica, anche solo in parte.
 *
 * Il flag `type: 'weekend'` non incide su alcun compenso (regola 5): serve solo
 * a colorare la cella del calendario. Prima veniva assegnato guardando il solo
 * giorno di inizio, quindi un turno venerdì 18:00 -> sabato 24:00 risultava
 * `regular`.
 */
export function touchesWeekend(shift: Shift): boolean {
  const iv = shiftInterval(shift);
  if (!iv) return false;

  const cursor = new Date(iv.start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < iv.end) {
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Utility di durata e formattazione                                           */
/* -------------------------------------------------------------------------- */

/**
 * Durata in ore fra due orari HH:mm privi di data. Se end <= start, scavalca la
 * mezzanotte. Usare solo dove la data non è disponibile: per gli interventi
 * preferire `interventionDurationHours()`, che tiene conto del cambio ora.
 */
export function calculateDuration(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;

  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return '0h';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Converte una tariffa in formato italiano ("12,50") in numero. */
export function parseRate(rate: string | number | undefined): number {
  if (typeof rate === 'number') return Number.isFinite(rate) ? rate : 0;
  const parsed = parseFloat(String(rate ?? '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export { EMPTY_BREAKDOWN, EMPTY_INDEX, END_OF_DAY_MARKER, HOUR_MS };
