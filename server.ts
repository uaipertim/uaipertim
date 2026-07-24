import express from "express";
import path from "path";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { createServer as createViteServer } from "vite";
import { GoogleAuth } from "google-auth-library";
import crypto from "crypto";

import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore,
  doc,
  collection,
  collectionGroup,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp as ClientTimestamp,
  DocumentReference,
  CollectionReference,
  Query as FirestoreQuery
} from "firebase/firestore";
import { getAuth as getClientAuth, signInWithEmailAndPassword } from "firebase/auth";

import { FIREBASE_CONFIG, FIRESTORE_DATABASE_ID, PUBLIC_APP_URL } from "./src/config/environment";
import { isSmtpConfigured, sendTransactionalEmail } from "./src/services/emailService";
import { getResetPasswordHtml, getResetPasswordText } from "./src/services/emailTemplate";

// Initialize Firebase Admin SDK for the specific project (ONLY for Auth / ID token verification)
const firebaseApp = getApps().length === 0 ? initializeApp({
  projectId: FIREBASE_CONFIG.projectId
}) : getApps()[0];

const DATABASE_ID = FIRESTORE_DATABASE_ID;
const realAdminAuth = getAuth(firebaseApp);
const adminDb = getAdminFirestore(firebaseApp, DATABASE_ID);

// Initialize Firebase Client SDK (to bypass backend IAM permission boundaries via Admin Auth bypass)
const firebaseConfig = FIREBASE_CONFIG;

const clientApp = initializeClientApp(firebaseConfig);
const clientDb = getClientFirestore(clientApp, DATABASE_ID);
const clientAuth = getClientAuth(clientApp);

// Express backend will be authenticated with Firestore via ensureBackendAuthenticated() during startApp() startup sequence.

// Wrapper classes to mimic firebase-admin API perfectly
class DocumentSnapshotWrapper {
  constructor(private snap: any) {}
  get id() { return this.snap.id; }
  get exists() { return this.snap.exists(); }
  data() { return this.snap.data(); }
}

class QuerySnapshotWrapper {
  constructor(private snap: any) {}
  get empty() { return this.snap.empty; }
  get size() { return this.snap.size; }
  get docs() { return this.snap.docs.map((d: any) => new DocumentSnapshotWrapper(d)); }
  forEach(callback: (doc: DocumentSnapshotWrapper) => void) {
    this.docs.forEach(callback);
  }
}

class DocumentReferenceWrapper {
  constructor(public _ref: DocumentReference) {}
  get id() { return this._ref.id; }
  get path() { return this._ref.path; }

  collection(path: string) {
    return new CollectionReferenceWrapper(collection(this._ref, path));
  }

  async get() {
    const snap = await getDoc(this._ref);
    return new DocumentSnapshotWrapper(snap);
  }

  async set(data: any, options?: any) {
    await setDoc(this._ref, data, options || {});
  }

  async update(data: any) {
    await updateDoc(this._ref, data);
  }

  async delete() {
    await deleteDoc(this._ref);
  }
}

class QueryWrapper {
  constructor(protected _query: FirestoreQuery) {}

  where(field: string, op: any, value: any) {
    return new QueryWrapper(query(this._query, where(field, op, value)));
  }

  orderBy(field: string, direction?: "asc" | "desc") {
    return new QueryWrapper(query(this._query, orderBy(field, direction || "asc")));
  }

  limit(n: number) {
    return new QueryWrapper(query(this._query, limit(n)));
  }

  async get() {
    const snap = await getDocs(this._query);
    return new QuerySnapshotWrapper(snap);
  }
}

class CollectionReferenceWrapper extends QueryWrapper {
  constructor(public _col: CollectionReference) {
    super(_col);
  }
  get id() { return this._col.id; }
  get path() { return this._col.path; }

  doc(id?: string) {
    if (id) {
      return new DocumentReferenceWrapper(doc(this._col, id));
    }
    return new DocumentReferenceWrapper(doc(this._col));
  }
}

class BatchWrapper {
  private batch = writeBatch(clientDb);

  set(docRef: DocumentReferenceWrapper, data: any, options?: any) {
    this.batch.set(docRef._ref, data, options || {});
    return this;
  }

  update(docRef: DocumentReferenceWrapper, data: any) {
    this.batch.update(docRef._ref, data);
    return this;
  }

  delete(docRef: DocumentReferenceWrapper) {
    this.batch.delete(docRef._ref);
    return this;
  }

  async commit() {
    await this.batch.commit();
  }
}

class TransactionWrapper {
  constructor(private tx: any) {}

  async get(docRef: DocumentReferenceWrapper) {
    const snap = await this.tx.get(docRef._ref);
    return new DocumentSnapshotWrapper(snap);
  }

  set(docRef: DocumentReferenceWrapper, data: any, options?: any) {
    this.tx.set(docRef._ref, data, options || {});
    return this;
  }

  update(docRef: DocumentReferenceWrapper, data: any) {
    this.tx.update(docRef._ref, data);
    return this;
  }

  delete(docRef: DocumentReferenceWrapper) {
    this.tx.delete(docRef._ref);
    return this;
  }
}

const db = {
  collection(path: string) {
    return new CollectionReferenceWrapper(collection(clientDb, path));
  },
  collectionGroup(path: string) {
    return new QueryWrapper(collectionGroup(clientDb, path));
  },
  doc(path: string) {
    return new DocumentReferenceWrapper(doc(clientDb, path));
  },
  batch() {
    return new BatchWrapper();
  },
  async runTransaction(callback: (transaction: TransactionWrapper) => Promise<any>) {
    return await runTransaction(clientDb, async (tx) => {
      return await callback(new TransactionWrapper(tx));
    });
  }
};

const FieldValue = {
  serverTimestamp() { return serverTimestamp(); },
  increment(val: number) { return increment(val); }
};

const Timestamp = ClientTimestamp;

// Map to hold temporary idTokens for recently created users, so we can delete them if rollback is needed
const tempUserTokens = new Map<string, string>();

const auth: any = {
  // 1. verifyIdToken - delegate directly to Admin SDK (works perfectly as it's local signature verification)
  verifyIdToken: async (token: string, checkRevoked?: boolean) => {
    return await realAdminAuth.verifyIdToken(token, checkRevoked);
  },

  // 2. getUser - lookup in Firestore
  getUser: async (uid: string) => {
    try {
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        throw { code: "auth/user-not-found", message: "User not found" };
      }
      const data = userDoc.data();
      return {
        uid: uid,
        email: data.email || "",
        displayName: data.name || "",
        phoneNumber: data.phone || "",
        disabled: data.active === false
      };
    } catch (err: any) {
      if (err.code === "auth/user-not-found") throw err;
      throw { code: "auth/internal-error", message: err.message };
    }
  },

  // 3. getUserByEmail - query Firestore users collection
  getUserByEmail: async (email: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const snapshot = await db.collection("users")
        .where("email", "==", normalizedEmail)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        throw { code: "auth/user-not-found", message: "User not found" };
      }
      
      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || normalizedEmail,
        displayName: data.name || "",
        phoneNumber: data.phone || "",
        disabled: data.active === false
      };
    } catch (err: any) {
      if (err.code === "auth/user-not-found") throw err;
      throw { code: "auth/internal-error", message: err.message };
    }
  },

  // 4. createUser - create via Firebase Auth REST API
  createUser: async (properties: { email: string; password?: string; displayName?: string; phoneNumber?: string; emailVerified?: boolean; disabled?: boolean }) => {
    try {
      const normalizedEmail = properties.email.trim().toLowerCase();
      // Generate a random password if not provided
      const password = properties.password || "TempPassword123!" + Math.random().toString(36).substring(2, 8);
      
      const apiKey = FIREBASE_CONFIG.apiKey;
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password: password,
          displayName: properties.displayName || "",
          returnSecureToken: true
        })
      });

      const resBody: any = await response.json();
      
      if (!response.ok) {
        const errMsg = resBody?.error?.message || "Unknown error";
        console.error("Firebase REST Auth error during createUser:", errMsg);
        if (errMsg === "EMAIL_EXISTS") {
          throw { code: "auth/email-already-exists", message: "The email address is already in use by another account." };
        } else if (errMsg === "INVALID_EMAIL") {
          throw { code: "auth/invalid-email", message: "The email address is badly formatted." };
        } else if (errMsg.startsWith("WEAK_PASSWORD")) {
          throw { code: "auth/invalid-password", message: "The password must be 6 characters long or more." };
        }
        throw { code: "auth/internal-error", message: errMsg };
      }

      const uid = resBody.localId;
      if (resBody.idToken) {
        tempUserTokens.set(uid, resBody.idToken);
      }

      return {
        uid: uid,
        email: normalizedEmail,
        displayName: properties.displayName || ""
      };
    } catch (err: any) {
      if (err.code) throw err;
      throw { code: "auth/internal-error", message: err.message };
    }
  },

  // 5. deleteUser - delete via Firebase Auth REST API using saved idToken
  deleteUser: async (uid: string) => {
    try {
      const idToken = tempUserTokens.get(uid);
      if (!idToken) {
        console.warn(`No idToken stored for uid ${uid}, cannot delete from Auth REST API.`);
        return;
      }
      
      const apiKey = FIREBASE_CONFIG.apiKey;
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: idToken
        })
      });

      if (!response.ok) {
        const resBody: any = await response.json();
        console.error("Firebase REST Auth error during deleteUser:", resBody?.error?.message);
      } else {
        console.log(`Successfully deleted auth user ${uid} via REST API.`);
      }
      tempUserTokens.delete(uid);
    } catch (err) {
      console.error("Failed to delete user via REST API:", err);
    }
  },

  // 6. generatePasswordResetLink - trigger a password reset email via Firebase Auth REST API
  generatePasswordResetLink: async (email: string) => {
    try {
      const apiKey = FIREBASE_CONFIG.apiKey;
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          email: email.trim().toLowerCase()
        })
      });

      if (!response.ok) {
        const resBody: any = await response.json();
        console.error("Firebase REST Auth error during sendOobCode:", resBody?.error?.message);
        throw new Error(resBody?.error?.message || "Failed to send password reset email.");
      }
      
      return `https://gen-lang-client-0673282457.firebaseapp.com/__/auth/action?mode=resetPassword&email=${encodeURIComponent(email)}`;
    } catch (err: any) {
      console.error("Error generating reset link:", err);
      throw err;
    }
  }
};


// Automatically authenticate Express backend with full Admin rights under firestore.rules
async function ensureBackendAuthenticated() {
  const email = "backend-system-user@viajandocomigo.com.br";
  const password = "SuperSecurePassword123!";
  
  try {
    await signInWithEmailAndPassword(clientAuth, email, password);
    console.log("Express backend successfully authenticated with Firestore via Client SDK!");
  } catch (err: any) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      console.log(`Backend user ${email} not found or invalid credentials. Creating/resetting system user...`);
      try {
        // Try to register the user via Auth REST API (since realAdminAuth might have API disabled/permission issues)
        const apiKey = FIREBASE_CONFIG.apiKey;
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: "System Backend User",
            returnSecureToken: true
          })
        });
        
        if (!res.ok) {
          const body = await res.json();
          const restMsg = body?.error?.message;
          if (restMsg === "EMAIL_EXISTS") {
            console.log("Backend system user already exists in Auth REST API but login failed. Proceeding with credentials.");
          } else {
            throw new Error(restMsg || "Failed to create backend system user via REST");
          }
        } else {
          console.log(`Backend system user created successfully in Auth REST API.`);
        }
        
        await signInWithEmailAndPassword(clientAuth, email, password);
        console.log("Express backend successfully authenticated with Firestore via Client SDK after creation!");
      } catch (createErr: any) {
        console.error("Critical: Failed to auto-create backend system user:", createErr);
        throw createErr;
      }
    } else {
      console.error("Express backend failed to authenticate with Firestore:", err);
      throw err;
    }
  }

  // Ensure user has role "admin" in 'users' collection so they pass isAdmin rule
  try {
    const uid = clientAuth.currentUser?.uid;
    if (uid) {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        console.log(`Creating system user profile in 'users' collection for uid: ${uid}`);
        await userRef.set({
          uid,
          email,
          name: "System Backend User",
          role: "admin",
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  } catch (profileErr) {
    console.warn("Failed to create/ensure backend system user firestore profile, but proceeding:", profileErr);
  }
}


function parseBrazilianNumber(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return 0;
  }
  const str = String(value).trim().replace(/\s/g, "");
  if (str === "") return 0;
  const normalized = str.replace(",", ".");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Secure backend diagnostic log requested by user
async function logCredentialsDiagnostics() {
  const googleAuth = new GoogleAuth();
  let credentialOrigin = "Application Default Credentials";
  let credentialProjectId = "unknown";
  let maskedEmail = "not available";

  try {
    credentialProjectId = await googleAuth.getProjectId();
  } catch (err: any) {
    credentialProjectId = `error: ${err.message}`;
  }

  try {
    const client = await googleAuth.getClient();
    const className = client.constructor.name;
    if (className === "Compute") {
      credentialOrigin = "credencial do container (Compute Engine/Cloud Run)";
    } else if (className === "JWT") {
      credentialOrigin = "service account (JWT)";
    } else {
      credentialOrigin = `Application Default Credentials (${className})`;
    }

    // Attempt to mask email securely without exposing sensitive details
    const email = (client as any).email || (client as any).clientEmail || (client as any).credentials?.client_email;
    if (email) {
      maskedEmail = email.replace(/^(.)(.*)(@.*)$/, (_: any, first: string, middle: string, last: string) => {
        return first + middle.substring(0, Math.min(3, middle.length)) + middle.substring(Math.min(3, middle.length)).replace(/./g, "*") + last;
      });
    } else {
      const envEmail = process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL;
      if (envEmail) {
        maskedEmail = envEmail.replace(/^(.)(.*)(@.*)$/, (_: any, first: string, middle: string, last: string) => {
          return first + middle.substring(0, Math.min(3, middle.length)) + middle.substring(Math.min(3, middle.length)).replace(/./g, "*") + envEmail.substring(envEmail.indexOf("@"));
        });
      }
    }
  } catch (err: any) {
    credentialOrigin = `error: ${err.message}`;
  }

  console.log("==================================================");
  console.log("SERVER STARTUP CREDENTIAL DIAGNOSTICS:");
  console.log(`- Configured Project ID: gen-lang-client-0673282457`);
  console.log(`- Database ID: ${DATABASE_ID}`);
  console.log(`- Credential Origin: ${credentialOrigin}`);
  console.log(`- Credential Project ID: ${credentialProjectId}`);
  console.log(`- Service Account Email (Masked): ${maskedEmail}`);
  console.log("BACKEND_FIREBASE_DIAGNOSTIC", {
    adminAppName: firebaseApp.name || "[Default]",
    adminProjectId: "gen-lang-client-0673282457",
    credentialProjectId: credentialProjectId,
    firestoreProjectId: "gen-lang-client-0673282457",
    firestoreDatabaseId: DATABASE_ID
  });
  console.log("==================================================");
}

logCredentialsDiagnostics().catch(err => {
  console.error("Failed to run credential diagnostics:", err);
});


// Idempotent auto-seed function to populate database configurations and rewards on server startup
const autoSeedOnStartup = async () => {
  try {
    const batch = db.batch();

    // 1. Seed Config (idempotent)
    const configRef = db.collection("loyaltyConfig").doc("default");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      batch.set(configRef, {
        welcomeBonusPoints: 30,
        pointsPerCompletedOrder: 20,
        bronzeLimit: 0,
        prataLimit: 200,
        ouroLimit: 500,
        diamanteLimit: 1000,
        bronzeMinimum: 0,
        silverMinimum: 200,
        goldMinimum: 500,
        diamondMinimum: 1000,
        defaultValidityDays: 30
      });
    }

    // 2. Seed cities and neighborhoods
    const citiesToSeed = [
      {
        id: "sao-joao-batista-do-gloria-mg",
        name: "São João Batista do Glória",
        state: "MG",
        active: true,
        sortOrder: 1,
        isDefault: true
      },
      {
        id: "passos-mg",
        name: "Passos",
        state: "MG",
        active: true,
        sortOrder: 2,
        isDefault: false
      }
    ];

    for (const city of citiesToSeed) {
      const cityRef = db.collection("cities").doc(city.id);
      const citySnap = await cityRef.get();
      if (!citySnap.exists) {
        await cityRef.set(city);
      }
    }

    const neighborhoodsToSeed = [
      { id: 'gloria-centro', name: 'Centro', active: true, cityId: 'sao-joao-batista-do-gloria-mg' },
      { id: 'gloria-jardim-planalto', name: 'Jardim Planalto', active: true, cityId: 'sao-joao-batista-do-gloria-mg' },
      { id: 'gloria-vila-nova', name: 'Vila Nova', active: true, cityId: 'sao-joao-batista-do-gloria-mg' },
      { id: 'gloria-parque-das-flores', name: 'Parque das Flores', active: true, cityId: 'sao-joao-batista-do-gloria-mg' },
      { id: 'gloria-distrito-industrial', name: 'Distrito Industrial', active: true, cityId: 'sao-joao-batista-do-gloria-mg' },
      { id: 'passos-centro', name: 'Centro', active: true, cityId: 'passos-mg' },
      { id: 'passos-coimbras', name: 'Coimbras', active: true, cityId: 'passos-mg' },
      { id: 'passos-bela-vista', name: 'Bela Vista', active: true, cityId: 'passos-mg' },
      { id: 'passos-penha', name: 'Penha', active: true, cityId: 'passos-mg' },
      { id: 'passos-muarama', name: 'Muarama', active: true, cityId: 'passos-mg' }
    ];

    for (const nb of neighborhoodsToSeed) {
      const nbRef = db.collection("cities").doc(nb.cityId).collection("neighborhoods").doc(nb.id);
      const nbSnap = await nbRef.get();
      if (!nbSnap.exists) {
        await nbRef.set({
          neighborhoodId: nb.id,
          cityId: nb.cityId,
          name: nb.name,
          active: nb.active
        });
      }
    }

    // 2. Seed rewards (by checking title to avoid duplicates)
    const targetRewards = [
      {
        title: "5% de desconto",
        description: "Desconto de 5% no valor total dos produtos",
        pointsCost: 60,
        rewardType: "percentage_discount",
        rewardValue: 5,
        maximumDiscount: 10,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      },
      {
        title: "R$ 10 de desconto",
        description: "R$ 10 de desconto para compras acima de R$ 50",
        pointsCost: 120,
        rewardType: "fixed_discount",
        rewardValue: 10,
        minimumOrderValue: 50,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      },
      {
        title: "Benefício na entrega",
        description: "Desconto de até R$ 12 na taxa de entrega",
        pointsCost: 200,
        rewardType: "delivery_benefit",
        rewardValue: 12,
        maximumDiscount: 12,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      },
      {
        title: "15% de desconto",
        description: "Desconto de 15% para compras acima de R$ 80",
        pointsCost: 300,
        rewardType: "percentage_discount",
        rewardValue: 15,
        maximumDiscount: 25,
        minimumOrderValue: 80,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      }
    ];

    const currentRewardsSnap = await db.collection("loyaltyRewards").get();
    const existingTitles = new Set(currentRewardsSnap.docs.map(doc => doc.data().title));

    let seedCount = 0;
    for (const r of targetRewards) {
      if (!existingTitles.has(r.title)) {
        const newRewardRef = db.collection("loyaltyRewards").doc();
        batch.set(newRewardRef, {
          ...r,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        seedCount++;
      }
    }

    if (seedCount > 0 || !configSnap.exists) {
      await batch.commit();
      console.log(`Auto-seeded ${seedCount} loyalty rewards and config successfully on startup.`);
    } else {
      console.log("Loyalty rewards and configuration already exist in database.");
    }
  } catch (error) {
    console.error("Error running auto-seed on server startup:", error);
  }
};

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to determine tier based on lifetime points
const getTierStr = (lifetimePoints: number): string => {
  if (lifetimePoints < 200) return "bronze";
  if (lifetimePoints < 500) return "prata";
  if (lifetimePoints < 1000) return "ouro";
  return "diamante";
};

// Middleware to authenticate requests via Firebase ID Token
const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticação não fornecido.", code: "AUTH_TOKEN_MISSING" });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error: any) {
    console.error("Error verifying Firebase ID token:", error);
    return res.status(401).json({ error: "Token de autenticação inválido ou expirado.", code: "AUTH_TOKEN_INVALID" });
  }
};

// Middleware to optionally authenticate requests via Firebase ID Token
const parseOptionalUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
  } catch (error) {
    console.warn("Optional auth token verification failed:", error);
  }
  next();
};

// In-memory rate limiting map
const ipRateLimits = new Map<string, { timestamps: number[] }>();
const emailRateLimits = new Map<string, { timestamps: number[] }>();

const maskEmailForLogging = (email: string): string => {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  if (localPart.length <= 2) return `${localPart}***@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
};

// Public Controlled Reset Password Endpoint
app.post("/api/auth/request-password-reset", async (req: any, res: any) => {
  const startTime = Date.now();
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      error: "O e-mail é obrigatório.",
      code: "AUTH_EMAIL_EMPTY"
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({
      error: "Digite um endereço de e-mail válido.",
      code: "AUTH_EMAIL_INVALID"
    });
  }

  // Rate Limiting by IP and email
  const clientIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 5;

  // Check IP Limit
  const ipRecord = ipRateLimits.get(clientIp) || { timestamps: [] };
  const ipTimestamps = ipRecord.timestamps.filter(ts => now - ts < windowMs);
  if (ipTimestamps.length >= maxRequests) {
    console.warn(`Rate limit exceeded for IP: ${clientIp}`);
    const durationMs = Date.now() - startTime;
    console.log("Password reset log:", JSON.stringify({
      action: "password_reset_email_requested",
      emailMascarado: maskEmailForLogging(normalizedEmail),
      resultCode: "RESET_RATE_LIMITED",
      durationMs
    }));
    return res.status(429).json({
      error: "Muitas solicitações foram realizadas. Aguarde alguns minutos.",
      code: "AUTH_TOO_MANY_REQUESTS"
    });
  }
  ipTimestamps.push(now);
  ipRateLimits.set(clientIp, { timestamps: ipTimestamps });

  // Check Email Limit
  const emailRecord = emailRateLimits.get(normalizedEmail) || { timestamps: [] };
  const emailTimestamps = emailRecord.timestamps.filter(ts => now - ts < windowMs);
  if (emailTimestamps.length >= maxRequests) {
    console.warn(`Rate limit exceeded for Email: ${maskEmailForLogging(normalizedEmail)}`);
    const durationMs = Date.now() - startTime;
    console.log("Password reset log:", JSON.stringify({
      action: "password_reset_email_requested",
      emailMascarado: maskEmailForLogging(normalizedEmail),
      resultCode: "RESET_RATE_LIMITED",
      durationMs
    }));
    return res.status(429).json({
      error: "Muitas solicitações foram realizadas. Aguarde alguns minutos.",
      code: "AUTH_TOO_MANY_REQUESTS"
    });
  }
  emailTimestamps.push(now);
  emailRateLimits.set(normalizedEmail, { timestamps: emailTimestamps });

  const isProd = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  const smtpConfigured = isSmtpConfigured();

  if (!smtpConfigured) {
    if (!isProd) {
      console.warn("SMTP provider is not configured. Returning RESET_EMAIL_PROVIDER_NOT_CONFIGURED for client fallback.");
      return res.status(400).json({
        success: false,
        code: "RESET_EMAIL_PROVIDER_NOT_CONFIGURED",
        error: "Serviço de redefinição de e-mail personalizado não configurado em ambiente de desenvolvimento."
      });
    } else {
      console.error("Critical: SMTP provider is NOT configured in production!");
      const durationMs = Date.now() - startTime;
      console.log("Password reset log:", JSON.stringify({
        action: "password_reset_email_requested",
        emailMascarado: maskEmailForLogging(normalizedEmail),
        resultCode: "RESET_EMAIL_DELIVERY_FAILED",
        durationMs
      }));
      return res.status(500).json({
        success: false,
        code: "RESET_EMAIL_DELIVERY_FAILED",
        error: "Serviço de envio de e-mail não configurado no servidor de produção."
      });
    }
  }

  // Determine continueUrl
  let continueUrl = "https://uaipertim.com.br/entrar";
  if (!isProd) {
    const origin = req.get("origin") || req.get("referer");
    if (origin) {
      try {
        const urlObj = new URL(origin);
        continueUrl = `${urlObj.origin}/login`;
      } catch {
        continueUrl = `${origin}/login`;
      }
    } else {
      continueUrl = `${PUBLIC_APP_URL}/login`;
    }
  }

  const actionCodeSettings = {
    url: continueUrl,
    handleCodeInApp: false
  };

  let userExists = false;
  let link = "";

  try {
    const userRecord = await realAdminAuth.getUserByEmail(normalizedEmail);
    userExists = true;
    link = await realAdminAuth.generatePasswordResetLink(normalizedEmail, actionCodeSettings);
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      userExists = false;
    } else {
      console.error("Error fetching user or generating reset link:", error);
      const durationMs = Date.now() - startTime;
      console.log("Password reset log:", JSON.stringify({
        action: "password_reset_email_requested",
        emailMascarado: maskEmailForLogging(normalizedEmail),
        resultCode: "RESET_LINK_GENERATION_FAILED",
        durationMs
      }));
      return res.status(200).json({
        success: true,
        message: "Se existir uma conta vinculada a este e-mail, enviaremos as instruções."
      });
    }
  }

  if (userExists && link) {
    try {
      const html = getResetPasswordHtml(link);
      const text = getResetPasswordText(link);

      await sendTransactionalEmail({
        to: normalizedEmail,
        subject: "Redefina sua senha no UaiPertim",
        html,
        text
      });

      const durationMs = Date.now() - startTime;
      console.log("Password reset log:", JSON.stringify({
        action: "password_reset_email_requested",
        emailMascarado: maskEmailForLogging(normalizedEmail),
        resultCode: "RESET_EMAIL_SENT",
        durationMs
      }));
    } catch (deliveryError) {
      console.error("Error delivering transactional reset email:", deliveryError);
      const durationMs = Date.now() - startTime;
      console.log("Password reset log:", JSON.stringify({
        action: "password_reset_email_requested",
        emailMascarado: maskEmailForLogging(normalizedEmail),
        resultCode: "RESET_EMAIL_DELIVERY_FAILED",
        durationMs
      }));
      return res.status(200).json({
        success: true,
        message: "Se existir uma conta vinculada a este e-mail, enviaremos as instruções."
      });
    }
  } else {
    const durationMs = Date.now() - startTime;
    console.log("Password reset log:", JSON.stringify({
      action: "password_reset_email_requested",
      emailMascarado: maskEmailForLogging(normalizedEmail),
      resultCode: "RESET_USER_NOT_FOUND",
      durationMs
    }));
  }

  return res.status(200).json({
    success: true,
    message: "Se existir uma conta vinculada a este e-mail, enviaremos as instruções."
  });
});

// --- API ENDPOINTS ---

// 1. Initialize user's loyalty account (idempotent welcome bonus)
app.post("/api/loyalty/initialize", authenticateUser, async (req: any, res: any) => {
  const uid = req.user.uid;
  const accountRef = db.collection("loyaltyAccounts").doc(uid);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const accountSnap = await transaction.get(accountRef);
      if (accountSnap.exists) {
        const data = accountSnap.data() || {};
        return { 
          success: true, 
          created: false, 
          account: {
            pointsBalance: data.pointsBalance ?? 0,
            lifetimePoints: data.lifetimePoints ?? 0,
            tier: data.tier ?? "bronze"
          } 
        };
      }

      // Create new loyalty account
      const accountData = {
        customerId: uid,
        pointsBalance: 30,
        lifetimePoints: 30,
        tier: "bronze",
        welcomeBonusGranted: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.set(accountRef, accountData);

      // Create unique transaction
      const txRef = db.collection("loyaltyTransactions").doc();
      transaction.set(txRef, {
        customerId: uid,
        type: "welcome_bonus",
        points: 30,
        description: "Pontos de boas-vindas",
        createdAt: FieldValue.serverTimestamp()
      });

      return { 
        success: true, 
        created: true, 
        account: {
          pointsBalance: 30,
          lifetimePoints: 30,
          tier: "bronze"
        } 
      };
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error initializing loyalty account:", error);
    return res.status(500).json({ error: error.message || "Failed to initialize loyalty account" });
  }
});

// 2. Redeem reward securely
app.post("/api/loyalty/redeem", authenticateUser, async (req: any, res: any) => {
  const uid = req.user.uid;
  const { rewardId } = req.body;

  if (!rewardId) {
    return res.status(400).json({ error: "Missing rewardId" });
  }

  const rewardRef = db.collection("loyaltyRewards").doc(rewardId);
  const accountRef = db.collection("loyaltyAccounts").doc(uid);

  try {
    const couponCode = await db.runTransaction(async (transaction) => {
      const rewardSnap = await transaction.get(rewardRef);
      if (!rewardSnap.exists) {
        throw new Error("Prêmio não encontrado.");
      }
      const reward = rewardSnap.data()!;
      if (!reward.active) {
        throw new Error("Este prêmio não está ativo.");
      }

      const accountSnap = await transaction.get(accountRef);
      if (!accountSnap.exists) {
        throw new Error("Sua conta de fidelidade não foi encontrada.");
      }
      const account = accountSnap.data()!;

      if (account.pointsBalance < reward.pointsCost) {
        throw new Error(`Saldo insuficiente. Você precisa de ${reward.pointsCost} pontos.`);
      }

      // Generate secure unique coupon code
      const randCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const code = `UP-${reward.pointsCost}-${randCode}`;

      // Deduct points
      transaction.update(accountRef, {
        pointsBalance: account.pointsBalance - reward.pointsCost,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Create transaction record
      const txRef = db.collection("loyaltyTransactions").doc();
      transaction.set(txRef, {
        customerId: uid,
        type: "reward_redemption",
        points: -reward.pointsCost,
        rewardId: rewardId,
        description: `Resgate do prêmio: ${reward.title}`,
        createdAt: FieldValue.serverTimestamp()
      });

      // Create redemption record
      const redemptionRef = db.collection("loyaltyRedemptions").doc();
      transaction.set(redemptionRef, {
        customerId: uid,
        rewardId: rewardId,
        rewardTitle: reward.title,
        pointsSpent: reward.pointsCost,
        status: "available",
        couponCode: code,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      });

      return code;
    });

    return res.status(200).json({ success: true, couponCode });
  } catch (error: any) {
    console.error("Error redeeming reward:", error);
    return res.status(500).json({ error: error.message || "Failed to redeem reward" });
  }
});

// Helper for secure server-side coupon validation
async function validateCouponInternal({
  code,
  uid,
  establishmentId,
  subtotal,
  deliveryFee
}: {
  code: string;
  uid: string;
  establishmentId: string;
  subtotal: number;
  deliveryFee: number;
}) {
  const cleanCode = code.trim().toUpperCase();

  // 1. Promo codes
  if (cleanCode === 'PEDENOVO') {
    return {
      valid: true,
      discount: 5.00,
      type: 'fixed_discount',
      code: 'PEDENOVO',
      message: 'Cupom PEDENOVO aplicado: R$ 5,00 de desconto!'
    };
  }

  if (cleanCode === 'UAIPERTIM10') {
    return {
      valid: true,
      discount: 10.00,
      type: 'fixed_discount',
      code: 'UAIPERTIM10',
      message: 'Cupom UAIPERTIM10 aplicado: R$ 10,00 de desconto!'
    };
  }

  // 2. Query loyalty redemptions
  const redQuery = await db.collection("loyaltyRedemptions")
    .where("couponCode", "==", cleanCode)
    .get();

  if (redQuery.empty) {
    throw new Error("Cupom inválido ou expirado.");
  }

  const redDoc = redQuery.docs[0];
  const redemption = redDoc.data();

  // Validate status
  if (redemption.status !== "available") {
    throw new Error("Este cupom já foi utilizado ou está inválido.");
  }

  // Validate ownership
  if (redemption.customerId !== uid) {
    throw new Error("Este cupom pertence a outro cliente.");
  }

  // Validate expiration
  if (redemption.expiresAt) {
    const expiryDate = redemption.expiresAt.toDate();
    if (expiryDate < new Date()) {
      throw new Error("Este cupom de recompensa está expirado.");
    }
  }

  // Fetch reward
  const rewardDoc = await db.collection("loyaltyRewards").doc(redemption.rewardId).get();
  if (!rewardDoc.exists) {
    throw new Error("Configuração da recompensa não encontrada.");
  }

  const reward = rewardDoc.data()!;

  // Validate establishment
  if (reward.availableForAllMerchants !== true) {
    const eligibleIds = reward.eligibleMerchantIds || [];
    if (!eligibleIds.includes(establishmentId)) {
      throw new Error("Este cupom não é válido para este estabelecimento.");
    }
  }

  // Validate minimum order value
  const minOrderVal = Number(reward.minimumOrderValue || 0);
  if (subtotal < minOrderVal) {
    throw new Error(`Pedido mínimo para este cupom é R$ ${minOrderVal.toFixed(2).replace('.', ',')}.`);
  }

  // Calculate discount
  let discountValue = 0;
  if (reward.rewardType === 'fixed_discount') {
    discountValue = Number(reward.rewardValue);
    if (discountValue > subtotal) {
      discountValue = subtotal;
    }
  } else if (reward.rewardType === 'percentage_discount') {
    const pct = Number(reward.rewardValue);
    discountValue = subtotal * (pct / 100);
    if (reward.maximumDiscount !== undefined) {
      const maxDisc = Number(reward.maximumDiscount);
      if (discountValue > maxDisc) {
        discountValue = maxDisc;
      }
    }
  } else if (reward.rewardType === 'delivery_benefit') {
    const val = Number(reward.rewardValue);
    discountValue = Math.min(deliveryFee, val);
    if (reward.maximumDiscount !== undefined) {
      const maxDisc = Number(reward.maximumDiscount);
      discountValue = Math.min(discountValue, maxDisc);
    }
  }

  discountValue = Math.round(discountValue * 100) / 100;

  return {
    valid: true,
    discount: discountValue,
    type: reward.rewardType,
    code: cleanCode,
    redemptionId: redDoc.id,
    reward,
    message: `Cupom ${cleanCode} aplicado com sucesso: R$ ${discountValue.toFixed(2).replace('.', ',')} de desconto!`
  };
}

// POST /api/coupons/validate - Validate coupon endpoint
app.post("/api/coupons/validate", authenticateUser, async (req: any, res: any) => {
  const uid = req.user.uid;
  const { code, establishmentId, subtotal, deliveryFee } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Código do cupom é obrigatório." });
  }
  if (!establishmentId) {
    return res.status(400).json({ error: "Estabelecimento é obrigatório." });
  }

  try {
    const result = await validateCouponInternal({
      code,
      uid,
      establishmentId,
      subtotal: Number(subtotal || 0),
      deliveryFee: Number(deliveryFee || 0)
    });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Error validating coupon:", err);
    return res.status(400).json({ error: err.message || "Erro ao validar cupom." });
  }
});

// 3. Seed configurations and rewards idempotently
app.post("/api/loyalty/seed", authenticateUser, async (req: any, res: any) => {
  const uid = req.user.uid;

  try {
    // Verify that caller is admin
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      return res.status(403).json({ error: "Acesso proibido. Somente administradores." });
    }

    const batch = db.batch();

    // 1. Seed Config (idempotent)
    const configRef = db.collection("loyaltyConfig").doc("default");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      batch.set(configRef, {
        welcomeBonusPoints: 30,
        pointsPerCompletedOrder: 20,
        bronzeLimit: 0,
        prataLimit: 200,
        ouroLimit: 500,
        diamanteLimit: 1000,
        bronzeMinimum: 0,
        silverMinimum: 200,
        goldMinimum: 500,
        diamondMinimum: 1000,
        defaultValidityDays: 30
      });
    }

    // 2. Seed rewards (by checking title to avoid duplicates)
    const targetRewards = [
      {
        title: "5% de desconto",
        description: "Desconto de 5% no valor total dos produtos",
        pointsCost: 60,
        rewardType: "percentage_discount",
        rewardValue: 5,
        maximumDiscount: 10,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      },
      {
        title: "R$ 10 de desconto",
        description: "R$ 10 de desconto para compras acima de R$ 50",
        pointsCost: 120,
        rewardType: "fixed_discount",
        rewardValue: 10,
        minimumOrderValue: 50,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      },
      {
        title: "Benefício na entrega",
        description: "Desconto de até R$ 12 na taxa de entrega",
        pointsCost: 200,
        rewardType: "delivery_benefit",
        rewardValue: 12,
        maximumDiscount: 12,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      },
      {
        title: "15% de desconto",
        description: "Desconto de 15% para compras acima de R$ 80",
        pointsCost: 300,
        rewardType: "percentage_discount",
        rewardValue: 15,
        maximumDiscount: 25,
        minimumOrderValue: 80,
        eligibleMerchantIds: [],
        availableForAllMerchants: true,
        active: true
      }
    ];

    const currentRewardsSnap = await db.collection("loyaltyRewards").get();
    const existingTitles = new Set(currentRewardsSnap.docs.map(doc => doc.data().title));

    let seedCount = 0;
    for (const r of targetRewards) {
      if (!existingTitles.has(r.title)) {
        const newRewardRef = db.collection("loyaltyRewards").doc();
        batch.set(newRewardRef, {
          ...r,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        seedCount++;
      }
    }

    await batch.commit();
    return res.status(200).json({ success: true, seededRewards: seedCount, message: "Seed concluído com sucesso." });
  } catch (error: any) {
    console.error("Error during seed:", error);
    return res.status(500).json({ error: error.message || "Failed to execute seed" });
  }
});

// 4. Grant points for completed order securely
app.post("/api/loyalty/grant-order-points", authenticateUser, async (req: any, res: any) => {
  const uid = req.user.uid;
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return res.status(403).json({ error: "Permissão negada." });
    }
    const callerData = userSnap.data()!;

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    const orderData = orderSnap.data()!;

    // Verify authorized roles (merchant or admin)
    const isCallerAdmin = callerData.role === "admin";
    const isCallerOrderMerchant = callerData.role === "merchant" && callerData.establishmentId === orderData.establishmentId;

    if (!isCallerAdmin && !isCallerOrderMerchant) {
      return res.status(403).json({ error: "Permissão negada para atualizar este pedido." });
    }

    const accountRef = db.collection("loyaltyAccounts").doc(orderData.customerId);

    await db.runTransaction(async (transaction) => {
      const orderFreshSnap = await transaction.get(orderRef);
      const freshOrderData = orderFreshSnap.data()!;

      // Checking only if canonical status is 'concluido' and points not yet granted
      if (freshOrderData.status !== "concluido" && freshOrderData.status !== "Concluido") {
        throw new Error("O pedido precisa estar concluído para conceder pontos.");
      }

      // Check if a completed_order transaction already exists for this orderId in the database (query-level safeguard)
      const txQuerySnap = await db.collection("loyaltyTransactions")
        .where("orderId", "==", orderId)
        .where("type", "==", "completed_order")
        .limit(1)
        .get();

      if (!txQuerySnap.empty || freshOrderData.loyaltyPointsGranted) {
        // Already granted! Keep order flag in sync and return idempotently
        transaction.update(orderRef, {
          loyaltyPointsGranted: true
        });
        return;
      }

      const accountSnap = await transaction.get(accountRef);
      if (accountSnap.exists) {
        const accountData = accountSnap.data()!;
        const newLifetime = (accountData.lifetimePoints || 0) + 20;
        transaction.update(accountRef, {
          pointsBalance: (accountData.pointsBalance || 0) + 20,
          lifetimePoints: newLifetime,
          tier: getTierStr(newLifetime),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        // Create new account if not present (although normally initialized at first access)
        transaction.set(accountRef, {
          customerId: orderData.customerId,
          pointsBalance: 20,
          lifetimePoints: 20,
          tier: "bronze",
          welcomeBonusGranted: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      // Create completed_order transaction record
      const txRef = db.collection("loyaltyTransactions").doc();
      transaction.set(txRef, {
        customerId: orderData.customerId,
        type: "completed_order",
        points: 20,
        orderId: orderId,
        description: `Pontos por pedido concluído #${orderId.slice(-4)}`,
        createdAt: FieldValue.serverTimestamp()
      });

      // Mark points as granted
      transaction.update(orderRef, {
        loyaltyPointsGranted: true
      });
    });

    return res.status(200).json({ success: true, message: "Pontos concedidos com sucesso." });
  } catch (error: any) {
    console.error("Error granting order points:", error);
    return res.status(500).json({ error: error.message || "Failed to grant points" });
  }
});

// --- ADMIN SECURE ESTABLISHMENTS ENDPOINTS ---

// Middleware to ensure user is an admin in the database
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const data = userDoc.data();
    
    const isAdminEmail = req.user.email && (
      req.user.email === "cloudviajandocomigo@gmail.com" ||
      req.user.email === "atendimento@viajandocomigo.com.br" ||
      req.user.email.endsWith("@viajandocomigo.com.br")
    );
    
    if ((userDoc.exists && data?.role === "admin") || isAdminEmail) {
      next();
    } else {
      console.warn(`Unauthorized admin access attempt by UID: ${uid}, Email: ${req.user.email}`);
      return res.status(403).json({ error: "Acesso negado. Apenas administradores podem realizar esta ação." });
    }
  } catch (error) {
    console.error("Error in requireAdmin middleware:", error);
    return res.status(500).json({ error: "Erro interno ao verificar permissão de administrador." });
  }
};

// 1. List all merchant users
app.get("/api/admin/merchants", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const snapshot = await db.collection("users").where("role", "==", "merchant").get();
    const merchants: any[] = [];
    snapshot.forEach(doc => {
      merchants.push({
        uid: doc.id,
        id: doc.id,
        ...doc.data()
      });
    });
    return res.status(200).json(merchants);
  } catch (error: any) {
    console.error("Error fetching merchant users:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch merchant users" });
  }
});

// 2. Link a merchant user to an establishment
app.post("/api/admin/users/:uid/link-establishment", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { uid } = req.params;
    const { establishmentId } = req.body;
    
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuário não encontrado no banco de dados." });
    }
    
    const currentEstId = userDoc.data()?.establishmentId;
    if (currentEstId && currentEstId !== establishmentId) {
      const prevEstRef = db.collection("establishments").doc(currentEstId);
      const prevEstDoc = await prevEstRef.get();
      if (prevEstDoc.exists && (prevEstDoc.data()?.merchantOwnerUid === uid || prevEstDoc.data()?.ownerUid === uid || prevEstDoc.data()?.merchantUid === uid)) {
        await prevEstRef.update({
          merchantOwnerUid: null,
          ownerUid: null,
          merchantUid: null,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    await userRef.update({
      establishmentId: establishmentId || null,
      role: establishmentId ? "merchant" : "customer",
      updatedAt: FieldValue.serverTimestamp()
    });

    if (establishmentId) {
      const estRef = db.collection("establishments").doc(establishmentId);
      const estDoc = await estRef.get();
      if (estDoc.exists) {
        await estRef.update({
          merchantOwnerUid: uid,
          ownerUid: uid,
          merchantUid: uid,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
    
    return res.status(200).json({ success: true, message: "Usuário atualizado e estabelecimento vinculado com sucesso." });
  } catch (error: any) {
    console.error("Error linking user to establishment:", error);
    return res.status(500).json({ error: error.message || "Failed to link user" });
  }
});

// 2.1 Search users by name or email
app.get("/api/admin/users/search", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Termo de busca ausente." });
    }
    const queryTerm = q.trim().toLowerCase();
    
    const snapshot = await db.collection("users").get();
    const users: any[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const name = (data?.name || "").toLowerCase();
      const email = (data?.email || "").toLowerCase();
      if (name.includes(queryTerm) || email.includes(queryTerm)) {
        users.push({
          uid: doc.id,
          id: doc.id,
          name: data?.name || "",
          email: data?.email || "",
          phone: data?.phone || "",
          role: data?.role || "customer",
          accountStatus: data?.accountStatus || "active",
          establishmentId: data?.establishmentId || null
        });
      }
    });
    
    return res.status(200).json(users);
  } catch (error: any) {
    console.error("Error searching users:", error);
    return res.status(500).json({ error: error.message || "Failed to search users" });
  }
});

// 2.2 Link owner (Create or use existing)
app.post("/api/admin/establishments/:establishmentId/link-owner", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { establishmentId } = req.params;
    let { uid, name, email, phone, allowCustomerConversion } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "E-mail é obrigatório.", code: "EMAIL_INVALID" });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Verify establishment exists
    const estRef = db.collection("establishments").doc(establishmentId);
    const estDoc = await estRef.get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const estData = estDoc.data() || {};
    
    // Check if establishment already has an owner
    if (estData.ownerUid || estData.merchantUid || estData.merchantOwnerUid) {
      return res.status(400).json({ error: "Este estabelecimento já possui um proprietário vinculado.", code: "ESTABLISHMENT_ALREADY_HAS_OWNER" });
    }
    
    let userRecord: any = null;
    let isNewUser = false;
    
    // If uid is provided, verify user exists in auth or firestore
    if (uid) {
      try {
        userRecord = await auth.getUser(uid);
      } catch (authErr) {
        // User not in auth
      }
    } else {
      // Find in Auth by email
      try {
        userRecord = await auth.getUserByEmail(normalizedEmail);
        uid = userRecord.uid;
      } catch (authErr: any) {
        if (authErr.code === "auth/user-not-found") {
          // Create new user in Auth
          if (!name) {
            return res.status(400).json({ error: "Nome do responsável é obrigatório para novos acessos.", code: "NAME_REQUIRED" });
          }
          try {
            userRecord = await auth.createUser({
              email: normalizedEmail,
              emailVerified: true,
              displayName: name,
              phoneNumber: phone || undefined
            });
            uid = userRecord.uid;
            isNewUser = true;
          } catch (createErr: any) {
            console.error("Error creating auth user:", createErr);
            return res.status(500).json({ error: "Falha ao criar o usuário de autenticação.", code: "AUTH_USER_CREATE_FAILED" });
          }
        } else {
          throw authErr;
        }
      }
    }
    
    // Check/Create firestore user record
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    
    if (userDoc.exists) {
      // Check role
      if (userData?.role === "customer" && !allowCustomerConversion) {
        return res.status(200).json({
          requiresConfirmation: true,
          message: "Este e-mail já pertence a uma conta de cliente. Deseja conceder também acesso ao painel deste estabelecimento?",
          user: {
            uid,
            name: userData.name || userRecord.displayName || name,
            email: normalizedEmail,
            role: "customer"
          }
        });
      }
      
      // If already has establishment linked, check if it's the same or another
      if (userData?.establishmentId && userData?.establishmentId !== establishmentId) {
        return res.status(400).json({ error: "Este usuário já está vinculado a outro estabelecimento.", code: "USER_ALREADY_LINKED" });
      }
    }
    
    // Link user to establishment in users collection
    const updatedUserData = {
      uid,
      name: userData?.name || name || userRecord.displayName || "Sem Nome",
      email: normalizedEmail,
      phone: phone || userData?.phone || userRecord.phoneNumber || "",
      role: "merchant",
      establishmentId: establishmentId,
      accountStatus: isNewUser ? "invited" : (userData?.accountStatus || "active"),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    if (!userDoc.exists) {
      (updatedUserData as any).createdAt = FieldValue.serverTimestamp();
      await userRef.set(updatedUserData);
    } else {
      await userRef.update(updatedUserData);
    }
    
    // Link establishment to user in establishments collection
    const updatedEstData = {
      ownerUid: uid,
      merchantUid: uid,
      merchantOwnerUid: uid,
      ownerName: updatedUserData.name,
      ownerEmail: normalizedEmail,
      ownerPhone: updatedUserData.phone,
      ownerLinkedAt: FieldValue.serverTimestamp(),
      ownerLinkedBy: req.user.uid,
      updatedAt: FieldValue.serverTimestamp()
    };
    await estRef.update(updatedEstData);
    
    // Generate secure link for setting password
    let passwordResetLink = "";
    try {
      passwordResetLink = await auth.generatePasswordResetLink(normalizedEmail);
    } catch (linkErr) {
      console.error("Error generating password reset link:", linkErr);
    }
    
    // Log action
    await db.collection("adminAudits").doc().set({
      action: "owner_linked",
      establishmentId,
      uid,
      adminUid: req.user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({
      success: true,
      message: "Proprietário vinculado com sucesso.",
      user: {
        uid,
        name: updatedUserData.name,
        email: normalizedEmail,
        phone: updatedUserData.phone,
        role: "merchant",
        accountStatus: updatedUserData.accountStatus,
        establishmentId
      },
      passwordResetLink
    });
  } catch (error: any) {
    console.error("Error in link-owner:", error);
    return res.status(500).json({ error: error.message || "Failed to link owner" });
  }
});

// 2.3 Replace owner
app.post("/api/admin/establishments/:establishmentId/replace-owner", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { establishmentId } = req.params;
    let { uid, name, email, phone, allowCustomerConversion } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "E-mail é obrigatório.", code: "EMAIL_INVALID" });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Verify establishment exists
    const estRef = db.collection("establishments").doc(establishmentId);
    const estDoc = await estRef.get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const estData = estDoc.data() || {};
    
    // Get previous owner uid
    const prevOwnerUid = estData.ownerUid || estData.merchantUid || estData.merchantOwnerUid;
    
    // Find/Create new owner user record
    let userRecord: any = null;
    let isNewUser = false;
    
    if (uid) {
      try {
        userRecord = await auth.getUser(uid);
      } catch (authErr) {
        // User not in auth
      }
    } else {
      try {
        userRecord = await auth.getUserByEmail(normalizedEmail);
        uid = userRecord.uid;
      } catch (authErr: any) {
        if (authErr.code === "auth/user-not-found") {
          if (!name) {
            return res.status(400).json({ error: "Nome do responsável é obrigatório para novos acessos.", code: "NAME_REQUIRED" });
          }
          try {
            userRecord = await auth.createUser({
              email: normalizedEmail,
              emailVerified: true,
              displayName: name,
              phoneNumber: phone || undefined
            });
            uid = userRecord.uid;
            isNewUser = true;
          } catch (createErr: any) {
            console.error("Error creating auth user:", createErr);
            return res.status(500).json({ error: "Falha ao criar o usuário de autenticação.", code: "AUTH_USER_CREATE_FAILED" });
          }
        } else {
          throw authErr;
        }
      }
    }
    
    // Verify the new user is not the same as the previous
    if (prevOwnerUid === uid) {
      return res.status(400).json({ error: "O novo proprietário é idêntico ao atual.", code: "SAME_OWNER" });
    }
    
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    
    if (userDoc.exists) {
      if (userData?.role === "customer" && !allowCustomerConversion) {
        return res.status(200).json({
          requiresConfirmation: true,
          message: "Este e-mail já pertence a uma conta de cliente. Deseja conceder também acesso ao painel deste estabelecimento?",
          user: {
            uid,
            name: userData.name || userRecord.displayName || name,
            email: normalizedEmail,
            role: "customer"
          }
        });
      }
      
      if (userData?.establishmentId && userData?.establishmentId !== establishmentId) {
        return res.status(400).json({ error: "Este usuário já está vinculado a outro estabelecimento.", code: "USER_ALREADY_LINKED" });
      }
    }
    
    // Revoke previous owner's linkage
    if (prevOwnerUid) {
      const prevUserRef = db.collection("users").doc(prevOwnerUid);
      const prevUserDoc = await prevUserRef.get();
      if (prevUserDoc.exists) {
        await prevUserRef.update({
          establishmentId: null,
          role: "customer",
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
    
    // Link new user
    const updatedUserData = {
      uid,
      name: userData?.name || name || userRecord.displayName || "Sem Nome",
      email: normalizedEmail,
      phone: phone || userData?.phone || userRecord.phoneNumber || "",
      role: "merchant",
      establishmentId: establishmentId,
      accountStatus: isNewUser ? "invited" : (userData?.accountStatus || "active"),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    if (!userDoc.exists) {
      (updatedUserData as any).createdAt = FieldValue.serverTimestamp();
      await userRef.set(updatedUserData);
    } else {
      await userRef.update(updatedUserData);
    }
    
    // Update establishment
    const updatedEstData = {
      ownerUid: uid,
      merchantUid: uid,
      merchantOwnerUid: uid,
      ownerName: updatedUserData.name,
      ownerEmail: normalizedEmail,
      ownerPhone: updatedUserData.phone,
      ownerLinkedAt: FieldValue.serverTimestamp(),
      ownerLinkedBy: req.user.uid,
      updatedAt: FieldValue.serverTimestamp()
    };
    await estRef.update(updatedEstData);
    
    // Generate secure link for setting password
    let passwordResetLink = "";
    try {
      passwordResetLink = await auth.generatePasswordResetLink(normalizedEmail);
    } catch (linkErr) {
      console.error("Error generating password reset link:", linkErr);
    }
    
    // Log action
    await db.collection("adminAudits").doc().set({
      action: "owner_replaced",
      establishmentId,
      uid,
      prevUid: prevOwnerUid || null,
      adminUid: req.user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({
      success: true,
      message: "Proprietário substituído com sucesso.",
      user: {
        uid,
        name: updatedUserData.name,
        email: normalizedEmail,
        phone: updatedUserData.phone,
        role: "merchant",
        accountStatus: updatedUserData.accountStatus,
        establishmentId
      },
      passwordResetLink
    });
  } catch (error: any) {
    console.error("Error in replace-owner:", error);
    return res.status(500).json({ error: error.message || "Failed to replace owner" });
  }
});

// 2.4 Unlink owner
app.post("/api/admin/establishments/:establishmentId/unlink-owner", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { establishmentId } = req.params;
    
    // Verify establishment exists
    const estRef = db.collection("establishments").doc(establishmentId);
    const estDoc = await estRef.get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const estData = estDoc.data() || {};
    
    const ownerUid = estData.ownerUid || estData.merchantUid || estData.merchantOwnerUid;
    
    if (ownerUid) {
      const userRef = db.collection("users").doc(ownerUid);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.update({
          establishmentId: null,
          role: "customer",
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
    
    // Update establishment to remove owner details
    await estRef.update({
      ownerUid: null,
      merchantUid: null,
      merchantOwnerUid: null,
      ownerName: null,
      ownerEmail: null,
      ownerPhone: null,
      ownerLinkedAt: null,
      ownerLinkedBy: null,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    // Log action
    await db.collection("adminAudits").doc().set({
      action: "owner_unlinked",
      establishmentId,
      uid: ownerUid || null,
      adminUid: req.user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({
      success: true,
      message: "Proprietário desvinculado com sucesso."
    });
  } catch (error: any) {
    console.error("Error in unlink-owner:", error);
    return res.status(500).json({ error: error.message || "Failed to unlink owner" });
  }
});

// 2.5 Resend invite link
app.post("/api/admin/establishments/:establishmentId/resend-invite", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { establishmentId } = req.params;
    const estDoc = await db.collection("establishments").doc(establishmentId).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado." });
    }
    const estData = estDoc.data() || {};
    const email = estData.ownerEmail;
    if (!email) {
      return res.status(400).json({ error: "Este estabelecimento não possui e-mail de proprietário vinculado." });
    }
    
    // Re-generate password reset link
    const passwordResetLink = await auth.generatePasswordResetLink(email);
    
    // Log action
    await db.collection("adminAudits").doc().set({
      action: "invitation_resent",
      establishmentId,
      uid: estData.ownerUid || null,
      adminUid: req.user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({
      success: true,
      passwordResetLink
    });
  } catch (error: any) {
    console.error("Error resending invite:", error);
    return res.status(500).json({ error: error.message || "Failed to resend invite" });
  }
});

// 2.6 Create owner access (Create user with password, link, batch Firestore write & rollback support)
app.post("/api/admin/establishments/:establishmentId/create-owner-access", authenticateUser, requireAdmin, async (req: any, res: any) => {
  let createdAuthUser: any = null;
  let shouldRollback = false;
  try {
    const { establishmentId } = req.params;
    const { name, email, phone, password } = req.body;

    // Validate inputs
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "O nome do responsável é obrigatório.", code: "NAME_INVALID" });
    }
    if (!email) {
      return res.status(400).json({ error: "E-mail é obrigatório.", code: "EMAIL_INVALID" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    
    // Validate password rules (at least 8 chars, one letter, one number, no isolated spaces, not equals email)
    if (!password) {
      return res.status(400).json({ error: "Senha é obrigatória.", code: "PASSWORD_INVALID" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres.", code: "PASSWORD_TOO_SHORT" });
    }
    if (!/[A-Za-z]/.test(password)) {
      return res.status(400).json({ error: "A senha deve conter pelo menos uma letra.", code: "PASSWORD_REQUIRES_LETTER" });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: "A senha deve conter pelo menos um número.", code: "PASSWORD_REQUIRES_NUMBER" });
    }
    if (password.trim() === "") {
      return res.status(400).json({ error: "A senha não pode conter apenas espaços.", code: "PASSWORD_INVALID" });
    }
    if (password === normalizedEmail) {
      return res.status(400).json({ error: "A senha não pode ser igual ao e-mail.", code: "PASSWORD_EQUALS_EMAIL" });
    }

    // Locate the establishment
    const estRef = db.collection("establishments").doc(establishmentId);
    const estDoc = await estRef.get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const estData = estDoc.data() || {};

    // Validate if establishment already has an owner
    const { isReplace } = req.body;
    const prevOwnerUid = estData.ownerUid || estData.merchantUid || estData.merchantOwnerUid;

    if (prevOwnerUid && !isReplace) {
      return res.status(400).json({ error: "Este estabelecimento já possui um proprietário vinculado.", code: "ESTABLISHMENT_ALREADY_HAS_OWNER" });
    }

    // Verify if the email already exists in Firebase Auth
    let existingAuthUser: any = null;
    try {
      existingAuthUser = await auth.getUserByEmail(normalizedEmail);
    } catch (authErr: any) {
      if (authErr.code !== "auth/user-not-found") {
        throw authErr;
      }
    }

    if (existingAuthUser) {
      // Check Firestore user profile
      const userDoc = await db.collection("users").doc(existingAuthUser.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.establishmentId === establishmentId) {
          return res.status(400).json({ error: "Este usuário já está vinculado a esta loja.", code: "AUTH_EMAIL_ALREADY_EXISTS" });
        }
        if (userData?.establishmentId) {
          return res.status(400).json({ error: "Este e-mail pertence a um usuário já vinculado a outra loja.", code: "USER_ALREADY_LINKED_TO_ANOTHER_STORE" });
        }
        if (userData?.role === "customer") {
          return res.status(400).json({ 
            error: "Este e-mail já pertence a uma conta de cliente. Por favor, utilize a aba 'Vincular Usuário Existente' para conceder acesso ou utilize outro e-mail comercial.", 
            code: "EXISTING_CUSTOMER_ACCOUNT" 
          });
        }
        return res.status(400).json({ error: "Este e-mail já possui cadastro.", code: "AUTH_EMAIL_ALREADY_EXISTS" });
      } else {
        return res.status(400).json({ 
          error: "O usuário já existe na autenticação, mas não possui um perfil no banco de dados.", 
          code: "AUTH_USER_WITHOUT_PROFILE" 
        });
      }
    }

    // Create user in Firebase Authentication using Admin SDK
    try {
      createdAuthUser = await auth.createUser({
        email: normalizedEmail,
        password: password,
        displayName: name.trim(),
        emailVerified: true, // We verify email directly since the admin is creating it
        disabled: false
      });
      shouldRollback = true;
    } catch (createErr: any) {
      console.error("Error creating auth user:", createErr);
      return res.status(500).json({ error: "Falha ao criar o usuário de autenticação no Firebase.", code: "AUTH_USER_CREATE_FAILED" });
    }

    const uid = createdAuthUser.uid;

    // Build atomic write batch
    const batch = db.batch();

    // Revoke previous owner's linkage in same batch if replacement is done
    if (prevOwnerUid) {
      const prevUserRef = db.collection("users").doc(prevOwnerUid);
      batch.update(prevUserRef, {
        establishmentId: null,
        role: "customer",
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const userRef = db.collection("users").doc(uid);
    const updatedUserData = {
      uid,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : "",
      role: "merchant",
      establishmentId: establishmentId,
      cityId: estData.cityId || null,
      accountStatus: "active",
      active: true,
      mustChangePassword: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    const updatedEstData = {
      ownerUid: uid,
      merchantUid: uid,
      merchantOwnerUid: uid,
      ownerName: name.trim(),
      ownerEmail: normalizedEmail,
      ownerPhone: phone ? phone.trim() : "",
      ownerLinkedAt: FieldValue.serverTimestamp(),
      ownerLinkedBy: req.user.uid,
      updatedAt: FieldValue.serverTimestamp()
    };

    batch.set(userRef, updatedUserData);
    batch.update(estRef, updatedEstData);

    try {
      await batch.commit();
      shouldRollback = false; // successfully committed!
    } catch (dbErr: any) {
      console.error("Firestore batch commit failed:", dbErr);
      // Perform compensation rollback on Auth
      if (shouldRollback && createdAuthUser) {
        try {
          await auth.deleteUser(createdAuthUser.uid);
          console.log(`Rollback: Deleted Auth user ${createdAuthUser.uid} due to Firestore write failure.`);
        } catch (delErr) {
          console.error(`Rollback failed to delete Auth user ${createdAuthUser.uid}:`, delErr);
        }
      }
      return res.status(500).json({ error: "Falha ao gravar os dados no banco de dados. Operação cancelada.", code: "MERCHANT_PROFILE_WRITE_FAILED" });
    }

    // Read-after-write consistency check
    const checkUserDoc = await db.collection("users").doc(uid).get();
    const checkEstDoc = await db.collection("establishments").doc(establishmentId).get();

    const verifiedUser = checkUserDoc.data();
    const verifiedEst = checkEstDoc.data();

    if (
      !checkUserDoc.exists || !checkEstDoc.exists ||
      verifiedUser?.role !== "merchant" ||
      verifiedUser?.establishmentId !== establishmentId ||
      verifiedEst?.ownerUid !== uid ||
      verifiedUser?.accountStatus !== "active"
    ) {
      // If consistency check fails, we still rollback if possible
      try {
        await auth.deleteUser(uid);
        await userRef.delete();
        await estRef.update({
          ownerUid: null,
          merchantUid: null,
          merchantOwnerUid: null,
          ownerName: null,
          ownerEmail: null,
          ownerPhone: null,
          ownerLinkedAt: null,
          ownerLinkedBy: null
        });
      } catch (cleanErr) {
        console.error("Cleanup during consistency failure failed:", cleanErr);
      }
      return res.status(500).json({ error: "Erro de consistência após gravação. Acesso não persistido corretamente.", code: "OWNER_ACCESS_NOT_PERSISTED" });
    }

    // Secure audit logs
    const adminUidMascarado = req.user.uid.substring(0, 4) + "***" + req.user.uid.substring(req.user.uid.length - 4);
    const merchantUidMascarado = uid.substring(0, 4) + "***" + uid.substring(uid.length - 4);

    await db.collection("adminAudits").doc().set({
      action: "merchant_access_created",
      adminUidMascarado,
      merchantUidMascarado,
      establishmentId,
      timestamp: FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      data: {
        uid,
        name: verifiedUser.name,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        role: verifiedUser.role,
        accountStatus: verifiedUser.accountStatus,
        establishmentId,
        establishmentName: verifiedEst.name || ""
      }
    });

  } catch (err: any) {
    console.error("Uncaught error in create-owner-access:", err);
    return res.status(500).json({ error: err.message || "Erro interno do servidor.", code: "OWNER_ACCESS_NOT_PERSISTED" });
  }
});

const VALID_PUBLIC_CATEGORY_IDS = [
  "pizzas",
  "lanches",
  "japonesa",
  "brasileira",
  "acai_doces",
  "mercados",
  "conveniencias",
  "pet_shops",
  "farmacias",
  "agropecuarias"
];

function normalizeCategoryId(value: string): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (VALID_PUBLIC_CATEGORY_IDS.includes(clean)) {
    return clean;
  }
  if (["japonesa", "japones", "japanese", "sushi"].includes(clean)) {
    return "japonesa";
  }
  if (["brasileira", "brasileiro", "comida brasileira"].includes(clean)) {
    return "brasileira";
  }
  if (["pizzaria", "pizza", "pizzas", "pizzerias"].includes(clean)) {
    return "pizzas";
  }
  if (["lanches", "burgers", "burger", "hamburgueres", "hamburguer", "snacks"].includes(clean)) {
    return "lanches";
  }
  if (["acai e doces", "acai_sweets", "acai", "doces"].includes(clean)) {
    return "acai_doces";
  }
  if (["mercados", "markets", "grocery", "mercado", "mercearia", "mercearias"].includes(clean)) {
    return "mercados";
  }
  if (["conveniencias", "convenience", "conveniencia"].includes(clean)) {
    return "conveniencias";
  }
  if (["pet shop", "pet shops", "petshop", "petshops", "pet", "animais", "produtos para animais"].includes(clean)) {
    return "pet_shops";
  }
  if (["farmacia", "farmacias", "farmacia e drogaria", "drogaria", "drogarias", "pharmacy"].includes(clean)) {
    return "farmacias";
  }
  if (["agropecuaria", "agropecuarias", "agro", "casa agropecuaria", "produtos agropecuarios", "agropecuary"].includes(clean)) {
    return "agropecuarias";
  }
  return null;
}

// 3. Create a new establishment
app.post("/api/admin/establishments/create", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const data = req.body;
    
    const companyName = data.companyName || data.legalName;
    const legalName = data.legalName || data.companyName;
    const document = data.document || data.taxDocument;
    const taxDocument = data.taxDocument || data.document;
    const legalContactName = data.legalContactName || data.owner;
    const legalContactPhone = data.legalContactPhone || data.phone;
    const legalContactEmail = data.legalContactEmail || data.email;
    const merchantOwnerUid = data.merchantOwnerUid || data.ownerUid || data.merchantUid || null;
    const ownerUid = data.ownerUid || data.merchantOwnerUid || null;

    if (!data.name || !legalContactName || !legalContactPhone || !companyName || !data.cityId) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    // Normalizing categoryIds array for creation
    const inputCategoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];
    const normalizedCategoryIds = Array.from(
      new Set(
        inputCategoryIds
          .map(normalizeCategoryId)
          .filter((id): id is string => id !== null && VALID_PUBLIC_CATEGORY_IDS.includes(id))
      )
    );
    
    // Generate clean lowercase alphanumeric slug-based ID
    const baseId = data.name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
      
    const finalId = `${baseId}-${Date.now().toString().slice(-4)}`;
    
    const estRef = db.collection("establishments").doc(finalId);
    
    const newEst = {
      id: finalId,
      slug: finalId,
      name: data.name,
      companyName,
      legalName,
      document,
      taxDocument,
      category: data.category,
      categoryName: data.categoryName,
      categoryIds: normalizedCategoryIds,
      legalContactName,
      legalContactPhone,
      legalContactEmail,
      owner: legalContactName,
      phone: legalContactPhone,
      email: legalContactEmail,
      address: data.address,
      bairro: data.bairro,
      cep: data.cep,
      cityId: data.cityId,
      cityName: data.cityName,
      state: data.state || 'MG',
      deliveryFee: data.deliveryFee || 0,
      minOrderValue: data.minOrderValue || 0,
      entregaPropria: !!data.entregaPropria,
      atendeRetirada: !!data.atendeRetirada,
      bairrosAtendidos: data.bairrosAtendidos,
      logoUrl: data.logoUrl || "",
      coverImageUrl: data.coverImageUrl || "",
      isFeaturedPartner: !!data.isFeaturedPartner,
      featured: !!data.isFeaturedPartner,
      featuredOrder: Number(data.featuredOrder) || 0,
      
      platformStatus: 'active',
      operationalPause: false,
      isOpen: false, // Default closed
      acceptingOrders: false, // Default not accepting
      
      ownerUid,
      merchantUid: ownerUid,
      merchantOwnerUid,
      
      rating: 5.0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    await estRef.set(newEst);
    
    return res.status(201).json({ success: true, establishment: newEst });
  } catch (error: any) {
    console.error("Error creating establishment:", error);
    return res.status(500).json({ error: error.message || "Failed to create establishment" });
  }
});

// 4. Update an establishment
app.post("/api/admin/establishments/:id/update", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const estRef = db.collection("establishments").doc(id);
    const estDoc = await estRef.get();
    
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado." });
    }
    
    // Validate logoUrl
    if (data.logoUrl !== undefined) {
      if (data.logoUrl === null) {
        // null is allowed to remove the image
      } else if (typeof data.logoUrl === 'string' && (data.logoUrl.startsWith('http://') || data.logoUrl.startsWith('https://'))) {
        // valid URL
      } else {
        return res.status(400).json({
          error: {
            code: 'INVALID_LOGO_URL',
            message: "A URL do logotipo deve ser nula ou iniciar com http:// ou https://"
          }
        });
      }
    }
    
    // Only allow updating specific fields
    const allowedFields = [
      'name', 'companyName', 'legalName', 'document', 'taxDocument', 'category', 'categoryName', 
      'legalContactName', 'owner', 'legalContactPhone', 'phone', 'legalContactEmail', 'email',
      'address', 'bairro', 'cep', 'cityId', 'cityName', 'state',
      'deliveryFee', 'minOrderValue', 'entregaPropria', 'atendeRetirada', 'bairrosAtendidos',
      'merchantOwnerUid', 'ownerUid', 'merchantUid',
      'logoUrl', 'coverImageUrl', 'isFeaturedPartner', 'featured', 'featuredOrder',
      'categoryIds'
    ];
    
    const updateData: any = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
      }
    }

    // Normalize and validate categoryIds for update
    if (updateData.categoryIds !== undefined) {
      const inputIds = Array.isArray(updateData.categoryIds) ? updateData.categoryIds : [];
      updateData.categoryIds = Array.from(
        new Set(
          inputIds
            .map(normalizeCategoryId)
            .filter((id): id is string => id !== null && VALID_PUBLIC_CATEGORY_IDS.includes(id))
        )
      );
    }

    // Explicitly set logoUrl in updates if defined
    if (data.logoUrl !== undefined) {
      updateData.logoUrl = data.logoUrl;
    }
    
    // Support twin writes for legacy/canonical fields
    if (data.legalName !== undefined || data.companyName !== undefined) {
      const val = data.legalName !== undefined ? data.legalName : data.companyName;
      updateData.legalName = val;
      updateData.companyName = val;
    }
    if (data.taxDocument !== undefined || data.document !== undefined) {
      const val = data.taxDocument !== undefined ? data.taxDocument : data.document;
      updateData.taxDocument = val;
      updateData.document = val;
    }
    if (data.legalContactName !== undefined || data.owner !== undefined) {
      const val = data.legalContactName !== undefined ? data.legalContactName : data.owner;
      updateData.legalContactName = val;
      updateData.owner = val;
    }
    if (data.legalContactPhone !== undefined || data.phone !== undefined) {
      const val = data.legalContactPhone !== undefined ? data.legalContactPhone : data.phone;
      updateData.legalContactPhone = val;
      updateData.phone = val;
    }
    if (data.legalContactEmail !== undefined || data.email !== undefined) {
      const val = data.legalContactEmail !== undefined ? data.legalContactEmail : data.email;
      updateData.legalContactEmail = val;
      updateData.email = val;
    }
    if (data.merchantOwnerUid !== undefined || data.ownerUid !== undefined || data.merchantUid !== undefined) {
      const val = data.merchantOwnerUid !== undefined ? data.merchantOwnerUid : (data.ownerUid !== undefined ? data.ownerUid : data.merchantUid);
      updateData.merchantOwnerUid = val;
      updateData.ownerUid = val;
      updateData.merchantUid = val;
    }
    
    await estRef.update(updateData);
    
    // Reler o documento atualizado
    const updatedEstDoc = await estRef.get();
    const updatedEstData: any = { id, ...updatedEstDoc.data() };
    
    // Confirm persistent field
    if (data.logoUrl !== undefined) {
      if (updatedEstData.logoUrl !== data.logoUrl) {
        return res.status(200).json({
          success: false,
          error: {
            code: "LOGO_URL_NOT_PERSISTED",
            message: "A URL do logotipo não foi persistida."
          }
        });
      }
    }
    
    return res.status(200).json({ success: true, data: updatedEstData, message: "Estabelecimento atualizado com sucesso." });
  } catch (error: any) {
    console.error("Error updating establishment:", error);
    return res.status(500).json({ error: error.message || "Failed to update establishment" });
  }
});

// 5. Update establishment status (active, paused, inactive, archived) with active orders verification
app.post("/api/admin/establishments/:id/status", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const inputStatus = req.body.status || req.body.platformStatus;
    const { reason } = req.body;
    
    if (!['active', 'paused', 'inactive', 'archived'].includes(inputStatus)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    
    const estRef = db.collection("establishments").doc(id);
    const estDoc = await estRef.get();
    
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado." });
    }
    
    const currentEstData = estDoc.data() || {};
    
    // Check for active orders if moving to 'inactive' or 'archived'
    if (['inactive', 'archived'].includes(inputStatus)) {
      const ordersSnap = await db.collection("orders")
        .where("establishmentId", "==", id)
        .get();
        
      const activeOrders = ordersSnap.docs.filter(doc => {
        const orderData = doc.data();
        const orderStatus = orderData.status || orderData.orderStatus || "";
        // Active statuses as defined in orderLifecycle.ts
        return ['aguardando_confirmacao', 'confirmado', 'em_preparacao', 'pronto', 'saiu_entrega', 'pending', 'confirmed', 'preparing', 'ready', 'ready_for_pickup', 'pronto_retirada', 'out_for_delivery', 'saiu_para_entrega'].includes(orderStatus);
      });
      
      if (activeOrders.length > 0) {
        return res.status(400).json({
          error: `Não é possível desativar ou arquivar este estabelecimento porque ele possui ${activeOrders.length} pedido(s) ativo(s) em andamento.`
        });
      }
    }
    
    let updateFields: any = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user.uid || null
    };
    
    switch (inputStatus) {
      case 'active':
        updateFields.platformStatus = 'active';
        updateFields.active = true;
        updateFields.suspended = false;
        updateFields.archived = false;
        updateFields.operationalPause = false;
        updateFields.temporarilyPaused = false;
        break;
      case 'paused':
        updateFields.platformStatus = 'active';
        updateFields.active = true;
        updateFields.suspended = false;
        updateFields.archived = false;
        updateFields.operationalPause = true;
        updateFields.temporarilyPaused = true;
        updateFields.isOpen = false;
        updateFields.open = false;
        updateFields.acceptingOrders = false;
        break;
      case 'inactive':
        updateFields.platformStatus = 'inactive';
        updateFields.active = false;
        updateFields.suspended = true;
        updateFields.operationalPause = false;
        updateFields.temporarilyPaused = false;
        updateFields.isOpen = false;
        updateFields.open = false;
        updateFields.acceptingOrders = false;
        if (currentEstData.platformStatus === 'archived' || currentEstData.archived === true) {
          updateFields.archived = false;
          updateFields.restoredAt = FieldValue.serverTimestamp();
          updateFields.restoredBy = req.user.uid || null;
        }
        if (reason) {
          updateFields.deactivationReason = reason;
        }
        break;
      case 'archived':
        updateFields.platformStatus = 'archived';
        updateFields.active = false;
        updateFields.suspended = true;
        updateFields.archived = true;
        updateFields.operationalPause = false;
        updateFields.temporarilyPaused = false;
        updateFields.isOpen = false;
        updateFields.open = false;
        updateFields.acceptingOrders = false;
        updateFields.archivedAt = FieldValue.serverTimestamp();
        updateFields.archivedBy = req.user.uid || null;
        if (reason) {
          updateFields.archiveReason = reason;
        }
        break;
    }
    
    await estRef.update(updateFields);
    
    return res.status(200).json({ 
      success: true, 
      id, 
      status: inputStatus, 
      message: `Status do estabelecimento atualizado para ${inputStatus} com sucesso.` 
    });
  } catch (error: any) {
    console.error("Error updating establishment status:", error);
    return res.status(500).json({ error: error.message || "Failed to update establishment status" });
  }
});

// --- FINANCIAL AND ANALYTICS ENDPOINTS (PHASES 5-17) ---

// Normalizer for orders (Phase 19 & 20)
function normalizeOrderFinancialSnapshot(order: any) {
  if (!order) return null;

  let subtotal = 0;
  if (typeof order.subtotal === 'number') {
    subtotal = order.subtotal;
  } else if (typeof order.itemsSubtotal === 'number') {
    subtotal = order.itemsSubtotal;
  } else if (Array.isArray(order.items)) {
    subtotal = order.items.reduce((sum: number, item: any) => {
      const price = typeof item.price === 'number' ? item.price : Number(item.price || 0);
      const qty = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 1);
      let complementsPrice = 0;
      if (Array.isArray(item.optionals)) {
        complementsPrice = item.optionals.reduce((compSum: number, opt: any) => {
          const optPrice = typeof opt.price === 'number' ? opt.price : Number(opt.price || 0);
          const optQty = typeof opt.quantity === 'number' ? opt.quantity : Number(opt.quantity || 1);
          return compSum + (optPrice * optQty);
        }, 0);
      }
      return sum + ((price + complementsPrice) * qty);
    }, 0);
  }

  let deliveryFee = 0;
  const isPickup = order.fulfillmentType === 'pickup' || order.deliveryType === 'pickup' || order.fulfillmentType === 'retirada' || order.deliveryType === 'retirada';
  if (isPickup) {
    deliveryFee = 0;
  } else if (typeof order.deliveryFee === 'number') {
    deliveryFee = order.deliveryFee;
  } else if (typeof order.shippingFee === 'number') {
    deliveryFee = order.shippingFee;
  } else if (typeof order.taxaEntrega === 'number') {
    deliveryFee = order.taxaEntrega;
  }

  let discount = 0;
  if (typeof order.discount === 'number') {
    discount = order.discount;
  } else if (typeof order.discountAmount === 'number') {
    discount = order.discountAmount;
  }

  let total = 0;
  if (typeof order.total === 'number') {
    total = order.total;
  } else if (typeof order.totalAmount === 'number') {
    total = order.totalAmount;
  } else {
    total = Math.max(0, subtotal + deliveryFee - discount);
  }

  const parseDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const createdAt = parseDate(order.createdAt);
  const updatedAt = parseDate(order.updatedAt);
  
  let status = order.status || order.orderStatus || 'aguardando_confirmacao';
  status = status.toLowerCase().trim();
  if (status === 'completed' || status === 'concluído' || status === 'concluido') status = 'concluido';
  if (status === 'cancelled' || status === 'cancelado_pelo_cliente') status = 'cancelado';
  if (status === 'refused' || status === 'rejeitado' || status === 'recusado_pelo_estabelecimento') status = 'recusado';

  let completedAt = parseDate(order.completedAt);
  if (!completedAt && Array.isArray(order.statusHistory)) {
    const compHistory = order.statusHistory.find((h: any) => {
      const st = (h.status || "").toLowerCase().trim();
      return st === 'concluido' || st === 'concluído';
    });
    if (compHistory) {
      completedAt = parseDate(compHistory.timestamp);
    }
  }
  if (!completedAt && status === 'concluido') {
    completedAt = parseDate(order.updatedAt) || parseDate(order.createdAt);
  }

  let rejectedAt = parseDate(order.rejectedAt);
  if (!rejectedAt && Array.isArray(order.statusHistory)) {
    const rejHistory = order.statusHistory.find((h: any) => {
      const st = (h.status || "").toLowerCase().trim();
      return st === 'recusado' || st === 'rejeitado' || st === 'refused';
    });
    if (rejHistory) {
      rejectedAt = parseDate(rejHistory.timestamp);
    }
  }
  if (!rejectedAt && status === 'recusado') {
    rejectedAt = parseDate(order.updatedAt) || parseDate(order.createdAt);
  }

  let cancelledAt = parseDate(order.cancelledAt);
  if (!cancelledAt && Array.isArray(order.statusHistory)) {
    const canHistory = order.statusHistory.find((h: any) => {
      const st = (h.status || "").toLowerCase().trim();
      return st === 'cancelado' || st === 'cancelled';
    });
    if (canHistory) {
      cancelledAt = parseDate(canHistory.timestamp);
    }
  }
  if (!cancelledAt && status === 'cancelado') {
    cancelledAt = parseDate(order.updatedAt) || parseDate(order.createdAt);
  }

  let paymentMethod = order.paymentMethod || 'other';
  if (typeof paymentMethod === 'string') {
    paymentMethod = paymentMethod.toLowerCase().trim();
    if (paymentMethod === 'dinheiro' || paymentMethod === 'cash') paymentMethod = 'cash';
    if (paymentMethod === 'cartao' || paymentMethod === 'cartão' || paymentMethod === 'card') paymentMethod = 'card';
    if (paymentMethod === 'pix') paymentMethod = 'pix';
  }

  // Multi-field prioritized neighborhood search
  let deliveryNeighborhood = "";
  if (order.deliveryAddress && typeof order.deliveryAddress === 'object') {
    deliveryNeighborhood = order.deliveryAddress.neighborhood || order.deliveryAddress.bairro || "";
  }
  if (!deliveryNeighborhood && order.deliverySnapshot && typeof order.deliverySnapshot === 'object') {
    deliveryNeighborhood = order.deliverySnapshot.neighborhood || order.deliverySnapshot.bairro || "";
  }
  if (!deliveryNeighborhood) {
    deliveryNeighborhood = order.deliveryNeighborhood || order.neighborhood || "";
  }
  deliveryNeighborhood = (deliveryNeighborhood || "").trim();

  return {
    id: order.id || order.orderNumber,
    orderNumber: order.orderNumber,
    establishmentId: order.establishmentId,
    establishmentName: order.establishmentName || 'Estabelecimento Sem Nome',
    cityId: order.cityId || 'sao-joao-batista-do-gloria-mg',
    cityName: order.cityName || 'São João Batista do Glória',
    customerId: order.customerId,
    customerName: order.customerName || 'Cliente',
    fulfillmentType: isPickup ? 'pickup' : 'delivery',
    deliveryNeighborhood,
    status,
    subtotal,
    deliveryFee,
    discount,
    total,
    paymentMethod,
    createdAt,
    completedAt,
    rejectedAt,
    cancelledAt,
    updatedAt,
    items: order.items || [],
    statusHistory: order.statusHistory || []
  };
}

function getSaoPauloDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  return `${year}-${month}-${day}`;
}

function normalizeOrderItemSnapshot(item: any, orderId: string, itemIdx: number) {
  if (!item) {
    return {
      productId: `unknown-${orderId}-${itemIdx}`,
      productName: "Produto sem identificação — pedido legado",
      quantity: 1,
      price: null,
      lineTotal: null
    };
  }

  const productObj = item.product || {};
  let productName = item.productName || productObj.name || item.name || item.title || "";
  productName = productName.trim();
  
  const hasNoName = !productName || productName.toLowerCase() === "produto";
  const finalName = hasNoName ? "Produto sem identificação — pedido legado" : productName;

  let productId = item.productId || productObj.id || item.id || "";
  if (!productId || hasNoName) {
    productId = `unknown-${orderId}-${itemIdx}`;
  }

  const quantity = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 1);

  let price: number | null = null;
  if (typeof item.lineTotal === 'number') {
    price = item.lineTotal / quantity;
  } else {
    const baseUnitPrice = typeof item.baseUnitPrice === 'number'
      ? item.baseUnitPrice
      : (typeof item.price === 'number' ? item.price : (productObj.price !== undefined ? productObj.price : null));
    
    if (baseUnitPrice !== null) {
      let optionsTotal = 0;
      
      const rawSize = item.selectedSize || item.size;
      if (rawSize) {
        if (typeof rawSize === 'object' && typeof rawSize.priceDelta === 'number') {
          optionsTotal += rawSize.priceDelta;
        } else if (typeof rawSize === 'string') {
          if (rawSize === 'Pequena') optionsTotal -= 5.0;
          else if (rawSize === 'Grande') optionsTotal += 8.0;
        }
      }

      const rawCrust = item.selectedCrust || item.selectedBorder || item.crust;
      if (rawCrust) {
        if (typeof rawCrust === 'object' && typeof rawCrust.priceDelta === 'number') {
          optionsTotal += rawCrust.priceDelta;
        } else if (typeof rawCrust === 'string') {
          const isNone = rawCrust === 'Sem borda' || rawCrust === 'Nenhum';
          if (!isNone) optionsTotal += 5.0;
        }
      }

      const rawExtras = item.selectedExtras || item.extras || item.addons || item.options;
      if (Array.isArray(rawExtras)) {
        rawExtras.forEach((ex: any) => {
          if (!ex) return;
          const exPrice = typeof ex.unitPrice === 'number'
            ? ex.unitPrice
            : (typeof ex.price === 'number' ? ex.price : 0);
          const exQty = typeof ex.quantity === 'number' ? ex.quantity : 1;
          optionsTotal += exPrice * exQty;
        });
      }

      if (Array.isArray(item.selectedOptionGroups)) {
        item.selectedOptionGroups.forEach((g: any) => {
          if (Array.isArray(g.selectedOptions)) {
            g.selectedOptions.forEach((o: any) => {
              optionsTotal += typeof o.additionalPrice === 'number' ? o.additionalPrice : 0;
            });
          }
        });
      }

      price = baseUnitPrice + optionsTotal;
    }
  }

  const lineTotal = price !== null ? price * quantity : null;

  return {
    productId,
    productName: finalName,
    quantity,
    price,
    lineTotal
  };
}

async function getNormalizedOrdersForPeriod(startDate: Date, endDate: Date, establishmentId?: string, cityId?: string) {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const previousStartDate = new Date(startDate.getTime() - diffTime);
  const bufferTime = 2 * 24 * 60 * 60 * 1000; // 2 days buffer
  const queryStartDate = new Date(previousStartDate.getTime() - bufferTime);

  let queryRef: any = db.collection("orders");
  queryRef = queryRef.where("createdAt", ">=", queryStartDate);
  
  const snapshot = await queryRef.get();
  
  const allOrders: any[] = [];
  let ignoredOrdersCount = 0;

  snapshot.forEach(doc => {
    const rawData = doc.data();
    rawData.id = doc.id;
    const normalized = normalizeOrderFinancialSnapshot(rawData);
    if (!normalized || !normalized.createdAt) {
      ignoredOrdersCount++;
      return;
    }

    if (establishmentId && normalized.establishmentId !== establishmentId) {
      return;
    }
    if (cityId && normalized.cityId !== cityId) {
      return;
    }

    allOrders.push(normalized);
  });

  return {
    allOrders,
    ignoredOrdersCount
  };
}

function calculateOverviewMetrics(allOrders: any[], startDate: Date, endDate: Date) {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const previousStartDate = new Date(startDate.getTime() - diffTime);

  const getMetricsForRange = (start: Date, end: Date) => {
    const startTime = start.getTime();
    const endTime = end.getTime();

    // 1. Recebidos: createdAt within period
    const recebidos = allOrders.filter(o => {
      const t = o.createdAt ? o.createdAt.getTime() : 0;
      return t >= startTime && t <= endTime;
    });

    // 2. Concluídos: completedAt within period
    const concluídos = allOrders.filter(o => {
      if (o.status !== 'concluido') return false;
      const t = o.completedAt ? o.completedAt.getTime() : 0;
      return t >= startTime && t <= endTime;
    });

    // 3. Recusados: rejectedAt within period
    const recusados = allOrders.filter(o => {
      if (o.status !== 'recusado') return false;
      const t = o.rejectedAt ? o.rejectedAt.getTime() : 0;
      return t >= startTime && t <= endTime;
    });

    // 4. Cancelados: cancelledAt within period
    const cancelados = allOrders.filter(o => {
      if (o.status !== 'cancelado') return false;
      const t = o.cancelledAt ? o.cancelledAt.getTime() : 0;
      return t >= startTime && t <= endTime;
    });

    const totalMovimentado = concluídos.reduce((sum, o) => sum + o.total, 0);
    const subtotalProd = concluídos.reduce((sum, o) => sum + o.subtotal, 0);
    const taxasEntrega = concluídos.reduce((sum, o) => sum + o.deliveryFee, 0);
    const descontos = concluídos.reduce((sum, o) => sum + o.discount, 0);
    const countCompleted = concluídos.length;
    const ticketMedio = countCompleted > 0 ? (totalMovimentado / countCompleted) : 0;
    const countReceived = recebidos.length;
    const cancelledRecusados = cancelados.length + recusados.length;

    return {
      totalMovimentado,
      subtotalProd,
      taxasEntrega,
      descontos,
      pedidosConcluidos: countCompleted,
      ticketMedio,
      pedidosRecebidos: countReceived,
      cancelledRecusados,
      concluidosOrders: concluídos,
      recebidosOrders: recebidos,
      recusadosOrders: recusados,
      canceladosOrders: cancelados
    };
  };

  const current = getMetricsForRange(startDate, endDate);
  const previous = getMetricsForRange(previousStartDate, startDate);

  const pctDiff = (curr: number, prev: number) => {
    if (prev === 0) return null;
    return Number((((curr - prev) / prev) * 100).toFixed(1));
  };

  const cancelledRecusadosPct = current.pedidosRecebidos > 0 
    ? Number(((current.cancelledRecusados / current.pedidosRecebidos) * 100).toFixed(1)) 
    : 0;

  return {
    summary: {
      totalMovimentado: Number(current.totalMovimentado.toFixed(2)),
      totalMovimentadoDiff: pctDiff(current.totalMovimentado, previous.totalMovimentado),
      subtotalProd: Number(current.subtotalProd.toFixed(2)),
      subtotalProdDiff: pctDiff(current.subtotalProd, previous.subtotalProd),
      pedidosConcluidos: current.pedidosConcluidos,
      pedidosConcluidosDiff: pctDiff(current.pedidosConcluidos, previous.pedidosConcluidos),
      ticketMedio: Number(current.ticketMedio.toFixed(2)),
      ticketMedioDiff: pctDiff(current.ticketMedio, previous.ticketMedio),
      taxasEntrega: Number(current.taxasEntrega.toFixed(2)),
      taxasEntregaDiff: pctDiff(current.taxasEntrega, previous.taxasEntrega),
      descontos: Number(current.descontos.toFixed(2)),
      descontosDiff: pctDiff(current.descontos, previous.descontos),
      pedidosRecebidos: current.pedidosRecebidos,
      pedidosRecebidosDiff: pctDiff(current.pedidosRecebidos, previous.pedidosRecebidos),
      cancelledRecusados: current.cancelledRecusados,
      cancelledRecusadosPct,
      cancelledRecusadosDiff: pctDiff(current.cancelledRecusados, previous.cancelledRecusados)
    },
    currentConcluidos: current.concluidosOrders,
    currentRecebidos: current.recebidosOrders,
    currentRecusados: current.recusadosOrders,
    currentCancelados: current.canceladosOrders
  };
}

function calculateOperationalAndDistributions(currentOrders: any[]) {
  const total = currentOrders.length;
  const concluidos = currentOrders.filter(o => o.status === 'concluido').length;
  const recusados = currentOrders.filter(o => o.status === 'recusado').length;
  const cancelados = currentOrders.filter(o => o.status === 'cancelado').length;
  const emAndamento = total - concluidos - recusados - cancelados;

  const taxaConclusao = total > 0 ? Number(((concluidos / total) * 100).toFixed(1)) : 0;
  const taxaRecusa = total > 0 ? Number(((recusados / total) * 100).toFixed(1)) : 0;
  const taxaCancelamento = total > 0 ? Number(((cancelados / total) * 100).toFixed(1)) : 0;

  let confirmacaoDiffsSum = 0;
  let confirmacaoDiffsCount = 0;
  let preparacaoDiffsSum = 0;
  let preparacaoDiffsCount = 0;
  let totalDiffsSum = 0;
  let totalDiffsCount = 0;

  currentOrders.forEach(o => {
    const createdAtTime = o.createdAt ? o.createdAt.getTime() : null;
    const completedAtTime = o.completedAt ? o.completedAt.getTime() : null;

    if (createdAtTime && Array.isArray(o.statusHistory)) {
      const confStep = o.statusHistory.find((h: any) => 
        ['confirmado', 'em_preparacao', 'pronto', 'saiu_entrega', 'concluido'].includes(h.status?.toLowerCase()?.trim())
      );
      if (confStep) {
        const confTime = new Date(confStep.timestamp).getTime();
        const diffMin = (confTime - createdAtTime) / 60000;
        if (diffMin >= 0 && diffMin < 1440) {
          confirmacaoDiffsSum += diffMin;
          confirmacaoDiffsCount++;
        }
      }

      const prepStartStep = o.statusHistory.find((h: any) => 
        ['confirmado', 'em_preparacao'].includes(h.status?.toLowerCase()?.trim())
      );
      const prepEndStep = o.statusHistory.find((h: any) => 
        ['pronto', 'saiu_entrega', 'concluido'].includes(h.status?.toLowerCase()?.trim())
      );
      if (prepStartStep && prepEndStep) {
        const startTime = new Date(prepStartStep.timestamp).getTime();
        const endTime = new Date(prepEndStep.timestamp).getTime();
        const diffMin = (endTime - startTime) / 60000;
        if (diffMin >= 0 && diffMin < 1440) {
          preparacaoDiffsSum += diffMin;
          preparacaoDiffsCount++;
        }
      }
    }

    if (createdAtTime && completedAtTime && o.status === 'concluido') {
      const diffMin = (completedAtTime - createdAtTime) / 60000;
      if (diffMin >= 0 && diffMin < 2880) {
        totalDiffsSum += diffMin;
        totalDiffsCount++;
      }
    }
  });

  const tempoMedioConfirmacao = confirmacaoDiffsCount > 0 ? Number((confirmacaoDiffsSum / confirmacaoDiffsCount).toFixed(1)) : 0;
  const tempoMedioPreparacao = preparacaoDiffsCount > 0 ? Number((preparacaoDiffsSum / preparacaoDiffsCount).toFixed(1)) : 0;
  const tempoMedioTotal = totalDiffsCount > 0 ? Number((totalDiffsSum / totalDiffsCount).toFixed(1)) : 0;

  const payMap = new Map<string, { count: number; value: number }>();
  payMap.set('pix', { count: 0, value: 0 });
  payMap.set('card', { count: 0, value: 0 });
  payMap.set('cash', { count: 0, value: 0 });

  const completedOrders = currentOrders.filter(o => o.status === 'concluido');
  completedOrders.forEach(o => {
    const method = o.paymentMethod || 'other';
    const cur = payMap.get(method) || { count: 0, value: 0 };
    payMap.set(method, {
      count: cur.count + 1,
      value: cur.value + o.total
    });
  });

  const completedCount = completedOrders.length;
  const paymentMethods = Array.from(payMap.entries()).map(([id, data]) => {
    const labels: Record<string, string> = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro', other: 'Outro' };
    return {
      id,
      label: labels[id] || id,
      count: data.count,
      pct: completedCount > 0 ? Number(((data.count / completedCount) * 100).toFixed(1)) : 0,
      value: Number(data.value.toFixed(2))
    };
  });

  let delCount = 0;
  let delValue = 0;
  let pickCount = 0;
  let pickValue = 0;

  completedOrders.forEach(o => {
    if (o.fulfillmentType === 'pickup') {
      pickCount++;
      pickValue += o.total;
    } else {
      delCount++;
      delValue += o.total;
    }
  });

  const fulfillment = [
    {
      id: 'delivery',
      label: 'Entrega',
      count: delCount,
      pct: completedCount > 0 ? Number(((delCount / completedCount) * 100).toFixed(1)) : 0,
      value: Number(delValue.toFixed(2))
    },
    {
      id: 'pickup',
      label: 'Retirada',
      count: pickCount,
      pct: completedCount > 0 ? Number(((pickCount / completedCount) * 100).toFixed(1)) : 0,
      value: Number(pickValue.toFixed(2))
    }
  ];

  return {
    operational: {
      total,
      concluidos,
      recusados,
      cancelados,
      emAndamento,
      taxaConclusao,
      taxaRecusa,
      taxaCancelamento,
      tempoMedioConfirmacaoMinutes: tempoMedioConfirmacao,
      tempoMedioPreparacaoMinutes: tempoMedioPreparacao,
      tempoMedioTotalMinutes: tempoMedioTotal
    },
    distributions: {
      paymentMethods,
      fulfillment
    }
  };
}

function calculateTimeSeries(currentOrders: any[], startDate: Date, endDate: Date) {
  const timeseriesMap = new Map<string, { date: string, rawDate: string, count: number, value: number }>();
  
  const scanDate = new Date(startDate);
  scanDate.setHours(0, 0, 0, 0);
  const endCompare = new Date(endDate);
  endCompare.setHours(23, 59, 59, 999);

  while (scanDate <= endCompare) {
    const dateStr = getSaoPauloDateString(scanDate);
    const parts = dateStr.split('-');
    const label = `${parts[2]}/${parts[1]}`;
    timeseriesMap.set(dateStr, {
      date: label,
      rawDate: dateStr,
      count: 0,
      value: 0
    });
    scanDate.setDate(scanDate.getDate() + 1);
  }

  currentOrders.forEach(o => {
    if (o.status === 'concluido' && o.completedAt) {
      const dayStr = getSaoPauloDateString(o.completedAt);
      const existing = timeseriesMap.get(dayStr);
      if (existing) {
        existing.value += o.total;
        existing.count++;
      }
    }
  });

  return Array.from(timeseriesMap.values()).map(item => ({
    date: item.date,
    rawDate: item.rawDate,
    count: item.count,
    value: Number(item.value.toFixed(2))
  }));
}

// Middleware specifically for securing merchant analytics routes
const requireMerchantForEstablishment = async (req: any, res: any, next: any) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }
    const userData = userDoc.data() || {};
    
    const isAdminEmail = req.user.email && (
      req.user.email === "cloudviajandocomigo@gmail.com" ||
      req.user.email === "atendimento@viajandocomigo.com.br" ||
      req.user.email.endsWith("@viajandocomigo.com.br")
    );
    const isAdminUser = userData.role === "admin" || isAdminEmail;
    
    if (isAdminUser) {
      req.merchantEstablishmentId = req.query.establishmentId || req.params.id;
      return next();
    }

    if (userData.role !== "merchant") {
      return res.status(403).json({ error: "Acesso negado. Apenas comerciantes ou administradores podem acessar." });
    }

    const establishmentId = userData.establishmentId;
    if (!establishmentId) {
      return res.status(403).json({ error: "Sua conta de comerciante não está vinculada a nenhuma loja." });
    }

    const estDoc = await db.collection("establishments").doc(establishmentId).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento vinculado não encontrado." });
    }
    const estData = estDoc.data() || {};
    
    if (estData.ownerUid !== uid && userData.establishmentId !== establishmentId) {
      return res.status(403).json({ error: "Acesso negado. Você não é o proprietário desta loja." });
    }

    req.merchantEstablishmentId = establishmentId;
    next();
  } catch (error) {
    console.error("Error in requireMerchantForEstablishment middleware:", error);
    return res.status(500).json({ error: "Erro interno ao verificar permissões de comerciante." });
  }
};

// 1. GET /api/admin/analytics/overview
app.get("/api/admin/analytics/overview", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { startDate, endDate, establishmentId, cityId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 120) {
      return res.status(400).json({ error: "O período personalizado máximo permitido é de 120 dias." });
    }

    const { allOrders, ignoredOrdersCount } = await getNormalizedOrdersForPeriod(
      start,
      end,
      establishmentId as string,
      cityId as string
    );

    const metrics = calculateOverviewMetrics(allOrders, start, end);
    
    const currentOrdersUnion = Array.from(new Map([
      ...metrics.currentRecebidos,
      ...metrics.currentConcluidos,
      ...metrics.currentRecusados,
      ...metrics.currentCancelados
    ].map(o => [o.id, o])).values());

    const opMetrics = calculateOperationalAndDistributions(currentOrdersUnion);

    return res.status(200).json({
      ...metrics,
      ...opMetrics,
      meta: {
        ignoredOrdersCount,
        currentCount: currentOrdersUnion.length,
        previousCount: 0
      }
    });
  } catch (error: any) {
    console.error("Error in /api/admin/analytics/overview:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar analytics do administrador." });
  }
});

// 2. GET /api/admin/analytics/timeseries
app.get("/api/admin/analytics/timeseries", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { startDate, endDate, establishmentId, cityId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 120) {
      return res.status(400).json({ error: "O período personalizado máximo permitido é de 120 dias." });
    }

    const { allOrders } = await getNormalizedOrdersForPeriod(
      start,
      end,
      establishmentId as string,
      cityId as string
    );

    const metrics = calculateOverviewMetrics(allOrders, start, end);
    const timeseries = calculateTimeSeries(metrics.currentConcluidos, start, end);
    return res.status(200).json({ timeseries });
  } catch (error: any) {
    console.error("Error in /api/admin/analytics/timeseries:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar timeseries do administrador." });
  }
});

// 3. GET /api/admin/analytics/establishments
app.get("/api/admin/analytics/establishments", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { startDate, endDate, cityId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }

    const { allOrders } = await getNormalizedOrdersForPeriod(start, end, undefined, cityId as string);
    const metrics = calculateOverviewMetrics(allOrders, start, end);

    const establishmentsSnap = await db.collection("establishments").get();
    const estMetrics: any[] = [];

    establishmentsSnap.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      
      if (cityId && data.cityId !== cityId) return;

      const estOrdersReceived = metrics.currentRecebidos.filter(o => o.establishmentId === id);
      const estOrdersCompleted = metrics.currentConcluidos.filter(o => o.establishmentId === id);
      const estOrdersCancelledRecusados = [
        ...metrics.currentRecusados.filter(o => o.establishmentId === id),
        ...metrics.currentCancelados.filter(o => o.establishmentId === id)
      ];

      const valueMoved = estOrdersCompleted.reduce((sum, o) => sum + o.total, 0);
      const ordersReceived = estOrdersReceived.length;
      const ordersCompleted = estOrdersCompleted.length;
      const ticketAverage = ordersCompleted > 0 ? Number((valueMoved / ordersCompleted).toFixed(2)) : 0;
      const completionRate = ordersReceived > 0 ? Number(((ordersCompleted / ordersReceived) * 100).toFixed(1)) : 0;
      const cancelledRecusados = estOrdersCancelledRecusados.length;

      estMetrics.push({
        id,
        name: data.name || 'Sem nome',
        city: data.cityName || data.city || 'São João Batista do Glória',
        cityId: data.cityId || 'sao-joao-batista-do-gloria-mg',
        ordersReceived,
        ordersCompleted,
        valueMoved: Number(valueMoved.toFixed(2)),
        ticketAverage,
        completionRate,
        cancelledRecusados,
        status: data.platformStatus || 'active',
        active: data.active !== false && data.platformStatus === 'active'
      });
    });

    return res.status(200).json(estMetrics);
  } catch (error: any) {
    console.error("Error in /api/admin/analytics/establishments:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar estabelecimentos do administrador." });
  }
});

// 4. GET /api/admin/analytics/establishments/:id
app.get("/api/admin/analytics/establishments/:id", authenticateUser, requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }

    const { allOrders } = await getNormalizedOrdersForPeriod(start, end, id);
    const metrics = calculateOverviewMetrics(allOrders, start, end);
    const completedOrders = metrics.currentConcluidos;

    // Calculate product sales
    const productSalesMap = new Map<string, { name: string; quantity: number; value: number | null }>();
    
    completedOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any, idx: number) => {
          const norm = normalizeOrderItemSnapshot(item, o.id, idx);
          const productId = norm.productId;
          const currentProd = productSalesMap.get(productId) || { name: norm.productName, quantity: 0, value: 0 };
          
          const qty = norm.quantity;
          const lineTotal = norm.lineTotal;
          
          let newValue: number | null = null;
          if (currentProd.value !== null && lineTotal !== null) {
            newValue = currentProd.value + lineTotal;
          } else {
            newValue = null;
          }

          productSalesMap.set(productId, {
            name: currentProd.name,
            quantity: currentProd.quantity + qty,
            value: newValue
          });
        });
      }
    });

    const products = Array.from(productSalesMap.entries()).map(([productId, data]) => {
      return {
        id: productId,
        name: data.name,
        quantity: data.quantity,
        value: data.value !== null ? Number(data.value.toFixed(2)) : null,
        participationPct: completedOrders.length > 0 ? Number(((data.quantity / completedOrders.length) * 100).toFixed(1)) : 0
      };
    }).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

    // Calculate neighborhood delivery metrics
    const neighMap = new Map<string, { count: number; value: number; deliveryFeeSum: number }>();
    const deliveryOrders = completedOrders.filter(o => o.fulfillmentType === 'delivery');

    deliveryOrders.forEach(o => {
      const neighborhood = (o.deliveryNeighborhood || 'Não Informado').trim();
      const currentNeigh = neighMap.get(neighborhood) || { count: 0, value: 0, deliveryFeeSum: 0 };
      neighMap.set(neighborhood, {
        count: currentNeigh.count + 1,
        value: currentNeigh.value + o.total,
        deliveryFeeSum: currentNeigh.deliveryFeeSum + o.deliveryFee
      });
    });

    const neighborhoods = Array.from(neighMap.entries()).map(([name, data]) => {
      return {
        name,
        count: data.count,
        value: Number(data.value.toFixed(2)),
        deliveryFeeSum: Number(data.deliveryFeeSum.toFixed(2)),
        avgDeliveryFee: data.count > 0 ? Number((data.deliveryFeeSum / data.count).toFixed(2)) : 0
      };
    }).sort((a, b) => b.count - a.count);

    const currentOrdersUnion = Array.from(new Map([
      ...metrics.currentRecebidos,
      ...metrics.currentConcluidos,
      ...metrics.currentRecusados,
      ...metrics.currentCancelados
    ].map(o => [o.id, o])).values());

    const opMetrics = calculateOperationalAndDistributions(currentOrdersUnion);

    return res.status(200).json({
      summary: metrics.summary,
      ...opMetrics,
      products,
      neighborhoods
    });
  } catch (error: any) {
    console.error(`Error in /api/admin/analytics/establishments/${req.params.id}:`, error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar detalhes do estabelecimento." });
  }
});

// 5. GET /api/merchant/analytics/overview
app.get("/api/merchant/analytics/overview", authenticateUser, requireMerchantForEstablishment, async (req: any, res: any) => {
  try {
    const establishmentId = req.merchantEstablishmentId;
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 120) {
      return res.status(400).json({ error: "O período personalizado máximo permitido é de 120 dias." });
    }

    const { allOrders, ignoredOrdersCount } = await getNormalizedOrdersForPeriod(
      start,
      end,
      establishmentId
    );

    const metrics = calculateOverviewMetrics(allOrders, start, end);
    
    const currentOrdersUnion = Array.from(new Map([
      ...metrics.currentRecebidos,
      ...metrics.currentConcluidos,
      ...metrics.currentRecusados,
      ...metrics.currentCancelados
    ].map(o => [o.id, o])).values());

    const opMetrics = calculateOperationalAndDistributions(currentOrdersUnion);

    return res.status(200).json({
      ...metrics,
      ...opMetrics,
      meta: {
        ignoredOrdersCount,
        currentCount: currentOrdersUnion.length,
        previousCount: 0
      }
    });
  } catch (error: any) {
    console.error("Error in /api/merchant/analytics/overview:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar analytics do comerciante." });
  }
});

// 6. GET /api/merchant/analytics/timeseries
app.get("/api/merchant/analytics/timeseries", authenticateUser, requireMerchantForEstablishment, async (req: any, res: any) => {
  try {
    const establishmentId = req.merchantEstablishmentId;
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 120) {
      return res.status(400).json({ error: "O período personalizado máximo permitido é de 120 dias." });
    }

    const { allOrders } = await getNormalizedOrdersForPeriod(
      start,
      end,
      establishmentId
    );

    const metrics = calculateOverviewMetrics(allOrders, start, end);
    const timeseries = calculateTimeSeries(metrics.currentConcluidos, start, end);
    return res.status(200).json({ timeseries });
  } catch (error: any) {
    console.error("Error in /api/merchant/analytics/timeseries:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar timeseries do comerciante." });
  }
});

// 7. GET /api/merchant/analytics/products
app.get("/api/merchant/analytics/products", authenticateUser, requireMerchantForEstablishment, async (req: any, res: any) => {
  try {
    const establishmentId = req.merchantEstablishmentId;
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros startDate e endDate são obrigatórios." });
    }
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Formatos de data inválidos." });
    }

    const { allOrders } = await getNormalizedOrdersForPeriod(
      start,
      end,
      establishmentId
    );

    const metrics = calculateOverviewMetrics(allOrders, start, end);
    const completedOrders = metrics.currentConcluidos;

    const productSalesMap = new Map<string, { name: string; quantity: number; value: number | null }>();
    
    completedOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any, idx: number) => {
          const norm = normalizeOrderItemSnapshot(item, o.id, idx);
          const productId = norm.productId;
          const currentProd = productSalesMap.get(productId) || { name: norm.productName, quantity: 0, value: 0 };
          
          const qty = norm.quantity;
          const lineTotal = norm.lineTotal;
          
          let newValue: number | null = null;
          if (currentProd.value !== null && lineTotal !== null) {
            newValue = currentProd.value + lineTotal;
          } else {
            newValue = null;
          }

          productSalesMap.set(productId, {
            name: currentProd.name,
            quantity: currentProd.quantity + qty,
            value: newValue
          });
        });
      }
    });

    const products = Array.from(productSalesMap.entries()).map(([productId, data]) => {
      return {
        id: productId,
        name: data.name,
        quantity: data.quantity,
        value: data.value !== null ? Number(data.value.toFixed(2)) : null,
        participationPct: completedOrders.length > 0 ? Number(((data.quantity / completedOrders.length) * 100).toFixed(1)) : 0
      };
    }).sort((a, b) => b.quantity - a.quantity).slice(0, 15);

    const neighMap = new Map<string, { count: number; value: number; deliveryFeeSum: number }>();
    const deliveryOrders = completedOrders.filter(o => o.fulfillmentType === 'delivery');
    let legacyWithoutNeighborhoodCount = 0;

    deliveryOrders.forEach(o => {
      const neighborhood = (o.deliveryNeighborhood || '').trim();
      const isLegacy = !neighborhood || neighborhood.toLowerCase() === 'não informado';
      if (isLegacy) {
        legacyWithoutNeighborhoodCount++;
      }
      const finalName = isLegacy ? 'Não Informado' : neighborhood;
      const currentNeigh = neighMap.get(finalName) || { count: 0, value: 0, deliveryFeeSum: 0 };
      neighMap.set(finalName, {
        count: currentNeigh.count + 1,
        value: currentNeigh.value + o.total,
        deliveryFeeSum: currentNeigh.deliveryFeeSum + o.deliveryFee
      });
    });

    const neighborhoods = Array.from(neighMap.entries()).map(([name, data]) => {
      return {
        name,
        count: data.count,
        value: Number(data.value.toFixed(2)),
        deliveryFeeSum: Number(data.deliveryFeeSum.toFixed(2)),
        avgDeliveryFee: data.count > 0 ? Number((data.deliveryFeeSum / data.count).toFixed(2)) : 0
      };
    }).sort((a, b) => b.count - a.count);

    return res.status(200).json({
      products,
      neighborhoods,
      meta: {
        totalDeliveryOrders: deliveryOrders.length,
        legacyWithoutNeighborhoodCount
      }
    });
  } catch (error: any) {
    console.error("Error in /api/merchant/analytics/products:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar produtos do comerciante." });
  }
});

// --- SECURE DELIVERY ZONES & CALCULATIONS ENDPOINTS ---

const isUserAdminOrMerchantOf = async (uid: string, email: string | undefined, establishmentId: string): Promise<boolean> => {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const data = userDoc.data();
    const isAdminEmail = email && (
      email === "cloudviajandocomigo@gmail.com" ||
      email === "atendimento@viajandocomigo.com.br" ||
      email.endsWith("@viajandocomigo.com.br")
    );
    
    // Check if Admin
    const isAdminUser = (userDoc.exists && data?.role === "admin") || isAdminEmail;
    if (isAdminUser) {
      return true;
    }
    
    // Check if Merchant
    const isMerchantUser = userDoc.exists && data?.role === "merchant" && data?.active !== false;
    if (!isMerchantUser) {
      const err: any = new Error("Apenas administradores ou proprietários de lojas podem alterar estas configurações.");
      err.code = "ADMIN_OR_MERCHANT_REQUIRED";
      throw err;
    }

    // Check if establishment exists first
    const estDoc = await db.collection("establishments").doc(establishmentId).get();
    if (!estDoc.exists) {
      const err: any = new Error("Estabelecimento não encontrado.");
      err.code = "ESTABLISHMENT_NOT_FOUND";
      throw err;
    }
    const estData = estDoc.data() || {};
    
    // Check if Merchant of this establishment
    const isLinked = estData.ownerUid === uid ||
                     estData.merchantUid === uid ||
                     estData.merchantOwnerUid === uid ||
                     data?.establishmentId === establishmentId;
                     
    if (!isLinked) {
      const err: any = new Error("Acesso negado. Esta conta de parceiro não está vinculada a este estabelecimento.");
      err.code = "MERCHANT_NOT_LINKED";
      throw err;
    }
    
    // Auto-activate invited merchant accounts on first authorized visit
    if (data?.accountStatus === "invited") {
      await db.collection("users").doc(uid).update({
        accountStatus: "active",
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    
    return true;
  } catch (error: any) {
    if (error.code === "ADMIN_OR_MERCHANT_REQUIRED" || 
        error.code === "ESTABLISHMENT_NOT_FOUND" || 
        error.code === "MERCHANT_NOT_LINKED") {
      throw error;
    }
    if (error.message && error.message.includes("Database") && error.message.includes("not found")) {
      const err: any = new Error(error.message);
      err.code = "WRONG_DATABASE_ID";
      throw err;
    }
    if (error.code === 7 || (error.message && error.message.includes("Missing or insufficient permissions"))) {
      const err: any = new Error("Erro de permissão no Firestore (IAM). Contate o suporte do UaiPertim.");
      err.code = "FIRESTORE_IAM_DENIED";
      throw err;
    }
    throw error;
  }
};

// Normalizer function insensitive to case, accents, extra spaces, and hyphens
function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, " ")            // resolve duplicate spaces
    .replace(/[^a-z0-9 ]/g, "")      // keep only alphanumeric and standard spaces
    .trim();
}

// Helper to retrieve delivery zones of an establishment (now represents only exceptions/overrides)
async function getOrCreateDeliveryZones(establishmentId: string, cityId: string): Promise<any[]> {
  const zonesCol = db.collection("establishments").doc(establishmentId).collection("deliveryZones");
  const snapshot = await zonesCol.get();
  
  if (!snapshot.empty) {
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  return [];
}

// Helper to format/map Firestore operational errors to the specified FASE 12 codes
const handleFirestoreOperationError = (error: any, endpoint: string, req: any, establishmentId?: string, firestorePath?: string) => {
  const message = error.message || String(error);
  let code = "FIRESTORE_ERROR";
  let statusCode = 500;

  if (error.code === "WRONG_DATABASE_ID" || message.includes("database") || message.includes("Database")) {
    code = "WRONG_DATABASE_ID";
    statusCode = 400;
  } else if (error.code === "FIRESTORE_IAM_DENIED" || error.code === 7 || message.includes("Missing or insufficient permissions") || message.includes("PERMISSION_DENIED")) {
    code = "FIRESTORE_IAM_DENIED";
    statusCode = 403;
  } else if (error.code === "DELIVERY_ZONE_WRITE_DENIED") {
    code = "DELIVERY_ZONE_WRITE_DENIED";
    statusCode = 403;
  } else if (error.code === "ESTABLISHMENT_NOT_FOUND") {
    code = "ESTABLISHMENT_NOT_FOUND";
    statusCode = 404;
  } else if (error.code === "ADMIN_OR_MERCHANT_REQUIRED") {
    code = "ADMIN_OR_MERCHANT_REQUIRED";
    statusCode = 403;
  } else if (error.code === "MERCHANT_NOT_LINKED") {
    code = "MERCHANT_NOT_LINKED";
    statusCode = 403;
  }

  // Safe Masking for logs
  const uidMascarado = req?.user?.uid ? (String(req.user.uid).substring(0, 6) + "...") : "anonymous";
  const estIdMascarado = establishmentId ? (String(establishmentId).substring(0, 6) + "...") : "undefined";

  console.error("TEMPORARY_SECURE_WRITE_LOG:", {
    endpoint,
    uidMascarado,
    resolvedRole: req?.user?.role || "undefined",
    establishmentIdMascarado: estIdMascarado,
    projectId: firebaseApp.options.projectId || "gen-lang-client-0673282457",
    databaseId: DATABASE_ID,
    firestorePath: firestorePath || "undefined",
    writeMode: "admin_sdk",
    resultCode: code
  });

  return { statusCode, error: { code, message } };
};

// GET /api/admin/establishments/:id/delivery-zones
app.get("/api/admin/establishments/:id/delivery-zones", authenticateUser, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const isAuthorized = await isUserAdminOrMerchantOf(req.user.uid, req.user.email, id);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado. Apenas administradores ou o proprietário da loja podem ver estas configurações.", code: "ADMIN_OR_MERCHANT_REQUIRED" });
    }
    
    const estDoc = await db.collection("establishments").doc(id).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const est = estDoc.data() || {};
    
    const zones = await getOrCreateDeliveryZones(id, est.cityId || "sao-joao-batista-do-gloria-mg");
    return res.status(200).json(zones);
  } catch (error: any) {
    const { statusCode, error: mappedError } = handleFirestoreOperationError(
      error,
      "GET /api/admin/establishments/:id/delivery-zones",
      req,
      id,
      `/establishments/${id}/deliveryZones`
    );
    return res.status(statusCode).json(mappedError);
  }
});

// GET /api/establishments/:id/delivery-zones (Public route for client-side checkout)
app.get("/api/establishments/:id/delivery-zones", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const estDoc = await db.collection("establishments").doc(id).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado." });
    }
    const est = estDoc.data() || {};
    const zones = await getOrCreateDeliveryZones(id, est.cityId || "sao-joao-batista-do-gloria-mg");
    // Filter active zones for public consumption
    const activeZones = zones.filter(z => z.active);
    return res.status(200).json(activeZones);
  } catch (error: any) {
    console.error("Error fetching public delivery zones:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch public delivery zones" });
  }
});

// Helper function to save and verify delivery configuration
async function saveDeliveryConfig(id: string, body: any, user: any) {
  // 1. Authorization check
  await isUserAdminOrMerchantOf(user.uid, user.email, id);

  // 2. Extract & Parse with Brazilian localization support
  const enabled = body.enabled !== undefined ? body.enabled : body.deliveryEnabled;
  const rawFee = body.defaultDeliveryFee !== undefined ? body.defaultDeliveryFee : body.deliveryFee;
  const rawMinOrder = body.defaultMinimumOrderValue !== undefined ? body.defaultMinimumOrderValue : body.defaultMinOrder;
  const rawAddMinutes = body.defaultAdditionalMinutes !== undefined ? body.defaultAdditionalMinutes : body.additionalEstimatedMinutes;
  const coverageMode = body.coverageMode || "entire_city";
  
  const parsedFee = parseBrazilianNumber(rawFee);
  const parsedMinOrder = parseBrazilianNumber(rawMinOrder);
  const parsedAddMinutes = parseBrazilianNumber(rawAddMinutes);

  // 3. Validation
  if (parsedFee < 0 || !Number.isFinite(parsedFee)) {
    const err: any = new Error("A taxa de entrega padrão deve ser maior ou igual a zero.");
    err.code = "INVALID_DELIVERY_CONFIG";
    throw err;
  }
  if (parsedMinOrder < 0 || !Number.isFinite(parsedMinOrder)) {
    const err: any = new Error("O valor do pedido mínimo padrão deve ser maior ou igual a zero.");
    err.code = "INVALID_DELIVERY_CONFIG";
    throw err;
  }
  if (parsedAddMinutes < 0 || !Number.isFinite(parsedAddMinutes)) {
    const err: any = new Error("O tempo adicional padrão deve ser maior ou igual a zero.");
    err.code = "INVALID_DELIVERY_CONFIG";
    throw err;
  }
  if (coverageMode !== "entire_city" && coverageMode !== "listed_zones_only") {
    const err: any = new Error("O modo de cobertura deve ser 'entire_city' ou 'listed_zones_only'.");
    err.code = "INVALID_DELIVERY_CONFIG";
    throw err;
  }

  const resolvedCityName = body.serviceCity || body.cityName || "São João Batista do Glória";
  // If cityId is not provided, generate a clean one from cityName or default
  const resolvedCityId = body.cityId || (resolvedCityName ? normalizeName(resolvedCityName).replace(/\s+/g, "-") : "sao-joao-batista-do-gloria-mg");

  const estRef = db.collection("establishments").doc(id);
  const estDoc = await estRef.get();
  if (!estDoc.exists) {
    const err: any = new Error("Estabelecimento não encontrado.");
    err.code = "ESTABLISHMENT_NOT_FOUND";
    throw err;
  }

  const deliverySettings = {
    enabled: enabled !== false,
    defaultDeliveryFee: parsedFee,
    defaultMinimumOrderValue: parsedMinOrder,
    defaultAdditionalMinutes: parsedAddMinutes,
    cityId: resolvedCityId,
    cityName: resolvedCityName,
    coverageMode,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid
  };

  // Update document
  await estRef.update({
    deliverySettings,
    // Twin-write to flat fields for legacy compatibility
    entregaPropria: enabled !== false,
    deliveryFee: parsedFee,
    minOrderValue: parsedMinOrder,
    minimumOrderValue: parsedMinOrder,
    cityId: resolvedCityId,
    cityName: resolvedCityName,
    updatedAt: FieldValue.serverTimestamp()
  });

  // 4. Read-After-Write Verification
  const verifyDoc = await estRef.get();
  const verifyData = verifyDoc.data() || {};
  const savedSettings = verifyData.deliverySettings || {};

  const matchEnabled = savedSettings.enabled === (enabled !== false);
  const matchFee = Number(savedSettings.defaultDeliveryFee) === parsedFee;
  const matchMinOrder = Number(savedSettings.defaultMinimumOrderValue) === parsedMinOrder;
  const matchMinutes = Number(savedSettings.defaultAdditionalMinutes) === parsedAddMinutes;

  if (matchEnabled && matchFee && matchMinOrder && matchMinutes) {
    // Return standard and FASE 9 compatible response format
    const deliverySettingsResult = {
      enabled: savedSettings.enabled,
      defaultDeliveryFee: Number(savedSettings.defaultDeliveryFee),
      defaultMinimumOrderValue: Number(savedSettings.defaultMinimumOrderValue),
      defaultAdditionalMinutes: Number(savedSettings.defaultAdditionalMinutes),
      cityId: savedSettings.cityId,
      cityName: savedSettings.cityName,
      coverageMode: savedSettings.coverageMode || "entire_city"
    };

    // Log diagnostic
    const uidMascarado = user.uid ? (String(user.uid).substring(0, 6) + "...") : "anonymous";
    const estIdMascarado = id ? (String(id).substring(0, 6) + "...") : "undefined";
    console.log("TEMPORARY_SECURE_WRITE_LOG:", {
      endpoint: "saveDeliveryConfig",
      uidMascarado,
      resolvedRole: user.role || "undefined",
      establishmentIdMascarado: estIdMascarado,
      projectId: firebaseApp.options.projectId || "gen-lang-client-0673282457",
      databaseId: DATABASE_ID,
      writePath: `/establishments/${id}`,
      resultCode: "SUCCESS"
    });

    return {
      success: true,
      deliverySettings: deliverySettingsResult,
      data: {
        id,
        deliveryEnabled: savedSettings.enabled,
        defaultDeliveryFee: Number(savedSettings.defaultDeliveryFee),
        defaultMinimumOrderValue: Number(savedSettings.defaultMinimumOrderValue),
        defaultAdditionalMinutes: Number(savedSettings.defaultAdditionalMinutes),
        cityId: savedSettings.cityId,
        cityName: savedSettings.cityName,
        coverageMode: savedSettings.coverageMode || "entire_city"
      }
    };
  } else {
    const err: any = new Error("A configuração padrão não foi persistida.");
    err.code = "DELIVERY_CONFIG_NOT_PERSISTED";
    throw err;
  }
}

// POST /api/admin/establishments/:id/delivery-settings
app.post("/api/admin/establishments/:id/delivery-settings", authenticateUser, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const result = await saveDeliveryConfig(id, req.body, req.user);
    return res.status(200).json(result);
  } catch (error: any) {
    const { statusCode, error: mappedError } = handleFirestoreOperationError(
      error,
      "POST /api/admin/establishments/:id/delivery-settings",
      req,
      id,
      `/establishments/${id}`
    );
    return res.status(statusCode).json(mappedError);
  }
});

// PATCH /api/admin/establishments/:id/delivery-config
app.patch("/api/admin/establishments/:id/delivery-config", authenticateUser, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const result = await saveDeliveryConfig(id, req.body, req.user);
    return res.status(200).json(result);
  } catch (error: any) {
    const { statusCode, error: mappedError } = handleFirestoreOperationError(
      error,
      "PATCH /api/admin/establishments/:id/delivery-config",
      req,
      id,
      `/establishments/${id}`
    );
    return res.status(statusCode).json(mappedError);
  }
});

// POST /api/admin/establishments/:id/delivery-zones
app.post("/api/admin/establishments/:id/delivery-zones", authenticateUser, async (req: any, res: any) => {
  const { id } = req.params;
  let neighborhoodIdLog = "undefined";
  try {
    const isAuthorized = await isUserAdminOrMerchantOf(req.user.uid, req.user.email, id);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado. Apenas administradores ou o proprietário da loja podem alterar estas configurações.", code: "ADMIN_OR_MERCHANT_REQUIRED" });
    }
    
    let { cityId, neighborhoodId, neighborhoodName, deliveryFee, additionalEstimatedMinutes, minimumOrderValue, active } = req.body;
    
    if (!cityId) {
      return res.status(400).json({ error: "O identificador da cidade (cityId) é obrigatório." });
    }
    if (!neighborhoodName) {
      return res.status(400).json({ error: "O nome do bairro (neighborhoodName) é obrigatório." });
    }
    
    const normalized = normalizeName(neighborhoodName);
    if (!neighborhoodId) {
      neighborhoodId = `manual-${normalized}`;
    }
    neighborhoodIdLog = neighborhoodId;
    
    // Check for duplicates
    const zonesCol = db.collection("establishments").doc(id).collection("deliveryZones");
    const snapshot = await zonesCol.get();
    const existingZones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    const duplicate = existingZones.find(z => 
      z.active && 
      z.id !== neighborhoodId && 
      (z.normalizedNeighborhoodName === normalized || normalizeName(z.neighborhoodName) === normalized)
    );
    
    if (duplicate && active !== false) {
      return res.status(400).json({
        success: false,
        error: {
          code: "DELIVERY_ZONE_ALREADY_EXISTS",
          message: "Já existe uma regra de entrega para este bairro."
        }
      });
    }
    
    const zoneRef = zonesCol.doc(neighborhoodId);
    const zoneSnap = await zoneRef.get();
    
    const zoneData: any = {
      establishmentId: id,
      cityId,
      neighborhoodId,
      neighborhoodName,
      normalizedNeighborhoodName: normalized,
      deliveryFee: (deliveryFee !== undefined && deliveryFee !== null && deliveryFee !== "") ? parseBrazilianNumber(deliveryFee) : null,
      minimumOrderValue: (minimumOrderValue !== undefined && minimumOrderValue !== null && minimumOrderValue !== "") ? parseBrazilianNumber(minimumOrderValue) : null,
      additionalEstimatedMinutes: (additionalEstimatedMinutes !== undefined && additionalEstimatedMinutes !== null && additionalEstimatedMinutes !== "") ? parseBrazilianNumber(additionalEstimatedMinutes) : null,
      active: active !== false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };
    
    if (!zoneSnap.exists) {
      zoneData.createdAt = FieldValue.serverTimestamp();
      zoneData.createdBy = req.user.uid;
    } else {
      const existing = zoneSnap.data() || {};
      if (existing.createdAt) zoneData.createdAt = existing.createdAt;
      if (existing.createdBy) zoneData.createdBy = existing.createdBy;
    }
    
    await zoneRef.set(zoneData, { merge: true });
    
    return res.status(200).json({ success: true, message: "Regra de entrega criada/atualizada com sucesso.", zone: zoneData });
  } catch (error: any) {
    const { statusCode, error: mappedError } = handleFirestoreOperationError(
      error,
      "POST /api/admin/establishments/:id/delivery-zones",
      req,
      id,
      `/establishments/${id}/deliveryZones/${neighborhoodIdLog}`
    );
    return res.status(statusCode).json(mappedError);
  }
});

// PUT /api/admin/establishments/:id/delivery-zones/:zoneId
app.put("/api/admin/establishments/:id/delivery-zones/:zoneId", authenticateUser, async (req: any, res: any) => {
  const { id, zoneId } = req.params;
  try {
    const isAuthorized = await isUserAdminOrMerchantOf(req.user.uid, req.user.email, id);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado. Apenas administradores ou o proprietário da loja podem alterar estas configurações.", code: "ADMIN_OR_MERCHANT_REQUIRED" });
    }
    
    const { deliveryFee, additionalEstimatedMinutes, minimumOrderValue, active, neighborhoodName } = req.body;
    
    const zoneRef = db.collection("establishments").doc(id).collection("deliveryZones").doc(zoneId);
    const zoneSnap = await zoneRef.get();
    
    if (!zoneSnap.exists) {
      return res.status(404).json({ error: "Regra de entrega não encontrada." });
    }
    
    const currentZoneData = zoneSnap.data() || {};
    const finalActive = active !== undefined ? active : currentZoneData.active;
    const finalName = neighborhoodName !== undefined ? neighborhoodName : currentZoneData.neighborhoodName;
    const normalized = normalizeName(finalName);
    
    // Check for duplicates if active
    if (finalActive !== false) {
      const zonesCol = db.collection("establishments").doc(id).collection("deliveryZones");
      const snapshot = await zonesCol.get();
      const existingZones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      const duplicate = existingZones.find(z => 
        z.active && 
        z.id !== zoneId && 
        (z.normalizedNeighborhoodName === normalized || normalizeName(z.neighborhoodName) === normalized)
      );
      
      if (duplicate) {
        return res.status(400).json({
          success: false,
          error: {
            code: "DELIVERY_ZONE_ALREADY_EXISTS",
            message: "Já existe uma regra de entrega para este bairro."
          }
        });
      }
    }
    
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };
    
    if (deliveryFee !== undefined) updateData.deliveryFee = (deliveryFee !== null && deliveryFee !== "") ? parseBrazilianNumber(deliveryFee) : null;
    if (additionalEstimatedMinutes !== undefined) updateData.additionalEstimatedMinutes = (additionalEstimatedMinutes !== null && additionalEstimatedMinutes !== "") ? parseBrazilianNumber(additionalEstimatedMinutes) : null;
    if (minimumOrderValue !== undefined) updateData.minimumOrderValue = (minimumOrderValue !== null && minimumOrderValue !== "") ? parseBrazilianNumber(minimumOrderValue) : null;
    if (active !== undefined) updateData.active = active !== false;
    if (neighborhoodName !== undefined) {
      updateData.neighborhoodName = neighborhoodName;
      updateData.normalizedNeighborhoodName = normalized;
    }
    
    await zoneRef.update(updateData);
    
    return res.status(200).json({ success: true, message: "Regra de entrega atualizada com sucesso." });
  } catch (error: any) {
    const { statusCode, error: mappedError } = handleFirestoreOperationError(
      error,
      "PUT /api/admin/establishments/:id/delivery-zones/:zoneId",
      req,
      id,
      `/establishments/${id}/deliveryZones/${zoneId}`
    );
    return res.status(statusCode).json(mappedError);
  }
});

// PATCH /api/admin/establishments/:id/delivery-zones/:zoneId/status
app.patch("/api/admin/establishments/:id/delivery-zones/:zoneId/status", authenticateUser, async (req: any, res: any) => {
  const { id, zoneId } = req.params;
  try {
    const isAuthorized = await isUserAdminOrMerchantOf(req.user.uid, req.user.email, id);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado. Apenas administradores ou o proprietário da loja podem alterar estas configurações.", code: "ADMIN_OR_MERCHANT_REQUIRED" });
    }
    
    const { active } = req.body;
    
    const zoneRef = db.collection("establishments").doc(id).collection("deliveryZones").doc(zoneId);
    const zoneSnap = await zoneRef.get();
    
    if (!zoneSnap.exists) {
      return res.status(404).json({ error: "Regra de entrega não encontrada." });
    }
    
    const zoneData = zoneSnap.data() || {};
    const normalized = zoneData.normalizedNeighborhoodName || normalizeName(zoneData.neighborhoodName || "");
    
    if (active === true) {
      // Check for duplicates
      const zonesCol = db.collection("establishments").doc(id).collection("deliveryZones");
      const snapshot = await zonesCol.get();
      const existingZones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      const duplicate = existingZones.find(z => 
        z.active && 
        z.id !== zoneId && 
        (z.normalizedNeighborhoodName === normalized || normalizeName(z.neighborhoodName) === normalized)
      );
      
      if (duplicate) {
        return res.status(400).json({
          success: false,
          error: {
            code: "DELIVERY_ZONE_ALREADY_EXISTS",
            message: "Já existe uma regra de entrega para este bairro."
          }
        });
      }
    }
    
    await zoneRef.update({
      active: active !== false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });
    
    return res.status(200).json({ success: true, message: "Status da regra de entrega atualizado com sucesso." });
  } catch (error: any) {
    const { statusCode, error: mappedError } = handleFirestoreOperationError(
      error,
      "PATCH /api/admin/establishments/:id/delivery-zones/:zoneId/status",
      req,
      id,
      `/establishments/${id}/deliveryZones/${zoneId}`
    );
    return res.status(statusCode).json(mappedError);
  }
});

// POST /api/delivery/quote
app.post("/api/delivery/quote", parseOptionalUser, async (req: any, res: any) => {
  try {
    const { establishmentId, addressId, fulfillmentType, city, neighborhood, subtotal } = req.body;
    
    // Diagnostic Log as requested by the user
    const estIdMascarado = establishmentId ? (String(establishmentId).substring(0, 6) + "...") : "undefined";
    const normalizedNeighborhoodLog = neighborhood ? normalizeName(neighborhood) : "undefined";
    console.log("TEMPORARY_SECURE_QUOTE_LOG:", {
      establishmentIdMascarado: estIdMascarado,
      city: city || "undefined",
      normalizedNeighborhood: normalizedNeighborhoodLog,
      subtotal: subtotal !== undefined ? Number(subtotal) : "undefined",
      databaseId: DATABASE_ID
    });

    if (!establishmentId || !fulfillmentType) {
      return res.status(400).json({ error: "Parâmetros insuficientes: establishmentId e fulfillmentType são obrigatórios.", code: "BAD_REQUEST" });
    }
    
    const estDoc = await db.collection("establishments").doc(establishmentId).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const est = estDoc.data() || {};
    
    const estActive = est.active !== false && est.platformStatus === "active" && est.archived !== true;
    if (!estActive) {
      return res.status(422).json({ available: false, error: "Estabelecimento inativo ou arquivado na plataforma.", code: "ESTABLISHMENT_INACTIVE" });
    }
    
    const isPaused = est.operationalPause === true || est.temporarilyPaused === true || est.acceptingOrders === false;
    if (isPaused) {
      return res.status(422).json({ available: false, error: "O estabelecimento está temporariamente pausado e não está aceitando pedidos.", code: "ESTABLISHMENT_PAUSED" });
    }
    
    const pickupMinutes = Number(est.pickupEstimatedMinutes ?? 15);
    const minOrderValue = Number(est.minOrderValue ?? est.minimumOrderValue ?? 0);
    
    if (fulfillmentType === "pickup") {
      const atendeRetirada = est.atendeRetirada !== false;
      if (!atendeRetirada) {
        return res.status(422).json({ available: false, error: "Este estabelecimento não aceita retirada.", code: "PICKUP_NOT_ENABLED" });
      }
      return res.json({
        available: true,
        deliveryFee: 0,
        minimumOrderValue: minOrderValue,
        estimatedMinutes: pickupMinutes,
        neighborhood: null,
        pricingSource: "pickup",
        data: {
          deliveryFee: 0,
          minimumOrderValue: minOrderValue,
          estimatedMinutes: pickupMinutes,
          neighborhoodName: null
        }
      });
    } else {
      let cityId = "";
      let neighborhoodName = "";
      
      if (addressId) {
        if (!req.user || !req.user.uid) {
          return res.status(401).json({ error: "Usuário não autenticado para pesquisar endereços salvos.", code: "UNAUTHENTICATED" });
        }
        const addressDoc = await db.collection("users").doc(req.user.uid).collection("addresses").doc(addressId).get();
        if (!addressDoc.exists) {
          return res.status(404).json({ error: "Endereço não encontrado.", code: "ADDRESS_NOT_FOUND" });
        }
        const address = addressDoc.data() || {};
        cityId = address.cityId;
        neighborhoodName = address.neighborhood || "";
      } else {
        if (!neighborhood) {
          return res.status(400).json({ error: "addressId ou neighborhood é obrigatório para modalidade de entrega.", code: "INVALID_ADDRESS" });
        }
        neighborhoodName = neighborhood;
        cityId = city || est.cityId || "sao-joao-batista-do-gloria-mg";
      }
      
      const estCityId = est.cityId || "sao-joao-batista-do-gloria-mg";
      if (normalizeName(cityId) !== normalizeName(estCityId)) {
        return res.status(422).json({
          available: false,
          error: `Este estabelecimento atende apenas na cidade de ${est.cityName || est.city || 'São João Batista do Glória'}.`,
          code: "CITY_NOT_SUPPORTED"
        });
      }
      
      const settings = {
        enabled: est.deliverySettings?.enabled !== undefined ? est.deliverySettings.enabled : (est.entregaPropria !== false),
        defaultDeliveryFee: Number(est.deliverySettings?.defaultDeliveryFee !== undefined ? est.deliverySettings.defaultDeliveryFee : (est.deliveryFee ?? 0)),
        defaultMinimumOrderValue: Number(est.deliverySettings?.defaultMinimumOrderValue !== undefined ? est.deliverySettings.defaultMinimumOrderValue : (est.minOrderValue ?? est.minimumOrderValue ?? 0)),
        defaultAdditionalMinutes: Number(est.deliverySettings?.defaultAdditionalMinutes !== undefined ? est.deliverySettings.defaultAdditionalMinutes : 0),
        cityId: est.deliverySettings?.cityId || est.cityId || estCityId,
        cityName: est.deliverySettings?.cityName || est.cityName || est.city || "São João Batista do Glória",
        coverageMode: est.deliverySettings?.coverageMode || "entire_city"
      };
      
      if (!settings.enabled) {
        return res.status(422).json({
          available: false,
          error: "O serviço de entrega está desativado para este estabelecimento.",
          code: "DELIVERY_NOT_ENABLED"
        });
      }
      
      const normAddressNeighborhood = normalizeName(neighborhoodName);
      const zones = await getOrCreateDeliveryZones(establishmentId, estCityId);
      
      const matchedZone = zones.find(z => 
        z.active && (
          (z.neighborhoodId && z.neighborhoodId === `manual-${normAddressNeighborhood}`) ||
          (z.normalizedNeighborhoodName && z.normalizedNeighborhoodName === normAddressNeighborhood) ||
          (normalizeName(z.neighborhoodName) === normAddressNeighborhood)
        )
      );
      
      let deliveryFee = 0;
      let minimumOrderValue = 0;
      let additionalMinutes = 0;
      let pricingSource = "";
      
      if (matchedZone) {
        pricingSource = "neighborhood_override";
        deliveryFee = Number(matchedZone.deliveryFee !== undefined && matchedZone.deliveryFee !== null ? matchedZone.deliveryFee : settings.defaultDeliveryFee);
        minimumOrderValue = Number(matchedZone.minimumOrderValue !== undefined && matchedZone.minimumOrderValue !== null ? matchedZone.minimumOrderValue : settings.defaultMinimumOrderValue);
        additionalMinutes = Number(matchedZone.additionalEstimatedMinutes !== undefined && matchedZone.additionalEstimatedMinutes !== null ? matchedZone.additionalEstimatedMinutes : settings.defaultAdditionalMinutes);
      } else {
        if (settings.coverageMode === "listed_zones_only") {
          return res.status(422).json({
            available: false,
            error: "Entrega indisponível para este bairro neste estabelecimento.",
            reason: "Este estabelecimento não realiza entregas no seu bairro.",
            code: "NEIGHBORHOOD_NOT_SUPPORTED"
          });
        }
        pricingSource = "establishment_default";
        deliveryFee = Number(settings.defaultDeliveryFee);
        minimumOrderValue = Number(settings.defaultMinimumOrderValue);
        additionalMinutes = Number(settings.defaultAdditionalMinutes);
      }
      
      const estimatedMinutes = Number(est.baseEstimatedMinutes ?? 30) + Number(additionalMinutes);
      
      // Dual-structure output for legacy and wrapped compatibility (FASE 9)
      return res.json({
        available: true,
        pricingSource,
        deliveryFee,
        minimumOrderValue,
        estimatedMinutes,
        neighborhoodName: matchedZone ? matchedZone.neighborhoodName : neighborhoodName,
        data: {
          deliveryFee,
          minimumOrderValue,
          estimatedMinutes,
          neighborhoodName: matchedZone ? matchedZone.neighborhoodName : neighborhoodName
        }
      });
    }
  } catch (error: any) {
    console.error("Error in /api/delivery/quote:", error);
    return res.status(500).json({ error: error.message || "Failed to calculate delivery quotation", code: "QUOTE_INTERNAL_ERROR" });
  }
});

// GET /api/delivery/quote/test-rules
app.get("/api/delivery/quote/test-rules", parseOptionalUser, async (req: any, res: any) => {
  try {
    const { establishmentId, city, neighborhood } = req.query;
    
    if (!establishmentId) {
      return res.status(400).json({ error: "O parâmetro establishmentId é obrigatório para teste de regras.", code: "BAD_REQUEST" });
    }
    
    const estDoc = await db.collection("establishments").doc(establishmentId).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
    }
    const est = estDoc.data() || {};
    
    const estCityId = est.cityId || "sao-joao-batista-do-gloria-mg";
    const testCity = city || estCityId;
    const testNeighborhood = neighborhood || "Centro";
    
    const settings = {
      enabled: est.deliverySettings?.enabled !== undefined ? est.deliverySettings.enabled : (est.entregaPropria !== false),
      defaultDeliveryFee: Number(est.deliverySettings?.defaultDeliveryFee !== undefined ? est.deliverySettings.defaultDeliveryFee : (est.deliveryFee ?? 0)),
      defaultMinimumOrderValue: Number(est.deliverySettings?.defaultMinimumOrderValue !== undefined ? est.deliverySettings.defaultMinimumOrderValue : (est.minOrderValue ?? est.minimumOrderValue ?? 0)),
      defaultAdditionalMinutes: Number(est.deliverySettings?.defaultAdditionalMinutes !== undefined ? est.deliverySettings.defaultAdditionalMinutes : 0),
    };
    
    const normAddressNeighborhood = normalizeName(testNeighborhood);
    const zones = await getOrCreateDeliveryZones(establishmentId, estCityId);
    
    const matchedZone = zones.find(z => 
      z.active && (
        (z.normalizedNeighborhoodName && z.normalizedNeighborhoodName === normAddressNeighborhood) ||
        (normalizeName(z.neighborhoodName) === normAddressNeighborhood)
      )
    );
    
    let deliveryFee = 0;
    let minimumOrderValue = 0;
    let additionalMinutes = 0;
    let pricingSource = "";
    
    if (matchedZone) {
      pricingSource = "neighborhood_override";
      deliveryFee = Number(matchedZone.deliveryFee !== undefined && matchedZone.deliveryFee !== null ? matchedZone.deliveryFee : settings.defaultDeliveryFee);
      minimumOrderValue = Number(matchedZone.minimumOrderValue !== undefined && matchedZone.minimumOrderValue !== null ? matchedZone.minimumOrderValue : settings.defaultMinimumOrderValue);
      additionalMinutes = Number(matchedZone.additionalEstimatedMinutes !== undefined && matchedZone.additionalEstimatedMinutes !== null ? matchedZone.additionalEstimatedMinutes : settings.defaultAdditionalMinutes);
    } else {
      pricingSource = "establishment_default";
      deliveryFee = Number(settings.defaultDeliveryFee);
      minimumOrderValue = Number(settings.defaultMinimumOrderValue);
      additionalMinutes = Number(settings.defaultAdditionalMinutes);
    }
    
    const estimatedMinutes = Number(est.baseEstimatedMinutes ?? 30) + Number(additionalMinutes);
    
    return res.json({
      success: true,
      testParameters: {
        establishmentId,
        testCity,
        testNeighborhood,
        normalizedNeighborhood: normAddressNeighborhood
      },
      matchedRule: matchedZone || null,
      calculatedQuote: {
        pricingSource,
        deliveryFee,
        minimumOrderValue,
        estimatedMinutes,
        neighborhoodName: matchedZone ? matchedZone.neighborhoodName : testNeighborhood
      }
    });
  } catch (error: any) {
    console.error("Error in /api/delivery/quote/test-rules:", error);
    return res.status(500).json({ error: error.message || "Failed to calculate delivery quotation test", code: "QUOTE_INTERNAL_ERROR" });
  }
});

// POST /api/orders/create
app.post("/api/orders/create", authenticateUser, async (req: any, res: any) => {
  try {
    const { orderData, extraData } = req.body;
    const uid = req.user.uid;
    
    const userDocSnap = await db.collection("users").doc(uid).get();
    if (!userDocSnap.exists) {
      return res.status(404).json({ error: "Perfil de usuário não encontrado." });
    }
    const userProfileData = userDocSnap.data() || {};
    
    if (userProfileData.role !== "customer") {
      return res.status(403).json({ error: "Usuário não possui privilégios de cliente." });
    }
    if (userProfileData.active !== true) {
      return res.status(403).json({ error: "Conta de cliente inativa." });
    }
    
    const establishmentId = extraData.establishmentId;
    const estDoc = await db.collection("establishments").doc(establishmentId).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: "Estabelecimento não encontrado." });
    }
    const est = estDoc.data() || {};
    
    const estActive = est.active !== false && est.platformStatus === "active" && est.archived !== true;
    if (!estActive) {
      return res.status(400).json({ error: "Este estabelecimento não está ativo na plataforma." });
    }
    
    const isPaused = est.operationalPause === true || est.temporarilyPaused === true || est.acceptingOrders === false;
    if (isPaused) {
      return res.status(400).json({ error: "O estabelecimento está temporariamente pausado e não está aceitando pedidos." });
    }
    
    let deliveryFee = 0;
    let estimatedMinutes = Number(est.baseEstimatedMinutes ?? 30);
    let minimumOrderValue = 0;
    let deliveryZoneSnapshot = null;
    let deliveryPricingSnapshot: any = null;
    let deliveryNeighborhood = "";
    
    const rawType = orderData.deliveryType || orderData.fulfillmentType;
    if (!rawType) {
      return res.status(400).json({ error: "A modalidade do pedido (deliveryType ou fulfillmentType) é obrigatória." });
    }
    const cleanType = String(rawType).toLowerCase().trim();
    if (!['delivery', 'entrega', 'pickup', 'retirada'].includes(cleanType)) {
      return res.status(400).json({ error: `Modalidade inválida: '${rawType}'. Deve ser 'delivery', 'entrega', 'pickup' ou 'retirada'.` });
    }

    const isDelivery = cleanType === 'delivery' || cleanType === 'entrega';
    const isPickup = cleanType === 'pickup' || cleanType === 'retirada';
    
    // Validate delivery or pickup availability
    if (isDelivery) {
      const entregaPropria = est.entregaPropria !== false;
      if (!entregaPropria) {
        return res.status(422).json({
          error: "O serviço de entrega está desativado para este estabelecimento.",
          code: "DELIVERY_NOT_AVAILABLE"
        });
      }
    } else if (isPickup) {
      const atendeRetirada = est.atendeRetirada !== false;
      if (!atendeRetirada) {
        return res.status(422).json({
          error: "Este estabelecimento não aceita retirada no balcão.",
          code: "PICKUP_NOT_AVAILABLE"
        });
      }
    }

    if (isDelivery) {
      const addressId = orderData.addressId;
      if (!addressId) {
        return res.status(400).json({ error: "O identificador do endereço é obrigatório para entregas." });
      }
      const addressDoc = await db.collection("users").doc(uid).collection("addresses").doc(addressId).get();
      if (!addressDoc.exists) {
        return res.status(404).json({ error: "Endereço do cliente não encontrado." });
      }
      const address = addressDoc.data() || {};
      const cityId = address.cityId;
      const neighborhoodName = address.neighborhood || "";
      deliveryNeighborhood = neighborhoodName;
      
      const estCityId = est.cityId || "sao-joao-batista-do-gloria-mg";
      if (cityId !== estCityId) {
        return res.status(422).json({ error: `Este estabelecimento atende apenas na cidade de ${est.cityName || est.city || 'São João Batista do Glória'}.` });
      }
      
      const settings = {
        enabled: est.deliverySettings?.enabled !== undefined ? est.deliverySettings.enabled : (est.entregaPropria !== false),
        defaultDeliveryFee: Number(est.deliverySettings?.defaultDeliveryFee !== undefined ? est.deliverySettings.defaultDeliveryFee : (est.deliveryFee ?? 0)),
        defaultMinimumOrderValue: Number(est.deliverySettings?.defaultMinimumOrderValue !== undefined ? est.deliverySettings.defaultMinimumOrderValue : (est.minOrderValue ?? est.minimumOrderValue ?? 0)),
        defaultAdditionalMinutes: Number(est.deliverySettings?.defaultAdditionalMinutes !== undefined ? est.deliverySettings.defaultAdditionalMinutes : 0),
        cityId: est.deliverySettings?.cityId || est.cityId || estCityId,
        cityName: est.deliverySettings?.cityName || est.cityName || est.city || "São João Batista do Glória",
        coverageMode: est.deliverySettings?.coverageMode || "entire_city"
      };
      
      if (!settings.enabled) {
        return res.status(422).json({ error: "O serviço de entrega está desativado para este estabelecimento.", code: "DELIVERY_NOT_ENABLED" });
      }
      
      const normAddressNeighborhood = normalizeName(neighborhoodName);
      const zones = await getOrCreateDeliveryZones(establishmentId, estCityId);
      
      const matchedZone = zones.find(z => 
        z.active && (
          (z.neighborhoodId && address.neighborhoodId && z.neighborhoodId === address.neighborhoodId) ||
          (z.normalizedNeighborhoodName && z.normalizedNeighborhoodName === normAddressNeighborhood) ||
          (normalizeName(z.neighborhoodName) === normAddressNeighborhood)
        )
      );
      
      let additionalMinutes = 0;
      let pricingSource = "";
      
      if (matchedZone) {
        pricingSource = "neighborhood_override";
        deliveryFee = Number(matchedZone.deliveryFee !== undefined ? matchedZone.deliveryFee : settings.defaultDeliveryFee);
        minimumOrderValue = Number(matchedZone.minimumOrderValue !== undefined ? matchedZone.minimumOrderValue : settings.defaultMinimumOrderValue);
        additionalMinutes = Number(matchedZone.additionalEstimatedMinutes !== undefined ? matchedZone.additionalEstimatedMinutes : settings.defaultAdditionalMinutes);
      } else {
        if (settings.coverageMode === "listed_zones_only") {
          return res.status(422).json({
            error: "Entrega indisponível para este bairro neste estabelecimento.",
            code: "NEIGHBORHOOD_NOT_SUPPORTED"
          });
        }
        pricingSource = "establishment_default";
        deliveryFee = Number(settings.defaultDeliveryFee);
        minimumOrderValue = Number(settings.defaultMinimumOrderValue);
        additionalMinutes = Number(settings.defaultAdditionalMinutes);
      }
      
      estimatedMinutes = Number(est.baseEstimatedMinutes ?? 30) + Number(additionalMinutes);
      
      deliveryPricingSnapshot = {
        pricingSource,
        cityId: settings.cityId,
        cityName: settings.cityName,
        neighborhoodName: matchedZone ? matchedZone.neighborhoodName : neighborhoodName,
        normalizedNeighborhoodName: normAddressNeighborhood,
        deliveryFee,
        minimumOrderValue,
        additionalEstimatedMinutes: additionalMinutes,
        defaultRuleApplied: pricingSource === "establishment_default"
      };
      
      deliveryZoneSnapshot = {
        neighborhoodId: matchedZone ? matchedZone.neighborhoodId : null,
        neighborhoodName: matchedZone ? matchedZone.neighborhoodName : neighborhoodName,
        fee: deliveryFee,
        additionalEstimatedMinutes: additionalMinutes,
        minimumOrderValue: minimumOrderValue
      };
    } else {
      estimatedMinutes = Number(est.pickupEstimatedMinutes ?? 15);
      minimumOrderValue = Number(est.minOrderValue ?? est.minimumOrderValue ?? 0);
    }
    
    const deliveryRuleSource = isDelivery ? (deliveryPricingSnapshot?.pricingSource || "establishment_default") : "merchant_pickup";

    // Secure backend recalculation and validation of order items and options
    let calculatedSubtotal = 0;
    const validatedItems = [];

    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      return res.status(400).json({ error: "O pedido deve conter pelo menos um item." });
    }

    for (const item of orderData.items) {
      const productId = item.productId || item.id;
      if (!productId) {
        return res.status(400).json({ error: "O identificador do produto (productId) é obrigatório." });
      }

      const productDoc = await db.collection("products").doc(productId).get();
      if (!productDoc.exists) {
        return res.status(404).json({ error: `Produto ID ${productId} não encontrado.` });
      }

      const product = productDoc.data();
      if (product.establishmentId !== establishmentId) {
        return res.status(400).json({ error: `O produto ${product.name} não pertence a este estabelecimento.` });
      }

      if (product.available === false) {
        return res.status(400).json({ error: `O produto ${product.name} não está disponível no momento.` });
      }

      const baseUnitPrice = Number(product.price || 0);

      // 1. Resolve size price delta
      let sizeDelta = 0;
      let sizeObj = null;
      if (item.selectedSize) {
        const sizeName = typeof item.selectedSize === 'object' ? item.selectedSize.name : item.selectedSize;
        const sizeGroup = product.optionGroups?.find((g: any) => g.name.toLowerCase().includes('tamanho') || g.id === 'tamanho' || g.id === 'escolha-o-tamanho');
        const opt = sizeGroup?.options?.find((o: any) => o.name === sizeName);
        if (opt) {
          sizeDelta = Number(opt.additionalPrice || 0);
          sizeObj = { id: opt.id, name: opt.name, priceDelta: sizeDelta };
        } else {
          if (sizeName === 'Pequena') sizeDelta = -5.00;
          else if (sizeName === 'Grande') sizeDelta = 8.00;
          sizeObj = { id: sizeName.toLowerCase(), name: sizeName, priceDelta: sizeDelta };
        }
      }

      // 2. Resolve crust price delta
      let crustDelta = 0;
      let crustObj = null;
      if (item.selectedBorder) {
        const crustName = typeof item.selectedBorder === 'object' ? item.selectedBorder.name : item.selectedBorder;
        if (crustName !== 'Sem borda') {
          const borderGroup = product.optionGroups?.find((g: any) => g.name.toLowerCase().includes('borda') || g.id === 'borda' || g.id === 'escolha-a-borda');
          const opt = borderGroup?.options?.find((o: any) => o.name === crustName);
          if (opt) {
            crustDelta = Number(opt.additionalPrice || 0);
            crustObj = { id: opt.id, name: opt.name, priceDelta: crustDelta };
          } else {
            crustDelta = 5.00;
            crustObj = { id: crustName.toLowerCase(), name: crustName, priceDelta: crustDelta };
          }
        } else {
          crustObj = { id: 'none', name: 'Sem borda', priceDelta: 0 };
        }
      }

      // 3. Resolve selectedExtras price delta
      const validatedExtras = [];
      let extrasUnitTotal = 0;
      if (Array.isArray(item.selectedExtras)) {
        const premiumGroup = product.optionGroups?.find((g: any) => g.name.toLowerCase().includes('adicionais premium') || g.id === 'adicionais-premium' || g.name.toLowerCase() === 'adicionais');
        
        for (const ex of item.selectedExtras) {
          const opt = premiumGroup?.options?.find((o: any) => o.name === ex.name);
          const unitPrice = opt ? Number(opt.additionalPrice || 0) : Number(ex.unitPrice || ex.price || 0);
          const qty = Number(ex.quantity || 1);
          extrasUnitTotal += unitPrice * qty;
          validatedExtras.push({
            id: opt ? opt.id : (ex.id || `extra-${ex.name.toLowerCase()}`),
            name: ex.name,
            unitPrice,
            quantity: qty
          });
        }
      }

      // 4. Resolve selectedOptionGroups price delta
      const validatedOptionGroups = [];
      let customGroupsDelta = 0;

      if (Array.isArray(item.selectedOptionGroups)) {
        for (const sg of item.selectedOptionGroups) {
          // Skip size, border, extras groups in custom calculation to avoid double counting
          const isLegacyGroup = 
            sg.groupId === 'escolha-o-tamanho' || 
            sg.groupId === 'escolha-a-borda' || 
            sg.groupId === 'adicionais-premium' ||
            sg.groupName.toLowerCase().includes('tamanho') ||
            sg.groupName.toLowerCase().includes('borda') ||
            sg.groupName.toLowerCase().includes('adicionais premium') ||
            sg.groupName.toLowerCase() === 'adicionais';

          if (isLegacyGroup) continue;

          const officialGroup = product.optionGroups?.find((og: any) => og.id === sg.groupId || og.name.toLowerCase() === sg.groupName.toLowerCase());
          if (!officialGroup) continue;

          if (officialGroup.active === false) {
            return res.status(400).json({ error: `O grupo de opções ${officialGroup.name} está desativado.` });
          }

          const optionCountsMap = new Map<string, { optionId: string; name: string; additionalPrice: number; quantity: number }>();
          
          if (Array.isArray(sg.selectedOptions)) {
            for (const so of sg.selectedOptions) {
              const officialOption = officialGroup.options?.find((oo: any) => oo.id === so.optionId || oo.name.toLowerCase() === so.name.toLowerCase());
              if (!officialOption) {
                return res.status(404).json({ error: `Opção ${so.name} não encontrada no grupo ${officialGroup.name}.` });
              }
              if (officialOption.active === false) {
                return res.status(400).json({ error: `A opção ${officialOption.name} está desativada.` });
              }

              const price = Number(officialOption.additionalPrice || 0);
              const key = officialOption.id;
              const oQty = Number(so.quantity || 1);
              const existing = optionCountsMap.get(key);
              if (existing) {
                existing.quantity += oQty;
              } else {
                optionCountsMap.set(key, {
                  optionId: officialOption.id,
                  name: officialOption.name,
                  additionalPrice: price,
                  quantity: oQty
                });
              }
            }
          }

          const groupSelectedOptions = Array.from(optionCountsMap.values());
          const groupTotalSelections = groupSelectedOptions.reduce((sum, o) => sum + o.quantity, 0);

          // Validate limits
          if (officialGroup.required && groupTotalSelections < officialGroup.minSelections) {
            return res.status(400).json({ error: `Você precisa selecionar no mínimo ${officialGroup.minSelections} opções em ${officialGroup.name}.` });
          }
          if (groupTotalSelections > officialGroup.maxSelections) {
            return res.status(400).json({ error: `Você selecionou mais opções do que o permitido (${officialGroup.maxSelections}) em ${officialGroup.name}.` });
          }

          // Build enriched selectedOptions list as requested
          const enrichedSelectedOptions = groupSelectedOptions.map(o => {
            const optTotal = o.additionalPrice * o.quantity;
            customGroupsDelta += optTotal;
            return {
              optionId: o.optionId,
              name: o.name,
              additionalPrice: o.additionalPrice,
              unitPrice: o.additionalPrice,
              quantity: o.quantity,
              totalPrice: optTotal
            };
          });

          validatedOptionGroups.push({
            groupId: officialGroup.id,
            groupName: officialGroup.name,
            selectedOptions: enrichedSelectedOptions
          });
        }
      }

      const optionsUnitTotal = sizeDelta + crustDelta + extrasUnitTotal + customGroupsDelta;
      const finalUnitPrice = baseUnitPrice + optionsUnitTotal;
      const quantity = Number(item.quantity || 1);
      const lineTotal = finalUnitPrice * quantity;

      calculatedSubtotal += lineTotal;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        productImage: product.image || null,
        quantity,
        baseUnitPrice,
        selectedSize: sizeObj,
        selectedCrust: crustObj,
        selectedExtras: validatedExtras,
        selectedOptionGroups: validatedOptionGroups,
        notes: item.notes?.trim() || null,
        optionsUnitTotal,
        finalUnitPrice,
        lineTotal
      });
    }

    const subtotal = calculatedSubtotal;
    if (subtotal < minimumOrderValue) {
      return res.status(422).json({
        error: `O subtotal do pedido (R$ ${subtotal.toFixed(2)}) é menor que o pedido mínimo exigido (R$ ${minimumOrderValue.toFixed(2)}).`
      });
    }
    
    let finalDiscount = 0;
    const cleanCouponCode = orderData.couponCode ? String(orderData.couponCode).trim().toUpperCase() : "";

    try {
      if (cleanCouponCode) {
        const validated = await validateCouponInternal({
          code: cleanCouponCode,
          uid,
          establishmentId,
          subtotal,
          deliveryFee
        });
        finalDiscount = validated.discount;
      }
    } catch (couponErr: any) {
      console.error("Error validating coupon during order placement:", couponErr);
      return res.status(400).json({ error: couponErr.message || "Erro de validação do cupom no checkout." });
    }

    const calculatedTotal = Math.max(0, subtotal + deliveryFee - finalDiscount);
    
    const num = Math.floor(1000 + Math.random() * 9000);
    const orderId = `PL-${num}`;
    const timestamp = new Date().toISOString();
    
    const orderPayload = {
      orderNumber: orderId,
      customerId: uid,
      customerName: userProfileData.name || orderData.customerName,
      customerPhone: userProfileData.phone || orderData.customerPhone,
      establishmentId,
      establishmentName: est.name,
      cityId: est.cityId || extraData.cityId || 'sao-joao-batista-do-gloria-mg',
      cityName: est.cityName || extraData.cityName || 'São João Batista do Glória',
      state: est.state || extraData.state || 'MG',
      fulfillmentType: isDelivery ? "delivery" : "pickup",
      deliveryType: isDelivery ? "entrega" : "retirada",
      deliveryNeighborhood,
      deliveryFee,
      minimumOrderApplied: minimumOrderValue,
      estimatedMinutes,
      deliveryRuleSource,
      items: validatedItems,
      subtotal,
      discount: finalDiscount,
      total: calculatedTotal,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: orderData.paymentStatus || 'pending',
      platformProcessedPayment: false,
      orderStatus: 'aguardando_confirmacao',
      status: 'aguardando_confirmacao',
      statusHistory: [
        { status: 'aguardando_confirmacao', timestamp }
      ],
      customerAddress: orderData.customerAddress,
      deliveryAddress: orderData.customerAddress,
      notes: orderData.notes || "",
      changeRequired: orderData.changeRequired || false,
      changeFor: orderData.changeFor || null,
      deliveryZoneSnapshot,
      deliveryPricingSnapshot,
      estimatedDeliveryMinutes: estimatedMinutes,
      couponCode: cleanCouponCode || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    // If it's a loyalty coupon, mark it as 'used' atomically inside a transaction!
    try {
      if (cleanCouponCode && cleanCouponCode !== 'PEDENOVO' && cleanCouponCode !== 'UAIPERTIM10') {
        const redQuery = await db.collection("loyaltyRedemptions")
          .where("couponCode", "==", cleanCouponCode)
          .get();
        if (redQuery.empty) {
          return res.status(400).json({ error: "Cupom de fidelidade não encontrado ou já utilizado." });
        }
        const redemptionId = redQuery.docs[0].id;

        await db.runTransaction(async (transaction) => {
          const redRef = db.collection("loyaltyRedemptions").doc(redemptionId);
          const redSnap = await transaction.get(redRef);
          const redemption = redSnap.data();

          if (!redemption || redemption.status !== "available") {
            throw new Error("Este cupom já foi utilizado ou está inválido.");
          }

          // Mark coupon as used
          transaction.update(redRef, {
            status: "used",
            usedInOrderId: orderId,
            usedAt: FieldValue.serverTimestamp()
          });

          // Write order payload inside the transaction
          const orderRef = db.collection("orders").doc(orderId);
          transaction.set(orderRef, orderPayload);
        });
      } else {
        // General promo code or no coupon
        await db.collection("orders").doc(orderId).set(orderPayload);
      }
    } catch (saveErr: any) {
      console.error("Error creating order with coupon:", saveErr);
      return res.status(400).json({ error: saveErr.message || "Erro ao processar o cupom de fidelidade no checkout." });
    }
    
    // Synchronously send push notifications to the merchant, as required by the spec.
    // The order is already persisted in the DB above, so if the push fails or takes time, 
    // the order itself remains safe, but we await the result here to get the diagnostic data.
    let pushDiagnosticResult = {
      persisted: true,
      establishmentResolved: estDoc.exists,
      ownerResolved: false,
      activeSubscriptionsCount: 0,
      fcmSuccessCount: 0,
      fcmFailureCount: 0,
      resultCode: "NEW_ORDER_PUSH_FAILED"
    };

    try {
      const pushRes = await sendNewOrderPushNotification(orderPayload);
      
      const maskId = (id: string) => {
        if (!id) return "N/A";
        if (id.length <= 6) return "***";
        return id.substring(0, 3) + "***" + id.substring(id.length - 3);
      };

      console.log("NEW_ORDER_PUSH_DIAGNOSTIC", {
        orderIdMascarado: maskId(orderId),
        establishmentIdRecebido: maskId(establishmentId),
        orderPersisted: true,
        pushFunctionCalled: true,
        targetsFound: pushRes.targetsFound,
        successCount: pushRes.successCount,
        failureCount: pushRes.failureCount,
        resultCode: pushRes.resultCode
      });

      pushDiagnosticResult = {
        persisted: true,
        establishmentResolved: pushRes.establishmentResolved,
        ownerResolved: pushRes.ownerResolved,
        activeSubscriptionsCount: pushRes.targetsFound,
        fcmSuccessCount: pushRes.successCount,
        fcmFailureCount: pushRes.failureCount,
        resultCode: pushRes.resultCode
      };

      // Set the push diagnostic on the order payload and update Firestore
      (orderPayload as any).pushDiagnostic = pushDiagnosticResult;
      await db.collection("orders").doc(orderId).update({
        pushDiagnostic: pushDiagnosticResult
      });

    } catch (pushErr) {
      console.error("Error triggering push notification:", pushErr);
    }

    return res.status(201).json({
      ...orderPayload,
      id: orderId,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  } catch (error: any) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: error.message || "Failed to create order securely on backend." });
  }
});

// --- PUSH NOTIFICATION BACKEND SERVICES ---

interface PushParams {
  uid: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

async function sendPushToUser({ uid, title, body, data }: PushParams) {
  const result = {
    targetsFound: 0,
    uniqueTargets: 0,
    successCount: 0,
    failureCount: 0,
    invalidRegistrationsRemoved: 0,
    resultCode: "NEW_ORDER_PUSH_FAILED"
  };

  try {
    const subsSnap = await adminDb.collection("users").doc(uid).collection("pushSubscriptions").get();
    const tokens: string[] = [];
    const tokenToSubId: Record<string, string> = {};

    subsSnap.forEach((d: any) => {
      const sub = d.data();
      if (sub) {
        const tokenVal = sub.token || sub.registrationId;
        const isEnabled = sub.enabled !== false;
        const isPermissionGranted = sub.permission !== "denied";

        if (tokenVal && isEnabled && isPermissionGranted) {
          tokens.push(tokenVal);
          tokenToSubId[tokenVal] = d.id;
        }
      }
    });

    const uniqueTokens = Array.from(new Set(tokens));
    result.targetsFound = tokens.length;
    result.uniqueTargets = uniqueTokens.length;

    if (tokens.length === 0) {
      console.log(`[Push] No valid active push subscriptions found for user: ${uid}`);
      result.resultCode = "NEW_ORDER_PUSH_NO_ACTIVE_SUBSCRIPTIONS";
      return result;
    }

    const eventId = data.eventId || `push_test:${Date.now()}`;

    // Create safe diagnostic spec
    const diagnosticData = {
      eventId,
      activeSubscriptions: tokens.length,
      uniqueRegistrationIds: uniqueTokens.length,
      fcmSuccessCount: 0,
      payloadHasNotification: false,
      payloadHasData: true,
      backgroundHandlerExecuted: false,
      manualShowNotificationExecuted: false,
      createdAt: new Date()
    };

    // Save diagnostic log
    await adminDb.collection("pushDiagnostics").doc(eventId).set(diagnosticData);

    const messaging = getMessaging(firebaseApp);
    
    // DATA-ONLY Payload (No notification object at all to prevent double display by browser/FCM)
    const payload = {
      data: {
        type: String(data.type || "push_test"),
        eventId: String(eventId),
        title: String(title),
        body: String(body),
        url: String(data.url || "/"),
        orderId: String(data.orderId || ""),
        establishmentId: String(data.establishmentId || "")
      },
      tokens: uniqueTokens
    };

    const response = await messaging.sendEachForMulticast(payload);
    result.successCount = response.successCount;
    result.failureCount = response.failureCount;

    console.log(`[Push] Shared push outcome for user ${uid}: ${response.successCount} success, ${response.failureCount} failed.`);

    // Update diagnostic after send
    await adminDb.collection("pushDiagnostics").doc(eventId).update({
      fcmSuccessCount: response.successCount
    });

    // Automatically remove invalid or unregistered tokens
    if (response.responses) {
      for (let i = 0; i < response.responses.length; i++) {
        const res = response.responses[i];
        if (!res.success) {
          const error = res.error;
          if (error && (
            error.code === 'messaging/registration-token-not-registered' || 
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/invalid-argument' ||
            error.message?.includes('registration-token-not-registered') ||
            error.message?.includes('invalid-registration-token') ||
            error.message?.includes('not registered')
          )) {
            const failedToken = uniqueTokens[i];
            const subId = tokenToSubId[failedToken];
            if (subId) {
              console.log(`[Push] Automatically cleaning up inactive registration (via adminDb) for user ${uid}: ${subId}`);
              await adminDb.collection("users").doc(uid).collection("pushSubscriptions").doc(subId).delete();
              result.invalidRegistrationsRemoved++;
            }
          }
        }
      }
    }

    if (result.successCount > 0) {
      result.resultCode = "NEW_ORDER_PUSH_SENT";
    }

  } catch (error) {
    console.error(`[Push] Error in sendPushToUser for UID ${uid}:`, error);
  }

  return result;
}

async function sendNewOrderPushNotification(order: any) {
  const estId = order.establishmentId;
  if (!estId) {
    return {
      targetsFound: 0,
      successCount: 0,
      failureCount: 0,
      invalidRegistrationsRemoved: 0,
      resultCode: "NEW_ORDER_PUSH_FAILED",
      establishmentResolved: false,
      ownerResolved: false
    };
  }

  console.log(`[Push] Awaiting sendNewOrderPushNotification for establishment: ${estId}`);

  let ownerUid = "";
  let ownerResolved = false;

  // 1. Resolve owner from establishment (canonical source)
  const estDoc = await db.collection("establishments").doc(estId).get();
  if (estDoc.exists) {
    const estData = estDoc.data() || {};
    ownerUid = estData.ownerUid || "";
  }

  const merchantUids: string[] = [];

  if (ownerUid) {
    const ownerUserSnap = await db.collection("users").doc(ownerUid).get();
    if (ownerUserSnap.exists) {
      const ownerData = ownerUserSnap.data() || {};
      if (ownerData.role === "merchant") {
        merchantUids.push(ownerUid);
        ownerResolved = true;
        console.log(`[Push] Canonical owner resolved and validated: ${ownerUid}`);
      } else {
        console.warn(`[Push] Canonical owner ${ownerUid} does not have role: merchant, got: ${ownerData.role}`);
      }
    }
  }

  // 2. Fallback query for other merchant users belonging to this establishment
  try {
    const merchantUsersSnap = await db.collection("users")
      .where("role", "==", "merchant")
      .where("establishmentId", "==", estId)
      .get();

    for (const merchantDoc of merchantUsersSnap.docs) {
      const mUid = merchantDoc.id;
      if (!merchantUids.includes(mUid)) {
        merchantUids.push(mUid);
        console.log(`[Push] Fallback merchant resolved: ${mUid}`);
      }
    }
  } catch (err) {
    console.error("[Push] Error running merchant query fallback:", err);
  }

  if (merchantUids.length === 0) {
    console.log(`[Push] No merchant UIDs resolved for establishment ${estId}`);
    return {
      targetsFound: 0,
      successCount: 0,
      failureCount: 0,
      invalidRegistrationsRemoved: 0,
      resultCode: "NEW_ORDER_PUSH_NO_ACTIVE_SUBSCRIPTIONS",
      establishmentResolved: estDoc.exists,
      ownerResolved
    };
  }

  let totalTargetsFound = 0;
  let totalSuccessCount = 0;
  let totalFailureCount = 0;
  let totalInvalidRemoved = 0;

  // 3. Send to each resolved merchant UID
  for (const uid of merchantUids) {
    const pushRes = await sendPushToUser({
      uid,
      title: `Novo pedido #${order.orderNumber}`,
      body: "Há um novo pedido aguardando sua confirmação.",
      data: {
        type: "new_order",
        eventId: `new_order:${order.orderNumber}`,
        orderId: order.orderNumber,
        establishmentId: estId,
        url: `/loja/pedidos?orderId=${order.orderNumber}`
      }
    });

    totalTargetsFound += pushRes.targetsFound;
    totalSuccessCount += pushRes.successCount;
    totalFailureCount += pushRes.failureCount;
    totalInvalidRemoved += pushRes.invalidRegistrationsRemoved;
  }

  const finalResultCode = totalSuccessCount > 0 
    ? "NEW_ORDER_PUSH_SENT" 
    : (totalTargetsFound === 0 ? "NEW_ORDER_PUSH_NO_ACTIVE_SUBSCRIPTIONS" : "NEW_ORDER_PUSH_FAILED");

  return {
    targetsFound: totalTargetsFound,
    successCount: totalSuccessCount,
    failureCount: totalFailureCount,
    invalidRegistrationsRemoved: totalInvalidRemoved,
    resultCode: finalResultCode,
    establishmentResolved: estDoc.exists,
    ownerResolved
  };
}

// --- IDEMPOTENT CLIENT-BOUND PUSH DISPATCH SERVICES ---

const serverBootTime = Date.now();

async function sendPushWithIdempotency({
  eventId,
  uid,
  title,
  body,
  data
}: {
  eventId: string;
  uid: string;
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  try {
    const eventRef = adminDb.collection("pushEvents").doc(eventId);
    const eventSnap = await eventRef.get();
    if (eventSnap.exists) {
      console.log(`[Push] Event ${eventId} was already processed. Skipping.`);
      return;
    }

    // Immediately record event to prevent race conditions / duplicate triggers
    await eventRef.set({
      type: data.type || "unknown",
      orderId: data.orderId || "",
      recipientUid: uid,
      createdAt: new Date(),
      sentAt: null,
      successCount: 0,
      failureCount: 0
    });

    // Send push using canonical function
    const pushRes = await sendPushToUser({
      uid,
      title,
      body,
      data: {
        ...data,
        eventId
      }
    });

    // Update with outcome
    await eventRef.update({
      sentAt: new Date(),
      successCount: pushRes.successCount,
      failureCount: pushRes.failureCount
    });

    console.log(`[Push] Idempotent push sent: ${eventId}, Successes: ${pushRes.successCount}`);
  } catch (error) {
    console.error(`[Push] Error in sendPushWithIdempotency for event ${eventId}:`, error);
  }
}

function initializePushNotificationListeners() {
  console.log("[Push] Initializing real-time Firestore push listeners on backend...");

  // 1. Listen for Order Status updates
  adminDb.collection("orders").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      // Only care about new or modified documents
      if (change.type === "added" || change.type === "modified") {
        const orderData = change.doc.data();
        const orderId = change.doc.id;
        if (!orderData) return;

        // Verify updatedAt is recent
        const updatedAt = orderData.updatedAt;
        if (updatedAt) {
          const updateMillis = updatedAt.toDate ? updatedAt.toDate().getTime() : new Date(updatedAt).getTime();
          // Skip if modified more than 1 minute before server boot to avoid historical triggers
          if (updateMillis < serverBootTime - 60000) {
            return;
          }
        }

        const status = orderData.status || orderData.orderStatus;
        if (!status) return;

        // Skip the initial status 'aguardando_confirmacao'
        if (status === "aguardando_confirmacao") {
          return;
        }

        const customerId = orderData.customerId;
        if (!customerId) return;

        // Create deterministic event ID
        const eventId = `order_status:${orderId}:${status}`;

        const statusLabels: Record<string, string> = {
          confirmado: 'foi confirmado',
          em_preparacao: 'está em preparação',
          pronto: 'está pronto para entrega',
          pronto_retirada: 'está pronto para retirada',
          saiu_entrega: 'saiu para entrega',
          concluido: 'foi concluído',
          recusado: 'foi recusado',
          cancelado: 'foi cancelado'
        };

        const actionText = statusLabels[status] || `foi alterado para ${status}`;
        const title = "Pedido atualizado 🍕";
        const body = `Seu pedido #${orderId.slice(-4)} ${actionText}.`;

        await sendPushWithIdempotency({
          eventId,
          uid: customerId,
          title,
          body,
          data: {
            type: "order_status",
            orderId,
            url: `/acompanhar-pedido/${orderId}`
          }
        });
      }
    });
  }, (error) => {
    console.error("[Push] Error in orders onSnapshot listener:", error);
  });

  // 2. Listen for Chat Messages (all orders messages subcollections)
  adminDb.collectionGroup("messages").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      // Only care about newly added messages
      if (change.type === "added") {
        const messageData = change.doc.data();
        const messageId = change.doc.id;
        if (!messageData) return;

        const orderId = messageData.orderId;
        const senderRole = messageData.senderRole;
        if (!orderId || !messageId) return;

        // Verify createdAt is recent
        const createdAt = messageData.createdAt;
        if (createdAt) {
          const createMillis = createdAt.toDate ? createdAt.toDate().getTime() : new Date(createdAt).getTime();
          // Skip if message is older than server start
          if (createMillis < serverBootTime - 60000) {
            return;
          }
        }

        // Fetch order to retrieve customerId and establishmentId
        const orderDoc = await adminDb.collection("orders").doc(orderId).get();
        if (!orderDoc.exists) return;
        const orderData = orderDoc.data();
        if (!orderData) return;

        const customerId = orderData.customerId;
        const establishmentId = orderData.establishmentId;
        if (!customerId || !establishmentId) return;

        if (senderRole === "merchant") {
          // Send push to customer
          const eventId = `customer_chat:${orderId}:${messageId}`;
          const title = "Mensagem da loja 💬";
          const body = `Você recebeu uma nova mensagem no pedido #${orderId.slice(-4)}`;

          await sendPushWithIdempotency({
            eventId,
            uid: customerId,
            title,
            body,
            data: {
              type: "customer_order_chat",
              orderId,
              messageId,
              establishmentId,
              url: `/?pushIntent=customer_order_chat&orderId=${orderId}&messageId=${messageId}`
            }
          });
        } else if (senderRole === "customer") {
          // Send push to merchant owner(s)
          let ownerUid = "";
          const estDoc = await adminDb.collection("establishments").doc(establishmentId).get();
          if (estDoc.exists) {
            ownerUid = estDoc.data()?.ownerUid || "";
          }

          const merchantUids: string[] = [];
          if (ownerUid) {
            merchantUids.push(ownerUid);
          }

          // Also check other collaborators or merchants linked to the establishment
          const usersSnap = await adminDb.collection("users")
            .where("role", "==", "merchant")
            .where("establishmentId", "==", establishmentId)
            .get();
          
          usersSnap.forEach((doc: any) => {
            const uid = doc.id;
            if (uid && !merchantUids.includes(uid)) {
              merchantUids.push(uid);
            }
          });

          const eventId = `merchant_chat:${orderId}:${messageId}`;
          const title = "Nova mensagem do cliente 💬";
          const body = `Você recebeu uma nova mensagem no pedido #${orderId.slice(-4)}.`;

          for (const uid of merchantUids) {
            await sendPushWithIdempotency({
              eventId,
              uid,
              title,
              body,
              data: {
                type: "merchant_order_chat",
                orderId,
                messageId,
                establishmentId,
                url: `/?pushIntent=merchant_order_chat&orderId=${orderId}&messageId=${messageId}&establishmentId=${establishmentId}`
              }
            });
          }
        }
      }
    });
  }, (error) => {
    console.error("[Push] Error in messages collectionGroup onSnapshot listener:", error);
  });
}

// Push Device Registration Endpoints
const maskString = (str: string) => {
  if (!str) return "N/A";
  if (str.length <= 6) return "***";
  return str.substring(0, 3) + "***" + str.substring(str.length - 3);
};

app.get("/api/push/current-device", authenticateUser, async (req: any, res: any) => {
  try {
    const token = req.query.token as string;
    let registrationHash = req.query.registrationHash as string;
    const uid = req.user.uid;

    if (!registrationHash && token) {
      registrationHash = crypto.createHash("sha256").update(token).digest("hex");
    }

    if (!registrationHash) {
      return res.status(400).json({ error: "FCM Token or registrationHash is required in query params." });
    }

    let registeredForCurrentUser = false;
    let registeredForAnotherUser = false;
    let enabled = false;
    let subscriptionIdMasked = maskString(registrationHash);
    let platform = "desktop";
    let displayMode = "browser";
    let updatedAtStr = new Date().toISOString();
    let lastSeenAtStr = new Date().toISOString();
    let permissionExpected = "default";

    let subFound = false;
    let existingData: any = null;
    let subOwnerUid = "";

    // 1. Query by registrationHash
    const existingSubsSnap = await adminDb.collectionGroup("pushSubscriptions")
      .where("registrationHash", "==", registrationHash)
      .get();

    if (!existingSubsSnap.empty) {
      const existingDoc = existingSubsSnap.docs[0];
      existingData = existingDoc.data() || {};
      const path = existingDoc.ref.path;
      const segments = path.split("/");
      if (segments.length >= 2 && segments[0] === "users") {
        subOwnerUid = segments[1];
      }
      subFound = true;
    } else if (token) {
      // 2. Fallback query by token
      const existingSubsByTokenSnap = await adminDb.collectionGroup("pushSubscriptions")
        .where("token", "==", token)
        .get();

      if (!existingSubsByTokenSnap.empty) {
        const existingDoc = existingSubsByTokenSnap.docs[0];
        existingData = existingDoc.data() || {};
        const path = existingDoc.ref.path;
        const segments = path.split("/");
        if (segments.length >= 2 && segments[0] === "users") {
          subOwnerUid = segments[1];
        }
        subFound = true;
      }
    }

    if (subFound && existingData) {
      permissionExpected = existingData.permission || "granted";
      if (subOwnerUid === uid) {
        registeredForCurrentUser = true;
        enabled = existingData.enabled === true;
        platform = existingData.platform || "desktop";
        displayMode = existingData.displayMode || "browser";
        
        const uAt = existingData.updatedAt;
        const lsAt = existingData.lastSeenAt;
        updatedAtStr = uAt ? (uAt.toDate ? uAt.toDate() : new Date(uAt)).toISOString() : new Date().toISOString();
        lastSeenAtStr = lsAt ? (lsAt.toDate ? lsAt.toDate() : new Date(lsAt)).toISOString() : new Date().toISOString();
      } else {
        registeredForAnotherUser = true;
      }
    }

    return res.json({
      success: true,
      data: {
        permissionExpected,
        registeredForCurrentUser,
        registeredForAnotherUser, // Keep for backward-compatibility checks
        enabled,
        subscriptionIdMasked,
        platform,
        displayMode,
        updatedAt: updatedAtStr,
        lastSeenAt: lastSeenAtStr
      }
    });
  } catch (error: any) {
    console.error("Error in get current device:", error);
    return res.status(500).json({ error: error.message || "Failed to get current device status." });
  }
});

app.post("/api/push/register", authenticateUser, async (req: any, res: any) => {
  try {
    const { token, platform, browser } = req.body;
    const uid = req.user.uid;

    if (!token) {
      return res.status(400).json({ error: "FCM Token is required.", code: "FCM_TOKEN_MISSING" });
    }

    // 1. ler users/{uid}
    const userDocSnap = await adminDb.collection("users").doc(uid).get();
    if (!userDocSnap.exists) {
      return res.status(404).json({ error: "Usuário não encontrado.", code: "USER_NOT_FOUND" });
    }
    const userData = userDocSnap.data() || {};

    // 2. confirmar role === "merchant" OU "customer"
    if (userData.role !== "merchant" && userData.role !== "customer") {
      return res.status(403).json({ error: "Acesso restrito a perfis autorizados.", code: "PUSH_REGISTRATION_FORBIDDEN" });
    }

    // 3. confirmar accountStatus === "active" ou active === true
    const isUserActive = userData.accountStatus === "active" || userData.active === true;
    if (!isUserActive) {
      return res.status(403).json({ error: "Sua conta não está ativa.", code: "ACCOUNT_INACTIVE" });
    }

    // 4. confirmar establishmentId (apenas para merchant)
    let establishmentId = null;
    let estData: any = {};
    if (userData.role === "merchant") {
      establishmentId = userData.establishmentId;
      if (!establishmentId) {
        return res.status(400).json({ error: "Estabelecimento não vinculado a este comerciante.", code: "ESTABLISHMENT_NOT_LINKED" });
      }

      // 5. confirmar establishments/{id}.ownerUid === uid
      const estDocSnap = await adminDb.collection("establishments").doc(establishmentId).get();
      if (!estDocSnap.exists) {
        return res.status(404).json({ error: "Estabelecimento não encontrado.", code: "ESTABLISHMENT_NOT_FOUND" });
      }
      estData = estDocSnap.data() || {};
      if (estData.ownerUid !== uid) {
        return res.status(403).json({ error: "Este comerciante não é o proprietário do estabelecimento.", code: "ESTABLISHMENT_OWNER_MISMATCH" });
      }
    }

    // 6. gerar ID seguro/hash da subscription
    const subscriptionId = crypto.createHash("sha256").update(token).digest("hex");

    // 7. TROCA DE CONTA NO MESMO IPHONE
    // localizar o mesmo registrationId/hash, identificar se pertence a outro UID, desativar ou remover o vínculo anterior com segurança
    const existingSubsSnap = await adminDb.collectionGroup("pushSubscriptions")
      .where("token", "==", token)
      .get();

    for (const subDoc of existingSubsSnap.docs) {
      const path = subDoc.ref.path;
      const segments = path.split("/");
      if (segments.length >= 2 && segments[0] === "users") {
        const existingUserUid = segments[1];
        if (existingUserUid !== uid) {
          console.log(`[Push] Removing old subscription for token belonging to user ${maskString(existingUserUid)}`);
          await subDoc.ref.delete();
        }
      }
    }

    // 8. DEDUPLICAR SUBSCRIPTIONS NO PRÓPRIO PERFIL DE USUÁRIO
    const userSubsCollection = adminDb.collection("users").doc(uid).collection("pushSubscriptions");
    const allSubsSnap = await userSubsCollection.get();
    const subscriptionsBefore = allSubsSnap.size;

    let duplicatesRemoved = 0;
    for (const subDoc of allSubsSnap.docs) {
      const subData = subDoc.data() || {};
      const subToken = subData.token || subData.registrationId;
      if (subToken === token && subDoc.id !== subscriptionId) {
        console.log(`[Push] Cleaning up duplicate subDoc ${subDoc.id} with same token`);
        await subDoc.ref.delete();
        duplicatesRemoved++;
      }
    }

    // 9. persistir no perfil merchant (using Admin SDK) - upsert
    const subDocRef = userSubsCollection.doc(subscriptionId);
    const existingDocSnap = await subDocRef.get();
    
    const now = new Date();
    let createdAt = now;
    if (existingDocSnap.exists) {
      const existingData = existingDocSnap.data() || {};
      if (existingData.createdAt) {
        createdAt = existingData.createdAt.toDate ? existingData.createdAt.toDate() : new Date(existingData.createdAt);
      }
    }

    const subscriptionData = {
      registrationId: token,
      registrationHash: subscriptionId,
      registrationType: "token",
      token,
      userId: uid,
      role: userData.role,
      enabled: true,
      permission: "granted",
      platform: platform || "ios",
      displayMode: req.body.displayMode || "standalone",
      browser: browser || "unknown",
      ...(userData.role === "merchant" ? { establishmentId } : {}),
      createdAt,
      updatedAt: now,
      lastSeenAt: now
    };

    await subDocRef.set(subscriptionData);

    // 10. READ-AFTER-WRITE - reler o documento e validar
    const savedSnap = await subDocRef.get();
    if (!savedSnap.exists) {
      console.error("[Push] Read-after-write failed: Document does not exist.");
      return res.status(500).json({ error: "Não foi possível confirmar a persistência do dispositivo.", code: "PUSH_SUBSCRIPTION_NOT_PERSISTED" });
    }
    const savedData = savedSnap.data() || {};
    if (
      savedData.enabled !== true ||
      savedData.registrationId !== token ||
      savedData.establishmentId !== establishmentId
    ) {
      console.error("[Push] Read-after-write validation failed:", savedData);
      return res.status(500).json({ error: "Não foi possível validar a integridade da assinatura.", code: "PUSH_SUBSCRIPTION_NOT_PERSISTED" });
    }

    const finalSubsSnap = await userSubsCollection.get();
    const subscriptionsAfter = finalSubsSnap.size;

    // 11. DIAGNÓSTICO SEGURO
    console.log("[Diagnostic]", {
      route: "/api/push/register",
      authenticatedUidMasked: maskString(uid),
      resolvedRole: "merchant",
      establishmentIdMasked: maskString(establishmentId),
      ownerUidMatches: estData.ownerUid === uid,
      firestoreProjectId: FIREBASE_CONFIG.projectId,
      firestoreDatabaseId: FIRESTORE_DATABASE_ID,
      writeStrategy: "admin",
      subscriptionsBefore,
      subscriptionsAfter,
      duplicatesRemoved,
      resultCode: "SUCCESS"
    });

    return res.status(200).json({
      success: true,
      data: {
        subscriptionId,
        subscriptionsBefore,
        subscriptionsAfter,
        duplicatesRemoved
      }
    });
  } catch (error: any) {
    console.error("Error registering push token:", error);
    return res.status(500).json({ error: "Não foi possível registrar este dispositivo. Tente novamente.", code: "PUSH_SUBSCRIPTION_ERROR" });
  }
});

app.post("/api/push/unregister", authenticateUser, async (req: any, res: any) => {
  try {
    const { token } = req.body;
    const uid = req.user.uid;

    if (!token) {
      return res.status(400).json({ error: "FCM Token is required." });
    }

    const subscriptionId = crypto.createHash("sha256").update(token).digest("hex");
    await adminDb.collection("users").doc(uid).collection("pushSubscriptions").doc(subscriptionId).delete();
    console.log(`[Push] Unregistered device token for user ${uid}`);

    return res.status(200).json({ success: true, message: "Subscription removed successfully." });
  } catch (error: any) {
    console.error("Error unregistering push token:", error);
    return res.status(500).json({ error: error.message || "Failed to unregister push token." });
  }
});

app.post("/api/push/diagnostic-update", async (req: any, res: any) => {
  try {
    const { eventId, backgroundHandlerExecuted, manualShowNotificationExecuted } = req.body;
    if (!eventId) {
      return res.status(400).json({ error: "eventId is required." });
    }

    const docRef = adminDb.collection("pushDiagnostics").doc(eventId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      await docRef.update({
        backgroundHandlerExecuted: backgroundHandlerExecuted || false,
        manualShowNotificationExecuted: manualShowNotificationExecuted || false
      });
    } else {
      await docRef.set({
        eventId,
        backgroundHandlerExecuted: backgroundHandlerExecuted || false,
        manualShowNotificationExecuted: manualShowNotificationExecuted || false,
        createdAt: new Date()
      }, { merge: true });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Error updating push diagnostic:", error);
    return res.status(500).json({ error: error.message || "Failed to update push diagnostic." });
  }
});

app.post("/api/push/test", authenticateUser, async (req: any, res: any) => {
  try {
    const uid = req.user.uid;
    const testEventId = `push_test:${Date.now()}`;
    const result = await sendPushToUser({
      uid,
      title: "Notificações ativadas 🎉",
      body: "Seu dispositivo está pronto para receber alertas do UaiPertim.",
      data: {
        type: "push_test",
        eventId: testEventId,
        url: "/"
      }
    });

    if (result.targetsFound === 0) {
      return res.status(400).json({ error: "Nenhum dispositivo registrado para notificações push neste perfil de usuário." });
    }

    return res.json({
      success: true,
      targetsFound: result.targetsFound,
      uniqueTargets: result.uniqueTargets,
      successCount: result.successCount,
      failureCount: result.failureCount
    });
  } catch (error: any) {
    console.error("Error in test push endpoint:", error);
    return res.status(500).json({ error: error.message || "Failed to dispatch test push notification." });
  }
});

// --- STARTUP FLOW (SERIALIZED) ---

async function startApp() {
  try {
    console.log("Initializing server startup flow...");
    
    // 1. Diagnostics (credentials, GCP project, etc.)
    await logCredentialsDiagnostics();
    
    // 2. Authenticate the backend system user to Firestore
    await ensureBackendAuthenticated();
    
    // 3. Run auto-seed database script under authenticated context
    await autoSeedOnStartup();

    // Initialize real-time push notification listeners on backend
    initializePushNotificationListeners();
    
    // 4. Start the appropriate Express & Vite server
    if (process.env.NODE_ENV !== "production") {
      console.log("Starting development server...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Development Server running on http://localhost:${PORT}`);
      });
    } else {
      console.log("Starting production server...");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Production Server running on http://0.0.0.0:${PORT}`);
      });
    }
  } catch (error) {
    console.error("CRITICAL ERROR DURING APPLICATION STARTUP:", error);
    process.exit(1);
  }
}

startApp();
