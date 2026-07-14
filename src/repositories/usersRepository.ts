import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { DATA_SOURCE } from '../config/dataSource';
import { User } from '../types/user';

const COLLECTION_NAME = 'users';

export const usersRepository = {
  async getUsers(): Promise<User[]> {
    if (DATA_SOURCE === 'demo-local') {
      const saved = localStorage.getItem('pl_users');
      return saved ? JSON.parse(saved) : [];
    }

    if (!isFirebaseConnected || !db) {
      console.warn("Firebase not connected. Falling back to local users.");
      return [];
    }

    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const list: User[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as User);
      });
      return list;
    } catch (error) {
      console.error("Error fetching users from Firestore:", error);
      return [];
    }
  },

  async getUser(id: string): Promise<User | null> {
    if (DATA_SOURCE === 'demo-local') {
      const list = await this.getUsers();
      return list.find(u => u.id === id) || null;
    }

    if (!isFirebaseConnected || !db) {
      return null;
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as User;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user from Firestore:", error);
      return null;
    }
  },

  async saveUser(user: User): Promise<void> {
    if (DATA_SOURCE === 'demo-local') {
      const current = await this.getUsers();
      const idx = current.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        current[idx] = user;
      } else {
        current.push(user);
      }
      localStorage.setItem('pl_users', JSON.stringify(current));
      return;
    }

    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, user.id);
      await setDoc(docRef, user);
    } catch (error) {
      console.error("Error saving user to Firestore:", error);
      throw error;
    }
  }
};
