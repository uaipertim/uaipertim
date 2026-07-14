import { User as FirebaseUser } from 'firebase/auth';

export type UserRole = 'customer' | 'merchant' | 'admin';

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  active: boolean;
  establishmentId: string | null;
  cityId: string | null;
  avatarType?: 'initials' | 'preset';
  avatarKey?: string | null;
  avatarUrl?: string | null;
  preferences?: {
    orderUpdates: boolean;
    marketing: boolean;
    preferredFulfillment?: 'delivery' | 'pickup' | null;
    confirmCartClear: boolean;
  };
  createdAt?: any;
  updatedAt?: any;
}

export interface AuthState {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole | null;
  establishmentId: string | null;
}
