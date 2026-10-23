import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.env.ADMIN_EMAIL || 'base@admin.com';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 6) {
  console.error('Imposta ADMIN_PASSWORD nell’ambiente prima di avviare lo script.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: 'codebasemant' });
const auth = getAuth();
let user;
try {
  user = await auth.getUserByEmail(email);
  user = await auth.updateUser(user.uid, { password, emailVerified: true });
  console.log(`Password aggiornata per l’account esistente ${email}.`);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({ email, password, emailVerified: true, displayName: 'BASE Admin' });
  console.log(`Creato l’account amministratore ${email}.`);
}
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
console.log('Permessi amministratore assegnati. Esci e rientra nell’app per aggiornare il token.');
