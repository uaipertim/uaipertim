import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { NotificationToastHost } from './components/notifications/NotificationToastHost';
import { useAuth } from './hooks/useAuth';
import { useLocation } from './hooks/useLocation';
import { Header } from './components/Header';
import { MobileFixedCartBar } from './components/MobileFixedCartBar';
import { MobileBottomNavigation } from './components/MobileBottomNavigation';
import { ClientArea } from './components/ClientArea';
import { EstablishmentArea } from './components/EstablishmentArea';
import { AdminArea } from './components/AdminArea';
import { AppFooter } from './components/layout/AppFooter';
import { ToastContainer } from './components/Toast';
import { Login } from './components/Login';
import { Cadastro } from './components/Cadastro';
import { MyAccount } from './components/MyAccount';
import { OrderTrackingPage } from './components/account/OrderTrackingPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { orderService } from './services/orderService';
import { enableMobileBottomNavigation } from './config';

import { AnimatePresence } from 'motion/react';
import { AppSplashScreen } from './components/layout/AppSplashScreen';
import { validateEnvironment, APP_ENV } from './config/environment';

interface PendingPushNavigation {
  type: string;
  orderId: string;
  messageId?: string;
  establishmentId?: string;
  receivedAt: number;
}

function AppContent() {
  const [appBootStatus, setAppBootStatus] = React.useState<'starting' | 'ready' | 'error'>('starting');
  const [bootErrorType, setBootErrorType] = React.useState<'network' | 'configuration' | 'firebase' | null>(null);

  const { currentUser, userProfile, loading: authLoading } = useAuth();
  const { environment, setEnvironment, cart, connectionStatus, retryConnection } = useApp();
  const [path] = useLocation();

  const isMerchantArea = path === '/gestor' || path === '/loja/pedidos';
  const isAdminArea = path === '/admin' || path === '/admin/migracao-catalogo';
  const showMobileCartBar = !isMerchantArea && !isAdminArea && cart.length > 0;

  // Modal tracking state for bottom navigation visibility
  const [isCheckoutOpen, setIsCheckoutOpen] = React.useState(false);
  const [isFullScreenModalOpen, setIsFullScreenModalOpen] = React.useState(false);
  const [isCartOpen, setIsCartOpen] = React.useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = React.useState(false);

  React.useEffect(() => {
    const checkModals = () => {
      const checkout = document.getElementById('checkout-modal') || document.getElementById('auth-required-checkout-modal');
      setIsCheckoutOpen(!!checkout);

      const productModal = document.getElementById('product-config-modal');
      const allCategoriesModal = document.getElementById('all-categories-modal');
      const citySelectorModal = document.getElementById('city-selector-modal');
      setIsFullScreenModalOpen(!!(productModal || allCategoriesModal || citySelectorModal));

      const cartDrawer = document.getElementById('cart-drawer-overlay');
      setIsCartOpen(!!cartDrawer);

      const reviewModal = document.getElementById('review-modal');
      setIsReviewModalOpen(!!reviewModal);
    };

    const observer = new MutationObserver(checkModals);
    observer.observe(document.body, { childList: true, subtree: true });

    checkModals();

    return () => observer.disconnect();
  }, []);

  const isBottomNavVisible = enableMobileBottomNavigation && !isMerchantArea && !isAdminArea && !isCheckoutOpen && !isFullScreenModalOpen && !isCartOpen && !isReviewModalOpen;

  // Dynamic padding-bottom for the main container
  let mainPaddingBottomStyle: React.CSSProperties | undefined = undefined;
  if (isBottomNavVisible && showMobileCartBar) {
    mainPaddingBottomStyle = { paddingBottom: 'calc(64px + 76px + env(safe-area-inset-bottom, 0px) + 16px)' };
  } else if (isBottomNavVisible) {
    mainPaddingBottomStyle = { paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)' };
  } else if (showMobileCartBar) {
    mainPaddingBottomStyle = { paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px) + 16px)' };
  }

  // 1. PUSH INTENT CONTROLLER
  const [pendingPushNavigation, setPendingPushNavigation] = React.useState<PendingPushNavigation | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('pl_pending_push');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.receivedAt && (Date.now() - parsed.receivedAt < 5 * 60 * 1000)) {
            return parsed;
          } else {
            localStorage.removeItem('pl_pending_push');
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  const [pushProcessingStatus, setPushProcessingStatus] = React.useState<'idle' | 'processing' | 'success' | 'error' | 'ownership_error'>('idle');
  const [pushProcessingError, setPushProcessingError] = React.useState<string | null>(null);
  const [processedEventIds, setProcessedEventIds] = React.useState<Set<string>>(new Set());

  // 2. BOOT STATES
  const [bootState, setBootState] = React.useState<'BOOTING' | 'WAITING_FOR_AUTH' | 'PROCESSING_PUSH_INTENT' | 'READY' | 'REAL_SERVICE_ERROR'>('BOOTING');

  const authReady = !authLoading;
  const appReady = connectionStatus !== null && connectionStatus.status === 'firebase-connected';
  const profileReady = authLoading ? false : (currentUser ? userProfile !== null : true);

  React.useEffect(() => {
    if (appBootStatus === 'error') {
      setBootState('REAL_SERVICE_ERROR');
      return;
    }

    if (!appReady) {
      setBootState('BOOTING');
    } else if (!authReady || !profileReady) {
      setBootState('WAITING_FOR_AUTH');
    } else if (pendingPushNavigation && pushProcessingStatus === 'processing') {
      setBootState('PROCESSING_PUSH_INTENT');
    } else {
      setBootState('READY');
    }
  }, [appBootStatus, appReady, authReady, profileReady, pendingPushNavigation, pushProcessingStatus]);

  // Keep a mutable ref to track status to prevent stale closure bugs
  const statusRef = React.useRef(appBootStatus);
  React.useEffect(() => {
    statusRef.current = appBootStatus;
  }, [appBootStatus]);

  // Monitor boot / load completeness
  React.useEffect(() => {
    const configCheck = validateEnvironment();
    if (!configCheck.valid) {
      setBootErrorType('configuration');
      setAppBootStatus('error');
      return;
    }

    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    const checkReady = () => {
      if (!authLoading && connectionStatus !== null) {
        if (connectionStatus.status === 'firebase-unavailable') {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setBootErrorType('network');
          } else {
            setBootErrorType('firebase');
          }
          setAppBootStatus('error');
          clearInterval(intervalId);
          return;
        }

        const elapsed = Date.now() - startTime;
        const minDuration = 2500; // Minimum visual duration for high-quality feel (2.5 seconds)
        const remaining = Math.max(0, minDuration - elapsed);

        timeoutId = setTimeout(() => {
          const hasPendingPush = !!pendingPushNavigation;
          const isUserAuthed = !!currentUser;
          
          if (hasPendingPush && isUserAuthed && pushProcessingStatus === 'processing') {
            console.log('[Boot] Delaying ready state while push is processing...');
          } else {
            setAppBootStatus('ready');
          }
        }, remaining);

        clearInterval(intervalId);
      }
    };

    intervalId = setInterval(checkReady, 50);

    const maxTimeoutId = setTimeout(() => {
      clearInterval(intervalId);
      if (statusRef.current === 'starting') {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setBootErrorType('network');
        } else {
          setBootErrorType('firebase');
        }
        setAppBootStatus('error');
        console.error("Bootloader timeout: auth or Firebase connection took too long.");
      }
    }, 9000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      clearTimeout(maxTimeoutId);
    };
  }, [authLoading, connectionStatus, pendingPushNavigation, currentUser, pushProcessingStatus]);

  // Sync static boot-splash exit from index.html
  React.useEffect(() => {
    if (appBootStatus === 'ready' || appBootStatus === 'error') {
      const bootSplash = document.getElementById('boot-splash');
      document.documentElement.classList.remove('app-booting');
      
      if (bootSplash) {
        bootSplash.classList.add('boot-splash-exit');
        const timer = setTimeout(() => {
          bootSplash.remove();
        }, 450);
        return () => clearTimeout(timer);
      }
    }
  }, [appBootStatus]);

  // Initialize and listen to SW and URL for push intentions
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pushIntent = params.get('pushIntent');
    const orderId = params.get('orderId');
    const eventId = params.get('eventId') || params.get('messageId');
    const establishmentId = params.get('establishmentId');
    
    if (pushIntent && orderId) {
      const intentObj = {
        type: pushIntent,
        orderId: orderId,
        messageId: eventId || undefined,
        establishmentId: establishmentId || undefined,
        receivedAt: Date.now()
      };
      setPendingPushNavigation(intentObj);
      localStorage.setItem('pl_pending_push', JSON.stringify(intentObj));
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'UAIPERTIM_PUSH_NAVIGATE') {
        const payload = event.data.payload;
        if (payload && payload.orderId) {
          console.log('[App] Received push navigation from Service Worker message:', payload);
          const intentObj = {
            type: payload.notificationType || 'new_order',
            orderId: payload.orderId,
            messageId: payload.messageId || payload.eventId || undefined,
            establishmentId: payload.establishmentId || undefined,
            receivedAt: Date.now()
          };
          setPendingPushNavigation(intentObj);
          localStorage.setItem('pl_pending_push', JSON.stringify(intentObj));
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  // Process pending push navigation when app is ready, auth is ready, and profile is ready
  React.useEffect(() => {
    if (!appReady || !authReady || !profileReady || !pendingPushNavigation) {
      return;
    }

    const intentKey = `${pendingPushNavigation.orderId}:${pendingPushNavigation.type}:${pendingPushNavigation.messageId || ''}`;
    if (processedEventIds.has(intentKey)) {
      return;
    }

    const elapsedMs = Date.now() - pendingPushNavigation.receivedAt;
    if (elapsedMs > 5 * 60 * 1000) {
      console.warn('[Push] Pending push navigation is expired:', pendingPushNavigation);
      setPendingPushNavigation(null);
      localStorage.removeItem('pl_pending_push');
      return;
    }

    const handleNavigation = async () => {
      setPushProcessingStatus('processing');
      setPushProcessingError(null);

      const { type, orderId, messageId, establishmentId } = pendingPushNavigation;

      const openCustomerOrderTracking = async (id: string) => {
        let targetPath = `/acompanhar-pedido/${id}`;
        window.history.pushState({}, '', targetPath);
      };

      const openCustomerOrderChatFromPush = async (params: { orderId: string, messageId?: string, eventId?: string }) => {
        const msgId = params.messageId || params.eventId;
        let targetPath = `/acompanhar-pedido/${params.orderId}?chat=true`;
        if (msgId) {
          targetPath += `&messageId=${msgId}&eventId=${msgId}`;
        }
        window.history.pushState({}, '', targetPath);
      };

      const openMerchantOrderFromNotification = async (params: { orderId: string, eventId?: string }) => {
        if (window.location.pathname !== '/gestor') {
          window.history.pushState({}, '', '/gestor');
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-merchant-order', {
            detail: { orderId: params.orderId, eventId: params.eventId }
          }));
        }, 100);
      };

      const openMerchantOrderChatFromNotification = async (params: { orderId: string, messageId?: string, eventId?: string, establishmentId?: string }) => {
        if (window.location.pathname !== '/gestor') {
          window.history.pushState({}, '', '/gestor');
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-merchant-order', {
            detail: { 
              orderId: params.orderId, 
              eventId: params.eventId || params.messageId,
              openChat: true,
              messageId: params.messageId
            }
          }));
        }, 100);
      };

      if (!currentUser) {
        console.log('[Push] User not authenticated. Redirecting to login.');
        setPushProcessingStatus('idle');
        setAppBootStatus('ready');
        window.history.pushState({}, '', '/login');
        return;
      }

      try {
        const order = await orderService.getOrderById(orderId);
        if (!order) {
          setPushProcessingStatus('error');
          setPushProcessingError('O pedido solicitado não foi encontrado.');
          setAppBootStatus('ready');
          return;
        }

        const userRole = userProfile?.role;
        const userEstId = userProfile?.establishmentId;

        if (userRole === 'merchant') {
          if (order.establishmentId !== userEstId) {
            setPushProcessingStatus('ownership_error');
            setPushProcessingError('Esta conversa não está disponível para esta conta.');
            setAppBootStatus('ready');
            return;
          }
        } else if (userRole === 'customer') {
          if (order.customerId !== currentUser.uid) {
            setPushProcessingStatus('ownership_error');
            setPushProcessingError('Esta conversa não está disponível para esta conta.');
            setAppBootStatus('ready');
            return;
          }
        } else if (userRole === 'admin') {
          // Allow
        } else {
          setPushProcessingStatus('ownership_error');
          setPushProcessingError('Esta conversa não está disponível para esta conta.');
          setAppBootStatus('ready');
          return;
        }

        console.log(`[Push] Ownership validated. Navigating for type: ${type}`);
        
        setProcessedEventIds(prev => {
          const next = new Set(prev);
          next.add(intentKey);
          return next;
        });

        window.history.replaceState({}, '', window.location.pathname);
        setPendingPushNavigation(null);
        localStorage.removeItem('pl_pending_push');

        let normalizedType = type;
        if (type === 'order_status' || type === 'customer_order_status') {
          normalizedType = 'customer_order_status';
        } else if (type === 'customer_order_chat' || type === 'new_message' || type === 'chat' || type === 'CUSTOMER_ORDER_CHAT') {
          normalizedType = 'customer_order_chat';
        } else if (type === 'merchant_new_order' || type === 'new_order' || type === 'MERCHANT_NEW_ORDER') {
          normalizedType = 'merchant_new_order';
        } else if (type === 'merchant_order_chat' || type === 'MERCHANT_ORDER_CHAT') {
          normalizedType = 'merchant_order_chat';
        }

        const pushIntent = {
          type: normalizedType,
          orderId: order.id,
          messageId: messageId,
          eventId: messageId,
          establishmentId: establishmentId
        };

        switch (pushIntent.type) {
          case "customer_order_status":
            await openCustomerOrderTracking(pushIntent.orderId);
            break;

          case "customer_order_chat":
            await openCustomerOrderChatFromPush({
              orderId: pushIntent.orderId,
              messageId: pushIntent.messageId,
              eventId: pushIntent.eventId
            });
            break;

          case "merchant_new_order":
            await openMerchantOrderFromNotification({
              orderId: pushIntent.orderId,
              eventId: pushIntent.eventId
            });
            break;

          case "merchant_order_chat":
            await openMerchantOrderChatFromNotification({
              orderId: pushIntent.orderId,
              messageId: pushIntent.messageId,
              eventId: pushIntent.eventId,
              establishmentId: pushIntent.establishmentId
            });
            break;

          default:
            // Fallback for newer or older types
            if (userRole === 'merchant') {
              await openMerchantOrderFromNotification({
                orderId: pushIntent.orderId,
                eventId: pushIntent.eventId
              });
            } else {
              await openCustomerOrderTracking(pushIntent.orderId);
            }
            break;
        }

        setPushProcessingStatus('success');
        setAppBootStatus('ready');

      } catch (err: any) {
        console.error('[Push] Error processing push navigation:', err);
        setPushProcessingStatus('error');
        setPushProcessingError('Não foi possível conectar aos serviços do UaiPertim agora.');
        setAppBootStatus('ready');
      }
    };

    handleNavigation();
  }, [
    appReady,
    authReady,
    profileReady,
    pendingPushNavigation,
    currentUser,
    userProfile,
    processedEventIds
  ]);

  const handleRetry = () => {
    if (bootErrorType === 'configuration') {
      window.location.reload();
    } else {
      setBootErrorType(null);
      setAppBootStatus('starting');
      retryConnection();
    }
  };

  useEffect(() => {
    let targetEnv: 'cliente' | 'estabelecimento' | 'administracao' | null = null;
    if (path === '/gestor' || path === '/loja/pedidos') {
      targetEnv = 'estabelecimento';
    } else if (path === '/admin' || path === '/admin/migracao-catalogo') {
      targetEnv = 'administracao';
    } else if (path === '/minha-conta' || path === '/login' || path === '/cadastro' || path === '/meus-pedidos' || path.startsWith('/acompanhar-pedido/')) {
      targetEnv = 'cliente';
    }

    if (targetEnv) {
      setEnvironment((prev) => (prev !== targetEnv ? targetEnv : prev));
    }
  }, [path, setEnvironment]);

  if (bootState === 'REAL_SERVICE_ERROR') {
    let errorTitle = "Não conseguimos iniciar o UaiPertim agora";
    let errorMessage = "Verifique sua conexão com a internet e tente novamente em instantes.";

    if (bootErrorType === 'configuration') {
      if (APP_ENV !== 'production') {
        errorTitle = "Configuração do ambiente incompleta";
        errorMessage = "A configuração do ambiente está incompleta no arquivo environment.ts ou nas variáveis do sistema.";
      } else {
        errorTitle = "Falha de inicialização";
        errorMessage = "O aplicativo não pôde ser iniciado devido a um erro interno de configuração.";
      }
    } else if (bootErrorType === 'firebase') {
      errorTitle = "Serviços indisponíveis";
      errorMessage = "Não foi possível conectar aos serviços do UaiPertim. Por favor, tente novamente.";
    } else if (bootErrorType === 'network') {
      errorTitle = "Sem conexão de rede";
      errorMessage = "Verifique sua conexão e tente novamente.";
    }

    return (
      <div 
        id="uaipertim-boot-error"
        role="alert"
        className="fixed inset-0 bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center select-none"
        style={{
          zIndex: 99999,
          paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#E9E4DC] shadow-sm flex flex-col items-center">
          <div className="w-16 h-16 bg-[#FDF2F0] rounded-2xl flex items-center justify-center mb-6 text-[#E94F2F]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.3c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#201A17] mb-2">
            {errorTitle}
          </h2>
          <p className="text-sm text-[#756B66] mb-8 leading-relaxed">
            {errorMessage}
          </p>
          <button
            onClick={handleRetry}
            className="w-full bg-[#E94F2F] hover:bg-[#D83E20] text-white font-bold py-3.5 px-6 rounded-2xl transition-colors duration-200 shadow-md shadow-orange-500/10 focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20 active:scale-[0.98]"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F7F4EF] min-h-screen font-sans flex flex-col">
      <Header />
      {showMobileCartBar && <MobileFixedCartBar />}
      <main className="flex-1" style={mainPaddingBottomStyle}>
        {path === '/login' && <Login />}
        {path === '/cadastro' && <Cadastro />}
        
        {path === '/minha-conta' && (
          <ProtectedRoute allowedRoles={['customer', 'merchant', 'admin']}>
            <ClientArea />
          </ProtectedRoute>
        )}

        {path === '/meus-pedidos' && (
          <ProtectedRoute allowedRoles={['customer', 'merchant', 'admin']}>
            <ClientArea />
          </ProtectedRoute>
        )}

        {path.startsWith('/acompanhar-pedido/') && (
          <ProtectedRoute allowedRoles={['customer', 'merchant', 'admin']}>
            <ClientArea />
          </ProtectedRoute>
        )}
        
        {(path === '/gestor' || path === '/loja/pedidos') && (
          <ProtectedRoute allowedRoles={['merchant', 'admin']}>
            <EstablishmentArea />
          </ProtectedRoute>
        )}
        
        {(path === '/admin' || path === '/admin/migracao-catalogo') && (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminArea />
          </ProtectedRoute>
        )}
        
        {path !== '/login' && path !== '/cadastro' && path !== '/minha-conta' && path !== '/meus-pedidos' && !path.startsWith('/acompanhar-pedido/') && path !== '/gestor' && path !== '/loja/pedidos' && path !== '/admin' && path !== '/admin/migracao-catalogo' && (
          <>
            {path === '/demo' ? (
              <>
                {environment === 'cliente' && <ClientArea />}
                {environment === 'estabelecimento' && <EstablishmentArea />}
                {environment === 'administracao' && <AdminArea />}
              </>
            ) : (
              <ClientArea />
            )}
          </>
        )}
      </main>
      <MobileBottomNavigation isCheckoutOpen={isCheckoutOpen} isFullScreenModalOpen={isFullScreenModalOpen} isCartOpen={isCartOpen} isReviewModalOpen={isReviewModalOpen} />
      <AppFooter showMobileCartBar={showMobileCartBar} />
      <ToastContainer />

      {/* Dynamic Push Intention Loader / Error Overlay */}
      {pushProcessingStatus !== 'idle' && pushProcessingStatus !== 'success' && (
        <div 
          id="uaipertim-push-processing-overlay"
          className="fixed inset-0 bg-[#FAF8F5]/90 backdrop-blur-xs flex items-center justify-center p-6 text-center z-[9999]"
        >
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#E94F2F]/10 shadow-lg flex flex-col items-center animate-fade-in">
            {pushProcessingStatus === 'processing' ? (
              <>
                <div className="w-12 h-12 border-4 border-[#E94F2F]/20 border-t-[#E94F2F] rounded-full animate-spin mb-6" />
                <h3 className="text-lg font-bold text-[#201A17] mb-2">
                  {pendingPushNavigation?.type === 'new_message' || pendingPushNavigation?.type === 'chat' || pendingPushNavigation?.type === 'CUSTOMER_ORDER_CHAT'
                    ? 'Abrindo a conversa...'
                    : 'Abrindo seu pedido...'}
                </h3>
                <p className="text-sm text-[#756B66]">
                  Por favor, aguarde um instante enquanto carregamos as informações.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-[#FDF2F0] rounded-2xl flex items-center justify-center mb-6 text-[#E94F2F]">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.3c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#201A17] mb-2">
                  {pushProcessingStatus === 'ownership_error' 
                    ? 'Este conteúdo não está disponível para esta conta.'
                    : 'Não foi possível abrir este conteúdo agora.'}
                </h3>
                <p className="text-sm text-[#756B66] mb-8 leading-relaxed">
                  {pushProcessingStatus === 'ownership_error'
                    ? 'Certifique-se de estar conectado com a conta correta que realizou ou gerencia este pedido.'
                    : pushProcessingError || 'Ocorreu um erro ao carregar as informações do pedido.'}
                </p>
                <div className="w-full flex flex-col gap-2">
                  {pushProcessingStatus === 'error' && (
                    <button
                      onClick={() => {
                        if (pendingPushNavigation) {
                          const intent = { ...pendingPushNavigation, receivedAt: Date.now() };
                          setPendingPushNavigation(null);
                          setPushProcessingStatus('idle');
                          setTimeout(() => setPendingPushNavigation(intent), 50);
                        }
                      }}
                      className="w-full bg-[#E94F2F] hover:bg-[#D83E20] text-white font-bold py-3 px-6 rounded-2xl transition-colors duration-200 active:scale-[0.98]"
                    >
                      Tentar novamente
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPushProcessingStatus('idle');
                      setPendingPushNavigation(null);
                      window.history.replaceState({}, '', window.location.pathname);
                      if (userProfile?.role === 'merchant') {
                        window.history.pushState({}, '', '/gestor');
                      } else {
                        window.history.pushState({}, '', '/meus-pedidos');
                      }
                    }}
                    className="w-full bg-[#FAF8F5] hover:bg-[#EADFD8] text-[#756B66] font-bold py-3 px-6 rounded-2xl transition-colors duration-200 border border-[#E9E4DC] active:scale-[0.98]"
                  >
                    {userProfile?.role === 'merchant' ? 'Ir para o painel' : 'Ir para meus pedidos'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <NotificationProvider>
          <NotificationToastHost />
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </AppProvider>
  );
}

