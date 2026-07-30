import React from 'react';
import { useApp } from '../context/AppContext';
import { ShoppingBag } from 'lucide-react';
import { normalizeOrderItem } from '../utils/orderCalculation';
import { enableMobileBottomNavigation } from '../config';
import { useLocation } from '../hooks/useLocation';

export const MobileFixedCartBar: React.FC = () => {
  const { cart } = useApp();
  const [path] = useLocation();
  const [isBottomNavVisible, setIsBottomNavVisible] = React.useState(false);

  React.useEffect(() => {
    const checkVisibility = () => {
      const isMerchantArea = path === '/gestor' || path === '/loja/pedidos';
      const isAdminArea = path === '/admin' || path === '/admin/migracao-catalogo';
      const isCheckoutOpen = !!(document.getElementById('checkout-modal') || document.getElementById('auth-required-checkout-modal'));
      const isFullScreenModalOpen = !!(document.getElementById('product-config-modal') || document.getElementById('all-categories-modal') || document.getElementById('city-selector-modal'));
      
      const visible = enableMobileBottomNavigation && !isMerchantArea && !isAdminArea && !isCheckoutOpen && !isFullScreenModalOpen;
      setIsBottomNavVisible(visible);
    };

    const observer = new MutationObserver(checkVisibility);
    observer.observe(document.body, { childList: true, subtree: true });

    checkVisibility();

    return () => observer.disconnect();
  }, [path]);

  if (cart.length === 0) return null;

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = cart.reduce((sum, item) => sum + normalizeOrderItem(item).lineTotal, 0);

  return (
    <div 
      id="mobile-fixed-cart-bar"
      className={`md:hidden fixed left-0 right-0 z-50 bg-white border-t border-[#EADFD8] p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-all duration-300 ${
        isBottomNavVisible 
          ? 'bottom-[calc(64px+env(safe-area-inset-bottom,0px))] pb-4' 
          : 'bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="bg-[#E94F2F] text-white p-2.5 rounded-xl">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#756B66]">
              {totalQuantity} {totalQuantity === 1 ? 'item' : 'itens'}
            </p>
            <p className="text-sm font-black text-[#201A17]">
              R$ {totalValue.toFixed(2).replace('.', ',')}
            </p>
          </div>
        </div>
        <button 
          onClick={() => window.dispatchEvent(new Event('open-cart'))}
          className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-5 py-3 rounded-xl font-black text-sm shadow-md transition-transform active:scale-95"
        >
          Ver carrinho
        </button>
      </div>
    </div>
  );
};
