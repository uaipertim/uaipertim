export interface PushPayload {
  notificationId: string;
  type: 'new_order' | 'new_message' | 'order_status_update';
  recipientRole: 'customer' | 'merchant';
  orderId?: string;
  messageId?: string;
  orderStatus?: string;
}
