import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  doc,
  getDoc,
  updateDoc,
  increment
} from 'firebase/firestore';

import { db, auth } from '../lib/firebase';
import { OrderChatMessage } from '../types/orderChat';
import { createMerchantNewMessageNotification, createCustomerNewMessageNotification } from './notificationService';

async function resolveAuthenticatedContext() {
  const firebaseUser = auth.currentUser;

  if (!firebaseUser?.uid) {
    throw new Error("AUTH_USER_NOT_AVAILABLE");
  }

  const profileRef = doc(db, "users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileRef);

  if (!profileSnapshot.exists()) {
    throw new Error("USER_PROFILE_NOT_AVAILABLE");
  }

  const userProfile = {
    uid: firebaseUser.uid,
    ...profileSnapshot.data()
  } as any;

  if (userProfile.active !== true) {
    throw new Error("USER_ACCOUNT_INACTIVE");
  }

  if (userProfile.role !== "customer" && userProfile.role !== "merchant") {
    throw new Error("CHAT_ROLE_NOT_ALLOWED");
  }

  return {
    firebaseUser,
    userProfile
  };
}

export async function getAuthorizedOrder(orderId: string, currentUid: string, userProfile: any) {
  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error("ORDER_NOT_FOUND");
  }
  const order = { id: orderSnap.id, ...orderSnap.data() } as any;

  if (userProfile.role === "customer") {
    if (order.customerId !== currentUid) {
      throw new Error("ORDER_CHAT_ACCESS_DENIED");
    }
  } else if (userProfile.role === "merchant") {
    if (order.establishmentId !== userProfile.establishmentId) {
      throw new Error("ORDER_CHAT_ACCESS_DENIED");
    }
  } else {
    throw new Error("ORDER_CHAT_ACCESS_DENIED");
  }

  return order;
}

export async function sendOrderMessage(orderId: string, text: string): Promise<string> {
  const normalizedText = text.trim();

  if (!orderId) {
    throw new Error("ORDER_ID_NOT_AVAILABLE");
  }

  if (!normalizedText) {
    throw new Error("EMPTY_MESSAGE");
  }

  if (normalizedText.length > 1000) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  const { firebaseUser, userProfile } = await resolveAuthenticatedContext();

  const order = await getAuthorizedOrder(orderId, firebaseUser.uid, userProfile);

  const messageData = {
    orderId,
    establishmentId: order.establishmentId,
    senderId: firebaseUser.uid,
    senderRole: userProfile.role,
    senderName: userProfile.name || '',
    text: normalizedText,
    createdAt: serverTimestamp()
  };

  try {
    const messageRef = await addDoc(
      collection(db, "orders", orderId, "messages"),
      messageData
    );

    if (userProfile.role === 'customer') {
      createMerchantNewMessageNotification(order, messageRef.id, firebaseUser.uid);
    } else {
      createCustomerNewMessageNotification(order, messageRef.id, firebaseUser.uid);
    }

    try {
      const updateData: any = {
        chatLastMessage: normalizedText,
        chatLastMessageAt: serverTimestamp(),
        chatLastSenderRole: userProfile.role,
        chatMessageCount: increment(1)
      };

      if (userProfile.role === 'customer') {
        updateData.chatUnreadMerchant = increment(1);
      } else {
        updateData.chatUnreadCustomer = increment(1);
      }

      await updateDoc(doc(db, "orders", orderId), updateData);
    } catch (e) {
      console.error("CHAT_METADATA_UPDATE_ERROR", e);
    }

    return messageRef.id;
  } catch (error: any) {
    console.error("ORDER_CHAT_SEND_ERROR", {
      code: error?.code || "unknown",
      message: error?.message || "",
      orderId,
      uid: firebaseUser.uid,
      role: userProfile.role,
      establishmentId: order.establishmentId
    });
    throw error;
  }
}

export function subscribeToOrderMessages(
  orderId: string,
  onMessages: (messages: OrderChatMessage[]) => void,
  onError: (error: any) => void
) {
  let active = true;
  let unsubscribe: (() => void) | null = null;

  async function init() {
    try {
      const { firebaseUser, userProfile } = await resolveAuthenticatedContext();
      const order = await getAuthorizedOrder(orderId, firebaseUser.uid, userProfile);

      if (!active) return;

      const messagesRef = collection(db, "orders", orderId, "messages");
      const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));

      unsubscribe = onSnapshot(
        messagesQuery,
        (snapshot) => {
          if (!active) return;
          const messages = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as OrderChatMessage[];
          onMessages(messages);
        },
        (error) => {
          if (!active) return;
          console.error("ORDER_CHAT_SUBSCRIBE_ERROR", {
            code: error?.code || "unknown",
            message: error?.message || "",
            orderId,
            uid: firebaseUser.uid,
            role: userProfile.role,
            establishmentId: order.establishmentId
          });
          onError(error);
        }
      );
    } catch (err: any) {
      if (!active) return;
      console.error("ORDER_CHAT_INIT_ERROR", {
        code: err?.message || "unknown",
        message: err?.message || "",
        orderId
      });
      onError(err);
    }
  }

  init();

  return () => {
    active = false;
    if (unsubscribe) {
      unsubscribe();
    }
  };
}
