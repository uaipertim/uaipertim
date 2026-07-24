import * as admin from 'firebase-admin';
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore("ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe");

export interface PushDevice {
  targetId: string;
  targetKind: 'fid' | 'token';
  platform: 'web';
}

export const getValidDevices = async (
  recipientType: 'users' | 'establishments',
  recipientId: string
): Promise<PushDevice[]> => {
  const devicesSnapshot = await db
    .collection(recipientType)
    .doc(recipientId)
    .collection('pushDevices')
    .where('enabled', '==', true)
    .where('permission', '==', 'granted')
    .get();

  return devicesSnapshot.docs.map(doc => doc.data() as PushDevice);
};
