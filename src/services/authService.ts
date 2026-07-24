import { 
  signInWithEmailAndPassword as fbSignIn, 
  signOut as fbSignOut, 
  sendPasswordResetEmail as fbResetEmail,
  createUserWithEmailAndPassword as fbCreateUser,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, isFirebaseConnected } from "../lib/firebase";
import { UserProfile } from "../types/auth";
import { PUBLIC_APP_URL, FIREBASE_CONFIG } from "../config/environment";

const maskEmailForLogging = (email: string): string => {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  if (localPart.length <= 2) return `${localPart}***@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
};

export class AuthError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export function mapFirebaseAuthError(error: any): AuthError {
  console.error("Firebase Auth error details:", error);
  const code = error?.code || error?.message || "unknown";
  let message = "Ocorreu um erro inesperado na autenticação. Tente novamente.";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      message = "E-mail ou senha incorretos.";
      break;
    case "auth/invalid-email":
      message = "Informe um e-mail válido.";
      break;
    case "auth/user-disabled":
      message = "Esta conta está temporariamente desativada.";
      break;
    case "auth/too-many-requests":
      message = "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
      break;
    case "auth/network-request-failed":
    case "firestore/unavailable":
      message = "Não foi possível conectar. Verifique sua internet.";
      break;
    case "PROFILE_NOT_CONFIGURED":
    case "profile/not-configured":
      message = "Sua conta foi autenticada, mas o acesso ainda não foi configurado na UaiPertim.";
      break;
    case "ACCOUNT_DISABLED":
    case "profile/disabled":
      message = "Este acesso está temporariamente desativado.";
      break;
    default:
      if (error instanceof AuthError) {
        return error;
      }
      if (error?.message) {
        message = error.message;
      }
      break;
  }

  return new AuthError(message, code);
}

export function mapFirebaseRegisterError(error: any): AuthError {
  console.error("Firebase Register error details:", error);
  const code = error?.code || "unknown";
  let message = "Não foi possível concluir seu cadastro. Tente novamente.";

  switch (code) {
    case "auth/email-already-in-use":
      message = "Já existe uma conta com este e-mail.";
      break;
    case "auth/invalid-email":
      message = "Informe um e-mail válido.";
      break;
    case "auth/weak-password":
      message = "Escolha uma senha mais segura.";
      break;
    case "auth/network-request-failed":
      message = "Não foi possível conectar. Verifique sua internet.";
      break;
    case "permission-denied":
    case "firestore/permission-denied":
      message = "Não foi possível concluir a criação do perfil.";
      break;
  }

  return new AuthError(message, code);
}

export const authService = {
  async login(email: string, password: string): Promise<{ user: FirebaseUser; profile: UserProfile }> {
    if (!auth) {
      throw new AuthError("O serviço de autenticação do Firebase não está disponível.", "auth/not-initialized");
    }

    const normalizedEmail = email.trim().toLowerCase();
    let firebaseUser: FirebaseUser | null = null;

    try {
      // 1. Authenticate with email and password
      try {
        const userCredential = await fbSignIn(auth, normalizedEmail, password);
        firebaseUser = userCredential.user;
      } catch (authErr: any) {
        console.error("Firebase Auth sign in failed:", authErr);
        const code = authErr?.code;
        if (code === "auth/user-disabled") {
          throw new AuthError("Esta conta está temporariamente desativada.", "AUTH_USER_DISABLED");
        }
        throw new AuthError("E-mail ou senha incorretos.", "AUTH_INVALID_CREDENTIALS");
      }

      if (!firebaseUser) {
        throw new AuthError("E-mail ou senha incorretos.", "AUTH_INVALID_CREDENTIALS");
      }

      const uid = firebaseUser.uid;

      // 2. Fetch Firestore profile document
      if (!db || !isFirebaseConnected) {
        throw new AuthError("Erro de conexão. Banco de dados indisponível.", "firestore/unavailable");
      }

      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      // Check if users/{uid} is missing
      if (!docSnap.exists()) {
        await fbSignOut(auth);
        throw new AuthError("Seu perfil de usuário não foi encontrado.", "USER_PROFILE_NOT_FOUND");
      }

      const data = docSnap.data();
      const profile: UserProfile = {
        name: data.name || "Usuário",
        email: data.email || "",
        phone: data.phone || "",
        role: data.role || "customer",
        active: data.active !== undefined ? data.active : true,
        establishmentId: data.establishmentId || null,
        cityId: data.cityId || null,
        avatarType: data.avatarType || "initials",
        avatarKey: data.avatarKey || null,
        avatarUrl: data.avatarUrl || null,
        preferences: data.preferences || {
          orderUpdates: true,
          marketing: false,
          preferredFulfillment: null,
          confirmCartClear: true
        },
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      };

      // Check if disabled/inactive
      if (profile.active !== true) {
        await fbSignOut(auth);
        throw new AuthError("Esta conta está temporariamente desativada.", "AUTH_USER_DISABLED");
      }

      // Check if role is valid (must be customer, merchant, or admin)
      if (
        profile.role !== "customer" &&
        profile.role !== "merchant" &&
        profile.role !== "admin"
      ) {
        await fbSignOut(auth);
        throw new AuthError("Nível de acesso não permitido.", "USER_ROLE_NOT_ALLOWED");
      }

      // Check merchant-specific constraints
      if (profile.role === "merchant") {
        if (!profile.establishmentId) {
          await fbSignOut(auth);
          throw new AuthError(
            "Sua conta de parceiro ainda não possui um estabelecimento vinculado.",
            "MERCHANT_ESTABLISHMENT_NOT_LINKED"
          );
        }

        // Check if linked establishment document actually exists
        const estRef = doc(db, "establishments", profile.establishmentId);
        const estSnap = await getDoc(estRef);
        if (!estSnap.exists()) {
          await fbSignOut(auth);
          throw new AuthError(
            "Sua conta de parceiro ainda não possui um estabelecimento vinculado.",
            "MERCHANT_ESTABLISHMENT_NOT_LINKED"
          );
        }

        // Verify if ownerUid correspondente match
        const estData = estSnap.data();
        const matchesOwner = 
          estData?.ownerUid === uid || 
          estData?.merchantUid === uid || 
          estData?.merchantOwnerUid === uid ||
          estData?.ownerEmail?.toLowerCase() === profile.email.toLowerCase() ||
          estData?.email?.toLowerCase() === profile.email.toLowerCase() ||
          profile.establishmentId === estSnap.id;

        if (!matchesOwner) {
          await fbSignOut(auth);
          throw new AuthError(
            "O estabelecimento vinculado não possui correspondência de proprietário.",
            "MERCHANT_OWNERSHIP_MISMATCH"
          );
        }

        // Heal ownership fields if they are missing or don't match the current authenticated UID
        if (
          estData &&
          (estData.ownerUid !== uid || estData.merchantUid !== uid || estData.merchantOwnerUid !== uid)
        ) {
          try {
            await setDoc(estRef, {
              ownerUid: uid,
              merchantUid: uid,
              merchantOwnerUid: uid
            }, { merge: true });
            console.log("Self-healed establishment owner fields for UID:", uid);
          } catch (healError) {
            console.warn("Failed to self-heal establishment owner fields:", healError);
            // Non-blocking error, allow user to log in as they are already authorized in their profile
          }
        }
      }

      // Clean up mock session since real login succeeded
      localStorage.removeItem('uaipertim_mock_session');
      return { user: firebaseUser, profile };
    } catch (error: any) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw mapFirebaseAuthError(error);
    }
  },

  async logout(): Promise<void> {
    localStorage.removeItem('uaipertim_mock_session');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('mock-session-changed'));
    }
    if (!auth) return;
    try {
      await fbSignOut(auth);
    } catch (error) {
      console.error("Error signing out from Firebase:", error);
      throw mapFirebaseAuthError(error);
    }
  },

  async resetPassword(email: string): Promise<void> {
    if (!auth) {
      throw new AuthError("O serviço de autenticação do Firebase não está disponível.", "auth/not-initialized");
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AuthError("Informe seu e-mail.", "AUTH_EMAIL_EMPTY");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new AuthError("Digite um endereço de e-mail válido.", "AUTH_EMAIL_INVALID");
    }

    const publicAppUrl = PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://uaipertim.com.br');
    const continueUrl = `${publicAppUrl}/login`;
    const actionCodeSettings = {
      url: continueUrl,
      handleCodeInApp: false
    };

    const emailMascarado = maskEmailForLogging(normalizedEmail);
    const firebaseProjectId = FIREBASE_CONFIG.projectId || "gen-lang-client-0673282457";

    try {
      // Try to call our backend custom reset password API endpoint
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if fallback is possible in development
        if (data.code === 'RESET_EMAIL_PROVIDER_NOT_CONFIGURED') {
          const isDev = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || 
             window.location.hostname.includes('127.0.0.1') || 
             window.location.hostname.includes('ais-dev') ||
             // @ts-ignore
             (import.meta as any).env?.DEV);

          const allowFallback = (import.meta as any).env?.VITE_ALLOW_FIREBASE_RESET_FALLBACK !== 'false';

          if (isDev && allowFallback) {
            console.warn("SMTP provider not configured on development backend. Falling back to client-side Firebase Auth default reset.");
            // Fall back to client-side Firebase Auth default password reset
            await fbResetEmail(auth, normalizedEmail, actionCodeSettings);
            console.log("Password reset request logged (fallback):", JSON.stringify({
              action: "password_reset_requested_fallback",
              emailMascarado,
              firebaseProjectId,
              resultCode: "SUCCESS"
            }));
            return;
          }
        }
        throw new AuthError(data.error || "Erro ao solicitar recuperação de senha.", data.code || "unknown");
      }

      console.log("Password reset request logged (custom API):", JSON.stringify({
        action: "password_reset_requested_api",
        emailMascarado,
        firebaseProjectId,
        resultCode: "SUCCESS"
      }));
    } catch (error: any) {
      if (error instanceof AuthError) {
        throw error;
      }
      
      const code = error?.code || "unknown";
      console.error("Password reset error details:", error);

      if (code === "auth/user-not-found") {
        return;
      }
      if (code === "auth/invalid-email" || code === "AUTH_EMAIL_INVALID") {
        throw new AuthError("Digite um endereço de e-mail válido.", "AUTH_EMAIL_INVALID");
      }
      if (code === "auth/too-many-requests" || code === "AUTH_TOO_MANY_REQUESTS") {
        throw new AuthError("Muitas solicitações foram realizadas. Aguarde alguns minutos.", "AUTH_TOO_MANY_REQUESTS");
      }
      if (code === "auth/network-request-failed" || code === "AUTH_NETWORK_ERROR") {
        throw new AuthError("Não foi possível enviar as instruções. Verifique sua conexão e tente novamente.", "AUTH_NETWORK_ERROR");
      }
      if (code === "auth/operation-not-allowed") {
        throw new AuthError("A recuperação por e-mail está temporariamente indisponível.", "AUTH_EMAIL_PASSWORD_DISABLED");
      }
      if (code === "auth/unauthorized-continue-uri") {
        throw new AuthError("Não foi possível iniciar a recuperação de senha agora.", "AUTH_UNAUTHORIZED_CONTINUE_URL");
      }
      if (code === "auth/missing-continue-uri") {
        throw new AuthError("Não foi possível iniciar a recuperação de senha agora.", "AUTH_CONTINUE_URL_MISSING");
      }

      throw new AuthError(error.message || "Não foi possível enviar as instruções de recuperação de senha no momento. Tente novamente mais tarde.", code);
    }
  },

  async getUserProfile(uid: string): Promise<UserProfile> {
    if (!db || !isFirebaseConnected) {
      throw new AuthError("Erro de conexão. Banco de dados indisponível.", "firestore/unavailable");
    }

    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new AuthError(
          "Seu acesso foi autenticado, mas ainda não foi configurado na UaiPertim. Entre em contato com a administração.",
          "profile/not-configured"
        );
      }

      const data = docSnap.data();
      const profile: UserProfile = {
        name: data.name || "Usuário",
        email: data.email || "",
        phone: data.phone || "",
        role: data.role || "customer",
        active: data.active !== undefined ? data.active : true,
        establishmentId: data.establishmentId || null,
        cityId: data.cityId || null,
        avatarType: data.avatarType || "initials",
        avatarKey: data.avatarKey || null,
        avatarUrl: data.avatarUrl || null,
        preferences: data.preferences || {
          orderUpdates: true,
          marketing: false,
          preferredFulfillment: null,
          confirmCartClear: true
        },
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      };

      if (!profile.active) {
        throw new AuthError(
          "Este acesso está temporariamente desativado. Entre em contato com a administração da UaiPertim.",
          "profile/disabled"
        );
      }

      return profile;
    } catch (error: any) {
      if (error instanceof AuthError) {
        throw error;
      }
      console.error("Error fetching user profile from Firestore:", error);
      throw new AuthError(
        "Erro ao carregar perfil de usuário do banco de dados. Tente novamente.",
        "firestore/error"
      );
    }
  },

  async registerCustomer(params: {
    name: string;
    email: string;
    phone: string;
    cityId: string;
    password: string;
  }): Promise<{ user: FirebaseUser; profile: UserProfile }> {
    const { name, email, phone, cityId, password } = params;

    // First validate inputs
    if (!name || name.trim().length < 3) {
      throw new Error("Nome deve ter no mínimo 3 caracteres.");
    }
    if (!email) {
      throw new Error("E-mail é obrigatório.");
    }
    if (!phone) {
      throw new Error("Telefone é obrigatório.");
    }
    if (!cityId || !["sao-joao-batista-do-gloria-mg", "passos-mg"].includes(cityId)) {
      throw new Error("Cidade inválida selecionada.");
    }
    if (!password || password.length < 8) {
      throw new Error("Senha deve ter no mínimo 8 caracteres.");
    }

    const cleanEmail = email.toLowerCase().trim();
    // Remove duplicate spaces
    const cleanName = name.replace(/\s+/g, ' ').trim();

    // Check if Firebase is available
    if (!auth || !db || !isFirebaseConnected) {
      throw new AuthError("O serviço de autenticação do Firebase não está disponível.", "auth/not-initialized");
    }

    try {
      // Create account in Firebase Authentication
      const userCredential = await fbCreateUser(auth, cleanEmail, password);
      const user = userCredential.user;

      try {
        // Create document in Firestore
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
          name: cleanName,
          email: cleanEmail,
          phone: phone,
          role: "customer",
          active: true,
          establishmentId: null,
          cityId: cityId,
          avatarType: "initials",
          avatarKey: null,
          avatarUrl: null,
          preferences: {
            orderUpdates: true,
            marketing: false,
            preferredFulfillment: null,
            confirmCartClear: true
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        const profile: UserProfile = {
          name: cleanName,
          email: cleanEmail,
          phone: phone,
          role: "customer",
          active: true,
          establishmentId: null,
          cityId: cityId,
          avatarType: "initials",
          avatarKey: null,
          avatarUrl: null,
          preferences: {
            orderUpdates: true,
            marketing: false,
            preferredFulfillment: null,
            confirmCartClear: true
          }
        };

        // Clean up any mock sessions
        localStorage.removeItem('uaipertim_mock_session');

        return { user, profile };
      } catch (firestoreError: any) {
        console.error("Firestore user creation failed, cleaning up Auth account", firestoreError);
        
        // Attempt immediate deletion of the newly created Auth user
        try {
          await user.delete();
        } catch (deleteError) {
          console.error("Failed to delete user in cleanup", deleteError);
        }

        // Sign out to ensure no partial state
        try {
          await fbSignOut(auth);
        } catch (signOutError) {
          console.error("Failed to sign out user in cleanup", signOutError);
        }

        throw new AuthError("Não foi possível concluir seu cadastro. Tente novamente.", "firestore/profile-failed");
      }
    } catch (error: any) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw mapFirebaseRegisterError(error);
    }
  }
};
