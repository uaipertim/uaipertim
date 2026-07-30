import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc } from "firebase/firestore";
import { ORIGINAL_FIREBASE_CONFIG, ORIGINAL_FIRESTORE_DATABASE_ID } from "./src/config/environment.js";

async function run() {
  console.log("Connecting to Firestore database:", ORIGINAL_FIRESTORE_DATABASE_ID);
  const app = initializeApp(ORIGINAL_FIREBASE_CONFIG);
  const db = initializeFirestore(app, {}, ORIGINAL_FIRESTORE_DATABASE_ID);

  try {
    const docRef = doc(db, "establishments", "burger-do-gloria");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      console.log("Burger do Gloria document fields:");
      console.log(JSON.stringify(snap.data(), null, 2));
    } else {
      console.log("Burger do Gloria document does not exist in Firestore establishments collection.");
    }
  } catch (error) {
    console.error("Error querying Firestore:", error);
  }
}

run();
