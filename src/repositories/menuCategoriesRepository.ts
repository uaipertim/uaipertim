import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { MenuCategory } from '../types';

export const menuCategoriesRepository = {
  async getMenuCategories(establishmentId: string): Promise<MenuCategory[]> {
    if (!isFirebaseConnected || !db) {
      return [];
    }

    try {
      const collRef = collection(db, 'establishments', establishmentId, 'menuCategories');
      const q = query(collRef, orderBy('sortOrder', 'asc'));
      const querySnapshot = await getDocs(q);
      const list: MenuCategory[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          establishmentId: data.establishmentId || establishmentId,
          name: data.name || '',
          normalizedName: data.normalizedName || '',
          active: data.active !== false,
          sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      });
      return list;
    } catch (error) {
      console.error("Error fetching menu categories from Firestore:", error);
      return [];
    }
  },

  async saveMenuCategory(establishmentId: string, category: MenuCategory): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, 'establishments', establishmentId, 'menuCategories', category.id);
      const firestoreData = {
        id: category.id,
        establishmentId,
        name: category.name,
        normalizedName: category.normalizedName || category.name.toLowerCase().trim(),
        active: category.active !== false,
        sortOrder: typeof category.sortOrder === 'number' ? category.sortOrder : 0,
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, firestoreData, { merge: true });
    } catch (error) {
      console.error("Error saving menu category to Firestore:", error);
      throw error;
    }
  },

  async deleteMenuCategory(establishmentId: string, categoryId: string): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, 'establishments', establishmentId, 'menuCategories', categoryId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting menu category from Firestore:", error);
      throw error;
    }
  }
};
