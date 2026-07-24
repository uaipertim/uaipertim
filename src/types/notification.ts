import { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | "new_order"
  | "order_status"
  | "new_message"
  | "customer_order_chat"
  | "merchant_order_chat";

export type NotificationRecipientRole =
  | "customer"
  | "merchant";

export type NotificationActorRole =
  | "customer"
  | "merchant"
  | "admin";

export interface AppNotification {
  id: string;

  type: NotificationType;

  recipientRole: NotificationRecipientRole;
  recipientUserId: string | null;
  recipientEstablishmentId: string | null;

  actorUserId: string;
  actorRole: NotificationActorRole;

  orderId: string;
  messageId: string | null;
  orderStatus: string | null;

  isRead: boolean;
  readAt: Timestamp | null;
  createdAt: Timestamp | null;
}
