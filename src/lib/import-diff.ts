import { Shift, SolidarityDate } from '../types';
import { Interval, clipIntervals, mergeIntervals, shiftDurationHours, shiftInterval, touchesWeekend } from './hours';

/**
 * ============================================================================
 *  IMPORT INFOWEB: PARSING, CONFRONTO, VALIDAZIONE
 * ============================================================================
 *
 *  Il file esportato da Infoweb è un CSV con separatore `;`, valori fra
 *  virgolette, terminatori CRLF e codifica Windows-1252 (non UTF-8).
 *
 *      "Area";"Nome";"Da";"A";"Note"
 *      "Storage – Bologna";"Rossi Mario";"2/1/2026 18:00";"2/1/2026 23:59";""
 *
 *  Le date sono `d/m/yyyy HH:mm` senza zero iniziale.
 *
 *  Infoweb spezza a mezzanotte le coperture di più giorni, chiudendo la riga
 *  alle 23:59 e riaprendo la successiva alle 00:00. `shiftInterval()` tratta
 *  il 23:59 come fine giornata, quindi le due righe tornano contigue.
 *
 *  L'IMPORT È PURAMENTE ADDITIVO. Il confronto produce quattro categorie ma
 *  non scrive nulla: la decisione è dell'utente, e nessun turno esistente
 *  viene mai cancellato.
 */

/** Orari ammessi dal turno standard. Fuori da questi, si avvisa. */
const EXPECTED_START_TIMES = ['00:00', '18:00'];
const EXPECTED_END_TIMES = ['08:00', '23:59'];

/* -------------------------------------------------------------------------- */
/* Decodifica                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Prova UTF-8 in modalità fatal; se il file non è UTF-8 valido ripiega su
 * Windows-1252, che è quello che Infoweb produce davvero.
 * `FileReader.readAsText()` assumeva UTF-8 e corrompeva accenti e lineette.
 */
export function decodeCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, '');
  }
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/** Divide una riga CSV rispettando le virgolette e le virgolette raddoppiate. */
export function splitCsvLine(line: string, delimiter = ';'): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

/** "2/1/2026 18:00" -> componenti. Restituisce null se malformata. */
export function parseInfowebDateTime(value: string): { year: number; month: number; day: number; time: string } | null {
  const match = (value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (hour > 23 || minute > 59) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  return { year, month: month - 1, day, time: `${pad(hour)}:${pad(minute)}` };
}

export interface RowError {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  shifts: Shift[];
  errors: RowError[];
}

/**
 * Legge il CSV. Le colonne sono individuate dall'intestazione, non dalla
 * posizione: se Infoweb ne aggiunge una, l'import non si sposta.
 */
export function parseInfowebCsv(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { shifts: [], errors: [{ line: 0, raw: '', reason: 'File vuoto o privo di righe dati.' }] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  let iStart = header.indexOf('da');
  let iEnd = header.indexOf('a');
  let iNote = header.indexOf('note');

  // Fallback sulle posizioni note se l'intestazione manca.
  if (iStart === -1 || iEnd === -1) {
    iStart = 2;
    iEnd = 3;
    iNote = 4;
  }

  const shifts: Shift[] = [];
  const errors: RowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    if (parts.length <= Math.max(iStart, iEnd)) {
      errors.push({ line: i + 1, raw: lines[i], reason: 'Colonne insufficienti.' });
      continue;
    }

    const start = parseInfowebDateTime(parts[iStart]);
    const end = parseInfowebDateTime(parts[iEnd]);

    if (!start || !end) {
      errors.push({ line: i + 1, raw: lines[i], reason: 'Data o orario non riconosciuti.' });
      continue;
    }

    const note = iNote >= 0 && parts[iNote] ? parts[iNote] : null;

    const shift: Shift = {
      day: start.day,
      month: start.month,
      year: start.year,
      startTime: start.time,
      endTime: end.time,
      endDay: end.day,
      endMonth: end.month,
      endYear: end.year,
      hours: 0,
      type: 'regular',
      notes: note,
    };

    // `hours` e `type` sono derivati: mai letti dal file.
    const duration = shiftDurationHours(shift);
    if (duration <= 0) {
      errors.push({ line: i + 1, raw: lines[i], reason: 'La fine non segue l’inizio.' });
      continue;
    }

    shift.hours = duration;
    shift.type = touchesWeekend(shift) ? 'weekend' : 'regular';
    shifts.push(shift);
  }

  return { shifts, errors };
}

/* -------------------------------------------------------------------------- */
/* Identità e confronto                                                        */
/* -------------------------------------------------------------------------- */

/**
 * ID deterministico, identico a quello usato da App.tsx.
 *
 * L'ora di inizio fa parte dell'identità: nello stesso giorno possono partire
 * due turni (la coda 00:00 della copertura precedente e la testa 18:00 della
 * successiva). Sono sei giorni su un anno tipico, ma esistono.
 */
export function shiftKey(shift: Pick<Shift, 'year' | 'month' | 'day' | 'startTime'>): string {
  return `${shift.year}-${shift.month}-${shift.day}-${(shift.startTime || '00:00').replace(':', '')}`;
}

/** Campi che descrivono il turno. `hours` e `type` sono derivati: esclusi. */
const COMPARED_FIELDS = ['startTime', 'endTime', 'endDay', 'endMonth', 'endYear'] as const;

export type DiffCategory = 'new' | 'identical' | 'modified' | 'onlyInPortal';

export interface FieldChange {
  field: string;
  from: string | number | undefined;
  to: string | number | undefined;
}

export interface DiffEntry {
  key: string;
  category: DiffCategory;
  incoming?: Shift;
  existing?: Shift;
  changes: FieldChange[];
}

export interface DiffResult {
  entries: DiffEntry[];
  /** Finestra temporale coperta dal file. Fuori da qui, un'assenza non significa nulla. */
  window: Interval | null;
  counts: Record<DiffCategory, number>;
}

/**
 * Confronta il file con quanto già presente nel portale.
 *
 * Un turno esistente e assente dal file viene segnalato SOLO se cade dentro la
 * finestra del file: importando marzo, non ha senso dire che manca gennaio.
 * Non viene mai proposto per la cancellazione.
 */
export function diffShifts(incoming: Shift[], existing: Shift[]): DiffResult {
  const entries: DiffEntry[] = [];
  const counts: Record<DiffCategory, number> = { new: 0, identical: 0, modified: 0, onlyInPortal: 0 };

  const incomingIntervals = incoming.map(shiftInterval).filter((iv): iv is Interval => iv !== null);
  const window: Interval | null =
    incomingIntervals.length > 0
      ? {
          start: Math.min(...incomingIntervals.map((iv) => iv.start)),
          end: Math.max(...incomingIntervals.map((iv) => iv.end)),
        }
      : null;

  const existingByKey = new Map(existing.map((s) => [shiftKey(s), s]));
  const incomingKeys = new Set<string>();

  for (const shift of incoming) {
    const key = shiftKey(shift);
    incomingKeys.add(key);
    const current = existingByKey.get(key);

    if (!current) {
      entries.push({ key, category: 'new', incoming: shift, changes: [] });
      counts.new++;
      continue;
    }

    const changes: FieldChange[] = [];
    for (const field of COMPARED_FIELDS) {
      if (current[field] !== shift[field]) {
        changes.push({ field, from: current[field], to: shift[field] });
      }
    }

    if (changes.length === 0) {
      entries.push({ key, category: 'identical', incoming: shift, existing: current, changes: [] });
      counts.identical++;
    } else {
      entries.push({ key, category: 'modified', incoming: shift, existing: current, changes });
      counts.modified++;
    }
  }

  if (window) {
    for (const shift of existing) {
      const key = shiftKey(shift);
      if (incomingKeys.has(key)) continue;

      const iv = shiftInterval(shift);
      if (!iv || iv.start < window.start || iv.start >= window.end) continue;

      entries.push({ key, category: 'onlyInPortal', existing: shift, changes: [] });
      counts.onlyInPortal++;
    }
  }

  return { entries, window, counts };
}

/* -------------------------------------------------------------------------- */
/* Validazione                                                                 */
/* -------------------------------------------------------------------------- */

export type Severity = 'error' | 'warning';

export interface Anomaly {
  severity: Severity;
  message: string;
}

/**
 * Controlli sulla forma dei turni in arrivo.
 *
 * Gli `error` bloccano l'import: corrompono i totali. I `warning` no.
 *
 * Non viene segnalato un turno "orfano" (una coda mattutina senza la copertura
 * che la precede): capita che un turno venga spezzato fra due persone, e la
 * quota finale sia legittimamente l'unica presente.
 */
export function validateShifts(incoming: Shift[], solidarityDates: SolidarityDate[] = []): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Chiavi duplicate: due righe dello stesso file per lo stesso turno.
  const seen = new Set<string>();
  for (const shift of incoming) {
    const key = shiftKey(shift);
    if (seen.has(key)) {
      anomalies.push({
        severity: 'error',
        message: `Il file contiene due volte il turno del ${formatDate(shift)} alle ${shift.startTime}.`,
      });
    }
    seen.add(key);
  }

  // Sovrapposizioni: l'unione degli intervalli salva dal doppio conteggio, ma
  // il totale resterebbe sbagliato.
  const withIntervals = incoming
    .map((shift) => ({ shift, iv: shiftInterval(shift) }))
    .filter((x): x is { shift: Shift; iv: Interval } => x.iv !== null)
    .sort((a, b) => a.iv.start - b.iv.start);

  for (let i = 1; i < withIntervals.length; i++) {
    const prev = withIntervals[i - 1];
    const cur = withIntervals[i];
    if (cur.iv.start < prev.iv.end) {
      anomalies.push({
        severity: 'error',
        message: `Sovrapposizione: il turno del ${formatDate(prev.shift)} (${prev.shift.startTime}–${prev.shift.endTime}) si accavalla a quello del ${formatDate(cur.shift)}.`,
      });
    }
  }

  // Orari fuori dallo schema noto.
  for (const shift of incoming) {
    if (!EXPECTED_START_TIMES.includes(shift.startTime)) {
      anomalies.push({
        severity: 'warning',
        message: `Il turno del ${formatDate(shift)} inizia alle ${shift.startTime} (attese ${EXPECTED_START_TIMES.join(' o ')}).`,
      });
    }
    if (!EXPECTED_END_TIMES.includes(shift.endTime)) {
      anomalies.push({
        severity: 'warning',
        message: `Il turno del ${formatDate(shift)} finisce alle ${shift.endTime} (attese ${EXPECTED_END_TIMES.join(' o ')}).`,
      });
    }
  }

  // Conflitti con le giornate di solidarietà.
  if (solidarityDates.length > 0) {
    const merged = mergeIntervals(withIntervals.map((x) => x.iv));
    for (const date of solidarityDates) {
      const dayStart = new Date(date.year, date.month, date.day, 0, 0, 0, 0).getTime();
      const dayEnd = new Date(date.year, date.month, date.day + 1, 0, 0, 0, 0).getTime();
      if (clipIntervals(merged, { start: dayStart, end: dayEnd }).length > 0) {
        anomalies.push({
          severity: 'warning',
          message: `Il ${date.dateStr} è una giornata di solidarietà, ma il file vi colloca della reperibilità.`,
        });
      }
    }
  }

  return anomalies;
}

function formatDate(shift: Shift): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(shift.day)}/${pad(shift.month + 1)}/${shift.year}`;
}

export { EXPECTED_END_TIMES, EXPECTED_START_TIMES };
