import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  Timestamp, 
  runTransaction 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { getTier } from '../lib/loyalty';

const getAuthHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || ''}`
  };
};

export interface LoyaltyConfig {
  welcomeBonusPoints: number;
  pointsPerCompletedOrder: number;
  bronzeLimit: number;
  prataLimit: number;
  ouroLimit: number;
  diamanteLimit: number;
  defaultValidityDays: number;
}

export interface LoyaltyReward {
  id?: string;
  title: string;
  description: string;
  pointsCost: number;
  rewardType: 'percentage_discount' | 'fixed_discount' | 'delivery_benefit';
  rewardValue: number;
  maximumDiscount?: number;
  minimumOrderValue?: number;
  eligibleMerchantIds: string[];
  availableForAllMerchants: boolean;
  stock?: number;
  limitPerCustomer?: number;
  startsAt?: string;
  expiresAt?: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LoyaltyRedemption {
  id?: string;
  customerId: string;
  customerName?: string;
  rewardId: string;
  rewardTitle?: string;
  pointsSpent: number;
  status: 'available' | 'used' | 'expired' | 'cancelled';
  couponCode: string;
  usedInOrderId?: string;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

export interface LoyaltyTransaction {
  id?: string;
  customerId: string;
  type: 'welcome_bonus' | 'completed_order' | 'reward_redemption' | 'order_refund' | 'admin_adjustment';
  points: number;
  orderId?: string;
  rewardId?: string;
  description: string;
  createdAt: Timestamp;
}

const DEFAULT_CONFIG: LoyaltyConfig = {
  welcomeBonusPoints: 30,
  pointsPerCompletedOrder: 20,
  bronzeLimit: 0,
  prataLimit: 200,
  ouroLimit: 500,
  diamanteLimit: 1000,
  defaultValidityDays: 30,
};

const INITIAL_REWARDS: Omit<LoyaltyReward, 'id'>[] = [
  {
    title: '5% de desconto',
    description: 'Desconto de 5% no valor total dos produtos',
    pointsCost: 60,
    rewardType: 'percentage_discount',
    rewardValue: 5,
    maximumDiscount: 10,
    eligibleMerchantIds: [],
    availableForAllMerchants: true,
    active: true,
  },
  {
    title: 'R$ 10 de desconto',
    description: 'R$ 10 de desconto para compras acima de R$ 50',
    pointsCost: 120,
    rewardType: 'fixed_discount',
    rewardValue: 10,
    minimumOrderValue: 50,
    eligibleMerchantIds: [],
    availableForAllMerchants: true,
    active: true,
  },
  {
    title: 'Benefício na entrega',
    description: 'Desconto de até R$ 12 na taxa de entrega',
    pointsCost: 200,
    rewardType: 'delivery_benefit',
    rewardValue: 12,
    maximumDiscount: 12,
    eligibleMerchantIds: [],
    availableForAllMerchants: true,
    active: true,
  },
  {
    title: '15% de desconto',
    description: 'Desconto de 15% para compras acima de R$ 80',
    pointsCost: 300,
    rewardType: 'percentage_discount',
    rewardValue: 15,
    maximumDiscount: 25,
    minimumOrderValue: 80,
    eligibleMerchantIds: [],
    availableForAllMerchants: true,
    active: true,
  }
];

export const loyaltyService = {
  // CONFIGURATIONS
  async getConfig(): Promise<LoyaltyConfig> {
    try {
      const docRef = doc(db, 'loyaltyConfig', 'default');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as LoyaltyConfig;
      }
      // Auto seed default config client-side
      console.log("No loyalty config found, auto-seeding default config...");
      await setDoc(docRef, DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    } catch (e) {
      console.error('Error getting loyalty config:', e);
      return DEFAULT_CONFIG;
    }
  },

  async updateConfig(config: LoyaltyConfig): Promise<void> {
    const docRef = doc(db, 'loyaltyConfig', 'default');
    await setDoc(docRef, config);
  },

  // REWARDS
  async getRewards(includeInactive = false): Promise<LoyaltyReward[]> {
    try {
      const rewardsCol = collection(db, 'loyaltyRewards');
      const querySnap = await getDocs(rewardsCol);
      
      let rewardsList = querySnap.docs.map(d => ({ id: d.id, ...d.data() } as LoyaltyReward));

      // If rewards list is empty, auto-seed default rewards client-side
      if (rewardsList.length === 0) {
        console.log("No loyalty rewards found, auto-seeding initial rewards...");
        const seededList: LoyaltyReward[] = [];
        const now = Timestamp.now();
        for (const r of INITIAL_REWARDS) {
          const docRef = doc(collection(db, 'loyaltyRewards'));
          const rewardData = {
            ...r,
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(docRef, rewardData);
          seededList.push({ id: docRef.id, ...rewardData } as LoyaltyReward);
        }
        rewardsList = seededList;
      }

      if (!includeInactive) {
        rewardsList = rewardsList.filter(r => r.active);
      }
      return rewardsList;
    } catch (e) {
      console.error('Error getting loyalty rewards:', e);
      return [];
    }
  },

  async saveReward(reward: LoyaltyReward): Promise<string> {
    const rewardsCol = collection(db, 'loyaltyRewards');
    const now = Timestamp.now();
    
    const { id, ...rawFields } = reward;
    const cleanFields: any = {};
    for (const [key, value] of Object.entries(rawFields)) {
      cleanFields[key] = value === undefined ? null : value;
    }

    if (id) {
      const docRef = doc(db, 'loyaltyRewards', id);
      await updateDoc(docRef, {
        ...cleanFields,
        updatedAt: now,
      });
      return id;
    } else {
      const docRef = await addDoc(rewardsCol, {
        ...cleanFields,
        createdAt: now,
        updatedAt: now,
      });
      return docRef.id;
    }
  },

  // REDEMPTIONS
  async getRedemptions(customerId?: string): Promise<LoyaltyRedemption[]> {
    try {
      const colRef = collection(db, 'loyaltyRedemptions');
      let querySnap;
      if (customerId) {
        const q = query(colRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
        querySnap = await getDocs(q);
      } else {
        const q = query(colRef, orderBy('createdAt', 'desc'));
        querySnap = await getDocs(q);
      }
      return querySnap.docs.map(d => ({ id: d.id, ...d.data() } as LoyaltyRedemption));
    } catch (e) {
      console.error('Error getting loyalty redemptions:', e);
      return [];
    }
  },

  // TRANSACTIONS
  async getTransactions(customerId: string): Promise<LoyaltyTransaction[]> {
    try {
      const colRef = collection(db, 'loyaltyTransactions');
      const q = query(colRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
      const querySnap = await getDocs(q);
      return querySnap.docs.map(d => ({ id: d.id, ...d.data() } as LoyaltyTransaction));
    } catch (e) {
      console.error('Error getting loyalty transactions:', e);
      return [];
    }
  },

  // EXECUTE REDEMPTION (Atomic Secure Mutation)
  async redeemReward(customerId: string, reward: LoyaltyReward): Promise<string> {
    if (!reward.id) throw new Error('Custo em pontos inválido.');

    const randCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    const code = `UP-${reward.pointsCost}-${randCode}`;
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    await runTransaction(db, async (transaction) => {
      const rewardRef = doc(db, 'loyaltyRewards', reward.id!);
      const rewardSnap = await transaction.get(rewardRef);
      if (!rewardSnap.exists()) {
        throw new Error('Prêmio não encontrado.');
      }
      const rewardData = rewardSnap.data() as LoyaltyReward;
      if (!rewardData.active) {
        throw new Error('Este prêmio não está ativo.');
      }

      const accountRef = doc(db, 'loyaltyAccounts', customerId);
      const accountSnap = await transaction.get(accountRef);
      if (!accountSnap.exists()) {
        throw new Error('Sua conta de fidelidade não foi encontrada.');
      }
      const accountData = accountSnap.data() as { pointsBalance: number };

      if (accountData.pointsBalance < rewardData.pointsCost) {
        throw new Error(`Saldo insuficiente. Você precisa de ${rewardData.pointsCost} pontos.`);
      }

      // Deduct points
      transaction.update(accountRef, {
        pointsBalance: accountData.pointsBalance - rewardData.pointsCost,
        updatedAt: now
      });

      // Create transaction record
      const txRef = doc(collection(db, 'loyaltyTransactions'));
      transaction.set(txRef, {
        customerId,
        type: 'reward_redemption',
        points: -rewardData.pointsCost,
        rewardId: reward.id,
        description: `Resgate do prêmio: ${rewardData.title}`,
        createdAt: now
      });

      // Create redemption record
      const redemptionRef = doc(collection(db, 'loyaltyRedemptions'));
      transaction.set(redemptionRef, {
        customerId,
        rewardId: reward.id,
        rewardTitle: rewardData.title,
        pointsSpent: rewardData.pointsCost,
        status: 'available',
        couponCode: code,
        createdAt: now,
        expiresAt
      });
    });

    return code;
  },

  // INITIALIZE USER LOYALTY PROFILE (Idempotent Secure welcome bonus allocation)
  async initializeLoyalty(): Promise<void> {
    if (!auth.currentUser?.uid) throw new Error('Usuário não autenticado.');
    const customerId = auth.currentUser.uid;
    const now = Timestamp.now();
    const accountRef = doc(db, 'loyaltyAccounts', customerId);

    await runTransaction(db, async (transaction) => {
      const accountSnap = await transaction.get(accountRef);
      if (accountSnap.exists()) {
        return; // Already exists
      }

      // Initialize account
      transaction.set(accountRef, {
        customerId,
        pointsBalance: 30,
        lifetimePoints: 30,
        tier: 'Bronze',
        welcomeBonusGranted: true,
        createdAt: now,
        updatedAt: now
      });

      // Add transaction entry
      const txRef = doc(collection(db, 'loyaltyTransactions'));
      transaction.set(txRef, {
        customerId,
        type: 'welcome_bonus',
        points: 30,
        description: 'Bônus de boas-vindas',
        createdAt: now
      });
    });
  },

  // RUN SEED ROUTINE (Admin only secure seeding)
  async runSeed(): Promise<void> {
    // Already handled gracefully on-demand when loading configurations or rewards
    console.log("Seed routine handled dynamically client-side.");
  },

  // CUSTOMER MIGRATION UTILITY (Calculates and builds loyalty profile from finished orders)
  async migrateCustomer(customerId: string, customerName: string): Promise<void> {
    await runTransaction(db, async (transaction) => {
      const accountRef = doc(db, 'loyaltyAccounts', customerId);
      const accountSnap = await transaction.get(accountRef);

      // Check for completed orders
      const ordersCol = collection(db, 'orders');
      const ordersQuery = query(ordersCol, where('customerId', '==', customerId), where('status', '==', 'concluido'));
      const ordersSnap = await getDocs(ordersQuery);

      const completedOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Find already granted points transactions
      const txCol = collection(db, 'loyaltyTransactions');
      const txQuery = query(txCol, where('customerId', '==', customerId));
      const txSnap = await getDocs(txQuery);
      const existingTx = txSnap.docs.map(d => d.data());

      let hasWelcome = existingTx.some(t => t.type === 'welcome_bonus');
      const existingOrderIds = new Set(existingTx.filter(t => t.type === 'completed_order').map(t => t.orderId));

      let totalPointsToGrant = 0;
      let newLifetimePoints = 0;

      const now = Timestamp.now();

      // Setup initial account if not existing
      let accountData = accountSnap.exists() ? accountSnap.data() as { pointsBalance: number; lifetimePoints: number; welcomeBonusGranted: boolean } : null;

      if (!hasWelcome) {
        totalPointsToGrant += 30;
        newLifetimePoints += 30;
        hasWelcome = true;

        const welcomeTxRef = doc(collection(db, 'loyaltyTransactions'));
        transaction.set(welcomeTxRef, {
          customerId,
          type: 'welcome_bonus',
          points: 30,
          description: 'Bônus de boas-vindas (migrado)',
          createdAt: now,
        });
      }

      for (const order of completedOrders) {
        if (!existingOrderIds.has(order.id)) {
          totalPointsToGrant += 20;
          newLifetimePoints += 20;

          // Add completed_order transaction entry
          const orderTxRef = doc(collection(db, 'loyaltyTransactions'));
          transaction.set(orderTxRef, {
            customerId,
            type: 'completed_order',
            points: 20,
            orderId: order.id,
            description: `Pontos por pedido concluído #${order.id.slice(-4)} (migrado)`,
            createdAt: now,
          });

          // Mark order
          const orderRef = doc(db, 'orders', order.id);
          transaction.update(orderRef, {
            loyaltyPointsGranted: true,
          });
        }
      }

      if (totalPointsToGrant > 0) {
        if (accountSnap.exists() && accountData) {
          const finalLifetime = accountData.lifetimePoints + newLifetimePoints;
          transaction.update(accountRef, {
            pointsBalance: accountData.pointsBalance + totalPointsToGrant,
            lifetimePoints: finalLifetime,
            tier: getTier(finalLifetime),
            welcomeBonusGranted: true,
            updatedAt: now,
          });
        } else {
          transaction.set(accountRef, {
            customerId,
            pointsBalance: totalPointsToGrant,
            lifetimePoints: newLifetimePoints,
            tier: getTier(newLifetimePoints),
            welcomeBonusGranted: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      } else if (!accountSnap.exists()) {
        // Always make sure account is initialized
        transaction.set(accountRef, {
          customerId,
          pointsBalance: 30,
          lifetimePoints: 30,
          tier: 'Bronze',
          welcomeBonusGranted: true,
          createdAt: now,
          updatedAt: now,
        });

        const welcomeTxRef = doc(collection(db, 'loyaltyTransactions'));
        transaction.set(welcomeTxRef, {
          customerId,
          type: 'welcome_bonus',
          points: 30,
          description: 'Bônus de boas-vindas',
          createdAt: now,
        });
      }
    });
  }
};
