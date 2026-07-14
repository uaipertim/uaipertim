import { UserRole } from './auth';

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
