import { collection, getDocs, doc, setDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { Product } from '../types/product';
import { INITIAL_PRODUCTS } from '../initialData';
import { normalizeProductFromFirestore } from '../services/productNormalizer';

const COLLECTION_NAME = 'products';

export const productsRepository = {
  async getProducts(establishmentId: string, onlyAvailable = false): Promise<Product[]> {
    if (!isFirebaseConnected || !db) {
      return INITIAL_PRODUCTS[establishmentId] || [];
    }

    try {
      const q = onlyAvailable 
        ? query(collection(db, COLLECTION_NAME), where('establishmentId', '==', establishmentId), where('available', '==', true))
        : query(collection(db, COLLECTION_NAME), where('establishmentId', '==', establishmentId));

      const querySnapshot = await getDocs(q);
      const list: Product[] = [];
      querySnapshot.forEach((doc) => {
        list.push(normalizeProductFromFirestore(doc.data(), doc.id));
      });
      return list;
    } catch (error) {
      console.error("Error fetching products from Firestore:", error);
      return INITIAL_PRODUCTS[establishmentId] || [];
    }
  },

  async getAllProducts(): Promise<Record<string, Product[]>> {
    if (!isFirebaseConnected || !db) {
      return INITIAL_PRODUCTS;
    }

    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const record: Record<string, Product[]> = {};
      querySnapshot.forEach((doc) => {
        const prod = normalizeProductFromFirestore(doc.data(), doc.id);
        const estId = prod.establishmentId || 'unknown';
        if (!record[estId]) {
          record[estId] = [];
        }
        record[estId].push(prod);
      });
      return Object.keys(record).length > 0 ? record : INITIAL_PRODUCTS;
    } catch (error) {
      console.error("Error fetching all products from Firestore:", error);
      return INITIAL_PRODUCTS;
    }
  },

  async saveProducts(establishmentId: string, list: Product[]): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      for (const prod of list) {
        await this.saveProduct(establishmentId, prod);
      }
    } catch (error) {
      console.error("Error saving products to Firestore:", error);
      throw error;
    }
  },

  async saveProduct(establishmentId: string, prod: Product): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, prod.id);
      
      const mappedSizes = (prod as any).sizesList || prod.sizes?.map((sz, sIdx) => ({
        id: sz.toLowerCase().replace(/\s+/g, '-'),
        name: sz,
        priceDelta: 0,
        active: true,
        sortOrder: sIdx + 1,
      })) || [];

      const mappedCrusts = (prod as any).crusts || prod.borders?.map((br, bIdx) => ({
        id: br.toLowerCase().replace(/\s+/g, '-'),
        name: br,
        priceDelta: br.includes('Catupiry') || br.includes('Cheddar') ? 5.0 : 0.0,
        active: true,
        sortOrder: bIdx + 1,
      })) || [];

      const mappedExtras = (prod as any).extrasList || prod.extras?.map((ex: any, eIdx) => ({
        id: ex.id || ex.name.toLowerCase().replace(/\s+/g, '-'),
        name: ex.name,
        price: typeof ex.price === 'number' ? ex.price : 0,
        active: ex.active !== undefined ? ex.active : true,
        maxQuantity: typeof ex.maxQuantity === 'number' ? ex.maxQuantity : 5,
        sortOrder: typeof ex.sortOrder === 'number' ? ex.sortOrder : eIdx + 1,
      })) || [];

      const firestoreData = {
        id: prod.id,
        establishmentId: establishmentId || (prod as any).establishmentId || '',
        establishmentName: (prod as any).establishmentName || '',
        cityId: (prod as any).cityId || '',
        categoryId: prod.category?.toLowerCase().replace(/\s+/g, '-') || 'outros',
        categoryName: prod.category || 'Outros',
        name: prod.name,
        slug: prod.id,
        description: prod.description || null,
        imageUrl: prod.image || (prod as any).imageUrl || null,
        basePrice: typeof prod.price === 'number' ? prod.price : 0,
        active: (prod as any).active !== undefined ? (prod as any).active : true,
        available: prod.available !== undefined ? prod.available : true,
        featured: (prod as any).featured || false,
        sizes: mappedSizes,
        crusts: mappedCrusts,
        extras: mappedExtras,
        notesEnabled: (prod as any).notesEnabled !== undefined ? (prod as any).notesEnabled : true,
        sortOrder: (prod as any).sortOrder || 1,
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, firestoreData, { merge: true });
    } catch (error) {
      console.error("Error saving product to Firestore:", error);
      throw error;
    }
  }
};
