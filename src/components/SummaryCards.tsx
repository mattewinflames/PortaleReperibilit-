import { useEffect, useState } from 'react';
import { RotateCcw, Clock, Info, X, AlertTriangle } from 'lucide-react';
import { EarningsDetail, EarningsLine, MonthlySummary } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { formatDuration } from '../lib/hours';

const eur = (n: number) =>
  `€ ${(Number.isFinite(n) ? n : 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface SummaryCardsProps {
  summary: MonthlySummary;
  /** Se assente, il pannello di dettaglio non viene mostrato. */
  detail?: EarningsDetail;
  onResetNetEarnings?: () => void;
}

export function SummaryCards({ summary, detail, onResetNetEarnings }: SummaryCardsProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [view, setView] = useState<'competenza' | 'cassa'>('competenza');

  // Il pannello resta aperto finché non lo si chiude: serve a leggerlo con
  // calma, non è un tooltip. Esc lo chiude, come ogni cosa dismissibile.
  useEffect(() => {
    if (!isDetailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDetailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDetailOpen]);

  return (
    <section className="w-full space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full p-6 sm:p-8 rounded-xl bg-gradient-to-br from-surface-container-high to-surface-container relative overflow-hidden group border border-outline-variant/10"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-primary/10 transition-all duration-500" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8">
          <div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-primary/80 mb-2 sm:mb-4 font-sans">
              Riepilogo Mensile
            </p>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-headline tracking-tighter text-on-surface mb-2">
              {eur(summary.netEarningsEstimate)}
            </h2>
            <p className="text-on-surface-variant text-xs sm:text-sm flex flex-wrap items-center gap-2">
              <span className="text-primary font-bold">Guadagno Netto (Stima)</span>
              <span className="hidden sm:inline w-1 h-1 bg-outline rounded-full" />
              <span>{summary.month}</span>

              {detail && (
                <button
                  onClick={() => setIsDetailOpen((v) => !v)}
                  aria-expanded={isDetailOpen}
                  className={cn(
                    'p-1 rounded-full transition-all ml-1 no-print',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container',
                    isDetailOpen
                      ? 'bg-primary/20 text-primary'
                      : 'text-primary/50 hover:text-primary hover:bg-primary/10',
                  )}
                  title="Mostra il dettaglio e i mesi di accredito"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              )}

              {onResetNetEarnings && (
                <button
                  onClick={onResetNetEarnings}
                  className="p-1 rounded-full hover:bg-primary/10 text-primary/40 hover:text-primary transition-all no-print"
                  title="Azzera contatore"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* I due lordi separati rispecchiano le voci della busta:
                2C3A per la copertura, 2H3x per gli interventi. */}
            <div className="p-4 rounded-lg bg-surface-container-lowest/50 backdrop-blur-sm border border-outline-variant/10 min-w-[170px] space-y-3">
              <div>
                <p className="text-xs text-on-surface-variant mb-1 font-sans">Lordo reperibilità</p>
                <p className="text-2xl font-bold font-headline text-on-surface tracking-tight">
                  {eur(summary.grossOnCall ?? 0)}
                </p>
              </div>
              <div className="pt-3 border-t border-outline-variant/10">
                <p className="text-xs text-on-surface-variant mb-1 font-sans">Lordo interventi</p>
                <p className="text-2xl font-bold font-headline text-on-surface tracking-tight">
                  {eur(summary.grossIntervention ?? 0)}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-surface-container-lowest/50 backdrop-blur-sm border border-outline-variant/10 min-w-[140px]">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3.5 h-3.5 text-primary/60" />
                <p className="text-xs text-on-surface-variant font-sans">Totale Ore</p>
              </div>
              <p className="text-2xl font-bold font-headline text-on-surface tracking-tight">
                {formatDuration(summary.totalHours)}
              </p>

              <div className="mt-2 pt-2 border-t border-outline-variant/10 space-y-1">
                <div className="flex justify-between items-center gap-3 text-[10px] uppercase tracking-wider font-bold">
                  <span className="text-on-surface-variant/60">Reperibilità</span>
                  <span className="text-on-surface">{formatDuration(summary.onCallHours || 0)}</span>
                </div>
                <div className="flex justify-between items-center gap-3 text-[10px] uppercase tracking-wider font-bold">
                  <span className="text-on-surface-variant/60">Interventi</span>
                  <span className="text-on-surface">{formatDuration(summary.interventionHours || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isDetailOpen && detail && (
          <DetailPanel detail={detail} view={view} onViewChange={setView} onClose={() => setIsDetailOpen(false)} />
        )}
      </AnimatePresence>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

interface DetailPanelProps {
  detail: EarningsDetail;
  view: 'competenza' | 'cassa';
  onViewChange: (v: 'competenza' | 'cassa') => void;
  onClose: () => void;
}

function DetailPanel({ detail, view, onViewChange, onClose }: DetailPanelProps) {
  const lines = view === 'competenza' ? detail.competenza : detail.cassa;
  const gross = lines.onCall.gross + lines.intervention.gross;
  const tax = gross * (detail.taxPercentage / 100);
  const net = gross - tax;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden no-print"
    >
      <div className="p-6 rounded-xl bg-surface-container-low border border-outline-variant/15">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="inline-flex bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-1">
            {(['competenza', 'cassa'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                aria-pressed={view === v}
                className={cn(
                  'px-4 py-1.5 rounded-md text-xs font-bold capitalize transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  view === v
                    ? 'bg-primary-container text-primary'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            aria-label="Chiudi il dettaglio"
            className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-on-surface-variant mb-4">
          {view === 'competenza' ? (
            <>
              Quanto vale il lavoro di <b className="text-on-surface">{detail.monthLabel}</b>.
            </>
          ) : (
            <>
              Quanto arriva nella busta di <b className="text-on-surface">{detail.monthLabel}</b>. È il numero da
              confrontare con il cedolino.
            </>
          )}
        </p>

        <div className="space-y-0">
          <Row
            label="Copertura"
            line={lines.onCall}
            view={view}
            hint={view === 'competenza' ? 'accreditata a' : 'ore di'}
          />
          <Row
            label="Interventi"
            line={lines.intervention}
            view={view}
            hint={view === 'competenza' ? 'accreditati a' : 'ore di'}
            estimate
          />

          <div className="flex justify-between items-baseline gap-4 pt-4 mt-2 border-t border-outline-variant/25">
            <span className="text-sm font-bold">{view === 'competenza' ? 'Lordo maturato' : 'Lordo atteso'}</span>
            <span className="font-headline font-bold text-lg">{eur(gross)}</span>
          </div>
          <div className="flex justify-between items-baseline gap-4 py-2">
            <span className="text-xs text-on-surface-variant">Prelievo stimato ({detail.taxPercentage}%)</span>
            <span className="font-headline text-sm text-error">−{eur(tax).replace('€ ', '€ ')}</span>
          </div>
          <div className="flex justify-between items-baseline gap-4 pt-3 border-t border-outline-variant/25">
            <span className="text-sm font-bold">Netto stimato</span>
            <span className="font-headline font-extrabold text-2xl text-primary">{eur(net)}</span>
          </div>
        </div>

        {view === 'competenza' && lines.intervention.gross > 0 && (
          <div className="mt-5 p-3 rounded-lg bg-error/8 border border-error/20 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant">
              Questi {eur(net)} non compaiono su nessuna busta: la copertura arriva a{' '}
              <b className="text-on-surface">{lines.onCall.monthLabel}</b>, gli interventi a{' '}
              <b className="text-on-surface">{lines.intervention.monthLabel}</b>. Passa a{' '}
              <b className="text-on-surface">Cassa</b> per il numero confrontabile col cedolino.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Row({
  label,
  line,
  view,
  hint,
  estimate,
}: {
  label: string;
  line: EarningsLine;
  view: 'competenza' | 'cassa';
  hint: string;
  estimate?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-3 border-b border-outline-variant/10">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-on-surface-variant mt-0.5">
          {formatDuration(line.hours)} · {hint} <span className="capitalize">{line.monthLabel}</span>
          {estimate && view === 'cassa' && <span className="text-on-surface-variant/60"> · stima</span>}
        </p>
      </div>
      <span className="font-headline font-semibold whitespace-nowrap">{eur(line.gross)}</span>
    </div>
  );
}
