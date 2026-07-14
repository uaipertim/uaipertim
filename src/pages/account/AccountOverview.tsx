import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useApp } from '../../context/AppContext';
import { RenderAvatar } from '../../components/account/AvatarSelector';
import { MapPin, Clipboard, ArrowRight, Award, User, ShoppingBag, ShieldCheck } from 'lucide-react';
import { UserAddress } from '../../types/address';

interface AccountOverviewProps {
  onNavigateToTab: (tab: 'data' | 'addresses' | 'security' | 'preferences' | 'orders') => void;
  defaultAddress: UserAddress | null;
  ordersCount: number;
}

export const AccountOverview: React.FC<AccountOverviewProps> = ({
  onNavigateToTab,
  defaultAddress,
  ordersCount
}) => {
  const { userProfile } = useAuth();

  if (!userProfile) return null;

  // Extracted first name
  const firstName = userProfile.name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      {/* Warm Regional Welcome Card */}
      <div className="bg-gradient-to-br from-[#E94F2F] to-[#BD351C] text-white p-6 sm:p-8 rounded-3xl border border-[#BD351C] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none select-none translate-x-12 translate-y-12">
          <Award className="w-64 h-64" />
        </div>
        
        <div className="flex items-center gap-4 sm:gap-5 z-10">
          <RenderAvatar 
            name={userProfile.name} 
            avatarType={userProfile.avatarType} 
            avatarKey={userProfile.avatarKey} 
            className="w-16 h-16 sm:w-20 sm:h-20 text-3xl border-white/20 bg-white/10" 
          />
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Uai, que bom ter você aqui, {firstName}! 🌾
            </h2>
            <p className="text-xs sm:text-sm text-orange-100 font-semibold max-w-md">
              Sua conta na UaiPertim está ativa e segura. Explore o melhor do comércio da sua cidade direto na sua mesa.
            </p>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-xs px-4 py-3 rounded-2xl border border-white/10 text-xs font-semibold space-y-1 w-full md:w-auto shrink-0 z-10">
          <p className="text-[9px] font-black uppercase tracking-wider text-orange-200">Plataforma Oficial</p>
          <p className="text-white font-black flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            Acesso verificado
          </p>
        </div>
      </div>

      {/* Grid containing summary modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card Summary */}
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#E94F2F]/10 p-2 rounded-xl text-[#E94F2F]">
                <User className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-sm text-[#201A17]">Meus Dados</h3>
            </div>

            <div className="space-y-2.5 text-xs text-[#5C534E] font-semibold">
              <div className="bg-[#F7F4EF]/50 p-3 rounded-xl border border-[#EADFD8]/40">
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Nome Completo</span>
                <span className="text-sm font-black text-[#201A17]">{userProfile.name}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-[#F7F4EF]/50 p-3 rounded-xl border border-[#EADFD8]/40">
                  <span className="text-[10px] text-gray-400 block font-bold uppercase">E-mail</span>
                  <span className="text-[11px] font-black text-[#201A17] truncate block">{userProfile.email}</span>
                </div>
                <div className="bg-[#F7F4EF]/50 p-3 rounded-xl border border-[#EADFD8]/40">
                  <span className="text-[10px] text-gray-400 block font-bold uppercase">Contato</span>
                  <span className="text-xs font-black text-[#201A17]">{userProfile.phone || 'Não informado'}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab('data')}
            className="text-xs font-black text-[#E94F2F] hover:text-[#BD351C] transition-colors flex items-center gap-1.5 justify-end mt-2 group cursor-pointer self-end"
          >
            <span>Gerenciar meus dados</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Default Address Summary */}
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#E94F2F]/10 p-2 rounded-xl text-[#E94F2F]">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-sm text-[#201A17]">Endereço Padrão de Entrega</h3>
            </div>

            {defaultAddress ? (
              <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/60 space-y-2 text-xs text-[#5C534E] font-semibold">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-md bg-orange-100 text-[#E94F2F] text-[9px] font-black uppercase tracking-wider border border-orange-200">
                    {defaultAddress.label}
                  </span>
                  <span className="text-[10px] text-gray-400">CEP: {defaultAddress.zipCode}</span>
                </div>
                <p className="font-black text-sm text-[#201A17] leading-tight">
                  {defaultAddress.street}, {defaultAddress.number}
                  {defaultAddress.complement && ` - ${defaultAddress.complement}`}
                </p>
                <p className="text-gray-500 font-semibold text-[11px]">
                  {defaultAddress.neighborhood} • {defaultAddress.cityName} - {defaultAddress.state}
                </p>
              </div>
            ) : (
              <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 text-center py-6 space-y-2">
                <p className="text-xs font-bold text-[#756B66]">Você ainda não tem um endereço padrão cadastrado.</p>
                <p className="text-[11px] text-gray-500">Adicione endereços para agilizar sua finalização de pedidos.</p>
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigateToTab('addresses')}
            className="text-xs font-black text-[#E94F2F] hover:text-[#BD351C] transition-colors flex items-center gap-1.5 justify-end mt-2 group cursor-pointer self-end"
          >
            <span>{defaultAddress ? 'Gerenciar endereços' : 'Cadastrar primeiro endereço'}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Loyalty Program Section */}
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                  <Award className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-sm text-[#201A17]">Fidelidade Uai</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-[#E94F2F]">
                Nível Ouro 🧀
              </span>
            </div>

            <div className="bg-[#FFFDF5] border border-amber-200 p-4 rounded-2xl flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 font-bold uppercase block">Pão de Queijo Points</span>
                <p className="text-2xl font-black text-amber-700">180 <span className="text-xs font-bold text-amber-500">pontos</span></p>
              </div>
              <div className="text-3xl select-none animate-bounce">🧀</div>
            </div>
            
            <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
              Cada pedido concluído garante pontos que você pode trocar por cupons de desconto especiais ou frete grátis nos estabelecimentos parceiros!
            </p>
          </div>

          <button
            onClick={() => onNavigateToTab('preferences')}
            className="text-xs font-black text-[#E94F2F] hover:text-[#BD351C] transition-colors flex items-center gap-1.5 justify-end mt-2 group cursor-pointer self-end"
          >
            <span>Visualizar prêmios</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Order History Summary */}
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-4">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2">
              <div className="bg-[#E94F2F]/10 p-2 rounded-xl text-[#E94F2F]">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-sm text-[#201A17]">Meus Pedidos</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/60 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Realizados</span>
                <span className="text-2xl font-black text-[#201A17]">{ordersCount}</span>
              </div>
              <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/60 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Status de Entrega</span>
                <span className="text-xs font-black text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                  Concluídos e salvos
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
              Acompanhe o andamento dos seus pedidos em tempo real ou verifique o histórico completo de compras nos estabelecimentos.
            </p>
          </div>

          <button
            onClick={() => onNavigateToTab('orders')}
            className="text-xs font-black text-[#E94F2F] hover:text-[#BD351C] transition-colors flex items-center gap-1.5 justify-end mt-2 group cursor-pointer self-end"
          >
            <span>Ver histórico completo</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
