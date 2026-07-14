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

    try {
      const userCredential = await fbSignIn(auth, normalizedEmail, password);
      const firebaseUser = userCredential.user;

      if (!firebaseUser) {
        throw new AuthError("AUTHENTICATION_FAILED", "AUTHENTICATION_FAILED");
      }

      const profile = await this.getUserProfile(firebaseUser.uid);

      if (profile.active !== true) {
        await fbSignOut(auth);
        throw new AuthError("Este acesso está temporariamente desativado.", "ACCOUNT_DISABLED");
      }

      if (
        profile.role !== "customer" &&
        profile.role !== "merchant" &&
        profile.role !== "admin"
      ) {
        await fbSignOut(auth);
        throw new AuthError("Nível de acesso inválido.", "INVALID_ROLE");
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
      throw new AuthError("Serviço não inicializado.", "not-initialized");
    }
    try {
      await fbResetEmail(auth, email);
    } catch (error) {
      // Do not rethrow specific auth/user-not-found error to avoid email enumeration
      // But we can throw network error or invalid email format if useful.
      // Actually, user wants us to show generic message ALWAYS:
      // “Caso exista uma conta com esse e-mail, enviaremos as instruções de recuperação.”
      // So we will handle this general response inside the UI itself, but we can log the real error.
      console.log("Password reset requested for email, raw error:", error);
      const code = error?.code;
      if (code === "auth/invalid-email") {
        throw new AuthError("O formato do e-mail inserido é inválido.", code);
      }
      if (code === "auth/network-request-failed") {
        throw new AuthError("Falha de conexão. Verifique sua internet.", code);
      }
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
