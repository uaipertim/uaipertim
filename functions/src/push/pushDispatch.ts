import * as admin from 'firebase-admin';
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore("ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe");

export const checkAndSetDispatch = async (
  recipientType: 'users' | 'establishments',
  recipientId: string,
  notificationId: string
): Promise<boolean> => {
  const dispatchId = `${recipientType}_${recipientId}_${notificationId}`;
  const dispatchRef = db.collection('_pushDispatches').doc(dispatchId);

  return await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(dispatchRef);
    if (doc.exists && doc.data()?.status === 'completed') {
      return false; // Already processed
    }

    transaction.set(dispatchRef, {
      notificationId,
      recipientType,
      recipientId,
      status: 'processing',
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    return true; // Proceed with processing
  });
};

export const markDispatchCompleted = async (
  recipientType: 'users' | 'establishments',
  recipientId: string,
  notificationId: string,
  successCount: number
) => {
  const dispatchId = `${recipientType}_${recipientId}_${notificationId}`;
  await db.collection('_pushDispatches').doc(dispatchId).update({
    status: 'completed',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    successCount
  });
};
