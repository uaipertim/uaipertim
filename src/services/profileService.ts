import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { UserProfile } from '../types/auth';

export const profileService = {
  async updateProfile(uid: string, profileData: Partial<UserProfile>): Promise<void> {
    if (!db || !isFirebaseConnected) {
      throw new Error("Conexão indisponível.");
    }

    try {
      const docRef = doc(db, 'users', uid);
      await updateDoc(docRef, {
        ...profileData,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating profile in Firestore:', error);
      throw error;
    }
  },

  async updatePreferences(uid: string, preferences: UserProfile['preferences']): Promise<void> {
    await this.updateProfile(uid, { preferences });
  }
};
