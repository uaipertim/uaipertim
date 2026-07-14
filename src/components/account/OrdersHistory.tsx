import React, { useState } from 'react';
import { Order, OrderStatus } from '../../types';
import { Clipboard, MapPin, ShoppingBag, Calendar, CheckCircle2, Bike, HelpCircle, ArrowLeft } from 'lucide-react';
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

  const orderStatusLabel: Record<OrderStatus, string> = {
    aguardando_confirmacao: 'Aguardando Confirmação',
    confirmado: 'Confirmado',
    em_preparacao: 'Em Preparação',
    pronto: 'Pronto para Entrega',
    pronto_retirada: 'Pronto para Retirada',
    saiu_entrega: 'Saiu para Entrega',
    concluido: 'Entregue com Sucesso',
    recusado: 'Recusado'
  };

  const orderStatusColor: Record<OrderStatus, string> = {
    aguardando_confirmacao: 'bg-amber-50 text-amber-800 border-amber-200',
    confirmado: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    em_preparacao: 'bg-blue-50 text-blue-800 border-blue-200',
    pronto: 'bg-[#2F9E69]/10 text-[#2F9E69] border-[#2F9E69]/30',
    pronto_retirada: 'bg-green-50 text-green-800 border-green-200',
    saiu_entrega: 'bg-orange-50 text-orange-800 border-orange-200',
    concluido: 'bg-neutral-50 text-neutral-800 border-neutral-200',
    recusado: 'bg-rose-50 text-rose-800 border-rose-200',
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

  return (
    <div className="space-y-6">
      {/* Header and Back Button */}
      <div className="flex items-center justify-between pb-4 border-b border-[#EADFD8]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-orange-50 rounded-xl text-[#E94F2F]">
            <Clipboard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-[#201A17] tracking-tight">Meus Pedidos</h3>
            <p className="text-xs text-[#756B66] font-medium">Histórico completo de compras e entregas</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#756B66] hover:text-[#201A17] hover:bg-[#F7F4EF] transition-colors cursor-pointer border border-[#EADFD8]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar para o Início</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#EADFD8] gap-2 p-1 bg-[#F7F4EF] rounded-xl">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
            activeTab === 'active'
              ? 'bg-[#E94F2F] text-white shadow-xs'
              : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
          }`}
        >
          <span>Em andamento</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-[#EADFD8] text-[#756B66]'
          }`}>
            {activeOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
            activeTab === 'completed'
              ? 'bg-[#E94F2F] text-white shadow-xs'
              : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
          }`}
        >
          <span>Concluídos</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'completed' ? 'bg-white/20 text-white' : 'bg-[#EADFD8] text-[#756B66]'
          }`}>
            {completedOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cancelled')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
            activeTab === 'cancelled'
              ? 'bg-[#E94F2F] text-white shadow-xs'
              : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
          }`}
        >
          <span>Cancelados</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'cancelled' ? 'bg-white/20 text-white' : 'bg-[#EADFD8] text-[#756B66]'
          }`}>
            {cancelledOrders.length}
          </span>
        </button>
      </div>

      {/* List */}
      {currentOrders.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-[#EADFD8] shadow-xs space-y-4">
          <div className="bg-[#F7F4EF] w-12 h-12 rounded-full flex items-center justify-center mx-auto text-[#756B66]">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="font-extrabold text-sm text-[#201A17]">
              {activeTab === 'active' && 'Nenhum pedido em andamento'}
              {activeTab === 'completed' && 'Nenhum pedido concluído encontrado'}
              {activeTab === 'cancelled' && 'Nenhum pedido cancelado encontrado'}
            </p>
            <p className="text-xs text-[#756B66] font-semibold max-w-sm mx-auto leading-relaxed">
              {activeTab === 'active' && 'Você não possui pedidos sendo preparados ou entregues no momento.'}
              {activeTab === 'completed' && 'Os pedidos que você receber e concluir aparecerão nesta seção.'}
              {activeTab === 'cancelled' && 'Pedidos cancelados ou recusados pelo estabelecimento aparecem aqui.'}
            </p>
          </div>
          {activeTab === 'active' && (
            <button
              onClick={() => navigate('/')}
              className="text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm inline-block"
            >
              Explorar Cardápio
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {currentOrders.map((order) => {
            return (
              <div
                key={order.id}
                className="bg-white p-5 sm:p-6 rounded-2xl border border-[#EADFD8] shadow-xs hover:border-[#E94F2F]/30 transition-all flex flex-col gap-4"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-3 flex-1">
                    {/* ID, Date, and Status */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-black text-[#201A17] text-xs bg-[#F7F4EF] px-2.5 py-1 rounded-lg border border-[#EADFD8]">
                        Pedido #{order.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-xs text-[#5C534E] font-black uppercase tracking-wider bg-orange-50/50 px-2 py-1 rounded-lg border border-orange-100/50">
                        {order.establishmentName}
                      </span>
                      <span className="text-xs text-[#756B66] font-semibold flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formatOrderDateTime(order.createdAt)}</span>
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${orderStatusColor[order.status] || 'bg-neutral-100'}`}>
                        {orderStatusLabel[order.status] || order.status}
                      </span>
                    </div>

                    {/* Shipping & Items list */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-[#5C534E] flex items-center gap-1.5 leading-normal">
                        <MapPin className="w-4 h-4 text-[#E94F2F] shrink-0" />
                        <span>
                          {order.deliveryType === 'retirada' ? (
                            <strong className="text-amber-800">Retirada no estabelecimento</strong>
                          ) : order.customerAddress ? (
                            <span>
                              {order.customerAddress.street}, {order.customerAddress.number}
                              {order.customerAddress.complement && ` - ${order.customerAddress.complement}`}
                              {` • ${order.customerAddress.bairro || order.customerAddress.neighborhood || ''}`}
                            </span>
                          ) : (
                            <span>Endereço de entrega</span>
                          )}
                        </span>
                      </p>

                      <div className="text-xs text-[#756B66] font-semibold pl-5.5 space-y-1.5">
                        <p className="text-[10px] font-black uppercase text-[#756B66]/60 tracking-wider">Itens do Pedido</p>
                        {order.items.map((rawItem, i) => {
                          const item = normalizeOrderItem(rawItem);
                          return (
                            <div key={i} className="flex flex-col gap-0.5 text-gray-700">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-[#E94F2F] bg-orange-50 px-1.5 py-0.5 rounded text-[10px] border border-orange-100">
                                  {item.quantity}x
                                </span>
                                <span className="font-bold text-[#201A17]">{item.productName}</span>
                                <span className="text-xs font-bold text-[#2F9E69] ml-auto shrink-0">
                                  R$ {item.lineTotal.toFixed(2).replace('.', ',')}
                                </span>
                              </div>
                              <div className="pl-6 flex flex-wrap gap-x-2 text-[10px] text-[#756B66]">
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
                                  <span className="italic text-amber-700 font-medium w-full mt-0.5">Obs: "{item.notes}"</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Total Price and Payment Actions */}
                  <div className="flex md:flex-col justify-between items-end gap-3 text-right w-full md:w-auto shrink-0 border-t md:border-t-0 border-[#F7F4EF] pt-3 md:pt-0">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-black text-[#756B66] uppercase block">Valor Total</span>
                      <span className="text-base font-black text-[#201A17]">R$ {order.total.toFixed(2).replace('.', ',')}</span>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                        order.paymentStatus === 'paid'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {order.paymentStatus === 'paid' ? 'Pago Online' : 'Pagar na Entrega'}
                      </span>

                      {/* Active Order tracking button */}
                      {activeTab === 'active' && (
                        <button
                          onClick={() => navigate(`/acompanhar-pedido/${order.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E94F2F] text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          <Bike className="w-3.5 h-3.5 text-white shrink-0" />
                          <span>Acompanhar pedido</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
