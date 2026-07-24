import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, Store, ShieldAlert, Clipboard, Bike, LogOut } from 'lucide-react';

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  userProfile: any;
  activeUserOrders: any[];
  establishments: any[];
  navigate: (path: string) => void;
  logout: () => Promise<void>;
  path: string;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  isOpen,
  onClose,
  triggerRef,
  userProfile,
  activeUserOrders,
  establishments,
  navigate,
  logout,
  path
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, right: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current!.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right
        });
      };
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed w-60 bg-white rounded-2xl shadow-xl border border-[#EADFD8] p-3.5 z-[10000] flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-150"
      style={{
        top: `${position.top}px`,
        right: `${position.right}px`
      }}
    >
      <div className="px-2 py-1.5 border-b border-[#F7F4EF] mb-1">
        <p className="text-[9px] text-[#756B66] uppercase font-black tracking-wider">Identificação</p>
        <p className="text-xs font-black text-[#201A17] truncate">{userProfile?.name}</p>
        <p className="text-[10px] text-[#756B66] font-semibold truncate leading-none mt-1">{userProfile?.email}</p>
        {userProfile?.role === 'merchant' && (
          <p className="text-[10px] text-[#E94F2F] font-bold mt-1.5 truncate">
            Loja: {userProfile.establishmentId ? (establishments.find(e => e.id === userProfile.establishmentId)?.name || userProfile.establishmentId) : 'Estabelecimento'}
          </p>
        )}
        {userProfile?.role === 'admin' && (
          <p className="text-[10px] text-amber-600 font-bold mt-1.5">Administrador</p>
        )}
      </div>

      {userProfile?.role === 'customer' && (
        <>
          {activeUserOrders.length > 0 && (
            <button
              onClick={() => { onClose(); navigate(`/acompanhar-pedido/${activeUserOrders[0].id}`); }}
              className="flex items-center gap-2 px-3 py-2 text-left text-xs font-black rounded-lg cursor-pointer transition-colors w-full text-[#E94F2F] bg-orange-50 border border-orange-200 hover:bg-orange-100"
            >
              <Bike className="w-4 h-4 shrink-0" />
              <span>Acompanhar pedido</span>
            </button>
          )}
          <button
            onClick={() => { onClose(); navigate('/meus-pedidos'); }}
            className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold rounded-lg cursor-pointer transition-colors w-full text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17]"
          >
            <Clipboard className="w-4 h-4 shrink-0" />
            <span>Meus pedidos</span>
          </button>
          <button
            onClick={() => { onClose(); navigate('/minha-conta'); }}
            className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold rounded-lg cursor-pointer transition-colors w-full text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17]"
          >
            <User className="w-4 h-4 shrink-0" />
            <span>Minha conta</span>
          </button>
        </>
      )}

      {userProfile?.role === 'merchant' && (
        <button
          onClick={() => { onClose(); navigate('/gestor'); }}
          className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold rounded-lg cursor-pointer transition-colors w-full text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17]"
        >
          <Store className="w-4 h-4 shrink-0" />
          <span>Painel da loja</span>
        </button>
      )}

      {userProfile?.role === 'admin' && (
        <button
          onClick={() => { onClose(); navigate('/admin'); }}
          className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold rounded-lg cursor-pointer transition-colors w-full text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17]"
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Painel administrativo</span>
        </button>
      )}

      <button
        onClick={async () => {
          onClose();
          try { await logout(); navigate('/'); } catch (e) { console.error(e); }
        }}
        className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200/55 rounded-lg cursor-pointer transition-colors w-full mt-1"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        <span>Sair da conta</span>
      </button>
    </div>,
    document.body
  );
};
