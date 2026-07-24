import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '../../types';
import { ClipboardList, MapPin, ShoppingBag, Calendar, CheckCircle2, Bike, ArrowLeft, ChevronRight, MessageSquare, AlertCircle, Store, Receipt, Clock } from 'lucide-react';
import { useLocation } from '../../hooks/useLocation';
import { normalizeOrderItem } from '../../utils/orderCalculation';
import { formatOrderDateTime } from '../../utils/dateUtils';

interface OrdersHistoryProps {
  orders: Order[];
}

type TabType = 'active' | 'completed' | 'cancelled';

export const OrdersHistory: React.FC<OrdersHistoryProps> = ({ orders }) => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [isChanging, setIsChanging] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Grouping orders
  const activeOrders = orders.filter(o => 
    !['concluido', 'recusado', 'cancelado'].includes(o.status)
  );

  const completedOrders = orders.filter(o => 
    o.status === 'concluido'
  );

  const cancelledOrders = orders.filter(o => 
    ['recusado', 'cancelado'].includes(o.status)
  );

  // Trigger skeleton loading animation on tab change to feel extremely native/premium
  useEffect(() => {
    setIsChanging(true);
    const timer = setTimeout(() => {
      setIsChanging(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const paymentMethodLabel: Record<string, string> = {
    cash: 'Dinheiro na entrega',
    card_on_delivery: 'Cartão na entrega',
    pix_on_delivery: 'PIX na entrega',
    pix: 'PIX Online',
    entrega_cartao: 'Cartão na entrega',
    entrega_dinheiro: 'Dinheiro na entrega',
  };

  const getStatusDetails = (status: OrderStatus, deliveryType: 'entrega' | 'retirada') => {
    switch (status as string) {
      case 'aguardando_confirmacao':
        return {
          label: 'Aguardando confirmação',
          bgClass: 'bg-amber-50 text-amber-800 border-amber-200/60',
          dotClass: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
        };
      case 'confirmado':
        return {
          label: 'Confirmado',
          bgClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/60',
          dotClass: 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'
        };
      case 'em_preparacao':
        return {
          label: 'Em preparação',
          bgClass: 'bg-blue-50 text-blue-800 border-blue-200/60',
          dotClass: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
        };
      case 'pronto':
        if (deliveryType === 'retirada') {
          return {
            label: 'Pronto para retirada',
            bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
            dotClass: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
          };
        }
        return {
          label: 'Pedido pronto',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
          dotClass: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
        };
      case 'pronto_retirada':
        return {
          label: 'Pronto para retirada',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
          dotClass: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
        };
      case 'saiu_entrega':
        return {
          label: 'Em entrega',
          bgClass: 'bg-orange-50 text-orange-800 border-orange-200/60',
          dotClass: 'bg-[#E94F2F] shadow-[0_0_8px_rgba(233,79,47,0.5)]'
        };
      case 'concluido':
        return {
          label: 'Concluído',
          bgClass: 'bg-gray-50 text-gray-700 border-gray-200/60',
          dotClass: 'bg-gray-400'
        };
      case 'recusado':
        return {
          label: 'Não confirmado',
          bgClass: 'bg-rose-50 text-rose-800 border-rose-200/60',
          dotClass: 'bg-rose-500'
        };
      case 'cancelado':
        return {
          label: 'Cancelado',
          bgClass: 'bg-rose-50 text-rose-800 border-rose-200/60',
          dotClass: 'bg-rose-500'
        };
      default:
        return {
          label: status,
          bgClass: 'bg-gray-50 text-gray-700 border-gray-200/60',
          dotClass: 'bg-gray-400'
        };
    }
  };

  const getActiveList = () => {
    switch (activeTab) {
      case 'active': return activeOrders;
      case 'completed': return completedOrders;
      case 'cancelled': return cancelledOrders;
      default: return activeOrders;
    }
  };

  const currentOrders = getActiveList();

  const handleRetry = () => {
    setHasError(false);
  };

  if (hasError) {
    return (
      <div className="bg-white p-8 sm:p-12 text-center rounded-3xl border border-[#EADFD8] shadow-sm space-y-5 max-w-lg mx-auto">
        <div className="bg-rose-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto text-rose-500 border border-rose-100 animate-bounce">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h4 className="font-extrabold text-lg text-[#201A17]">Não foi possível carregar seus pedidos</h4>
          <p className="text-xs sm:text-sm text-[#756B66] font-semibold max-w-sm mx-auto leading-relaxed">
            Tente novamente em alguns instantes.
          </p>
        </div>
        <button
          onClick={handleRetry}
          className="text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-5 py-3 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 inline-block"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4. CABEÇALHO DE MEUS PEDIDOS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#EADFD8]/60">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#E94F2F]/10 rounded-2xl text-[#E94F2F] shadow-xs">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-xl sm:text-2xl text-[#201A17] tracking-tight flex items-center gap-2">
              Meus Pedidos
            </h2>
            <p className="text-xs sm:text-sm text-[#756B66] font-semibold">
              Acompanhe suas compras, entregas e retiradas.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          aria-label="Voltar para a página inicial"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black text-[#5C534E] hover:text-[#201A17] hover:bg-[#F7F4EF] transition-all cursor-pointer border border-[#EADFD8] shadow-2xs shrink-0 self-start sm:self-center focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para o Início</span>
        </button>
      </div>

      {/* 5. FILTROS DOS PEDIDOS */}
      <div className="grid grid-cols-2 sm:flex sm:gap-2.5 gap-1.5 p-1 bg-[#F7F4EF]/80 rounded-xl border border-[#EADFD8]/40">
        {(['active', 'completed', 'cancelled'] as TabType[]).map((tab) => {
          const isActive = activeTab === tab;
          let count = 0;
          let label = '';
          
          if (tab === 'active') {
            count = activeOrders.length;
            label = 'Em andamento';
          } else if (tab === 'completed') {
            count = completedOrders.length;
            label = 'Concluídos';
          } else {
            count = cancelledOrders.length;
            label = 'Cancelados';
          }

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-pressed={isActive}
              className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg text-xs font-black transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20 ${
                tab === 'active' ? 'col-span-2 sm:col-span-1' : 'col-span-1'
              } ${
                isActive
                  ? 'bg-[#E94F2F] text-white shadow-sm'
                  : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
              }`}
            >
              <span className="whitespace-nowrap">{label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                isActive ? 'bg-white/25 text-white' : 'bg-[#EADFD8] text-[#5C534E]'
              }`}>
                {count > 99 ? '99+' : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 13. SKELETON LOADING AND CARDS LIST */}
      <div className="min-h-[30vh]">
        {isChanging ? (
          /* Loading states with beautiful card skeletons */
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div 
                key={i} 
                className="bg-white p-5 sm:p-6 rounded-2xl border border-[#EADFD8] shadow-2xs space-y-5 animate-pulse"
              >
                <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                  <div className="flex gap-2.5 items-center">
                    <div className="h-6 w-24 bg-gray-100 rounded-lg"></div>
                    <div className="h-6 w-32 bg-gray-100 rounded-lg"></div>
                  </div>
                  <div className="h-6 w-28 bg-gray-100 rounded-lg"></div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="h-12 w-12 rounded-full bg-gray-100 shrink-0"></div>
                  <div className="space-y-2.5 flex-1">
                    <div className="h-4 w-1/3 bg-gray-100 rounded"></div>
                    <div className="h-3 w-1/2 bg-gray-100 rounded"></div>
                    <div className="h-3 w-3/4 bg-gray-100 rounded"></div>
                  </div>
                </div>
                <div className="h-10 w-full bg-gray-50 rounded-xl pt-2"></div>
              </div>
            ))}
          </div>
        ) : currentOrders.length === 0 ? (
          /* 12. ESTADOS VAZIOS PREMIUM */
          <div className="bg-white p-10 sm:p-14 text-center rounded-3xl border border-[#EADFD8] shadow-xs space-y-5">
            <div className="bg-[#F7F4EF] w-16 h-16 rounded-full flex items-center justify-center mx-auto text-[#756B66] border border-[#EADFD8]/30">
              {activeTab === 'active' && <Bike className="w-7 h-7 text-[#E94F2F]" />}
              {activeTab === 'completed' && <CheckCircle2 className="w-7 h-7 text-emerald-600" />}
              {activeTab === 'cancelled' && <ShoppingBag className="w-7 h-7 text-rose-500" />}
            </div>
            
            <div className="space-y-2">
              <h4 className="font-extrabold text-[#201A17] text-base sm:text-lg">
                {activeTab === 'active' && 'Nenhum pedido em andamento'}
                {activeTab === 'completed' && 'Você ainda não concluiu pedidos'}
                {activeTab === 'cancelled' && 'Nenhum pedido cancelado'}
              </h4>
              <p className="text-xs sm:text-sm text-[#756B66] font-semibold max-w-sm mx-auto leading-relaxed">
                {activeTab === 'active' && 'Quando você fizer um pedido, poderá acompanhar todas as etapas por aqui.'}
                {activeTab === 'completed' && 'Seus pedidos finalizados aparecerão aqui.'}
                {activeTab === 'cancelled' && 'Seus pedidos cancelados ou não confirmados aparecerão aqui.'}
              </p>
            </div>

            {activeTab === 'active' && (
              <button
                onClick={() => navigate('/')}
                className="text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-5 py-3 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95 inline-block focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
              >
                Explorar estabelecimentos
              </button>
            )}
          </div>
        ) : (
          /* REDESIGNED PREMIUM CARDS LIST */
          <div className="space-y-5">
            {currentOrders.map((order) => {
              const statusInfo = getStatusDetails(order.status, order.deliveryType);
              const isOrderActive = !['concluido', 'recusado', 'cancelado'].includes(order.status);

              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/acompanhar-pedido/${order.id}`)}
                  className={`bg-white rounded-3xl border p-5 sm:p-6 transition-all duration-200 flex flex-col gap-5 cursor-pointer hover:bg-[#FDFBF7]/45 hover:shadow-xs ${
                    isOrderActive 
                      ? 'border-[#E94F2F]/45 shadow-sm shadow-[#E94F2F]/5 ring-1 ring-[#E94F2F]/20' 
                      : 'border-[#EADFD8] hover:border-[#756B66]/30 shadow-2xs'
                  }`}
                >
                  {/* CARD: TOPO */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3.5 border-b border-[#F7F4EF]">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-black text-[#201A17] text-[11px] sm:text-xs bg-[#F7F4EF] px-3 py-1 rounded-lg border border-[#EADFD8] uppercase">
                        Pedido #{order.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-[11px] sm:text-xs text-[#756B66] font-semibold flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formatOrderDateTime(order.createdAt)}</span>
                      </span>
                    </div>

                    {/* Status Badge */}
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${statusInfo.bgClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass} ${isOrderActive ? 'animate-pulse' : ''}`}></span>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* CARD: CONTEÚDO */}
                  <div className="flex items-start gap-4">
                    {/* Establishment Avatar Container */}
                    <div className="w-12 h-12 rounded-2xl bg-[#F7F4EF] border border-[#EADFD8]/40 flex items-center justify-center shrink-0 shadow-2xs">
                      <Store className="w-5 h-5 text-[#E94F2F]" />
                    </div>

                    <div className="flex-1 space-y-3 min-w-0">
                      <div>
                        <h4 className="font-black text-[#201A17] text-base leading-snug truncate">
                          {order.establishmentName}
                        </h4>
                        
                        {/* Delivery/Pickup Label with human terms */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-[#756B66] font-semibold">
                          <span className="flex items-center gap-1 text-[#E94F2F]">
                            {order.deliveryType === 'retirada' ? (
                              <>
                                <Store className="w-3.5 h-3.5" />
                                <span>Retirada no local</span>
                              </>
                            ) : (
                              <>
                                <Bike className="w-3.5 h-3.5" />
                                <span>Entrega rápida</span>
                              </>
                            )}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="text-[#5C534E]">
                            {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                      </div>

                      {/* Displaying client delivery/pickup address */}
                      <div className="bg-[#F7F4EF]/50 p-3 rounded-2xl border border-[#EADFD8]/30">
                        <p className="text-[11px] font-black text-[#756B66] uppercase tracking-wider mb-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#E94F2F]" />
                          <span>{order.deliveryType === 'retirada' ? 'Local para retirada' : 'Endereço para entrega'}</span>
                        </p>
                        
                        {order.deliveryType === 'retirada' ? (
                          <p className="text-xs text-[#201A17] font-semibold">
                            Retirar em: <span className="text-[#5C534E]">{order.establishmentName}</span>
                          </p>
                        ) : order.customerAddress ? (
                          <p className="text-xs text-[#5C534E] font-medium leading-relaxed">
                            {order.customerAddress.street}, {order.customerAddress.number}
                            {order.customerAddress.complement && ` (${order.customerAddress.complement})`}
                            {` • ${order.customerAddress.bairro || ''}`}
                          </p>
                        ) : (
                          <p className="text-xs text-[#756B66] font-medium italic">Endereço de entrega</p>
                        )}
                      </div>

                      {/* Ordered Items List */}
                      <div className="space-y-2 mt-3">
                        <p className="text-[10px] font-black uppercase text-[#756B66]/75 tracking-wider">Itens do Pedido</p>
                        <div className="space-y-2 divide-y divide-[#F7F4EF]/80 pl-1">
                          {order.items.map((rawItem, idx) => {
                            const item = normalizeOrderItem(rawItem);
                            return (
                              <div key={idx} className="pt-2 first:pt-0 text-xs flex flex-col gap-0.5">
                                <div className="flex items-center justify-between gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-[#E94F2F] bg-[#E94F2F]/10 px-2 py-0.5 rounded text-[10px] border border-[#E94F2F]/10">
                                      {item.quantity}x
                                    </span>
                                    <span className="font-extrabold text-[#201A17]">{item.productName}</span>
                                  </div>
                                  <span className="text-xs font-bold text-[#2F9E69] shrink-0">
                                    R$ {item.lineTotal.toFixed(2).replace('.', ',')}
                                  </span>
                                </div>
                                
                                {/* Details (size, crust, extras, notes) */}
                                <div className="pl-8 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[#756B66] font-medium">
                                  {item.selectedSize && (
                                    <span>Tamanho: <strong className="text-gray-700">{item.selectedSize.name}</strong></span>
                                  )}
                                  {item.selectedCrust && item.selectedCrust.name !== 'Sem borda' && (
                                    <span>• Borda: <strong className="text-gray-700">{item.selectedCrust.name}</strong></span>
                                  )}
                                  {item.selectedExtras.length > 0 && (
                                    <span>• Adicionais: <strong className="text-gray-700">{item.selectedExtras.map(e => `${e.name} (${e.quantity}x)`).join(', ')}</strong></span>
                                  )}
                                  {item.notes && (
                                    <span className="italic text-amber-700 font-bold bg-amber-50/70 border border-amber-100/50 px-2 py-0.5 rounded-md mt-1 w-full block">
                                      Obs: "{item.notes}"
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD: RESUMO & FOOTER ACTIONS */}
                  <div className="border-t border-[#F7F4EF] pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    {/* Summary (Payment, total value, estimates) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 justify-between md:justify-start">
                      {/* Total Value */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Valor Total</span>
                        <span className="text-lg font-black text-[#E94F2F]">
                          R$ {order.total.toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      {/* Payment info with friendly tags */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Pagamento</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[#201A17]">
                            {paymentMethodLabel[order.paymentMethod] || 'Forma de pagamento'}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                            order.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            {order.paymentStatus === 'paid' ? 'Pago Online' : 'Pagar na Entrega'}
                          </span>
                        </div>
                      </div>

                      {/* For active orders, show a standard forecast */}
                      {isOrderActive && (
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Previsão</span>
                          <span className="text-xs font-bold text-[#201A17] flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#E94F2F]" />
                            <span>30-45 min</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Footer buttons / actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                      {/* UNREAD CHAT MESSAGES INDICATOR */}
                      {order.chatUnreadCustomer !== undefined && order.chatUnreadCustomer > 0 && (
                        <span className="flex items-center gap-1 bg-orange-500 text-white text-[10px] font-black px-2.5 py-1.5 rounded-xl shadow-xs animate-pulse">
                          <MessageSquare className="w-3.5 h-3.5 fill-current shrink-0" />
                          <span>{order.chatUnreadCustomer} novas mensagens</span>
                        </span>
                      )}

                      {/* Primary Button */}
                      {isOrderActive ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/acompanhar-pedido/${order.id}`); }}
                          aria-label={`Acompanhar pedido número ${order.id}`}
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
                        >
                          <Bike className="w-4 h-4 shrink-0" />
                          <span>Acompanhar pedido</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/acompanhar-pedido/${order.id}`); }}
                          aria-label={`Ver detalhes do pedido número ${order.id}`}
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black text-[#5C534E] hover:text-[#201A17] hover:bg-[#F7F4EF] transition-all cursor-pointer border border-[#EADFD8] shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
                        >
                          <Receipt className="w-4 h-4 shrink-0 text-[#756B66]" />
                          <span>Ver detalhes</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
