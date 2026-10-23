import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// La configurazione web Firebase è pubblica: la protezione dei dati è affidata
// alle regole Firestore (firestore.rules), mai a questo oggetto.
const firebaseConfig = {
  apiKey: 'AIzaSyAwTdJT2Fbm_KpGHP7B8SGCrgA4q2FChY8',
  authDomain: 'codebasemant.firebaseapp.com',
  projectId: 'codebasemant',
  storageBucket: 'codebasemant.firebasestorage.app',
  messagingSenderId: '748048430427',
  appId: '1:748048430427:web:ffb18d98a9494a877e567e',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// `npm run dev:emu` usa gli emulatori locali invece del progetto reale.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Deve coincidere con l'email in firestore.rules → isAdmin().
export const ADMIN_EMAIL = 'base@admin.com';
export const isAdminUser = (user) => user?.email?.toLowerCase() === ADMIN_EMAIL;
