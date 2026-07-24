import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useApp } from '../../context/AppContext';
import { RenderAvatar } from '../../components/account/AvatarSelector';
import { MapPin, Clipboard, ArrowRight, Award, User, ShoppingBag, ShieldCheck, RefreshCw } from 'lucide-react';
import { UserAddress } from '../../types/address';
import { useLoyalty } from '../../hooks/useLoyalty';
import { RewardsModal } from '../../components/account/RewardsModal';

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
  const { currentUser, userProfile } = useAuth();
  const { account, loading, error, retry } = useLoyalty(currentUser?.uid, userProfile?.role, userProfile?.id);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);

  if (!userProfile) return null;

  // Extracted first name
  const firstName = userProfile.name.trim().split(/\s+/)[0];

  const getTierColor = (tier: string) => {
    switch(tier?.toLowerCase()) {
        case 'bronze': return 'bg-orange-100 text-[#E94F2F]';
        case 'prata': return 'bg-gray-200 text-gray-700';
        case 'ouro': return 'bg-amber-100 text-amber-700';
        case 'diamante': return 'bg-sky-100 text-sky-700';
        default: return 'bg-orange-100 text-[#E94F2F]';
    }
  }

  // Calculate dynamic progress bar and next level text
  const lifetimePoints = account?.lifetimePoints || 0;
  let nextTier = 'Prata';
  let nextTierLimit = 200;
  let currentTierBase = 0;
  let progressPercent = 0;

  if (lifetimePoints < 200) {
    nextTier = 'Prata';
    nextTierLimit = 200;
    currentTierBase = 0;
    progressPercent = Math.min(100, Math.max(0, (lifetimePoints / 200) * 100));
  } else if (lifetimePoints < 500) {
    nextTier = 'Ouro';
    nextTierLimit = 500;
    currentTierBase = 200;
    progressPercent = Math.min(100, Math.max(0, ((lifetimePoints - 200) / 300) * 100));
  } else if (lifetimePoints < 1000) {
    nextTier = 'Diamante';
    nextTierLimit = 1000;
    currentTierBase = 500;
    progressPercent = Math.min(100, Math.max(0, ((lifetimePoints - 500) / 500) * 100));
  } else {
    nextTier = 'Max';
    nextTierLimit = 1000;
    currentTierBase = 1000;
    progressPercent = 100;
  }

  const pointsNeeded = nextTierLimit - lifetimePoints;

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
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-sm flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#E94F2F]/10 p-2 rounded-xl text-[#E94F2F]">
                <User className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-sm text-[#201A17]">Meus Dados</h3>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="border-b border-[#EADFD8] pb-4">
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Nome Completo</span>
                <span className="text-sm font-black text-[#201A17]">{userProfile.name}</span>
              </div>
              <div className="border-b border-[#EADFD8] pb-4">
                <span className="text-[10px] text-gray-400 block font-bold uppercase">E-mail</span>
                <span 
                  className="text-sm font-medium text-[#201A17] block"
                  style={{ overflowWrap: 'anywhere' }}
                  title={userProfile.email}
                >
                  {userProfile.email}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Contato</span>
                <span 
                  className="text-sm font-medium text-[#201A17] block"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {userProfile.phone || 'Não informado'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#EADFD8] pt-4">
            <button
              onClick={() => onNavigateToTab('data')}
              className="text-xs font-black text-[#E94F2F] hover:text-[#BD351C] transition-colors flex items-center gap-1.5 justify-end group cursor-pointer w-full"
            >
              <span>Gerenciar meus dados</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
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
          {loading ? (
            <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-16 bg-gray-200 rounded-2xl w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ) : error ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-red-600">
                <span className="text-xl">⚠️</span>
                <h3 className="font-extrabold text-sm">Não foi possível carregar sua fidelidade</h3>
              </div>
              <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                {error}
              </p>
              <button
                onClick={retry}
                className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            </div>
          ) : (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                  <Award className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-sm text-[#201A17]">Fidelidade Uai</h3>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getTierColor(account?.tier || 'Bronze')}`}>
                Nível {account?.tier || 'Bronze'} 🧀
              </span>
            </div>

            <div className="bg-[#FFFDF5] border border-amber-200 p-4 rounded-2xl flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 font-bold uppercase block">Pão de Queijo Points</span>
                <p className="text-2xl font-black text-amber-700">{account?.pointsBalance || 0} <span className="text-xs font-bold text-amber-500">pontos</span></p>
              </div>
              <div className="text-3xl select-none animate-bounce">🧀</div>
            </div>

            {/* Progress bar towards next tier */}
            <div className="space-y-2 pt-1">
              <div className="space-y-1 font-bold text-[#756B66]" style={{ fontSize: '11.5px' }}>
                <div style={{ whiteSpace: 'nowrap' }}>
                  Total Acumulado: {lifetimePoints} pts
                </div>
                <div style={{ whiteSpace: 'nowrap' }}>
                  {nextTier !== 'Max' ? (
                    `Faltam ${pointsNeeded} pts para o nível ${nextTier}`
                  ) : (
                    <span className="text-emerald-600">★ Nível Máximo Alcançado!</span>
                  )}
                </div>
              </div>
              <div className="w-full bg-[#F7F4EF] h-2 rounded-full overflow-hidden border border-[#EADFD8]/40">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-[#E94F2F] rounded-full transition-all duration-500" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            
            <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
              Cada pedido concluído garante pontos que você pode trocar por cupons de desconto especiais ou frete grátis nos estabelecimentos parceiros!
            </p>
          </div>
          )}

          <button
            onClick={() => setIsRewardsModalOpen(true)}
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

            <div className="space-y-3">
              {/* Compact Block for Realizados */}
              <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/60 flex flex-col justify-center w-fit min-w-[120px]" style={{ whiteSpace: 'nowrap' }}>
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Realizados</span>
                <span className="text-2xl font-black text-[#201A17]">{ordersCount}</span>
              </div>

              {/* Full Width Block for Status de Entrega */}
              <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/60 flex flex-col justify-center min-w-0 w-full" style={{ whiteSpace: 'nowrap' }}>
                <span className="text-[10px] text-gray-400 block font-bold uppercase">Status de Entrega</span>
                <div className="text-xs font-black text-emerald-600 flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping shrink-0"></span>
                  <span>Concluídos e salvos</span>
                </div>
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

      {isRewardsModalOpen && (
        <RewardsModal onClose={() => setIsRewardsModalOpen(false)} />
      )}
    </div>
  );
};
