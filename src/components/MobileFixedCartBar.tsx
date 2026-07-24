import React from 'react';
import { useApp } from '../context/AppContext';
import { ShoppingBag } from 'lucide-react';
import { normalizeOrderItem } from '../utils/orderCalculation';

export const MobileFixedCartBar: React.FC = () => {
  const { cart } = useApp();

  if (cart.length === 0) return null;

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = cart.reduce((sum, item) => sum + normalizeOrderItem(item).lineTotal, 0);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EADFD8] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
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
