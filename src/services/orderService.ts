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
  runTransaction
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { Order, OrderStatus } from "../types";

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
    deliveryType: data.deliveryType || (data.fulfillmentType === "pickup" ? "retirada" : "entrega"),
    notes: data.notes || "",
    establishmentId: data.establishmentId || "",
    establishmentName: data.establishmentName || "",
    cityId: data.cityId || "",
    cityName: data.cityName || "",
    state: data.state || "",
    status: data.status || data.orderStatus || "aguardando_confirmacao",
    statusHistory: data.statusHistory || [],
    chatLastMessage: data.chatLastMessage || null,
    chatLastMessageAt: data.chatLastMessageAt || null,
    chatLastSenderRole: data.chatLastSenderRole || null,
    chatUnreadCustomer: Number(data.chatUnreadCustomer ?? 0),
    chatUnreadMerchant: Number(data.chatUnreadMerchant ?? 0),
    chatMessageCount: Number(data.chatMessageCount ?? 0)
  } as Order;
}

export const orderService = {
  /**
   * Save a new order to Firestore.
   */
  async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'establishmentId' | 'establishmentName' | 'cityId' | 'cityName' | 'state'>, extraData: {
    establishmentId: string;
    establishmentName: string;
    cityId: string;
    cityName: string;
    state: string;
  }): Promise<Order> {
    if (!db) {
      throw new Error("Conexão com o banco de dados não está disponível.");
    }

    // Generate a unique ID starting with 'PL-'
    const num = Math.floor(1000 + Math.random() * 9000);
    const orderId = `PL-${num}`;

    const timestamp = new Date().toISOString();

    const orderPayload = {
      orderNumber: orderId,
      customerId: orderData.customerId || auth?.currentUser?.uid || "anonymous",
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      establishmentId: extraData.establishmentId,
      establishmentName: extraData.establishmentName,
      cityId: extraData.cityId,
      cityName: extraData.cityName,
      state: extraData.state,
      fulfillmentType: orderData.deliveryType === "retirada" ? "pickup" : "delivery",
      deliveryType: orderData.deliveryType,
      items: orderData.items,
      subtotal: orderData.subtotal,
      deliveryFee: orderData.deliveryFee,
      discount: orderData.discount,
      total: orderData.total,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: orderData.paymentStatus || 'pending',
      platformProcessedPayment: false,
      orderStatus: 'aguardando_confirmacao',
      status: 'aguardando_confirmacao',
      statusHistory: [
        { status: 'aguardando_confirmacao', timestamp }
      ],
      customerAddress: orderData.customerAddress,
      deliveryAddress: orderData.customerAddress,
      notes: orderData.notes || "",
      changeRequired: orderData.changeRequired || false,
      changeFor: orderData.changeFor || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, "orders", orderId), orderPayload);
      
      // Return a complete Order object mapped
      return {
        ...orderPayload,
        id: orderId,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as any as Order;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    }
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
    changedByRole?: 'merchant' | 'admin',
    note?: string | null
  ): Promise<void> {
    if (!db) return;
    const docRef = doc(db, "orders", orderId);

    try {
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists()) {
          throw new Error(`Pedido ${orderId} não existe.`);
        }

        const data = docSnap.data();
        const currentStatus = data.status || data.orderStatus || 'aguardando_confirmacao';
        const deliveryType = data.deliveryType || (data.fulfillmentType === 'pickup' ? 'retirada' : 'entrega');

        // Validation bypass for admin unless it is completed->preparing or cancelled->confirmed
        const isBypass = changedByRole === 'admin';

        if (currentStatus === 'concluido' && newStatus === 'em_preparacao') {
          throw new Error("Transição inválida: Não é permitido retroceder de Concluído para Em Preparação.");
        }
        if (currentStatus === 'recusado' && newStatus === 'confirmado') {
          throw new Error("Transição inválida: Não é permitido retroceder de Recusado para Confirmado.");
        }

        if (!isBypass) {
          const allowedTransitions: Record<string, string[]> = {
            aguardando_confirmacao: ['confirmado', 'recusado'],
            confirmado: ['em_preparacao', 'recusado'],
            em_preparacao: deliveryType === 'retirada' ? ['pronto_retirada', 'recusado'] : ['pronto', 'recusado'],
            pronto: ['saiu_entrega', 'recusado'],
            pronto_retirada: ['concluido', 'recusado'],
            saiu_entrega: ['concluido', 'recusado'],
            concluido: [],
            recusado: []
          };

          const allowed = allowedTransitions[currentStatus] || [];
          if (!allowed.includes(newStatus)) {
            throw new Error(`Transição inválida: Não é permitido mudar de ${currentStatus} para ${newStatus}.`);
          }
        }

        const currentHistory = data.statusHistory || [];
        const updatedHistory = [...currentHistory];

        const timestamp = new Date().toISOString();
        const uid = changedByUid || auth?.currentUser?.uid || 'system';
        const role = changedByRole || 'merchant';

        updatedHistory.push({
          status: newStatus,
          timestamp,
          changedByUid: uid,
          changedByRole: role,
          note: note || null
        });

        transaction.update(docRef, {
          status: newStatus,
          orderStatus: newStatus,
          statusHistory: updatedHistory,
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
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
