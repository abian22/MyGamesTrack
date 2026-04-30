import 'dotenv/config';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

const serviceAccountFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : null;

initializeApp({
  credential: serviceAccountFromEnv ? cert(serviceAccountFromEnv) : applicationDefault(),
});

const db = getFirestore();
const auth = getAuth();
const messaging = getMessaging();

export { db, auth, messaging };
