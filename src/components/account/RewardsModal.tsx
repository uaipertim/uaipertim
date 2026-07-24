import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Award, MapPin, Clock, Check, Ticket, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLoyalty } from '../../hooks/useLoyalty';
import { loyaltyService, LoyaltyReward, LoyaltyRedemption } from '../../services/loyaltyService';

interface RewardsModalProps {
  onClose: () => void;
}

export const RewardsModal: React.FC<RewardsModalProps> = ({ onClose }) => {
  const { currentUser, userProfile } = useAuth();
  const { account, loading: loadingAccount, error: errorAccount, retry: retryAccount } = useLoyalty(currentUser?.uid, userProfile?.role, userProfile?.id);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [loadingRedemptions, setLoadingRedemptions] = useState(true);
  const [errorRewards, setErrorRewards] = useState<string | null>(null);
  const [errorRedemptions, setErrorRedemptions] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [successCoupon, setSuccessCoupon] = useState<{ couponCode: string; title: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load rewards
  const loadRewardsData = async () => {
    setLoadingRewards(true);
    setErrorRewards(null);
    try {
      const activeRewards = await loyaltyService.getRewards(false);
      setRewards(activeRewards);
    } catch (e) {
      console.error('Error loading rewards:', e);
      setErrorRewards('Erro ao carregar os prêmios disponíveis.');
    } finally {
      setLoadingRewards(false);
    }
  };

  // Load redemptions
  const loadRedemptionsData = async () => {
    if (!currentUser?.uid) {
      setLoadingRedemptions(false);
      return;
    }
    setLoadingRedemptions(true);
    setErrorRedemptions(null);
    try {
      const userRedemptions = await loyaltyService.getRedemptions(currentUser.uid);
      setRedemptions(userRedemptions);
    } catch (e) {
      console.error('Error loading redemptions:', e);
      setErrorRedemptions('Erro ao carregar seus cupons resgatados.');
    } finally {
      setLoadingRedemptions(false);
    }
  };

  useEffect(() => {
    loadRewardsData();
    loadRedemptionsData();
  }, [currentUser?.uid]);

  // Handle redemption
  const handleRedeem = async (reward: LoyaltyReward) => {
    if (!currentUser?.uid || !reward.id) return;
    setRedeemingId(reward.id);
    setErrorMessage(null);
    try {
      const couponCode = await loyaltyService.redeemReward(currentUser.uid, reward);
      setSuccessCoupon({ couponCode, title: reward.title });
      loadRedemptionsData(); // Refresh history
    } catch (e: any) {
      setErrorMessage(e.message || 'Erro ao realizar resgate.');
    } finally {
      setRedeemingId(null);
    }
  };

  // Lock body scroll
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (typeof window === 'undefined' || !document.body) {
    return null;
  }

  // Calculate progress metrics
  const lifetimePoints = account?.lifetimePoints || 0;
  let nextTier = 'Prata';
  let nextTierLimit = 200;
  let progressPercent = 0;

  if (lifetimePoints < 200) {
    nextTier = 'Prata';
    nextTierLimit = 200;
    progressPercent = Math.min(100, Math.max(0, (lifetimePoints / 200) * 100));
  } else if (lifetimePoints < 500) {
    nextTier = 'Ouro';
    nextTierLimit = 500;
    progressPercent = Math.min(100, Math.max(0, ((lifetimePoints - 200) / 300) * 100));
  } else if (lifetimePoints < 1000) {
    nextTier = 'Diamante';
    nextTierLimit = 1000;
    progressPercent = Math.min(100, Math.max(0, ((lifetimePoints - 500) / 500) * 100));
  } else {
    nextTier = 'Max';
    nextTierLimit = 1000;
    progressPercent = 100;
  }

  const pointsNeeded = nextTierLimit - lifetimePoints;

  const getTierBadgeColor = (tier: string) => {
    const t = tier.toLowerCase();
    switch(t) {
      case 'bronze': return 'bg-orange-100 text-[#E94F2F] border-orange-200';
      case 'prata': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'ouro': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'diamante': return 'bg-sky-100 text-sky-700 border-sky-300';
      default: return 'bg-orange-100 text-[#E94F2F] border-orange-200';
    }
  };

  const displayTier = account?.tier 
    ? (account.tier.charAt(0).toUpperCase() + account.tier.slice(1).toLowerCase()) 
    : 'Bronze';

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rewards-modal-title"
    >
      <div 
        className="bg-[#FCFAF6] border border-[#EADFD8] rounded-3xl max-w-2xl w-full text-left shadow-2xl relative flex flex-col max-h-[90dvh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#EADFD8] bg-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 id="rewards-modal-title" className="font-extrabold text-lg text-[#201A17]">Prêmios & Fidelidade</h2>
              <p className="text-[10px] text-[#756B66] font-bold uppercase tracking-wider">Programa Pão de Queijo Points</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#EADFD8]/40 hover:bg-[#EADFD8]/80 text-[#756B66] hover:text-[#201A17] cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Info Banner */}
          {loadingAccount ? (
            <div className="bg-white border border-[#EADFD8] rounded-2xl p-4 shadow-sm space-y-4 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="space-y-2 w-1/3">
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded-full w-24"></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
                <div className="h-3 bg-gray-200 rounded-full w-full"></div>
              </div>
              <div className="h-3 bg-gray-200 rounded w-5/6 pt-1"></div>
            </div>
          ) : errorAccount ? (
            <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-rose-600">
                <span className="text-xl">⚠️</span>
                <h3 className="font-extrabold text-sm">Não foi possível carregar sua fidelidade</h3>
              </div>
              <p className="text-xs text-gray-500 font-semibold">{errorAccount}</p>
              <button
                onClick={retryAccount}
                className="bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 inline-flex"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="bg-white border border-[#EADFD8] rounded-2xl p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400">Saldo Disponível</span>
                  <p className="text-3xl font-black text-amber-700">
                    {account?.pointsBalance ?? 0} <span className="text-sm font-bold text-amber-500">pontos</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Nível Atual:</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${getTierBadgeColor(account?.tier || 'Bronze')}`}>
                    {displayTier} 🧀
                  </span>
                </div>
              </div>

              {/* Progress indicator */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[11px] font-bold text-[#756B66]">
                  <span>Total Acumulado: {lifetimePoints} pts</span>
                  {nextTier !== 'Max' ? (
                    <span>Faltam {pointsNeeded} pontos para o nível {nextTier}</span>
                  ) : (
                    <span className="text-sky-600">★ Nível Máximo Alcançado!</span>
                  )}
                </div>
                <div className="w-full bg-[#F3EFE9] h-2.5 rounded-full overflow-hidden border border-[#EADFD8]/60">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-[#E94F2F] rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed pt-1">
                Acumule pontos em cada compra concluída! Corra e garanta seus prêmios. <strong>30 pontos</strong> de boas-vindas no primeiro acesso e <strong>20 pontos</strong> adicionais por pedido concluído.
              </p>
            </div>
          )}

          {/* Success Banner */}
          {successCoupon && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-center space-y-3 relative animate-in fade-in duration-200">
              <button 
                onClick={() => setSuccessCoupon(null)}
                className="absolute top-2.5 right-2.5 text-emerald-600 hover:text-emerald-800"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="font-extrabold text-sm">Resgate Concluído com Sucesso!</p>
                <p className="text-xs mt-1">Utilize o cupom abaixo no seu próximo pedido do estabelecimento elegível:</p>
              </div>
              <div className="bg-white border-2 border-dashed border-emerald-300 font-mono text-base font-black px-4 py-2 rounded-xl inline-block tracking-wider text-emerald-700 shadow-2xs select-all">
                {successCoupon.couponCode}
              </div>
              <p className="text-[10px] text-emerald-600 font-bold">O cupom também está salvo na seção "Meus Cupons Resgatados" abaixo.</p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-start gap-3 text-xs font-semibold animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">Não foi possível resgatar</p>
                <p className="mt-0.5 text-rose-600">{errorMessage}</p>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tab Content: Rewards Grid */}
          <div className="space-y-4">
            <h3 className="font-black text-sm text-[#201A17] flex items-center gap-1.5">
              <span>Prêmios Disponíveis</span>
            </h3>

            {loadingRewards ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="bg-white border border-[#EADFD8] rounded-2xl p-4 animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-8 bg-gray-200 rounded-xl w-full pt-1"></div>
                  </div>
                ))}
              </div>
            ) : errorRewards ? (
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-center space-y-3">
                <p className="text-xs font-bold text-rose-700">{errorRewards}</p>
                <button
                  onClick={loadRewardsData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-100/50 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tentar novamente</span>
                </button>
              </div>
            ) : rewards.length === 0 ? (
              <div className="bg-white border border-[#EADFD8] rounded-2xl p-8 text-center space-y-2">
                <p className="font-extrabold text-sm text-[#201A17]">Novos prêmios estão sendo preparados.</p>
                <p className="text-xs text-[#756B66] font-semibold">Continue acumulando Pão de Queijo Points para aproveitar as novidades em breve.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rewards.map((reward) => {
                  const pointsBalance = account?.pointsBalance || 0;
                  const hasPoints = pointsBalance >= reward.pointsCost;
                  
                  // Check stock
                  const inStock = reward.stock === undefined || reward.stock > 0;
                  
                  // Check dates
                  const nowStr = new Date().toISOString().split('T')[0];
                  const beforeStart = reward.startsAt && nowStr < reward.startsAt;
                  const afterEnd = reward.expiresAt && nowStr > reward.expiresAt;
                  const isClosed = beforeStart || afterEnd;

                  return (
                    <div 
                      key={reward.id} 
                      className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-4 transition-all duration-200 ${
                        hasPoints && !isClosed && inStock
                          ? 'border-[#EADFD8] hover:border-amber-400 hover:shadow-md'
                          : 'border-[#EADFD8]/60 opacity-90'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-black text-sm text-[#201A17]">{reward.title}</h4>
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0">
                            {reward.pointsCost} pts
                          </span>
                        </div>
                        <p className="text-xs text-[#756B66] font-medium leading-relaxed">{reward.description}</p>
                        
                        {/* Rules / Specifics */}
                        <div className="space-y-1 text-[10px] text-gray-500 font-bold">
                          {reward.minimumOrderValue && (
                            <p>• Pedido mínimo: R$ {reward.minimumOrderValue.toFixed(2).replace('.', ',')}</p>
                          )}
                          {reward.maximumDiscount && (
                            <p>• Desconto máximo: R$ {reward.maximumDiscount.toFixed(2).replace('.', ',')}</p>
                          )}
                          <p className="flex items-center gap-1 mt-1 text-[#756B66]">
                            <MapPin className="w-3 h-3 text-[#E94F2F]" />
                            <span>{reward.availableForAllMerchants ? 'Elegível em todos os parceiros' : 'Estabelecimentos selecionados'}</span>
                          </p>
                          {reward.expiresAt && (
                            <p className="flex items-center gap-1 text-gray-400 font-medium">
                              <Clock className="w-3 h-3" />
                              <span>Validade: até {reward.expiresAt.split('-').reverse().join('/')}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => handleRedeem(reward)}
                        disabled={!hasPoints || isClosed || !inStock || redeemingId !== null}
                        className={`w-full py-2 px-4 rounded-xl text-xs font-black transition-all cursor-pointer text-center ${
                          redeemingId === reward.id
                            ? 'bg-amber-100 text-amber-800'
                            : !inStock
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : isClosed
                            ? 'bg-rose-50 text-rose-500 cursor-not-allowed'
                            : hasPoints
                            ? 'bg-[#E94F2F] hover:bg-[#BD351C] text-white shadow-xs active:scale-95'
                            : 'bg-[#F7F4EF] text-[#756B66] hover:bg-gray-100'
                        }`}
                      >
                        {redeemingId === reward.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 bg-amber-800 rounded-full animate-bounce" />
                            <span className="w-1.5 h-1.5 bg-amber-800 rounded-full animate-bounce delay-100" />
                            <span className="w-1.5 h-1.5 bg-amber-800 rounded-full animate-bounce delay-200" />
                          </div>
                        ) : !inStock ? (
                          'Indisponível'
                        ) : isClosed ? (
                          'Encerrado'
                        ) : hasPoints ? (
                          'Resgatar Prêmio'
                        ) : (
                          `Faltam ${reward.pointsCost - pointsBalance} pontos`
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Meus Prêmios / Redemptions */}
          <div className="space-y-4 pt-2">
            <h3 className="font-black text-sm text-[#201A17] flex items-center gap-1.5">
              <span>Meus Cupons Resgatados</span>
            </h3>

            {loadingRedemptions ? (
              <div className="space-y-2">
                <div className="h-12 bg-gray-200 rounded-xl animate-pulse w-full"></div>
                <div className="h-12 bg-gray-200 rounded-xl animate-pulse w-full"></div>
              </div>
            ) : errorRedemptions ? (
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-center space-y-3">
                <p className="text-xs font-bold text-rose-700">{errorRedemptions}</p>
                <button
                  onClick={loadRedemptionsData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-100/50 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tentar novamente</span>
                </button>
              </div>
            ) : redemptions.length === 0 ? (
              <p className="text-xs text-[#756B66] font-semibold text-center py-4 bg-white rounded-2xl border border-dashed border-[#EADFD8]">
                Você ainda não resgatou nenhum prêmio.
              </p>
            ) : (
              <div className="space-y-2.5">
                {redemptions.map((red) => {
                  const isAvailable = red.status === 'available';
                  return (
                    <div 
                      key={red.id} 
                      className={`bg-white border rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-all ${
                        isAvailable ? 'border-[#EADFD8] bg-white' : 'border-[#EADFD8]/40 bg-[#F7F4EF]/30 opacity-75'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Ticket className={`w-4 h-4 ${isAvailable ? 'text-[#E94F2F]' : 'text-gray-400'}`} />
                          <h4 className="font-extrabold text-[#201A17]">{red.rewardTitle}</h4>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold">
                          Resgatado em {red.createdAt ? new Date(red.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        {isAvailable ? (
                          <>
                            <span className="font-mono bg-amber-50 border border-dashed border-amber-300 text-amber-800 px-3 py-1 rounded-lg text-xs font-black select-all">
                              {red.couponCode}
                            </span>
                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                              Disponível
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-mono text-gray-400 line-through text-xs">
                              {red.couponCode}
                            </span>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                              red.status === 'used'
                                ? 'bg-gray-100 text-gray-500 border border-gray-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {red.status === 'used' ? 'Utilizado' : red.status === 'expired' ? 'Expirado' : 'Cancelado'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#EADFD8] bg-[#F7F4EF] flex justify-end shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
