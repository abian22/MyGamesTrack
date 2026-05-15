import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, 'firebase.json');

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
} else {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  credential = cert(serviceAccount);
}

initializeApp({ credential });

const db = getFirestore();
const auth = getAuth();
const messaging = getMessaging();

export { db, auth, messaging };
