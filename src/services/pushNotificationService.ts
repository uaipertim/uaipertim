import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { getApp } from "firebase/app";
import { auth } from "../lib/firebase";

export type PushStatus = 
  | 'unsupported' 
  | 'unavailable_in_preview' 
  | 'permission_default' 
  | 'permission_granted' 
  | 'permission_denied' 
  | 'registration_pending' 
  | 'registered' 
  | 'registration_error' 
  | 'requires_pwa_installation';

export interface DeviceRegistrationStatus {
  permission: string;
  registeredForCurrentUser: boolean;
  registeredForAnotherUser: boolean;
  enabled: boolean;
  subscriptionIdMasked: string;
  platform: string;
  displayMode: string;
}

export interface PushCapability {
  secureContext: boolean;
  notificationApiSupported: boolean;
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  firebaseMessagingSupported: boolean;
  permission: "default" | "granted" | "denied";
  displayMode: "browser" | "standalone";
  platform: "desktop" | "android" | "ios" | "unknown";
  supported: boolean;
  reasonCode?: "PUSH_INSECURE_CONTEXT" | "PUSH_NOTIFICATION_API_UNSUPPORTED" | "PUSH_SERVICE_WORKER_UNSUPPORTED" | "PUSH_MANAGER_UNSUPPORTED" | "PUSH_FIREBASE_MESSAGING_UNSUPPORTED" | "PUSH_PERMISSION_BLOCKED" | "PUSH_IOS_INSTALL_REQUIRED" | "PUSH_VAPID_KEY_MISSING";
  registrationStatus?: DeviceRegistrationStatus | null;
}

export const isPushSupported = async (): Promise<boolean> => {
  try {
    return await isSupported();
  } catch {
    return false;
  }
};

const detectBrowser = (): string => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edge")) return "Edge";
  return "unknown";
};

export const getPushCapability = async (): Promise<PushCapability> => {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  const notificationApiSupported = typeof window !== 'undefined' && 'Notification' in window;
  const serviceWorkerSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator;
  const pushManagerSupported = typeof window !== 'undefined' && 'PushManager' in window;
  
  let firebaseMessagingSupported = false;
  try {
    firebaseMessagingSupported = await isSupported();
  } catch {
    firebaseMessagingSupported = false;
  }

  const permission = typeof window !== 'undefined' && 'Notification' in window 
    ? Notification.permission 
    : 'default';

  const displayMode = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches 
    ? 'standalone' 
    : 'browser';

  const getPlatform = (): "desktop" | "android" | "ios" | "unknown" => {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/mac|win|linux/.test(ua)) return 'desktop';
    return 'unknown';
  };

  const platform = getPlatform();

  // Load from multiple potential public environment names for redundancy
  const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_PUBLIC_KEY || (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;

  let supported = secureContext && notificationApiSupported && serviceWorkerSupported && pushManagerSupported && firebaseMessagingSupported;
  let reasonCode: any = undefined;

  if (platform === 'ios' && displayMode !== 'standalone') {
    supported = false;
    reasonCode = "PUSH_IOS_INSTALL_REQUIRED";
  } else if (!secureContext) {
    supported = false;
    reasonCode = "PUSH_INSECURE_CONTEXT";
  } else if (!notificationApiSupported) {
    supported = false;
    reasonCode = "PUSH_NOTIFICATION_API_UNSUPPORTED";
  } else if (!serviceWorkerSupported) {
    supported = false;
    reasonCode = "PUSH_SERVICE_WORKER_UNSUPPORTED";
  } else if (!pushManagerSupported) {
    supported = false;
    reasonCode = "PUSH_MANAGER_UNSUPPORTED";
  } else if (!firebaseMessagingSupported) {
    supported = false;
    reasonCode = "PUSH_FIREBASE_MESSAGING_UNSUPPORTED";
  } else if (permission === 'denied') {
    supported = false;
    reasonCode = "PUSH_PERMISSION_BLOCKED";
  } else if (!vapidKey) {
    supported = false;
    reasonCode = "PUSH_VAPID_KEY_MISSING";
  }

  let registrationStatus: DeviceRegistrationStatus | null = null;
  if (supported && permission === 'granted' && typeof window !== 'undefined') {
    try {
      const firebaseUser = auth?.currentUser;
      if (firebaseUser) {
        const messaging = getMessaging(getApp());
        const token = await getToken(messaging, { vapidKey });
        if (token) {
          registrationStatus = await checkCurrentDeviceRegistration(token);
        }
      }
    } catch (e) {
      console.warn("Failed to automatically retrieve registration status on capability check:", e);
    }
  }

  return {
    secureContext,
    notificationApiSupported,
    serviceWorkerSupported,
    pushManagerSupported,
    firebaseMessagingSupported,
    permission,
    displayMode,
    platform,
    supported,
    reasonCode,
    registrationStatus
  };
};

export const sha256 = async (message: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const checkCurrentDeviceRegistration = async (token: string): Promise<DeviceRegistrationStatus | null> => {
  try {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) return null;

    const registrationHash = await sha256(token);
    const apiToken = await firebaseUser.getIdToken();
    const response = await fetch(`/api/push/current-device?registrationHash=${registrationHash}&token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch current device registration status.");
    }

    const body = await response.json();
    return body.data;
  } catch (error) {
    console.error("Error checking device registration status:", error);
    return null;
  }
};

export const autoRehydratePushRegistration = async (): Promise<boolean> => {
  try {
    const capability = await getPushCapability();
    if (!capability.supported || capability.permission !== 'granted') {
      console.log("[Push Rehydrate] Push is not supported or permission is not granted yet.");
      return false;
    }

    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) {
      console.log("[Push Rehydrate] No authenticated user yet.");
      return false;
    }

    // 1. Get FCM Token
    const messaging = getMessaging(getApp());
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      console.warn("[Push Rehydrate] Service worker registration not found.");
      return false;
    }

    const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_PUBLIC_KEY || (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn("[Push Rehydrate] VAPID Key missing.");
      return false;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.warn("[Push Rehydrate] Failed to generate FCM Web Push token during rehydration.");
      return false;
    }

    // 2. Check current registration status
    const regStatus = await checkCurrentDeviceRegistration(token);
    
    // If it is registered for current user AND active (enabled), we can just trigger a silent last-seen ping
    if (regStatus && regStatus.registeredForCurrentUser && regStatus.enabled) {
      console.log("[Push Rehydrate] Device is already registered and active for current user. Pinging backend...");
      const apiToken = await firebaseUser.getIdToken();
      await fetch('/api/push/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          token,
          platform: capability.platform,
          browser: detectBrowser(),
          displayMode: capability.displayMode
        })
      });
      return true;
    }

    // 3. Otherwise (not registered, registered for another user, or disabled), we silently register (repair) the link!
    console.log("[Push Rehydrate] Repairing registration silently for current user...");
    const apiToken = await firebaseUser.getIdToken();
    const response = await fetch('/api/push/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        token,
        platform: capability.platform,
        browser: detectBrowser(),
        displayMode: capability.displayMode
      })
    });

    if (!response.ok) {
      console.error("[Push Rehydrate] Silent repair failed:", await response.text());
      return false;
    }

    console.log("[Push Rehydrate] Silent repair completed successfully.");
    return true;
  } catch (error) {
    console.error("[Push Rehydrate] Unexpected error in silent rehydration:", error);
    return false;
  }
};

export const getPushEnvironmentStatus = (): PushStatus => {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'registered';
  }
  if (Notification.permission === 'denied') {
    return 'permission_denied';
  }
  return 'permission_default';
};

export const requestPushPermission = async (): Promise<string | null> => {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  const permission = await Notification.requestPermission();
  return permission;
};

export const registerCurrentPushDevice = async (): Promise<string | null> => {
  try {
    const capability = await getPushCapability();
    if (!capability.supported && capability.reasonCode !== 'PUSH_PERMISSION_BLOCKED' && capability.reasonCode !== 'PUSH_VAPID_KEY_MISSING') {
      console.warn("Device or environment does not support push notifications:", capability.reasonCode);
      return null;
    }

    const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_PUBLIC_KEY || (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error("VAPID Key missing in environment variables.");
      return null;
    }

    // 1. Explicitly register FCM Service Worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    console.log('FCM Service Worker registered successfully with scope:', registration.scope);

    // 2. Retrieve Firebase Messaging
    const messaging = getMessaging(getApp());

    // 3. Ask for permissions
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn("Notification permission was not granted.");
      return null;
    }

    // 4. Get FCM Device Token passing registration explicitly
    const token = await getToken(messaging, { 
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.error("Failed to generate FCM Web Push token.");
      return null;
    }

    console.log("Push Token generated successfully:", token);

    // 5. Save device token on backend
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) {
      console.warn("User is not authenticated yet. Saving of token skipped.");
      return token;
    }

    const apiToken = await firebaseUser.getIdToken();
    const response = await fetch('/api/push/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        token,
        platform: capability.platform,
        browser: detectBrowser()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save subscription on server: ${errorText}`);
    }

    console.log("Push subscription saved on backend securely.");
    return token;
  } catch (error) {
    console.error("Error during registerCurrentPushDevice:", error);
    throw error;
  }
};

export const unregisterCurrentPushDevice = async (token: string): Promise<void> => {
  try {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) {
      console.warn("User is not authenticated. Skipping backend unregister.");
      return;
    }

    const apiToken = await firebaseUser.getIdToken();
    const response = await fetch('/api/push/unregister', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      console.error("Failed to unregister push token from backend:", response.statusText);
    } else {
      console.log("Push token unregistered from backend successfully.");
    }
  } catch (error) {
    console.error("Error in unregisterCurrentPushDevice:", error);
  }
};

export const subscribeToForegroundPushMessages = (callback: (payload: any) => void) => {
  try {
    const messaging = getMessaging(getApp());
    return onMessage(messaging, (payload) => {
      callback(payload);
    });
  } catch (e) {
    console.error("Failed to subscribe to foreground push messages:", e);
    return () => {};
  }
};
