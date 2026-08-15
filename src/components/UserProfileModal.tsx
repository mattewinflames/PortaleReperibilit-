import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  X, 
  User, 
  Mail, 
  Calendar, 
  Zap, 
  Trash2, 
  AlertTriangle,
  ShieldAlert,
  LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';
import { logOut } from '../firebase';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: FirebaseUser;
  onDeleteAllShifts: () => Promise<void>;
  onDeleteAllInterventions: () => Promise<void>;
}

export function UserProfileModal({ 
  isOpen, 
  onClose, 
  user, 
  onDeleteAllShifts, 
  onDeleteAllInterventions 
}: UserProfileModalProps) {
  const [isDeletingShifts, setIsDeletingShifts] = useState(false);
  const [isDeletingInterventions, setIsDeletingInterventions] = useState(false);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [confirmType, setConfirmType] = useState<'shifts' | 'interventions' | 'all' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleDeleteShifts = async () => {
    setIsDeletingShifts(true);
    setConfirmType(null);
    try {
      await onDeleteAllShifts();
      setStatusMessage({ text: 'Tutti i turni sono stati eliminati.', type: 'success' });
    } catch (error) {
      setStatusMessage({ text: 'Errore durante l\'eliminazione dei turni.', type: 'error' });
    } finally {
      setIsDeletingShifts(false);
    }
  };

  const handleDeleteInterventions = async () => {
    setIsDeletingInterventions(true);
    setConfirmType(null);
    try {
      await onDeleteAllInterventions();
      setStatusMessage({ text: 'Tutti gli interventi sono stati eliminati.', type: 'success' });
    } catch (error) {
      setStatusMessage({ text: 'Errore durante l\'eliminazione degli interventi.', type: 'error' });
    } finally {
      setIsDeletingInterventions(false);
    }
  };

  const handleResetAll = async () => {
    setIsResettingAll(true);
    setConfirmType(null);
    try {
      await onDeleteAllShifts();
      await onDeleteAllInterventions();
      setStatusMessage({ text: 'Tutti i dati sono stati eliminati.', type: 'success' });
    } catch (error) {
      setStatusMessage({ text: 'Errore durante il reset dell\'account.', type: 'error' });
    } finally {
      setIsResettingAll(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-surface rounded-3xl overflow-hidden architectural-shadow"
          >
            {/* Header */}
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold font-headline tracking-tight">Profilo Utente</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
              {/* User Info */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-24 h-24 rounded-full border-4 border-primary/20 p-1">
                  <img 
                    src={user.photoURL || `https://picsum.photos/seed/${user.uid}/200/200`} 
                    alt="Profile" 
                    className="w-full h-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h3 className="text-2xl font-black font-headline tracking-tighter">{user.displayName}</h3>
                  <div className="flex items-center justify-center gap-2 text-on-surface-variant mt-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span className="text-sm font-medium">{user.email}</span>
                  </div>
                </div>
                <button 
                  onClick={() => logOut()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error/10 text-error text-xs font-bold hover:bg-error/20 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnetti Account
                </button>
              </div>

              {/* Danger Zone */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-error">
                  <ShieldAlert className="w-5 h-5" />
                  <h4 className="text-sm font-black uppercase tracking-widest">Zona di Pericolo</h4>
                </div>
                
                <div className="p-6 rounded-2xl bg-error/5 border border-error/20 space-y-6">
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Le seguenti azioni sono <span className="font-bold text-error uppercase">irreversibili</span>. 
                    Assicurati di aver effettuato un backup dei dati se necessario.
                  </p>

                  <div className="grid gap-3">
                    <button 
                      onClick={() => setConfirmType('shifts')}
                      disabled={isDeletingShifts || isResettingAll || !!confirmType}
                      className="flex items-center justify-between p-4 rounded-xl bg-surface border border-error/10 hover:bg-error/5 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-error" />
                        <span className="text-sm font-bold">Elimina solo i Turni</span>
                      </div>
                      <Trash2 className="w-4 h-4 text-error/40 group-hover:text-error transition-colors" />
                    </button>

                    <button 
                      onClick={() => setConfirmType('interventions')}
                      disabled={isDeletingInterventions || isResettingAll || !!confirmType}
                      className="flex items-center justify-between p-4 rounded-xl bg-surface border border-error/10 hover:bg-error/5 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-error" />
                        <span className="text-sm font-bold">Elimina solo gli Interventi</span>
                      </div>
                      <Trash2 className="w-4 h-4 text-error/40 group-hover:text-error transition-colors" />
                    </button>

                    <button 
                      onClick={() => setConfirmType('all')}
                      disabled={isResettingAll || isDeletingShifts || isDeletingInterventions || !!confirmType}
                      className="flex items-center justify-between p-4 rounded-xl bg-error text-on-primary hover:opacity-90 transition-all shadow-lg shadow-error/20 disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-bold">Resetta Completamente Account</span>
                      </div>
                      <Trash2 className="w-4 h-4 opacity-60" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom Confirmation Overlays */}
              <AnimatePresence>
                {confirmType && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-surface/95 backdrop-blur-md flex items-center justify-center p-8"
                  >
                    <div className="text-center space-y-6 max-w-xs">
                      <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto">
                        <Trash2 className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold font-headline">Sei sicuro?</h4>
                        <p className="text-on-surface-variant text-sm mt-2">
                          {confirmType === 'shifts' ? 'Tutti i turni di reperibilità verranno eliminati.' :
                           confirmType === 'interventions' ? 'Tutti gli interventi verranno eliminati.' :
                           'TUTTI i dati del tuo account verranno eliminati definitivamente.'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => {
                            if (confirmType === 'shifts') handleDeleteShifts();
                            else if (confirmType === 'interventions') handleDeleteInterventions();
                            else if (confirmType === 'all') handleResetAll();
                          }}
                          disabled={isDeletingShifts || isDeletingInterventions || isResettingAll}
                          className="w-full py-3 rounded-xl bg-error text-on-error font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {isDeletingShifts || isDeletingInterventions || isResettingAll ? 'Eliminazione...' : 'Sì, procedi'}
                        </button>
                        <button 
                          onClick={() => setConfirmType(null)}
                          disabled={isDeletingShifts || isDeletingInterventions || isResettingAll}
                          className="w-full py-3 rounded-xl bg-surface-container-highest font-bold text-sm hover:bg-surface-bright transition-colors disabled:opacity-50"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {statusMessage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute inset-x-8 bottom-8 z-50"
                  >
                    <div className={cn(
                      "p-4 rounded-2xl flex items-center justify-between shadow-xl architectural-shadow",
                      statusMessage.type === 'success' ? "bg-primary text-on-primary" : "bg-error text-on-error"
                    )}>
                      <p className="text-sm font-bold">{statusMessage.text}</p>
                      <button 
                        onClick={() => setStatusMessage(null)}
                        className="p-1 rounded-full hover:bg-white/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-4 bg-surface-container-low text-center">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 font-bold">
                ID Utente: {user.uid}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
