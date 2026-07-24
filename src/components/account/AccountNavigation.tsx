import React, { useState } from 'react';
import { User, MapPin, Lock, Sliders, Clipboard, LogOut, FileText, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type AccountTab = 'overview' | 'data' | 'addresses' | 'security' | 'preferences' | 'orders';

interface AccountNavigationProps {
  activeTab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  onLogout: () => void;
  orderCount: number;
}

export const AccountNavigation: React.FC<AccountNavigationProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  orderCount
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { 
      id: 'overview' as AccountTab, 
      label: 'Resumo Geral', 
      desc: 'Visão geral do seu perfil e dados',
      icon: User 
    },
    { 
      id: 'data' as AccountTab, 
      label: 'Meus Dados', 
      desc: 'Altere nome, e-mail e telefone',
      icon: FileText 
    },
    { 
      id: 'addresses' as AccountTab, 
      label: 'Meus Endereços', 
      desc: 'Gerencie seus locais de entrega',
      icon: MapPin 
    },
    { 
      id: 'orders' as AccountTab, 
      label: 'Meus Pedidos', 
      desc: 'Acompanhe suas compras em tempo real',
      icon: Clipboard, 
      badge: orderCount > 0 ? orderCount : undefined 
    },
    { 
      id: 'security' as AccountTab, 
      label: 'Segurança', 
      desc: 'Altere sua senha de acesso',
      icon: Lock 
    },
    { 
      id: 'preferences' as AccountTab, 
      label: 'Preferências', 
      desc: 'Notificações e preferências do app',
      icon: Sliders 
    },
  ];

  const activeItem = menuItems.find(item => item.id === activeTab) || menuItems[0];
  const ActiveIcon = activeItem.icon;

  const handleItemClick = (id: AccountTab) => {
    onTabChange(id);
    setIsOpen(false);
  };

  return (
    <div className="w-full md:w-72 shrink-0 space-y-3">
      {/* MOBILE TRIGGER BUTTON: Accordeon / Collapsible Vertical List */}
      <div className="block md:hidden w-full">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label="Menu da Conta"
          className="w-full bg-white rounded-2xl border border-[#EADFD8] p-4 flex items-center justify-between shadow-sm hover:border-[#E94F2F]/40 active:scale-[0.99] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#E94F2F]/10 rounded-xl text-[#E94F2F]">
              <ActiveIcon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-[9px] uppercase font-black tracking-wider text-[#756B66] block">Menu da Conta</span>
              <span className="text-sm font-black text-[#201A17]">{activeItem.label}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {activeItem.badge !== undefined && (
              <span className="bg-[#E94F2F] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {activeItem.badge}
              </span>
            )}
            <div className="p-1 bg-[#F7F4EF] rounded-lg">
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-[#756B66]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#756B66]" />
              )}
            </div>
          </div>
        </button>
      </div>

      {/* NAVIGATION CONTENT */}
      <AnimatePresence initial={false}>
        {(isOpen || typeof window === 'undefined' || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ 
              height: 'auto', 
              opacity: 1,
              transition: { height: { duration: 0.25 }, opacity: { duration: 0.2 } }
            }}
            exit={{ 
              height: 0, 
              opacity: 0,
              transition: { height: { duration: 0.2 }, opacity: { duration: 0.15 } }
            }}
            className={`bg-white rounded-2xl md:rounded-3xl border border-[#EADFD8] p-3 md:p-4 shadow-sm md:shadow-xs w-full overflow-hidden ${
              isOpen ? 'block mt-2' : 'hidden md:block'
            }`}
          >
            <div className="px-3 py-2 hidden md:block border-b border-[#F7F4EF] mb-3">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-[#756B66]">Minha Conta</h3>
              <p className="text-[11px] text-[#756B66]/80 font-medium mt-0.5">Gerenciamento do cliente</p>
            </div>

            <nav className="flex flex-col gap-1 w-full" aria-label="Navegação da Conta">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all cursor-pointer relative group text-left min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20 ${
                      isActive
                        ? 'bg-[#E94F2F]/10 text-[#E94F2F] font-extrabold'
                        : 'text-[#5C534E] hover:bg-[#F7F4EF] hover:text-[#201A17] font-bold'
                    }`}
                  >
                    {/* Left side: Icon + Texts */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                        isActive ? 'bg-[#E94F2F] text-white' : 'bg-[#F7F4EF] text-[#756B66] group-hover:bg-[#EADFD8]/50'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-xs block ${isActive ? 'text-[#E94F2F]' : 'text-[#201A17]'}`}>
                          {item.label}
                        </span>
                        <span className="text-[10px] font-medium text-[#756B66]/80 block truncate max-w-[180px] md:max-w-none">
                          {item.desc}
                        </span>
                      </div>
                    </div>

                    {/* Right side: Badge / Chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge !== undefined && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                          isActive ? 'bg-[#E94F2F] text-white' : 'bg-[#F7F4EF] text-[#201A17] border border-[#EADFD8]'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isActive ? 'text-[#E94F2F] translate-x-0.5' : 'text-[#756B66]/40 group-hover:translate-x-0.5'
                      }`} />
                    </div>
                  </button>
                );
              })}

              <div className="h-px bg-[#F7F4EF] my-2" />

              <button
                onClick={onLogout}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all cursor-pointer text-rose-600 hover:bg-rose-50/70 font-bold min-h-[44px] group focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-50 text-rose-500 rounded-lg group-hover:bg-rose-100 transition-colors">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs block text-rose-600">Sair da Conta</span>
                    <span className="text-[10px] font-medium text-rose-500/80 block">Encerrar sessão de usuário</span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-rose-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

