import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  Timestamp,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AppNotification, NotificationRecipientRole } from '../types/notification';
import { Order } from '../types';

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
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

// Helper to construct path
const getNotificationCollectionRef = (recipientRole: NotificationRecipientRole, recipientId: string) => {
  if (recipientRole === 'customer') {
    return collection(db, 'users', recipientId, 'notifications');
  } else {
    return collection(db, 'establishments', recipientId, 'notifications');
  }
};

const getNotificationPath = (recipientRole: NotificationRecipientRole, recipientId: string, suffix?: string) => {
  const base = recipientRole === 'customer' ? `users/${recipientId}/notifications` : `establishments/${recipientId}/notifications`;
  return suffix ? `${base}/${suffix}` : base;
};

// Deterministic creation
const createNotificationOnce = async (
  recipientRole: NotificationRecipientRole,
  recipientId: string,
  notificationId: string,
  data: Omit<AppNotification, 'id'>
) => {
  const path = getNotificationPath(recipientRole, recipientId, notificationId);
  try {
    const collectionRef = getNotificationCollectionRef(recipientRole, recipientId);
    const docRef = doc(collectionRef, notificationId);
    
    // We write the notification directly using setDoc.
    // Since notificationId is unique (messageId or order status transition),
    // writing directly avoids performing a getDoc which would violate Firestore security rules
    // (since merchants cannot read customer notifications, and customers cannot read merchant notifications).
    await setDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const createMerchantNewOrderNotification = async (order: Order, actorUserId: string) => {
  try {
    const notificationId = `order_${order.id}_created`;
    await createNotificationOnce('merchant', order.establishmentId, notificationId, {
      type: 'new_order',
      recipientRole: 'merchant',
      recipientUserId: null,
      recipientEstablishmentId: order.establishmentId,
      actorUserId: actorUserId,
      actorRole: 'customer',
      orderId: order.id,
      messageId: null,
      orderStatus: order.status,
      isRead: false,
      readAt: null,
      createdAt: serverTimestamp() as Timestamp
    });
  } catch (error: any) {
    console.error("NEW_ORDER_NOTIFICATION_ERROR", {
      orderId: order.id,
      establishmentId: order.establishmentId,
      errorCode: error?.code,
      errorMessage: error?.message
    });
  }
};

export const createMerchantNewMessageNotification = async (order: Order, messageId: string, actorUserId: string) => {
  try {
    const notificationId = `message_${messageId}`;
    await createNotificationOnce('merchant', order.establishmentId, notificationId, {
      type: 'merchant_order_chat',
      recipientRole: 'merchant',
      recipientUserId: null,
      recipientEstablishmentId: order.establishmentId,
      actorUserId: actorUserId,
      actorRole: 'customer',
      orderId: order.id,
      messageId: messageId,
      orderStatus: null,
      isRead: false,
      readAt: null,
      createdAt: serverTimestamp() as Timestamp
    });
  } catch (error: any) {
    console.error("MERCHANT_MESSAGE_NOTIFICATION_ERROR", {
      orderId: order.id,
      messageId: messageId,
      errorCode: error?.code,
      errorMessage: error?.message
    });
  }
};

export const createCustomerOrderStatusNotification = async (order: Order, novoStatus: string, actorUserId: string) => {
  try {
    const notificationId = `order_${order.id}_status_${novoStatus}`;
    await createNotificationOnce('customer', order.customerId, notificationId, {
      type: 'order_status',
      recipientRole: 'customer',
      recipientUserId: order.customerId,
      recipientEstablishmentId: null,
      actorUserId: actorUserId,
      actorRole: 'merchant',
      orderId: order.id,
      messageId: null,
      orderStatus: novoStatus,
      isRead: false,
      readAt: null,
      createdAt: serverTimestamp() as Timestamp
    });
  } catch (error: any) {
    console.error("CUSTOMER_STATUS_NOTIFICATION_ERROR", {
      orderId: order.id,
      status: novoStatus,
      errorCode: error?.code,
      errorMessage: error?.message
    });
  }
};

export const createCustomerNewMessageNotification = async (order: Order, messageId: string, actorUserId: string) => {
  try {
    const notificationId = `message_${messageId}`;
    await createNotificationOnce('customer', order.customerId, notificationId, {
      type: 'customer_order_chat',
      recipientRole: 'customer',
      recipientUserId: order.customerId,
      recipientEstablishmentId: null,
      actorUserId: actorUserId,
      actorRole: 'merchant',
      orderId: order.id,
      messageId: messageId,
      orderStatus: null,
      isRead: false,
      readAt: null,
      createdAt: serverTimestamp() as Timestamp
    });
  } catch (error: any) {
    console.error("CUSTOMER_MESSAGE_NOTIFICATION_ERROR", {
      orderId: order.id,
      messageId: messageId,
      errorCode: error?.code,
      errorMessage: error?.message
    });
  }
};

export const getNotificationPresentation = (notification: AppNotification) => {
  switch (notification.type) {
    case 'new_order':
      return {
        title: 'Novo pedido recebido',
        description: `O pedido #${notification.orderId.slice(-4)} está aguardando confirmação.`
      };
    case 'new_message':
    case 'customer_order_chat':
    case 'merchant_order_chat':
      return {
        title: notification.recipientRole === 'merchant' ? 'Nova mensagem do cliente' : 'Nova mensagem da loja',
        description: `Você recebeu uma mensagem no pedido #${notification.orderId.slice(-4)}.`
      };
    case 'order_status':
      const statusLabels: Record<string, string> = {
        aguardando_confirmacao: 'está aguardando confirmação',
        confirmado: 'foi confirmado',
        em_preparacao: 'está em preparação',
        pronto: 'está pronto',
        pronto_retirada: 'está pronto para retirada',
        saiu_entrega: 'saiu para entrega',
        concluido: 'foi concluído',
        recusado: 'foi recusado'
      };
      return {
        title: 'Pedido atualizado',
        description: `Seu pedido #${notification.orderId.slice(-4)} ${statusLabels[notification.orderStatus || ''] || notification.orderStatus}.`
      };
    default:
      return { title: 'Notificação', description: '' };
  }
};

export const subscribeToNotifications = (
  recipientRole: NotificationRecipientRole, 
  recipientId: string, 
  onNotifications: (n: AppNotification[]) => void,
  onError: (e: Error) => void
) => {
  const path = getNotificationPath(recipientRole, recipientId);
  const collectionRef = getNotificationCollectionRef(recipientRole, recipientId);
  const q = query(collectionRef, orderBy('createdAt', 'desc'), limit(50));
  
  return onSnapshot(q, (snapshot) => {
    const notifications: AppNotification[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AppNotification));
    onNotifications(notifications);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch (e: any) {
      onError(e);
    }
  });
};

export const subscribeToUnreadNotificationCount = (
  recipientRole: NotificationRecipientRole,
  recipientId: string,
  onCount: (count: number) => void,
  onError: (e: Error) => void
) => {
  const path = getNotificationPath(recipientRole, recipientId);
  const collectionRef = getNotificationCollectionRef(recipientRole, recipientId);
  const q = query(collectionRef, where('isRead', '==', false));
  
  return onSnapshot(q, (snapshot) => {
    onCount(snapshot.size);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch (e: any) {
      onError(e);
    }
  });
};

export const markNotificationAsRead = async (recipientRole: NotificationRecipientRole, recipientId: string, notificationId: string) => {
  const path = getNotificationPath(recipientRole, recipientId, notificationId);
  try {
    const collectionRef = getNotificationCollectionRef(recipientRole, recipientId);
    const docRef = doc(collectionRef, notificationId);
    await updateDoc(docRef, {
      isRead: true,
      readAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const markAllNotificationsAsRead = async (recipientRole: NotificationRecipientRole, recipientId: string) => {
  const path = getNotificationPath(recipientRole, recipientId);
  try {
    const collectionRef = getNotificationCollectionRef(recipientRole, recipientId);
    const q = query(collectionRef, where('isRead', '==', false));
    
    const unreadSnapshot = await getDocs(q);
    const batch = writeBatch(db);
    unreadSnapshot.docs.forEach(d => batch.update(d.ref, { isRead: true, readAt: serverTimestamp() }));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};
