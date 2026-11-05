import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Zap, Shield, Settings2, X, RotateCcw, Trash2, ChevronDown, Heart } from 'lucide-react';
import { Shift, Intervention, SolidarityDate } from '../types';
import { cn } from '../lib/utils';
import { makeSolidarityDate } from '../lib/solidarity';
import { breakdownForDay, buildHoursIndex, calculateDuration, formatDuration, shiftDurationHours } from '../lib/hours';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  getDay, 
  getDaysInMonth, 
  isSameMonth, 
  isSameDay 
} from 'date-fns';
import { it } from 'date-fns/locale';

interface CalendarViewProps {
  shifts: Shift[];
  interventions: Intervention[];
  solidarityDates?: SolidarityDate[];
  initialDate?: Date;
  initialSelectedDay?: number | null;
  initialEditingInterventionId?: string | null;
  initialOpenAddIntervention?: boolean;
  onAddShift: (shift: Shift) => void;
  onDeleteShift: (day: number, month: Date, startTime?: string) => void;
  onAddIntervention: (intervention: Omit<Intervention, 'id'>) => void;
  onUpdateIntervention: (intervention: Intervention) => void;
  onDeleteIntervention: (id: string) => void;
  /** Se assenti, il calendario mostra le solidarietà ma non permette di modificarle. */
  onAddSolidarityDates?: (dates: SolidarityDate[]) => Promise<void>;
  onDeleteSolidarityDate?: (id: string) => Promise<void>;
}

const DAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

/** Turno infrasettimanale standard: 18:00 -> 08:00 del giorno successivo (14h). */
const DEFAULT_SHIFT_START = '18:00';
const DEFAULT_SHIFT_END = '08:00';

const INTERVENTION_TITLES: Record<Intervention['type'], string> = {
  critical: 'Intervento Critico',
  security: 'Intervento di Sicurezza',
  maintenance: 'Intervento Tecnico',
};

export function CalendarView({ 
  shifts, 
  interventions, 
  solidarityDates,
  initialDate, 
  initialSelectedDay, 
  initialEditingInterventionId,
  initialOpenAddIntervention,
  onAddShift, 
  onDeleteShift, 
  onAddIntervention,
  onUpdateIntervention,
  onDeleteIntervention,
  onAddSolidarityDates,
  onDeleteSolidarityDate
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    if (initialDate instanceof Date && !isNaN(initialDate.getTime())) return initialDate;
    return new Date();
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(initialSelectedDay || (initialOpenAddIntervention ? new Date().getDate() : null));
  const [isModalOpen, setIsModalOpen] = useState(!!initialSelectedDay || !!initialEditingInterventionId || !!initialOpenAddIntervention);
  const [modalStep, setModalStep] = useState<'select' | 'form' | 'list'>(
    initialEditingInterventionId ? 'form' : 
    initialOpenAddIntervention ? 'form' :
    (initialSelectedDay ? 'list' : 'select')
  );
  const [entryType, setEntryType] = useState<'oncall' | 'intervention' | null>(
    initialEditingInterventionId ? 'intervention' : 
    initialOpenAddIntervention ? 'intervention' : 
    null
  );
  const [editingInterventionId, setEditingInterventionId] = useState<string | null>(initialEditingInterventionId || null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form states
  const [shiftStart, setShiftStart] = useState(DEFAULT_SHIFT_START);
  const [shiftEnd, setShiftEnd] = useState(DEFAULT_SHIFT_END);
  const [shiftStartDate, setShiftStartDate] = useState('');
  const [shiftEndDate, setShiftEndDate] = useState('');
  const [shiftType, setShiftType] = useState<'regular' | 'weekend'>('regular');
  const [intStart, setIntStart] = useState('');
  const [intEnd, setIntEnd] = useState('');
  const [intType, setIntType] = useState<Intervention['type']>('maintenance');
  const [intDate, setIntDate] = useState('');

  // Handle initial editing intervention
  useEffect(() => {
    if (initialEditingInterventionId) {
      const intervention = interventions.find(i => i.id === initialEditingInterventionId);
      if (intervention) {
        setEditingInterventionId(intervention.id);
        setEntryType('intervention');
        setModalStep('form');
        setIntStart(intervention.startTime);
        setIntEnd(intervention.endTime);
        setIntType(intervention.type as any);
        setIntDate(`${intervention.year}-${(intervention.month + 1).toString().padStart(2, '0')}-${intervention.day.toString().padStart(2, '0')}`);
        setIsModalOpen(true);
      }
    } else if (initialOpenAddIntervention) {
      const now = new Date();
      setIntDate(`${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`);
    }
  }, [initialEditingInterventionId, initialOpenAddIntervention, interventions]);

  // Calendar logic
  const firstDayOfMonth = startOfMonth(currentDate);
  const startDayIndex = isNaN(getDay(firstDayOfMonth)) ? 0 : (getDay(firstDayOfMonth) + 6) % 7; 
  const daysInMonth = isNaN(getDaysInMonth(currentDate)) ? 30 : getDaysInMonth(currentDate);
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const resetToToday = () => setCurrentDate(new Date());

  const getShiftsForDay = (day: number) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return shifts.filter(s => {
      const start = new Date(s.year, s.month, s.day);
      const end = new Date(
        s.endYear !== undefined ? s.endYear : s.year,
        s.endMonth !== undefined ? s.endMonth : s.month,
        s.endDay !== undefined ? s.endDay : s.day
      );
      return targetDate >= start && targetDate <= end;
    });
  };

  // Stesso motore di calcolo di App.tsx e Calendar.tsx (src/lib/hours.ts):
  // niente doppi conteggi, mezzanotte gestita, immune all'ora legale.
  const hoursIndex = useMemo(() => buildHoursIndex(shifts, interventions), [shifts, interventions]);

  const getDayOnCallHours = (day: number) =>
    breakdownForDay(hoursIndex, currentDate.getFullYear(), currentDate.getMonth(), day).onCallHours;

  const getInterventionsForDay = (day: number) => {
    return interventions.filter(int => 
      int.day === day && 
      int.month === currentDate.getMonth() && 
      int.year === currentDate.getFullYear()
    );
  };

  const getSolidarityForDay = (day: number) =>
    solidarityDates?.find(
      (d) => d.day === day && d.month === currentDate.getMonth() && d.year === currentDate.getFullYear(),
    );

  const canEditSolidarity = Boolean(onAddSolidarityDates && onDeleteSolidarityDate);
  const [isSolidarityBusy, setIsSolidarityBusy] = useState(false);

  /**
   * Segna o toglie la solidarietà sul giorno selezionato.
   *
   * Togliere riapre subito gli inserimenti. Segnare un giorno che ha già
   * turni o interventi chiede conferma: restano dove sono, ma da quel
   * momento risultano in conflitto (vedi l'avviso nell'header).
   */
  const toggleSolidarity = async (day: number) => {
    if (!onAddSolidarityDates || !onDeleteSolidarityDate || isSolidarityBusy) return;
    const existing = getSolidarityForDay(day);
    const nShifts = getShiftsForDay(day).length;
    const nInterventions = getInterventionsForDay(day).length;

    if (!existing && nShifts + nInterventions > 0) {
      const parts = [
        nShifts > 0 ? `${nShifts} ${nShifts === 1 ? 'turno' : 'turni'}` : '',
        nInterventions > 0 ? `${nInterventions} ${nInterventions === 1 ? 'intervento' : 'interventi'}` : '',
      ].filter(Boolean).join(' e ');
      const ok = window.confirm(
        `In questo giorno ci sono ${parts}. Resteranno salvati, ma risulteranno in conflitto con la solidarietà. Procedere?`,
      );
      if (!ok) return;
    }

    setIsSolidarityBusy(true);
    try {
      if (existing) {
        await onDeleteSolidarityDate(existing.id);
        // Senza inserimenti, il giorno torna alla scelta "cosa registrare".
        if (nShifts + nInterventions === 0) setModalStep('select');
      } else {
        await onAddSolidarityDates([makeSolidarityDate(currentDate.getFullYear(), currentDate.getMonth(), day)]);
        setModalStep('list');
        setEntryType(null);
      }
    } catch {
      // L'errore Firestore è già mostrato dal banner "Errore di sincronizzazione".
    } finally {
      setIsSolidarityBusy(false);
    }
  };

  const isSolidarityDay = (day: number) => {
    return solidarityDates?.some(d => 
      d.day === day && 
      d.month === currentDate.getMonth() && 
      d.year === currentDate.getFullYear()
    );
  };

  const handleDayClick = (day: number) => {
    const dayShifts = getShiftsForDay(day);
    const dayInterventions = getInterventionsForDay(day);
    setSelectedDay(day);
    setEditingInterventionId(null);
    
    // Set defaults for new entries
    setShiftStart(DEFAULT_SHIFT_START);
    setShiftEnd(DEFAULT_SHIFT_END);
    setShiftStartDate(`${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
    const tomorrow = new Date(currentDate.getFullYear(), currentDate.getMonth(), day + 1);
    setShiftEndDate(`${tomorrow.getFullYear()}-${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}-${tomorrow.getDate().toString().padStart(2, '0')}`);
    setShiftType('regular');
    
    setIntStart('');
    setIntEnd('');
    setIntType('maintenance');
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setIntDate(`${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`);

    if (dayInterventions.length > 0 || dayShifts.length > 0) {
      setModalStep('list');
      setEntryType(null);
    } else if (isSolidarityDay(day)) {
      setModalStep('list'); // Show empty list with solidarity message
      setEntryType(null);
    } else {
      setModalStep('select');
      setEntryType(null);
    }
    
    setIsModalOpen(true);
  };

  const handleEditIntervention = (int: Intervention) => {
    setEditingInterventionId(int.id);
    setEntryType('intervention');
    setModalStep('form');
    setIntStart(int.startTime);
    setIntEnd(int.endTime);
    setIntType(int.type as any);
    setIntDate(`${int.year}-${(int.month + 1).toString().padStart(2, '0')}-${int.day.toString().padStart(2, '0')}`);
  };

  const handleTypeSelect = (type: 'oncall' | 'intervention') => {
    setEntryType(type);
    setModalStep('form');
  };

  const handleSave = () => {
    const isSolidarity = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return solidarityDates?.some(sd => sd.day === d && sd.month === m - 1 && sd.year === y);
    };

    if (entryType === 'oncall') {
      if (!shiftStartDate || !shiftStart || !shiftEnd || !shiftEndDate) return;
      if (isSolidarity(shiftStartDate)) {
        alert("Non è possibile inserire reperibilità in un giorno di solidarietà.");
        return;
      }
      const [sy, sm, sd] = (shiftStartDate || '').split('-').map(Number);
      const [ey, em, ed] = (shiftEndDate || '').split('-').map(Number);
      
      const draft: Shift = {
        day: sd,
        month: sm - 1,
        year: sy,
        startTime: shiftStart,
        endTime: shiftEnd,
        endDay: ed,
        endMonth: em - 1,
        endYear: ey,
        hours: 0,
        type: shiftType
      };

      // Ore reali trascorse: la notte del cambio ora ne vale una in piu' o in meno.
      // `shiftDurationHours` normalizza anche il 23:59 come fine giornata.
      draft.hours = Math.max(0, shiftDurationHours(draft));

      onAddShift(draft);
    } else {
      if (!intDate || !intStart || !intEnd) return;
      if (isSolidarity(intDate)) {
        alert("Non è possibile inserire interventi in un giorno di solidarietà.");
        return;
      }
      const [y, m, d] = (intDate || '').split('-').map(Number);
      const duration = calculateDuration(intStart, intEnd);
      
      const interventionData = {
        title: INTERVENTION_TITLES[intType],
        location: '',
        startTime: intStart,
        endTime: intEnd,
        type: intType,
        extraPay: formatDuration(duration),
        dateLabel: format(new Date(y, m - 1, d), 'd MMM yyyy', { locale: it }),
        day: d,
        month: m - 1,
        year: y
      };

      if (editingInterventionId) {
        onUpdateIntervention({ ...interventionData, id: editingInterventionId });
      } else {
        onAddIntervention(interventionData);
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedDay) return;
    
    setIsDeleting(true);
    try {
      if (entryType === 'oncall') {
        await onDeleteShift(selectedDay, currentDate, shiftStart);
      } else if (editingInterventionId) {
        await onDeleteIntervention(editingInterventionId);
      }
      setIsModalOpen(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Errore durante l'eliminazione:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isToday = (day: number) => {
    const today = new Date();
    return isSameMonth(currentDate, today) && today.getDate() === day;
  };

  const getSelectedFullDate = () => {
    if (!selectedDay) return '';
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay);
    return format(date, 'EEEE d MMMM yyyy', { locale: it });
  };

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold font-headline tracking-tighter text-on-surface">Calendario Completo</h2>
          <p className="text-on-surface-variant text-xs sm:text-sm mt-1">Gestisci turni di reperibilità e interventi.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <button 
            onClick={resetToToday}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant rounded-xl font-bold text-[10px] sm:text-xs transition-all border border-outline-variant/10"
          >
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Oggi
          </button>
          
          <div className="flex items-center gap-1 sm:gap-2 bg-surface-container-low p-1 rounded-xl border border-outline-variant/10 relative">
            <button 
              onClick={prevMonth}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            
            <button 
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className={cn(
                "font-bold text-[11px] sm:text-sm px-2 sm:px-4 min-w-[100px] sm:min-w-[140px] text-center capitalize transition-all flex items-center justify-center gap-1 sm:gap-2 rounded-lg py-1.5 sm:py-2",
                isDatePickerOpen ? "bg-primary text-on-primary" : "hover:text-primary"
              )}
            >
              {format(currentDate, 'MMMM yyyy', { locale: it })}
              <ChevronDown className={cn("w-3 h-3 sm:w-4 sm:h-4 transition-transform", isDatePickerOpen && "rotate-180")} />
            </button>

            <button 
              onClick={nextMonth}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
          
          <button 
            onClick={() => { 
              const now = new Date();
              const day = now.getDate();
              setSelectedDay(day); 
              setShiftStartDate(`${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
              const tomorrow = new Date(now.getFullYear(), now.getMonth(), day + 1);
              setShiftEndDate(`${tomorrow.getFullYear()}-${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}-${tomorrow.getDate().toString().padStart(2, '0')}`);
              setIntDate(`${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
              
              if (isSolidarityDay(day)) {
                setModalStep('list');
              } else {
                setModalStep('select');
              }
              setIsModalOpen(true); 
            }}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs sm:text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/10"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
            Nuovo
          </button>
        </div>
      </div>

      <div className="relative min-h-[400px] sm:min-h-[600px]">
        <AnimatePresence mode="wait">
          {!isDatePickerOpen ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2 }}
              className="bg-surface-container-low rounded-2xl sm:rounded-3xl overflow-hidden p-3 sm:p-8 architectural-shadow border border-outline-variant/5"
            >
              <div className="grid grid-cols-7 gap-1 sm:gap-4 mb-4 sm:mb-6">
                {DAYS.map(day => (
                  <div key={day} className="text-center py-2 text-[9px] sm:text-xs font-bold text-on-surface-variant tracking-widest font-sans">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-4">
                {Array.from({ length: startDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-[4/3] p-1 sm:p-4 rounded-lg sm:rounded-2xl bg-surface/30 border border-transparent" />
                ))}

                {calendarDays.map(day => {
                  const dayShifts = getShiftsForDay(day);
                  const dayHours = getDayOnCallHours(day);
                  const dayInterventions = getInterventionsForDay(day);
                  const today = isToday(day);
                  const isSolidarity = solidarityDates?.some(d => d.day === day && d.month === currentDate.getMonth() && d.year === currentDate.getFullYear());
                  
                  const isWeekendShift = dayShifts.some(s => s.type === 'weekend');
                  
                  return (
                    <motion.div 
                      key={day} 
                      whileHover={{ scale: 1.02, y: -4 }}
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        "aspect-[4/3] p-1.5 sm:p-4 rounded-lg sm:rounded-2xl border flex flex-col gap-1 sm:gap-2 transition-all cursor-pointer group relative",
                        isWeekendShift ? "bg-error-container/10 border-error/20" :
                        isSolidarity ? "bg-emerald-500/20 border-emerald-500/40" :
                        dayHours > 0 ? "bg-surface-container-high border-primary/10" :
                        "bg-surface-container-high border-outline-variant/10 hover:border-primary/30",
                        today && "ring-1 sm:ring-2 ring-primary ring-offset-2 sm:ring-offset-4 ring-offset-surface"
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <span className={cn(
                          "text-[10px] sm:text-sm font-bold",
                          isWeekendShift ? "text-error" :
                          isSolidarity ? "text-emerald-400" :
                          "text-on-surface"
                        )}>
                          {day}
                        </span>
                        {dayHours > 0 && (
                          <div className={cn(
                            "text-[7px] sm:text-[10px] font-bold px-1 sm:px-2 py-0.5 rounded-full",
                            isWeekendShift ? "bg-error text-on-error" :
                            isSolidarity ? "bg-emerald-500/30 text-emerald-400" :
                            "bg-primary/20 text-primary"
                          )}>
                            {dayHours.toFixed(1).replace('.0', '')}h
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-auto">
                        {dayInterventions.map((int, idx) => (
                          <div key={idx} className="w-1 h-1 sm:w-2 sm:h-2 rounded-full bg-primary" title={int.title} />
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="picker"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="p-12 rounded-3xl bg-surface-container-low border border-outline-variant/10 architectural-shadow"
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h3 className="text-3xl font-bold font-headline">Seleziona Periodo</h3>
                  <p className="text-on-surface-variant text-sm mt-1">Scegli il mese e l'anno per visualizzare il calendario.</p>
                </div>
                <div className="flex items-center gap-4 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/10">
                  <button 
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1))}
                    className="p-3 rounded-lg hover:bg-surface-container-high transition-colors text-primary"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="font-bold text-2xl px-6 min-w-[120px] text-center">{currentDate.getFullYear()}</span>
                  <button 
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1))}
                    className="p-3 rounded-lg hover:bg-surface-container-high transition-colors text-primary"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {Array.from({ length: 12 }).map((_, i) => {
                  const isCurrent = currentDate.getMonth() === i;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setCurrentDate(new Date(currentDate.getFullYear(), i, 1));
                        setIsDatePickerOpen(false);
                      }}
                      className={cn(
                        "py-10 rounded-2xl border transition-all text-center space-y-3 group",
                        isCurrent 
                          ? "bg-primary border-primary text-on-primary shadow-xl shadow-primary/20" 
                          : "bg-surface-container-lowest border-outline-variant/10 hover:border-primary/30 hover:bg-surface-container-low"
                      )}
                    >
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest opacity-60",
                        isCurrent ? "text-on-primary" : "text-on-surface-variant"
                      )}>Mese</span>
                      <p className="text-2xl font-bold font-headline capitalize">
                        {format(new Date(2024, i, 1), 'MMMM', { locale: it })}
                      </p>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 sm:gap-8 p-6 bg-surface-container-low rounded-2xl border border-outline-variant/5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary/20 border border-primary/10" />
          <span className="text-xs text-on-surface-variant font-medium">Reperibilità Regolare</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-error border border-error/20" />
          <span className="text-xs text-on-surface-variant font-medium">Reperibilità Festiva</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-xs text-on-surface-variant font-medium">Intervento Registrato</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
          <span className="text-xs text-on-surface-variant font-medium">Solidarietà</span>
        </div>
      </div>

      {/* Entry Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-surface-container-high rounded-3xl p-8 architectural-shadow border border-outline-variant/20"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface-container-highest text-on-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-bold font-headline mb-1 capitalize">
                  {getSelectedFullDate()}
                </h3>
                <p className="text-on-surface-variant text-sm">
                  {modalStep === 'select' ? 'Cosa desideri registrare?' : 
                   modalStep === 'list' ? 'Gestisci gli inserimenti per questo giorno.' :
                   `Nuovo ${entryType === 'oncall' ? 'Turno Reperibilità' : 'Intervento Tecnico'}`}
                </p>
              </div>

              {modalStep === 'list' ? (
                <div className="space-y-4">
                  {isSolidarityDay(selectedDay!) && (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 mb-4">
                      <Heart className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p className="text-sm font-bold text-emerald-500 flex-1">Giorno di Solidarietà: inserimenti disabilitati.</p>
                      {canEditSolidarity && (
                        <button
                          onClick={() => toggleSolidarity(selectedDay!)}
                          disabled={isSolidarityBusy}
                          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                  )}

                  {getInterventionsForDay(selectedDay!).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Interventi</p>
                      {getInterventionsForDay(selectedDay!).map(int => (
                        <button 
                          key={int.id}
                          onClick={() => handleEditIntervention(int)}
                          className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/50 transition-all text-left flex items-center justify-between group"
                        >
                          <div>
                            <p className="font-bold text-sm">{int.title}</p>
                            <p className="text-xs text-on-surface-variant">{int.startTime} - {int.endTime} • {int.location}</p>
                          </div>
                          <Settings2 className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}

                  {getShiftsForDay(selectedDay!).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Reperibilità</p>
                      {getShiftsForDay(selectedDay!).map((s, idx) => (
                        <button 
                          key={idx}
                          onClick={() => {
                            setEntryType('oncall');
                            setModalStep('form');
                            setShiftStart(s.startTime);
                            setShiftEnd(s.endTime);
                            setShiftStartDate(`${s.year}-${(s.month + 1).toString().padStart(2, '0')}-${s.day.toString().padStart(2, '0')}`);
                            setShiftEndDate(`${s.endYear}-${(s.endMonth + 1).toString().padStart(2, '0')}-${s.endDay.toString().padStart(2, '0')}`);
                            setShiftType(s.type);
                          }}
                          className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/50 transition-all text-left flex items-center justify-between group"
                        >
                          <div>
                            <p className="font-bold text-sm">Turno {s.type === 'weekend' ? 'Festivo' : 'Regolare'}</p>
                            <p className="text-xs text-on-surface-variant">
                              {s.startTime} ({s.day}/{s.month + 1}) - {s.endTime} ({s.endDay}/{s.endMonth + 1})
                              <span className="ml-2 font-bold text-primary">
                                [{getDayOnCallHours(selectedDay!).toFixed(1).replace('.0', '')}h oggi]
                              </span>
                            </p>
                          </div>
                          <Settings2 className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-4 grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setModalStep('select')}
                      disabled={isSolidarityDay(selectedDay!)}
                      className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary font-bold text-sm hover:bg-primary/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Aggiungi Altro
                    </button>
                    <button 
                      onClick={() => setIsModalOpen(false)}
                      className="py-3 rounded-xl bg-surface-container-highest font-bold text-sm hover:bg-surface-bright transition-colors"
                    >
                      Chiudi
                    </button>
                  </div>
                  {canEditSolidarity && !isSolidarityDay(selectedDay!) && (
                    <button
                      onClick={() => toggleSolidarity(selectedDay!)}
                      disabled={isSolidarityBusy}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-emerald-500/80 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                    >
                      <Heart className="w-3.5 h-3.5" />
                      Segna come giornata di solidarietà
                    </button>
                  )}
                </div>
              ) : modalStep === 'select' ? (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleTypeSelect('oncall')}
                    className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/50 transition-all text-left group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Clock className="w-6 h-6 text-primary" />
                    </div>
                    <p className="font-bold mb-1">Reperibilità</p>
                    <p className="text-xs text-on-surface-variant">Registra ore di disponibilità on-call.</p>
                  </button>
                  <button 
                    onClick={() => handleTypeSelect('intervention')}
                    className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/50 transition-all text-left group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Zap className="w-6 h-6 text-primary" />
                    </div>
                    <p className="font-bold mb-1">Intervento</p>
                    <p className="text-xs text-on-surface-variant">Registra un intervento tecnico attivo.</p>
                  </button>
                  {canEditSolidarity && selectedDay !== null && (
                    <button
                      onClick={() => toggleSolidarity(selectedDay!)}
                      disabled={isSolidarityBusy}
                      className="col-span-2 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-emerald-500/80 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                    >
                      <Heart className="w-3.5 h-3.5" />
                      Segna come giornata di solidarietà
                    </button>
                  )}
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  {entryType === 'oncall' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Data Inizio</label>
                        <input 
                          type="date" 
                          value={shiftStartDate}
                          onChange={(e) => setShiftStartDate(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 text-on-surface" 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Ora Inizio</label>
                          <input 
                            type="time" 
                            value={shiftStart}
                            onChange={(e) => setShiftStart(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Ora Fine</label>
                          <input 
                            type="time" 
                            value={shiftEnd}
                            onChange={(e) => setShiftEnd(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" 
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Data Fine</label>
                        <input 
                          type="date" 
                          value={shiftEndDate}
                          onChange={(e) => setShiftEndDate(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 text-on-surface" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Tipo Turno</label>
                        <select 
                          value={shiftType}
                          onChange={(e) => setShiftType(e.target.value as any)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50"
                        >
                          <option value="regular">Regolare</option>
                          <option value="weekend">Festivo</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Data Intervento</label>
                        <input 
                          type="date" 
                          value={intDate}
                          onChange={(e) => setIntDate(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 text-on-surface" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Tipo Intervento</label>
                        <select 
                          value={intType}
                          onChange={(e) => setIntType(e.target.value as Intervention['type'])}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50"
                        >
                          <option value="maintenance">Tecnico / Manutenzione</option>
                          <option value="critical">Critico / Urgente</option>
                          <option value="security">Sicurezza</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Ora Inizio</label>
                          <input 
                            type="time" 
                            required
                            value={intStart}
                            onChange={(e) => setIntStart(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Ora Fine</label>
                          <input 
                            type="time" 
                            required
                            value={intEnd}
                            onChange={(e) => setIntEnd(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    {((entryType === 'oncall' && getShiftsForDay(selectedDay!).some(s => s.day === selectedDay && s.month === currentDate.getMonth() && s.startTime === shiftStart)) || (entryType === 'intervention' && editingInterventionId)) ? (
                      <button 
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting}
                        className="p-3 rounded-xl bg-error/10 text-error hover:bg-error/20 transition-colors disabled:opacity-50"
                        title="Elimina"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    ) : null}
                    <button 
                      onClick={() => {
                        const dayInts = getInterventionsForDay(selectedDay!);
                        const dayShifts = getShiftsForDay(selectedDay!);
                        if (dayInts.length > 0 || dayShifts.length > 0) {
                          setModalStep('list');
                        } else {
                          setModalStep('select');
                        }
                      }}
                      disabled={isDeleting}
                      className="flex-1 py-3 rounded-xl bg-surface-container-highest font-bold text-sm hover:bg-surface-bright transition-colors disabled:opacity-50"
                    >
                      Indietro
                    </button>
                    <button 
                      onClick={handleSave}
                      disabled={isDeleting || (entryType === 'oncall' ? (!shiftStart || !shiftEnd || !shiftEndDate) : (!intStart || !intEnd))}
                      className="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? 'Eliminazione...' : editingInterventionId ? 'Aggiorna' : 'Salva'} Registrazione
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Delete Confirmation Overlay */}
              <AnimatePresence>
                {showDeleteConfirm && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-surface-container-high/95 backdrop-blur-md flex items-center justify-center p-6 rounded-3xl"
                  >
                    <div className="text-center space-y-6">
                      <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto">
                        <Trash2 className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold font-headline">Confermi l'eliminazione?</h4>
                        <p className="text-on-surface-variant text-sm mt-2">Questa azione non può essere annullata.</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-3 rounded-xl bg-surface-container-highest font-bold text-sm hover:bg-surface-bright transition-colors"
                        >
                          Annulla
                        </button>
                        <button 
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="flex-1 py-3 rounded-xl bg-error text-on-error font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {isDeleting ? 'Eliminazione...' : 'Sì, Elimina'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {modalStep === 'select' && (
                <div className="mt-8 pt-8 border-t border-outline-variant/10">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="w-full py-3 rounded-xl bg-surface-container-highest font-bold text-sm hover:bg-surface-bright transition-colors"
                  >
                    Chiudi
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
