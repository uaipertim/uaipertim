import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useApp } from '../context/AppContext';
import { useLocation } from '../hooks/useLocation';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, User, Heart } from 'lucide-react';

// Import our newly created components
import { AccountNavigation, AccountTab } from './account/AccountNavigation';
import { AccountOverview } from '../pages/account/AccountOverview';
import { ProfileSettings } from '../pages/account/ProfileSettings';
import { AddressManager } from '../pages/account/AddressManager';
import { SecuritySettings } from '../pages/account/SecuritySettings';
import { PreferencesSettings } from '../pages/account/PreferencesSettings';
import { OrdersHistory } from './account/OrdersHistory';
import { addressService } from '../services/addressService';
import { UserAddress } from '../types/address';

export const MyAccount: React.FC = () => {
  const { userProfile, logout, currentUser } = useAuth();
  const { orders } = useApp();
  const [path, navigate] = useLocation();

  // Switch initial tab based on route path
  const [activeTab, setActiveTab] = useState<AccountTab>(() => {
    return path === '/meus-pedidos' ? 'orders' : 'overview';
  });

  const [defaultAddress, setDefaultAddress] = useState<UserAddress | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

  // Keep track of activeTab if path changes externally
  useEffect(() => {
    if (path === '/meus-pedidos') {
      setActiveTab('orders');
    } else if (path === '/minha-conta' && activeTab === 'orders' && path !== '/meus-pedidos') {
      // Keep it or switch back
    }
  }, [path]);

  // Synchronize route if user clicks tabs
  const handleTabChange = (tab: AccountTab) => {
    setActiveTab(tab);
    if (tab === 'orders') {
      navigate('/meus-pedidos');
    } else {
      navigate('/minha-conta');
    }
  };

  // Load default address for the overview display
  const loadDefaultAddress = async () => {
    if (!currentUser) return;
    setLoadingAddress(true);
    try {
      const list = await addressService.getAddresses(currentUser.uid);
      const def = list.find((a) => a.isDefault) || null;
      setDefaultAddress(def);
    } catch (err) {
      console.error('Error loading default address for overview:', err);
    } finally {
      setLoadingAddress(false);
    }
  };

  useEffect(() => {
    loadDefaultAddress();
  }, [currentUser, activeTab]); // Reload when tab changes in case user edited/created addresses

  // Filter orders strictly by customerId === currentUser.uid
  const userOrders = useMemo(() => {
    if (!currentUser) return [];
    return orders.filter(
      (o) => o.customerId === currentUser.uid
    );
  }, [orders, currentUser]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (e) {
      console.error("Error logging out:", e);
    }
  };

  if (!userProfile) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E94F2F]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header breadcrumb bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-[#756B66] hover:text-[#201A17] flex items-center gap-1.5 text-xs font-black transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Início</span>
        </button>

        <div className="flex items-center gap-1 bg-[#EADFD8]/30 px-3 py-1.5 rounded-full border border-[#EADFD8]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E94F2F] inline-block animate-ping"></span>
          <span className="text-[10px] font-black text-[#5C534E] uppercase tracking-wider">
            {userProfile.role === 'customer' ? 'Área do Cliente' : userProfile.role === 'merchant' ? 'Área do Lojista' : 'Área do Administrador'}
          </span>
        </div>
      </div>

      {/* Grid container with navigation sidebar + content area */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Navigation panel */}
        <AccountNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onLogout={handleLogout}
          orderCount={userOrders.length}
        />

        {/* Content panel */}
        <div className="flex-1 bg-white md:bg-transparent rounded-3xl p-1 md:p-0 w-full min-h-[50vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="space-y-4"
            >
              {activeTab === 'overview' && (
                <AccountOverview
                  onNavigateToTab={handleTabChange}
                  defaultAddress={defaultAddress}
                  ordersCount={userOrders.length}
                />
              )}

              {activeTab === 'data' && <ProfileSettings />}

              {activeTab === 'addresses' && <AddressManager />}

              {activeTab === 'security' && <SecuritySettings />}

              {activeTab === 'preferences' && <PreferencesSettings />}

              {activeTab === 'orders' && <OrdersHistory orders={userOrders} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
