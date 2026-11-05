import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, TriangleAlert } from 'lucide-react';
import { Shift, Intervention, SolidarityDate, Vacation } from '../types';
import { cn } from '../lib/utils';
import { findVacationForDay } from '../lib/vacations';
import { CONFLICT_BORDER, TONE_BADGE, TONE_CELL, TONE_NUMBER, dayTone } from '../lib/day-tone';
import { buildHoursIndex, breakdownForDay, hasShiftOnDay } from '../lib/hours';
import { format, addMonths, subMonths, startOfMonth, getDay, getDaysInMonth, isSameMonth } from 'date-fns';
import { it } from 'date-fns/locale';

interface CalendarProps {
  shifts: Shift[];
  interventions: Intervention[];
  solidarityDates?: SolidarityDate[];
  vacations?: Vacation[];
  month?: Date;
  onViewAll?: () => void;
  onDayClick?: (day: number, month: Date) => void;
  onMonthChange?: (month: Date) => void;
}

const DAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

export function Calendar({
  shifts,
  interventions,
  solidarityDates,
  vacations,
  month,
  onViewAll,
  onDayClick,
  onMonthChange,
}: CalendarProps) {
  const [internalDate, setInternalDate] = useState(() => new Date());

  const currentDate =
    month instanceof Date && !isNaN(month.getTime())
      ? month
      : internalDate instanceof Date && !isNaN(internalDate.getTime())
        ? internalDate
        : new Date();

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();

  // Stesso motore di calcolo di App e CalendarView: il badge sul giorno ora
  // coincide con il totale mostrato nelle card di riepilogo.
  const hoursIndex = useMemo(() => buildHoursIndex(shifts, interventions), [shifts, interventions]);

  const firstDayOfMonth = startOfMonth(currentDate);
  const startDayIndex = isNaN(getDay(firstDayOfMonth)) ? 0 : (getDay(firstDayOfMonth) + 6) % 7;
  const daysInMonth = isNaN(getDaysInMonth(currentDate)) ? 30 : getDaysInMonth(currentDate);
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const nextMonth = () => {
    const newDate = addMonths(currentDate, 1);
    setInternalDate(newDate);
    onMonthChange?.(newDate);
  };
  const prevMonth = () => {
    const newDate = subMonths(currentDate, 1);
    setInternalDate(newDate);
    onMonthChange?.(newDate);
  };
  const resetToToday = () => {
    const newDate = new Date();
    setInternalDate(newDate);
    onMonthChange?.(newDate);
  };

  const isWeekendShiftOnDay = (day: number) => {
    const target = new Date(year, monthIndex, day).getTime();
    return shifts.some((s) => {
      if (s.type !== 'weekend') return false;
      const start = new Date(s.year, s.month, s.day).getTime();
      const end = new Date(s.endYear ?? s.year, s.endMonth ?? s.month, s.endDay ?? s.day).getTime();
      return target >= start && target <= end;
    });
  };

  const isToday = (day: number) => {
    const now = new Date();
    return isSameMonth(currentDate, now) && now.getDate() === day && now.getFullYear() === year;
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold font-headline tracking-tight">Calendario Reperibilità</h3>
        <div className="flex items-center gap-2 no-print">
          <button onClick={onViewAll} className="text-xs text-primary font-bold hover:underline mr-4">
            Espandi Vista
          </button>
          <button
            onClick={resetToToday}
            className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors mr-2"
            title="Oggi"
            aria-label="Vai al mese corrente"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors"
            aria-label="Mese precedente"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm px-4 min-w-[120px] text-center capitalize" aria-live="polite">
            {format(currentDate, 'MMM yyyy', { locale: it })}
          </span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors"
            aria-label="Mese successivo"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-surface-container-low rounded-2xl overflow-hidden p-3 sm:p-6 shadow-sm border border-outline-variant/5">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-4">
          {DAYS.map((day) => (
            <div key={day} className="text-center py-2 text-[10px] sm:text-xs font-bold text-on-surface-variant font-sans">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: startDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square p-1 sm:p-2 rounded-lg sm:rounded-xl bg-surface opacity-20" />
          ))}

          {calendarDays.map((day) => {
            const { onCallHours } = breakdownForDay(hoursIndex, year, monthIndex, day);
            const covered = hasShiftOnDay(hoursIndex, year, monthIndex, day);
            const today = isToday(day);
            const isSolidarity = solidarityDates?.some(
              (d) => d.day === day && d.month === monthIndex && d.year === year,
            );
            const isWeekendShift = isWeekendShiftOnDay(day);
            const isVacation = Boolean(findVacationForDay(vacations, year, monthIndex, day));
            const { tone, conflict } = dayTone({
              isVacation,
              isSolidarity: Boolean(isSolidarity),
              isWeekendShift,
              onCallHours,
            });

            const label = [
              format(new Date(year, monthIndex, day), 'EEEE d MMMM yyyy', { locale: it }),
              covered ? `${onCallHours.toFixed(1)} ore di reperibilità` : 'nessun turno',
              isVacation ? 'ferie' : '',
              isSolidarity ? 'giorno di solidarietà' : '',
              conflict ? 'in conflitto' : '',
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <button
                key={day}
                type="button"
                onClick={() => onDayClick?.(day, currentDate)}
                aria-label={label}
                aria-current={today ? 'date' : undefined}
                className={cn(
                  'aspect-square p-1 sm:p-2 rounded-lg sm:rounded-xl border flex flex-col justify-between text-left transition-all hover:scale-105 cursor-pointer',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  TONE_CELL[tone],
                  conflict && CONFLICT_BORDER,
                  today && 'ring-2 ring-primary ring-offset-2 ring-offset-surface',
                )}
              >
                <span className="flex items-center justify-between gap-0.5">
                  <span className={cn('text-[10px] sm:text-xs font-bold', TONE_NUMBER[tone])}>{day}</span>
                  {conflict && <TriangleAlert className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 shrink-0" aria-hidden="true" />}
                </span>
                {onCallHours > 0 && (
                  <div
                    className={cn(
                      'text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded text-center w-full',
                      TONE_BADGE[tone],
                    )}
                  >
                    {onCallHours.toFixed(1).replace('.0', '')}h
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
