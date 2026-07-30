import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { House, Search, Clipboard, User } from 'lucide-react';
import { motion } from 'motion/react';
import { enableMobileBottomNavigation } from '../config';

interface MobileBottomNavigationProps {
  isCheckoutOpen: boolean;
  isFullScreenModalOpen: boolean;
  isCartOpen?: boolean;
  isReviewModalOpen?: boolean;
}

export const MobileBottomNavigation: React.FC<MobileBottomNavigationProps> = ({
  isCheckoutOpen,
  isFullScreenModalOpen,
  isCartOpen,
  isReviewModalOpen
}) => {
  const [path, navigate] = useLocation();
  const { orders } = useApp();
  const { isAuthenticated, loading, currentUser } = useAuth();

  // If the feature flag is disabled, hide completely
  if (!enableMobileBottomNavigation) return null;

  // Do not show on merchant and admin areas
  const isMerchantArea = path === '/gestor' || path === '/loja/pedidos';
  const isAdminArea = path === '/admin' || path === '/admin/migracao-catalogo';
  if (isMerchantArea || isAdminArea) return null;

  // Do not show on checkout, cart, full screen modals or review modal
  if (isCheckoutOpen || isFullScreenModalOpen || isCartOpen || isReviewModalOpen) return null;

  // While auth is loading, display a subtle neutral skeleton to prevent visual jumping (3 -> 4 -> 3 tabs)
  if (loading) {
    return (
      <nav 
        id="mobile-bottom-navigation-skeleton"
        aria-label="Navegação principal em carregamento"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EADFD8] shadow-[0_-4px_10px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="grid grid-cols-3 items-center h-16 max-w-lg mx-auto px-6">
          <div className="flex flex-col items-center gap-1 opacity-40">
            <div className="w-5 h-5 rounded bg-gray-200 animate-pulse" />
            <div className="w-8 h-2 bg-gray-200 animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-1 opacity-40">
            <div className="w-5 h-5 rounded bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 bg-gray-200 animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-1 opacity-40">
            <div className="w-5 h-5 rounded bg-gray-200 animate-pulse" />
            <div className="w-8 h-2 bg-gray-200 animate-pulse" />
          </div>
        </div>
      </nav>
    );
  }

  // Derive counters separately (Requirement 7)
  const activeOrdersCount = orders.filter(
    o => !['concluido', 'recusado', 'cancelado'].includes(o.status)
  ).length;

  const unreadOrderUpdatesCount = orders.filter(
    o => o.hasUnreadCustomerUpdate === true && !['concluido', 'recusado', 'cancelado'].includes(o.status)
  ).length;

  const unreadOrderMessagesCount = orders.reduce(
    (sum, o) => sum + (o.chatUnreadCustomer || 0), 
    0
  );

  const postOrderAttentionCount = orders.filter(
    o => o.hasUnreadCustomerUpdate === true && ['concluido', 'recusado', 'cancelado'].includes(o.status)
  ).length;

  // Calculate the badge count avoiding duplication on a per-order basis (Requirement 8)
  const ordersBadgeCount = orders.reduce((sum, order) => {
    const chatUnread = order.chatUnreadCustomer || 0;
    const statusUnread = order.hasUnreadCustomerUpdate ? 1 : 0;
    const orderAttention = chatUnread > 0 ? chatUnread : statusUnread;
    return sum + orderAttention;
  }, 0);

  // Determine active tab - read query parameters reactively from window.location.search
  const isExploreActive = window.location.search.includes('view=explore') || path.includes('/explorar');
  const isHomeActive = (path === '/' || path === '/demo') && !isExploreActive;
  const isOrdersActive = path.includes('/meus-pedidos');
  const isAccountActive = path.includes('/minha-conta') && !isOrdersActive;

  const handleTabClick = (tab: 'home' | 'explore' | 'orders' | 'account' | 'login') => {
    const isDemo = path.startsWith('/demo');
    const basePath = isDemo ? '/demo' : '';

    if (tab === 'home') {
      if (path === (basePath || '/') && !window.location.search) {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
        return;
      }
      navigate(basePath || '/');
    } else if (tab === 'explore') {
      if (window.location.search.includes('view=explore')) return;
      navigate(`${basePath || '/'}?view=explore`);
    } else if (tab === 'orders') {
      if (!isAuthenticated) {
        sessionStorage.setItem('redirect_after_login', '/meus-pedidos');
        navigate('/login');
      } else {
        navigate('/meus-pedidos');
      }
    } else if (tab === 'account') {
      if (!isAuthenticated) {
        sessionStorage.setItem('redirect_after_login', '/minha-conta');
        navigate('/login');
      } else {
        navigate('/minha-conta');
      }
    } else if (tab === 'login') {
      sessionStorage.removeItem('redirect_after_login');
      navigate('/login');
    }
  };

  // Condition to display Orders tab: authenticated user + loading resolved
  const showOrdersTab = !loading && isAuthenticated && currentUser;

  const tabs = [
    {
      id: 'home',
      label: 'Início',
      icon: House,
      isActive: isHomeActive,
    },
    {
      id: 'explore',
      label: 'Explorar',
      icon: Search,
      isActive: isExploreActive,
    },
    ...(showOrdersTab ? [
      {
        id: 'orders',
        label: 'Pedidos',
        icon: Clipboard,
        isActive: isOrdersActive,
        badge: ordersBadgeCount > 0 ? ordersBadgeCount : undefined,
      },
      {
        id: 'account',
        label: 'Conta',
        icon: User,
        isActive: isAccountActive,
      }
    ] : [
      {
        id: 'login',
        label: 'Entrar',
        icon: User,
        isActive: path.includes('/login'),
      }
    ])
  ];

  return (
    <nav 
      id="mobile-bottom-navigation"
      aria-label="Navegação principal"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EADFD8] shadow-[0_-4px_10px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div 
        className="grid items-center h-16 max-w-lg mx-auto px-2"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id as any)}
              aria-current={tab.isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center h-full relative cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E94F2F] focus-visible:ring-offset-2"
              style={{ WebkitTapHighlightColor: 'transparent', minHeight: '44px' }}
            >
              <div className="relative p-1">
                <Icon 
                  className={`w-5.5 h-5.5 transition-colors duration-200 ${
                    tab.isActive ? 'text-[#E94F2F]' : 'text-[#756B66]'
                  }`} 
                />
                
                {tab.badge !== undefined && (
                  <span 
                    className="absolute -top-1.5 -right-1.5 bg-[#E94F2F] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                    aria-label={`${tab.badge} pedidos ativos`}
                  >
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </div>
              
              <span 
                className={`text-[10px] tracking-tight font-black mt-0.5 transition-colors duration-200 ${
                  tab.isActive ? 'text-[#E94F2F]' : 'text-[#756B66]'
                }`}
              >
                {tab.label}
              </span>

              {tab.isActive && (
                <motion.div
                  layoutId="active-indicator"
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-[#E94F2F]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
