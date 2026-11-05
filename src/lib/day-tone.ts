/**
 * Colore di una cella del calendario, condiviso fra la vista mensile della
 * dashboard e il calendario completo.
 *
 * Precedenza: ferie > solidarietà > turno festivo > turno > vuoto.
 * Prima un turno festivo copriva il verde della solidarietà, nascondendo
 * proprio il caso da correggere. Ora il giorno mostra cosa è (ferie o
 * solidarietà) e il conflitto si vede dal bordo ambra.
 */
export type DayTone = 'vacation' | 'solidarity' | 'weekend' | 'oncall' | 'empty';

export interface DayToneInput {
  isVacation: boolean;
  isSolidarity: boolean;
  isWeekendShift: boolean;
  /** Ore di reperibilità che cadono in quel giorno. */
  onCallHours: number;
}

export function dayTone(d: DayToneInput): { tone: DayTone; conflict: boolean } {
  const tone: DayTone = d.isVacation
    ? 'vacation'
    : d.isSolidarity
      ? 'solidarity'
      : d.isWeekendShift
        ? 'weekend'
        : d.onCallHours > 0
          ? 'oncall'
          : 'empty';
  const conflict = (d.isVacation || d.isSolidarity) && d.onCallHours > 0;
  return { tone, conflict };
}

/** Classi Tailwind per tono. Scritte per intero: Tailwind le trova solo così. */
export const TONE_CELL: Record<DayTone, string> = {
  vacation: 'bg-violet-500/20 border-violet-500/40',
  solidarity: 'bg-emerald-500/20 border-emerald-500/40',
  weekend: 'bg-error-container/20 border-error/20',
  oncall: 'bg-surface-container-high border-primary/10',
  empty: 'bg-surface-container-high border-outline-variant/10',
};

export const TONE_NUMBER: Record<DayTone, string> = {
  vacation: 'text-violet-300',
  solidarity: 'text-emerald-400',
  weekend: 'text-error',
  oncall: 'text-on-surface',
  empty: 'text-on-surface',
};

export const TONE_BADGE: Record<DayTone, string> = {
  vacation: 'bg-violet-500/30 text-violet-200',
  solidarity: 'bg-emerald-500/30 text-emerald-400',
  weekend: 'bg-error text-on-error',
  oncall: 'bg-primary/20 text-primary',
  empty: 'bg-primary/20 text-primary',
};

/** Bordo che segnala un turno dentro ferie o solidarietà. Vince sul bordo del tono. */
export const CONFLICT_BORDER = '!border-amber-400/80';
