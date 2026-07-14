import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch,
  serverTimestamp,
  query,
  getDoc
} from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { UserAddress } from '../types/address';

// Local storage helpers for mock/offline fallback
const getMockAddressesKey = (uid: string) => `uaipertim_mock_addresses_${uid}`;

const getMockAddresses = (uid: string): UserAddress[] => {
  const saved = localStorage.getItem(getMockAddressesKey(uid));
  return saved ? JSON.parse(saved) : [];
};

const saveMockAddresses = (uid: string, addresses: UserAddress[]) => {
  localStorage.setItem(getMockAddressesKey(uid), JSON.stringify(addresses));
};

export const addressService = {
  async getAddresses(uid: string): Promise<UserAddress[]> {
    if (!db || !isFirebaseConnected || uid.startsWith('mock-')) {
      return getMockAddresses(uid);
    }

    try {
      const colRef = collection(db, 'users', uid, 'addresses');
      const querySnap = await getDocs(colRef);
      const list: UserAddress[] = [];
      querySnap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          label: data.label,
          recipientName: data.recipientName,
          phone: data.phone,
          zipCode: data.zipCode,
          street: data.street,
          number: data.number,
          complement: data.complement || '',
          neighborhood: data.neighborhood,
          cityId: data.cityId,
          cityName: data.cityName,
          state: data.state || 'MG',
          reference: data.reference || '',
          isDefault: data.isDefault || false,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
          updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null,
        });
      });
      return list;
    } catch (error) {
      console.error('Error fetching addresses from Firestore:', error);
      return getMockAddresses(uid); // Fallback to localStorage on error
    }
  },

  async addAddress(uid: string, address: Omit<UserAddress, 'id'>): Promise<string> {
    const existingList = await this.getAddresses(uid);
    const isFirst = existingList.length === 0;
    const shouldBeDefault = isFirst || address.isDefault;

    if (!db || !isFirebaseConnected || uid.startsWith('mock-')) {
      const mockList = getMockAddresses(uid);
      const newId = 'mock-addr-' + Math.random().toString(36).substring(2, 9);
      
      const updatedList = mockList.map(a => {
        if (shouldBeDefault) {
          return { ...a, isDefault: false };
        }
        return a;
      });

      const newAddress: UserAddress = {
        ...address,
        id: newId,
        isDefault: shouldBeDefault,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      updatedList.push(newAddress);
      saveMockAddresses(uid, updatedList);
      return newId;
    }

    try {
      const colRef = collection(db, 'users', uid, 'addresses');
      const newDocRef = doc(colRef); // Auto-generate ID
      const addressId = newDocRef.id;

      const batch = writeBatch(db);

      if (shouldBeDefault) {
        // Reset defaults on all other addresses
        const querySnap = await getDocs(colRef);
        querySnap.forEach((d) => {
          if (d.data().isDefault) {
            batch.update(doc(db, 'users', uid, 'addresses', d.id), {
              isDefault: false,
              updatedAt: serverTimestamp()
            });
          }
        });
      }

      batch.set(newDocRef, {
        label: address.label,
        recipientName: address.recipientName,
        phone: address.phone,
        zipCode: address.zipCode,
        street: address.street,
        number: address.number,
        complement: address.complement || '',
        neighborhood: address.neighborhood,
        cityId: address.cityId,
        cityName: address.cityName,
        state: address.state || 'MG',
        reference: address.reference || '',
        isDefault: shouldBeDefault,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      return addressId;
    } catch (error) {
      console.error('Error adding address to Firestore:', error);
      // Fallback
      const mockList = getMockAddresses(uid);
      const newId = 'mock-addr-' + Math.random().toString(36).substring(2, 9);
      const updatedList = mockList.map(a => shouldBeDefault ? { ...a, isDefault: false } : a);
      updatedList.push({
        ...address,
        id: newId,
        isDefault: shouldBeDefault,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      saveMockAddresses(uid, updatedList);
      return newId;
    }
  },

  async updateAddress(uid: string, addressId: string, updatedFields: Partial<UserAddress>): Promise<void> {
    const existingList = await this.getAddresses(uid);
    const shouldBeDefault = updatedFields.isDefault === true;

    if (!db || !isFirebaseConnected || uid.startsWith('mock-')) {
      const mockList = getMockAddresses(uid);
      const updatedList = mockList.map((a) => {
        let isDef = a.isDefault;
        if (shouldBeDefault) {
          isDef = a.id === addressId;
        } else if (a.id === addressId && updatedFields.isDefault === false) {
          isDef = false;
        }
        
        if (a.id === addressId) {
          return {
            ...a,
            ...updatedFields,
            isDefault: isDef,
            updatedAt: new Date().toISOString()
          };
        }
        return { ...a, isDefault: isDef };
      });
      saveMockAddresses(uid, updatedList);
      return;
    }

    try {
      const batch = writeBatch(db);
      const docRef = doc(db, 'users', uid, 'addresses', addressId);

      if (shouldBeDefault) {
        const colRef = collection(db, 'users', uid, 'addresses');
        const querySnap = await getDocs(colRef);
        querySnap.forEach((d) => {
          if (d.id !== addressId && d.data().isDefault) {
            batch.update(doc(db, 'users', uid, 'addresses', d.id), {
              isDefault: false,
              updatedAt: serverTimestamp()
            });
          }
        });
      }

      batch.update(docRef, {
        ...updatedFields,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
    } catch (error) {
      console.error('Error updating address in Firestore:', error);
      // Fallback
      const mockList = getMockAddresses(uid);
      const updatedList = mockList.map((a) => {
        let isDef = a.isDefault;
        if (shouldBeDefault) {
          isDef = a.id === addressId;
        }
        if (a.id === addressId) {
          return { ...a, ...updatedFields, isDefault: isDef, updatedAt: new Date().toISOString() };
        }
        return { ...a, isDefault: isDef };
      });
      saveMockAddresses(uid, updatedList);
    }
  },

  async deleteAddress(uid: string, addressId: string): Promise<void> {
    if (!db || !isFirebaseConnected || uid.startsWith('mock-')) {
      const mockList = getMockAddresses(uid);
      const filtered = mockList.filter((a) => a.id !== addressId);
      saveMockAddresses(uid, filtered);
      return;
    }

    try {
      const docRef = doc(db, 'users', uid, 'addresses', addressId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting address from Firestore:', error);
      const mockList = getMockAddresses(uid);
      const filtered = mockList.filter((a) => a.id !== addressId);
      saveMockAddresses(uid, filtered);
    }
  },

  async setDefaultAddress(uid: string, addressId: string): Promise<void> {
    await this.updateAddress(uid, addressId, { isDefault: true });
  }
};
