import { useMemo } from 'react';
import { cn } from '../lib/utils';

/**
 * ============================================================================
 *  LOGO: L'ARCO NOTTURNO
 * ============================================================================
 *
 *  Un quadrante da 24 ore con la mezzanotte in alto. L'arco disegna il turno
 *  di reperibilità: parte dalle 18:00 (a sinistra), passa per la mezzanotte e
 *  chiude alle 08:00. Lo spazio vuoto è l'orario di servizio.
 *
 *  Non è un orologio generico: è IL turno. La forma cambierebbe se cambiasse
 *  il contratto, e questo lo rende specifico di questa applicazione.
 *
 *  Il componente è parametrico: passando `from`/`to` diversi disegna qualunque
 *  intervallo, quindi può mostrare il turno reale di oggi invece del default.
 */

interface ShiftArcProps {
  /** Ora di inizio, formato HH:mm. Default: turno feriale standard. */
  from?: string;
  /** Ora di fine, formato HH:mm. */
  to?: string;
  /** Lato del quadrato, in pixel. */
  size?: number;
  /** Spessore dell'arco. Se omesso, scala con `size`. */
  strokeWidth?: number;
  /** Punto centrale: segnala "raggiungibile". */
  showDot?: boolean;
  /** Tacche a mezzanotte e mezzogiorno. Sotto i 24px diventano rumore. */
  showTicks?: boolean;
  /** Arco spento: nessuna copertura. */
  muted?: boolean;
  className?: string;
  title?: string;
}

const DEFAULT_FROM = '18:00';
const DEFAULT_TO = '08:00';

/** Ore decimali da "HH:mm". */
function toHours(time: string): number {
  const [h, m] = (time || '0:00').split(':').map(Number);
  return ((Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m : 0) / 60) % 24;
}

/**
 * Punto sul quadrante. L'ora 0 sta in alto e si procede in senso orario,
 * quindi le 06:00 sono a destra, le 12:00 in basso, le 18:00 a sinistra.
 */
function pointAt(hour: number, cx: number, cy: number, r: number) {
  const angle = ((hour % 24) / 24) * 2 * Math.PI;
  return {
    x: cx + r * Math.sin(angle),
    y: cy - r * Math.cos(angle),
  };
}

export function ShiftArc({
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  size = 40,
  strokeWidth,
  showDot = false,
  showTicks = false,
  muted = false,
  className,
  title,
}: ShiftArcProps) {
  const VB = 100;
  const width = strokeWidth ?? (size <= 24 ? 11 : 9);
  const r = (VB - width) / 2 - 2;
  const c = VB / 2;

  const path = useMemo(() => {
    const start = toHours(from);
    const end = toHours(to);

    // Un turno che scavalca la mezzanotte ha fine <= inizio.
    let span = end - start;
    if (span <= 0) span += 24;

    const p1 = pointAt(start, c, c, r);
    const p2 = pointAt(start + span, c, c, r);
    const largeArc = span > 12 ? 1 : 0;

    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }, [from, to, c, r]);

  const label = title ?? `Turno di reperibilità dalle ${from} alle ${to}`;

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>

      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1" opacity={0.18} />

      {showTicks && (
        <>
          <circle cx={c} cy={c - r} r="2" fill="currentColor" opacity={0.35} />
          <circle cx={c} cy={c + r} r="2" fill="currentColor" opacity={0.35} />
        </>
      )}

      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        opacity={muted ? 0.25 : 1}
      />

      {showDot && <circle cx={c} cy={c} r={width * 0.85} fill="currentColor" opacity={muted ? 0.25 : 1} />}
    </svg>
  );
}

/** Marchio completo: arco + nome. Usato nella sidebar e in home. */
export function Brand({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <ShiftArc size={size} showTicks className="text-primary" />
      <div className="min-w-0">
        <p className="text-lg font-bold tracking-tighter text-primary font-headline leading-none">Reperibilità</p>
        <p className="text-[9px] uppercase tracking-widest text-on-surface-variant mt-1 font-sans font-medium">
          Turni e spettanze
        </p>
      </div>
    </div>
  );
}
