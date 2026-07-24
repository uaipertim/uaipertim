importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config should be injected at build time or fetched
const firebaseConfig = {
  apiKey: "AIzaSyDkLqmCTFFqaIsdj6RoU2QCwNiITBEsUTo",
  authDomain: "gen-lang-client-0673282457.firebaseapp.com",
  projectId: "gen-lang-client-0673282457",
  storageBucket: "gen-lang-client-0673282457.firebasestorage.app",
  messagingSenderId: "271251032954",
  appId: "1:271251032954:web:31afabc67be3533665e4c3"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const data = payload.data || {};
  const eventId = data.eventId;
  
  if (!eventId) {
    console.warn('[firebase-messaging-sw.js] Missing eventId in payload. Ignoring.');
    return;
  }

  // 1. DEDUPLICATION
  const alreadyProcessed = await isEventProcessed(eventId);
  if (alreadyProcessed) {
    console.log(`[firebase-messaging-sw.js] Event ${eventId} was already processed. Ignoring duplicate.`);
    return;
  }
  
  await markEventProcessed(eventId);

  // 2. CHECK APP VISIBILITY (FOREGROUND VS BACKGROUND)
  const isAppVisible = await hasClientVisible();
  if (isAppVisible) {
    console.log(`[firebase-messaging-sw.js] App is currently visible/active. Skipping native notification display for: ${eventId}`);
    await reportDiagnostic(eventId, true, false);
    return;
  }

  // 3. VALIDATE DATA FIELDS & PREPARE NOTIFICATION
  const isNewOrder = (data.type === 'new_order' || eventId.startsWith('new_order:'));
  const isNewMessage = (data.type === 'new_message' || data.type === 'chat' || eventId.startsWith('new_message:') || eventId.startsWith('chat:'));
  const isPushTest = (data.type === 'push_test' || eventId.startsWith('push_test:'));

  let defaultTitle = "Novo pedido recebido";
  let defaultBody = "Um novo pedido está aguardando sua confirmação.";

  if (isNewOrder) {
    const orderNum = data.orderId || eventId.split(':')[1] || '';
    defaultTitle = orderNum ? `Novo pedido #${orderNum}` : "Novo pedido recebido";
    defaultBody = "Há um novo pedido aguardando sua confirmação.";
  } else if (isNewMessage) {
    defaultTitle = "Nova mensagem do cliente";
    defaultBody = "Você recebeu uma nova mensagem em um pedido.";
  } else if (isPushTest) {
    defaultTitle = "Notificações ativadas 🎉";
    defaultBody = "Seu dispositivo está pronto para receber alertas do UaiPertim.";
  }

  const title = data.title || defaultTitle;
  const bodyText = data.body || defaultBody;

  const notificationOptions = {
    body: bodyText,
    icon: '/icons/notification-icon-192.png',
    badge: '/icons/notification-badge-72.png',
    tag: `uaipertim-${isNewOrder ? 'new-order-' + (data.orderId || 'general') : eventId}`,
    requireInteraction: isNewOrder ? true : false,
    renotify: isNewOrder ? true : false,
    data: {
      url: data.url || '/',
      orderId: data.orderId || '',
      eventId: eventId,
      type: data.type || 'new_order'
    }
  };

  console.log(`[firebase-messaging-sw.js] Triggering self.registration.showNotification for event: ${eventId}`);
  
  await reportDiagnostic(eventId, true, true);

  return self.registration.showNotification(title, notificationOptions);
});

// Cache & Deduplication Utilities
const EVENT_CACHE_NAME = 'processed-push-events-v1';
const processedEventsInMemory = new Set();

async function isEventProcessed(eventId) {
  if (!eventId) return true;
  
  if (processedEventsInMemory.has(eventId)) {
    return true;
  }

  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(EVENT_CACHE_NAME);
      const match = await cache.match(new Request('/event/' + eventId));
      if (match) {
        processedEventsInMemory.add(eventId);
        return true;
      }
    }
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Error checking CacheStorage:', e);
  }

  return false;
}

async function markEventProcessed(eventId) {
  if (!eventId) return;
  processedEventsInMemory.add(eventId);

  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(EVENT_CACHE_NAME);
      await cache.put(
        new Request('/event/' + eventId),
        new Response('1', { 
          headers: { 
            'Content-Type': 'text/plain',
            'Expires': new Date(Date.now() + 1000 * 60 * 10).toUTCString()
          } 
        })
      );
    }
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Error storing event in CacheStorage:', e);
  }
}

async function hasClientVisible() {
  if (!self.clients || typeof self.clients.matchAll !== 'function') {
    return false;
  }
  try {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return windowClients.some(client => client.visibilityState === 'visible');
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Error checking active window clients:', e);
    return false;
  }
}

async function reportDiagnostic(eventId, backgroundHandlerExecuted, manualShowNotificationExecuted) {
  if (!eventId) return;
  try {
    await fetch('/api/push/diagnostic-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        backgroundHandlerExecuted,
        manualShowNotificationExecuted
      })
    });
    console.log(`[firebase-messaging-sw.js] Diagnostic telemetry sent successfully for event: ${eventId}`);
  } catch (e) {
    console.warn('[firebase-messaging-sw.js] Failed to report push diagnostic:', e);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let clickUrl = '/gestor';
  if (event.notification.data && event.notification.data.url) {
    clickUrl = event.notification.data.url;
  }

  // Unify /loja/pedidos target to the correct internal /gestor route
  if (clickUrl.includes('/loja/pedidos')) {
    clickUrl = clickUrl.replace('/loja/pedidos', '/gestor');
  }

  const targetUrl = new URL(clickUrl, self.location.origin).href;

  const data = event.notification.data || {};
  const notificationType = data.type || 'new_order';
  const orderId = data.orderId || '';
  const eventId = data.eventId || '';
  const messageId = data.messageId || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find window of same origin
      const targetClient = windowClients.find(client => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch (e) {
          return false;
        }
      });

      if (targetClient) {
        // App is already open or in background: Focus and postMessage without reload/navigation!
        return targetClient.focus().then(() => {
          targetClient.postMessage({
            type: "UAIPERTIM_PUSH_NAVIGATE",
            payload: {
              notificationType,
              orderId,
              eventId,
              messageId,
              url: targetUrl
            }
          });
        });
      }

      // Cold start: No existing window.
      // Open the root app URL with clean push parameters to avoid premature loading of internal states
      const pwaUrl = new URL('/', self.location.origin);
      pwaUrl.searchParams.set('pushIntent', notificationType);
      if (orderId) {
        pwaUrl.searchParams.set('orderId', orderId);
      }
      if (eventId) {
        pwaUrl.searchParams.set('eventId', eventId);
      }
      if (messageId) {
        pwaUrl.searchParams.set('messageId', messageId);
      }

      if (clients.openWindow) {
        return clients.openWindow(pwaUrl.href);
      }
    })
  );
});
