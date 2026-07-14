import React from 'react';
import { User, MapPin, Lock, Sliders, Clipboard, LogOut, FileText } from 'lucide-react';

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
  const menuItems = [
    { id: 'overview' as AccountTab, label: 'Resumo Geral', icon: User },
    { id: 'data' as AccountTab, label: 'Meus Dados', icon: FileText },
    { id: 'addresses' as AccountTab, label: 'Meus Endereços', icon: MapPin },
    { id: 'orders' as AccountTab, label: 'Meus Pedidos', icon: Clipboard, badge: orderCount > 0 ? orderCount : undefined },
    { id: 'security' as AccountTab, label: 'Segurança', icon: Lock },
    { id: 'preferences' as AccountTab, label: 'Preferências', icon: Sliders },
  ];

  return (
    <div className="bg-white rounded-3xl border border-[#EADFD8] p-4 space-y-2 md:space-y-1 shadow-xs shrink-0 w-full md:w-64">
      <div className="px-3 py-2">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-[#756B66]">Navegação</h3>
      </div>
      
      <nav className="flex flex-row md:flex-col overflow-x-auto md:overflow-visible gap-1.5 md:gap-1 scrollbar-none pb-2 md:pb-0">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer relative ${
                isActive
                  ? 'bg-[#E94F2F]/10 text-[#E94F2F]'
                  : 'text-[#5C534E] hover:bg-[#F7F4EF] hover:text-[#201A17]'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[#E94F2F] hidden md:block" />
              )}
              <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-[#E94F2F]' : 'text-[#756B66]'}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  isActive ? 'bg-[#E94F2F] text-white' : 'bg-[#F7F4EF] text-[#201A17] border border-[#EADFD8]'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="h-px bg-[#EADFD8] my-2 hidden md:block" />

        <button
          onClick={onLogout}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all whitespace-nowrap cursor-pointer mt-0 md:mt-2"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0 text-rose-500" />
          <span>Sair da Conta</span>
        </button>
      </nav>
    </div>
  );
};
