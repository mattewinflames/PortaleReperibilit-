import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, CheckCircle2, AlertCircle, Info, X, ExternalLink, ChevronRight,
  Plus, Pencil, Equal, EyeOff, ShieldAlert, Loader2,
} from 'lucide-react';
import { Shift, SolidarityDate } from '../types';
import { cn } from '../lib/utils';
import { formatDuration } from '../lib/hours';
import {
  decodeCsv, parseInfowebCsv, diffShifts, validateShifts,
  DiffResult, DiffEntry, Anomaly, RowError,
} from '../lib/import-diff';

interface ImportDataProps {
  /** Turni già presenti nel portale, per il confronto. */
  existingShifts: Shift[];
  solidarityDates?: SolidarityDate[];
  onImportData: (shifts: Shift[]) => void | Promise<void>;
}

interface Review {
  fileName: string;
  diff: DiffResult;
  anomalies: Anomaly[];
  rowErrors: RowError[];
}

const dmy = (s: Shift) =>
  `${String(s.day).padStart(2, '0')}/${String(s.month + 1).padStart(2, '0')}/${s.year}`;

const FIELD_LABELS: Record<string, string> = {
  startTime: 'ora inizio',
  endTime: 'ora fine',
  endDay: 'giorno fine',
  endMonth: 'mese fine',
  endYear: 'anno fine',
};

export function ImportData({ existingShifts, solidarityDates = [], onImportData }: ImportDataProps) {
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [applyModified, setApplyModified] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const blocking = review ? review.anomalies.filter((a) => a.severity === 'error') : [];
  const warnings = review ? review.anomalies.filter((a) => a.severity === 'warning') : [];

  /** Nulla viene scritto finché non si conferma. Mai una cancellazione. */
  const toWrite = useMemo(() => {
    if (!review) return [];
    return review.diff.entries
      .filter((e) => e.category === 'new' || (applyModified && e.category === 'modified'))
      .map((e) => e.incoming!)
      .filter(Boolean);
  }, [review, applyModified]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    try {
      // Infoweb esporta in Windows-1252: readAsText() assumeva UTF-8 e
      // corrompeva accenti e lineette.
      const text = decodeCsv(await file.arrayBuffer());
      const { shifts, errors } = parseInfowebCsv(text);

      if (shifts.length === 0) {
        setImportStatus({ type: 'error', message: 'Nessun turno riconosciuto nel file.' });
        return;
      }

      setReview({
        fileName: file.name,
        diff: diffShifts(shifts, existingShifts),
        anomalies: validateShifts(shifts, solidarityDates),
        rowErrors: errors,
      });
      setApplyModified(false);
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'File non leggibile.' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirm = async () => {
    if (!review || toWrite.length === 0 || blocking.length > 0) return;
    setIsWriting(true);
    try {
      await onImportData(toWrite);
      setImportStatus({ type: 'success', message: `${toWrite.length} turni importati.` });
      setReview(null);
    } catch {
      setImportStatus({ type: 'error', message: 'Scrittura non riuscita.' });
    } finally {
      setIsWriting(false);
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const counts = review?.diff.counts;

  return (
    <div className="relative no-print">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold font-headline uppercase tracking-wider">Importa Reperibilità</h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-bold uppercase tracking-wider"
          >
            <Info className="w-3 h-3" />
            Guida Export
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGuide(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface-container-high rounded-3xl overflow-hidden architectural-shadow border border-outline-variant/20 max-h-[90vh] flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-highest">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold font-headline">Esportazione Dati Reperibilità</h3>
                  <p className="text-on-surface-variant text-xs sm:text-sm mt-1">Guida passo-passo per l'estrazione da Infoweb.</p>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 sm:p-8 overflow-y-auto space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-primary">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold">1</div>
                    <h4 className="font-bold">Accesso al Portale</h4>
                  </div>
                  <div className="pl-11">
                    <p className="text-sm text-on-surface-variant mb-3">Accedi al portale aziendale per iniziare l'esportazione.</p>
                    <a 
                      href="http://infoweb.telecomitalia.local/main/default.asp" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Apri Infoweb
                    </a>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-primary">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold">2</div>
                    <h4 className="font-bold">Navigazione Menu</h4>
                  </div>
                  <div className="pl-11 space-y-3">
                    <p className="text-sm text-on-surface-variant">Una volta effettuato l'accesso, segui il percorso:</p>
                    <div className="flex items-center gap-2 text-sm font-medium bg-surface-container-low p-3 rounded-xl border border-outline-variant/10">
                      <span className="text-primary">Reperibilità</span>
                      <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                      <span className="text-primary">report reperibili</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-primary">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold">3</div>
                    <h4 className="font-bold">Configurazione dei Filtri</h4>
                  </div>
                  <div className="pl-11 space-y-3">
                    <p className="text-sm text-on-surface-variant">Per ottenere i dati corretti imposta i seguenti filtri:</p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-sm text-on-surface-variant">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span>Attiva il <b>"filtro per nome"</b>.</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-on-surface-variant">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span>Inserisci il tuo <b>Nome e Cognome</b> negli appositi campi.</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-on-surface-variant">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span>Seleziona l'intervallo di tempo (<b>Data inizio</b> e <b>Data fine</b>) che intendi esportare.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-primary">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold">4</div>
                    <h4 className="font-bold">Esportazione e Caricamento</h4>
                  </div>
                  <div className="pl-11 space-y-4">
                    <p className="text-sm text-on-surface-variant">Esegui il comando per salvare l'export in formato <b>CSV</b>.</p>
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-500 font-medium leading-relaxed">
                        <b>Importante:</b> Non modificare la struttura del file una volta scaricato. Procedi direttamente al caricamento qui sulla piattaforma.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 border-t border-outline-variant/10 bg-surface-container-highest flex justify-end">
                <button 
                  onClick={() => setShowGuide(false)}
                  className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                >
                  Ho capito
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* ------------------------------------------------------------------ */}
      {/* Pannello di conferma: nessuna scrittura prima dell'OK              */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {review && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isWriting && setReview(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface-container-high rounded-3xl overflow-hidden architectural-shadow border border-outline-variant/20 max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-highest flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-xl font-bold font-headline">Conferma importazione</h3>
                  <p className="text-on-surface-variant text-xs mt-1 truncate">{review.fileName}</p>
                </div>
                <button
                  onClick={() => setReview(null)}
                  disabled={isWriting}
                  className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-40"
                  aria-label="Annulla"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat icon={<Plus className="w-3.5 h-3.5" />} label="Nuovi" value={counts!.new} tone="primary" />
                  <Stat icon={<Pencil className="w-3.5 h-3.5" />} label="Modificati" value={counts!.modified} tone="amber" />
                  <Stat icon={<Equal className="w-3.5 h-3.5" />} label="Identici" value={counts!.identical} tone="muted" />
                  <Stat icon={<EyeOff className="w-3.5 h-3.5" />} label="Solo nel portale" value={counts!.onlyInPortal} tone="muted" />
                </div>

                {blocking.length > 0 && (
                  <Section tone="error" icon={<ShieldAlert className="w-4 h-4" />} title={`${blocking.length} errori bloccanti`}>
                    <p className="text-[11px] text-on-surface-variant mb-2">
                      Corromperebbero i totali. Correggi il file su Infoweb e riesporta.
                    </p>
                    {blocking.map((a, i) => (
                      <li key={i} className="text-xs text-error">{a.message}</li>
                    ))}
                  </Section>
                )}

                {review.rowErrors.length > 0 && (
                  <Section tone="amber" icon={<AlertCircle className="w-4 h-4" />} title={`${review.rowErrors.length} righe non lette`}>
                    {review.rowErrors.slice(0, 5).map((e) => (
                      <li key={e.line} className="text-xs text-on-surface-variant">Riga {e.line}: {e.reason}</li>
                    ))}
                  </Section>
                )}

                {warnings.length > 0 && (
                  <Section tone="amber" icon={<AlertCircle className="w-4 h-4" />} title={`${warnings.length} avvisi`}>
                    {warnings.slice(0, 8).map((a, i) => (
                      <li key={i} className="text-xs text-on-surface-variant">{a.message}</li>
                    ))}
                  </Section>
                )}

                {counts!.modified > 0 && (
                  <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyModified}
                        onChange={(e) => setApplyModified(e.target.checked)}
                        className="mt-0.5 accent-primary w-4 h-4"
                      />
                      <span className="text-xs">
                        <b>Applica anche le {counts!.modified} modifiche.</b>
                        <span className="block text-on-surface-variant mt-0.5">
                          Sovrascrive il turno esistente con quello del file. Non cancella nulla.
                        </span>
                      </span>
                    </label>

                    <ul className="space-y-1.5 pl-7">
                      {review.diff.entries.filter((e) => e.category === 'modified').slice(0, 6).map((e) => (
                        <li key={e.key} className="text-[11px] text-on-surface-variant">
                          <span className="font-bold text-on-surface">{dmy(e.incoming!)}</span>
                          {e.changes.map((c) => (
                            <span key={c.field}> · {FIELD_LABELS[c.field] ?? c.field}: {String(c.from)} → <b className="text-amber-500">{String(c.to)}</b></span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {counts!.onlyInPortal > 0 && (
                  <Section tone="muted" icon={<EyeOff className="w-4 h-4" />} title={`${counts!.onlyInPortal} turni presenti solo nel portale`}>
                    <p className="text-[11px] text-on-surface-variant mb-2">
                      Cadono dentro il periodo del file ma il file non li contiene. Non verranno toccati.
                    </p>
                    {review.diff.entries.filter((e) => e.category === 'onlyInPortal').slice(0, 6).map((e) => (
                      <li key={e.key} className="text-xs text-on-surface-variant">
                        {dmy(e.existing!)} · {e.existing!.startTime}–{e.existing!.endTime}
                      </li>
                    ))}
                  </Section>
                )}

                {counts!.new > 0 && (
                  <Section tone="primary" icon={<Plus className="w-4 h-4" />} title={`${counts!.new} turni da aggiungere`}>
                    {review.diff.entries.filter((e) => e.category === 'new').slice(0, 8).map((e) => (
                      <li key={e.key} className="text-xs text-on-surface-variant">
                        {dmy(e.incoming!)} · {e.incoming!.startTime}–{e.incoming!.endTime} · {formatDuration(e.incoming!.hours)}
                      </li>
                    ))}
                    {counts!.new > 8 && (
                      <li className="text-[11px] text-on-surface-variant/60">…e altri {counts!.new - 8}</li>
                    )}
                  </Section>
                )}
              </div>

              <div className="p-6 border-t border-outline-variant/10 bg-surface-container-highest flex items-center justify-between gap-4">
                <p className="text-[11px] text-on-surface-variant">
                  {blocking.length > 0
                    ? 'Import bloccato dagli errori.'
                    : toWrite.length === 0
                      ? 'Niente da importare: il portale è già allineato.'
                      : `Verranno scritti ${toWrite.length} turni.`}
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setReview(null)}
                    disabled={isWriting}
                    className="px-5 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-bold text-sm hover:opacity-90 disabled:opacity-40"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={confirm}
                    disabled={isWriting || toWrite.length === 0 || blocking.length > 0}
                    className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isWriting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Importa
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="group cursor-pointer p-6 rounded-2xl bg-surface-container-low border border-dashed border-outline-variant/30 hover:border-primary/50 hover:bg-surface-container-high transition-all text-center space-y-3"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
          <Upload className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold">Carica file CSV</p>
          <p className="text-[10px] text-on-surface-variant">Trascina qui o clicca per sfogliare</p>
        </div>
        <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      </div>

      <AnimatePresence>
        {importStatus && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={cn(
              'mt-4 p-3 rounded-xl flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider',
              importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-error/10 text-error',
            )}
          >
            {importStatus.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            <span>{importStatus.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'primary' | 'amber' | 'muted' }) {
  return (
    <div
      className={cn(
        'p-3 rounded-2xl border flex flex-col gap-1',
        tone === 'primary' && 'bg-primary/10 border-primary/20 text-primary',
        tone === 'amber' && value > 0 && 'bg-amber-500/10 border-amber-500/20 text-amber-500',
        (tone === 'muted' || (tone === 'amber' && value === 0)) && 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant',
      )}
    >
      <div className="flex items-center gap-1.5">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
      <span className="text-2xl font-bold font-headline text-on-surface">{value}</span>
    </div>
  );
}

function Section({ tone, icon, title, children }: { tone: 'error' | 'amber' | 'primary' | 'muted'; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'p-4 rounded-2xl border space-y-1.5',
        tone === 'error' && 'bg-error/10 border-error/20',
        tone === 'amber' && 'bg-amber-500/10 border-amber-500/20',
        tone === 'primary' && 'bg-surface-container-low border-outline-variant/10',
        tone === 'muted' && 'bg-surface-container-low border-outline-variant/10',
      )}
    >
      <div className={cn('flex items-center gap-2 font-bold text-xs', tone === 'error' ? 'text-error' : tone === 'amber' ? 'text-amber-500' : 'text-on-surface')}>
        {icon}{title}
      </div>
      <ul className="space-y-1 pl-1">{children}</ul>
    </div>
  );
}
