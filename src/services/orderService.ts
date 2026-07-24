import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  getDocs, 
  getDoc,
  serverTimestamp,
  DocumentSnapshot,
  runTransaction,
  Timestamp
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { Order, OrderStatus } from "../types";
import { createMerchantNewOrderNotification, createCustomerOrderStatusNotification } from "./notificationService";
import { normalizeOrderStatus, canTransitionOrder } from "../utils/orderLifecycle";
import { getTier, LoyaltyAccount } from "../lib/loyalty";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function mapFirestoreDocToOrder(docSnap: DocumentSnapshot): Order {
  const data = docSnap.data();
  if (!data) {
    throw new Error(`No data found in order document ${docSnap.id}`);
  }

  // Parse timestamps safely
  let createdAtStr = new Date().toISOString();
  if (data.createdAt) {
    if (typeof data.createdAt.toDate === 'function') {
      createdAtStr = data.createdAt.toDate().toISOString();
    } else if (typeof data.createdAt === 'string') {
      createdAtStr = data.createdAt;
    } else if (data.createdAt.seconds) {
      createdAtStr = new Date(data.createdAt.seconds * 1000).toISOString();
    }
  }

  let updatedAtStr = createdAtStr;
  if (data.updatedAt) {
    if (typeof data.updatedAt.toDate === 'function') {
      updatedAtStr = data.updatedAt.toDate().toISOString();
    } else if (typeof data.updatedAt === 'string') {
      updatedAtStr = data.updatedAt;
    } else if (data.updatedAt.seconds) {
      updatedAtStr = new Date(data.updatedAt.seconds * 1000).toISOString();
    }
  }

  // Canonical modality determination
  let rawModality = data.fulfillmentType || data.deliveryType || data.deliveryMethod;
  let canonicalModality: 'entrega' | 'retirada' | 'unknown' = 'unknown';

  if (rawModality) {
    const rawLower = String(rawModality).toLowerCase().trim();
    if (['delivery', 'entrega', 'entregar'].includes(rawLower)) {
      canonicalModality = 'entrega';
    } else if (['pickup', 'retirada', 'retirar', 'balcao', 'takeaway'].includes(rawLower)) {
      canonicalModality = 'retirada';
    }
  }

  if (canonicalModality === 'unknown') {
    console.error(`[Diagnostic] Missing or invalid modality for order ID ${docSnap.id}. Raw field data:`, {
      fulfillmentType: data.fulfillmentType,
      deliveryType: data.deliveryType,
      deliveryMethod: data.deliveryMethod
    });
  }

  // Canonical status determination
  const canonicalStatus = data.status || data.orderStatus || "aguardando_confirmacao";

  // Support both legacy (Portuguese) fields and new fields requested
  return {
    ...data,
    id: docSnap.id,
    orderNumber: data.orderNumber || docSnap.id,
    customerId: data.customerId || data.userId || "",
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
    customerName: data.customerName || "",
    customerPhone: data.customerPhone || "",
    customerAddress: data.customerAddress || data.deliveryAddress || { street: "", number: "", bairro: "" },
    items: data.items || [],
    subtotal: data.subtotal || 0,
    deliveryFee: data.deliveryFee || 0,
    discount: data.discount || 0,
    total: data.total || 0,
    paymentMethod: data.paymentMethod || "cash",
    paymentStatus: data.paymentStatus || "pending",
    platformProcessedPayment: data.platformProcessedPayment || false,
    deliveryType: canonicalModality,
    fulfillmentType: canonicalModality === 'entrega' ? 'delivery' : (canonicalModality === 'retirada' ? 'pickup' : 'unknown'),
    notes: data.notes || "",
    establishmentId: data.establishmentId || "",
    establishmentName: data.establishmentName || "",
    cityId: data.cityId || "",
    cityName: data.cityName || "",
    state: data.state || "",
    status: canonicalStatus,
    orderStatus: canonicalStatus, // Sync legacy status to prevent any client-side divergence
    statusHistory: data.statusHistory || [],
    chatLastMessage: data.chatLastMessage || null,
    chatLastMessageAt: data.chatLastMessageAt || null,
    chatLastSenderRole: data.chatLastSenderRole || null,
    chatUnreadCustomer: Number(data.chatUnreadCustomer ?? 0),
    chatUnreadMerchant: Number(data.chatUnreadMerchant ?? 0),
    chatMessageCount: Number(data.chatMessageCount ?? 0)
  } as Order;
}

function sanitizeFirestoreData(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeFirestoreData);
  }
  if (typeof obj === 'object') {
    // Check for Firestore FieldValue or similar classes (e.g. Timestamp)
    if (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') {
      return obj;
    }
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeFirestoreData(val);
      }
    }
    return cleaned;
  }
  return obj;
}

export const orderService = {
  /**
   * Save a new order to Firestore.
   */
  async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'establishmentId' | 'establishmentName' | 'cityId' | 'cityName' | 'state'> & { addressId?: string }, extraData: {
    establishmentId: string;
    establishmentName: string;
    cityId: string;
    cityName: string;
    state: string;
  }): Promise<Order> {
    const firebaseUser = auth?.currentUser;

    if (!firebaseUser?.uid) {
      throw new Error("AUTH_REQUIRED_TO_CREATE_ORDER");
    }

    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ orderData, extraData })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao processar o pedido de forma segura no servidor.");
      }

      const createdOrder = await response.json();
      
      // Send merchant notification on client side as a secondary system action if needed
      try {
        createMerchantNewOrderNotification(createdOrder, firebaseUser.uid);
      } catch (e) {
        console.warn("Notification trigger warning:", e);
      }

      return createdOrder as Order;
    } catch (error: any) {
      console.error("Error creating secure order:", error);
      throw new Error(error.message || "Erro de rede ao criar pedido. Tente novamente.");
    }
  },

  /**
   * Link an orphaned order to a verified customer manually by administrator.
   */
  async linkOrderToCustomer(params: {
    orderId: string;
    adminId: string;
    previousCustomerId: string | null;
    newCustomerId: string;
    reason: string;
  }): Promise<void> {
    if (!db) {
      throw new Error("Conexão com o banco de dados não está disponível.");
    }

    // 1. Verify target customer exists and has customer role
    const userDocRef = doc(db, "users", params.newCustomerId);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      throw new Error(`O UID de cliente "${params.newCustomerId}" não foi encontrado no banco de dados.`);
    }

    const userData = userDocSnap.data();
    if (userData?.role !== "customer") {
      throw new Error(`O usuário com UID "${params.newCustomerId}" possui cargo "${userData?.role}" e não pode ser vinculado como cliente.`);
    }

    // 2. Update order customer details and append to audit history
    const orderDocRef = doc(db, "orders", params.orderId);
    const orderDocSnap = await getDoc(orderDocRef);
    if (!orderDocSnap.exists()) {
      throw new Error(`Pedido com ID "${params.orderId}" não encontrado.`);
    }

    const orderData = orderDocSnap.data();
    const auditHistory = orderData.linkingAuditHistory || [];
    
    const auditEntry = {
      adminId: params.adminId,
      previousCustomerId: params.previousCustomerId || "anonymous",
      newCustomerId: params.newCustomerId,
      reason: params.reason,
      timestamp: new Date().toISOString()
    };
    
    auditHistory.push(auditEntry);

    await updateDoc(orderDocRef, {
      customerId: params.newCustomerId,
      customerName: userData.name || orderData.customerName,
      customerPhone: userData.phone || orderData.customerPhone,
      linkingAuditHistory: auditHistory,
      updatedAt: serverTimestamp()
    });
  },

  /**
   * Fetch orders for a specific customer.
   */
  async getCustomerOrders(customerId: string): Promise<Order[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, "orders"),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const orders: Order[] = [];
      querySnapshot.forEach((docSnap) => {
        orders.push(mapFirestoreDocToOrder(docSnap));
      });
      return orders;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "orders");
    }
  },

  /**
   * Fetch orders for a specific establishment.
   */
  async getEstablishmentOrders(establishmentId: string): Promise<Order[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, "orders"),
        where("establishmentId", "==", establishmentId),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const orders: Order[] = [];
      querySnapshot.forEach((docSnap) => {
        orders.push(mapFirestoreDocToOrder(docSnap));
      });
      return orders;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "orders");
    }
  },

  /**
   * Subscribe to real-time order updates for a customer.
   */
  subscribeToCustomerOrders(customerId: string, callback: (orders: Order[]) => void): () => void {
    if (!db) {
      callback([]);
      return () => {};
    }
    const q = query(
      collection(db, "orders"),
      where("customerId", "==", customerId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
      const orders: Order[] = [];
      snapshot.forEach((docSnap) => {
        try {
          orders.push(mapFirestoreDocToOrder(docSnap));
        } catch (e) {
          console.error("Error mapping order doc:", e);
        }
      });
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "orders");
    });
  },

  /**
   * Subscribe to real-time order updates for an establishment.
   */
  subscribeToEstablishmentOrders(establishmentId: string, callback: (orders: Order[]) => void): () => void {
    if (!db) {
      callback([]);
      return () => {};
    }
    const q = query(
      collection(db, "orders"),
      where("establishmentId", "==", establishmentId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
      const orders: Order[] = [];
      snapshot.forEach((docSnap) => {
        try {
          orders.push(mapFirestoreDocToOrder(docSnap));
        } catch (e) {
          console.error("Error mapping order doc:", e);
        }
      });
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "orders");
    });
  },

  /**
   * Subscribe to real-time order updates for all orders (Admin).
   */
  subscribeToAdminOrders(filters: {
    cityId?: string;
    establishmentId?: string;
    status?: string;
    deliveryType?: string;
    paymentMethod?: string;
    period?: string;
  }, callback: (orders: Order[]) => void): () => void {
    if (!db) {
      callback([]);
      return () => {};
    }

    const constraints: any[] = [];
    
    if (filters.cityId && filters.cityId !== 'all') {
      constraints.push(where("cityId", "==", filters.cityId));
    }
    if (filters.establishmentId && filters.establishmentId !== 'all') {
      constraints.push(where("establishmentId", "==", filters.establishmentId));
    }
    if (filters.status && filters.status !== 'all') {
      constraints.push(where("status", "==", filters.status));
    }
    if (filters.deliveryType && filters.deliveryType !== 'all') {
      constraints.push(where("deliveryType", "==", filters.deliveryType));
    }
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      constraints.push(where("paymentMethod", "==", filters.paymentMethod));
    }
    if (filters.period && filters.period !== 'all') {
      const now = new Date();
      if (filters.period === 'hoje') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        constraints.push(where("createdAt", ">=", today));
      } else if (filters.period === 'ontem') {
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        constraints.push(where("createdAt", ">=", yesterday));
        constraints.push(where("createdAt", "<", today));
      } else if (filters.period === '7d') {
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        constraints.push(where("createdAt", ">=", sevenDaysAgo));
      }
    }

    // Always sort by createdAt desc
    constraints.push(orderBy("createdAt", "desc"));

    const q = query(collection(db, "orders"), ...constraints);

    const applyClientSideFilters = (allOrders: Order[]): Order[] => {
      return allOrders.filter(o => {
        if (filters.cityId && filters.cityId !== 'all' && o.cityId !== filters.cityId) return false;
        if (filters.establishmentId && filters.establishmentId !== 'all' && o.establishmentId !== filters.establishmentId) return false;
        if (filters.status && filters.status !== 'all' && o.status !== filters.status) return false;
        if (filters.deliveryType && filters.deliveryType !== 'all' && o.deliveryType !== filters.deliveryType) return false;
        if (filters.paymentMethod && filters.paymentMethod !== 'all' && o.paymentMethod !== filters.paymentMethod) return false;
        if (filters.period && filters.period !== 'all') {
          const orderTime = new Date(o.createdAt).getTime();
          const now = new Date().getTime();
          const diffHours = (now - orderTime) / (1000 * 60 * 60);
          if (filters.period === 'hoje' && diffHours > 24) return false;
          if (filters.period === 'ontem' && (diffHours < 24 || diffHours > 48)) return false;
          if (filters.period === '7d' && diffHours > 168) return false;
        }
        return true;
      });
    };

    return onSnapshot(q, (snapshot) => {
      const orders: Order[] = [];
      snapshot.forEach((docSnap) => {
        try {
          orders.push(mapFirestoreDocToOrder(docSnap));
        } catch (e) {
          console.error("Error mapping order doc:", e);
        }
      });
      callback(orders);
    }, (error: any) => {
      // Handle index required failure gracefully
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        console.warn("🚨 Firestore composite index required. Falling back to client-side filtering.");
        console.warn(error.message);

        // Notify app to show index building info
        const indexEvent = new CustomEvent('firestore-index-required', {
          detail: { message: error.message }
        });
        window.dispatchEvent(indexEvent);

        const fallbackQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
        return onSnapshot(fallbackQuery, (fallbackSnapshot) => {
          const allOrders: Order[] = [];
          fallbackSnapshot.forEach((docSnap) => {
            try {
              allOrders.push(mapFirestoreDocToOrder(docSnap));
            } catch (e) {
              console.error(e);
            }
          });
          callback(applyClientSideFilters(allOrders));
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, "orders");
        });
      } else {
        handleFirestoreError(error, OperationType.GET, "orders");
      }
    });
  },

  /**
   * Subscribe to real-time updates for a single order.
   */
  subscribeToOrder(orderId: string, callback: (order: Order | null) => void): () => void {
    if (!db) {
      callback(null);
      return () => {};
    }
    const docRef = doc(db, "orders", orderId);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        try {
          callback(mapFirestoreDocToOrder(docSnap));
        } catch (e) {
          console.error("Error mapping order doc in subscription:", e);
          callback(null);
        }
      } else {
        callback(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `orders/${orderId}`);
    });
  },

  /**
   * Get an order by ID.
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    if (!db) return null;
    try {
      const docRef = doc(db, "orders", orderId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return mapFirestoreDocToOrder(docSnap);
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `orders/${orderId}`);
    }
  },

  /**
   * Update the status of an order transaction-safely with history.
   */
  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    changedByUid?: string,
    changedByRole?: 'merchant' | 'admin' | 'customer',
    note?: string | null
  ): Promise<void> {
    if (!db) return;
    const docRef = doc(db, "orders", orderId);

    try {
      let isCompletedTransition = false;
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists()) {
          throw new Error(`Pedido ${orderId} não existe.`);
        }

        const data = docSnap.data() as Order;
        
        // Using centralized lifecycle utilities
        const nextCanonicalStatus = normalizeOrderStatus(newStatus);
        
        if (!canTransitionOrder(data, nextCanonicalStatus)) {
          throw new Error(`Transição inválida para o status: ${newStatus}`);
        }
        
        isCompletedTransition = (nextCanonicalStatus === 'concluido' && !data.loyaltyPointsGranted);

        const updateFields: any = {
          status: nextCanonicalStatus,
          updatedAt: serverTimestamp(),
          statusHistory: [
            ...(data.statusHistory || []),
            {
              status: nextCanonicalStatus,
              timestamp: new Date().toISOString(),
              changedByUid,
              changedByRole,
              note
            }
          ]
        };

        if (isCompletedTransition) {
          updateFields.loyaltyPointsGranted = true;

          const accountRef = doc(db, 'loyaltyAccounts', data.customerId);
          const accountSnap = await transaction.get(accountRef);

          if (accountSnap.exists()) {
            const accountData = accountSnap.data() as { pointsBalance: number; lifetimePoints: number };
            const newLifetime = (accountData.lifetimePoints || 0) + 20;
            transaction.update(accountRef, {
              pointsBalance: (accountData.pointsBalance || 0) + 20,
              lifetimePoints: newLifetime,
              tier: getTier(newLifetime),
              updatedAt: serverTimestamp()
            });
          } else {
            transaction.set(accountRef, {
              customerId: data.customerId,
              pointsBalance: 20,
              lifetimePoints: 20,
              tier: 'Bronze',
              welcomeBonusGranted: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          const txRef = doc(collection(db, 'loyaltyTransactions'));
          transaction.set(txRef, {
            customerId: data.customerId,
            type: 'completed_order',
            points: 20,
            orderId,
            description: `Pontos por pedido concluído #${orderId.slice(-4)}`,
            createdAt: serverTimestamp()
          });
        }

        transaction.update(docRef, updateFields);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      throw error;
    }
  },

  /**
   * Update order payment status.
   */
  async updateOrderPaymentStatus(orderId: string, paymentStatus: 'pending' | 'paid' | 'not_paid' | 'cancelled'): Promise<void> {
    if (!db) return;
    try {
      const docRef = doc(db, "orders", orderId);
      await updateDoc(docRef, {
        paymentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    }
  }
};
