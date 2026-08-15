import { LayoutDashboard, Calendar as CalendarIcon, BarChart3, Settings, Archive } from 'lucide-react';
import { cn } from '../lib/utils';
import { Brand } from './ShiftArc';

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'calendar', icon: CalendarIcon, label: 'Calendario' },
  { id: 'interventions-archive', icon: Archive, label: 'Storico interventi' },
  { id: 'statistics', icon: BarChart3, label: 'Statistiche' },
  { id: 'settings', icon: Settings, label: 'Impostazioni' },
];

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface border-r border-outline-variant/10 flex flex-col z-40 hidden md:flex architectural-shadow no-print">
      {/* Stessa altezza dell'header (h-16) e stesso padding orizzontale (px-8):
          il marchio e il titolo condividono l'asse verticale, e il bordo
          inferiore prosegue quello dell'header senza scalini. */}
      <div className="h-16 flex items-center px-8 border-b border-outline-variant/10">
        <Brand size={34} />
      </div>

      <nav className="flex-1 pt-6">
        <div className="px-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg font-headline tracking-tight transition-all duration-200 text-left",
                currentView === item.id 
                  ? "text-primary font-semibold bg-surface-container-high" 
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

    </aside>
  );
}
