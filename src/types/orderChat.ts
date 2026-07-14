export type OrderChatRole = 'customer' | 'merchant';

export interface OrderChatMessage {
  id: string;
  orderId: string;
  establishmentId: string;
  senderId: string;
  senderRole: OrderChatRole;
  senderName: string;
  text: string;
  createdAt: any; // Using any for Firebase Timestamp
}
