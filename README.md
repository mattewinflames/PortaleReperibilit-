# Gestionale Reperibilità

Applicazione web per la gestione dei turni di reperibilità, degli interventi
e del calcolo delle relative spettanze.

**Stack:** React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Firebase (Auth + Firestore)

## Requisiti

- Node.js 20 o superiore
- Un progetto Firebase con Authentication (provider Google) e Firestore attivi

## Avvio locale

```bash
npm install
npm run dev
```

L'app è disponibile su http://localhost:3000

## Comandi

| Comando             | Descrizione                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Server di sviluppo con HMR                   |
| `npm run typecheck` | Controllo dei tipi (TypeScript strict)       |
| `npm run build`     | Typecheck + build di produzione in `dist/`   |
| `npm run preview`   | Anteprima locale della build di produzione   |

## Configurazione Firebase

I parametri del progetto stanno in `firebase-applet-config.json`. La `apiKey`
web di Firebase non è un segreto (identifica il progetto, non autorizza nulla):
la protezione reale è data dalle regole in `firestore.rules`, dalla lista dei
domini autorizzati in Firebase Console e, idealmente, da App Check.

Le regole e gli indici si pubblicano con:

```bash
firebase deploy --only firestore
```

Il database non è quello di default: `firebase.json` ne indica il nome
(`ai-studio-...`). In alternativa si incollano le regole dalla Console,
selezionando il database corretto dal menu a tendina.

### Amministratori

Non esistono email hardcoded. Un utente è amministratore se ha il custom claim
`admin: true`, oppure se esiste un documento (anche vuoto) in `/admins/{uid}`.
Quel documento si crea solo dalla Firebase Console o con l'Admin SDK: nessun
client può scriverlo.

### Test delle regole

```bash
npm install -D @firebase/rules-unit-testing tsx
firebase emulators:exec --only firestore "npx tsx tests/firestore.rules.test.ts"
```

## Struttura

```
src/
├── App.tsx              Stato globale, listener Firestore, mutazioni
├── firebase.ts          Inizializzazione SDK e gestione errori
├── types.ts             Modello dati
├── lib/
│   ├── hours.ts         Unica fonte di verità per il calcolo delle ore
│   ├── firestore-batch.ts  Scritture in batch oltre il limite di 500 op
│   └── utils.ts         Helper di presentazione
└── components/          Viste e componenti
```

## Modello di calcolo delle ore

Tutta la logica vive in `src/lib/hours.ts`. Due regole guidano il modello:

1. **Ore da calendario, non tempo reale.** Gli istanti sono costruiti con
   `Date.UTC()` sull'orario locale, così la notte del cambio ora legale non
   fa valere un turno 23 o 25 ore.
2. **Le ore si contano una volta sola.** Turni sovrapposti e interventi che
   ricadono dentro più turni vengono fusi prima del conteggio; le ore di
   intervento sono sottratte da quelle di reperibilità.

Le ore di intervento sono attribuite per intero al giorno in cui l'intervento
inizia, anche se scavalca la mezzanotte.
