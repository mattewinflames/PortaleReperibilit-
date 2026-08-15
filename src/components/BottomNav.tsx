import { LayoutDashboard, Calendar as CalendarIcon, BarChart3, Settings, Archive } from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
  { id: 'calendar', icon: CalendarIcon, label: 'Calendario' },
  { id: 'interventions-archive', icon: Archive, label: 'Storico' },
  { id: 'statistics', icon: BarChart3, label: 'Stats' },
  { id: 'settings', icon: Settings, label: 'Impostazioni' },
];

interface BottomNavProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function BottomNav({ currentView, onViewChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface-container-high border-t border-outline-variant/10 flex items-center justify-around px-2 z-50 md:hidden no-print safe-area-bottom">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 min-w-[72px]",
            currentView === item.id 
              ? "text-primary" 
              : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <item.icon className={cn(
            "w-5 h-5 transition-transform duration-200",
            currentView === item.id && "scale-110"
          )} />
          <span className={cn(
            "text-[10px] font-bold tracking-tight font-headline",
            currentView === item.id ? "opacity-100" : "opacity-60"
          )}>
            {item.label}
          </span>
          {currentView === item.id && (
            <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </nav>
  );
}
