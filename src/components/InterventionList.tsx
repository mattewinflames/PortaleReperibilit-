import { Zap, Shield, Settings2, Clock, Plus } from 'lucide-react';
import { Intervention } from '../types';
import { formatDuration, interventionDurationHours } from '../lib/hours';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface InterventionListProps {
  interventions: Intervention[];
  onEdit?: (intervention: Intervention) => void;
  onAdd?: () => void;
  onViewAll?: () => void;
}

export function InterventionList({ interventions, onEdit, onAdd, onViewAll }: InterventionListProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold font-headline tracking-tight">Recenti Interventi</h3>
        <button 
          onClick={(e) => { e.preventDefault(); onViewAll?.(); }}
          className="text-xs text-primary font-bold hover:underline no-print"
        >
          Vedi Tutti
        </button>
      </div>

      <div className="space-y-4">
        {interventions.slice(0, 3).map((item) => (
          <div 
            key={item.id}
            onClick={() => onEdit?.(item)}
            className="p-4 rounded-xl bg-surface-container-high border border-outline-variant/5 hover:border-primary/20 transition-all cursor-pointer group"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
                  {item.type === 'critical' && <Zap className="w-5 h-5 text-primary" />}
                  {item.type === 'security' && <Shield className="w-5 h-5 text-primary" />}
                  {item.type === 'maintenance' && <Settings2 className="w-5 h-5 text-primary" />}
                </div>
                <div>
                  <p className="text-sm font-bold">{item.title}</p>
                </div>
              </div>
              <span className="text-xs font-bold text-on-surface-variant">
                {format(new Date(item.year, item.month, item.day), 'd MMM yyyy', { locale: it })}
              </span>
            </div>
            
            <div className="flex items-center justify-between bg-surface-container-lowest/40 p-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-semibold">{item.startTime} - {item.endTime}</span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-primary">
                {formatDuration(interventionDurationHours(item))}
              </span>
            </div>
          </div>
        ))}

        <button 
          onClick={onAdd}
          className="w-full py-4 rounded-xl border border-dashed border-outline-variant/30 flex items-center justify-center gap-2 text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all group no-print"
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs font-bold">Aggiungi Intervento Manuale</span>
        </button>
      </div>
    </section>
  );
}
