import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { Calendar } from './components/Calendar';
import { InterventionList } from './components/InterventionList';
import { CalendarView } from './components/CalendarView';
import { SettingsView } from './components/SettingsView';
import { StatisticsView } from './components/StatisticsView';
import { ImportData } from './components/ImportData';
import { InterventionsArchive } from './components/InterventionsArchive';
import { UserProfileModal } from './components/UserProfileModal';
import { EarningsDetail, Shift, Intervention, Settings, SolidarityDate } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { buildHoursIndex, breakdownForMonth, isOnCallAt, parseRate } from './lib/hours';
import { commitInChunks, deleteAllInChunks } from './lib/firestore-batch';
import {
  auth,
  db,
  signIn,
  handleFirestoreError,
  OperationType,
  FIRESTORE_ERROR_EVENT,
  FirestoreErrorInfo,
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  getDocs,
  where,
  type WriteBatch,
} from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ShiftArc } from './components/ShiftArc';

const DEFAULT_SETTINGS: Settings = {
  onCallRate: '12,50',
  interventionRate: '45,00',
  taxPercentage: 23,
};

/** ID deterministico di un turno: stessa data + stessa ora di inizio = stesso documento. */
const shiftDocId = (shift: Pick<Shift, 'year' | 'month' | 'day' | 'startTime'>) =>
  `${shift.year}-${shift.month}-${shift.day}-${(shift.startTime || '00:00').replace(':', '')}`;

/** ID intervento. `Math.random().substr()` era deprecato e collidibile. */
const newInterventionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `int-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedInterventionId, setSelectedInterventionId] = useState<string | null>(null);
  const [shouldOpenAddIntervention, setShouldOpenAddIntervention] = useState(false);
  const [firestoreError, setFirestoreError] = useState<FirestoreErrorInfo | null>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [solidarityDates, setSolidarityDates] = useState<SolidarityDate[]>([]);
  const [dashboardMonth, setDashboardMonth] = useState(() => new Date());

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // ---------------------------------------------------------------- Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Gli errori Firestore non vengono più lanciati: arrivano qui come evento.
  useEffect(() => {
    const listener = (event: Event) => {
      setFirestoreError((event as CustomEvent<FirestoreErrorInfo>).detail);
    };
    window.addEventListener(FIRESTORE_ERROR_EVENT, listener);
    return () => window.removeEventListener(FIRESTORE_ERROR_EVENT, listener);
  }, []);

  useEffect(() => {
    if (currentView !== 'calendar') {
      setSelectedInterventionId(null);
      setShouldOpenAddIntervention(false);
    }
  }, [currentView]);

  // ---------------------------------------------------- Listener Firestore
  useEffect(() => {
    if (!user || !isAuthReady) {
      setShifts([]);
      setInterventions([]);
      setSolidarityDates([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }

    const shiftsRef = collection(db, 'users', user.uid, 'shifts');
    const unsubscribeShifts = onSnapshot(
      shiftsRef,
      (snapshot) => setShifts(snapshot.docs.map((d) => d.data() as Shift)),
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/shifts`),
    );

    const interventionsRef = query(
      collection(db, 'users', user.uid, 'interventions'),
      orderBy('year', 'desc'),
      orderBy('month', 'desc'),
      orderBy('day', 'desc'),
    );
    const unsubscribeInterventions = onSnapshot(
      interventionsRef,
      (snapshot) => setInterventions(snapshot.docs.map((d) => d.data() as Intervention)),
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/interventions`),
    );

    const settingsRef = doc(db, 'users', user.uid, 'settings', 'current');
    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists()) setSettings(snapshot.data() as Settings);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/current`),
    );

    const solidarityRef = collection(db, 'users', user.uid, 'solidarityDates');
    const unsubscribeSolidarity = onSnapshot(
      solidarityRef,
      (snapshot) => setSolidarityDates(snapshot.docs.map((d) => d.data() as SolidarityDate)),
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/solidarityDates`),
    );

    return () => {
      unsubscribeShifts();
      unsubscribeInterventions();
      unsubscribeSettings();
      unsubscribeSolidarity();
    };
  }, [user, isAuthReady]);

  // ------------------------------------------------------------- Calcoli
  // Un solo indice, un solo motore di calcolo (src/lib/hours.ts).
  const hoursIndex = useMemo(() => buildHoursIndex(shifts, interventions), [shifts, interventions]);

  const monthly = useMemo(
    () => breakdownForMonth(hoursIndex, dashboardMonth.getFullYear(), dashboardMonth.getMonth()),
    [hoursIndex, dashboardMonth],
  );

  const { grossOnCall, grossIntervention, currentGross, currentNet } = useMemo(() => {
    const rateOnCall = parseRate(settings.onCallRate);
    const rateIntervention = parseRate(settings.interventionRate);
    const onCall = monthly.onCallHours * rateOnCall;
    const intervention = monthly.interventionHours * rateIntervention;
    const gross = onCall + intervention;
    return {
      grossOnCall: onCall,
      grossIntervention: intervention,
      currentGross: gross,
      currentNet: gross * (1 - (settings.taxPercentage || 0) / 100),
    };
  }, [monthly, settings]);

  /**
   * Le due letture delle spettanze.
   *
   * COMPETENZA: il lavoro del mese selezionato, con l'indicazione della busta
   * che lo pagherà (copertura +1 mese, interventi +2).
   * CASSA: cosa arriva nella busta di questo mese, cioè la copertura del mese
   * precedente più gli interventi di due mesi prima.
   *
   * Nota: si usa la tariffa corrente anche per i mesi passati. Finché non ci
   * sono tariffe datate, la vista Cassa su mesi lontani è approssimata.
   */
  const earningsDetail = useMemo<EarningsDetail>(() => {
    const rateOnCall = parseRate(settings.onCallRate);
    const rateIntervention = parseRate(settings.interventionRate);

    const y = dashboardMonth.getFullYear();
    const m = dashboardMonth.getMonth();
    // Il costruttore Date gestisce da sé il cambio d'anno.
    const shiftMonth = (n: number) => new Date(y, m + n, 1);
    const label = (d: Date) => format(d, 'MMMM yyyy', { locale: it });

    const prev = shiftMonth(-1);
    const prev2 = shiftMonth(-2);
    const bPrev = breakdownForMonth(hoursIndex, prev.getFullYear(), prev.getMonth());
    const bPrev2 = breakdownForMonth(hoursIndex, prev2.getFullYear(), prev2.getMonth());

    return {
      monthLabel: label(dashboardMonth),
      taxPercentage: settings.taxPercentage || 0,
      competenza: {
        onCall: {
          hours: monthly.onCallHours,
          gross: monthly.onCallHours * rateOnCall,
          monthLabel: label(shiftMonth(1)),
        },
        intervention: {
          hours: monthly.interventionHours,
          gross: monthly.interventionHours * rateIntervention,
          monthLabel: label(shiftMonth(2)),
        },
      },
      cassa: {
        onCall: {
          hours: bPrev.onCallHours,
          gross: bPrev.onCallHours * rateOnCall,
          monthLabel: label(prev),
        },
        intervention: {
          hours: bPrev2.interventionHours,
          gross: bPrev2.interventionHours * rateIntervention,
          monthLabel: label(prev2),
        },
      },
    };
  }, [hoursIndex, dashboardMonth, monthly, settings]);

  const today = useMemo(() => new Date(), []);

  const isTodayOnCall = useMemo(() => isOnCallAt(hoursIndex, today), [hoursIndex, today]);

  const isSolidarityToday = useMemo(
    () =>
      solidarityDates.some(
        (d) => d.day === today.getDate() && d.month === today.getMonth() && d.year === today.getFullYear(),
      ),
    [solidarityDates, today],
  );

  // ---------------------------------------------------------- Navigazione
  const handleDayClick = (day: number, month: Date) => {
    setSelectedDate(month);
    setSelectedDay(day);
    setSelectedInterventionId(null);
    setShouldOpenAddIntervention(false);
    setCurrentView('calendar');
  };

  const handleEditInterventionFromDashboard = (intervention: Intervention) => {
    setSelectedDate(new Date(intervention.year, intervention.month, intervention.day));
    setSelectedDay(intervention.day);
    setSelectedInterventionId(intervention.id);
    setShouldOpenAddIntervention(false);
    setCurrentView('calendar');
  };

  const handleAddManualIntervention = () => {
    const now = new Date();
    setSelectedDate(now);
    setSelectedDay(now.getDate());
    setSelectedInterventionId(null);
    setShouldOpenAddIntervention(true);
    setCurrentView('calendar');
  };

  const handleViewCalendar = () => {
    setSelectedDate(null);
    setSelectedDay(null);
    setSelectedInterventionId(null);
    setShouldOpenAddIntervention(false);
    setCurrentView('calendar');
  };

  // ------------------------------------------------------------ Mutazioni
  const onAddShift = useCallback(
    async (shift: Shift) => {
      if (!user) return;
      const path = `users/${user.uid}/shifts/${shiftDocId(shift)}`;
      try {
        await setDoc(doc(db, path), shift);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user],
  );

  const onDeleteShift = useCallback(
    async (day: number, month: Date, startTime?: string) => {
      if (!user) return;

      if (startTime) {
        const path = `users/${user.uid}/shifts/${shiftDocId({
          year: month.getFullYear(),
          month: month.getMonth(),
          day,
          startTime,
        })}`;
        try {
          await deleteDoc(doc(db, path));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
        return;
      }

      // Fallback: elimina tutti i turni che iniziano quel giorno.
      const shiftsRef = collection(db, 'users', user.uid, 'shifts');
      const q = query(
        shiftsRef,
        where('year', '==', month.getFullYear()),
        where('month', '==', month.getMonth()),
        where('day', '==', day),
      );
      try {
        const snapshot = await getDocs(q);
        await deleteAllInChunks(
          db,
          snapshot.docs.map((d) => d.ref),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/shifts`);
      }
    },
    [user],
  );

  const onAddIntervention = useCallback(
    async (intervention: Omit<Intervention, 'id'>) => {
      if (!user) return;
      const id = newInterventionId();
      const path = `users/${user.uid}/interventions/${id}`;
      try {
        await setDoc(doc(db, path), { ...intervention, id });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user],
  );

  const onUpdateIntervention = useCallback(
    async (intervention: Intervention) => {
      if (!user) return;
      const path = `users/${user.uid}/interventions/${intervention.id}`;
      try {
        await setDoc(doc(db, path), intervention);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user],
  );

  const onDeleteIntervention = useCallback(
    async (id: string) => {
      if (!user) return;
      const path = `users/${user.uid}/interventions/${id}`;
      try {
        await deleteDoc(doc(db, path));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user],
  );

  const onUpdateSettings = useCallback(
    async (newSettings: Settings) => {
      if (!user) return;
      const path = `users/${user.uid}/settings/current`;
      // Le rules pretendono un intero: senza questo, "23.5" veniva rifiutato.
      const payload: Settings = { ...newSettings, taxPercentage: Math.round(newSettings.taxPercentage) };
      try {
        await setDoc(doc(db, path), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user],
  );

  /**
   * Import puramente additivo: riceve solo i turni che l'utente ha confermato
   * nel pannello di ImportData. Nessuna cancellazione, mai.
   */
  const onImportData = useCallback(
    async (newShifts: Shift[]) => {
      if (!user) return;
      const uid = user.uid;
      try {
        // Oltre 500 operazioni un singolo writeBatch fallisce: qui spezziamo.
        await commitInChunks(
          db,
          newShifts.map(
            (s) => (batch: WriteBatch) => batch.set(doc(db, 'users', uid, 'shifts', shiftDocId(s)), s),
          ),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}/batch-import`);
        throw error;
      }
    },
    [user],
  );

  /**
   * Migrazione dei turni legacy privi di startTime/endTime.
   * Prima scriveva su `${year}-${month}-${day}`, un ID che l'app non usa più:
   * il documento vecchio restava e ne nasceva uno nuovo. Ora il documento
   * legacy viene eliminato e sostituito con quello dal nuovo ID.
   */
  const onMigrateData = useCallback(async () => {
    if (!user) return;
    const uid = user.uid;

    const legacy = shifts.filter((s) => !s.startTime || !s.endTime || s.endYear === undefined);
    if (legacy.length === 0) return;

    const operations: Array<(batch: WriteBatch) => void> = [];

    legacy.forEach((s) => {
      const startTime = s.startTime || '08:00';
      const [h, m] = startTime.split(':').map(Number);
      const startDateTime = new Date(s.year, s.month, s.day, h || 0, m || 0);
      const endDateTime = new Date(startDateTime.getTime() + (s.hours || 0) * 3_600_000);

      const migrated: Shift = {
        ...s,
        startTime,
        endTime: `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`,
        endDay: endDateTime.getDate(),
        endMonth: endDateTime.getMonth(),
        endYear: endDateTime.getFullYear(),
      };

      const legacyId = `${s.year}-${s.month}-${s.day}`;
      const nextId = shiftDocId(migrated);

      operations.push((batch) => batch.set(doc(db, 'users', uid, 'shifts', nextId), migrated));
      if (legacyId !== nextId) {
        operations.push((batch) => batch.delete(doc(db, 'users', uid, 'shifts', legacyId)));
      }
    });

    try {
      await commitInChunks(db, operations);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/migration`);
      throw error;
    }
  }, [user, shifts]);

  const onDeleteAllShifts = useCallback(async () => {
    if (!user) return;
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'shifts'));
    await deleteAllInChunks(
      db,
      snapshot.docs.map((d) => d.ref),
    );
  }, [user]);

  const onDeleteAllInterventions = useCallback(async () => {
    if (!user) return;
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'interventions'));
    await deleteAllInChunks(
      db,
      snapshot.docs.map((d) => d.ref),
    );
  }, [user]);

  const onAddSolidarityDates = useCallback(
    async (dates: SolidarityDate[]) => {
      if (!user) return;
      const uid = user.uid;
      try {
        await commitInChunks(
          db,
          dates.map(
            (d) => (batch: WriteBatch) =>
              batch.set(doc(db, 'users', uid, 'solidarityDates', d.id), d),
          ),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}/solidarity-import`);
        throw error;
      }
    },
    [user],
  );

  const onDeleteSolidarityDate = useCallback(
    async (id: string) => {
      if (!user) return;
      const path = `users/${user.uid}/solidarityDates/${id}`;
      try {
        await deleteDoc(doc(db, path));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user],
  );

  // ---------------------------------------------------------------- Render
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <ShiftArc size={44} className="text-primary animate-spin [animation-duration:2.5s]" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface text-on-surface selection:bg-primary/30 selection:text-primary">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <BottomNav currentView={currentView} onViewChange={setCurrentView} />

        <main className="md:pl-64 min-h-screen flex flex-col pb-20 md:pb-0 safe-area-x">
          <Header
            onSettingsClick={() => setCurrentView('settings')}
            onProfileClick={() => setIsProfileModalOpen(true)}
            user={user}
            isTodayOnCall={isTodayOnCall}
            isSolidarityToday={isSolidarityToday}
            shifts={shifts}
            solidarityDates={solidarityDates}
          />

          {user && (
            <UserProfileModal
              isOpen={isProfileModalOpen}
              onClose={() => setIsProfileModalOpen(false)}
              user={user}
              onDeleteAllShifts={onDeleteAllShifts}
              onDeleteAllInterventions={onDeleteAllInterventions}
            />
          )}

          <AnimatePresence>
            {firestoreError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-4 mt-4 sm:mx-8 p-4 rounded-xl bg-error/10 border border-error/20 flex items-start gap-3 no-print"
                role="alert"
              >
                <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-error">Errore di sincronizzazione</p>
                  <p className="text-xs text-on-surface-variant mt-1 break-words">{firestoreError.message}</p>
                </div>
                <button
                  onClick={() => setFirestoreError(null)}
                  className="p-1 rounded-full hover:bg-error/10 text-error shrink-0"
                  aria-label="Chiudi avviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto w-full">
            {!user ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center space-y-6"
              >
                <div className="w-24 h-24 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 24, ease: 'linear' }}>
                    <ShiftArc size={52} showTicks showDot />
                  </motion.div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold font-headline">Benvenuto nel tuo Gestore Reperibilità</h2>
                  <p className="text-on-surface-variant max-w-md mx-auto">
                    Accedi per sincronizzare i tuoi turni, interventi e statistiche in tempo reale su tutti i tuoi
                    dispositivi.
                  </p>
                </div>
                <button
                  onClick={() => signIn()}
                  className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                >
                  Accedi con Google
                </button>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                {currentView === 'dashboard' ? (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-8"
                  >
                    <div className="hidden print:block mb-8 border-b-2 border-primary pb-4">
                      <h1 className="text-3xl font-bold font-headline">Riepilogo Reperibilità e Interventi</h1>
                      <p className="text-sm text-on-surface-variant">
                        Dashboard Mensile - {format(dashboardMonth, 'MMMM yyyy', { locale: it })}
                      </p>
                    </div>

                    <SummaryCards
                      detail={earningsDetail}
                      summary={{
                        totalHours: monthly.totalHours,
                        onCallHours: monthly.onCallHours,
                        interventionHours: monthly.interventionHours,
                        grossOnCall: grossOnCall,
                        grossIntervention: grossIntervention,
                        grossEarnings: currentGross,
                        netEarningsEstimate: currentNet,
                        month: format(dashboardMonth, 'MMMM yyyy', { locale: it }).replace(/^\w/, (c) =>
                          c.toUpperCase(),
                        ),
                      }}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      <div className="lg:col-span-8">
                        <Calendar
                          shifts={shifts}
                          interventions={interventions}
                          solidarityDates={solidarityDates}
                          month={dashboardMonth}
                          onViewAll={handleViewCalendar}
                          onDayClick={handleDayClick}
                          onMonthChange={setDashboardMonth}
                        />
                      </div>

                      <div className="lg:col-span-4 space-y-8">
                        <ImportData
                          existingShifts={shifts}
                          solidarityDates={solidarityDates}
                          onImportData={onImportData}
                        />
                        <InterventionList
                          interventions={interventions}
                          onEdit={handleEditInterventionFromDashboard}
                          onAdd={handleAddManualIntervention}
                          onViewAll={() => setCurrentView('interventions-archive')}
                        />
                      </div>
                    </div>
                  </motion.div>
                ) : currentView === 'calendar' ? (
                  <motion.div
                    key="calendar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <CalendarView
                      shifts={shifts}
                      interventions={interventions}
                      solidarityDates={solidarityDates}
                      initialDate={selectedDate || undefined}
                      initialSelectedDay={selectedDay}
                      initialEditingInterventionId={selectedInterventionId}
                      initialOpenAddIntervention={shouldOpenAddIntervention}
                      onAddShift={onAddShift}
                      onDeleteShift={onDeleteShift}
                      onAddIntervention={onAddIntervention}
                      onUpdateIntervention={onUpdateIntervention}
                      onDeleteIntervention={onDeleteIntervention}
                    />
                  </motion.div>
                ) : currentView === 'interventions-archive' ? (
                  <motion.div
                    key="interventions-archive"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <InterventionsArchive
                      interventions={interventions}
                      onEdit={handleEditInterventionFromDashboard}
                      onAdd={handleAddManualIntervention}
                    />
                  </motion.div>
                ) : currentView === 'settings' ? (
                  <SettingsView
                    solidarityDates={solidarityDates}
                    settings={settings}
                    onUpdateSettings={onUpdateSettings}
                    onMigrateData={onMigrateData}
                    onAddSolidarityDates={onAddSolidarityDates}
                    onDeleteSolidarityDate={onDeleteSolidarityDate}
                  />
                ) : currentView === 'statistics' ? (
                  <StatisticsView shifts={shifts} interventions={interventions} settings={settings} />
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-20 text-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center mb-6">
                      <ShiftArc size={40} className="text-primary animate-spin [animation-duration:2.5s]" />
                    </div>
                    <h2 className="text-2xl font-bold font-headline mb-2 capitalize">
                      {currentView.replace('-', ' ')}
                    </h2>
                    <p className="text-on-surface-variant">Questa sezione sarà disponibile a breve.</p>
                    <button
                      onClick={() => setCurrentView('dashboard')}
                      className="mt-8 px-6 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm"
                    >
                      Torna alla Dashboard
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>

          <footer className="mt-auto p-8 border-t border-outline-variant/5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 font-sans font-medium">
              © {new Date().getFullYear()} Sistema Gestionale Reperibilità
            </p>
          </footer>
        </main>
      </div>
    </ErrorBoundary>
  );
}
