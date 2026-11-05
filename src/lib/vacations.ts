import { Shift, Vacation } from '../types';
import { Interval, dayRange, shiftInterval } from './hours';

/**
 * ============================================================================
 *  FERIE
 * ============================================================================
 *  Un periodo di ferie copre giornate intere, dal primo all'ultimo giorno
 *  inclusi. Non incide sul calcolo delle ore: serve a vedere a colpo
 *  d'occhio i turni di reperibilità che vi cadono dentro.
 */

const HOUR_MS = 3_600_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-08-03" -> { year: 2026, month: 7, day: 3 }. Mese 0-11. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE.exec(value || '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  // Scarta date inesistenti come 2026-02-30: Date le farebbe slittare al mese dopo.
  const check = new Date(year, month, day);
  if (check.getFullYear() !== year || check.getMonth() !== month || check.getDate() !== day) return null;
  return { year, month, day };
}

export function toIsoDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Intervallo coperto: dalla mezzanotte del primo giorno alla mezzanotte dopo l'ultimo. */
export function vacationInterval(v: Vacation): Interval | null {
  const s = parseIsoDate(v.startDate);
  const e = parseIsoDate(v.endDate);
  if (!s || !e) return null;
  const start = dayRange(s.year, s.month, s.day).start;
  const end = dayRange(e.year, e.month, e.day).end;
  return end > start ? { start, end } : null;
}

/** Numero di giornate di calendario, estremi inclusi. */
export function vacationDays(v: Vacation): number {
  const s = parseIsoDate(v.startDate);
  const e = parseIsoDate(v.endDate);
  if (!s || !e) return 0;
  // Date.UTC evita che il cambio ora sposti il conteggio di un giorno.
  const diff = (Date.UTC(e.year, e.month, e.day) - Date.UTC(s.year, s.month, s.day)) / 86_400_000;
  return diff >= 0 ? diff + 1 : 0;
}

/** Il periodo di ferie che contiene il giorno indicato, se esiste. */
export function findVacationForDay(
  vacations: Vacation[] | undefined,
  year: number,
  month: number,
  day: number,
): Vacation | undefined {
  if (!vacations?.length) return undefined;
  const iso = toIsoDate(year, month, day);
  // Il confronto fra stringhe AAAA-MM-GG equivale a quello cronologico.
  return vacations.find((v) => v.startDate <= iso && iso <= v.endDate);
}

/** Errore di validazione da mostrare, oppure null se il periodo è valido. */
export function validateVacation(candidate: Vacation, existing: Vacation[]): string | null {
  if (!parseIsoDate(candidate.startDate)) return 'Data di inizio non valida.';
  if (!parseIsoDate(candidate.endDate)) return 'Data di fine non valida.';
  if (candidate.endDate < candidate.startDate) return 'La fine non può precedere l’inizio.';
  const clash = existing.find(
    (v) => v.id !== candidate.id && v.startDate <= candidate.endDate && candidate.startDate <= v.endDate,
  );
  if (clash) return `Si sovrappone alle ferie dal ${formatIsoDate(clash.startDate)} al ${formatIsoDate(clash.endDate)}.`;
  return null;
}

/** "2026-08-03" -> "03/08/2026". */
export function formatIsoDate(value: string): string {
  const d = parseIsoDate(value);
  if (!d) return value;
  return `${String(d.day).padStart(2, '0')}/${String(d.month + 1).padStart(2, '0')}/${d.year}`;
}

export interface VacationConflict {
  key: string;
  vacation: Vacation;
  shift: Shift;
  /** Primo istante del turno che cade dentro le ferie. */
  from: Date;
  hours: number;
}

/**
 * Turni che si sovrappongono a un periodo di ferie.
 * Toccarsi agli estremi non conta: un turno che finisce alla mezzanotte in
 * cui iniziano le ferie non è in conflitto.
 */
export function vacationConflicts(shifts: Shift[], vacations: Vacation[], notBefore?: number): VacationConflict[] {
  const out: VacationConflict[] = [];
  for (const vacation of vacations) {
    const v = vacationInterval(vacation);
    if (!v) continue;
    if (notBefore !== undefined && v.end <= notBefore) continue;
    for (const shift of shifts) {
      const s = shiftInterval(shift);
      if (!s) continue;
      const start = Math.max(s.start, v.start, notBefore ?? -Infinity);
      const end = Math.min(s.end, v.end);
      if (start >= end) continue;
      out.push({
        key: `${vacation.id}-${shift.year}-${shift.month}-${shift.day}-${shift.startTime}`,
        vacation,
        shift,
        from: new Date(start),
        hours: (end - start) / HOUR_MS,
      });
    }
  }
  return out.sort((a, b) => a.from.getTime() - b.from.getTime());
}

/** ID nuovo per un periodo di ferie. */
export function newVacationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `vacation-${crypto.randomUUID()}`
    : `vacation-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
