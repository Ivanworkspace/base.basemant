import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// La configurazione web Firebase è pubblica: la protezione dei dati è affidata
// alle regole Firestore/Storage e ai custom claims, mai a questo oggetto.
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
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');
