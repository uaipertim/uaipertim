import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { DATA_SOURCE } from '../config/dataSource';
import { Order } from '../types/order';
import { INITIAL_ORDERS } from '../initialData';

const COLLECTION_NAME = 'orders';

export const ordersRepository = {
  async getOrders(): Promise<Order[]> {
    if (DATA_SOURCE === 'demo-local') {
      const saved = localStorage.getItem('pl_orders');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error parsing saved orders:", e);
        }
      }
      return INITIAL_ORDERS as Order[];
    }

    if (!isFirebaseConnected || !db) {
      console.warn("Firebase not connected. Falling back to local orders.");
      return INITIAL_ORDERS as Order[];
    }

    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const list: Order[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Order);
      });
      return list.length > 0 ? list : (INITIAL_ORDERS as Order[]);
    } catch (error) {
      console.error("Error fetching orders from Firestore:", error);
      return INITIAL_ORDERS as Order[];
    }
  },

  async saveOrders(list: Order[]): Promise<void> {
    if (DATA_SOURCE === 'demo-local') {
      localStorage.setItem('pl_orders', JSON.stringify(list));
      return;
    }

    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      for (const order of list) {
        const docRef = doc(db, COLLECTION_NAME, order.id);
        await setDoc(docRef, order);
      }
    } catch (error) {
      console.error("Error saving orders to Firestore:", error);
      throw error;
    }
  },

  async saveOrder(order: Order): Promise<void> {
    if (DATA_SOURCE === 'demo-local') {
      const current = await this.getOrders();
      const idx = current.findIndex(o => o.id === order.id);
      if (idx >= 0) {
        current[idx] = order;
      } else {
        current.push(order);
      }
      await this.saveOrders(current);
      return;
    }

    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, order.id);
      await setDoc(docRef, order);
    } catch (error) {
      console.error("Error saving order to Firestore:", error);
      throw error;
    }
  }
};
