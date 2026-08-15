import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search,
  Filter, 
  Calendar as CalendarIcon, 
  Zap, 
  Shield, 
  Settings2, 
  Clock, 
  ChevronRight,
  ArrowUpDown,
  LayoutGrid,
  List as ListIcon,
  Plus
} from 'lucide-react';
import { Intervention } from '../types';
import { cn } from '../lib/utils';
import { formatDuration, interventionDurationHours } from '../lib/hours';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface InterventionsArchiveProps {
  interventions: Intervention[];
  onEdit: (intervention: Intervention) => void;
  onAdd: () => void;
}

export function InterventionsArchive({ interventions, onEdit, onAdd }: InterventionsArchiveProps) {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    interventions.forEach(i => years.add(i.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [interventions]);

  const filteredInterventions = useMemo(() => {
    return interventions.filter(i => {
      const matchesYear = selectedYear === 'all' || i.year === selectedYear;
      return matchesYear;
    });
  }, [interventions, selectedYear]);

  // Group by Month and Year
  const groupedInterventions = useMemo(() => {
    // First, sort all filtered interventions chronologically (newest first)
    const sorted = [...filteredInterventions].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      if (a.day !== b.day) return b.day - a.day;
      return b.startTime.localeCompare(a.startTime);
    });

    const groups: { [key: string]: Intervention[] } = {};
    sorted.forEach(i => {
      // Use a sortable key format: YYYY-MM (padded)
      const year = i.year || new Date().getFullYear();
      const month = i.month !== undefined ? i.month : new Date().getMonth();
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(i);
    });

    // Sort groups by key descending
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredInterventions]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-6xl mx-auto pb-20"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-black font-headline tracking-tighter">Storico Interventi</h2>
          <p className="text-on-surface-variant text-sm sm:text-base">Consulta e gestisci lo storico completo delle tue attività.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={onAdd}
            className="flex items-center justify-center gap-2 px-6 h-12 bg-primary text-on-primary rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20 w-full sm:w-auto order-last sm:order-none"
          >
            <Plus className="w-4 h-4" />
            Nuovo Intervento
          </button>

          <div className="h-12 bg-surface-container-high border border-outline-variant/10 rounded-xl p-1 flex items-center gap-1">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded-lg transition-all",
                viewMode === 'grid' ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded-lg transition-all",
                viewMode === 'list' ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>

          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="h-12 bg-surface-container-high border border-outline-variant/10 rounded-xl px-4 text-sm font-bold focus:outline-none cursor-pointer min-w-[140px]"
          >
            <option value="all">Tutti gli anni</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-12">
        {groupedInterventions.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mx-auto text-on-surface-variant/30">
              <Search className="w-8 h-8" />
            </div>
            <p className="text-on-surface-variant font-medium">Nessun intervento trovato con i criteri selezionati.</p>
          </div>
        ) : (
          groupedInterventions.map(([key, items]) => {
            const [year, month] = key.split('-').map(Number);
            const monthName = format(new Date(year, month), 'MMMM yyyy', { locale: it });
            
            return (
              <section key={key} className="space-y-6">
                <div className="flex items-center gap-4">
                  <h3 className="text-xl font-bold font-headline capitalize">{monthName}</h3>
                  <div className="h-px flex-1 bg-outline-variant/10" />
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                    {items.length} {items.length === 1 ? 'Intervento' : 'Interventi'}
                  </span>
                </div>

                <div className={cn(
                  "grid gap-4",
                  viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
                )}>
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => onEdit(item)}
                      className={cn(
                        "p-5 rounded-2xl bg-surface-container-low border border-outline-variant/5 hover:border-primary/20 transition-all cursor-pointer group architectural-shadow",
                        viewMode === 'list' && "flex items-center justify-between gap-6"
                      )}
                    >
                      <div className={cn("flex items-center gap-4", viewMode === 'list' && "flex-1")}>
                        <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          {item.type === 'critical' && <Zap className="w-6 h-6 text-primary" />}
                          {item.type === 'security' && <Shield className="w-6 h-6 text-primary" />}
                          {item.type === 'maintenance' && <Settings2 className="w-6 h-6 text-primary" />}
                        </div>
                        <div className="space-y-0.5">
                          <p className="font-bold text-on-surface group-hover:text-primary transition-colors">{item.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">
                            <span>{format(new Date(item.year || new Date().getFullYear(), item.month !== undefined ? item.month : new Date().getMonth(), item.day || 1), 'd MMM yyyy', { locale: it })}</span>
                          </div>
                        </div>
                      </div>

                      <div className={cn(
                        "flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/5",
                        viewMode === 'list' && "mt-0 pt-0 border-t-0 min-w-[200px] justify-end gap-8"
                      )}>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold">{item.startTime} - {item.endTime}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-primary">
                            {formatDuration(interventionDurationHours(item))}
                          </span>
                          <ChevronRight className="w-4 h-4 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
