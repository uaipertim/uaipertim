import { collection, getDocs, doc, setDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { City } from '../types/city';
import { CITIES } from '../initialData';

const COLLECTION_NAME = 'cities';

export const citiesRepository = {
  async getCities(onlyActive = false): Promise<City[]> {
    if (!isFirebaseConnected || !db) {
      return CITIES;
    }

    try {
      const q = onlyActive 
        ? query(collection(db, COLLECTION_NAME), where('active', '==', true), orderBy('sortOrder'))
        : query(collection(db, COLLECTION_NAME), orderBy('sortOrder'));
      
      const querySnapshot = await getDocs(q);
      const cities: City[] = [];
      querySnapshot.forEach((doc) => {
        cities.push({ id: doc.id, ...doc.data() } as City);
      });
      return cities.length > 0 ? cities : CITIES;
    } catch (error) {
      console.error("Error fetching cities from Firestore:", error);
      return CITIES;
    }
  },

  async saveCity(city: City): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, city.id);
      await setDoc(docRef, {
        ...city,
        slug: city.id,
        displayName: `${city.name} - ${city.state}`,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Error saving city to Firestore:", error);
      throw error;
    }
  }
};
