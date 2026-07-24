import { 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  collection, 
  query, 
  where, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase'; // Assuming a firebase config file exists

export interface LoyaltyAccount {
  customerId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: 'Bronze' | 'Prata' | 'Ouro' | 'Diamante';
  welcomeBonusGranted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const getTier = (lifetimePoints: number): LoyaltyAccount['tier'] => {
  if (lifetimePoints < 200) return 'Bronze';
  if (lifetimePoints < 500) return 'Prata';
  if (lifetimePoints < 1000) return 'Ouro';
  return 'Diamante';
};

export const getLoyaltyAccount = async (customerId: string): Promise<LoyaltyAccount | null> => {
  const docRef = doc(db, 'loyaltyAccounts', customerId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as LoyaltyAccount;
  }
  return null;
};

export const grantWelcomeBonus = async (customerId: string) => {
  await runTransaction(db, async (transaction) => {
    const accountRef = doc(db, 'loyaltyAccounts', customerId);
    const accountSnap = await transaction.get(accountRef);
    
    if (!accountSnap.exists()) {
      // Create new account
      const now = Timestamp.now();
      transaction.set(accountRef, {
        customerId,
        pointsBalance: 30,
        lifetimePoints: 30,
        tier: 'Bronze',
        welcomeBonusGranted: true,
        createdAt: now,
        updatedAt: now,
      });
      // Transaction entry
      const txRef = doc(collection(db, 'loyaltyTransactions'));
      transaction.set(txRef, {
        customerId,
        type: 'welcome_bonus',
        points: 30,
        description: 'Bônus de boas-vindas',
        createdAt: now,
      });
    } else {
      const data = accountSnap.data() as LoyaltyAccount;
      if (data.welcomeBonusGranted) return; // Already granted

      const newLifetime = data.lifetimePoints + 30;
      transaction.update(accountRef, {
        pointsBalance: data.pointsBalance + 30,
        lifetimePoints: newLifetime,
        tier: getTier(newLifetime),
        welcomeBonusGranted: true,
        updatedAt: Timestamp.now(),
      });
      // Transaction entry
      const txRef = doc(collection(db, 'loyaltyTransactions'));
      transaction.set(txRef, {
        customerId,
        type: 'welcome_bonus',
        points: 30,
        description: 'Bônus de boas-vindas',
        createdAt: Timestamp.now(),
      });
    }
  });
};
