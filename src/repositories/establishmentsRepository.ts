import { collection, getDocs, doc, setDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConnected } from '../lib/firebase';
import { Establishment } from '../types/establishment';
import { INITIAL_ESTABLISHMENTS } from '../initialData';
import { normalizeEstablishmentFromFirestore } from '../services/productNormalizer';

const COLLECTION_NAME = 'establishments';

export const establishmentsRepository = {
  async getEstablishments(onlyActive = false): Promise<Establishment[]> {
    if (!isFirebaseConnected || !db) {
      return INITIAL_ESTABLISHMENTS;
    }

    try {
      const q = onlyActive 
        ? query(collection(db, COLLECTION_NAME), where('active', '==', true))
        : collection(db, COLLECTION_NAME);

      const querySnapshot = await getDocs(q);
      const list: Establishment[] = [];
      querySnapshot.forEach((doc) => {
        list.push(normalizeEstablishmentFromFirestore(doc.data(), doc.id));
      });
      return list.length > 0 ? list : INITIAL_ESTABLISHMENTS;
    } catch (error) {
      console.error("Error fetching establishments from Firestore:", error);
      return INITIAL_ESTABLISHMENTS;
    }
  },

  async saveEstablishments(list: Establishment[]): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      for (const est of list) {
        await this.saveEstablishment(est);
      }
    } catch (error) {
      console.error("Error saving establishments to Firestore:", error);
      throw error;
    }
  },

  async saveEstablishment(est: Establishment): Promise<void> {
    if (!isFirebaseConnected || !db) {
      throw new Error("Firebase not connected.");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, est.id);
      
      let street = '';
      let number = '';
      let zipCode = est.cep || '';
      let neighborhood = est.bairro || '';

      if (typeof est.address === 'string') {
        street = est.address.split(',')[0] || est.address || '';
        number = est.address.split(',')[1]?.trim() || '';
      } else if (est.address && typeof est.address === 'object') {
        const addrObj = est.address as any;
        street = addrObj.street || addrObj.logradouro || '';
        number = addrObj.number || addrObj.numero || '';
        if (addrObj.zipCode || addrObj.cep) {
          zipCode = addrObj.zipCode || addrObj.cep;
        }
        if (addrObj.neighborhood || addrObj.bairro) {
          neighborhood = addrObj.neighborhood || addrObj.bairro;
        }
      }
      
      const firestoreData = {
        id: est.id,
        name: est.name,
        slug: est.id,
        cityId: est.cityId || '',
        cityName: est.cityName || est.city || '',
        state: est.state || 'MG',
        categoryId: est.category?.toLowerCase().replace(/\s+/g, '-') || 'outras',
        categoryName: est.category || '',
        description: est.description || null,
        phone: est.phone || est.legalContactPhone || null,
        email: est.email || est.legalContactEmail || null,
        owner: est.owner || est.legalContactName || null,
        companyName: est.companyName || '',
        legalName: est.companyName || '',
        document: est.document || '',
        taxDocument: est.document || '',
        legalContactName: est.legalContactName || est.owner || '',
        legalContactPhone: est.legalContactPhone || est.phone || '',
        legalContactEmail: est.legalContactEmail || est.email || '',
        ownerUid: est.ownerUid || est.merchantUid || null,
        merchantUid: est.merchantUid || est.ownerUid || null,
        merchantOwnerUid: est.ownerUid || est.merchantUid || null,
        address: {
          street: street || null,
          number: number || null,
          complement: null,
          neighborhood: neighborhood || null,
          zipCode: zipCode || null,
          cityName: est.cityName || est.city || '',
          state: est.state || 'MG'
        },
        active: est.active !== undefined ? est.active : true,
        open: est.open !== undefined ? est.open : (est.isOpen !== undefined ? est.isOpen : true),
        acceptingOrders: est.acceptingOrders !== undefined ? est.acceptingOrders : true,
        temporarilyPaused: est.temporarilyPaused !== undefined ? est.temporarilyPaused : false,
        suspended: est.suspended !== undefined ? est.suspended : false,
        platformStatus: est.platformStatus || (est.active === false || est.suspended === true ? 'inactive' : 'active'),
        operationalPause: est.operationalPause !== undefined ? est.operationalPause : (est.temporarilyPaused !== undefined ? est.temporarilyPaused : false),
        archived: est.platformStatus === 'archived' || (est as any).archived === true,
        archiveReason: (est as any).archiveReason || null,
        deactivationReason: (est as any).deactivationReason || null,
        featured: est.featured || false,
        rating: est.rating || 4.5,
        deliveryFee: typeof est.deliveryFee === 'number' ? est.deliveryFee : 0,
        minimumOrder: typeof est.minOrderValue === 'number' ? est.minOrderValue : 0,
        fulfillment: {
          delivery: est.entregaPropria !== undefined ? est.entregaPropria : true,
          pickup: est.atendeRetirada !== undefined ? est.atendeRetirada : true
        },
        paymentMethods: {
          cash: est.acceptCash !== undefined ? est.acceptCash : true,
          cardOnDelivery: est.acceptCreditCard !== undefined ? est.acceptCreditCard : true,
          pixOnDelivery: est.acceptPix !== undefined ? est.acceptPix : true,
          debitCard: est.acceptDebitCard !== undefined ? est.acceptDebitCard : true,
          creditCard: est.acceptCreditCard !== undefined ? est.acceptCreditCard : true,
          contactless: est.acceptContactless !== undefined ? est.acceptContactless : true
        },
        logoUrl: est.logoUrl || est.image || null,
        bannerUrl: est.coverImageUrl || est.image || null,
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, firestoreData, { merge: true });
    } catch (error) {
      console.error("Error saving establishment to Firestore:", error);
      throw error;
    }
  }
};
