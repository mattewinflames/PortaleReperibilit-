import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Wallet, Save, CheckCircle2, AlertCircle, RotateCcw, Heart, Upload, Trash2 } from 'lucide-react';
import { Settings, SolidarityDate } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface SettingsViewProps {
  solidarityDates: SolidarityDate[];
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  onMigrateData: () => Promise<void>;
  onAddSolidarityDates: (dates: SolidarityDate[]) => Promise<void>;
  onDeleteSolidarityDate: (id: string) => Promise<void>;
}

export function SettingsView({
  solidarityDates,
  settings,
  onUpdateSettings,
  onMigrateData,
  onAddSolidarityDates,
  onDeleteSolidarityDate
}: SettingsViewProps) {
  const [localOnCallRate, setLocalOnCallRate] = useState(settings.onCallRate);
  const [localInterventionRate, setLocalInterventionRate] = useState(settings.interventionRate);
  const [localTaxPercentage, setLocalTaxPercentage] = useState(settings.taxPercentage);
  const [isSaved, setIsSaved] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isImportingSolidarity, setIsImportingSolidarity] = useState(false);
  const solidarityInputRef = useRef<HTMLInputElement>(null);

  // Prima ne venivano mostrate solo 8, e le altre non erano cancellabili.
  const sortedSolidarityDates = [...solidarityDates].sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // Sync local state if props change
  useEffect(() => {
    setLocalOnCallRate(settings.onCallRate);
    setLocalInterventionRate(settings.interventionRate);
    setLocalTaxPercentage(settings.taxPercentage);
  }, [settings]);

  const handleSave = () => {
    // Le regole Firestore accettano solo un intero fra 0 e 100:
    // un "23,5" faceva fallire la scrittura senza spiegazioni.
    const tax = Math.min(100, Math.max(0, Math.round(Number(localTaxPercentage) || 0)));

    onUpdateSettings({
      onCallRate: localOnCallRate,
      interventionRate: localInterventionRate,
      taxPercentage: tax
    });
    setLocalTaxPercentage(tax);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleMigrate = async () => {
    if (window.confirm('Questa operazione aggiornerà tutti i vecchi turni al nuovo formato (aggiungendo orari di default). Continuare?')) {
      setIsMigrating(true);
      try {
        await onMigrateData();
        setImportStatus({ type: 'success', message: 'Dati migrati con successo!' });
      } catch (error) {
        setImportStatus({ type: 'error', message: 'Errore durante la migrazione.' });
      } finally {
        setIsMigrating(false);
        setTimeout(() => setImportStatus(null), 5000);
      }
    }
  };

  const handleSolidarityImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingSolidarity(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      const newDates: SolidarityDate[] = [];

      lines.forEach(line => {
        // Accetta sia DTSTART;VALUE=DATE:20261228 sia DTSTART:20261228T000000Z
        const match = line.match(/^DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/);
        if (match) {
          const year = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // 0-indexed
          const day = parseInt(match[3]);
          const dateStr = `${match[1]}-${match[2]}-${match[3]}`;
          
          newDates.push({
            id: `solidarity-${dateStr}`,
            day,
            month,
            year,
            dateStr
          });
        }
      });

      // Il file puo' contenere piu' volte la stessa data (es. eventi ricorrenti).
      const uniqueDates = Array.from(new Map(newDates.map((d) => [d.id, d])).values());

      if (uniqueDates.length > 0) {
        try {
          await onAddSolidarityDates(uniqueDates);
          setImportStatus({ type: 'success', message: `Importate ${uniqueDates.length} date di solidarietà!` });
        } catch (error) {
          setImportStatus({ type: 'error', message: 'Errore durante l\'importazione della solidarietà.' });
        }
      } else {
        setImportStatus({ type: 'error', message: 'Nessuna data valida trovata nel file .ics.' });
      }
      setIsImportingSolidarity(false);
      if (solidarityInputRef.current) solidarityInputRef.current.value = '';
      setTimeout(() => setImportStatus(null), 5000);
    };
    reader.readAsText(file);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-5xl"
    >
      <div>
        <h2 className="text-4xl font-bold font-headline mb-2">Impostazioni</h2>
        <p className="text-on-surface-variant max-w-2xl">
          Configura i parametri fondamentali per il calcolo delle tue spettanze e gestisci l'importazione dei dati.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Tariffe Card */}
        <div className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/10 space-y-8 architectural-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Wallet className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold font-headline">Impostazioni Tariffe</h3>
          </div>

          {importStatus && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-4 rounded-xl flex items-center gap-3 text-sm font-bold",
                importStatus.type === 'success' ? "bg-primary/10 text-primary" : "bg-error/10 text-error"
              )}
            >
              {importStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {importStatus.message}
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tariffa Oraria Reperibilità</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface font-bold">€</span>
                <input 
                  type="text" 
                  value={localOnCallRate}
                  onChange={(e) => setLocalOnCallRate(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-4 pl-10 pr-4 text-xl font-bold focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>
              <p className="text-[10px] text-on-surface-variant italic">Indennità per ogni ora di disponibilità.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tariffa Oraria Interventi</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface font-bold">€</span>
                <input 
                  type="text" 
                  value={localInterventionRate}
                  onChange={(e) => setLocalInterventionRate(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-4 pl-10 pr-4 text-xl font-bold focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>
              <p className="text-[10px] text-on-surface-variant italic">Compenso per ore di lavoro effettivo.</p>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Percentuale Tasse</label>
              <p className="text-[10px] text-on-surface-variant">Aliquota per calcolo Netto/Lordo.</p>
            </div>
            <div className="relative w-32">
              <input 
                type="number" 
                min={0}
                max={100}
                step={1}
                value={localTaxPercentage}
                onChange={(e) => setLocalTaxPercentage(Number(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-right font-bold focus:outline-none focus:border-primary/50 transition-all pr-10"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface font-bold">%</span>
            </div>
          </div>

          <div className="pt-6 border-t border-outline-variant/10 flex justify-end items-center gap-4">
            <button 
              onClick={handleMigrate}
              disabled={isMigrating}
              className="flex items-center gap-2 px-6 py-3 bg-surface-container-highest text-on-surface rounded-xl font-bold text-sm hover:bg-surface-container-high transition-all disabled:opacity-50"
            >
              <RotateCcw className={cn("w-4 h-4", isMigrating && "animate-spin")} />
              {isMigrating ? 'Migrazione...' : 'Migra Vecchi Dati'}
            </button>
            {isSaved && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-primary font-bold text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Tariffe Salvate!</span>
              </motion.div>
            )}
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-8 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
            >
              <Save className="w-4 h-4" />
              Salva Tariffe
            </button>
          </div>
        </div>

        {/* Solidarity Card */}
        <div className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/10 space-y-8 architectural-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-headline">Importa Solidarietà</h3>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mt-1">Gestione giorni di solidarietà (.ics)</p>
              </div>
            </div>
            
            <input 
              type="file" 
              accept=".ics" 
              className="hidden" 
              ref={solidarityInputRef}
              onChange={handleSolidarityImport}
            />
            
            <button 
              onClick={() => solidarityInputRef.current?.click()}
              disabled={isImportingSolidarity}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <Upload className={cn("w-4 h-4", isImportingSolidarity && "animate-bounce")} />
              {isImportingSolidarity ? 'Importazione...' : 'Carica File .ics'}
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Carica il file del calendario per visualizzare i giorni di solidarietà direttamente nel tuo calendario. 
              I giorni verranno evidenziati in <b>Verde Smeraldo</b>.
            </p>

            {solidarityDates.length > 0 && (
              <div className="pt-4 border-t border-outline-variant/10">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Date Importate ({solidarityDates.length})</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
                  {sortedSolidarityDates.map((date) => (
                    <div key={date.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/10 group">
                      <span className="text-xs font-bold">{format(new Date(date.year, date.month, date.day), 'dd/MM/yyyy')}</span>
                      <button 
                        onClick={() => onDeleteSolidarityDate(date.id)}
                        aria-label={`Elimina la data ${date.dateStr}`}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-all opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
