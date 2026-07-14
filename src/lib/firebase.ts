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

const firebaseConfig = {
  apiKey: "AIzaSyDkLqmCTFFqaIsdj6RoU2QCwNiITBEsUTo",
  authDomain: "gen-lang-client-0673282457.firebaseapp.com",
  projectId: "gen-lang-client-0673282457",
  storageBucket: "gen-lang-client-0673282457.firebasestorage.app",
  messagingSenderId: "271251032954",
  appId: "1:271251032954:web:31afabc67be3533665e4c3"
};

const databaseId = "ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe";

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
