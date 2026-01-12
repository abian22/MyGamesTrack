// firebase.js
import 'dotenv/config';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';


// Inicializa una sola vez
initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();
const auth = getAuth();

export { db, auth }; // export named
