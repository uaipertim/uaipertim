import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { subscribeToOrderMessages, sendOrderMessage } from '../../services/orderChatService';
import { OrderChatMessage } from '../../types/orderChat';
import { Order } from '../../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface BasicOrderChatProps {
  order: Order;
  viewerRole: "customer" | "merchant";
  onClose: () => void;
}

export const BasicOrderChat: React.FC<BasicOrderChatProps> = ({ order, viewerRole, onClose }) => {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mapError = (err: any): string => {
    const msg = err?.message || String(err);
    if (msg.includes("AUTH_USER_NOT_AVAILABLE")) return "Sua sessão expirou. Entre novamente.";
    if (msg.includes("USER_PROFILE_NOT_AVAILABLE")) return "Não foi possível carregar sua conta.";
    if (msg.includes("USER_ACCOUNT_INACTIVE")) return "Esta conta está temporariamente desativada.";
    if (msg.includes("ORDER_NOT_FOUND")) return "Este pedido não foi encontrado.";
    if (msg.includes("ORDER_CHAT_ACCESS_DENIED")) return "Você não possui acesso a esta conversa.";
    if (msg.includes("EMPTY_MESSAGE")) return "Digite uma mensagem.";
    if (msg.includes("MESSAGE_TOO_LONG")) return "A mensagem deve ter no máximo 1.000 caracteres.";
    if (msg.includes("permission-denied") || err?.code === "permission-denied") return "O Firestore bloqueou o acesso à conversa.";
    if (msg.includes("unavailable") || err?.code === "unavailable") return "Não foi possível conectar à conversa.";
    return "Erro ao processar conversa. Tente novamente.";
  };

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

  useEffect(() => {
    const unsubscribe = subscribeToOrderMessages(
      order.id,
      (msgs) => {
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(mapError(err));
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [order.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendOrderMessage(order.id, text);
      setText('');
    } catch (err: any) {
      console.error(err);
      setError(mapError(err));
    } finally {
      setSending(false);
    }
  };

  const otherPartyName = viewerRole === 'customer' ? (order.establishmentName || 'Estabelecimento') : (order.customerName || 'Cliente');

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-bold">{otherPartyName}</h2>
        <span className="text-xs text-gray-500">#{order.orderNumber || order.id}</span>
        <button onClick={onClose}><X /></button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {loading && <div className="text-center"><Loader2 className="animate-spin inline" /></div>}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.senderRole === viewerRole ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-lg max-w-[80%] ${msg.senderRole === viewerRole ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>
              <p className="text-sm">{msg.text}</p>
              <p className="text-[10px] opacity-70 mt-1">{msg.senderName}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t flex gap-2">
        <textarea 
          className="flex-1 border p-2 rounded" 
          value={text} 
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite..."
        />
        <button onClick={handleSend} disabled={sending} className="bg-orange-500 text-white p-2 rounded">
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
        </button>
      </div>
      {error && <p className="text-red-500 text-center p-2 text-xs">{error}</p>}
    </div>
  );
};
