import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useMerchantNotificationSounds } from '../../hooks/useMerchantNotificationSounds';
import { useAuth } from '../../hooks/useAuth';
import { useLocation } from '../../hooks/useLocation';
import { getNotificationPresentation } from '../../services/notificationService';
import { subscribeToForegroundPushMessages, autoRehydratePushRegistration } from '../../services/pushNotificationService';
import { Bell } from 'lucide-react';

interface ActiveAlert {
  eventId: string;
  orderId: string;
  title: string;
  body: string;
  type?: 'new_order' | 'merchant_new_order' | 'customer_order_chat' | 'merchant_order_chat';
}

export const NotificationToastHost: React.FC = () => {
  const { showToast, setEnvironment, orders } = useApp();
  const { notifications } = useNotifications();
  const { playSound } = useMerchantNotificationSounds();
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  
  const lastNotificationId = useRef<string | null>(null);
  const rehydratedRef = useRef(false);
  const mountTime = useRef(Date.now());
  
  // Keep track of processed events in foreground to prevent duplicate display/sound between FCM and Firestore triggers
  const processedEventIds = useRef(new Set<string>());

  // Helper to mark an alert as processed persistently for this session
  const markAlertAsProcessed = (canonicalId: string) => {
    processedEventIds.current.add(canonicalId);
    try {
      sessionStorage.setItem('processed_alert_' + canonicalId, 'true');
    } catch (e) {
      console.error("[NotificationToastHost] Error writing to sessionStorage:", e);
    }
  };

  // Helper to check if an alert has already been processed/shown in this session
  const isAlertProcessed = (canonicalId: string): boolean => {
    if (processedEventIds.current.has(canonicalId)) return true;
    try {
      return sessionStorage.getItem('processed_alert_' + canonicalId) === 'true';
    } catch (e) {
      return false;
    }
  };

  // Helper to get milliseconds from various notification timestamp shapes
  const getNotificationTime = (notif: any): number => {
    if (!notif?.createdAt) return Date.now();
    if (typeof notif.createdAt.toMillis === 'function') {
      return notif.createdAt.toMillis();
    }
    if (typeof notif.createdAt.seconds === 'number') {
      return notif.createdAt.seconds * 1000;
    }
    return Date.now();
  };

  // Trigger auto-rehydration on login
  useEffect(() => {
    if (currentUser?.uid) {
      if (!rehydratedRef.current) {
        rehydratedRef.current = true;
        console.log("[NotificationToastHost] Triggering autoRehydratePushRegistration for user:", currentUser.uid);
        autoRehydratePushRegistration().then((success) => {
          console.log("[NotificationToastHost] autoRehydratePushRegistration outcome:", success);
        }).catch((e) => {
          console.error("[NotificationToastHost] autoRehydratePushRegistration error:", e);
        });
      }
    } else {
      rehydratedRef.current = false;
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    // 1. Subscribe to FCM foreground push messages (onMessage)
    const unsubscribe = subscribeToForegroundPushMessages((payload) => {
      console.log("[NotificationToastHost] FCM foreground message received:", payload);
      const data = payload.data || {};
      const eventId = data.eventId || '';
      const orderId = data.orderId || '';
      const messageId = data.messageId || data.eventId || '';

      if (!eventId) return;

      // Check if we already have the chat of this order open
      const isChatOpenForThisOrder = (window as any).__activeChatOrderId === orderId;

      // Handle custom foreground operational alerts for new orders
      if (data.type === 'new_order' || data.type === 'merchant_new_order') {
        if (isAlertProcessed(eventId)) {
          console.log("[NotificationToastHost] Foreground FCM duplicate ignored:", eventId);
          return;
        }
        markAlertAsProcessed(eventId);

        const shortOrderId = orderId ? (orderId.length > 6 ? orderId.substring(orderId.length - 4).toUpperCase() : orderId) : 'N/A';
        setActiveAlerts(prev => {
          if (prev.some(a => a.eventId === eventId)) return prev;
          return [...prev, {
            eventId,
            orderId,
            title: "Novo pedido recebido",
            body: `Pedido #${shortOrderId} aguardando confirmação.`,
            type: 'merchant_new_order'
          }];
        });

        playSound({
          id: eventId,
          type: 'new_order',
          orderId: data.orderId || '',
          recipientRole: 'merchant'
        } as any);
      } else if (data.type === 'customer_order_chat' || data.type === 'new_message' || data.type === 'chat') {
        const canonicalEventId = `customer_chat:${orderId}:${messageId || eventId}`;
        if (isAlertProcessed(canonicalEventId)) {
          console.log("[NotificationToastHost] Foreground FCM duplicate ignored for customer chat:", canonicalEventId);
          return;
        }

        if (isChatOpenForThisOrder) {
          console.log("[NotificationToastHost] Chat is already open for this order. Skipping duplicate foreground toast.");
          return;
        }

        markAlertAsProcessed(canonicalEventId);

        // Fetch establishment name if available in the orders cache
        const order = orders?.find(o => o.id === orderId);
        const establishmentName = order?.establishmentName;
        const shortOrderId = orderId ? (orderId.length > 4 ? orderId.substring(orderId.length - 4).toUpperCase() : orderId) : '';

        const finalTitle = establishmentName ? `Nova mensagem da ${establishmentName}` : "Nova mensagem da loja";
        const finalBody = shortOrderId 
          ? `Você recebeu uma nova mensagem no pedido #${shortOrderId}.` 
          : "Você recebeu uma nova mensagem sobre seu pedido.";

        setActiveAlerts(prev => {
          // If we already have a customer chat alert for this order, replace/update it with the latest messageId
          const existingIdx = prev.findIndex(a => a.orderId === orderId && a.type === 'customer_order_chat');
          if (existingIdx !== -1) {
            const copy = [...prev];
            copy[existingIdx] = {
              ...copy[existingIdx],
              eventId: canonicalEventId,
              title: finalTitle,
              body: finalBody
            };
            return copy;
          }
          return [...prev, {
            eventId: canonicalEventId,
            orderId,
            title: finalTitle,
            body: finalBody,
            type: 'customer_order_chat'
          }];
        });

        playSound({
          id: eventId,
          type: 'new_message',
          recipientRole: 'customer'
        } as any);
      } else if (data.type === 'merchant_order_chat') {
        const canonicalEventId = `merchant_chat:${orderId}:${messageId || eventId}`;
        if (isAlertProcessed(canonicalEventId)) {
          console.log("[NotificationToastHost] Foreground FCM duplicate ignored for merchant chat:", canonicalEventId);
          return;
        }

        if (isChatOpenForThisOrder) {
          console.log("[NotificationToastHost] Chat is already open for this order. Skipping duplicate foreground toast.");
          return;
        }

        markAlertAsProcessed(canonicalEventId);

        const shortOrderId = orderId ? (orderId.length > 4 ? orderId.substring(orderId.length - 4).toUpperCase() : orderId) : '';
        const finalTitle = data.title || "Nova mensagem do cliente";
        const finalBody = data.body || `Você recebeu uma nova mensagem no pedido #${shortOrderId}.`;

        setActiveAlerts(prev => {
          const existingIdx = prev.findIndex(a => a.orderId === orderId && a.type === 'merchant_order_chat');
          if (existingIdx !== -1) {
            const copy = [...prev];
            copy[existingIdx] = {
              ...copy[existingIdx],
              eventId: canonicalEventId,
              title: finalTitle,
              body: finalBody
            };
            return copy;
          }
          return [...prev, {
            eventId: canonicalEventId,
            orderId,
            title: finalTitle,
            body: finalBody,
            type: 'merchant_order_chat'
          }];
        });

        playSound({
          id: eventId,
          type: 'new_message',
          recipientRole: 'merchant'
        } as any);
      } else {
        // Standard notification
        if (isAlertProcessed(eventId)) return;
        markAlertAsProcessed(eventId);
        showToast(`${data.title || 'Notificação'}: ${data.body || ''}`, 'info');

        if (data.type === 'push_test' || data.type === 'test_notification') {
          playSound({
            id: eventId,
            type: 'new_message',
            recipientRole: 'merchant'
          } as any);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [showToast, playSound, orders]);

  useEffect(() => {
    if (!isHydrated) {
      // First time receiving notifications, just set the baseline
      lastNotificationId.current = notifications.length > 0 ? notifications[0].id : null;
      setIsHydrated(true);
      return;
    }

    // Only toast new notifications that are added to the top
    if (notifications.length > 0 && lastNotificationId.current !== null && notifications[0].id !== lastNotificationId.current) {
      const newNotification = notifications[0];
      lastNotificationId.current = newNotification.id;

      // Exclude historical notifications from triggering pop-ups on load or login
      const notifTime = getNotificationTime(newNotification);
      if (notifTime < mountTime.current - 10000) {
        console.log("[NotificationToastHost] Skipping old historical notification:", newNotification.id);
        return;
      }

      // Unify eventId between Database Notifications and FCM payload
      const orderId = newNotification.orderId || '';
      const messageId = newNotification.messageId || '';

      const canonicalEventId = newNotification.type === 'customer_order_chat' || newNotification.type === 'new_message' || newNotification.type === 'chat'
        ? `customer_chat:${orderId}:${messageId || newNotification.id}`
        : newNotification.type === 'merchant_order_chat'
          ? `merchant_chat:${orderId}:${messageId || newNotification.id}`
          : newNotification.type === 'new_order'
            ? `new_order:${newNotification.orderId}`
            : newNotification.id;

      if (isAlertProcessed(canonicalEventId)) {
        console.log("[NotificationToastHost] Database notification already processed:", canonicalEventId);
        return;
      }

      markAlertAsProcessed(canonicalEventId);

      if (newNotification.type === 'new_order' || newNotification.type === 'merchant_new_order') {
        const shortOrderId = orderId ? (orderId.length > 6 ? orderId.substring(orderId.length - 4).toUpperCase() : orderId) : 'N/A';
        setActiveAlerts(prev => {
          if (prev.some(a => a.eventId === canonicalEventId)) return prev;
          return [...prev, {
            eventId: canonicalEventId,
            orderId,
            title: "Novo pedido recebido",
            body: `Pedido #${shortOrderId} aguardando confirmação.`,
            type: 'merchant_new_order'
          }];
        });
      } else if (newNotification.type === 'customer_order_chat' || newNotification.type === 'new_message' || newNotification.type === 'chat') {
        const isChatOpenForThisOrder = (window as any).__activeChatOrderId === orderId;
        if (isChatOpenForThisOrder) {
          console.log("[NotificationToastHost] Chat is already open. Skipping duplicate database notification alert.");
          return;
        }

        // Fetch establishment name if available in the orders cache
        const order = orders?.find(o => o.id === orderId);
        const establishmentName = order?.establishmentName;
        const shortOrderId = orderId ? (orderId.length > 4 ? orderId.substring(orderId.length - 4).toUpperCase() : orderId) : '';

        const finalTitle = establishmentName ? `Nova mensagem da ${establishmentName}` : "Nova mensagem da loja";
        const finalBody = shortOrderId 
          ? `Você recebeu uma nova mensagem no pedido #${shortOrderId}.` 
          : "Você recebeu uma nova mensagem sobre seu pedido.";

        setActiveAlerts(prev => {
          const existingIdx = prev.findIndex(a => a.orderId === orderId && a.type === 'customer_order_chat');
          if (existingIdx !== -1) {
            const copy = [...prev];
            copy[existingIdx] = {
              ...copy[existingIdx],
              eventId: canonicalEventId,
              title: finalTitle,
              body: finalBody
            };
            return copy;
          }
          return [...prev, {
            eventId: canonicalEventId,
            orderId,
            title: finalTitle,
            body: finalBody,
            type: 'customer_order_chat'
          }];
        });
      } else if (newNotification.type === 'merchant_order_chat') {
        const isChatOpenForThisOrder = (window as any).__activeChatOrderId === orderId;
        if (isChatOpenForThisOrder) {
          console.log("[NotificationToastHost] Chat is already open. Skipping duplicate database notification alert.");
          return;
        }

        const { title, description } = getNotificationPresentation(newNotification);
        const shortOrderId = orderId ? (orderId.length > 4 ? orderId.substring(orderId.length - 4).toUpperCase() : orderId) : '';
        const finalTitle = title || "Nova mensagem do cliente";
        const finalBody = description || `Você recebeu uma nova mensagem no pedido #${shortOrderId}.`;

        setActiveAlerts(prev => {
          const existingIdx = prev.findIndex(a => a.orderId === orderId && a.type === 'merchant_order_chat');
          if (existingIdx !== -1) {
            const copy = [...prev];
            copy[existingIdx] = {
              ...copy[existingIdx],
              eventId: canonicalEventId,
              title: finalTitle,
              body: finalBody
            };
            return copy;
          }
          return [...prev, {
            eventId: canonicalEventId,
            orderId,
            title: finalTitle,
            body: finalBody,
            type: 'merchant_order_chat'
          }];
        });
      } else {
        const { title, description } = getNotificationPresentation(newNotification);
        showToast(`${title}: ${description}`, 'info');
      }

      playSound(newNotification);
    } else if (notifications.length > 0 && lastNotificationId.current === null) {
      // First notification after hydration (if it was empty)
      lastNotificationId.current = notifications[0].id;
    }
  }, [notifications, showToast, playSound, isHydrated, orders]);

  const handleViewOrder = (orderId: string, eventId: string, alertType?: string) => {
    // Dismiss this alert visually and mark it processed persistently
    setActiveAlerts(prev => prev.filter(a => a.eventId !== eventId));
    markAlertAsProcessed(eventId);
    
    const isDemo = window.location.pathname.startsWith('/demo');

    switch (alertType) {
      case 'customer_order_chat': {
        navigate(`/acompanhar-pedido/${orderId}?chat=true&eventId=${eventId}&messageId=${eventId}`);
        break;
      }
      case 'merchant_new_order':
      case 'new_order': {
        if (isDemo) {
          setEnvironment('estabelecimento');
          navigate(`/demo?orderId=${orderId}`);
        } else {
          navigate(`/gestor?orderId=${orderId}`);
        }

        // Dispatch the custom event to open the order details immediately with openChat: false
        const event = new CustomEvent('open-merchant-order', {
          detail: {
            orderId,
            eventId,
            openChat: false,
            messageId: undefined
          }
        });
        window.dispatchEvent(event);
        break;
      }
      case 'merchant_order_chat': {
        if (isDemo) {
          setEnvironment('estabelecimento');
          navigate(`/demo?orderId=${orderId}`);
        } else {
          navigate(`/gestor?orderId=${orderId}`);
        }

        // Dispatch the custom event to open the merchant chat immediately
        const event = new CustomEvent('open-merchant-order', {
          detail: {
            orderId,
            eventId,
            openChat: true,
            messageId: eventId
          }
        });
        window.dispatchEvent(event);
        break;
      }
      default: {
        if (isDemo) {
          setEnvironment('estabelecimento');
          navigate(`/demo?orderId=${orderId}`);
        } else {
          navigate(`/gestor?orderId=${orderId}`);
        }

        const event = new CustomEvent('open-merchant-order', {
          detail: {
            orderId,
            eventId,
            openChat: false,
            messageId: undefined
          }
        });
        window.dispatchEvent(event);
        break;
      }
    }
  };

  const handleDismissAlert = (eventId: string) => {
    setActiveAlerts(prev => prev.filter(a => a.eventId !== eventId));
    markAlertAsProcessed(eventId);
  };

  if (activeAlerts.length === 0) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md px-4 flex flex-col gap-3">
      {activeAlerts.map((alert) => (
        <div 
          key={alert.eventId}
          id={`operational-alert-${alert.eventId}`}
          className="bg-white border-2 border-[#E94F2F] rounded-2xl shadow-2xl p-5 w-full border-l-8 border-l-[#E94F2F] animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-50 text-[#E94F2F] rounded-full shrink-0">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-extrabold text-[#201A17] text-base leading-tight">
                {alert.title}
              </h4>
              <p className="text-[#5C534E] text-xs mt-1 font-semibold leading-relaxed">
                {alert.body}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-neutral-100">
            <button
              id={`btn-view-order-${alert.eventId}`}
              onClick={() => handleViewOrder(alert.orderId, alert.eventId, alert.type)}
              className="flex-1 py-2.5 bg-[#E94F2F] hover:bg-[#d04326] text-white font-extrabold rounded-xl text-xs transition-all shadow-md shadow-[#E94F2F]/20 cursor-pointer"
            >
              {alert.type === 'merchant_new_order' || alert.type === 'new_order' ? 'Ver pedido' : 'Ver mensagem'}
            </button>
            <button
              id={`btn-dismiss-order-${alert.eventId}`}
              onClick={() => handleDismissAlert(alert.eventId)}
              className="flex-1 py-2.5 bg-[#F7F4EF] hover:bg-[#EADFD8] text-[#756B66] font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Dispensar aviso
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
