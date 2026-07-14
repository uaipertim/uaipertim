import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ClipboardCheck, 
  CircleCheck, 
  CookingPot, 
  PackageCheck, 
  Bike, 
  BadgeCheck, 
  ShoppingBag, 
  Check, 
  AlertCircle,
  HelpCircle,
  Clock
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { useApp } from '../context/AppContext';
import { formatOrderDateTime, formatOrderTime, parseOrderDate } from '../utils/dateUtils';

interface OrderStatusTrackerProps {
  order: Order;
}

interface TrackerStep {
  status: OrderStatus;
  label: string;
  icon: React.ComponentType<any>;
}

const DELIVERY_STEPS: TrackerStep[] = [
  { status: 'aguardando_confirmacao', label: 'Pedido recebido', icon: ClipboardCheck },
  { status: 'confirmado', label: 'Confirmado', icon: CircleCheck },
  { status: 'em_preparacao', label: 'Em preparação', icon: CookingPot },
  { status: 'pronto', label: 'Pedido pronto', icon: PackageCheck },
  { status: 'saiu_entrega', label: 'Saiu para entrega', icon: Bike },
  { status: 'concluido', label: 'Concluído', icon: BadgeCheck }
];

const COLLECTION_STEPS: TrackerStep[] = [
  { status: 'aguardando_confirmacao', label: 'Pedido recebido', icon: ClipboardCheck },
  { status: 'confirmado', label: 'Confirmado', icon: CircleCheck },
  { status: 'em_preparacao', label: 'Em preparação', icon: CookingPot },
  { status: 'pronto_retirada', label: 'Pronto para retirada', icon: ShoppingBag },
  { status: 'concluido', label: 'Retirado', icon: BadgeCheck }
];

export const OrderStatusTracker: React.FC<OrderStatusTrackerProps> = ({ order }) => {
  const isDelivery = order.deliveryType === 'entrega';
  const steps = isDelivery ? DELIVERY_STEPS : COLLECTION_STEPS;
  
  const isRefused = order.status === 'recusado';
  
  const currentStepIndex = isRefused 
    ? -1 
    : steps.findIndex(s => s.status === order.status);

  const getStepState = (idx: number) => {
    if (isRefused) return 'refused';
    if (idx < currentStepIndex) return 'completed';
    if (idx === currentStepIndex) return 'current';
    return 'future';
  };

  const getStepTime = (status: OrderStatus, index: number) => {
    const entry = order.statusHistory?.find(h => h.status === status);
    if (entry) {
      const d = new Date(entry.timestamp);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    }
    
    if (index === 0 && order.createdAt) {
      return formatOrderTime(order.createdAt);
    }
    
    return null;
  };

  const progressPercent = currentStepIndex >= 0 
    ? (currentStepIndex / (steps.length - 1)) * 100 
    : 0;

  const getContextualMessage = () => {
    if (isRefused) {
      return {
        title: 'Pedido recusado ou cancelado',
        description: 'Infelizmente, o estabelecimento não pôde aceitar seu pedido neste momento. O estorno do pagamento (caso tenha sido feito por Pix) é processado automaticamente. Se precisar de ajuda, fale com o nosso suporte.',
        bg: 'bg-red-50 border-red-100',
        textTitle: 'text-red-900',
        textDesc: 'text-red-700',
        icon: AlertCircle,
        iconColor: 'text-red-600',
        iconBg: 'bg-red-100'
      };
    }

    switch (order.status) {
      case 'aguardando_confirmacao':
        return {
          title: 'Recebemos seu pedido!',
          description: `O estabelecimento ${order.establishmentName} foi notificado e está revisando os detalhes para confirmar seu pedido em instantes.`,
          bg: 'bg-amber-50 border-amber-200',
          textTitle: 'text-[#201A17]',
          textDesc: 'text-[#756B66]',
          icon: ClipboardCheck,
          iconColor: 'text-[#E94F2F]',
          iconBg: 'bg-[#E94F2F]/10'
        };
      case 'confirmado':
        return {
          title: 'Seu pedido foi confirmado!',
          description: `A equipe de ${order.establishmentName} já confirmou seu pedido e está organizando a cozinha para iniciar o preparo.`,
          bg: 'bg-[#2F9E69]/5 border-[#2F9E69]/20',
          textTitle: 'text-[#201A17]',
          textDesc: 'text-[#756B66]',
          icon: CircleCheck,
          iconColor: 'text-[#2F9E69]',
          iconBg: 'bg-[#2F9E69]/10'
        };
      case 'em_preparacao':
        return {
          title: 'Seu pedido está sendo preparado',
          description: 'A cozinha já iniciou o preparo dos seus itens com ingredientes fresquinhos. Em breve ficará pronto para o próximo passo!',
          bg: 'bg-orange-50 border-orange-100',
          textTitle: 'text-[#201A17]',
          textDesc: 'text-[#756B66]',
          icon: CookingPot,
          iconColor: 'text-[#E94F2F]',
          iconBg: 'bg-[#E94F2F]/10'
        };
      case 'pronto':
        return {
          title: 'Seu pedido está pronto!',
          description: 'Tudo pronto e embalado com cuidado na temperatura certa. Agora ele está sendo encaminhado ao entregador parceiro.',
          bg: 'bg-[#2F9E69]/5 border-[#2F9E69]/20',
          textTitle: 'text-[#201A17]',
          textDesc: 'text-[#756B66]',
          icon: PackageCheck,
          iconColor: 'text-[#2F9E69]',
          iconBg: 'bg-[#2F9E69]/10'
        };
      case 'pronto_retirada':
        return {
          title: 'Seu pedido está pronto para retirada!',
          description: `Tudo pronto! Você já pode ir até o estabelecimento ${order.establishmentName} para retirar seu pedido quentinho.`,
          bg: 'bg-green-50 border-green-200',
          textTitle: 'text-green-900',
          textDesc: 'text-green-800',
          icon: ShoppingBag,
          iconColor: 'text-[#2F9E69]',
          iconBg: 'bg-[#2F9E69]/10'
        };
      case 'saiu_entrega':
        return {
          title: 'Seu pedido está a caminho!',
          description: 'O entregador parceiro já retirou seu pacote e está a caminho do seu endereço. Prepare-se para receber sua entrega!',
          bg: 'bg-orange-50 border-orange-100',
          textTitle: 'text-[#201A17]',
          textDesc: 'text-[#756B66]',
          icon: Bike,
          iconColor: 'text-[#E94F2F]',
          iconBg: 'bg-[#E94F2F]/10'
        };
      case 'concluido':
        return {
          title: order.deliveryType === 'entrega' ? 'Pedido entregue!' : 'Pedido retirado!',
          description: 'Esperamos que você aproveite sua refeição! Se gostou, lembre-se de avaliar a loja e apoiar o comércio mineiro de nossa cidade.',
          bg: 'bg-green-50 border-green-100',
          textTitle: 'text-green-950',
          textDesc: 'text-green-800',
          icon: BadgeCheck,
          iconColor: 'text-[#2F9E69]',
          iconBg: 'bg-[#2F9E69]/15'
        };
      default:
        return {
          title: 'Acompanhando seu pedido',
          description: 'Atualizações em tempo real enviadas diretamente pelo estabelecimento comercial.',
          bg: 'bg-[#F7F4EF] border-[#EADFD8]',
          textTitle: 'text-[#201A17]',
          textDesc: 'text-[#756B66]',
          icon: HelpCircle,
          iconColor: 'text-[#756B66]',
          iconBg: 'bg-[#EADFD8]'
        };
    }
  };

  const msg = getContextualMessage();
  const MsgIcon = msg.icon;
  const { userProfile } = useApp();

  const getForecastText = () => {
    if (isRefused) return 'Cancelado';
    if (order.status === 'concluido') return 'Entregue com sucesso';
    
    const date = parseOrderDate(order.createdAt);
    if (isNaN(date.getTime())) return '';
    
    if (order.deliveryType === 'entrega') {
      const minDate = new Date(date.getTime() + 35 * 60 * 1000);
      const maxDate = new Date(date.getTime() + 50 * 60 * 1000);
      const formatTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      return `Previsão de entrega: ${formatTime(minDate)} – ${formatTime(maxDate)}`;
    } else {
      const readyDate = new Date(date.getTime() + 20 * 60 * 1000);
      const formatTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      return `Previsão para retirada: ${formatTime(readyDate)}`;
    }
  };

  return (
    <div className="space-y-6" aria-label="Rastreador de Status do Pedido">
      
      {/* 1. Contextual Status Message Card with estimate */}
      <div className={`p-5 rounded-2xl border ${msg.bg} shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${msg.iconBg} ${msg.iconColor} shrink-0 mt-0.5 md:mt-0`}>
            <MsgIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className={`text-base font-black ${msg.textTitle} tracking-tight`}>
              {msg.title}
            </h4>
            <p className={`text-xs font-semibold leading-relaxed max-w-xl ${msg.textDesc}`}>
              {msg.description}
            </p>
          </div>
        </div>

        {!isRefused && order.status !== 'concluido' && (
          <div className="shrink-0 bg-white border border-[#EADFD8] px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs self-start md:self-auto">
            <Clock className="w-4 h-4 text-[#E94F2F]" />
            <div className="text-left">
              <p className="text-[9px] text-[#756B66] uppercase font-extrabold tracking-wider leading-none">Estimativa</p>
              <p className="text-xs font-black text-[#201A17] mt-0.5">{getForecastText()}</p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Premium Tracker Visual Representation */}
      <div className="hidden sm:block relative py-6 bg-white border border-[#EADFD8] rounded-2xl p-6 shadow-xs">
        <div className="absolute top-[52px] left-8 right-8 h-1 bg-[#EADFD8] rounded-full z-0" />
        <motion.div 
          className="absolute top-[52px] left-8 h-1 bg-[#2F9E69] rounded-full z-0 origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progressPercent / 100 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ right: '32px', width: 'auto' }}
        />
        <div className="relative z-10 flex justify-between items-start gap-2">
          {steps.map((step, idx) => {
            const state = getStepState(idx);
            const time = getStepTime(step.status, idx);
            const StepIcon = step.icon;

            return (
              <div 
                key={step.status} 
                className="flex-1 flex flex-col items-center text-center space-y-2.5 min-w-[70px]"
              >
                <div className="relative">
                  {state === 'completed' && (
                    <div className="w-10 h-10 rounded-full bg-[#2F9E69] text-white flex items-center justify-center shadow-sm">
                      <Check className="w-5 h-5 stroke-[3]" />
                    </div>
                  )}

                  {state === 'current' && (
                    <motion.div 
                      className="w-10 h-10 rounded-full bg-[#E94F2F] text-white flex items-center justify-center shadow-md ring-4 ring-[#E94F2F]/20 relative"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                    >
                      <StepIcon className="w-5 h-5" />
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E94F2F] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E94F2F]"></span>
                      </span>
                    </motion.div>
                  )}

                  {state === 'future' && (
                    <div className="w-10 h-10 rounded-full bg-[#F7F4EF] border border-[#DED4CE] text-[#8A7F79] flex items-center justify-center">
                      <StepIcon className="w-4 h-4 opacity-50" />
                    </div>
                  )}

                  {state === 'refused' && (
                    <div className="w-10 h-10 rounded-full bg-red-100 border border-red-200 text-red-500 flex items-center justify-center">
                      <StepIcon className="w-4 h-4 opacity-40" />
                    </div>
                  )}
                </div>

                <div className="space-y-0.5 px-1">
                  <p className={`text-xs leading-tight transition-colors duration-300 ${
                    state === 'current' 
                      ? 'font-black text-[#E94F2F]' 
                      : state === 'completed' 
                        ? 'font-extrabold text-[#201A17]' 
                        : 'font-semibold text-[#8A7F79]'
                  }`}>
                    {step.label}
                  </p>
                  
                  {state === 'completed' && time && (
                    <p className="text-[10px] font-bold text-[#756B66]">{time}</p>
                  )}
                  {state === 'current' && (
                    <p className="text-[10px] font-black text-[#E94F2F] animate-pulse">Agora</p>
                  )}
                  {state === 'future' && (
                    <p className="text-[10px] font-bold text-[#8A7F79] opacity-40">--:--</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* B: Mobile Vertical Timeline */}
      <div className="block sm:hidden bg-white border border-[#EADFD8] rounded-2xl p-5 shadow-xs relative">
        <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider mb-5">
          Passo a passo do pedido
        </h4>
        
        <div className="relative pl-7 space-y-6">
          <div className="absolute top-4 bottom-4 left-3 w-1 bg-[#EADFD8] -translate-x-1/2 z-0 rounded-full" />
          
          {currentStepIndex > 0 && (
            <motion.div 
              className="absolute top-4 left-3 w-1 bg-[#2F9E69] -translate-x-1/2 z-0 rounded-full origin-top"
              initial={{ scaleY: 0 }}
              animate={{ 
                scaleY: currentStepIndex / (steps.length - 1) 
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{ 
                bottom: `${100 - (currentStepIndex / (steps.length - 1)) * 100}%`,
                height: 'auto'
              }}
            />
          )}

          {steps.map((step, idx) => {
            const state = getStepState(idx);
            const time = getStepTime(step.status, idx);
            const StepIcon = step.icon;

            return (
              <div key={step.status} className="flex items-start gap-4 relative z-10">
                <div className="absolute -left-7 mt-0.5">
                  {state === 'completed' && (
                    <div className="w-6 h-6 rounded-full bg-[#2F9E69] text-white flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}

                  {state === 'current' && (
                    <motion.div 
                      className="w-6 h-6 rounded-full bg-[#E94F2F] text-white flex items-center justify-center shadow-xs ring-4 ring-[#E94F2F]/25"
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                    >
                      <StepIcon className="w-3.5 h-3.5" />
                    </motion.div>
                  )}

                  {state === 'future' && (
                    <div className="w-6 h-6 rounded-full bg-[#F7F4EF] border border-[#DED4CE] text-[#8A7F79] flex items-center justify-center bg-white">
                      <StepIcon className="w-2.5 h-2.5 opacity-50" />
                    </div>
                  )}

                  {state === 'refused' && (
                    <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 text-red-500 flex items-center justify-center bg-white">
                      <StepIcon className="w-2.5 h-2.5 opacity-40" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-xs transition-colors duration-300 ${
                      state === 'current' 
                        ? 'font-black text-[#E94F2F]' 
                        : state === 'completed' 
                          ? 'font-extrabold text-[#201A17]' 
                          : 'font-semibold text-[#8A7F79]'
                    }`}>
                      {step.label}
                    </p>
                    
                    {state === 'completed' && time && (
                      <span className="text-[10px] font-bold text-[#756B66]">{time}</span>
                    )}
                    {state === 'current' && (
                      <span className="text-[9px] font-black text-white bg-[#E94F2F] px-1.5 py-0.5 rounded-full animate-pulse uppercase">
                        Agora
                      </span>
                    )}
                  </div>

                  {state === 'current' && (
                    <p className="text-[11px] font-medium text-[#756B66] mt-0.5 leading-tight">
                      {msg.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {order.statusHistory && order.statusHistory.length > 0 && (
        <div id="status-history-audit-trail" className="bg-white border border-[#EADFD8] rounded-2xl p-5 shadow-xs space-y-4">
          <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">
            Histórico e Auditoria do Pedido
          </h4>
          <div className="space-y-3">
            {order.statusHistory.map((historyEntry, idx) => {
              const date = new Date(historyEntry.timestamp);
              const formattedTime = formatOrderDateTime(historyEntry.timestamp);
              
              const statusLabels: Record<OrderStatus, string> = {
                aguardando_confirmacao: 'Aguardando Confirmação',
                confirmado: 'Confirmado',
                em_preparacao: 'Em Preparação',
                pronto: 'Pronto para Entrega',
                pronto_retirada: 'Pronto para Retirada',
                saiu_entrega: 'Saiu para Entrega',
                concluido: 'Concluído',
                recusado: 'Recusado'
              };

              const roleLabel = historyEntry.changedByRole === 'admin' ? 'Administrador' : 'Estabelecimento';
              const roleBadgeColor = historyEntry.changedByRole === 'admin' 
                ? 'bg-[#E94F2F]/10 text-[#E94F2F]' 
                : 'bg-amber-100 text-amber-800';

              return (
                <div key={idx} className="flex items-start gap-3 border-b border-[#F7F4EF] pb-3 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-[#EADFD8] mt-2 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-[#201A17]">
                        {statusLabels[historyEntry.status] || historyEntry.status}
                      </span>
                      <span className={`text-[9px] uppercase font-extrabold px-2 py-0.5 rounded-full ${roleBadgeColor}`}>
                        {roleLabel}
                      </span>
                      <span className="text-[10px] font-semibold text-[#8A7F79] ml-auto">
                        {formattedTime}
                      </span>
                    </div>
                    {historyEntry.note && (
                      <p className="text-xs italic bg-[#F7F4EF] text-[#5C524D] px-3 py-2 rounded-lg border-l-2 border-[#E94F2F] mt-1 font-medium leading-relaxed">
                        &ldquo;{historyEntry.note}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
