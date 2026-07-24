import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { checkAndSetDispatch, markDispatchCompleted } from "./push/pushDispatch";
import { getValidDevices } from "./push/pushDevices";

admin.initializeApp();

const DATABASE_ID = "ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe";

const dispatchNotification = async (
  recipientType: 'users' | 'establishments',
  recipientId: string,
  notificationId: string,
  notificationData: any
) => {
  const shouldProcess = await checkAndSetDispatch(recipientType, recipientId, notificationId);
  if (!shouldProcess) return;

  const devices = await getValidDevices(recipientType, recipientId);
  if (devices.length === 0) {
    await markDispatchCompleted(recipientType, recipientId, notificationId, 0);
    return;
  }

  // Implementation of actual FCM send would go here
  // await admin.messaging().sendEachForMulticast(...)

  console.log(`Dispatching to ${devices.length} devices for ${notificationId}`);
  
  await markDispatchCompleted(recipientType, recipientId, notificationId, devices.length);
};

export const onCustomerNotificationCreated = onDocumentCreated(
  {
    document: "users/{userId}/notifications/{notificationId}",
    database: DATABASE_ID
  },
  async (event) => {
    await dispatchNotification('users', event.params.userId, event.params.notificationId, event.data?.data());
  }
);

export const onMerchantNotificationCreated = onDocumentCreated(
  {
    document: "establishments/{establishmentId}/notifications/{notificationId}",
    database: DATABASE_ID
  },
  async (event) => {
    await dispatchNotification('establishments', event.params.establishmentId, event.params.notificationId, event.data?.data());
  }
);
