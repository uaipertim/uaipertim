import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail,
  Auth
} from "firebase/auth";

import { FIREBASE_CONFIG, FIRESTORE_DATABASE_ID } from "../config/environment";

const firebaseConfig = FIREBASE_CONFIG;

const databaseId = FIRESTORE_DATABASE_ID;

let app;
let db;
let auth: Auth;
let isFirebaseConnected = false;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  
  // Connect to the specific databaseId provided
  db = getFirestore(app, databaseId);
  auth = getAuth(app);
  isFirebaseConnected = true;
  console.log("Firebase initialized successfully with database:", databaseId);
  console.log("FRONTEND_FIREBASE_DIAGNOSTIC", {
    apiKeyPrefixMascarado: firebaseConfig.apiKey.substring(0, 9) + "***",
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    appIdMascarado: firebaseConfig.appId.substring(0, 16) + "***"
  });
} catch (error) {
  console.error("Error initializing Firebase:", error);
}

export { 
  app, 
  db, 
  auth,
  databaseId,
  isFirebaseConnected,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
};
export default app;
