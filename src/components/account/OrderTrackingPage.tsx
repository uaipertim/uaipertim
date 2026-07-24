import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../hooks/useAuth';
import { Bike, ArrowLeft, Calendar, MapPin, ShoppingBag, Loader2, MessageSquare } from 'lucide-react';
import { normalizeOrderItem } from '../../utils/orderCalculation';
import { OrderStatusTracker } from '../OrderStatusTracker';
import { PremiumOrderChat } from '../order-chat/PremiumOrderChat';
import { formatOrderDateTime } from '../../utils/dateUtils';
import { orderService } from '../../services/orderService';
import { Order } from '../../types/order';

export const OrderTrackingPage: React.FC = () => {
  const { orders, ordersLoading } = useApp();
  const { currentUser, userProfile } = useAuth();
  const [path, navigate] = useLocation();
  const [chatOpen, setChatOpen] = useState(false);
  const [localOrder, setLocalOrder] = useState<Order | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  // Extract orderId from path /acompanhar-pedido/:orderId
  const orderId = path.split('/acompanhar-pedido/')[1];

  // Find the selected order
  const globalOrder = orders.find(o => o.id === orderId || o.id.toLowerCase() === orderId?.toLowerCase());

  useEffect(() => {
    if (!orderId) {
      setLocalLoading(false);
      return;
    }
    setLocalLoading(true);
    const unsubscribe = orderService.subscribeToOrder(orderId, (fetchedOrder) => {
      setLocalOrder(fetchedOrder);
      setLocalLoading(false);
    });
    return () => unsubscribe();
  }, [orderId]);

  const order = globalOrder || localOrder;

  const [searchParams, setSearchParams] = useState(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''));
  const [highlightMessageId, setHighlightMessageId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleUrlChange = () => {
      setSearchParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('pushstate-changed', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('pushstate-changed', handleUrlChange);
    };
  }, []);

  // Auto-open chat if directed by notification deep link (e.g., ?chat=true)
  useEffect(() => {
    const chatParam = searchParams.get('chat');
    const openChatParam = searchParams.get('openChat');
    const msgIdParam = searchParams.get('messageId') || searchParams.get('eventId');
    
    if (chatParam === 'true' || openChatParam === 'true') {
      if (msgIdParam) {
        setHighlightMessageId(msgIdParam);
      }
      setChatOpen(true);
      
      // Clean query params immediately so reload/back doesn't keep opening it
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams]);

  // Handle loading state
  if (ordersLoading && localLoading && !order) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-[#E94F2F] animate-spin" />
        <p className="text-sm font-bold text-[#756B66]">Carregando detalhes do rastreamento...</p>
      </div>
    );
  }

  // Handle access/ownership check
  const isOwner = currentUser && order && (order.customerId === currentUser.uid);
  const isMerchantOfThisOrder = currentUser && userProfile && userProfile.role === 'merchant' && userProfile.establishmentId === order?.establishmentId;
  const isAdmin = currentUser && userProfile && userProfile.role === 'admin';
  const hasAccess = isOwner || isMerchantOfThisOrder || isAdmin;
  const canViewPushDiagnostics = !!((import.meta as any).env?.DEV && isAdmin);

  if (order && !hasAccess) {
    return (
      <div className="max-w-2xl mx-auto my-12 px-4">
        <div className="bg-white p-12 text-center rounded-3xl border border-[#EADFD8] shadow-xs space-y-5">
          <div className="bg-rose-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto text-rose-500 border border-rose-100">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h3 className="font-extrabold text-lg text-[#201A17]">Acesso não autorizado</h3>
            <p className="text-xs text-[#756B66] font-semibold max-w-md mx-auto leading-relaxed">
              Este pedido pertence a outra conta. Você não possui permissão para visualizar estes detalhes de rastreamento.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => navigate('/')}
              className="text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-5 py-3 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Início</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle order not found
  if (!order) {
    return (
      <div className="max-w-2xl mx-auto my-12 px-4">
        <div className="bg-white p-12 text-center rounded-3xl border border-[#EADFD8] shadow-xs space-y-5">
          <div className="bg-rose-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto text-rose-500 border border-rose-100">
            <Bike className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h3 className="font-extrabold text-lg text-[#201A17]">Pedido não encontrado</h3>
            <p className="text-xs text-[#756B66] font-semibold max-w-md mx-auto leading-relaxed">
              Não encontramos o código do pedido <strong>"{orderId}"</strong> ou ele pode não pertencer ao seu perfil ativo. Verifique o histórico de pedidos.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => navigate('/meus-pedidos')}
              className="text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-5 py-3 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ver Meus Pedidos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 py-8">
      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#EADFD8]">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => navigate('/meus-pedidos')}
            className="p-2 bg-white border border-[#EADFD8] hover:bg-[#F7F4EF] rounded-xl text-[#756B66] hover:text-[#201A17] transition-all cursor-pointer"
            title="Voltar para Meus Pedidos"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-black text-xl text-[#201A17] tracking-tight">Acompanhar Pedido</h2>
            <p className="text-xs text-[#756B66] font-semibold">Status e rastreamento em tempo real</p>
          </div>
        </div>

        <button
          onClick={() => setChatOpen(true)}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all cursor-pointer border shadow-sm active:scale-95 ${
            (order.chatUnreadCustomer ?? 0) > 0 
              ? 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C]'
              : 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C]'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-white" />
          <span>Falar com a loja</span>
          {(order.chatUnreadCustomer ?? 0) > 0 && (
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
          )}
        </button>
      </div>

      {chatOpen && (
        <PremiumOrderChat
          order={order}
          viewerRole="customer"
          onClose={() => {
            setChatOpen(false);
            setHighlightMessageId(undefined);
          }}
          highlightMessageId={highlightMessageId}
        />
      )}

      {/* Main Grid: Left is tracker, Right is details summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Real-time Status Tracker (Columns 1 and 2) */}
        <div className="lg:col-span-2 space-y-6">
          <OrderStatusTracker order={order} />

          {/* Visual Diagnostic Panel for Admin/Development */}
          {order.pushDiagnostic && canViewPushDiagnostics && (
            <div id="order-push-diagnostic-panel" className="bg-[#F8FAFC] border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                <h4 className="font-extrabold text-slate-800 text-sm tracking-tight uppercase">
                  Push do Novo Pedido (Painel de Diagnóstico)
                </h4>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-semibold text-slate-600">
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5">
                    <span className="text-slate-400">Pedido persistido:</span>
                    <span className="font-black text-emerald-600">{order.pushDiagnostic.persisted ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5">
                    <span className="text-slate-400">Loja resolvida:</span>
                    <span className="font-black text-emerald-600">{order.pushDiagnostic.establishmentResolved ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5">
                    <span className="text-slate-400">Proprietário resolvido:</span>
                    <span className="font-black text-emerald-600">{order.pushDiagnostic.ownerResolved ? 'Sim' : 'Não'}</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5">
                    <span className="text-slate-400">Dispositivos ativos:</span>
                    <span className="font-black text-indigo-600">{order.pushDiagnostic.activeSubscriptionsCount}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5">
                    <span className="text-slate-400">Sucessos FCM:</span>
                    <span className="font-black text-emerald-600">{order.pushDiagnostic.fcmSuccessCount}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5">
                    <span className="text-slate-400">Falhas FCM:</span>
                    <span className="font-black text-rose-600">{order.pushDiagnostic.fcmFailureCount}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-100/70 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700">
                <span>Resultado:</span>
                <span className="px-1.5 py-0.5 font-black rounded bg-slate-200 text-slate-800 font-mono text-[10px]">
                  {order.pushDiagnostic.resultCode}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Order Info & Items Card (Column 3) */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#EADFD8] shadow-xs p-5 space-y-4">
            <h3 className="font-black text-xs text-[#756B66] uppercase tracking-wider border-b border-[#F7F4EF] pb-3">
              Resumo do Pedido
            </h3>

            {/* Establishment info */}
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-[#756B66]/60 tracking-wider">Estabelecimento</p>
              <p className="text-sm font-black text-[#201A17]">{order.establishmentName}</p>
              <div className="text-[10px] text-[#756B66] font-semibold flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{formatOrderDateTime(order.createdAt)}</span>
              </div>
            </div>

            {/* Address / Delivery type */}
            <div className="space-y-1 border-t border-[#F7F4EF] pt-3">
              <p className="text-[10px] font-black uppercase text-[#756B66]/60 tracking-wider">Entrega</p>
              {order.deliveryType === 'retirada' ? (
                <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Retirada no Estabelecimento</span>
                </p>
              ) : order.customerAddress ? (
                <p className="text-xs font-semibold text-[#5C534E] flex items-start gap-1.5 leading-normal">
                  <MapPin className="w-3.5 h-3.5 text-[#E94F2F] shrink-0 mt-0.5" />
                  <span>
                    {order.customerAddress.street}, {order.customerAddress.number}
                    {order.customerAddress.complement && ` - ${order.customerAddress.complement}`}
                    <br />
                    <span className="text-[10px] text-[#756B66]/80 font-bold uppercase">
                      {order.customerAddress.bairro || order.customerAddress.neighborhood || ''}
                    </span>
                  </span>
                </p>
              ) : (
                <p className="text-xs font-semibold text-[#756B66]">Retirada ou Entrega</p>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2 border-t border-[#F7F4EF] pt-3">
              <p className="text-[10px] font-black uppercase text-[#756B66]/60 tracking-wider">Itens</p>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {order.items.map((rawItem, i) => {
                  const item = normalizeOrderItem(rawItem);
                  return (
                    <div key={i} className="text-xs space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-[#E94F2F] bg-orange-50 px-1 py-0.5 rounded text-[10px]">
                          {item.quantity}x
                        </span>
                        <span className="font-bold text-[#201A17] truncate max-w-[140px]">{item.productName}</span>
                        <span className="font-bold text-[#756B66] ml-auto">
                          R$ {item.lineTotal.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div className="pl-6 text-[9px] text-[#756B66] leading-tight">
                        {item.selectedSize && <span>Tam: {item.selectedSize.name} </span>}
                        {item.selectedCrust && item.selectedCrust.name !== 'Sem borda' && <span>• Borda: {item.selectedCrust.name} </span>}
                        {item.selectedExtras.length > 0 && (
                          <span>• +{item.selectedExtras.length} adic.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total / Payment status */}
            <div className="border-t border-[#F7F4EF] pt-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-[#756B66]/60 tracking-wider">Total</p>
                <p className="text-base font-black text-[#201A17]">R$ {order.total.toFixed(2).replace('.', ',')}</p>
              </div>

              <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                order.paymentStatus === 'paid'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {order.paymentStatus === 'paid' ? 'Pago Online' : 'Pagar na Entrega'}
              </span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
