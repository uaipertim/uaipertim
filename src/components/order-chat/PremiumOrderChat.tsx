import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, MessageSquare, AlertCircle, ChevronDown, Calendar, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToOrderMessages, sendOrderMessage } from '../../services/orderChatService';
import { OrderChatMessage } from '../../types/orderChat';
import { Order } from '../../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface PremiumOrderChatProps {
  order: Order;
  viewerRole: "customer" | "merchant";
  onClose: () => void;
}

const orderStatusLabel: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando Confirmação',
  confirmado: 'Confirmado',
  em_preparacao: 'Em Preparação',
  pronto: 'Pronto para Entrega',
  pronto_retirada: 'Pronto para Retirada',
  saiu_entrega: 'Saiu para Entrega',
  concluido: 'Entregue com Sucesso',
  recusado: 'Recusado'
};

const orderStatusColor: Record<string, string> = {
  aguardando_confirmacao: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmado: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  em_preparacao: 'bg-blue-50 text-blue-800 border-blue-200',
  pronto: 'bg-teal-50 text-teal-800 border-teal-200',
  pronto_retirada: 'bg-green-50 text-green-800 border-green-200',
  saiu_entrega: 'bg-orange-50 text-orange-800 border-orange-200',
  concluido: 'bg-neutral-50 text-neutral-800 border-neutral-200',
  recusado: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const PremiumOrderChat: React.FC<PremiumOrderChatProps> = ({ order, viewerRole, onClose }) => {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const originalFocusRef = useRef<HTMLElement | null>(null);

  // Focus management & Escape key to close
  useEffect(() => {
    if (typeof document !== 'undefined') {
      originalFocusRef.current = document.activeElement as HTMLElement;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (originalFocusRef.current && typeof originalFocusRef.current.focus === 'function') {
        originalFocusRef.current.focus();
      }
    };
  }, [onClose]);

  // Mark unread messages as read
  useEffect(() => {
    async function markAsRead() {
      try {
        if (viewerRole === 'merchant' && (order.chatUnreadMerchant ?? 0) > 0) {
          await updateDoc(doc(db, 'orders', order.id), { chatUnreadMerchant: 0 });
        } else if (viewerRole === 'customer' && (order.chatUnreadCustomer ?? 0) > 0) {
          await updateDoc(doc(db, 'orders', order.id), { chatUnreadCustomer: 0 });
        }
      } catch (e) {
        console.error("CHAT_MARK_READ_ERROR", e);
      }
    }
    markAsRead();
  }, [viewerRole, order.id, order.chatUnreadMerchant, order.chatUnreadCustomer]);

  // Subscribe to real-time messages
  useEffect(() => {
    const unsubscribe = subscribeToOrderMessages(
      order.id,
      (msgs) => {
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Não foi possível carregar o histórico do chat.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [order.id]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollButton(false);
  };

  // Scroll logic on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    
    const container = scrollRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.senderRole === viewerRole;

    if (isAtBottom || isMine || messages.length === 1) {
      setTimeout(() => {
        scrollToBottom(messages.length === 1 ? 'auto' : 'smooth');
      }, 60);
    } else {
      setShowScrollButton(true);
    }
  }, [messages, viewerRole]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isAtBottom && showScrollButton) {
      setShowScrollButton(false);
    }
  };

  // Send message
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendOrderMessage(order.id, trimmed);
      setText(''); // Only clear on absolute success as requested
    } catch (err: any) {
      console.error(err);
      setError("Falha ao enviar mensagem. Verifique a conexão.");
    } finally {
      setSending(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Format date separators
  const getDateLabel = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    } else {
      return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  };

  const formatMessageTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const isConsecutive = (current: OrderChatMessage, prev: OrderChatMessage | undefined) => {
    if (!prev) return false;
    if (current.senderRole !== prev.senderRole) return false;
    const currentMs = current.createdAt?.seconds ? current.createdAt.seconds * 1000 : new Date(current.createdAt).getTime();
    const prevMs = prev.createdAt?.seconds ? prev.createdAt.seconds * 1000 : new Date(prev.createdAt).getTime();
    return Math.abs(currentMs - prevMs) < 2 * 60 * 1000; // 2 minutes
  };

  const formattedOrderId = order.id.startsWith('#') ? order.id : `#${order.id.slice(-6).toUpperCase()}`;
  const otherPartyName = viewerRole === 'customer' ? (order.establishmentName || 'Estabelecimento') : (order.customerName || 'Cliente');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-[#1A1513]/40 backdrop-blur-[1.5px] z-[100] flex justify-end"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="bg-[#FCFBF9] w-full md:max-w-[460px] h-full flex flex-col shadow-2xl md:border-l border-[#F0ECE3] relative pb-safe"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho Premium */}
          <div className="p-4 border-b border-[#F0ECE3] bg-white flex items-center justify-between sticky top-0 z-10 shadow-xs">
            <div className="flex items-center gap-3">
              {viewerRole === 'customer' ? (
                <div className="w-10 h-10 rounded-full bg-[#E94F2F]/10 text-[#E94F2F] flex items-center justify-center border border-[#E94F2F]/20 font-black">
                  {getInitials(otherPartyName)}
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 font-bold">
                  {getInitials(otherPartyName)}
                </div>
              )}
              
              <div className="min-w-0">
                <h2 className="font-extrabold text-sm text-[#201A17] truncate leading-tight">{otherPartyName}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-[#756B66] font-bold">{formattedOrderId}</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${orderStatusColor[order.status] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {orderStatusLabel[order.status] || order.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                aria-label="Ver pedido"
                className="text-[11px] font-bold text-[#E94F2F] hover:bg-[#E94F2F]/5 px-2.5 py-1.5 rounded-lg transition-colors border border-transparent hover:border-[#E94F2F]/15"
              >
                Ver pedido
              </button>
              <button
                onClick={onClose}
                aria-label="Fechar chat"
                className="p-2 hover:bg-[#F7F4EF] rounded-full transition-colors text-[#756B66] hover:text-[#201A17]"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Contexto do Pedido (Compact Summary Ribbon) */}
          <div className="bg-[#F7F4EF] border-b border-[#EADFD8] px-4 py-2 flex items-center justify-between text-[11px] text-[#756B66] font-semibold">
            <span className="flex items-center gap-1">
              <span className="font-bold text-[#201A17]">Total:</span> R$ {order.total.toFixed(2).replace('.', ',')}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#EADFD8]" />
            <span className="flex items-center gap-1">
              <span className="font-bold text-[#201A17]">Serviço:</span> {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
            </span>
            {order.deliveryFee > 0 && order.deliveryType === 'entrega' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#EADFD8]" />
                <span className="flex items-center gap-1">
                  <span className="font-bold text-[#201A17]">Taxa:</span> R$ {order.deliveryFee.toFixed(2).replace('.', ',')}
                </span>
              </>
            )}
          </div>

          {/* Área de Mensagens */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF8F5] relative scroll-smooth"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {loading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-[#E94F2F]" size={24} />
              </div>
            )}

            {messages.length === 0 && !loading && (
              <div className="h-full max-h-[380px] flex flex-col items-center justify-center text-center p-6 my-auto">
                <div className="w-14 h-14 bg-[#E94F2F]/5 rounded-full flex items-center justify-center mb-4 border border-[#E94F2F]/10">
                  <MessageSquare size={24} className="text-[#E94F2F]" />
                </div>
                <h3 className="font-extrabold text-[#201A17] text-sm mb-1.5">Converse sobre este pedido</h3>
                <p className="text-xs text-[#756B66] font-medium max-w-[280px] leading-relaxed">
                  Use este canal para tirar dúvidas ou confirmar informações sobre a entrega ou retirada.
                </p>
              </div>
            )}

            {messages.map((msg, index) => {
              const isMe = msg.senderRole === viewerRole;
              const prevMsg = index > 0 ? messages[index - 1] : undefined;
              const consecutive = isConsecutive(msg, prevMsg);
              
              // Show date separator if day changed
              const currentDateLabel = getDateLabel(msg.createdAt);
              const prevDateLabel = prevMsg ? getDateLabel(prevMsg.createdAt) : '';
              const showDateSeparator = currentDateLabel && currentDateLabel !== prevDateLabel;

              return (
                <React.Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center my-4">
                      <span className="bg-[#EADFD8] text-[#756B66] text-[10px] font-bold px-2.5 py-1 rounded-full border border-[#E1D8CE] shadow-2xs">
                        {currentDateLabel}
                      </span>
                    </div>
                  )}

                  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${consecutive ? 'mt-1' : 'mt-3'}`}>
                    <div className={`max-w-[76%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!consecutive && !isMe && (
                        <span className="text-[10px] text-[#756B66] font-bold mb-1 ml-1.5">
                          {msg.senderName}
                        </span>
                      )}
                      
                      <div 
                        className={`p-3 px-4 shadow-sm relative leading-relaxed text-sm ${
                          isMe 
                            ? 'bg-[#E94F2F] text-white rounded-2xl rounded-tr-xs' 
                            : 'bg-white border border-[#EADFD8] text-[#201A17] rounded-2xl rounded-tl-xs'
                        }`}
                      >
                        <p className="font-medium whitespace-pre-wrap break-words pr-2 pb-1.5">{msg.text}</p>
                        <span className={`absolute bottom-1 right-2 text-[8px] font-semibold ${isMe ? 'text-white/75' : 'text-[#756B66]/75'}`}>
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Scroll Bottom Button */}
          <AnimatePresence>
            {showScrollButton && (
              <motion.button
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                onClick={() => scrollToBottom('smooth')}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white border border-[#EADFD8] text-[#E94F2F] px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-1 text-[11px] font-black hover:bg-[#FAF8F5] transition-colors z-20 cursor-pointer"
                aria-label="Rolar para as novas mensagens"
              >
                <span>Novas mensagens</span>
                <ChevronDown size={14} className="animate-bounce" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Compositor de Mensagens */}
          <div className="p-4 border-t border-[#F0ECE3] bg-white sticky bottom-0 relative">
            {error && (
              <div className="mb-3 p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 flex items-center gap-2 font-semibold">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                className="flex-1 border border-[#EADFD8] bg-white rounded-2xl px-4 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#E94F2F]/20 focus:border-[#E94F2F] transition-all resize-none min-h-[44px] max-h-[140px] text-[#201A17] placeholder-[#A0958E]"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 1000))}
                placeholder="Digite sua mensagem..."
                rows={1}
                maxLength={1000}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                aria-label="Digitar mensagem"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                aria-label="Enviar mensagem"
                className="bg-[#E94F2F] text-white p-3 rounded-xl hover:bg-[#BD351C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex-shrink-0 flex items-center justify-center shadow-xs"
              >
                {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>

            {/* Character counter (only when close to limit) */}
            {text.length > 800 && (
              <div className="absolute right-6 bottom-16 text-[9px] font-bold text-orange-600 bg-white/95 px-1.5 py-0.5 rounded-md border border-orange-200">
                {text.length} / 1000
              </div>
            )}

            <p className="text-[9px] text-[#A0958E] font-bold mt-2 text-center flex items-center justify-center gap-1">
              <AlertCircle size={10} />
              <span>Não envie senhas, códigos ou dados de pagamento.</span>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
