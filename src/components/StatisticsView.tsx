import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown,
  Minus,
  Clock, 
  Zap, 
  CalendarDays, 
  Download, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Loader2,
  FileSpreadsheet,
  PieChart,
  Moon,
  CalendarClock
} from 'lucide-react';
import { Shift, Intervention, Settings } from '../types';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceArea,
} from 'recharts';
import { cn } from '../lib/utils';
import { TREND_MONTHS, classifyTrend, trendWindow } from '../lib/trend';
import {
  breakdown,
  buildHoursIndex,
  calculateDuration,
  interventionDurationHours,
  monthRange,
  startOfLocalDay,
  yearRange,
  formatDuration,
} from '../lib/hours';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface StatisticsViewProps {
  shifts: Shift[];
  interventions: Intervention[];
  settings: Settings;
}

const MONTH_NAMES = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
];

const FULL_MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const CHART_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

export function StatisticsView({ shifts, interventions, settings }: StatisticsViewProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Un solo indice per tutta la vista: i quattro blocchi di calcolo duplicati
  // (anno corrente, anno precedente, mese, confronto multi-anno) ora chiamano
  // la stessa funzione `breakdown()` di src/lib/hours.ts.
  const hoursIndex = useMemo(() => buildHoursIndex(shifts, interventions), [shifts, interventions]);
  
  // Get all unique years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    shifts.forEach(s => years.add(s.year));
    interventions.forEach(i => years.add(i.year));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [shifts, interventions]);

  // L'anno in corso, non il più alto: il piano Infoweb arriva già nell'anno dopo,
  // e aprire la pagina su un anno senza mesi completi non mostra nulla di utile.
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedCategory, setSelectedCategory] = useState('Tutte le Attività');
  
  // Rates
  const rateOnCall = parseFloat(settings.onCallRate.replace(',', '.')) || 0;
  const rateIntervention = parseFloat(settings.interventionRate.replace(',', '.')) || 0;

  /**
   * ------------------------------------------------------------------------
   *  CONSUNTIVO vs PIANO
   * ------------------------------------------------------------------------
   *  Il CSV Infoweb contiene i turni di TUTTO l'anno, compresi quelli non
   *  ancora svolti. Sommare l'anno intero e confrontarlo con l'anno scorso
   *  significa mettere un piano contro un consuntivo: ogni gennaio l'anno
   *  nuovo "batterebbe" quello vecchio del 200%.
   *
   *  Qui i confronti si fanno a parità di periodo (gen -> ultimo mese
   *  concluso), mentre il piano residuo alimenta la proiezione annuale.
   */
  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();
  const isPastYear = selectedYear < now.getFullYear();

  /** Ultimo mese da considerare concluso (0-11). -1 se l'anno non è iniziato. */
  const lastClosedMonth = isPastYear ? 11 : isCurrentYear ? now.getMonth() : -1;
  const elapsedMonths = lastClosedMonth + 1;
  const hasPlan = !isPastYear && lastClosedMonth < 11;

  /** Intervallo dal 1° gennaio alla fine dell'ultimo mese concluso. */
  const periodRange = (year: number) => ({
    start: startOfLocalDay(year, 0, 1),
    end: startOfLocalDay(year, lastClosedMonth + 1, 1),
  });

  const maskOnCall = selectedCategory === 'Solo Interventi';
  const maskIntervention = selectedCategory === 'Solo Reperibilità';

  /**
   * Trend del grafico "Distribuzione Ore": ultimi 3 mesi completi contro
   * gli stessi mesi dell'anno prima, con il filtro di categoria applicato.
   */
  const hoursTrend = useMemo(() => {
    const w = trendWindow(selectedYear, new Date());
    if (!w) return null;
    const hoursIn = (year: number) => {
      const b = breakdown(hoursIndex, {
        start: startOfLocalDay(year, w.month, 1),
        end: startOfLocalDay(year, w.month + TREND_MONTHS, 1),
      });
      return (maskOnCall ? 0 : b.onCallHours) + (maskIntervention ? 0 : b.interventionHours);
    };
    const current = hoursIn(w.year);
    const previous = hoursIn(w.year - 1);
    const first = new Date(w.year, w.month, 1);
    const last = new Date(w.year, w.month + TREND_MONTHS - 1, 1);
    const period =
      first.getFullYear() === last.getFullYear()
        ? `${format(first, 'MMM', { locale: it })}–${format(last, 'MMM yyyy', { locale: it })}`
        : `${format(first, 'MMM yyyy', { locale: it })}–${format(last, 'MMM yyyy', { locale: it })}`;
    return { ...classifyTrend(current, previous), current, previous, period };
  }, [hoursIndex, selectedYear, maskOnCall, maskIntervention]);

  /** Ore del periodo confrontabile, per l'anno indicato. */
  const periodHours = (year: number) => {
    if (lastClosedMonth < 0) return { onCall: 0, intervention: 0 };
    const b = breakdown(hoursIndex, periodRange(year));
    return {
      onCall: maskOnCall ? 0 : b.onCallHours,
      intervention: maskIntervention ? 0 : b.interventionHours,
    };
  };

  const prevYear = selectedYear - 1;

  const ytd = useMemo(() => periodHours(selectedYear), [hoursIndex, selectedYear, selectedCategory, lastClosedMonth]);
  const ytdPrev = useMemo(() => periodHours(prevYear), [hoursIndex, prevYear, selectedCategory, lastClosedMonth]);

  const totalHours = ytd.onCall + ytd.intervention;
  const totalGross = ytd.onCall * rateOnCall + ytd.intervention * rateIntervention;
  const totalNet = totalGross * (1 - settings.taxPercentage / 100);

  const prevTotalHours = ytdPrev.onCall + ytdPrev.intervention;
  const prevTotalGross = ytdPrev.onCall * rateOnCall + ytdPrev.intervention * rateIntervention;
  const prevTotalNet = prevTotalGross * (1 - settings.taxPercentage / 100);

  /** Numero di interventi nel periodo concluso. */
  const countInterventions = (year: number) =>
    maskIntervention ? 0 : interventions.filter((i) => i.year === year && i.month <= lastClosedMonth).length;

  const nInterventions = countInterventions(selectedYear);
  const prevNInterventions = countInterventions(prevYear);

  /**
   * Interventi al mese, sui mesi TRASCORSI.
   * Prima si divideva per il numero di mesi *in cui c'erano stati interventi*:
   * 9 interventi in 4 mesi diversi davano 2,25/mese invece di 1,3.
   */
  const avgInterventionsPerMonth = elapsedMonths > 0 ? nInterventions / elapsedMonths : 0;
  const prevAvgInterventions = elapsedMonths > 0 ? prevNInterventions / elapsedMonths : 0;

  /**
   * Incidenza degli interventi sul lordo.
   * Sostituisce il "Rendimento Orario", che era la media pesata fra due
   * tariffe incompatibili (copertura ~3,54 €/h e interventi ~17,74 €/h):
   * un valore che non compare su nessuna busta e che saliva solo perché
   * avevi fatto più interventi.
   */
  const interventionShare = totalGross > 0 ? ((ytd.intervention * rateIntervention) / totalGross) * 100 : 0;
  const prevInterventionShare =
    prevTotalGross > 0 ? ((ytdPrev.intervention * rateIntervention) / prevTotalGross) * 100 : 0;

  /** Proiezione: l'anno intero, piano compreso. */
  const projection = useMemo(() => {
    const b = breakdown(hoursIndex, yearRange(selectedYear));
    const onCall = maskOnCall ? 0 : b.onCallHours;
    const intervention = maskIntervention ? 0 : b.interventionHours;
    const gross = onCall * rateOnCall + intervention * rateIntervention;
    return {
      hours: onCall + intervention,
      gross,
      net: gross * (1 - settings.taxPercentage / 100),
      remaining: Math.max(0, gross - totalGross),
      progress: gross > 0 ? Math.min(100, (totalGross / gross) * 100) : 0,
    };
  }, [hoursIndex, selectedYear, selectedCategory, rateOnCall, rateIntervention, settings.taxPercentage, totalGross]);

  // Trends
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const trends = {
    hours: calculateTrend(totalHours, prevTotalHours),
    net: calculateTrend(totalNet, prevTotalNet),
    interventions: calculateTrend(avgInterventionsPerMonth, prevAvgInterventions),
    share: calculateTrend(interventionShare, prevInterventionShare),
  };

  /**
   * Quando ti chiamano. Ventisette interventi in tre anni non sono una serie
   * storica: sono eventi. Una media li nasconde, una nuvola li mostra.
   * x = posizione nell'anno, y = ora del giorno, dimensione = durata.
   */
  const callData = useMemo(() => {
    if (maskIntervention) return [];
    return interventions
      .filter((i) => i.year === selectedYear)
      .map((i) => {
        const [h, m] = (i.startTime || '0:00').split(':').map(Number);
        return {
          x: i.month + (i.day - 1) / 31,
          y: (h || 0) + (m || 0) / 60,
          z: Math.max(0.25, interventionDurationHours(i)),
          title: i.title,
          date: `${String(i.day).padStart(2, '0')}/${String(i.month + 1).padStart(2, '0')}`,
          time: `${i.startTime}–${i.endTime}`,
          duration: interventionDurationHours(i),
        };
      });
  }, [interventions, selectedYear, maskIntervention]);

  /** Quota di interventi caduti nella finestra di reperibilità (18:00-08:00). */
  const nightShare = useMemo(() => {
    if (callData.length === 0) return 0;
    const inside = callData.filter((c) => c.y >= 18 || c.y < 8).length;
    return (inside / callData.length) * 100;
  }, [callData]);

  // Compatibilità con il resto del componente
  const filteredShifts = useMemo(
    () => (maskOnCall ? [] : shifts.filter((s) => s.year === selectedYear)),
    [shifts, selectedYear, maskOnCall],
  );
  const filteredInterventions = useMemo(
    () => (maskIntervention ? [] : interventions.filter((i) => i.year === selectedYear)),
    [interventions, selectedYear, maskIntervention],
  );

  // Monthly Data for Charts and Table
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const dataPoint: any = {
        index: i,
        name: MONTH_NAMES[i],
        fullName: FULL_MONTH_NAMES[i],
      };

      const onCallHours =
        selectedCategory === 'Solo Interventi'
          ? 0
          : breakdown(hoursIndex, monthRange(selectedYear, i)).onCallHours;

      const monthInterventions = filteredInterventions.filter(int => int.month === i);
      const intHours = monthInterventions.reduce((acc, int) => acc + calculateDuration(int.startTime, int.endTime), 0);
      dataPoint.reperibilità = onCallHours;
      dataPoint.interventi = intHours;
      dataPoint.totale = onCallHours + intHours;
      dataPoint.gross = (onCallHours * rateOnCall) + (intHours * rateIntervention);
      dataPoint.net = dataPoint.gross * (1 - settings.taxPercentage / 100);

      // All years data for multi-year chart
      availableYears.forEach(year => {
        const yearMonthOnCallHours =
          selectedCategory === 'Solo Interventi' ? 0 : breakdown(hoursIndex, monthRange(year, i)).onCallHours;

        const yearInts = selectedCategory === 'Solo Reperibilità' ? [] : interventions.filter(int => int.year === year && int.month === i);
        const total = yearMonthOnCallHours + 
                      yearInts.reduce((acc, int) => acc + calculateDuration(int.startTime, int.endTime), 0);
        dataPoint[`year_${year}`] = total;
      });
      
      return dataPoint;
    });
  }, [filteredShifts, filteredInterventions, shifts, interventions, availableYears, rateOnCall, rateIntervention, settings.taxPercentage, selectedCategory]);

  const activeMonthlyData = monthlyData.filter(d => {
    const hasAnyData = availableYears.some(year => d[`year_${year}`] > 0);
    return hasAnyData || (d.index === new Date().getMonth() && selectedYear === new Date().getFullYear());
  });

  const handleExport = async () => {
    if (!reportRef.current) return;
    
    setIsExporting(true);
    
    try {
      // Small delay to ensure any UI updates are rendered
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // Higher quality
        useCORS: true,
        backgroundColor: '#0e0e0e', // Match app background
        logging: false,
        onclone: (clonedDoc) => {
          // Force disable animations and transitions in the clone
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * { 
              transition: none !important; 
              animation: none !important; 
              -webkit-transition: none !important;
              -moz-transition: none !important;
              -ms-transition: none !important;
              -o-transition: none !important;
            }
            .recharts-wrapper, .recharts-surface {
              transition: none !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        },
        ignoreElements: (el) => el.classList.contains('no-print')
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Report_Reperibilita_${selectedYear}.pdf`);
    } catch (error) {
      console.error('Export failed:', error);
      // Fallback to window.print() if canvas export fails
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  const handleCSVExport = () => {
    const headers = ['Tipo', 'Data', 'Titolo/Giorno', 'Mese', 'Anno', 'Ore', 'Dettagli'];
    const csvRows = [headers.join(',')];

    // Add Shifts
    shifts.filter(s => s.year === selectedYear).forEach(s => {
      const row = [
        'Reperibilità',
        `${s.day}/${s.month + 1}/${s.year}`,
        s.day,
        s.month + 1,
        s.year,
        s.hours,
        s.type === 'weekend' ? 'Weekend' : 'Regolare'
      ];
      csvRows.push(row.join(','));
    });

    // Add Interventions
    interventions.filter(i => i.year === selectedYear).forEach(i => {
      const duration = calculateDuration(i.startTime, i.endTime);
      const row = [
        'Intervento',
        `${i.day}/${i.month + 1}/${i.year}`,
        `"${i.title.replace(/"/g, '""')}"`,
        i.month + 1,
        i.year,
        duration,
        `"${i.location.replace(/"/g, '""')} (${i.startTime}-${i.endTime})"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Dati_Reperibilita_${selectedYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div 
      ref={reportRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10 max-w-6xl mx-auto pb-20"
    >
      {/* Print-only Header */}
      <div className="hidden print:block mb-8 border-b-2 border-primary pb-4">
        <h1 className="text-3xl font-bold font-headline">Report Reperibilità e Interventi</h1>
        <p className="text-sm text-on-surface-variant">
          Analisi Statistica - Anno {selectedYear} | {selectedCategory}
        </p>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 no-print">
        <div>
          <h1 className="text-5xl font-black font-headline tracking-tighter mb-3">Analisi Storica</h1>
          <p className="text-on-surface-variant max-w-xl text-lg leading-relaxed">
            Approfondimento dei trend annuali e scomposizione mensile delle performance operative e finanziarie.
          </p>
        </div>
        
        <div className="flex items-center gap-4 no-print">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">Anno</span>
            <div className="bg-surface-container-high border border-outline-variant/10 rounded-xl px-4 py-2 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer pr-2"
              >
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-surface-container-high">{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">Categoria</span>
            <div className="bg-surface-container-high border border-outline-variant/10 rounded-xl px-4 py-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <select 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer pr-2"
              >
                <option value="Tutte le Attività" className="bg-surface-container-high">Tutte le Attività</option>
                <option value="Solo Reperibilità" className="bg-surface-container-high">Solo Reperibilità</option>
                <option value="Solo Interventi" className="bg-surface-container-high">Solo Interventi</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Periodo di riferimento: i confronti si fanno a parità di mesi. */}
      <div className="flex items-center gap-2 text-xs text-on-surface-variant -mt-4 no-print">
        <CalendarClock className="w-3.5 h-3.5 text-primary/60" />
        <span>
          {elapsedMonths > 0 ? (
            <>
              Consuntivo <b className="text-on-surface">gennaio–{FULL_MONTH_NAMES[lastClosedMonth].toLowerCase()}</b>
              {' '}· confronto con lo stesso periodo del {prevYear}
            </>
          ) : (
            <>Anno non ancora iniziato: sotto trovi il piano.</>
          )}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'Ore maturate',
            value: totalHours.toLocaleString('it-IT', { maximumFractionDigits: 0 }),
            hint: `${elapsedMonths} ${elapsedMonths === 1 ? 'mese' : 'mesi'}`,
            trend: trends.hours,
            icon: Clock,
          },
          {
            label: 'Netto maturato',
            value: `€${totalNet.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`,
            hint: `su €${totalGross.toLocaleString('it-IT', { maximumFractionDigits: 0 })} lordi`,
            trend: trends.net,
            icon: TrendingUp,
          },
          {
            label: 'Interventi',
            value: `${nInterventions}`,
            hint: `${avgInterventionsPerMonth.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/mese`,
            trend: trends.interventions,
            icon: Zap,
          },
          {
            label: 'Da interventi',
            value: `${interventionShare.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`,
            hint: 'del lordo',
            trend: trends.share,
            icon: PieChart,
          },
        ].map((kpi, i) => (
          <div key={i} className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10 architectural-shadow group hover:bg-surface-container-high transition-all">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{kpi.label}</span>
              <div className="p-2 rounded-xl bg-surface-container-highest text-primary group-hover:scale-110 transition-transform">
                <kpi.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-black font-headline tracking-tighter">{kpi.value}</span>
              {prevTotalHours > 0 && Math.abs(kpi.trend) >= 0.05 && (
                <div className={cn(
                  "flex items-center text-[10px] font-bold",
                  kpi.trend >= 0 ? "text-emerald-500" : "text-error"
                )}>
                  {kpi.trend >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                  {Math.abs(kpi.trend).toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1.5">{kpi.hint}</p>
          </div>
        ))}
      </div>

      {/* Proiezione annuale: il piano Infoweb dice già come finirà l'anno. */}
      {hasPlan && projection.gross > 0 && (
        <div className="p-8 rounded-3xl bg-gradient-to-br from-surface-container-high to-surface-container-low border border-outline-variant/10 architectural-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="relative z-10">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary/80 mb-2">
                  Proiezione {selectedYear}
                </p>
                <h3 className="text-4xl font-black font-headline tracking-tighter">
                  €{projection.net.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  netti stimati a fine anno · €{projection.gross.toLocaleString('it-IT', { maximumFractionDigits: 0 })} lordi
                </p>
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Già maturato</p>
                  <p className="text-xl font-bold font-headline text-primary">
                    €{totalGross.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Ancora da fare</p>
                  <p className="text-xl font-bold font-headline text-on-surface-variant">
                    €{projection.remaining.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-2.5 w-full bg-surface-container-lowest rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${projection.progress}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-primary-container to-primary"
              />
            </div>
            <p className="text-[11px] text-on-surface-variant mt-2.5">
              {projection.progress.toFixed(0)}% dell'anno · basato sui turni già programmati su Infoweb
            </p>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Annual Trend Chart */}
        <div className="p-8 rounded-3xl bg-surface-container-low border border-outline-variant/10 architectural-shadow">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-bold font-headline">Andamento Annuale</h3>
              {hasPlan && (
                <p className="text-[10px] text-on-surface-variant mt-1">
                  L'area chiara a destra è pianificata, non ancora svolta
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {availableYears.map((year, idx) => (
                <div key={year} className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} 
                  />
                  <span className={cn(
                    "text-[10px] font-bold uppercase",
                    year === selectedYear ? "text-on-surface" : "text-on-surface-variant"
                  )}>
                    Anno {year}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeMonthlyData}>
                {/* I mesi non ancora trascorsi sono piano, non consuntivo. */}
                {hasPlan && lastClosedMonth >= 0 && (
                  <ReferenceArea
                    x1={MONTH_NAMES[lastClosedMonth + 1]}
                    x2={MONTH_NAMES[11]}
                    fill="#ffffff"
                    fillOpacity={0.03}
                    strokeOpacity={0}
                  />
                )}
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.1} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333',
                    borderRadius: '16px',
                    fontSize: '12px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
                  }}
                  itemStyle={{ fontWeight: 700 }}
                  formatter={(value, name) => [formatDuration(Number(value ?? 0)), String(name).replace('year_', 'Anno ')]}
                  labelFormatter={(label) => <span className="font-bold text-primary">{label}</span>}
                />
                {availableYears.map((year, idx) => (
                  <Area
                    key={year}
                    type="monotone"
                    dataKey={`year_${year}`}
                    name={`year_${year}`}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={year === selectedYear ? 4 : 2}
                    fill="transparent"
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hour Distribution Chart */}
        <div className="p-8 rounded-3xl bg-surface-container-low border border-outline-variant/10 architectural-shadow">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-bold font-headline">Distribuzione Ore</h3>
              {hoursTrend && hoursTrend.kind !== 'none' && (
                <p className="text-[10px] text-on-surface-variant mt-1">
                  {hoursTrend.period}: {formatDuration(hoursTrend.current)} contro {formatDuration(hoursTrend.previous)} un anno prima
                </p>
              )}
            </div>
            {hoursTrend && (
              <div
                className={cn(
                  'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 shrink-0',
                  hoursTrend.kind === 'up' && 'bg-emerald-500/10 text-emerald-500',
                  hoursTrend.kind === 'down' && 'bg-error/10 text-error',
                  (hoursTrend.kind === 'flat' || hoursTrend.kind === 'none') && 'bg-surface-container-highest text-on-surface-variant',
                )}
                title={`Ultimi ${TREND_MONTHS} mesi completi rispetto agli stessi mesi dell'anno precedente`}
              >
                {hoursTrend.kind === 'up' && <TrendingUp className="w-3 h-3" />}
                {hoursTrend.kind === 'down' && <TrendingDown className="w-3 h-3" />}
                {(hoursTrend.kind === 'flat' || hoursTrend.kind === 'none') && <Minus className="w-3 h-3" />}
                {hoursTrend.kind === 'up' && `Trend positivo +${Math.round(hoursTrend.pct)}%`}
                {hoursTrend.kind === 'down' && `Trend negativo ${Math.round(hoursTrend.pct)}%`}
                {hoursTrend.kind === 'flat' && 'Trend stabile'}
                {hoursTrend.kind === 'none' && 'Nessun confronto'}
              </div>
            )}
          </div>
          
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeMonthlyData}>
                <defs>
                  <linearGradient id="colorTotale" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.1} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333',
                    borderRadius: '16px',
                    fontSize: '12px'
                  }}
                  itemStyle={{ fontWeight: 700 }}
                  formatter={(value) => [formatDuration(Number(value ?? 0)), 'Totale']}
                  labelFormatter={(label) => <span className="font-bold text-primary">{label}</span>}
                />
                <Area 
                  type="monotone" 
                  dataKey="totale" 
                  stroke="#6366f1" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorTotale)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Summary Table */}
      <div className="p-8 rounded-3xl bg-surface-container-low border border-outline-variant/10 architectural-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          {/* Quando ti chiamano: gli interventi sono eventi, non una serie storica. */}
      {!maskIntervention && (
        <div className="p-8 rounded-3xl bg-surface-container-low border border-outline-variant/10 architectural-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h3 className="text-xl font-bold font-headline">Quando ti chiamano</h3>
              <p className="text-[11px] text-on-surface-variant mt-1">
                Un punto per intervento · la dimensione è la durata · le fasce scure sono la reperibilità
              </p>
            </div>
            {callData.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-highest">
                <Moon className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold">
                  {nightShare.toFixed(0)}% dentro la finestra 18:00–08:00
                </span>
              </div>
            )}
          </div>

          {callData.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center gap-2">
              <Zap className="w-8 h-8 text-on-surface-variant/30" />
              <p className="text-sm text-on-surface-variant">Nessun intervento registrato nel {selectedYear}.</p>
            </div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
                  {/* La finestra di reperibilità: 18:00–24:00 e 00:00–08:00 */}
                  <ReferenceArea y1={0} y2={8} fill="#abcbdc" fillOpacity={0.05} strokeOpacity={0} />
                  <ReferenceArea y1={18} y2={24} fill="#abcbdc" fillOpacity={0.05} strokeOpacity={0} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.12} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[-0.5, 11.5]}
                    ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
                    tickFormatter={(v: number) => MONTH_NAMES[v] ?? ''}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 24]}
                    ticks={[0, 6, 12, 18, 24]}
                    tickFormatter={(v: number) => `${String(v).padStart(2, '0')}:00`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }}
                    width={48}
                  />
                  <ZAxis type="number" dataKey="z" range={[60, 700]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3', stroke: '#abcbdc', strokeOpacity: 0.3 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof callData)[number];
                      return (
                        <div className="bg-surface-container-highest border border-outline-variant/20 rounded-xl p-3 shadow-xl max-w-[240px]">
                          <p className="text-xs font-bold mb-1">{d.title}</p>
                          <p className="text-[11px] text-on-surface-variant">
                            {d.date} · {d.time}
                          </p>
                          <p className="text-[11px] text-primary font-bold mt-1">
                            {formatDuration(d.duration)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={callData} fill="#abcbdc" fillOpacity={0.55} stroke="#abcbdc" strokeWidth={1} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div>
            <h3 className="text-2xl font-bold font-headline">Riepilogo Mensile</h3>
            <p className="text-on-surface-variant text-sm mt-1">Dettaglio analitico delle competenze maturate nel periodo selezionato.</p>
          </div>
          <div className="flex items-center gap-3 no-print">
            <button 
              onClick={handleCSVExport}
              className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-highest hover:bg-surface-container-high transition-colors rounded-xl text-xs font-bold border border-outline-variant/10"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              Esporta CSV
            </button>
            <button 
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-highest hover:bg-surface-container-high transition-colors rounded-xl text-xs font-bold border border-outline-variant/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExporting ? 'Generazione...' : 'Esporta PDF'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/10">
                <th className="pb-6 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Mese</th>
                <th className="pb-6 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Reperibilità (H)</th>
                <th className="pb-6 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Interventi (H)</th>
                <th className="pb-6 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Totale (€ Lordo)</th>
                <th className="pb-6 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Totale (€ Netto)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {activeMonthlyData.map((row, i) => (
                <tr key={i} className="group hover:bg-surface-container-lowest/50 transition-colors">
                  <td className="py-6 font-bold text-on-surface">
                    {row.fullName} {selectedYear}
                  </td>
                  <td className="py-6 text-right font-mono text-on-surface-variant">{row.reperibilità.toFixed(1)}</td>
                  <td className="py-6 text-right font-mono text-on-surface-variant">{row.interventi.toFixed(1)}</td>
                  <td className="py-6 text-right font-bold text-on-surface">
                    € {row.gross.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-6 text-right font-bold text-primary">
                    € {row.net.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
