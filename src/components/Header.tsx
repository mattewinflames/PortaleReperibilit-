import { Settings, LogOut, LogIn, Bell, BellOff, AlertTriangle, Calendar, X } from 'lucide-react';
import { User } from 'firebase/auth';
import { signIn, logOut } from '../firebase';
import { cn } from '../lib/utils';
import { dayRange, formatDuration, shiftInterval } from '../lib/hours';
import { ShiftArc } from './ShiftArc';
import { formatIsoDate, vacationConflicts } from '../lib/vacations';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Shift, SolidarityDate, Vacation } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface HeaderProps {
  onSettingsClick?: () => void;
  onProfileClick?: () => void;
  user: User | null;
  isTodayOnCall?: boolean;
  isSolidarityToday?: boolean;
  shifts: Shift[];
  solidarityDates: SolidarityDate[];
  vacations?: Vacation[];
}

export function Header({ 
  onSettingsClick, 
  onProfileClick, 
  user, 
  isTodayOnCall, 
  isSolidarityToday,
  shifts,
  solidarityDates,
  vacations = []
}: HeaderProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  /**
   * Il turno che copre l'istante attuale, per disegnare l'arco reale nel badge
   * invece di quello generico. Se non c'è copertura, l'arco resta spento.
   */
  const todayShift = useMemo(() => {
    const now = Date.now();
    return shifts.find((s) => {
      const iv = shiftInterval(s);
      return iv ? now >= iv.start && now < iv.end : false;
    });
  }, [shifts]);

  /**
   * Conflitti fra turni e giornate di solidarietà o periodi di ferie.
   *
   * Prima il controllo confrontava solo le DATE:
   *
   *     shift.endDay === sol.day && shift.endMonth === sol.month && ...
   *
   * Un turno che finisce alle 00:00 del giorno X non occupa un solo minuto
   * di quel giorno, ma la data di fine coincideva e l'avviso scattava lo
   * stesso. Ora si confrontano gli INTERVALLI: c'è conflitto solo se il turno
   * copre davvero del tempo dentro la giornata di solidarietà.
   */
  const conflicts = useMemo(() => {
    // Solo da oggi in avanti: un conflitto passato non è più azionabile.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const list: { key: string; kind: 'solidarity' | 'vacation'; date: Date; shift: Shift; hours: number; detail?: string }[] = [];

    for (const shift of shifts) {
      const iv = shiftInterval(shift);
      if (!iv) continue;

      for (const sol of solidarityDates) {
        const day = dayRange(sol.year, sol.month, sol.day);
        if (day.start < todayStart.getTime()) continue;

        // Sovrapposizione stretta: toccarsi agli estremi non è un conflitto.
        const overlapStart = Math.max(iv.start, day.start);
        const overlapEnd = Math.min(iv.end, day.end);
        if (overlapStart >= overlapEnd) continue;

        list.push({
          key: `${sol.year}-${sol.month}-${sol.day}-${shift.day}-${shift.startTime}`,
          kind: 'solidarity',
          date: new Date(sol.year, sol.month, sol.day),
          shift,
          hours: (overlapEnd - overlapStart) / 3_600_000,
        });
      }
    }

    // Turni dentro un periodo di ferie: una voce per coppia turno/periodo,
    // con le sole ore che cadono nelle ferie.
    for (const c of vacationConflicts(shifts, vacations, todayStart.getTime())) {
      list.push({
        key: c.key,
        kind: 'vacation',
        date: c.from,
        shift: c.shift,
        hours: c.hours,
        detail: `ferie dal ${formatIsoDate(c.vacation.startDate)} al ${formatIsoDate(c.vacation.endDate)}`,
      });
    }

    // Il dedup di prima scartava per DATA, nascondendo il secondo turno in
    // conflitto con la stessa giornata. Ora la chiave include il turno.
    const seen = new Set<string>();
    return list
      .filter((c) => (seen.has(c.key) ? false : seen.add(c.key)))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [shifts, solidarityDates, vacations]);

  // Close notification menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="w-full sticky top-0 z-50 glass flex justify-between items-center px-4 md:px-8 font-headline transition-all duration-300 no-print safe-area-top" style={{ minHeight: 'calc(4rem + env(safe-area-inset-top,0px))' }}>
      <div className="flex items-center gap-4">
        <h1 className="text-sm md:text-lg font-bold text-on-surface truncate max-w-[150px] md:max-w-none">Reperibilità & Interventi</h1>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        <div className="flex items-center gap-2 md:gap-4 text-on-surface-variant">
          {user && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
              isTodayOnCall 
                ? "bg-primary/10 border-primary/30 text-primary animate-pulse" 
                : isSolidarityToday
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                : "bg-surface-container-high border-outline-variant/10 text-on-surface-variant/40"
            )}>
              {isTodayOnCall ? (
                <>
                  <ShiftArc
                    size={16}
                    showDot
                    from={todayShift?.startTime}
                    to={todayShift?.endTime}
                    title={
                      todayShift
                        ? `Reperibile: turno ${todayShift.startTime}–${todayShift.endTime}`
                        : 'Reperibile'
                    }
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Reperibile</span>
                </>
              ) : isSolidarityToday ? (
                <>
                  <BellOff className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Solidarietà</span>
                </>
              ) : (
                <>
                  <ShiftArc size={16} muted title="Nessuna copertura in corso" />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Libero</span>
                </>
              )}
            </div>
          )}

          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={cn(
                "p-2 rounded-full transition-all relative",
                conflicts.length > 0 
                  ? "text-error hover:bg-error/10" 
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              )}
            >
              <Bell className="w-4 h-4 md:w-5 md:h-5" />
              {conflicts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border-2 border-surface animate-pulse" />
              )}
            </button>

            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-72 sm:w-80 bg-surface-container-highest border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden z-[60]"
                >
                  <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-high">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-error" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Criticità Rilevate</h3>
                    </div>
                    <button onClick={() => setIsNotificationsOpen(false)}>
                      <X className="w-4 h-4 text-on-surface-variant hover:text-on-surface" />
                    </button>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto p-2 space-y-1">
                    {conflicts.length > 0 ? (
                      conflicts.map((conflict, idx) => (
                        <div 
                          key={idx}
                          className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/5 hover:border-error/20 transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-error/10 text-error group-hover:scale-110 transition-transform">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-on-surface">
                                {format(conflict.date, 'EEEE d MMMM', { locale: it })}
                              </p>
                              <p className="text-[10px] text-on-surface-variant mt-1 leading-relaxed">
                                {formatDuration(conflict.hours)} di reperibilità ({conflict.shift.startTime}–{conflict.shift.endTime})
                                {conflict.kind === 'vacation' ? ` durante le ${conflict.detail}.` : ' in una giornata di solidarietà.'}
                              </p>
                              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/10 text-error text-[9px] font-bold uppercase tracking-tighter">
                                Da Sistemare
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                          <BellOff className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-bold text-on-surface">Nessun conflitto</p>
                        <p className="text-[10px] text-on-surface-variant mt-1">
                          Ottimo lavoro! Non ci sono turni in conflitto con solidarietà o ferie.
                        </p>
                      </div>
                    )}
                  </div>

                  {conflicts.length > 0 && (
                    <div className="p-3 bg-surface-container-high border-t border-outline-variant/10">
                      <p className="text-[9px] text-center text-on-surface-variant font-medium">
                        Modifica i turni, le solidarietà o le ferie nel calendario per risolvere.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={onSettingsClick}
            className="p-2 rounded-full hover:bg-surface-container-high hover:text-on-surface transition-all"
          >
            <Settings className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          
          {user ? (
            <div className="flex items-center gap-2 md:gap-4 ml-1 md:ml-2 pl-2 md:pl-4 border-l border-outline-variant/20">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-xs font-bold text-on-surface">{user.displayName}</span>
                <span className="text-[10px] text-on-surface-variant hidden md:block">{user.email}</span>
              </div>
              <button 
                onClick={onProfileClick}
                className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-surface-container-high border border-outline-variant/20 overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/50 transition-all"
              >
                <img 
                  src={user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`} 
                  alt="User" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </button>
              <button 
                onClick={() => logOut()}
                className="p-2 rounded-full hover:bg-error/10 hover:text-error transition-all"
                title="Logout"
              >
                <LogOut className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signIn()}
              className="flex items-center gap-2 px-3 md:px-4 py-1.5 bg-primary text-on-primary rounded-lg font-bold text-[10px] md:text-xs hover:opacity-90 transition-opacity ml-1 md:ml-2"
            >
              <LogIn className="w-3 h-3 md:w-4 md:h-4" />
              Accedi
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
