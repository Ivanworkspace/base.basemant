# BASE Basement Club

Web app responsive per BASE Basement: landing page, membership con Firebase Authentication, profilo e ticket QR personali, back office admin, gestione locandine/eventi e scanner di ingresso. Lo stile riprende l’identità industriale della reference con grafica CSS, animazioni 3D e layout mobile.

Usa Node.js 22 o superiore per frontend e funzioni.

## Avvio locale

```sh
npm install
npm run dev
```

La configurazione web Firebase fornita è già collegata in `src/firebase.js`. In Firebase Console abilita **Authentication → Email/Password**, crea Firestore e abilita Storage. Distribuisci regole e funzioni:

```sh
npm --prefix functions install
npm run deploy:rules
npm run deploy:functions
```

## Deploy frontend su Vercel

Importa il repository GitHub in Vercel lasciando la root directory alla radice del repository. La configurazione in `vercel.json` imposta Vite, `npm run build`, la cartella `dist` e il fallback della SPA. Non servono variabili Vercel per la configurazione web Firebase già inclusa.

Vercel pubblica solo il frontend. Authentication, Firestore, Storage e le funzioni `publishEvent`/`redeemTicket` restano su Firebase: abilita i servizi, distribuisci `firestore.rules`, `storage.rules` e le Cloud Functions come sopra, poi aggiungi il dominio Vercel (per esempio `nome-progetto.vercel.app`) tra gli **Authorized domains** di Firebase Authentication. Le Cloud Functions sono nella regione `europe-west1` e richiedono il piano Firebase Blaze per il deployment.

Per pubblicare la web app su Firebase Hosting in alternativa a Vercel:

```sh
npm run build
npx firebase-tools deploy --only hosting
```

## Account admin iniziale

L’accesso al pannello è sulla rotta non linkata `/admin` (per esempio `https://tuo-dominio.vercel.app/admin`). Accedi con l’account Firebase `base@admin.com`: il client, le Cloud Functions e le regole riportate in `firestore.rules` e `storage.rules` riconoscono questa email oppure il custom claim `admin: true`. La password non è salvata nel frontend o nei file del progetto. Per assegnare anche il custom claim all’account già creato, genera una chiave di servizio Firebase per il progetto `codebasemant`, conservala fuori dal repository, poi avvia lo script da `functions/`:

```sh
GOOGLE_APPLICATION_CREDENTIALS="/percorso/privato/service-account.json" \
ADMIN_EMAIL="base@admin.com" \
ADMIN_PASSWORD="inserisci-la-password-admin" \
node scripts/set-admin.mjs
```

Lo script usa la password fornita al momento dell’esecuzione e assegna `admin: true`. Dopo l’operazione, fai logout/login: Firebase aggiorna il ruolo nel token al nuovo accesso. Non committare la chiave di servizio o un file `.env` con password.

## Flusso ticket

- La registrazione crea un profilo `member` legato all’UID Firebase.
- `publishEvent` è una Cloud Function protetta da custom claim admin. Pubblica l’evento e genera un ticket con codice casuale per ogni membro. Il ticket è associato a coppia evento/membro, così un retry non crea doppioni.
- Il QR personale del membro contiene solo il codice casuale del ticket; il documento è leggibile solo dal proprietario e dall’admin.
- `redeemTicket` verifica codice, evento e stato dentro una transazione Firestore. Il primo scan porta il ticket da `issued` a `used`; scansioni successive vengono rifiutate.
- Le regole Firestore negano scritture client a eventi e ticket. La generazione e la convalida avvengono lato server.

Lo scanner del browser richiede HTTPS e il permesso fotocamera. Per dispositivi che non supportano la scansione diretta, l’admin può inserire manualmente il codice riportato dal ticket.
