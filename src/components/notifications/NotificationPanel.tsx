import React from 'react';
import { X, Check, ShoppingBag, Clock, MessageSquare, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../../contexts/NotificationContext';
import { getNotificationPresentation } from '../../services/notificationService';
import { AppNotification } from '../../types/notification';
import { useLocation } from '../../hooks/useLocation';
import { useApp } from '../../context/AppContext';

export const NotificationPanel: React.FC = () => {
  const { notifications, panelOpen, closePanel, markAsRead, markAllAsRead } = useNotifications();
  const [, navigate] = useLocation();
  const { setEnvironment } = useApp();

  if (!panelOpen) return null;

  const handleNotificationClick = async (notification: AppNotification) => {
    await markAsRead(notification.id);
    
    if (notification.type === 'new_order' && notification.orderId) {
      const isDemo = window.location.pathname.startsWith('/demo');
      if (isDemo) {
        setEnvironment('estabelecimento');
        navigate(`/demo?orderId=${notification.orderId}`);
      } else {
        navigate(`/gestor?orderId=${notification.orderId}`);
      }

      // Dispatch the custom event to open the order details immediately
      const event = new CustomEvent('open-merchant-order', { 
        detail: { orderId: notification.orderId, eventId: notification.id } 
      });
      window.dispatchEvent(event);
    } else if ((notification.type === 'merchant_order_chat' || (notification.type === 'new_message' && notification.recipientRole === 'merchant')) && notification.orderId) {
      const isDemo = window.location.pathname.startsWith('/demo');
      if (isDemo) {
        setEnvironment('estabelecimento');
        navigate(`/demo?orderId=${notification.orderId}`);
      } else {
        navigate(`/gestor?orderId=${notification.orderId}`);
      }

      // Dispatch the custom event to open the merchant chat immediately
      const event = new CustomEvent('open-merchant-order', {
        detail: {
          orderId: notification.orderId,
          eventId: notification.id,
          openChat: true,
          messageId: notification.messageId || notification.id
        }
      });
      window.dispatchEvent(event);
    } else if ((notification.type === 'customer_order_chat' || (notification.type === 'new_message' && notification.recipientRole === 'customer')) && notification.orderId) {
      navigate(`/acompanhar-pedido/${notification.orderId}?chat=true&eventId=${notification.id}&messageId=${notification.messageId || notification.id}`);
    }
    
    closePanel();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'new_order': return <ShoppingBag className="text-[#E94F2F]" size={18} />;
      case 'order_status': return <Clock className="text-[#E94F2F]" size={18} />;
      case 'new_message':
      case 'customer_order_chat':
      case 'merchant_order_chat': return <MessageSquare className="text-[#E94F2F]" size={18} />;
      default: return null;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-[#1A1513]/40 backdrop-blur-[1.5px] z-[110]"
        onClick={closePanel}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          className="bg-white w-full md:max-w-[400px] h-full flex flex-col absolute right-0 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-[#F0ECE3] flex items-center justify-between">
            <h2 className="font-extrabold text-[#201A17] text-lg">Notificações</h2>
            <div className="flex gap-2">
              <button onClick={markAllAsRead} className="p-2 text-[#756B66] hover:text-[#E94F2F]" title="Marcar todas como lidas">
                <Check size={20} />
              </button>
              <button onClick={closePanel} className="p-2 text-[#756B66] hover:text-[#201A17]">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-10 text-center text-[#756B66]">
                <p>Tudo em dia</p>
                <p className="text-sm">Suas atualizações aparecerão aqui.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const { title, description } = getNotificationPresentation(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full p-4 flex gap-4 text-left border-b border-[#F0ECE3] transition-colors ${!n.isRead ? 'bg-[#FFF5F2]' : 'hover:bg-[#F7F4EF]'}`}
                  >
                    <div className="mt-1">{getTypeIcon(n.type)}</div>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-[#201A17]">{title}</p>
                      <p className="text-xs text-[#756B66]">{description}</p>
                      <p className="text-[10px] text-[#A0958E] mt-1">{n.createdAt?.toDate().toLocaleString('pt-BR')}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-[#E94F2F] mt-2" />}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
