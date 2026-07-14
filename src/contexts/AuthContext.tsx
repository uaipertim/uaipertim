import React, { createContext, useContext, useState, useEffect } from "react";
import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { authService, AuthError } from "../services/authService";
import { UserProfile, UserRole } from "../types/auth";
import { profileService } from "../services/profileService";

export interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  registerCustomer: (params: {
    name: string;
    email: string;
    phone: string;
    cityId: string;
    password: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (profileData: Partial<UserProfile>) => Promise<void>;
  isAuthenticated: boolean;
  role: UserRole | null;
  establishmentId: string | null;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        try {
          const profile = await authService.getUserProfile(user.uid);
          setCurrentUser(user);
          setUserProfile(profile);
          setAuthError(null);
        } catch (error: any) {
          console.error("Auto login error loading profile:", error);
          // If profile is missing or inactive on reload, we sign out and show error
          setCurrentUser(null);
          setUserProfile(null);
          setAuthError(error.message || "Erro de acesso.");
          try {
            await authService.logout();
          } catch (e) {
            console.error("Could not sign out user after profile fetch failed", e);
          }
        } finally {
          setLoading(false);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    setLoading(true);
    setAuthError(null);
    try {
      const { user, profile } = await authService.login(email, password);
      setCurrentUser(user);
      setUserProfile(profile);
      return profile;
    } catch (error: any) {
      setAuthError(error.message || "Erro ao efetuar login.");
      setCurrentUser(null);
      setUserProfile(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      localStorage.removeItem('uaipertim_mock_session');
      await authService.logout();
      setCurrentUser(null);
      setUserProfile(null);
      setAuthError(null);
    } catch (error: any) {
      setAuthError(error.message || "Erro ao encerrar sessão.");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    try {
      await authService.resetPassword(email);
    } catch (error: any) {
      throw error;
    }
  };

  const registerCustomer = async (params: {
    name: string;
    email: string;
    phone: string;
    cityId: string;
    password: string;
  }): Promise<UserProfile> => {
    setLoading(true);
    setAuthError(null);
    try {
      const { user, profile } = await authService.registerCustomer(params);
      setCurrentUser(user);
      setUserProfile(profile);
      return profile;
    } catch (error: any) {
      setAuthError(error.message || "Erro ao efetuar cadastro.");
      setCurrentUser(null);
      setUserProfile(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const updateUserProfile = async (profileData: Partial<UserProfile>): Promise<void> => {
    if (!currentUser) throw new Error("Usuário não autenticado.");
    await profileService.updateProfile(currentUser.uid, profileData);
    setUserProfile((prev) => prev ? { ...prev, ...profileData } : null);
  };

  const isAuthenticated = !!currentUser && !!userProfile;
  const role = userProfile ? userProfile.role : null;
  const establishmentId = userProfile ? userProfile.establishmentId : null;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        login,
        registerCustomer,
        logout,
        resetPassword,
        updateUserProfile,
        isAuthenticated,
        role,
        establishmentId,
        authError,
        clearAuthError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
