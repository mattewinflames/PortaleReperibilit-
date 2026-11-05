export interface Shift {
  day: number;
  month: number; // 0-11
  year: number;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  endDay: number;
  endMonth: number;
  endYear: number;
  hours: number;
  type: 'regular' | 'weekend';
  notes?: string | null;
}

export interface Intervention {
  id: string;
  title: string;
  location: string;
  startTime: string;
  endTime: string;
  type: 'critical' | 'security' | 'maintenance';
  extraPay: string;
  dateLabel: string;
  day: number;
  month: number;
  year: number;
  notes?: string | null;
}

/** Una voce del riepilogo: ore, lordo, e il mese in cui viene accreditata. */
export interface EarningsLine {
  hours: number;
  gross: number;
  /** Mese di riferimento della voce (competenza) o di accredito (cassa). */
  monthLabel: string;
}

/**
 * Dettaglio delle spettanze, nelle due letture possibili.
 *
 * COMPETENZA: quanto vale il lavoro fatto nel mese selezionato. La copertura
 * finirà nella busta del mese dopo, gli interventi in quella di due mesi dopo:
 * il totale non compare quindi su nessuna busta.
 *
 * CASSA: quanto arriva nella busta del mese selezionato, cioè la copertura del
 * mese precedente più gli interventi di due mesi prima. È l'unico numero
 * confrontabile con il cedolino.
 */
export interface EarningsDetail {
  monthLabel: string;
  taxPercentage: number;
  competenza: { onCall: EarningsLine; intervention: EarningsLine };
  cassa: { onCall: EarningsLine; intervention: EarningsLine };
}

export interface MonthlySummary {
  grossEarnings: number;
  netEarningsEstimate: number;
  totalHours: number;
  onCallHours?: number;
  interventionHours?: number;
  /** Lordo della sola copertura: si confronta con la voce 2C3A della busta. */
  grossOnCall?: number;
  /** Lordo dei soli interventi: si confronta con le voci 2H3x della busta. */
  grossIntervention?: number;
  month: string;
}

export interface Settings {
  onCallRate: string;
  interventionRate: string;
  taxPercentage: number;
}

/**
 * Un periodo di ferie: giornate intere, estremi inclusi.
 * Le date sono AAAA-MM-GG, come `SolidarityDate.dateStr`.
 */
export interface Vacation {
  id: string;
  startDate: string;
  endDate: string;
  note?: string | null;
}

export interface SolidarityDate {
  id: string;
  day: number;
  month: number;
  year: number;
  dateStr: string; // YYYY-MM-DD
}
