import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { useNotifications } from '../contexts/NotificationContext';
import { Product, Order, OrderStatus, BusinessHours, DeliveryNeighborhood, OptionGroup, MenuCategory } from '../types';
import { orderService } from '../services/orderService';
import { auth } from '../lib/firebase';
import { normalizeOrderItem, getCartItemCustomizationLines } from '../utils/orderCalculation';
import { getPaymentMethodLabel } from '../utils/paymentLabels';
import { 
  Store, List, Clock, Truck, TrendingUp, ShoppingBag, CheckCircle, 
  Settings, Save, Plus, Edit2, Trash2, Power, Eye, EyeOff, X, 
  DollarSign, BarChart3, Clock3, Users, Compass, AlertCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Check, RefreshCw,
  LogOut, MessageSquare, ChevronRight, Bell, Star, Sparkles, Image as ImageIcon, Tag, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PremiumOrderChat } from './order-chat/PremiumOrderChat';
import { NotificationSoundControl } from './notifications/NotificationSoundControl';
import { PushNotificationControl } from './notifications/PushNotificationControl';
import { formatOrderTime, parseOrderDate } from '../utils/dateUtils';
import { getCanonicalOrderStatus, isFinalOrderStatus } from '../utils/orderLifecycle';
import { FinanceiroEstabelecimento } from './FinanceiroEstabelecimento';
import { MerchantReviews } from './merchant/MerchantReviews';
import { getEstablishmentOperationalState, calculateEstimatedTotalMinutes } from '../utils/establishmentUtils';
import { establishmentsRepository } from '../repositories/establishmentsRepository';

const parseBrazilianNumber = (value: any): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  
  let cleanValue = String(value)
    .replace('R$', '')
    .trim();
    
  if (cleanValue === '') return 0;

  if (cleanValue.includes(',') && !cleanValue.includes('.')) {
    cleanValue = cleanValue.replace(',', '.');
  } else if (cleanValue.includes(',') && cleanValue.includes('.')) {
    cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
  }
  
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
};

const parseBrazilianOrIsoDate = (val: string): Date | null => {
  if (!val) return null;
  val = val.trim();
  if (val === '') return null;

  // Pattern for Brazilian format: DD/MM/YYYY HH:mm or DD/MM/YYYY
  const brPattern = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/;
  const brMatch = val.match(brPattern);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1; // 0-indexed month
    const year = parseInt(brMatch[3], 10);
    const hours = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
    const minutes = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const d = new Date(year, month, day, hours, minutes, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback to standard ISO or local date-time parser
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

function getSaoPauloDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  return `${year}-${month}-${day}`;
}

const formatChatTime = (timestamp: any) => {
  if (!timestamp) return '';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString('pt-BR');
  } catch (e) {
    return '';
  }
};

export const EstablishmentArea: React.FC = () => {
  const {
    establishments,
    setEstablishments,
    products,
    addOrUpdateProduct,
    deleteProduct,
    orders,
    updateOrderStatus,
    updateOrderPaymentStatus,
    businessHours,
    setBusinessHours,
    neighborhoods,
    setNeighborhoods,
    menuCategories,
    addOrUpdateMenuCategory,
    deleteMenuCategory,
    showToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'geral' | 'pedidos' | 'cardapio' | 'horarios' | 'entregas' | 'financeiro' | 'notificacoes' | 'avaliacoes'>('pedidos');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [orderObservations, setOrderObservations] = useState<Record<string, string>>({});
  const [updatingOrders, setUpdatingOrders] = useState<Record<string, boolean>>({});

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    if (updatingOrders[orderId]) return;
    const note = orderObservations[orderId] || null;
    setUpdatingOrders(prev => ({ ...prev, [orderId]: true }));
    try {
      await updateOrderStatus(orderId, status, undefined, undefined, note);
      setOrderObservations(prev => ({ ...prev, [orderId]: '' }));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingOrders(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const { establishmentId: authEstId, isAuthenticated, logout, userProfile, currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { notifications, markAsRead } = useNotifications();

  // Pizzaria da Praça is the primary store for this panel if not authenticated
  const merchantId = (isAuthenticated && authEstId) ? authEstId : 'pizzaria-da-praca';
  
  const currentMerchant = useMemo(() => {
    return establishments.find(e => e.id === merchantId) || establishments[0];
  }, [establishments]);

  const merchantProducts = useMemo(() => {
    return products[merchantId] || [];
  }, [products]);

  const merchantOrders = useMemo(() => {
    const filtered = orders.filter(o => o.establishmentId === merchantId);
    console.log("DEBUG: merchantOrders count:", filtered.length, "first order:", filtered[0]);
    return filtered;
  }, [orders, merchantId]);

  // Calculations for stats based on instructions
  const stats = useMemo(() => {
    const waitingOrders = merchantOrders.filter(o => {
      const status = (o.status || "").toLowerCase().trim();
      return status === 'aguardando_confirmacao';
    });
    const preparingOrders = merchantOrders.filter(o => {
      const status = (o.status || "").toLowerCase().trim();
      return status === 'em_preparacao';
    });

    const todaySPString = getSaoPauloDateString(new Date());

    const completedTodayOrders = merchantOrders.filter(o => {
      const status = (o.status || "").toLowerCase().trim();
      if (status !== 'concluido' && status !== 'concluído') return false;

      const completedAt = o.completedAt ? parseOrderDate(o.completedAt) : null;
      if (completedAt) {
        return getSaoPauloDateString(completedAt) === todaySPString;
      }

      // Fallback for legacy orders:
      // - status normalizado === "concluido"
      // - completedAt está ausente
      // - updatedAt é válido
      // - updatedAt pertence ao dia atual.
      const updatedAt = o.updatedAt ? parseOrderDate(o.updatedAt) : null;
      if (updatedAt) {
        return getSaoPauloDateString(updatedAt) === todaySPString;
      }

      return false;
    });

    const completedTodayCount = completedTodayOrders.length;
    const revenue = completedTodayOrders.reduce((sum, o) => sum + o.total, 0);
    const ticketMedia = completedTodayCount > 0 ? (revenue / completedTodayCount) : 0;

    return {
      waiting: waitingOrders.length,
      preparing: preparingOrders.length,
      completedToday: completedTodayCount,
      revenue,
      ticketMedia,
      avgPrepTime: '32 min'
    };
  }, [merchantOrders]);

  // Helper for elapsed minutes in new orders
  const getElapsedMinutes = (createdAtStr: any) => {
    const created = parseOrderDate(createdAtStr).getTime();
    const now = Date.now();
    const elapsedMs = Math.abs(now - created);
    const elapsedMin = Math.floor(elapsedMs / 1000 / 60);
    if (elapsedMin < 1) return 'Agora mesmo';
    return `há ${elapsedMin} min`;
  };

  const renderOrderPaymentSection = (order: Order) => {
    const paymentStatusMap: Record<string, { label: string; color: string }> = {
      pending: { label: 'Aguardando Pagamento', color: 'bg-amber-100 text-amber-800 border-amber-200' },
      paid: { label: 'Pago', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      not_paid: { label: 'Pagamento Não Realizado', color: 'bg-rose-100 text-rose-800 border-rose-200' },
      cancelled: { label: 'Cancelado', color: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
    };

    const statusInfo = paymentStatusMap[order.paymentStatus || 'pending'] || paymentStatusMap.pending;

    const methodLabel = getPaymentMethodLabel(order.paymentMethod, order.deliveryType);

    return (
      <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
          <div className="space-y-1">
            <span className="text-[#756B66] block uppercase tracking-wider text-[10px]">Meio de Pagamento</span>
            <span className="font-bold text-[#201A17]">{methodLabel}</span>
          </div>

          <div className="space-y-1 text-right">
            <span className="text-[#756B66] block uppercase tracking-wider text-[10px]">Status do Pagamento</span>
            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {order.paymentMethod === 'cash' && order.changeRequired && (
          <div className="text-[11px] font-bold text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200/50 flex justify-between">
            <span>Troco Solicitado:</span>
            <span>Para R$ {order.changeFor?.toFixed(2).replace('.', ',')} (Troco: R$ {(order.changeFor! - order.total).toFixed(2).replace('.', ',')})</span>
          </div>
        )}

        {/* Buttons to update payment status */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => updateOrderPaymentStatus(order.id, 'paid')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-extrabold transition-all border ${
              order.paymentStatus === 'paid'
                ? 'bg-emerald-600 text-white border-transparent'
                : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            ✓ Pago ao Entregar
          </button>
          <button
            onClick={() => updateOrderPaymentStatus(order.id, 'not_paid')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-extrabold transition-all border ${
              order.paymentStatus === 'not_paid'
                ? 'bg-rose-600 text-white border-transparent'
                : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            ✗ Pagamento Falhou
          </button>
        </div>
      </div>
    );
  };

  // Organize orders by priority groups
  const categorizedOrders = useMemo(() => {
    const novos = merchantOrders.filter(o => o.status === 'aguardando_confirmacao');
    const emPreparacao = merchantOrders.filter(o => o.status === 'confirmado' || o.status === 'em_preparacao');
    const prontos = merchantOrders.filter(o => o.status === 'pronto' || o.status === 'pronto_retirada');
    const emEntrega = merchantOrders.filter(o => o.status === 'saiu_entrega');
    
    // All terminal/closed orders
    const closedOrders = merchantOrders.filter(o => {
      const canonicalStatus = getCanonicalOrderStatus(o);
      return isFinalOrderStatus(canonicalStatus);
    });

    // Mutually exclusive groups: attentionOrders (unread post-order messages) and concluidos (regular closed history)
    const attentionOrders = closedOrders
      .filter(o => (o.chatUnreadMerchant ?? 0) > 0)
      .sort((a, b) => {
        const timeA = a.chatLastMessageAt ? (a.chatLastMessageAt.toDate ? a.chatLastMessageAt.toDate().getTime() : new Date(a.chatLastMessageAt).getTime()) : 0;
        const timeB = b.chatLastMessageAt ? (b.chatLastMessageAt.toDate ? b.chatLastMessageAt.toDate().getTime() : new Date(b.chatLastMessageAt).getTime()) : 0;
        return timeB - timeA;
      });

    const concluidos = closedOrders.filter(o => (o.chatUnreadMerchant ?? 0) <= 0);

    return {
      novos,
      emPreparacao,
      prontos,
      emEntrega,
      attentionOrders,
      concluidos
    };
  }, [merchantOrders]);

  // Tab filters inside orders tab
  const [pedidosFilter, setPedidosFilter] = useState<'todos' | 'novos' | 'preparacao' | 'prontos' | 'entrega' | 'concluidos'>('todos');

  // Merchant status states & operational state derivation
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [isPauseDurationModalOpen, setIsPauseDurationModalOpen] = useState(false);
  const [currentTick, setCurrentTick] = useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTick(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const operationalState = useMemo(() => {
    return getEstablishmentOperationalState(currentMerchant, currentTick);
  }, [currentMerchant, currentTick]);

  const updateMerchantStatus = async (fields: Partial<any>) => {
    if (!currentMerchant || isStatusUpdating) return;
    setIsStatusUpdating(true);
    
    const originalMerchant = { ...currentMerchant };
    const updatedMerchant = {
      ...currentMerchant,
      ...fields
    };
    
    try {
      const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('pl_catalog_data_source') !== 'firestore';
      if (!isDemoMode) {
        await establishmentsRepository.saveEstablishment(updatedMerchant);
      }
      
      setEstablishments(prev => 
        prev.map(e => e.id === merchantId ? updatedMerchant : e)
      );
      
      showToast('Estado operacional atualizado com sucesso!', 'success');
    } catch (error) {
      console.error("Erro ao atualizar o estado operacional:", error, {
        establishmentId: merchantId,
        fields,
        originalMerchant
      });
      showToast('Não foi possível atualizar o estado da operação. Tente novamente.', 'error');
    } finally {
      setIsStatusUpdating(false);
    }
  };

  const toggleOpen = () => {
    if (!currentMerchant || isStatusUpdating) return;
    const currentOpen = currentMerchant.open !== undefined ? currentMerchant.open : currentMerchant.isOpen;
    const nextState = !currentOpen;
    showToast(nextState ? 'Abrindo a loja...' : 'Fechando a loja...', 'info');
    updateMerchantStatus({
      open: nextState,
      isOpen: nextState
    });
  };

  const toggleAcceptingOrders = () => {
    if (!currentMerchant || isStatusUpdating) return;
    const currentAccepting = currentMerchant.acceptingOrders !== undefined ? currentMerchant.acceptingOrders : true;
    const nextState = !currentAccepting;
    showToast(nextState ? 'Habilitando aceitação de pedidos...' : 'Desabilitando aceitação de pedidos...', 'info');
    updateMerchantStatus({
      acceptingOrders: nextState
    });
  };

  const toggleTemporarilyPaused = () => {
    if (!currentMerchant || isStatusUpdating) return;
    const isPaused = operationalState.pauseStatus === 'active';
    
    if (isPaused) {
      showToast('Removendo a pausa temporária...', 'info');
      updateMerchantStatus({
        temporarilyPaused: false,
        pausedUntil: null
      });
    } else {
      setIsPauseDurationModalOpen(true);
    }
  };

  const handleSelectPauseDuration = (minutes: number | null) => {
    setIsPauseDurationModalOpen(false);
    let pausedUntilIsoStr: string | null = null;
    
    if (minutes !== null) {
      const untilDate = new Date(Date.now() + minutes * 60 * 1000);
      pausedUntilIsoStr = untilDate.toISOString();
      const hh = String(untilDate.getHours()).padStart(2, '0');
      const mm = String(untilDate.getMinutes()).padStart(2, '0');
      showToast(`Ativando pausa temporária por ${minutes === 30 ? '30 minutos' : minutes === 60 ? '1 hora' : '2 horas'}. Retoma às ${hh}:${mm}.`, 'info');
    } else {
      showToast('Ativando pausa temporária por tempo indeterminado.', 'info');
    }
    
    updateMerchantStatus({
      temporarilyPaused: true,
      pausedUntil: pausedUntilIsoStr
    });
  };

  // Product CRUD states
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [chatOrder, setChatOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [merchantHighlightMessageId, setMerchantHighlightMessageId] = useState<string | undefined>(undefined);
  const [isFetchingOrder, setIsFetchingOrder] = useState(false);
  const [fetchingOrderMessage, setFetchingOrderMessage] = useState('Abrindo pedido...');
  const [fetchingOrderError, setFetchingOrderError] = useState<string | null>(null);
  const processedOrderIdRef = React.useRef<string | null>(null);

  // Operational pendencies states
  const [pendenciesError, setPendenciesError] = useState<Error | null>(null);
  const [isRetryingPendencies, setIsRetryingPendencies] = useState(false);
  const [isAllPendenciesModalOpen, setIsAllPendenciesModalOpen] = useState(false);
  const [pendencyFilter, setPendencyFilter] = useState<'todas' | 'pedidos' | 'mensagens' | 'catalogo' | 'configuracoes'>('todas');

  const openMerchantOrderFromNotification = React.useCallback(async (
    orderId: string,
    eventId?: string,
    openChat?: boolean,
    messageId?: string
  ) => {
    setActiveTab('pedidos');
    setPedidosFilter('todos');

    const merchantId = (isAuthenticated && authEstId) ? authEstId : 'pizzaria-da-praca';

    const order = orders.find(o => o.id === orderId);
    if (order) {
      if (order.establishmentId === merchantId) {
        if (openChat) {
          setSelectedOrder(null);
          setChatOrder(order);
          if (messageId) {
            setMerchantHighlightMessageId(messageId);
          }
        } else {
          setSelectedOrder(order);
          setChatOrder(null);
          setMerchantHighlightMessageId(undefined);
        }
        if (eventId) {
          const hasRealNotification = notifications.some(n => n.id === eventId);
          if (hasRealNotification) {
            try {
              await markAsRead(eventId);
            } catch (err) {
              console.error("Error marking notification as read:", err);
            }
          } else {
            const matchingNotifications = notifications.filter(
              n => !n.isRead && n.orderId === orderId && (n.type === 'new_order' || n.type === 'merchant_order_chat' || n.type === 'new_message')
            );
            for (const n of matchingNotifications) {
              try {
                await markAsRead(n.id);
              } catch (err) {
                console.error("Error marking notification as read:", err);
              }
            }
          }
        } else {
          const matchingNotifications = notifications.filter(
            n => !n.isRead && n.orderId === orderId && (n.type === 'new_order' || n.type === 'merchant_order_chat' || n.type === 'new_message')
          );
          for (const n of matchingNotifications) {
            try {
              await markAsRead(n.id);
            } catch (err) {
              console.error("Error marking notification as read:", err);
            }
          }
        }
      } else {
        setFetchingOrderError('Este pedido pertence a outro estabelecimento ou você não tem permissão para visualizá-lo.');
      }
    } else {
      setFetchingOrderMessage(openChat ? 'Abrindo mensagem...' : 'Abrindo pedido...');
      setIsFetchingOrder(true);
      setFetchingOrderError(null);

      try {
        const fetched = await orderService.getOrderById(orderId);
        if (fetched) {
          if (fetched.establishmentId === merchantId) {
            if (openChat) {
              setSelectedOrder(null);
              setChatOrder(fetched);
              if (messageId) {
                setMerchantHighlightMessageId(messageId);
              }
            } else {
              setSelectedOrder(fetched);
            }
            if (eventId) {
              const hasRealNotification = notifications.some(n => n.id === eventId);
              if (hasRealNotification) {
                try {
                  await markAsRead(eventId);
                } catch (err) {
                  console.error("Error marking notification as read:", err);
                }
              } else {
                const matchingNotifications = notifications.filter(
                  n => !n.isRead && n.orderId === orderId && (n.type === 'new_order' || n.type === 'merchant_order_chat' || n.type === 'new_message')
                );
                for (const n of matchingNotifications) {
                  try {
                    await markAsRead(n.id);
                  } catch (err) {
                    console.error("Error marking notification as read:", err);
                  }
                }
              }
            } else {
              const matchingNotifications = notifications.filter(
                n => !n.isRead && n.orderId === orderId && (n.type === 'new_order' || n.type === 'merchant_order_chat' || n.type === 'new_message')
              );
              for (const n of matchingNotifications) {
                try {
                  await markAsRead(n.id);
                } catch (err) {
                  console.error("Error marking notification as read:", err);
                }
              }
            }
          } else {
            setFetchingOrderError('Este pedido pertence a outro estabelecimento ou você não tem permissão para visualizá-lo.');
          }
        } else {
          setFetchingOrderError('O pedido solicitado não foi encontrado.');
        }
      } catch (error: any) {
        console.error("Error fetching order via notification:", error);
        setFetchingOrderError('Erro ao buscar o pedido. Verifique sua conexão.');
      } finally {
        setIsFetchingOrder(false);
      }
    }
  }, [orders, isAuthenticated, authEstId, notifications, markAsRead]);

  React.useEffect(() => {
    (window as any).openMerchantOrderChatFromNotification = async ({
      orderId,
      messageId,
      eventId,
      establishmentId
    }: {
      orderId: string;
      messageId?: string;
      eventId?: string;
      establishmentId?: string;
    }) => {
      await openMerchantOrderFromNotification(orderId, eventId || messageId, true, messageId);
    };

    return () => {
      delete (window as any).openMerchantOrderChatFromNotification;
    };
  }, [openMerchantOrderFromNotification]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get('orderId');
    if (!orderIdParam) return;

    if (processedOrderIdRef.current === orderIdParam) return;
    processedOrderIdRef.current = orderIdParam;

    openMerchantOrderFromNotification(orderIdParam).then(() => {
      window.history.replaceState({}, '', window.location.pathname);
    });
  }, [orders, isAuthenticated, authEstId, openMerchantOrderFromNotification]);

  React.useEffect(() => {
    const handleOpenOrderEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        orderId: string;
        eventId?: string;
        openChat?: boolean;
        messageId?: string;
      }>;
      if (customEvent.detail && customEvent.detail.orderId) {
        openMerchantOrderFromNotification(
          customEvent.detail.orderId,
          customEvent.detail.eventId,
          customEvent.detail.openChat,
          customEvent.detail.messageId
        );
      }
    };

    window.addEventListener('open-merchant-order', handleOpenOrderEvent);
    return () => {
      window.removeEventListener('open-merchant-order', handleOpenOrderEvent);
    };
  }, [openMerchantOrderFromNotification]);

  // Keep selectedOrder state in sync with any live updates from the orders list subscription
  React.useEffect(() => {
    if (selectedOrder) {
      const latestOrder = orders.find(o => o.id === selectedOrder.id);
      if (latestOrder && JSON.stringify(latestOrder) !== JSON.stringify(selectedOrder)) {
        setSelectedOrder(latestOrder);
      }
    }
  }, [orders, selectedOrder]);
  
  // Product Form states
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('0.00');
  const [prodCategory, setProdCategory] = useState('');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodImage, setProdImage] = useState('');
  const [prodPreparedToOrder, setProdPreparedToOrder] = useState(false);
  const [prodFreshIngredients, setProdFreshIngredients] = useState(false);
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoPrice, setPromoPrice] = useState('');
  const [promoStartsAt, setPromoStartsAt] = useState('');
  const [promoEndsAt, setPromoEndsAt] = useState('');
  const [promoLabel, setPromoLabel] = useState('');
  const [promoSource, setPromoSource] = useState<'establishment' | 'uaipertim'>('establishment');
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupErrors, setGroupErrors] = useState<Record<string, { message: string; field?: string }>>({});
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<OptionGroup | null>(null);

  // Menu Categories Management States
  const [menuTab, setMenuTab] = useState<'produtos' | 'categorias'>('produtos');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSortOrder, setCatSortOrder] = useState('1');
  const [catActive, setCatActive] = useState(true);

  // Quick category creation (inline in product form)
  const [isQuickCatOpen, setIsQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');

  // Delete Category Confirmation Modal
  const [catToDelete, setCatToDelete] = useState<MenuCategory | null>(null);
  const [productsLinkedToCat, setProductsLinkedToCat] = useState<Product[]>([]);

  // Delete Product Confirmation Modal
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);

  // Handle opening product create/edit
  const handleOpenProductForm = (prod?: Product) => {
    setGroupErrors({});
    const currentCats = menuCategories[merchantId] || [];
    if (prod) {
      setEditingProduct(prod);
      setProdName(prod.name);
      setProdDesc(prod.description);
      setProdPrice(prod.price.toFixed(2).replace('.', ','));
      
      const matched = prod.menuCategoryId 
        ? currentCats.find(c => c.id === prod.menuCategoryId) 
        : currentCats.find(c => c.name.toLowerCase() === prod.category.toLowerCase());
      setProdCategory(matched ? matched.id : (prod.menuCategoryId || ''));

      setProdAvailable(prod.available);
      setProdImage(prod.image || '');
      setProdPreparedToOrder(prod.preparedToOrder === true);
      setProdFreshIngredients(prod.freshIngredients === true);
      
      // Initialize promotion states
      setPromoEnabled(!!prod.promotionEnabled);
      setPromoPrice(prod.promotionalPrice !== undefined && prod.promotionalPrice !== null ? prod.promotionalPrice.toFixed(2).replace('.', ',') : '');
      
      const formatDateForInput = (val: any) => {
        if (!val) return '';
        let d: Date | null = null;
        if (typeof val.toDate === 'function') d = val.toDate();
        else if (val instanceof Date) d = val;
        else if (typeof val === 'string' || typeof val === 'number') {
          d = parseBrazilianOrIsoDate(String(val));
        }
        else if (typeof val === 'object' && val.seconds !== undefined) d = new Date(val.seconds * 1000);
        
        if (d && !isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        return '';
      };
      
      setPromoStartsAt(formatDateForInput(prod.promotionStartsAt));
      setPromoEndsAt(formatDateForInput(prod.promotionEndsAt));
      setPromoLabel(prod.promotionLabel || '');
      setPromoSource(prod.promotionSource || 'establishment');

      const clonedGroups = prod.optionGroups ? JSON.parse(JSON.stringify(prod.optionGroups)) : [];
      clonedGroups.forEach((g: any) => {
        if (!g.clientKey) g.clientKey = g.id;
        if (!g.tempId) g.tempId = g.id;
        g.options.forEach((o: any) => {
          o.priceInput = o.additionalPrice !== undefined ? String(o.additionalPrice).replace('.', ',') : '';
        });
      });
      setOptionGroups(clonedGroups);
      setExpandedGroupId(null);
    } else {
      setEditingProduct(null);
      setProdName('');
      setProdDesc('');
      setProdPrice('0,00');
      setProdCategory(currentCats.length > 0 ? currentCats[0].id : '');
      setProdAvailable(true);
      setProdImage('');
      
      // Clear promotion states
      setPromoEnabled(false);
      setPromoPrice('');
      setPromoStartsAt('');
      setPromoEndsAt('');
      setPromoLabel('');
      setPromoSource('establishment');
      setProdPreparedToOrder(false);
      setProdFreshIngredients(false);

      setOptionGroups([]);
      setExpandedGroupId(null);
    }
    setIsProductModalOpen(true);
  };

  // Option Group Actions
  const autoAdjustGroupSelections = (group: OptionGroup): { updated: OptionGroup, adjustedMessage?: string } => {
    let updated = { ...group };
    let adjustedMessage: string | undefined;

    const minSelect = updated.minSelect !== undefined ? updated.minSelect : updated.minSelections;
    const maxSelect = updated.maxSelect !== undefined ? updated.maxSelect : updated.maxSelections;

    updated.minSelect = minSelect;
    updated.maxSelect = maxSelect;

    if (!updated.required) {
      if (updated.minSelect !== 0) {
        updated.minSelect = 0;
        updated.minSelections = 0;
      }
    }

    // Ensure maxSelect >= minSelect
    if (updated.maxSelect < updated.minSelect) {
      updated.maxSelect = updated.minSelect;
    }

    // Always sync legacy with canonical
    updated.minSelections = updated.minSelect;
    updated.maxSelections = updated.maxSelect;

    return { updated, adjustedMessage };
  };

  const handleAddOptionGroup = () => {
    const uniqueId = `g-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newGroup: OptionGroup = {
      id: uniqueId,
      clientKey: uniqueId,
      tempId: uniqueId,
      name: '',
      description: '',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      minSelections: 0,
      maxSelections: 1,
      position: optionGroups.length + 1,
      active: true,
      options: []
    };
    setOptionGroups([...optionGroups, newGroup]);
    setExpandedGroupId(uniqueId);
  };

  const requestDeleteOptionGroup = (groupKey: string) => {
    const group = optionGroups.find(g => (g.clientKey ?? g.id) === groupKey);
    if (group) {
      setGroupToDelete(group);
    }
  };

  const confirmDeleteOptionGroup = () => {
    if (!groupToDelete) return;
    const groupKey = groupToDelete.clientKey ?? groupToDelete.id;
    setOptionGroups(prev => {
      const filtered = prev.filter(g => (g.clientKey ?? g.id) !== groupKey);
      return filtered.map((g, idx) => ({ ...g, position: idx + 1 }));
    });
    if (expandedGroupId === groupKey) {
      setExpandedGroupId(null);
    }
    setGroupToDelete(null);
  };

  const handleMoveOptionGroup = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= optionGroups.length) return;

    const newList = [...optionGroups];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;

    const remapped = newList.map((g, idx) => ({ ...g, position: idx + 1 }));
    setOptionGroups(remapped);
  };

  const handleUpdateOptionGroup = (groupId: string, updates: Partial<OptionGroup>) => {
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        let updated = { ...g, ...updates };
        if (updates.required !== undefined) {
          if (updates.required) {
            updated.minSelect = Math.max(1, updated.minSelect !== undefined ? updated.minSelect : updated.minSelections);
          } else {
            updated.minSelect = 0;
          }
        }

        // Propagate changes from updates to both fields
        if (updates.minSelect !== undefined) updated.minSelections = updates.minSelect;
        if (updates.minSelections !== undefined) updated.minSelect = updates.minSelections;
        if (updates.maxSelect !== undefined) updated.maxSelections = updates.maxSelect;
        if (updates.maxSelections !== undefined) updated.maxSelect = updates.maxSelections;

        const { updated: adjusted, adjustedMessage } = autoAdjustGroupSelections(updated);
        if (adjustedMessage) {
          showToast(adjustedMessage, 'info');
        }
        return adjusted;
      }
      return g;
    }));
  };

  const handleAddOptionItem = (groupId: string) => {
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        const newOption = {
          id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: '',
          description: '',
          additionalPrice: 0,
          priceInput: '',
          position: g.options.length + 1,
          active: true
        };
        const tempGroup = {
          ...g,
          options: [...g.options, newOption]
        };
        const { updated, adjustedMessage } = autoAdjustGroupSelections(tempGroup);
        if (adjustedMessage) {
          showToast(adjustedMessage, 'info');
        }
        return updated;
      }
      return g;
    }));
  };

  const handleRemoveOptionItem = (groupId: string, optionId: string) => {
    if (confirm('Deseja realmente remover esta opção?')) {
      setOptionGroups(optionGroups.map(g => {
        if (g.id === groupId) {
          const filtered = g.options.filter(o => o.id !== optionId);
          const remapped = filtered.map((o, idx) => ({ ...o, position: idx + 1 }));
          const tempGroup = { ...g, options: remapped };
          const { updated, adjustedMessage } = autoAdjustGroupSelections(tempGroup);
          if (adjustedMessage) {
            showToast(adjustedMessage, 'info');
          }
          return updated;
        }
        return g;
      }));
    }
  };

  const handleUpdateOptionItem = (groupId: string, optionId: string, updates: any) => {
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        const tempGroup = {
          ...g,
          options: g.options.map(o => {
            if (o.id === optionId) {
              return { ...o, ...updates };
            }
            return o;
          })
        };
        const { updated, adjustedMessage } = autoAdjustGroupSelections(tempGroup);
        if (adjustedMessage) {
          showToast(adjustedMessage, 'info');
        }
        return updated;
      }
      return g;
    }));
  };

  const handleMoveOptionItem = (groupId: string, index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        if (targetIndex < 0 || targetIndex >= g.options.length) return g;
        const newList = [...g.options];
        const temp = newList[index];
        newList[index] = newList[targetIndex];
        newList[targetIndex] = temp;
        const remapped = newList.map((o, idx) => ({ ...o, position: idx + 1 }));
        return { ...g, options: remapped };
      }
      return g;
    }));
  };

  // Submit product
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProduct) return;
    setIsSavingProduct(true);
    const priceNum = parseBrazilianNumber(prodPrice);

    if (!prodName || !prodCategory || isNaN(priceNum)) {
      showToast('Por favor, preencha os dados do produto corretamente.', 'error');
      setIsSavingProduct(false);
      return;
    }

    // Validate optionGroups
    const errors: Record<string, { message: string; field?: string }> = {};
    let firstInvalidGroupId: string | null = null;
    let firstInvalidField: string | null = null;

    for (const group of optionGroups) {
      const activeOptionsCount = group.options.filter(o => o.active).length;

      if (!group.name.trim()) {
        errors[group.id] = { message: `Por favor, preencha o nome do grupo de opcionais.`, field: 'name' };
      } else if (group.required && group.minSelect < 1) {
        errors[group.id] = { message: `A seleção mínima deve ser pelo menos 1 por ser obrigatório.`, field: 'minSelect' };
      } else if (!group.required && group.minSelect > 0) {
        errors[group.id] = { message: `A seleção mínima deve ser 0 quando opcional.`, field: 'minSelect' };
      } else if (group.maxSelect < group.minSelect) {
        errors[group.id] = { message: `A seleção máxima (${group.maxSelect}) não pode ser menor que a mínima (${group.minSelect}).`, field: 'maxSelect' };
      } else if (activeOptionsCount === 0 && group.required) {
        errors[group.id] = { message: `Este grupo é obrigatório, mas não possui nenhuma opção ativa. Ative pelo menos uma opção.`, field: 'options' };
      }

      if (!errors[group.id]) {
        for (const opt of group.options) {
          if (!opt.name.trim()) {
            errors[group.id] = { message: `Por favor, preencha o nome de todas as opções.`, field: `opt-name-${opt.id}` };
            break;
          }
        }
      }

      if (errors[group.id] && !firstInvalidGroupId) {
        firstInvalidGroupId = group.id;
        firstInvalidField = errors[group.id].field || null;
      }
    }

    if (Object.keys(errors).length > 0) {
      setGroupErrors(errors);
      showToast('Existem erros de validação nos opcionais. Verifique as marcações em vermelho.', 'error');
      setIsSavingProduct(false);

      if (firstInvalidGroupId) {
        setExpandedGroupId(firstInvalidGroupId);

        const gid = firstInvalidGroupId;
        const fid = firstInvalidField;
        setTimeout(() => {
          const cardElement = document.getElementById(`group-card-${gid}`);
          if (cardElement) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          let inputId = `group-card-${gid}`;
          if (fid === 'name') inputId = `group-name-${gid}`;
          else if (fid === 'minSelect' || fid === 'minSelections') inputId = `group-min-${gid}`;
          else if (fid === 'maxSelect' || fid === 'maxSelections') inputId = `group-max-${gid}`;
          else if (fid && fid.startsWith('opt-name-')) inputId = fid;

          const inputElement = document.getElementById(inputId);
          if (inputElement) {
            inputElement.focus();
          }
        }, 150);
      }
      return;
    }

    // Clear errors if all good
    setGroupErrors({});

    // Process and validate promotion data
    let finalPromotionalPrice: number | undefined = undefined;
    let finalPromotionEnabled = false;
    let finalStartsAt: any = null;
    let finalEndsAt: any = null;
    let finalPromoLabel = '';
    let finalPromoSource = promoSource;

    if (promoEnabled) {
      if (promoSource === 'uaipertim') {
        // Platform promotion: we only allow toggling the enabled state
        finalPromotionalPrice = editingProduct?.promotionalPrice;
        finalPromotionEnabled = true;
        finalStartsAt = editingProduct?.promotionStartsAt || null;
        finalEndsAt = editingProduct?.promotionEndsAt || null;
        finalPromoLabel = editingProduct?.promotionLabel || 'Oferta UaiPertim';
        finalPromoSource = 'uaipertim';
      } else {
        // Merchant promotion: validate everything
        const parsedPromoPrice = parseBrazilianNumber(promoPrice);
        const startsDate = parseBrazilianOrIsoDate(promoStartsAt);
        const endsDate = parseBrazilianOrIsoDate(promoEndsAt);

        if (isNaN(parsedPromoPrice) || parsedPromoPrice <= 0) {
          showToast('O preço promocional deve ser maior que zero.', 'error');
          setIsSavingProduct(false);
          return;
        }
        if (parsedPromoPrice >= priceNum) {
          showToast('O preço promocional deve ser menor que o preço normal.', 'error');
          setIsSavingProduct(false);
          return;
        }
        if (startsDate && endsDate && endsDate <= startsDate) {
          showToast('A data de encerramento deve ser posterior à data de início.', 'error');
          setIsSavingProduct(false);
          return;
        }

        finalPromotionalPrice = parsedPromoPrice;
        finalPromotionEnabled = true;
        finalStartsAt = startsDate;
        finalEndsAt = endsDate;
        finalPromoLabel = promoLabel.trim() || 'Oferta';
        finalPromoSource = 'establishment';
      }
    } else {
      finalPromotionEnabled = false;
      if (promoSource === 'uaipertim') {
        finalPromotionalPrice = editingProduct?.promotionalPrice;
        finalStartsAt = editingProduct?.promotionStartsAt || null;
        finalEndsAt = editingProduct?.promotionEndsAt || null;
        finalPromoLabel = editingProduct?.promotionLabel || 'Oferta UaiPertim';
        finalPromoSource = 'uaipertim';
      } else {
        const parsedPromoPrice = promoPrice ? parseBrazilianNumber(promoPrice) : undefined;
        finalPromotionalPrice = parsedPromoPrice && !isNaN(parsedPromoPrice) ? parsedPromoPrice : undefined;
        finalStartsAt = parseBrazilianOrIsoDate(promoStartsAt);
        finalEndsAt = parseBrazilianOrIsoDate(promoEndsAt);
        finalPromoLabel = promoLabel.trim();
        finalPromoSource = 'establishment';
      }
    }

    // Sync legacy sizes, borders, and extras from optionGroups to preserve compatibility
    const finalSizesGroup = optionGroups.find(g => g.name.toLowerCase().includes('tamanho') || g.id === 'tamanho' || g.id === 'escolha-o-tamanho');
    const finalSizes = finalSizesGroup ? finalSizesGroup.options.filter(o => o.active).map(o => o.name) : [];

    const finalBordersGroup = optionGroups.find(g => g.name.toLowerCase().includes('borda') || g.id === 'borda' || g.id === 'escolha-a-borda');
    const finalBorders = finalBordersGroup ? finalBordersGroup.options.filter(o => o.active).map(o => o.name) : [];

    const finalExtrasGroup = optionGroups.find(g => g.name.toLowerCase().includes('adicionais premium') || g.id === 'adicionais-premium' || g.name.toLowerCase() === 'adicionais');
    const finalExtras = finalExtrasGroup ? finalExtrasGroup.options.filter(o => o.active).map(o => ({ name: o.name, price: o.additionalPrice })) : [];

    const currentCats = menuCategories[merchantId] || [];
    const matchedCat = currentCats.find(c => c.id === prodCategory);

    const productData: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: prodName,
      description: prodDesc,
      price: priceNum,
      category: matchedCat ? matchedCat.name : prodCategory,
      available: prodAvailable,
      image: prodImage || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=80',
      sizes: finalSizes,
      borders: finalBorders,
      extras: finalExtras,
      optionGroups: optionGroups || [],
      establishmentId: merchantId,
      menuCategoryId: prodCategory,
      menuCategoryName: matchedCat ? matchedCat.name : prodCategory,
      promotionEnabled: finalPromotionEnabled,
      promotionalPrice: finalPromotionalPrice,
      promotionStartsAt: finalStartsAt,
      promotionEndsAt: finalEndsAt,
      promotionLabel: finalPromoLabel,
      promotionSource: finalPromoSource,
      preparedToOrder: Boolean(prodPreparedToOrder),
      freshIngredients: Boolean(prodFreshIngredients),
    };

    try {
      await addOrUpdateProduct(merchantId, productData, { silent: true });
      setIsProductModalOpen(false);
      showToast(editingProduct ? 'Produto atualizado com sucesso!' : 'Produto adicionado ao catálogo com sucesso!', 'success');
    } catch (err: any) {
      console.error("Failed to save product:", {
        error: err?.code || 'UNKNOWN_ERROR',
        message: err?.message || String(err),
        productId: productData.id,
        establishmentId: merchantId,
        promoPayload: {
          promotionEnabled: productData.promotionEnabled,
          promotionalPrice: productData.promotionalPrice,
          promotionLabel: productData.promotionLabel,
          promotionStartsAt: productData.promotionStartsAt,
          promotionEndsAt: productData.promotionEndsAt,
          promotionSource: productData.promotionSource
        },
        firestorePath: `products/${productData.id}`,
        stage: 'EstablishmentArea.tsx: handleSubmitProduct'
      });
      showToast('Não foi possível salvar a promoção. Tente novamente.', 'error');
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Delete product
  const handleDeleteProductClick = (product: Product) => {
    setProductToDelete(product);
  };

  // Local settings for business hours and neighborhoods
  const [localHours, setLocalHours] = useState<BusinessHours[]>([...businessHours]);
  const [localNeighborhoods, setLocalNeighborhoods] = useState<DeliveryNeighborhood[]>([...neighborhoods]);

  // Delivery Zone Management States (Phase 2)
  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zoneSearchQuery, setZoneSearchQuery] = useState('');
  const [zoneStatusFilter, setZoneStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<any | null>(null);

  const filteredDeliveryZones = useMemo(() => {
    return deliveryZones.filter(zone => {
      const matchesSearch = zone.neighborhoodName.toLowerCase().includes(zoneSearchQuery.toLowerCase());
      const matchesStatus = 
        zoneStatusFilter === 'all' ? true :
        zoneStatusFilter === 'active' ? zone.active === true :
        zone.active === false;
      return matchesSearch && matchesStatus;
    });
  }, [deliveryZones, zoneSearchQuery, zoneStatusFilter]);

  // Delivery Zone form fields
  const [zoneNeighborhoodId, setZoneNeighborhoodId] = useState('');
  const [zoneNeighborhoodName, setZoneNeighborhoodName] = useState('');
  const [zoneFee, setZoneFee] = useState<number>(0);
  const [zoneAdditionalMinutes, setZoneAdditionalMinutes] = useState<number>(0);
  const [zoneMinOrder, setZoneMinOrder] = useState<string>('');
  const [zoneActive, setZoneActive] = useState(true);

  // Fetch Delivery Zones
  const fetchZones = async () => {
    setZonesLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`/api/admin/establishments/${merchantId}/delivery-zones`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setDeliveryZones(data);
      } else {
        console.error("Failed to fetch delivery zones");
      }
    } catch (e) {
      console.error("Error in fetchZones:", e);
    } finally {
      setZonesLoading(false);
    }
  };

  React.useEffect(() => {
    setDeliveryZones([]); // Reset zones to avoid any cross-establishment visual leakage
    setZonesLoading(true); // Default to loading state for clean transitions
    if (activeTab === 'entregas' || activeTab === 'geral') {
      fetchZones();
    } else {
      setZonesLoading(false);
    }
  }, [activeTab, merchantId]);

  // Operational Pendencies Settings & Constants
  const WAITING_ORDER_CRITICAL_MINUTES = 10;
  const WAITING_ORDER_HIGH_MINUTES = 5;

  interface OperationalPendency {
    id: string;
    type: 'pedido_aguardando' | 'pedido_atrasado' | 'mensagem_nao_respondida' | 'produto_sem_imagem' | 'promocao_encerrando' | 'horario_nao_configurado' | 'entrega_incompleta';
    title: string;
    description: string;
    priority: 'critica' | 'alta' | 'media' | 'informativa';
    timeLabel?: string;
    actionLabel: string;
    sortValue: number;
    onClick: () => void;
    targetId?: string;
  }

  const handleRetryPendencies = async () => {
    setIsRetryingPendencies(true);
    setPendenciesError(null);
    try {
      await fetchZones();
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e: any) {
      console.error("Erro ao tentar recarregar pendências:", {
        code: e.code || 'UNKNOWN',
        message: e.message,
        establishmentId: merchantId,
        origem: 'handleRetryPendencies'
      });
      setPendenciesError(e);
    } finally {
      setIsRetryingPendencies(false);
    }
  };

  const pendencies = useMemo<OperationalPendency[]>(() => {
    try {
      const list: OperationalPendency[] = [];
      
      // A. Pedidos Aguardando Confirmação
      merchantOrders.forEach(order => {
        const status = (order.status || '').toLowerCase().trim();
        if (status === 'aguardando_confirmacao') {
          const createdAtDate = parseOrderDate(order.createdAt);
          const elapsedMinutes = Math.floor((Date.now() - createdAtDate.getTime()) / 60000);
          let priority: 'critica' | 'alta' | 'media' = 'media';
          if (elapsedMinutes >= WAITING_ORDER_CRITICAL_MINUTES) {
            priority = 'critica';
          } else if (elapsedMinutes >= WAITING_ORDER_HIGH_MINUTES) {
            priority = 'alta';
          }
          
          list.push({
            id: `pedido_aguardando_${order.id}`,
            type: 'pedido_aguardando',
            title: "Pedido aguardando confirmação",
            description: `Pedido ${order.id} de ${order.customerName || 'Cliente'} aguardando confirmação há ${elapsedMinutes} ${elapsedMinutes === 1 ? 'minuto' : 'minutos'}.`,
            priority,
            timeLabel: elapsedMinutes <= 0 ? 'agora mesmo' : `há ${elapsedMinutes} min`,
            actionLabel: "Ver pedido",
            sortValue: createdAtDate.getTime(),
            onClick: () => {
              setSelectedOrder(order);
              setActiveTab('pedidos');
            },
            targetId: order.id
          });
        }
      });

      // B. Pedidos com Tempo de Preparo Excedido
      merchantOrders.forEach(order => {
        const status = (order.status || '').toLowerCase().trim();
        if (status === 'confirmado' || status === 'em_preparacao') {
          const startEntry = order.statusHistory?.find(h => h.status === 'em_preparacao') || order.statusHistory?.find(h => h.status === 'confirmado');
          const startTime = startEntry ? parseOrderDate(startEntry.timestamp) : parseOrderDate(order.createdAt);
          const elapsedMinutes = Math.floor((Date.now() - startTime.getTime()) / 60000);
          
          let estimatedMinutes = calculateEstimatedTotalMinutes(currentMerchant.baseEstimatedMinutes, 0) || 30;
          if (order.deliveryType === 'entrega' && deliveryZones.length > 0) {
            const zone = deliveryZones.find(z => z.neighborhoodName?.toLowerCase().trim() === order.customerAddress?.bairro?.toLowerCase().trim());
            if (zone) {
              estimatedMinutes = calculateEstimatedTotalMinutes(currentMerchant.baseEstimatedMinutes, zone.additionalEstimatedMinutes || 0) || (30 + (zone.additionalEstimatedMinutes || 0));
            }
          }
          
          const exceededMinutes = elapsedMinutes - estimatedMinutes;
          if (exceededMinutes > 0) {
            const priority = exceededMinutes >= 10 ? 'critica' : 'alta';
            list.push({
              id: `pedido_atrasado_${order.id}`,
              type: 'pedido_atrasado',
              title: "Preparo atrasado",
              description: `Pedido ${order.id} ultrapassou o tempo estimado de preparo em ${exceededMinutes} ${exceededMinutes === 1 ? 'minuto' : 'minutos'}.`,
              priority,
              timeLabel: `atrasado ${exceededMinutes} min`,
              actionLabel: "Atualizar pedido",
              sortValue: startTime.getTime(),
              onClick: () => {
                setSelectedOrder(order);
                setActiveTab('pedidos');
              },
              targetId: order.id
            });
          }
        }
      });

      // C. Mensagens não Respondidas
      merchantOrders.forEach(order => {
        const unreadCount = Number(order.chatUnreadMerchant ?? 0);
        if (unreadCount > 0) {
          const lastMsgTime = order.chatLastMessageAt ? parseOrderDate(order.chatLastMessageAt) : parseOrderDate(order.createdAt);
          list.push({
            id: `mensagem_${order.id}`,
            type: 'mensagem_nao_respondida',
            title: "Mensagens não respondidas",
            description: `Pedido ${order.id} de ${order.customerName || 'Cliente'} possui ${unreadCount} ${unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}.`,
            priority: 'alta',
            timeLabel: `${unreadCount} unread`,
            actionLabel: "Responder",
            sortValue: lastMsgTime.getTime(),
            onClick: () => {
              setChatOrder(order);
              setActiveTab('pedidos');
            },
            targetId: order.id
          });
        }
      });

      // D. Produtos sem Imagem
      const productsWithoutImage = merchantProducts.filter(p => 
        p.available && (
          !p.image || 
          p.image.trim() === '' || 
          p.image === 'placeholder_url' || 
          p.image.includes('placeholder')
        )
      );
      if (productsWithoutImage.length > 0) {
        list.push({
          id: 'produtos_sem_imagem',
          type: 'produto_sem_imagem',
          title: "Produtos sem imagem",
          description: `${productsWithoutImage.length} ${productsWithoutImage.length === 1 ? 'produto ativo está sem imagem' : 'produtos ativos estão sem imagem'}.`,
          priority: 'informativa',
          actionLabel: "Revisar catálogo",
          sortValue: 0,
          onClick: () => {
            setActiveTab('cardapio');
          }
        });
      }

      // E. Promoções Encerrando / Expiradas
      merchantProducts.forEach(p => {
        if (p.promotionEnabled && p.promotionEndsAt) {
          const endsAt = parseOrderDate(p.promotionEndsAt);
          const now = Date.now();
          if (endsAt.getTime() < now) {
            list.push({
              id: `promocao_expirada_${p.id}`,
              type: 'promocao_encerrando',
              title: "Promoção expirada",
              description: `A promoção do produto ${p.name} expirou e não está mais sendo aplicada.`,
              priority: 'informativa',
              actionLabel: "Atualizar promoção",
              sortValue: endsAt.getTime(),
              onClick: () => {
                handleOpenProductForm(p);
                setActiveTab('cardapio');
              },
              targetId: p.id
            });
          } else {
            const msRemaining = endsAt.getTime() - now;
            if (msRemaining <= 24 * 60 * 60 * 1000) {
              const hoursRemaining = msRemaining / 3600000;
              let priority: 'critica' | 'alta' | 'media' | 'informativa' = 'informativa';
              if (hoursRemaining <= 1) {
                priority = 'alta';
              } else if (hoursRemaining <= 6) {
                priority = 'media';
              }
              
              const hh = String(endsAt.getHours()).padStart(2, '0');
              const mm = String(endsAt.getMinutes()).padStart(2, '0');
              list.push({
                id: `promocao_encerrando_${p.id}`,
                type: 'promocao_encerrando',
                title: "Promoção encerrando em breve",
                description: `A promoção do produto ${p.name} encerra hoje às ${hh}:${mm}.`,
                priority,
                timeLabel: `restam ${Math.ceil(hoursRemaining)}h`,
                actionLabel: "Revisar promoção",
                sortValue: endsAt.getTime(),
                onClick: () => {
                  handleOpenProductForm(p);
                  setActiveTab('cardapio');
                },
                targetId: p.id
              });
            }
          }
        }
      });

      // F. Horário de Funcionamento Não Configurado
      const DAYS_OF_WEEK = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado"
      ];
      const todayIndex = new Date().getDay();
      const todayDayName = DAYS_OF_WEEK[todayIndex];

      const todayConfig = businessHours.find(h => h.day === todayDayName);
      const isNoHoursRegistered = businessHours.length === 0;
      const isTodayMissing = !todayConfig;
      const isTodayInvalid = todayConfig && todayConfig.isOpen && (
        !todayConfig.openTime || todayConfig.openTime.trim() === '' ||
        !todayConfig.closeTime || todayConfig.closeTime.trim() === '' ||
        !todayConfig.openTime.includes(':') || !todayConfig.closeTime.includes(':')
      );

      if (isNoHoursRegistered) {
        list.push({
          id: 'horario_não_configurado',
          type: 'horario_nao_configurado',
          title: "Horários não configurados",
          description: "Nenhum horário de funcionamento semanal está cadastrado.",
          priority: 'media',
          actionLabel: "Configurar horários",
          sortValue: 1,
          onClick: () => setActiveTab('horarios')
        });
      } else if (isTodayMissing) {
        list.push({
          id: 'horario_não_configurado',
          type: 'horario_nao_configurado',
          title: "Horário de hoje ausente",
          description: "O horário de funcionamento de hoje não está configurado.",
          priority: 'media',
          actionLabel: "Configurar horários",
          sortValue: 2,
          onClick: () => setActiveTab('horarios')
        });
      } else if (isTodayInvalid) {
        list.push({
          id: 'horario_não_configurado',
          type: 'horario_nao_configurado',
          title: "Horário incompleto",
          description: "O horário de funcionamento de hoje possui configuração incompleta ou inválida.",
          priority: 'media',
          actionLabel: "Configurar horários",
          sortValue: 3,
          onClick: () => setActiveTab('horarios')
        });
      }

      // G. Configuração de Entrega Incompleta
      const offersDelivery = !!(currentMerchant.acceptsDelivery || currentMerchant.entregaPropria);
      if (offersDelivery) {
        if (deliveryZones.length === 0) {
          list.push({
            id: 'entrega_incompleta',
            type: 'entrega_incompleta',
            title: "Entrega sem áreas configuradas",
            description: "A entrega está ativada, mas nenhuma zona de entrega foi configurada.",
            priority: 'media',
            actionLabel: "Configurar entregas",
            sortValue: 1,
            onClick: () => setActiveTab('entregas')
          });
        } else {
          const hasIncompleteZone = deliveryZones.some(z => 
            z.active && (
              z.deliveryFee === undefined || z.deliveryFee === null || isNaN(z.deliveryFee) ||
              z.additionalEstimatedMinutes === undefined || z.additionalEstimatedMinutes === null || isNaN(z.additionalEstimatedMinutes)
            )
          );
          const isBaseEstimatedTimeMissing = !currentMerchant.baseEstimatedMinutes || currentMerchant.baseEstimatedMinutes <= 0;
          
          if (hasIncompleteZone) {
            list.push({
              id: 'entrega_incompleta',
              type: 'entrega_incompleta',
              title: "Zonas de entrega incompletas",
              description: "Existem zonas de entrega ativas com configurações de taxa ou tempo incompletas.",
              priority: 'media',
              actionLabel: "Configurar entregas",
              sortValue: 2,
              onClick: () => setActiveTab('entregas')
            });
          } else if (isBaseEstimatedTimeMissing) {
            list.push({
              id: 'entrega_incompleta',
              type: 'entrega_incompleta',
              title: "Tempo de preparo do estabelecimento ausente",
              description: "O tempo de preparo do estabelecimento não está configurado.",
              priority: 'media',
              actionLabel: "Configurar entregas",
              sortValue: 3,
              onClick: () => setActiveTab('entregas')
            });
          }
        }
      }

      // Sort by Priority first, then by sortValue
      const priorityWeight = {
        critica: 4,
        alta: 3,
        media: 2,
        informativa: 1
      };

      return list.sort((a, b) => {
        const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (diff !== 0) return diff;
        return a.sortValue - b.sortValue;
      });

    } catch (err: any) {
      console.error("Erro ao calcular pendências operacionais:", {
        code: err.code || 'UNKNOWN',
        message: err.message,
        establishmentId: merchantId,
        origem: 'useMemo[pendencies]'
      });
      setPendenciesError(err);
      return [];
    }
  }, [merchantOrders, merchantProducts, businessHours, deliveryZones, currentMerchant, merchantId]);

  // Toggle delivery zone active status
  const handleToggleZoneStatus = async (zone: any) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const newStatus = !zone.active;
      const response = await fetch(`/api/admin/establishments/${merchantId}/delivery-zones/${zone.neighborhoodId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: newStatus })
      });
      if (response.ok) {
        showToast(`Status de ${zone.neighborhoodName} atualizado com sucesso!`, 'success');
        fetchZones();
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.error || 'Erro ao alterar status.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro de rede ao alterar status.', 'error');
    }
  };

  // Submit delivery zone (Create / Edit)
  const handleSaveZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneNeighborhoodId || !zoneNeighborhoodName) {
      showToast('Por favor, selecione um bairro.', 'error');
      return;
    }
    
    try {
      const token = await auth.currentUser?.getIdToken();
      const merchantCityId = currentMerchant.cityId || 'sao-joao-batista-do-gloria-mg';
      const body = {
        cityId: merchantCityId,
        neighborhoodId: zoneNeighborhoodId,
        neighborhoodName: zoneNeighborhoodName,
        deliveryFee: Number(zoneFee),
        additionalEstimatedMinutes: Number(zoneAdditionalMinutes),
        minimumOrderValue: zoneMinOrder.trim() !== '' ? Number(zoneMinOrder) : null,
        active: zoneActive
      };
      
      let url = `/api/admin/establishments/${merchantId}/delivery-zones`;
      let method = 'POST';
      
      if (editingZone) {
        url = `/api/admin/establishments/${merchantId}/delivery-zones/${editingZone.neighborhoodId}`;
        method = 'PUT';
      }
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        showToast('Regra de entrega salva com sucesso!', 'success');
        setIsZoneModalOpen(false);
        setEditingZone(null);
        fetchZones();
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.error || 'Erro ao salvar regra.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de rede ao salvar regra.', 'error');
    }
  };

  // Open modal for editing
  const handleOpenEditZoneModal = (zone: any) => {
    setEditingZone(zone);
    setZoneNeighborhoodId(zone.neighborhoodId);
    setZoneNeighborhoodName(zone.neighborhoodName);
    setZoneFee(zone.deliveryFee);
    setZoneAdditionalMinutes(zone.additionalEstimatedMinutes);
    setZoneMinOrder(zone.minimumOrderValue !== null && zone.minimumOrderValue !== undefined ? String(zone.minimumOrderValue) : '');
    setZoneActive(zone.active);
    setIsZoneModalOpen(true);
  };

  // Open modal for creating
  const handleOpenCreateZoneModal = () => {
    setEditingZone(null);
    setZoneNeighborhoodId('');
    setZoneNeighborhoodName('');
    setZoneFee(0);
    setZoneAdditionalMinutes(0);
    setZoneMinOrder('');
    setZoneActive(true);
    setIsZoneModalOpen(true);
  };

  // Local payment configurations
  const [acceptCash, setAcceptCash] = useState<boolean>(true);
  const [acceptPix, setAcceptPix] = useState<boolean>(true);
  const [acceptDebitCard, setAcceptDebitCard] = useState<boolean>(true);
  const [acceptCreditCard, setAcceptCreditCard] = useState<boolean>(true);
  const [acceptContactless, setAcceptContactless] = useState<boolean>(true);
  const [acceptsDelivery, setAcceptsDelivery] = useState<boolean>(true);
  const [acceptsPickup, setAcceptsPickup] = useState<boolean>(true);
  const [baseEstimatedMinutes, setBaseEstimatedMinutes] = useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (currentMerchant) {
      setAcceptCash(currentMerchant.acceptCash !== false);
      setAcceptPix(currentMerchant.acceptPix !== false);
      setAcceptDebitCard(currentMerchant.acceptDebitCard !== false);
      setAcceptCreditCard(currentMerchant.acceptCreditCard !== false);
      setAcceptContactless(currentMerchant.acceptContactless !== false);
      
      const deliveryVal = typeof currentMerchant.acceptsDelivery === 'boolean'
        ? currentMerchant.acceptsDelivery
        : (currentMerchant.entregaPropria !== false);
      const pickupVal = typeof currentMerchant.acceptsPickup === 'boolean'
        ? currentMerchant.acceptsPickup
        : (currentMerchant.atendeRetirada !== false);
      setAcceptsDelivery(deliveryVal);
      setAcceptsPickup(pickupVal);
      
      setBaseEstimatedMinutes(
        currentMerchant.baseEstimatedMinutes !== undefined 
          ? Number(currentMerchant.baseEstimatedMinutes) 
          : undefined
      );
    }
  }, [currentMerchant]);

  const handleSavePaymentConfig = async () => {
    if (!acceptsDelivery && !acceptsPickup) {
      showToast('Selecione ao menos uma modalidade: entrega ou retirada.', 'error');
      return;
    }

    const acceptedPaymentMethods = [];
    if (acceptCash) acceptedPaymentMethods.push('cash');
    if (acceptPix) acceptedPaymentMethods.push('pix');
    if (acceptDebitCard) acceptedPaymentMethods.push('debit_card');
    if (acceptCreditCard) acceptedPaymentMethods.push('credit_card');
    if (acceptContactless) acceptedPaymentMethods.push('contactless_nfc');

    const updatedMerchant = {
      ...currentMerchant,
      acceptCash,
      acceptPix,
      acceptDebitCard,
      acceptCreditCard,
      acceptContactless,
      acceptsDelivery,
      acceptsPickup,
      entregaPropria: acceptsDelivery,
      atendeRetirada: acceptsPickup,
      acceptedPaymentMethods,
      acceptDeliveryPayment: acceptsDelivery,
      acceptPickupPayment: acceptsPickup,
      fulfillment: {
        delivery: acceptsDelivery,
        pickup: acceptsPickup
      }
    };

    try {
      const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('pl_catalog_data_source') !== 'firestore';
      if (!isDemoMode) {
        await establishmentsRepository.saveEstablishment(updatedMerchant);
      }
      
      setEstablishments(prev =>
        prev.map(e => e.id === merchantId ? updatedMerchant : e)
      );
      showToast('Configurações salvas com sucesso!', 'success');
    } catch (error) {
      console.error("Erro ao salvar as configurações de pagamento:", error);
      showToast('Não foi possível salvar as configurações de pagamento.', 'error');
    }
  };

  // Handle business hour change
  const handleHourToggle = (idx: number) => {
    const updated = [...localHours];
    updated[idx].isOpen = !updated[idx].isOpen;
    setLocalHours(updated);
  };

  const handleHourTimeChange = (idx: number, field: 'openTime' | 'closeTime', val: string) => {
    const updated = [...localHours];
    updated[idx] = { ...updated[idx], [field]: val };
    setLocalHours(updated);
  };

  const handleSaveHours = () => {
    setBusinessHours(localHours);
  };

  // Handle neighborhood delivery change
  const handleNeighborhoodFeeChange = (idx: number, val: string) => {
    const feeNum = parseFloat(val) || 0;
    const updated = [...localNeighborhoods];
    updated[idx].fee = feeNum;
    setLocalNeighborhoods(updated);
  };

  const handleSaveNeighborhoods = () => {
    setNeighborhoods(localNeighborhoods);
  };

  const renderPendencyItem = (p: OperationalPendency) => {
    const Icon = p.type === 'pedido_aguardando' ? AlertCircle
      : p.type === 'pedido_atrasado' ? Clock
      : p.type === 'mensagem_nao_respondida' ? MessageSquare
      : p.type === 'produto_sem_imagem' ? ImageIcon
      : p.type === 'promocao_encerrando' ? Tag
      : p.type === 'horario_nao_configurado' ? Calendar
      : Truck;

    const priorityColors = {
      critica: {
        bg: 'bg-rose-50 border-rose-200 text-rose-700',
        badge: 'bg-rose-600 text-white',
        label: 'Crítica',
        iconColor: 'text-rose-600'
      },
      alta: {
        bg: 'bg-orange-50 border-orange-200 text-orange-700',
        badge: 'bg-orange-600 text-white',
        label: 'Alta',
        iconColor: 'text-orange-600'
      },
      media: {
        bg: 'bg-amber-50 border-amber-200 text-amber-700',
        badge: 'bg-amber-500 text-white',
        label: 'Média',
        iconColor: 'text-amber-600'
      },
      informativa: {
        bg: 'bg-slate-50 border-slate-200 text-slate-700',
        badge: 'bg-slate-500 text-white',
        label: 'Informativa',
        iconColor: 'text-slate-600'
      }
    };

    const colors = priorityColors[p.priority] || priorityColors.informativa;

    return (
      <div 
        key={p.id} 
        className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${colors.bg}`}
        id={`pendency-item-${p.id}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2 bg-white rounded-xl shadow-xs shrink-0 ${colors.iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-black text-[#201A17]">{p.title}</h4>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.badge}`}>
                {colors.label}
              </span>
            </div>
            <p className="text-xs text-[#5C534E] leading-relaxed break-words">{p.description}</p>
          </div>
        </div>
        
        <button
          onClick={p.onClick}
          className="self-end md:self-center bg-[#201A17] hover:bg-[#E94F2F] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0"
          aria-label={`${p.actionLabel}: ${p.title}`}
        >
          {p.actionLabel}
        </button>
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="bg-white rounded-3xl border border-[#EADFD8] p-8 text-center space-y-3 animate-fade-in" id="merchant-pendencies-empty">
      <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
        <CheckCircle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="font-extrabold text-sm text-[#201A17]">Tudo certo por aqui!</h4>
        <p className="text-xs text-[#756B66] max-w-md mx-auto leading-relaxed">
          Sua operação está configurada e não há ações pendentes no momento.
        </p>
      </div>
    </div>
  );

  const renderSkeletonState = () => (
    <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-4" id="merchant-pendencies-loading">
      <div className="flex justify-between items-center pb-2 border-b border-[#F7F4EF]">
        <div className="h-5 w-40 bg-gray-200 rounded-md animate-pulse" />
        <div className="h-6 w-12 bg-gray-200 rounded-full animate-pulse" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 rounded-2xl border border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse">
            <div className="flex items-start gap-3 w-full">
              <div className="p-2 bg-gray-200 rounded-xl w-9 h-9 shrink-0" />
              <div className="space-y-2 w-full">
                <div className="flex gap-2">
                  <div className="h-4 w-32 bg-gray-200 rounded-md" />
                  <div className="h-4 w-16 bg-gray-200 rounded-full" />
                </div>
                <div className="h-3 w-2/3 bg-gray-200 rounded-md" />
              </div>
            </div>
            <div className="h-8 w-24 bg-gray-200 rounded-xl self-end md:self-center" />
          </div>
        ))}
      </div>
    </div>
  );

  const renderErrorState = () => (
    <div className="bg-white rounded-3xl border border-[#EADFD8] p-8 text-center space-y-4" id="merchant-pendencies-error">
      <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="font-extrabold text-sm text-[#201A17]">Não foi possível verificar todas as pendências.</h4>
        <p className="text-xs text-[#756B66] max-w-md mx-auto leading-relaxed">
          Ocorreu um erro ao carregar os dados operacionais da loja. Por favor, tente novamente.
        </p>
      </div>
      <button
        onClick={handleRetryPendencies}
        className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 mx-auto"
      >
        <RefreshCw className="w-4 h-4" />
        <span>Tentar novamente</span>
      </button>
    </div>
  );

  return (
    <div className="bg-[#F7F4EF] min-h-screen pb-16 text-[#201A17]" id="merchant-panel-wrapper">
      
      {/* Merchant Title Bar */}
      <div className="bg-white border-b border-[#EADFD8] py-5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#E94F2F]/10 p-3 rounded-2xl">
              <Store className="w-8 h-8 text-[#E94F2F]" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-[#201A17] tracking-tight">{currentMerchant.name}</h2>
              <p className="text-xs text-[#756B66] font-semibold mt-0.5">
                Painel de Gerenciamento da Loja • {currentMerchant.cityName || currentMerchant.city || 'São João Batista do Glória'} - {currentMerchant.state || 'MG'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-0 bg-[#F7F4EF] rounded-2xl border border-[#EADFD8] w-full overflow-hidden" id="merchant-operational-indicators">
            {/* Control 1: Loja aberta / fechada */}
            <div className="flex items-center justify-between gap-2 border-r border-b md:border-b-0 border-[#EADFD8] p-3 min-w-0" id="indicator-store-status">
              <div className="text-left min-w-0">
                <p className="text-[10px] text-[#756B66] font-black uppercase leading-tight truncate">Loja</p>
                <p className={`text-[14px] font-black leading-tight truncate ${operationalState.storeStatus === 'open' ? 'text-[#2F9E69]' : 'text-rose-500'}`}>
                  {operationalState.storeStatus === 'open' ? 'Aberta' : 'Fechada'}
                </p>
              </div>
              <button
                onClick={toggleOpen}
                disabled={isStatusUpdating}
                className={`p-1.5 rounded-lg transition-all shrink-0 disabled:opacity-50 disabled:pointer-events-none ${operationalState.storeStatus === 'open' ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                title={operationalState.storeStatus === 'open' ? 'Fechar Loja' : 'Abrir Loja'}
                aria-label={operationalState.storeStatus === 'open' ? 'Fechar Loja' : 'Abrir Loja'}
              >
                {isStatusUpdating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Power className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Control 2: Aceitando Pedidos */}
            <div className="flex items-center justify-between gap-2 border-b md:border-r border-[#EADFD8] p-3 min-w-0" id="indicator-orders-status">
              <div className="text-left min-w-0">
                <p className="text-[10px] text-[#756B66] font-black uppercase leading-tight truncate">Pedidos</p>
                <p className={`text-[14px] font-black leading-tight truncate ${
                  operationalState.ordersStatus === 'accepting' 
                    ? 'text-[#2F9E69]' 
                    : operationalState.ordersStatus === 'paused' 
                      ? 'text-amber-600' 
                      : 'text-[#756B66]'
                }`}>
                  {operationalState.ordersStatus === 'accepting' 
                    ? 'Aceitando' 
                    : operationalState.ordersStatus === 'paused' 
                      ? 'Pausados' 
                      : 'Indisponíveis'}
                </p>
              </div>
              <button
                onClick={toggleAcceptingOrders}
                disabled={isStatusUpdating}
                className={`p-1.5 rounded-lg transition-all shrink-0 disabled:opacity-50 disabled:pointer-events-none ${
                  (currentMerchant.acceptingOrders !== false) 
                    ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' 
                    : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                }`}
                title={(currentMerchant.acceptingOrders !== false) ? 'Bloquear Pedidos' : 'Aceitar Pedidos'}
                aria-label={(currentMerchant.acceptingOrders !== false) ? 'Bloquear Pedidos' : 'Aceitar Pedidos'}
              >
                {isStatusUpdating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Control 3: Pausa temporária */}
            <div className="flex items-center justify-between gap-2 border-r md:border-r-0 border-[#EADFD8] p-3 min-w-0" id="indicator-pause-status">
              <div className="text-left min-w-0">
                <p className="text-[10px] text-[#756B66] font-black uppercase leading-tight truncate">Pausa</p>
                <p className={`text-[14px] font-black leading-tight truncate ${operationalState.pauseStatus === 'active' ? 'text-amber-600' : 'text-[#756B66]'}`}>
                  {operationalState.pauseStatus === 'active' 
                    ? (operationalState.pauseEndsAt 
                        ? (() => {
                            const hh = String(operationalState.pauseEndsAt.getHours()).padStart(2, '0');
                            const mm = String(operationalState.pauseEndsAt.getMinutes()).padStart(2, '0');
                            return `Retoma às ${hh}:${mm}`;
                          })()
                        : 'Ativada') 
                    : 'Sem pausa'}
                </p>
              </div>
              <button
                onClick={toggleTemporarilyPaused}
                disabled={isStatusUpdating}
                className={`p-1.5 rounded-lg transition-all shrink-0 disabled:opacity-50 disabled:pointer-events-none ${
                  operationalState.pauseStatus === 'active' 
                    ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' 
                    : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                }`}
                title={operationalState.pauseStatus === 'active' ? 'Remover Pausa' : 'Pausar Temporariamente'}
                aria-label={operationalState.pauseStatus === 'active' ? 'Remover Pausa' : 'Pausar Temporariamente'}
              >
                {isStatusUpdating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Clock className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            
            {/* Control 4: Som (mobile only) */}
            <div className="md:hidden flex items-center justify-between gap-2 border-t border-[#EADFD8] p-3 min-w-0" id="indicator-sound-control">
               <NotificationSoundControl showLabel={true} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 w-full box-border">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 min-w-0">
          
          {/* Collapsible Mobile Menu & Desktop Sidebar */}
          <div className="lg:col-span-1 bg-white p-3 rounded-2xl border border-[#EADFD8] shadow-sm self-start">
            {/* Mobile Header for Menu */}
            <div className="lg:hidden flex items-center justify-between">
              <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Menu Operacional</span>
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="px-3 py-1.5 bg-[#F7F4EF] text-xs font-bold text-[#201A17] rounded-lg flex items-center gap-1 border border-[#EADFD8]"
              >
                <span>{isMobileMenuOpen ? 'Fechar Menu' : 'Alterar Aba'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#756B66] transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* List of tabs */}
            <div className={`mt-3 lg:mt-0 space-y-1 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
              <p className="hidden lg:block text-[10px] font-black text-[#756B66] uppercase tracking-wider px-3.5 py-1">Menu Operacional</p>
              {[
                { id: 'geral', label: 'Visão Geral', icon: TrendingUp },
                { id: 'financeiro', label: 'Painel Financeiro', icon: DollarSign },
                { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag, badge: stats.waiting },
                { id: 'cardapio', label: 'Catálogo', icon: List },
                { id: 'horarios', label: 'Horários de Funcionamento', icon: Clock },
                { id: 'avaliacoes', label: 'Avaliações', icon: Star },
                { id: 'notificacoes', label: 'Notificações', icon: Bell },
                { id: 'entregas', label: 'Entregas e taxas', icon: Truck },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setIsMobileMenuOpen(false); // Auto close on select
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-[#E94F2F] text-white shadow-sm'
                        : 'text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4.5 h-4.5 shrink-0" />
                      <span>{tab.label}</span>
                    </span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isActive ? 'bg-white text-[#E94F2F]' : 'bg-[#E94F2F] text-white'}`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Sair button for authenticated merchants */}
              {isAuthenticated && (
                <div className="pt-3 mt-3 border-t border-[#EADFD8]">
                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        navigate('/');
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                  >
                    <LogOut className="w-4.5 h-4.5 shrink-0" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Display Area */}
          <div className="lg:col-span-3 space-y-6">

            {/* -------------------- TAB: GEROPAL (Visão Geral) -------------------- */}
            {activeTab === 'geral' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* 6 Grid cards requested in 2. PAINEL DO ESTABELECIMENTO */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Pedidos aguardando</p>
                    <p className="text-2xl font-black text-[#201A17]">{stats.waiting}</p>
                    <p className="text-[10px] text-amber-600 font-bold">Aguardando confirmação</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Pedidos em preparação</p>
                    <p className="text-2xl font-black text-[#201A17]">{stats.preparing}</p>
                    <p className="text-[10px] text-orange-600 font-bold">Na cozinha ativa</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Pedidos concluídos hoje</p>
                    <p className="text-2xl font-black text-[#201A17]">{stats.completedToday}</p>
                    <p className="text-[10px] text-[#2F9E69] font-bold">Entregues com sucesso</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">VALOR MOVIMENTADO HOJE</p>
                    <p className="text-2xl font-black text-[#2F9E69]">R$ {stats.revenue.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[10px] text-emerald-600 font-bold">VALOR DOS PEDIDOS CONCLUÍDOS</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Ticket médio</p>
                    <p className="text-2xl font-black text-[#201A17]">R$ {stats.ticketMedia.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[10px] text-[#756B66] font-bold">Valor médio p/ pedido</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Tempo médio de preparo</p>
                    <p className="text-2xl font-black text-[#E94F2F]">{stats.avgPrepTime}</p>
                    <p className="text-[10px] text-[#756B66] font-bold">Estimativa da cozinha</p>
                  </div>
                </div>

                {/* -------------------- CENTRAL DE PENDÊNCIAS OPERACIONAIS -------------------- */}
                {pendenciesError ? (
                  renderErrorState()
                ) : (zonesLoading || isRetryingPendencies) ? (
                  renderSkeletonState()
                ) : (
                  <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-4" id="merchant-operational-pendencies-section">
                    <div className="flex items-center justify-between pb-2 border-b border-[#F7F4EF]">
                      <div className="space-y-0.5 text-left">
                        <h3 className="font-extrabold text-sm text-[#201A17] flex items-center gap-2">
                          <span>Atenção necessária</span>
                          {pendencies.length > 0 && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              pendencies.some(p => p.priority === 'critica') ? 'bg-rose-100 text-rose-700' : 'bg-[#E94F2F]/10 text-[#E94F2F]'
                            }`}>
                              {pendencies.length}
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-[#756B66] font-semibold">
                          {pendencies.some(p => p.priority === 'critica') 
                            ? `${pendencies.filter(p => p.priority === 'critica').length} item(ns) crítico(s) exige(m) ação imediata.`
                            : "Confira o que precisa de ação na sua operação."}
                        </p>
                      </div>
                    </div>

                    {pendencies.length === 0 ? (
                      renderEmptyState()
                    ) : (
                      <div className="space-y-3 text-left">
                        {pendencies.slice(0, 5).map(p => renderPendencyItem(p))}
                        
                        {pendencies.length > 5 && (
                          <div className="pt-2 text-center">
                            <button
                              onClick={() => {
                                setPendencyFilter('todas');
                                setIsAllPendenciesModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-black text-[#E94F2F] hover:text-[#BD351C] transition-all bg-[#E94F2F]/5 px-4 py-2 rounded-xl"
                            >
                              <span>Ver todas as {pendencies.length} pendências</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Section Recent Activity requested in 2. PAINEL DO ESTABELECIMENTO */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-4">
                  <h3 className="font-extrabold text-sm text-[#201A17] flex items-center gap-2">
                    <Clock3 className="w-5 h-5 text-[#E94F2F]" />
                    <span>Atividade Recente da Loja</span>
                  </h3>
                  {merchantOrders.length === 0 ? (
                    <p className="text-xs text-[#756B66] italic py-4">Nenhuma atividade registrada hoje nesta filial.</p>
                  ) : (
                    <div className="divide-y divide-[#F7F4EF] text-xs font-semibold">
                      {merchantOrders.slice(0, 5).map((ord) => {
                        const timeStr = formatOrderTime(ord.createdAt);
                        return (
                          <div key={ord.id} className="py-3 flex items-center justify-between">
                            <div>
                              <p className="font-black text-[#201A17] flex items-center gap-2">
                                <span>{ord.id}</span>
                                <span className="bg-neutral-100 text-[#756B66] text-[9px] px-1.5 py-0.5 rounded font-bold">
                                  {ord.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                                </span>
                              </p>
                              <p className="text-[11px] text-[#756B66] font-medium mt-0.5">
                                {ord.customerName} • {ord.items.length} item(ns)
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-[#201A17]">R$ {ord.total.toFixed(2).replace('.', ',')}</p>
                              <p className="text-[9px] text-[#756B66] font-semibold">{timeStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: PEDIDOS RECEBIDOS -------------------- */}
            {activeTab === 'pedidos' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Categorized Filter Row */}
                <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col gap-3">
                  <div className="flex justify-between items-center gap-2">
                    <h3 className="font-extrabold text-base text-[#201A17] whitespace-nowrap">Pedidos sincronizados</h3>
                    <span className="bg-neutral-100 text-[#E94F2F] text-[12px] font-black px-2.5 py-1 rounded-full whitespace-nowrap">
                      {merchantOrders.length} pedidos
                    </span>
                  </div>

                  {/* Grid Filter for Categories */}
                  <div className="grid grid-cols-3 gap-1.5 w-full">
                    {[
                      { id: 'todos', label: 'Todos', count: merchantOrders.length },
                      { id: 'novos', label: 'Novos', count: categorizedOrders.novos.length, highlight: true },
                      { id: 'preparacao', label: 'Preparação', count: categorizedOrders.emPreparacao.length },
                      { id: 'prontos', label: 'Prontos', count: categorizedOrders.prontos.length },
                      { id: 'entrega', label: 'Entrega', count: categorizedOrders.emEntrega.length },
                      { id: 'concluidos', label: 'Concluídos', count: categorizedOrders.concluidos.length + (categorizedOrders.attentionOrders?.length || 0), quiet: true },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        onClick={() => setPedidosFilter(pill.id as any)}
                        className={`px-1 py-1.5 rounded-lg text-[10px] font-bold transition-all shrink-0 flex flex-col items-center justify-center gap-0.5 ${
                          pedidosFilter === pill.id
                            ? 'bg-[#201A17] text-[#FFBE5C]'
                            : pill.highlight && pill.count > 0
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                            : 'bg-[#F7F4EF] text-[#756B66] hover:bg-neutral-200'
                        }`}
                      >
                        <span className="truncate w-full text-center">{pill.label}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                          pedidosFilter === pill.id
                            ? 'bg-[#FFBE5C] text-[#201A17]'
                            : 'bg-[#EADFD8] text-[#201A17]'
                        }`}>
                          {pill.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main list according to filtered category */}
                <div className="space-y-6">
                  
                  {/* NOVOS PEDIDOS SECTION */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'novos') && categorizedOrders.novos.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                        </span>
                        <h4 className="text-xs font-black text-rose-600 uppercase tracking-wider">Novos Pedidos ({categorizedOrders.novos.length})</h4>
                      </div>

                      {categorizedOrders.novos.map((order) => {
                        const unreadMerchant = Number(order.chatUnreadMerchant ?? 0);
                        const hasUnreadMerchant = unreadMerchant > 0;
                        return (
                          <div 
                            key={order.id} 
                            onClick={() => setSelectedOrder(order)}
                            className="relative bg-white rounded-3xl border-2 border-amber-300 shadow-md p-6 space-y-4 overflow-hidden cursor-pointer hover:border-amber-400 hover:shadow-lg transition-all"
                            id={`order-card-${order.id}`}
                          >
                          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 animate-pulse" />
                          
                          <div className="flex flex-wrap justify-between items-start gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  Novo pedido
                                </span>
                                <h4 className="font-black text-lg text-[#201A17]">{order.id}</h4>
                                <span className="bg-[#F7F4EF] text-[#756B66] text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                  {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                                </span>
                              </div>
                              <p className="text-[10px] text-[#756B66] font-bold mt-1.5 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                <span>Recebido às {formatOrderTime(order.createdAt)} • <strong>{getElapsedMinutes(order.createdAt)}</strong></span>
                              </p>
                              <p className="text-xs text-[#756B66] font-medium mt-1">
                                Cliente: <strong>{order.customerName}</strong> ({order.customerPhone})
                              </p>
                              <p className="text-xs text-[#756B66] font-medium">
                                Endereço: {order.customerAddress?.street || 'Sem endereço'}, {order.customerAddress?.number || ''} - {order.customerAddress?.bairro || ''}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-[10px] text-[#756B66] font-black uppercase">Pagamento</p>
                              <p className="text-xs font-bold text-[#201A17] uppercase">{getPaymentMethodLabel(order.paymentMethod, order.deliveryType)}</p>
                              <p className="text-lg font-black text-[#2F9E69] mt-0.5">R$ {order.total.toFixed(2).replace('.', ',')}</p>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="bg-[#F7F4EF] p-4 rounded-2xl space-y-2 text-xs">
                            <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Produtos</p>
                            <div className="space-y-2 font-semibold text-[#201A17]">
                              {order.items.map((rawItem, idx) => {
                                const item = normalizeOrderItem(rawItem);
                                return (
                                  <div key={idx} className="border-b border-[#EADFD8]/40 pb-1.5 last:border-0 last:pb-0">
                                    <div className="flex justify-between font-bold text-[#201A17]">
                                      <span>{item.quantity}x {item.productName}</span>
                                      <span>R$ {item.lineTotal.toFixed(2).replace('.', ',')}</span>
                                    </div>
                                    <div className="pl-4 text-[10px] text-[#756B66] space-y-2 mt-1">
                                      {(() => {
                                        const customizationLines = getCartItemCustomizationLines(item);
                                        const groupedCustomizations = customizationLines.reduce((acc, line) => {
                                          const existing = acc.find(g => g.groupName === line.groupName);
                                          if (existing) {
                                            existing.options.push(line);
                                          } else {
                                            acc.push({
                                              groupName: line.groupName,
                                              options: [line]
                                            });
                                          }
                                          return acc;
                                        }, [] as { groupName: string; options: typeof customizationLines }[]);

                                        return (
                                          <>
                                            {groupedCustomizations.map((group, gIdx) => (
                                              <div key={gIdx} className="space-y-0.5">
                                                <p className="text-[9px] font-bold text-[#756B66]/80 uppercase tracking-wider">
                                                  {group.groupName}
                                                </p>
                                                <div className="space-y-0.5 pl-1.5 border-l border-gray-200">
                                                  {group.options.map((opt, oIdx) => {
                                                    const hasQty = opt.quantity && opt.quantity > 1;
                                                    const displayName = hasQty ? `${opt.optionName} × ${opt.quantity}` : opt.optionName;
                                                    const priceText = opt.additionalPrice > 0 
                                                      ? ` (+ R$ ${(opt.additionalPrice * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')})` 
                                                      : opt.additionalPrice < 0 
                                                        ? ` (- R$ ${(Math.abs(opt.additionalPrice) * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')})` 
                                                        : ' (Incluso)';

                                                    return (
                                                      <p key={oIdx} className="text-[10px]">
                                                        {displayName}{priceText}
                                                      </p>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            ))}
                                          </>
                                        );
                                      })()}

                                      {item.notes && <p className="italic text-amber-700">Obs: "{item.notes}"</p>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {order.notes && (
                              <p className="text-rose-600 font-bold italic mt-2">“{order.notes}”</p>
                            )}
                          </div>

                          {renderOrderPaymentSection(order)}

                          {/* Observation input for audit trail */}
                          <div className="flex flex-col gap-1 pt-1.5 w-full">
                            <label className="text-[10px] font-black text-[#8A7F79] uppercase">Observação / Histórico (Opcional):</label>
                            <input
                              type="text"
                              placeholder="Ex: Confirmei os itens, saindo para entrega, etc..."
                              onClick={(e) => e.stopPropagation()}
                              value={orderObservations[order.id] || ''}
                              onChange={(e) => setOrderObservations(prev => ({ ...prev, [order.id]: e.target.value }))}
                              className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                             />
                           </div>

                           {console.log("MERCHANT_CARD_CHAT_DEBUG", {
                            id: order.id,
                            chatUnreadMerchant: order.chatUnreadMerchant,
                            chatUnreadCustomer: order.chatUnreadCustomer,
                            chatLastMessage: order.chatLastMessage,
                            chatLastSenderRole: order.chatLastSenderRole,
                            fullOrder: order
                          })}
                          <div style={{ display: "none" }}>
                            DEBUG CHAT: id={String(order.id)} unread={String(order.chatUnreadMerchant)} lastRole={String(order.chatLastSenderRole)} lastMessage={String(order.chatLastMessage)}
                          </div>

                          {/* Action Buttons as requested */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#F7F4EF]">
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'recusado')}
                              className="w-full sm:w-auto px-4 py-2.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-xl font-bold text-xs transition-all"
                            >
                              Recusar
                            </button>
                            <button
                              type="button"
                              onClick={() => setChatOrder(order)}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                                hasUnreadMerchant
                                  ? 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C] shadow-md'
                                  : 'bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]'
                              }`}
                            >
                              <MessageSquare className={`w-4 h-4 ${hasUnreadMerchant ? 'text-white' : 'text-orange-600'}`} />
                              <span>
                                {hasUnreadMerchant
                                  ? `${unreadMerchant} nova${unreadMerchant > 1 ? 's' : ''} mensagem${unreadMerchant > 1 ? 'ns' : ''}`
                                  : 'Conversar com o cliente'}
                              </span>
                              {hasUnreadMerchant && (
                                <span className="relative flex h-2 w-2 ml-1">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                </span>
                              )}
                            </button>
                            {order.chatLastMessage && (
                              <div className="text-[10px] text-[#756B66] font-medium truncate w-full sm:w-auto mt-2 sm:mt-0">
                                {order.chatLastSenderRole === 'customer' ? order.customerName : 'Você'}: {order.chatLastMessage}
                              </div>
                            )}
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'confirmado')}
                              className="w-full sm:flex-1 py-3 bg-[#2F9E69] hover:bg-emerald-700 text-white rounded-xl font-black text-sm shadow-md transition-all text-center"
                            >
                              Aceitar pedido
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  )}

                  {/* EM PREPARAÇÃO SECTION */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'preparacao') && (categorizedOrders.emPreparacao.length > 0) && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-orange-600 uppercase tracking-wider">Em Preparação / Confirmados ({categorizedOrders.emPreparacao.length})</h4>
                      
                      {categorizedOrders.emPreparacao.map((order) => {
                        const unreadMerchant = Number(order.chatUnreadMerchant ?? 0);
                        const hasUnreadMerchant = unreadMerchant > 0;
                        return (
                        <div key={order.id} id={`order-card-${order.id}`} className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
                          <div className="flex justify-between items-start border-b border-[#F7F4EF] pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-base text-[#201A17]">{order.id}</h4>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                                  order.status === 'confirmado' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                                }`}>
                                  {order.status === 'confirmado' ? 'Confirmado' : 'Em Preparação'}
                                </span>
                                <span className="bg-[#F7F4EF] text-[#756B66] text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                  {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                                </span>
                              </div>
                              <p className="text-xs text-[#756B66] font-medium mt-1">
                                Cliente: <strong>{order.customerName}</strong> ({order.customerPhone})
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-black text-[#2F9E69]">R$ {order.total.toFixed(2).replace('.', ',')}</p>
                              <p className="text-[10px] text-[#756B66] font-bold uppercase">{order.paymentMethod}</p>
                            </div>
                          </div>

                          {/* Items list */}
                          <div className="bg-[#F7F4EF]/60 p-4 rounded-xl space-y-2 text-xs">
                            {order.items.map((rawItem, idx) => {
                              const item = normalizeOrderItem(rawItem);
                              return (
                                <div key={idx} className="border-b border-[#EADFD8]/40 pb-1.5 last:border-0 last:pb-0 space-y-0.5">
                                  <div className="flex justify-between font-bold text-[#201A17]">
                                    <span>{item.quantity}x {item.productName}</span>
                                    <span>R$ {item.lineTotal.toFixed(2).replace('.', ',')}</span>
                                  </div>
                                  <div className="pl-4 text-[10px] text-[#756B66] space-y-2 mt-1">
                                    {(() => {
                                      const customizationLines = getCartItemCustomizationLines(item);
                                      const groupedCustomizations = customizationLines.reduce((acc, line) => {
                                        const existing = acc.find(g => g.groupName === line.groupName);
                                        if (existing) {
                                          existing.options.push(line);
                                        } else {
                                          acc.push({
                                            groupName: line.groupName,
                                            options: [line]
                                          });
                                        }
                                        return acc;
                                      }, [] as { groupName: string; options: typeof customizationLines }[]);

                                      return (
                                        <>
                                          {groupedCustomizations.map((group, gIdx) => (
                                            <div key={gIdx} className="space-y-0.5">
                                              <p className="text-[9px] font-bold text-[#756B66]/80 uppercase tracking-wider">
                                                {group.groupName}
                                              </p>
                                              <div className="space-y-0.5 pl-1.5 border-l border-gray-200">
                                                {group.options.map((opt, oIdx) => {
                                                  const hasQty = opt.quantity && opt.quantity > 1;
                                                  const displayName = hasQty ? `${opt.optionName} × ${opt.quantity}` : opt.optionName;
                                                  const priceText = opt.additionalPrice > 0 
                                                    ? ` (+ R$ ${(opt.additionalPrice * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')})` 
                                                    : opt.additionalPrice < 0 
                                                      ? ` (- R$ ${(Math.abs(opt.additionalPrice) * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')})` 
                                                      : ' (Incluso)';

                                                  return (
                                                    <p key={oIdx} className="text-[10px]">
                                                      {displayName}{priceText}
                                                    </p>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ))}
                                        </>
                                      );
                                    })()}

                                    {item.notes && <p className="italic text-amber-700">Obs: "{item.notes}"</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {renderOrderPaymentSection(order)}

                          {/* Observation input for audit trail */}
                          <div className="flex flex-col gap-1 pt-1.5 w-full">
                            <label className="text-[10px] font-black text-[#8A7F79] uppercase">Observação / Histórico (Opcional):</label>
                            <input
                              type="text"
                              placeholder="Ex: Começamos o preparo, pronto para retirada, etc..."
                              value={orderObservations[order.id] || ''}
                              onChange={(e) => setOrderObservations(prev => ({ ...prev, [order.id]: e.target.value }))}
                              className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                            />
                          </div>

                          {/* Separation of Actions */}
                          {console.log("MERCHANT_CARD_CHAT_DEBUG", {
                            id: order.id,
                            chatUnreadMerchant: order.chatUnreadMerchant,
                            chatUnreadCustomer: order.chatUnreadCustomer,
                            chatLastMessage: order.chatLastMessage,
                            chatLastSenderRole: order.chatLastSenderRole,
                            fullOrder: order
                          })}
                          <div style={{ display: "none" }}>
                            DEBUG CHAT: id={String(order.id)} unread={String(order.chatUnreadMerchant)} lastRole={String(order.chatLastSenderRole)} lastMessage={String(order.chatLastMessage)}
                          </div>

                          <div className="flex justify-between items-center pt-2">
                            <button
                              type="button"
                              onClick={() => setChatOrder(order)}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                                hasUnreadMerchant
                                  ? 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C] shadow-md'
                                  : 'bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]'
                              }`}
                            >
                              <MessageSquare className={`w-4 h-4 ${hasUnreadMerchant ? 'text-white' : 'text-orange-600'}`} />
                              <span>
                                {hasUnreadMerchant
                                  ? `${unreadMerchant} nova${unreadMerchant > 1 ? 's' : ''} mensagem${unreadMerchant > 1 ? 'ns' : ''}`
                                  : 'Conversar com o cliente'}
                              </span>
                              {hasUnreadMerchant && (
                                <span className="relative flex h-2 w-2 ml-1">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                </span>
                              )}
                            </button>
                            {order.status === 'confirmado' ? (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'em_preparacao')}
                                className="px-5 py-2.5 bg-[#E94F2F] hover:bg-[#BD351C] text-white rounded-xl font-bold text-xs transition-colors"
                              >
                                Iniciar preparação
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, order.deliveryType === 'entrega' ? 'pronto' : 'pronto_retirada')}
                                className="px-5 py-2.5 bg-[#2F9E69] hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors"
                              >
                                Marcar como pronto
                              </button>
                            )}
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {/* PRONTOS SECTION */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'prontos') && (categorizedOrders.prontos.length > 0) && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-emerald-600 uppercase tracking-wider">Aguardando Saída / Prontos ({categorizedOrders.prontos.length})</h4>
                      
                      {categorizedOrders.prontos.map((order) => {
                        const unreadMerchant = Number(order.chatUnreadMerchant ?? 0);
                        const hasUnreadMerchant = unreadMerchant > 0;
                        return (
                        <div key={order.id} id={`order-card-${order.id}`} className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
                          <div className="flex justify-between items-start border-b border-[#F7F4EF] pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-base text-[#201A17]">{order.id}</h4>
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                  {order.status === 'pronto_retirada' ? 'Pronto p/ Retirada' : 'Pronto p/ Entrega'}
                                </span>
                                <span className="bg-[#F7F4EF] text-[#756B66] text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                  {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                                </span>
                              </div>
                              <p className="text-xs text-[#756B66] font-medium mt-1">
                                Cliente: <strong>{order.customerName}</strong> ({order.customerPhone})
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-black text-[#2F9E69]">R$ {order.total.toFixed(2).replace('.', ',')}</p>
                            </div>
                          </div>

                          {renderOrderPaymentSection(order)}

                          {/* Observation input for audit trail */}
                          <div className="flex flex-col gap-1 pt-1.5 w-full">
                            <label className="text-[10px] font-black text-[#8A7F79] uppercase">Observação / Histórico (Opcional):</label>
                            <input
                              type="text"
                              placeholder="Ex: Motoqueiro saiu, pronto para retirada, etc..."
                              value={orderObservations[order.id] || ''}
                              onChange={(e) => setOrderObservations(prev => ({ ...prev, [order.id]: e.target.value }))}
                              className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                            />
                          </div>

                          {console.log("MERCHANT_CARD_CHAT_DEBUG", {
                            id: order.id,
                            chatUnreadMerchant: order.chatUnreadMerchant,
                            chatUnreadCustomer: order.chatUnreadCustomer,
                            chatLastMessage: order.chatLastMessage,
                            chatLastSenderRole: order.chatLastSenderRole,
                            fullOrder: order
                          })}
                          <div style={{ display: "none" }}>
                            DEBUG CHAT: id={String(order.id)} unread={String(order.chatUnreadMerchant)} lastRole={String(order.chatLastSenderRole)} lastMessage={String(order.chatLastMessage)}
                          </div>

                          <div className="flex justify-between items-center pt-2">
                            <button
                              type="button"
                              onClick={() => setChatOrder(order)}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                                hasUnreadMerchant
                                  ? 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C] shadow-md'
                                  : 'bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]'
                              }`}
                            >
                              <MessageSquare className={`w-4 h-4 ${hasUnreadMerchant ? 'text-white' : 'text-orange-600'}`} />
                              <span>
                                {hasUnreadMerchant
                                  ? `${unreadMerchant} nova${unreadMerchant > 1 ? 's' : ''} mensagem${unreadMerchant > 1 ? 'ns' : ''}`
                                  : 'Conversar com o cliente'}
                              </span>
                              {hasUnreadMerchant && (
                                <span className="relative flex h-2 w-2 ml-1">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                </span>
                              )}
                            </button>
                            {order.deliveryType === 'entrega' ? (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'saiu_entrega')}
                                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-xs transition-colors"
                              >
                                Saiu para entrega
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'concluido')}
                                className="px-5 py-2.5 bg-[#2F9E69] hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors"
                              >
                                Marcar como Retirado
                              </button>
                            )}
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {/* EM ENTREGA SECTION */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'entrega') && (categorizedOrders.emEntrega.length > 0) && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-wider">Saiu para Entrega ({categorizedOrders.emEntrega.length})</h4>
                      
                      {categorizedOrders.emEntrega.map((order) => {
                        const unreadMerchant = Number(order.chatUnreadMerchant ?? 0);
                        const hasUnreadMerchant = unreadMerchant > 0;
                        return (
                        <div key={order.id} id={`order-card-${order.id}`} className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
                          <div className="flex justify-between items-start border-b border-[#F7F4EF] pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-base text-[#201A17]">{order.id}</h4>
                                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                  Em Trânsito
                                </span>
                              </div>
                              <p className="text-xs text-[#756B66] font-medium mt-1">
                                Endereço: <strong>{order.customerAddress?.street || 'Sem endereço'}, {order.customerAddress?.number || ''}</strong>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-black text-[#2F9E69]">R$ {order.total.toFixed(2).replace('.', ',')}</p>
                            </div>
                          </div>

                          {renderOrderPaymentSection(order)}

                          {/* Observation input for audit trail */}
                          <div className="flex flex-col gap-1 pt-1.5 w-full">
                            <label className="text-[10px] font-black text-[#8A7F79] uppercase">Observação / Histórico (Opcional):</label>
                            <input
                              type="text"
                              placeholder="Ex: Entregue para o cliente, etc..."
                              value={orderObservations[order.id] || ''}
                              onChange={(e) => setOrderObservations(prev => ({ ...prev, [order.id]: e.target.value }))}
                              className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                            />
                          </div>

                          {console.log("MERCHANT_CARD_CHAT_DEBUG", {
                            id: order.id,
                            chatUnreadMerchant: order.chatUnreadMerchant,
                            chatUnreadCustomer: order.chatUnreadCustomer,
                            chatLastMessage: order.chatLastMessage,
                            chatLastSenderRole: order.chatLastSenderRole,
                            fullOrder: order
                          })}
                          <div style={{ display: "none" }}>
                            DEBUG CHAT: id={String(order.id)} unread={String(order.chatUnreadMerchant)} lastRole={String(order.chatLastSenderRole)} lastMessage={String(order.chatLastMessage)}
                          </div>

                          <div className="flex justify-between items-center pt-2">
                            <button
                              type="button"
                              onClick={() => setChatOrder(order)}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                                hasUnreadMerchant
                                  ? 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C] shadow-md'
                                  : 'bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]'
                              }`}
                            >
                              <MessageSquare className={`w-4 h-4 ${hasUnreadMerchant ? 'text-white' : 'text-orange-600'}`} />
                              <span>
                                {hasUnreadMerchant
                                  ? `${unreadMerchant} nova${unreadMerchant > 1 ? 's' : ''} mensagem${unreadMerchant > 1 ? 'ns' : ''}`
                                  : 'Conversar com o cliente'}
                              </span>
                              {hasUnreadMerchant && (
                                <span className="relative flex h-2 w-2 ml-1">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'concluido')}
                              disabled={updatingOrders[order.id]}
                              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                                updatingOrders[order.id]
                                  ? 'bg-emerald-600/50 cursor-not-allowed text-emerald-100'
                                  : 'bg-[#2F9E69] hover:bg-emerald-700 text-white'
                              }`}
                            >
                              {updatingOrders[order.id] ? 'Concluindo...' : 'Concluir pedido'}
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {/* ATENÇÃO PÓS-PEDIDO SECTION */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'concluidos') && (categorizedOrders.attentionOrders && categorizedOrders.attentionOrders.length > 0) && (
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-[#E94F2F] uppercase tracking-wider">
                          Atenção pós-pedido
                        </h4>
                        <span className="bg-[#E94F2F]/10 text-[#E94F2F] text-[10px] font-black px-2 py-0.5 rounded-full">
                          {categorizedOrders.attentionOrders.length}
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        {categorizedOrders.attentionOrders.map((order) => {
                          const unreadCount = order.chatUnreadMerchant ?? 0;
                          const lastMessage = order.chatLastMessage || 'Nova mensagem recebida';
                          const lastMessageTime = formatChatTime(order.chatLastMessageAt);

                          return (
                            <div
                              key={order.id}
                              id={`order-card-${order.id}`}
                              onClick={() => setSelectedOrder(order)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedOrder(order);
                                }
                              }}
                              tabIndex={0}
                              className="relative bg-[#FFF9F6] rounded-3xl border border-[#E94F2F]/20 p-5 space-y-3 cursor-pointer hover:bg-[#FFF5F0]/90 hover:border-[#E94F2F]/30 transition-all duration-150 active:scale-[0.99] flex justify-between items-center group focus:outline-hidden focus:ring-2 focus:ring-[#E94F2F]/25 text-left"
                            >
                              {/* Left side accent bar */}
                              <div className="absolute left-0 top-4 bottom-4 w-[4px] bg-[#E94F2F] rounded-r-lg" />
                              
                              <div className="space-y-2.5 flex-1 pl-3 min-w-0">
                                <div className="flex flex-wrap justify-between items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-[#201A17] text-sm">{order.id}</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                                      order.status === 'concluido' ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                                    }`}>
                                      {order.status === 'concluido' ? 'Concluído' : 'Recusado'}
                                    </span>
                                    <span className="bg-[#E94F2F]/10 text-[#E94F2F] text-[9px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                                      <MessageSquare className="w-2.5 h-2.5" />
                                      <span>Nova mensagem ({unreadCount})</span>
                                    </span>
                                  </div>
                                  {lastMessageTime && (
                                    <span className="text-[10px] text-neutral-400 font-medium">
                                      {lastMessageTime}
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <p className="text-xs text-[#201A17] font-extrabold">
                                    Cliente: <span className="font-medium text-neutral-600">{order.customerName}</span>
                                  </p>
                                  <p className="text-[10px] text-neutral-500 font-semibold">
                                    Total: R$ {order.total.toFixed(2).replace('.', ',')} • {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                                  </p>
                                </div>

                                {/* Message Preview */}
                                <div className="bg-white/80 p-2.5 rounded-xl border border-[#E94F2F]/10 text-xs flex items-start gap-2 min-w-0">
                                  <MessageSquare className="w-3.5 h-3.5 text-[#E94F2F]/75 mt-0.5 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">
                                      Última mensagem:
                                    </p>
                                    <p className="text-xs text-neutral-700 font-semibold line-clamp-2 italic break-words">
                                      “{lastMessage}”
                                    </p>
                                  </div>
                                </div>

                                {/* Ver mensagem Action Indicator */}
                                <div className="flex items-center gap-1 text-[11px] font-black text-[#E94F2F] uppercase tracking-wider pt-0.5">
                                  <span>Ver mensagem</span>
                                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                              </div>

                              <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-[#E94F2F] transition-colors shrink-0 ml-4" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CONCLUÍDOS SECTION - Appearence more quiet / discreta */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'concluidos') && (categorizedOrders.concluidos.length > 0) && (
                    <div className="space-y-3 opacity-65 saturate-75 hover:opacity-100 transition-all">
                      <h4 className="text-xs font-black text-neutral-500 uppercase tracking-wider">Histórico de Pedidos Fechados ({categorizedOrders.concluidos.length})</h4>
                      
                      {categorizedOrders.concluidos.map((order) => (
                        <div 
                          key={order.id} 
                          id={`order-card-${order.id}`}
                          onClick={() => setSelectedOrder(order)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedOrder(order);
                            }
                          }}
                          tabIndex={0}
                          className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 space-y-2 cursor-pointer hover:bg-neutral-100/85 hover:border-neutral-300 transition-all duration-150 active:scale-[0.99] flex justify-between items-center group focus:outline-hidden focus:ring-2 focus:ring-[#E94F2F]/25"
                        >
                          <div className="space-y-2 flex-1 text-left">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-[#201A17]">{order.id} - {order.customerName}</span>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                                order.status === 'concluido' ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                              }`}>
                                {order.status === 'concluido' ? 'Concluído' : 'Recusado'}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-500 font-medium">
                              Total: R$ {order.total.toFixed(2).replace('.', ',')} • {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors ml-4 shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* EMPTY SEARCH CHECK */}
                  {merchantOrders.length > 0 && 
                   categorizedOrders.novos.length === 0 && 
                   categorizedOrders.emPreparacao.length === 0 && 
                   categorizedOrders.prontos.length === 0 && 
                   categorizedOrders.emEntrega.length === 0 && 
                   (!categorizedOrders.attentionOrders || categorizedOrders.attentionOrders.length === 0) && 
                   categorizedOrders.concluidos.length === 0 && (
                    <div className="bg-white p-12 text-center rounded-2xl border border-[#EADFD8] text-[#756B66] text-xs">
                      Sem correspondência de pedidos para este filtro.
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: GERENCIAR CATÁLOGO (Cardápio) -------------------- */}
            {activeTab === 'cardapio' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Segment Selector */}
                <div className="flex border-b border-[#EADFD8] gap-4">
                  <button
                    onClick={() => setMenuTab('produtos')}
                    className={`pb-3 text-sm font-black transition-all border-b-2 px-1 ${
                      menuTab === 'produtos'
                        ? 'border-[#E94F2F] text-[#E94F2F]'
                        : 'border-transparent text-[#756B66] hover:text-[#201A17]'
                    }`}
                  >
                    Produtos
                  </button>
                  <button
                    onClick={() => setMenuTab('categorias')}
                    className={`pb-3 text-sm font-black transition-all border-b-2 px-1 ${
                      menuTab === 'categorias'
                        ? 'border-[#E94F2F] text-[#E94F2F]'
                        : 'border-transparent text-[#756B66] hover:text-[#201A17]'
                    }`}
                  >
                    Categorias do Catálogo
                  </button>
                </div>

                {menuTab === 'categorias' ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#EADFD8]">
                      <div>
                        <h3 className="font-extrabold text-base text-[#201A17]">Categorias do Catálogo ({(menuCategories[merchantId] || []).length})</h3>
                        <p className="text-xs text-[#756B66]">Crie e ordene categorias exclusivas para seu estabelecimento</p>
                      </div>

                      <button
                        onClick={() => {
                          setEditingCategory(null);
                          setCatName('');
                          setCatSortOrder(String(((menuCategories[merchantId] || []).length) + 1));
                          setCatActive(true);
                          setIsCategoryModalOpen(true);
                        }}
                        className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Nova Categoria</span>
                      </button>
                    </div>

                    <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                              <th className="py-3.5 px-4">Nome da Categoria</th>
                              <th className="py-3.5 px-4">Ordem de Exibição</th>
                              <th className="py-3.5 px-4">Status</th>
                              <th className="py-3.5 px-4 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F7F4EF] text-xs font-semibold">
                            {(menuCategories[merchantId] || []).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-8 px-4 text-center text-[#756B66] font-medium">
                                  Nenhuma categoria cadastrada. Cadastre sua primeira categoria para começar!
                                </td>
                              </tr>
                            ) : (
                              (menuCategories[merchantId] || []).map((cat) => (
                                <tr key={cat.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                                  <td className="py-4 px-4 font-bold text-[#201A17]">{cat.name}</td>
                                  <td className="py-4 px-4 text-[#756B66]">{cat.sortOrder}</td>
                                  <td className="py-4 px-4">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                      cat.active 
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                                    }`}>
                                      {cat.active ? 'Ativa' : 'Inativa'}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-right space-x-2">
                                    <button
                                      onClick={() => {
                                        setEditingCategory(cat);
                                        setCatName(cat.name);
                                        setCatSortOrder(String(cat.sortOrder));
                                        setCatActive(cat.active);
                                        setIsCategoryModalOpen(true);
                                      }}
                                      className="text-amber-600 hover:text-amber-800 font-bold transition-colors"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => {
                                        const linkedProds = merchantProducts.filter(p => p.menuCategoryId === cat.id);
                                        setCatToDelete(cat);
                                        setProductsLinkedToCat(linkedProds);
                                      }}
                                      className="text-rose-600 hover:text-rose-800 font-bold transition-colors"
                                    >
                                      Excluir
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#EADFD8]">
                      <div>
                        <h3 className="font-extrabold text-base text-[#201A17]">Produtos Cadastrados ({merchantProducts.length})</h3>
                        <p className="text-xs text-[#756B66]">Altere preços, descrições e disponibilidades</p>
                      </div>

                      <button
                        onClick={() => handleOpenProductForm()}
                        className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Cadastrar Novo</span>
                      </button>
                    </div>

                    {/* Table list of menu items with proper horizontal scroll */}
                    <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                              <th className="py-3.5 px-4">Produto</th>
                              <th className="py-3.5 px-4">Categoria</th>
                              <th className="py-3.5 px-4">Preço</th>
                              <th className="py-3.5 px-4">Disponibilidade</th>
                              <th className="py-3.5 px-4 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F7F4EF] text-xs font-semibold">
                            {merchantProducts.map((p) => (
                              <tr key={p.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                                <td className="py-4 px-4 flex items-center gap-3">
                                  {p.image && p.image.trim() !== "" && (
                                    <img 
                                      src={p.image || undefined} 
                                      alt={p.name} 
                                      className="w-10 h-10 rounded-lg object-cover shrink-0" 
                                      referrerPolicy="no-referrer"
                                      loading="lazy"
                                    />
                                  )}
                                  <div>
                                    <h4 className="font-bold text-[#201A17]">{p.name}</h4>
                                    <p className="text-[10px] text-[#756B66] font-medium line-clamp-1 max-w-xs">{p.description}</p>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-[#756B66]">{p.menuCategoryName || p.category}</td>
                                <td className="py-4 px-4 text-[#201A17] font-bold">R$ {p.price.toFixed(2).replace('.', ',')}</td>
                                <td className="py-4 px-4">
                                  <button
                                    onClick={() => {
                                      const updated = { ...p, available: !p.available };
                                      addOrUpdateProduct(merchantId, updated);
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 transition-all ${
                                      p.available
                                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                        : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                    }`}
                                  >
                                    {p.available ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    <span>{p.available ? 'Disponível' : 'Pausado'}</span>
                                  </button>
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <div className="inline-flex gap-2">
                                    <button
                                      onClick={() => handleOpenProductForm(p)}
                                      className="p-1.5 rounded-lg border border-[#EADFD8] text-[#756B66] hover:text-[#201A17] hover:bg-[#F7F4EF]"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDeleteProductClick(p);
                                      }}
                                      className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:text-white hover:bg-rose-600"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* -------------------- TAB: HORÁRIOS DE FUNCIONAMENTO -------------------- */}
            {activeTab === 'horarios' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-6"
              >
                <div>
                  <h3 className="font-extrabold text-base text-[#201A17]">Horários de Atendimento</h3>
                  <p className="text-xs text-[#756B66] mt-0.5">Configure os dias e intervalos em que a pizzaria fica aberta para o público.</p>
                </div>

                <div className="space-y-4">
                  {localHours.map((h, idx) => (
                    <div key={h.day} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F7F4EF] pb-3 text-xs">
                      <div className="flex items-center gap-3 w-40">
                        <input
                           type="checkbox"
                           checked={h.isOpen}
                           onChange={() => handleHourToggle(idx)}
                           className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                        />
                        <span className="font-bold text-[#201A17]">{h.day}</span>
                      </div>

                      {h.isOpen ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={h.openTime}
                            onChange={(e) => handleHourTimeChange(idx, 'openTime', e.target.value)}
                            className="p-1.5 border border-[#EADFD8] rounded-lg text-xs font-semibold outline-none focus:border-[#E94F2F]/50 bg-white"
                          />
                          <span className="text-[#756B66] font-bold">até</span>
                          <input
                            type="time"
                            value={h.closeTime}
                            onChange={(e) => handleHourTimeChange(idx, 'closeTime', e.target.value)}
                            className="p-1.5 border border-[#EADFD8] rounded-lg text-xs font-semibold outline-none focus:border-[#E94F2F]/50 bg-white"
                          />
                        </div>
                      ) : (
                        <span className="text-rose-500 font-extrabold text-xs uppercase bg-rose-50 px-2.5 py-1 rounded-lg">Fechado o dia todo</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-[#F7F4EF] flex justify-end">
                  <button
                    onClick={handleSaveHours}
                    className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Horários</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: TAXAS & ENTREGAS (Entregas e taxas) -------------------- */}
            {activeTab === 'entregas' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* CONFIGURAÇÃO DE BAIRROS (DElivery Zones - Phase 2) */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#F7F4EF] pb-4">
                    <div>
                      <h3 className="font-extrabold text-base text-[#201A17]">Áreas, Taxas e Tempos de Entrega</h3>
                      <p className="text-xs text-[#756B66] mt-0.5">Gerencie bairros atendidos, valores de frete, pedido mínimo e tempo estimado.</p>
                    </div>
                    <button
                      onClick={handleOpenCreateZoneModal}
                      className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar Nova Área</span>
                    </button>
                  </div>

                  {/* Filters and Search */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="Buscar bairro por nome..."
                        value={zoneSearchQuery}
                        onChange={(e) => setZoneSearchQuery(e.target.value)}
                        className="w-full text-xs p-3 pl-9 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-[#F7F4EF]/30 font-semibold text-[#201A17]"
                      />
                      <span className="absolute left-3 top-3.5 text-[#756B66]">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setZoneStatusFilter('all')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${zoneStatusFilter === 'all' ? 'bg-[#201A17] text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]/50'}`}
                      >
                        Todos
                      </button>
                      <button
                        onClick={() => setZoneStatusFilter('active')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${zoneStatusFilter === 'active' ? 'bg-[#2F9E69] text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]/50'}`}
                      >
                        Ativos
                      </button>
                      <button
                        onClick={() => setZoneStatusFilter('inactive')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${zoneStatusFilter === 'inactive' ? 'bg-rose-600 text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]/50'}`}
                      >
                        Inativos
                      </button>
                    </div>
                  </div>

                  {/* Zones List */}
                  {zonesLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 text-[#E94F2F] animate-spin" />
                      <span className="text-xs font-bold text-[#756B66]">Carregando áreas de entrega...</span>
                    </div>
                  ) : filteredDeliveryZones.length === 0 ? (
                    <div className="bg-[#F7F4EF]/40 border border-dashed border-[#EADFD8] rounded-2xl py-12 text-center">
                      <Truck className="w-8 h-8 text-[#756B66]/60 mx-auto mb-2" />
                      <p className="text-xs font-bold text-[#756B66]">Nenhuma área de entrega encontrada.</p>
                      <p className="text-[10px] text-gray-400 mt-1">Busque por outro termo ou cadastre um novo bairro para começar.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="border-b border-[#F7F4EF] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                            <th className="py-3 px-2">Bairro</th>
                            <th className="py-3 px-2">Taxa de Entrega</th>
                            <th className="py-3 px-2">Tempo Estimado</th>
                            <th className="py-3 px-2">Pedido Mínimo</th>
                            <th className="py-3 px-2 text-center">Status</th>
                            <th className="py-3 px-2 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F7F4EF]">
                          {filteredDeliveryZones.map((zone) => {
                            return (
                              <tr key={zone.neighborhoodId} className="hover:bg-[#F7F4EF]/20 text-xs font-bold text-[#201A17] transition-all">
                                <td className="py-3.5 px-2 font-black">{zone.neighborhoodName}</td>
                                <td className="py-3.5 px-2 text-[#2F9E69]">R$ {zone.deliveryFee.toFixed(2).replace('.', ',')}</td>
                                <td className="py-3.5 px-2">
                                  <div className="flex flex-col gap-0.5 justify-center">
                                    <div className="flex items-center gap-1">
                                      <Clock3 className="w-3.5 h-3.5 text-[#756B66]" />
                                      <span className="font-extrabold text-xs">
                                        {currentMerchant.baseEstimatedMinutes !== undefined 
                                          ? `${Number(currentMerchant.baseEstimatedMinutes) + (zone.additionalEstimatedMinutes || 0)} min`
                                          : `${30 + (zone.additionalEstimatedMinutes || 0)} min`
                                        }
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[#756B66] font-normal leading-tight">
                                      {currentMerchant.baseEstimatedMinutes !== undefined ? (
                                        `${currentMerchant.baseEstimatedMinutes} min de preparo + ${zone.additionalEstimatedMinutes || 0} min adicionais`
                                      ) : (
                                        `Sem tempo de preparo definido`
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-2">
                                  {zone.minimumOrderValue !== null && zone.minimumOrderValue !== undefined ? (
                                    <span>R$ {zone.minimumOrderValue.toFixed(2).replace('.', ',')}</span>
                                  ) : (
                                    <span className="text-gray-400 font-medium italic">Geral (R$ {(currentMerchant.minOrderValue ?? currentMerchant.minimumOrderValue ?? 0).toFixed(2).replace('.', ',')})</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-2 text-center">
                                  <button
                                    onClick={() => handleToggleZoneStatus(zone)}
                                    className={`mx-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${zone.active ? 'bg-[#2F9E69]/10 text-[#2F9E69]' : 'bg-rose-100 text-rose-600'}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${zone.active ? 'bg-[#2F9E69]' : 'bg-rose-600'}`} />
                                    {zone.active ? 'Ativo' : 'Inativo'}
                                  </button>
                                </td>
                                <td className="py-3.5 px-2 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenEditZoneModal(zone)}
                                      className="p-1.5 hover:bg-[#F7F4EF] rounded-lg text-[#756B66] hover:text-[#201A17] transition-all"
                                      title="Editar Área"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* MODAL PARA CRIAÇÃO/EDIÇÃO DE ÁREAS DE ENTREGA */}
                <AnimatePresence>
                  {isZoneModalOpen && (
                    <div className="fixed inset-0 bg-[#201A17]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl border border-[#EADFD8] p-6 max-w-md w-full shadow-xl space-y-4 text-[#201A17]"
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-[#F7F4EF]">
                          <h4 className="font-extrabold text-base">
                            {editingZone ? `Editar Área: ${editingZone.neighborhoodName}` : 'Adicionar Nova Área de Entrega'}
                          </h4>
                          <button
                            onClick={() => {
                              setIsZoneModalOpen(false);
                              setEditingZone(null);
                            }}
                            className="p-1.5 hover:bg-[#F7F4EF] rounded-xl text-[#756B66]"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <form onSubmit={handleSaveZoneSubmit} className="space-y-4 text-xs font-bold">
                          {(() => {
                            const merchantCityId = currentMerchant.cityId || 'sao-joao-batista-do-gloria-mg';
                            const cityNeighborhoods = neighborhoods.filter(n => n.cityId === merchantCityId);
                            const availableNeighborhoods = cityNeighborhoods.filter(n => 
                              !deliveryZones.some(dz => dz.neighborhoodId === n.id)
                            );

                            const hasNoNeighborhoods = cityNeighborhoods.length === 0;
                            const hasNoAvailableNeighborhoods = availableNeighborhoods.length === 0 && !editingZone;
                            const isFormDisabled = !editingZone && (hasNoNeighborhoods || hasNoAvailableNeighborhoods);

                            return (
                              <>
                                {/* Campo Bairro */}
                                <div className="space-y-1">
                                  <label className="text-[#756B66] block">Bairro de Entrega</label>
                                  {editingZone ? (
                                    <input
                                      type="text"
                                      disabled
                                      value={editingZone.neighborhoodName}
                                      className="w-full p-2.5 bg-gray-100 rounded-xl border border-[#EADFD8] text-gray-500 cursor-not-allowed outline-none"
                                    />
                                  ) : (
                                    <>
                                      {hasNoNeighborhoods ? (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 font-semibold space-y-2">
                                          <p className="flex items-center gap-1.5 text-xs">
                                            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                                            Nenhum bairro disponível para esta cidade ({currentMerchant.cityName || currentMerchant.city || 'sua cidade'}).
                                          </p>
                                          <p className="text-[11px] text-amber-700 font-medium">
                                            Entre em contato com o administrador da plataforma para cadastrar os bairros oficiais da sua cidade.
                                          </p>
                                        </div>
                                      ) : hasNoAvailableNeighborhoods ? (
                                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 font-medium">
                                          <p className="flex items-center gap-1.5">
                                            <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />
                                            Todos os bairros desta cidade já estão cadastrados!
                                          </p>
                                        </div>
                                      ) : (
                                        <select
                                          required
                                          value={zoneNeighborhoodId}
                                          onChange={(e) => {
                                            const selectedId = e.target.value;
                                            const found = cityNeighborhoods.find(n => n.id === selectedId);
                                            if (found) {
                                              setZoneNeighborhoodId(found.id);
                                              setZoneNeighborhoodName(found.name);
                                            }
                                          }}
                                          className="w-full p-2.5 bg-white rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 text-xs font-bold"
                                        >
                                          <option value="">Selecione um Bairro...</option>
                                          {availableNeighborhoods.map(n => (
                                            <option key={n.id} value={n.id}>{n.name}</option>
                                          ))}
                                        </select>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Campo Taxa */}
                                <div className="space-y-1">
                                  <label className={`block ${isFormDisabled ? 'text-gray-400' : 'text-[#756B66]'}`}>Taxa de Entrega (R$)</label>
                                  <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.01"
                                    disabled={isFormDisabled}
                                    value={zoneFee}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setZoneFee(val === "" ? 0 : parseFloat(val));
                                    }}
                                    className={`w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 ${isFormDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-[#201A17]'}`}
                                  />
                                  {zoneFee === 0 && (
                                    <p className="text-[10px] text-emerald-600 font-bold mt-1">Entrega gratuita nesta área</p>
                                  )}
                                </div>

                                {/* Campo Pedido Mínimo */}
                                <div className="space-y-1">
                                  <label className={`block ${isFormDisabled ? 'text-gray-400' : 'text-[#756B66]'}`}>Pedido Mínimo para Entrega (R$)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    disabled={isFormDisabled}
                                    placeholder={`Opcional (Usa geral: R$ ${(currentMerchant.minOrderValue ?? currentMerchant.minimumOrderValue ?? 0).toFixed(2)})`}
                                    value={zoneMinOrder}
                                    onChange={(e) => setZoneMinOrder(e.target.value)}
                                    className={`w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 ${isFormDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-[#201A17]'}`}
                                  />
                                  <p className="text-[10px] text-gray-400 font-medium leading-tight">Se deixado em branco, assume o pedido mínimo geral cadastrado no perfil da loja.</p>
                                </div>

                                {/* Campo Minutos Adicionais */}
                                <div className="space-y-1">
                                  <label className={`block ${isFormDisabled ? 'text-gray-400' : 'text-[#756B66]'}`}>Tempo Adicional de Entrega (Minutos)</label>
                                  <input
                                    type="number"
                                    required
                                    min="0"
                                    step="1"
                                    disabled={isFormDisabled}
                                    value={zoneAdditionalMinutes}
                                    onChange={(e) => setZoneAdditionalMinutes(parseInt(e.target.value) || 0)}
                                    className={`w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 ${isFormDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-[#201A17]'}`}
                                  />
                                  <p className="text-[10px] text-gray-400 font-medium leading-tight">
                                    {currentMerchant.baseEstimatedMinutes !== undefined ? (
                                      `${currentMerchant.baseEstimatedMinutes} min de preparo + ${zoneAdditionalMinutes} min adicionais = ${Number(currentMerchant.baseEstimatedMinutes) + zoneAdditionalMinutes} min total.`
                                    ) : (
                                      `Sem tempo de preparo definido (exemplo: 30 min de preparo + ${zoneAdditionalMinutes} min adicionais = ${30 + zoneAdditionalMinutes} min total)`
                                    )}
                                  </p>
                                </div>

                                {/* Campo Status Ativo */}
                                <div className="flex items-center gap-2 pt-2">
                                  <input
                                    type="checkbox"
                                    id="zone-active-checkbox"
                                    disabled={isFormDisabled}
                                    checked={zoneActive}
                                    onChange={(e) => setZoneActive(e.target.checked)}
                                    className={`w-4 h-4 accent-[#E94F2F] ${isFormDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                  />
                                  <label htmlFor="zone-active-checkbox" className={`select-none ${isFormDisabled ? 'text-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>Esta área de entrega está Ativa para pedidos</label>
                                </div>

                                {/* Botões do Formulário */}
                                <div className="flex gap-3 pt-3 border-t border-[#F7F4EF]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsZoneModalOpen(false);
                                      setEditingZone(null);
                                    }}
                                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-[#756B66]"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={isFormDisabled}
                                    className={`flex-1 py-2.5 rounded-xl font-bold text-white transition-all shadow-md ${isFormDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' : 'bg-[#E94F2F] hover:bg-[#BD351C]'}`}
                                  >
                                    Salvar Regra
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {/* TEMPO DE PREPARO BASE / ESTIMADO DA LOJA */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-6">
                  <div>
                    <h3 className="font-extrabold text-base text-[#201A17]">Tempo de preparo do estabelecimento</h3>
                    <p className="text-xs text-[#756B66] mt-0.5">Defina o tempo médio necessário para preparar um pedido. O tempo adicional de cada bairro será somado automaticamente para calcular a estimativa total.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-[#756B66] uppercase tracking-wider block">Tempo de preparo do pedido (Minutos)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="Ex: 30"
                          value={baseEstimatedMinutes !== undefined ? baseEstimatedMinutes : ''}
                          onChange={(e) => setBaseEstimatedMinutes(e.target.value === '' ? undefined : Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full max-w-[150px] p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-[#F7F4EF]/30 font-extrabold text-sm text-[#201A17]"
                        />
                        <span className="text-xs font-bold text-[#756B66]">minutos</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-semibold leading-tight">
                        Exemplo: Se o tempo de preparo for de {baseEstimatedMinutes || 30} min e o tempo adicional de um bairro for de 15 min, o cliente verá {(baseEstimatedMinutes || 30) + 15} min como estimativa total.
                      </p>
                    </div>

                    <div className="p-4 bg-[#F7F4EF]/40 rounded-2xl border border-[#EADFD8]/40 text-[#201A17] text-xs space-y-2.5 font-medium">
                      <p className="font-extrabold text-xs text-[#E94F2F] flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        Como a estimativa é calculada:
                      </p>
                      <p className="text-[11px] text-[#756B66] leading-tight mb-1">
                        Somamos o tempo de preparo ao tempo adicional definido para cada bairro.
                      </p>
                      
                      {zonesLoading ? (
                        <div className="flex items-center gap-2 text-[11px] text-[#756B66] py-1">
                          <RefreshCw className="w-3.5 h-3.5 text-[#E94F2F] animate-spin" />
                          <span>Carregando estimativas...</span>
                        </div>
                      ) : baseEstimatedMinutes === undefined ? (
                        <p className="text-[11px] text-amber-600 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
                          Defina o tempo de preparo para calcular a estimativa total das entregas.
                        </p>
                      ) : deliveryZones.length === 0 ? (
                        <p className="text-[11px] text-[#756B66] italic bg-gray-50 p-2 rounded-lg border border-gray-200">
                          Cadastre uma área de entrega para visualizar a estimativa completa.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {deliveryZones.slice(0, 3).map((zone) => {
                            const additional = zone.additionalEstimatedMinutes || 0;
                            const total = calculateEstimatedTotalMinutes(baseEstimatedMinutes, additional);
                            return (
                              <div key={zone.neighborhoodId} className="border-b border-[#EADFD8]/40 pb-2.5 last:border-0 last:pb-0">
                                <p className="font-extrabold text-xs text-[#201A17]">{zone.neighborhoodName}</p>
                                <div className="grid grid-cols-1 pl-2 mt-1 gap-0.5 text-[11px] text-[#756B66]">
                                  <p>Tempo de preparo: <span className="font-bold text-[#201A17]">{baseEstimatedMinutes} min</span></p>
                                  <p>Tempo adicional do bairro: <span className="font-bold text-[#201A17]">{additional} min</span></p>
                                  <p className="font-bold text-[#2F9E69]">Estimativa para o cliente: {total} min</p>
                                </div>
                              </div>
                            );
                          })}
                          {deliveryZones.length > 3 && (
                            <p className="text-[10px] text-gray-400 font-bold italic text-right pt-1">
                              Ver todas as estimativas (exibindo 3 de {deliveryZones.length})
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#F7F4EF] flex justify-end">
                    <button
                      onClick={async () => {
                        if (baseEstimatedMinutes === undefined) {
                          showToast('Por favor, defina o tempo de preparo do pedido.', 'error');
                          return;
                        }
                        const updatedMerchant = {
                          ...currentMerchant,
                          baseEstimatedMinutes,
                          deliveryTimeMin: baseEstimatedMinutes, // ensure synced
                          deliveryTime: `${baseEstimatedMinutes}-${baseEstimatedMinutes + 15} min`
                        };
                        try {
                          const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('pl_catalog_data_source') !== 'firestore';
                          if (!isDemoMode) {
                            await establishmentsRepository.saveEstablishment(updatedMerchant);
                          }
                          setEstablishments(prev =>
                            prev.map(e => e.id === merchantId ? updatedMerchant : e)
                          );
                          showToast('Tempo de preparo salvo com sucesso!', 'success');
                        } catch (error) {
                          console.error("Erro ao salvar tempo de preparo:", error);
                          showToast('Erro ao atualizar o tempo de preparo.', 'error');
                        }
                      }}
                      className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Salvar tempo de preparo</span>
                    </button>
                  </div>
                </div>

                {/* CONFIGURAÇÃO DE PAGAMENTO ACEITO */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-6">
                  <div>
                    <h3 className="font-extrabold text-base text-[#201A17]">Formas de Pagamento e Modalidades Aceitas</h3>
                    <p className="text-xs text-[#756B66] mt-0.5">Defina quais formas de pagamento diretamente a você o seu estabelecimento aceita e as modalidades disponíveis.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Meios de Pagamento */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider font-extrabold">Meios de Pagamento Aceitos</h4>
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptCash}
                            onChange={(e) => setAcceptCash(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Dinheiro (Espécie)</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Permite ao cliente solicitar troco</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptPix}
                            onChange={(e) => setAcceptPix(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Pix na Entrega/Retirada</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Chave Pix ou código fornecido no ato</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptDebitCard}
                            onChange={(e) => setAcceptDebitCard(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Cartão de Débito (Maquininha)</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Pagamento físico na entrega ou retirada</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptCreditCard}
                            onChange={(e) => setAcceptCreditCard(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Cartão de Crédito (Maquininha)</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Pagamento físico na entrega ou retirada</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptContactless}
                            onChange={(e) => setAcceptContactless(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Aproximação (NFC)</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Permitir pagamento por aproximação</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Modalidades Aceitas */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider font-extrabold">Modalidades Disponíveis</h4>
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptsDelivery}
                            onChange={(e) => setAcceptsDelivery(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Aceitar "Entrega em Casa"</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Habilita a modalidade de delivery</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 text-xs font-bold text-[#201A17] cursor-pointer bg-[#F7F4EF]/50 p-3 rounded-xl border border-transparent hover:border-[#EADFD8] transition-all">
                          <input
                            type="checkbox"
                            checked={acceptsPickup}
                            onChange={(e) => setAcceptsPickup(e.target.checked)}
                            className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                          />
                          <div className="flex-1">
                            <span>Aceitar "Retirada no Balcão"</span>
                            <span className="block text-[10px] text-[#756B66] font-normal">Habilita a modalidade de take-out</span>
                          </div>
                        </label>
                      </div>

                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-[11px] font-semibold leading-relaxed space-y-1">
                        <p className="font-extrabold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Importante:</p>
                        <p>
                          Como a plataforma UaiPertim não intermedia financeiramente os pagamentos, todas as transações selecionadas acima serão pagas pelo cliente diretamente à sua equipe de entrega ou no seu balcão físico.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#F7F4EF] flex justify-end">
                    <button
                      onClick={handleSavePaymentConfig}
                      className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Salvar Configurações de Pagamento</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: FINANCEIRO E METRICAS LOJA -------------------- */}
            {activeTab === 'financeiro' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <FinanceiroEstabelecimento merchantId={merchantId} />
              </motion.div>
            )}

            {/* -------------------- TAB: NOTIFICACOES E ALERTAS -------------------- */}
            {activeTab === 'notificacoes' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-6">
                  <div className="border-b border-[#F7F4EF] pb-4">
                    <h3 className="font-extrabold text-base text-[#201A17]">Notificações e Alertas</h3>
                    <p className="text-xs text-[#756B66] mt-0.5">
                      Configure como este dispositivo deve avisar você sobre novos pedidos e mensagens dos clientes.
                    </p>
                  </div>

                  {/* Section A: PUSH NOTIFICATIONS */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">A. Notificações Push</h4>
                    <PushNotificationControl variant="page" />
                  </div>

                  {/* Section B: ALERTA SONORO */}
                  <div className="space-y-4 pt-4 border-t border-[#F7F4EF]">
                    <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">B. Alerta Sonoro</h4>
                    <div className="p-5 border border-[#EADFD8] rounded-2xl bg-[#FAF8F5] space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm text-[#201A17]">Som do Painel da Loja</p>
                          <p className="text-xs text-[#756B66]">Clique no controle à direita para alternar ou desbloquear o áudio nesta sessão.</p>
                        </div>
                        <div className="w-full sm:w-auto min-w-[150px] bg-white border border-[#EADFD8] rounded-xl p-3.5 shadow-xs shrink-0">
                          <NotificationSoundControl showLabel={true} />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-orange-50/50 border border-orange-100/60 text-xs text-orange-800 leading-relaxed">
                        <span className="font-bold">Como funciona:</span> O alerta sonoro funciona enquanto o painel está aberto. As notificações Push podem chegar mesmo quando o aplicativo estiver em segundo plano.
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: AVALIACOES -------------------- */}
            {activeTab === 'avaliacoes' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <MerchantReviews 
                  establishmentId={merchantId} 
                  merchantName={currentMerchant?.name || 'Estabelecimento'} 
                />
              </motion.div>
            )}

          </div>
        </div>
      </div>

      {/* -------------------- PAUSE DURATION SELECTION MODAL -------------------- */}
      <AnimatePresence>
        {isPauseDurationModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" id="merchant-pause-duration-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#E94F2F]" />
                  <span>Duração da Pausa</span>
                </h3>
                <button 
                  onClick={() => setIsPauseDurationModalOpen(false)} 
                  className="text-[#756B66] hover:text-[#201A17]"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-3">
                <p className="text-xs text-[#756B66] font-semibold leading-relaxed">
                  Selecione por quanto tempo deseja pausar o recebimento de novos pedidos. Após o tempo selecionado, a pausa será desativada automaticamente.
                </p>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleSelectPauseDuration(30)}
                    className="w-full p-3 text-left rounded-xl border border-[#EADFD8] hover:bg-[#F7F4EF] hover:border-[#E94F2F]/40 transition-all font-bold text-xs text-[#201A17] flex justify-between items-center"
                  >
                    <span>30 Minutos</span>
                    <span className="text-[10px] text-[#756B66] font-semibold bg-[#F7F4EF] px-2 py-0.5 rounded-lg border border-[#EADFD8]">Retoma rápido</span>
                  </button>

                  <button
                    onClick={() => handleSelectPauseDuration(60)}
                    className="w-full p-3 text-left rounded-xl border border-[#EADFD8] hover:bg-[#F7F4EF] hover:border-[#E94F2F]/40 transition-all font-bold text-xs text-[#201A17] flex justify-between items-center"
                  >
                    <span>1 Hora</span>
                    <span className="text-[10px] text-[#756B66] font-semibold bg-[#F7F4EF] px-2 py-0.5 rounded-lg border border-[#EADFD8]">Mais comum</span>
                  </button>

                  <button
                    onClick={() => handleSelectPauseDuration(120)}
                    className="w-full p-3 text-left rounded-xl border border-[#EADFD8] hover:bg-[#F7F4EF] hover:border-[#E94F2F]/40 transition-all font-bold text-xs text-[#201A17] flex justify-between items-center"
                  >
                    <span>2 Horas</span>
                    <span className="text-[10px] text-[#756B66] font-semibold bg-[#F7F4EF] px-2 py-0.5 rounded-lg border border-[#EADFD8]">Horário de pico</span>
                  </button>

                  <button
                    onClick={() => handleSelectPauseDuration(null)}
                    className="w-full p-3 text-left rounded-xl border border-[#EADFD8] hover:bg-amber-50 hover:border-amber-300 transition-all font-bold text-xs text-[#201A17] flex justify-between items-center"
                  >
                    <span className="text-amber-800">Tempo Indeterminado</span>
                    <span className="text-[10px] text-amber-700 font-semibold bg-amber-100/50 px-2 py-0.5 rounded-lg border border-amber-200">Requer reativação manual</span>
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#F7F4EF] mt-4">
                  <button
                    onClick={() => setIsPauseDurationModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#756B66] rounded-xl font-bold text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- CREATE/EDIT CATEGORY MODAL -------------------- */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" id="merchant-category-form-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17]">
                  {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                </h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="text-[#756B66] hover:text-[#201A17]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Nome da Categoria *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Pizzas Clássicas"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Ordem de Exibição (Sort Order) *</label>
                  <input
                    type="number"
                    required
                    placeholder="1"
                    min="1"
                    value={catSortOrder}
                    onChange={(e) => setCatSortOrder(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                  />
                </div>

                <div className="flex items-center gap-3 bg-[#F7F4EF] p-3 rounded-xl border border-[#EADFD8]">
                  <input
                    type="checkbox"
                    id="chk-cat-active"
                    checked={catActive}
                    onChange={(e) => setCatActive(e.target.checked)}
                    className="w-4 h-4 rounded text-[#E94F2F] border-[#EADFD8] focus:ring-[#E94F2F]"
                  />
                  <label htmlFor="chk-cat-active" className="text-xs font-bold text-[#201A17] cursor-pointer select-none">
                    Categoria Ativa (Exibir no catálogo público se houver produtos)
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#756B66] rounded-xl font-bold text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      if (!catName.trim()) {
                        showToast('O nome da categoria é obrigatório.', 'error');
                        return;
                      }
                      const sortOrderNum = parseInt(catSortOrder) || 1;
                      const catId = editingCategory ? editingCategory.id : `cat-${Date.now()}`;
                      const normalized = catName.trim().toLowerCase();
                      
                      const categoryData: MenuCategory = {
                        id: catId,
                        establishmentId: merchantId,
                        name: catName.trim(),
                        normalizedName: normalized,
                        active: catActive,
                        sortOrder: sortOrderNum,
                      };

                      try {
                        await addOrUpdateMenuCategory(merchantId, categoryData);
                        setIsCategoryModalOpen(false);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="px-4 py-2 bg-[#E94F2F] hover:bg-[#BD351C] text-white rounded-xl font-bold text-xs"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- DELETE CATEGORY CONFIRMATION MODAL -------------------- */}
      <AnimatePresence>
        {catToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" id="merchant-category-delete-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] bg-rose-50 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <h3 className="font-extrabold text-base text-[#201A17]">
                  Excluir Categoria
                </h3>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <p className="text-sm font-medium text-[#756B66]">
                  Você tem certeza que deseja excluir a categoria <strong className="text-[#201A17]">"{catToDelete.name}"</strong>?
                </p>

                {productsLinkedToCat.length > 0 ? (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-900 space-y-2">
                    <p className="font-bold">Aviso importante:</p>
                    <p className="font-medium text-xs leading-relaxed">
                      Esta categoria possui <strong>{productsLinkedToCat.length} produtos</strong> vinculados a ela. 
                      Se você confirmar a exclusão, esses produtos não serão excluídos, mas ficarão sem categoria e deixarão de aparecer no catálogo do cliente até que você os readequar para uma nova categoria.
                    </p>
                    <ul className="list-disc pl-4 text-[11px] font-semibold space-y-0.5">
                      {productsLinkedToCat.slice(0, 3).map(p => (
                        <li key={p.id}>{p.name}</li>
                      ))}
                      {productsLinkedToCat.length > 3 && (
                        <li>...e mais {productsLinkedToCat.length - 3} produto(s).</li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[#756B66] font-medium leading-relaxed">
                    Nenhum produto está atualmente vinculado a esta categoria. A exclusão é imediata e segura.
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setCatToDelete(null);
                      setProductsLinkedToCat([]);
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#756B66] rounded-xl font-bold text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        if (productsLinkedToCat.length > 0) {
                          for (const p of productsLinkedToCat) {
                            const updated = {
                              ...p,
                              menuCategoryId: '',
                              menuCategoryName: '',
                              category: 'Sem Categoria'
                            };
                            await addOrUpdateProduct(merchantId, updated, { silent: true });
                          }
                        }
                        await deleteMenuCategory(merchantId, catToDelete.id);
                        setCatToDelete(null);
                        setProductsLinkedToCat([]);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs"
                  >
                    Confirmar Exclusão
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- DELETE PRODUCT CONFIRMATION MODAL -------------------- */}
      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" id="merchant-product-delete-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] bg-rose-50 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <h3 className="font-extrabold text-base text-[#201A17]">
                  Excluir Produto
                </h3>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <p className="text-sm font-medium text-[#756B66] leading-relaxed">
                  Você tem certeza que deseja excluir o produto <strong className="text-[#201A17]">"{productToDelete.name}"</strong>?
                </p>
                
                <p className="text-[#756B66] font-medium leading-relaxed">
                  Tem certeza de que deseja excluir este produto? Essa ação não poderá ser desfeita.
                </p>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isDeletingProduct}
                    onClick={() => {
                      setProductToDelete(null);
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#756B66] rounded-xl font-bold text-xs disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingProduct}
                    onClick={async () => {
                      if (isDeletingProduct) return;
                      
                      // 1. Validar se existe um usuário autenticado.
                      if (!isAuthenticated || !currentUser) {
                        showToast('Não foi possível excluir o produto. Usuário não autenticado.', 'error');
                        return;
                      }

                      // 2. Validar se o usuário possui vínculo com o estabelecimento atual.
                      const hasVinculo = userProfile?.role === 'admin' || authEstId === merchantId;
                      if (!hasVinculo) {
                        showToast('Acesso negado. Você não possui vínculo com este estabelecimento.', 'error');
                        return;
                      }

                      // 3. Validar se o produto pertence ao estabelecimento atual.
                      if (productToDelete.establishmentId !== merchantId) {
                        showToast('Este produto não pertence a este estabelecimento.', 'error');
                        return;
                      }

                      setIsDeletingProduct(true);
                      try {
                        // 4. Utilizar o ID real do documento Firestore.
                        // 5. Executar a exclusão no caminho correto do Firestore.
                        await deleteProduct(merchantId, productToDelete.id);
                        showToast('Produto excluído com sucesso.', 'success');
                        setProductToDelete(null);
                      } catch (err: any) {
                        showToast('Não foi possível excluir o produto. Tente novamente.', 'error');
                        
                        // Registrar no console o erro técnico completo contendo:
                        // - código do erro;
                        // - mensagem do erro;
                        // - ID do produto;
                        // - ID do estabelecimento;
                        // - caminho Firestore utilizado.
                        console.error("ERRO COMPLETO DE EXCLUSÃO DE PRODUTO:", {
                          code: err.code || "unknown_code",
                          message: err.message || "Unknown error occurred",
                          productId: productToDelete.id,
                          establishmentId: merchantId,
                          firestorePath: `products/${productToDelete.id}`
                        });
                      } finally {
                        setIsDeletingProduct(false);
                      }
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isDeletingProduct ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Excluindo...</span>
                      </>
                    ) : (
                      <span>Excluir produto</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- DELETE OPTION GROUP CONFIRMATION MODAL -------------------- */}
      <AnimatePresence>
        {groupToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]" id="merchant-option-group-delete-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] bg-rose-50 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <h3 className="font-extrabold text-base text-[#201A17]">
                  Excluir grupo “{groupToDelete.name || 'Sem nome'}”?
                </h3>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <p className="text-sm font-medium text-[#756B66] leading-relaxed">
                  As opções cadastradas nesse grupo também serão removidas deste produto.
                </p>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGroupToDelete(null);
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#756B66] rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      confirmDeleteOptionGroup();
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Excluir grupo
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- CREATE/EDIT PRODUCT FORM MODAL -------------------- */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="merchant-product-form-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17]">
                  {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
                </h3>
                <button onClick={() => setIsProductModalOpen(false)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleProductSubmit} className="p-6 space-y-4 text-xs font-semibold text-[#201A17] max-h-[75vh] overflow-y-auto pr-2">
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Nome do Prato *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Pizza Calabresa Especial"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Descrição do catálogo *</label>
                  <textarea
                    required
                    placeholder="Ex: Deliciosa muçarela de búfala, manjericão fresco picado..."
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    rows={3}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 resize-none bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Preço em Real (R$) *</label>
                    <input
                      type="text"
                      required
                      placeholder="54.90"
                      value={prodPrice}
                      onChange={(e) => setProdPrice(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Categoria *</label>
                    <select
                      value={prodCategory}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsQuickCatOpen(true);
                          setQuickCatName('');
                        } else {
                          setProdCategory(e.target.value);
                        }
                      }}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                    >
                      {(menuCategories[merchantId] || []).map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                      <option value="__NEW__">+ Criar nova categoria...</option>
                    </select>

                    {isQuickCatOpen && (
                      <div className="mt-2 p-3 bg-[#FAF8F6] rounded-xl border border-[#EADFD8] space-y-2">
                        <p className="text-[10px] font-black text-[#E94F2F] uppercase">Rápido: Criar Nova Categoria</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nome da categoria (ex: Massas)"
                            value={quickCatName}
                            onChange={(e) => setQuickCatName(e.target.value)}
                            className="flex-1 p-2 rounded-lg border border-[#EADFD8] text-xs outline-none focus:border-[#E94F2F]/50 bg-white"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!quickCatName.trim()) {
                                showToast('Digite o nome da categoria.', 'error');
                                return;
                              }
                              const normName = quickCatName.trim().toLowerCase();
                              const catId = `cat-${Date.now()}`;
                              const newCat: MenuCategory = {
                                id: catId,
                                establishmentId: merchantId,
                                name: quickCatName.trim(),
                                normalizedName: normName,
                                active: true,
                                sortOrder: ((menuCategories[merchantId] || []).length) + 1,
                              };
                              try {
                                await addOrUpdateMenuCategory(merchantId, newCat);
                                setProdCategory(catId);
                                setIsQuickCatOpen(false);
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="bg-[#E94F2F] text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-[#BD351C]"
                          >
                            Criar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsQuickCatOpen(false);
                              const currentCats = menuCategories[merchantId] || [];
                              setProdCategory(currentCats.length > 0 ? currentCats[0].id : '');
                            }}
                            className="bg-gray-200 text-[#756B66] px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-300"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">URL da Imagem demonstrativa (Opcional)</label>
                  <input
                    type="url"
                    placeholder="https://exemplo.com/pizza.jpg"
                    value={prodImage}
                    onChange={(e) => setProdImage(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                  />
                </div>

                {/* Availability Checklist */}
                <div className="flex items-center gap-3 bg-[#F7F4EF] p-3 rounded-xl border border-[#EADFD8]">
                  <input
                    type="checkbox"
                    id="chk-prod-avail"
                    checked={prodAvailable}
                    onChange={() => setProdAvailable(!prodAvailable)}
                    className="w-4.5 h-4.5 accent-[#2F9E69] cursor-pointer"
                  />
                  <label htmlFor="chk-prod-avail" className="cursor-pointer select-none">
                    <p className="text-xs font-bold text-[#201A17]">Produto disponível para venda imediata</p>
                    <p className="text-[9px] text-[#756B66] font-semibold">Os clientes poderão visualizar e pedir no aplicativo.</p>
                  </label>
                </div>

                {/* PRODUCT CHARACTERISTICS SECTION */}
                <div className="bg-white rounded-2xl border border-[#EADFD8] p-4 space-y-4 shadow-xs text-left">
                  <div className="border-b border-[#F7F4EF] pb-3">
                    <h4 className="font-extrabold text-xs text-[#201A17] uppercase tracking-wider">Características do produto</h4>
                    <p className="text-[9px] text-[#756B66] font-semibold mt-0.5">
                      Selecione somente características que realmente se aplicam a este produto.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Control 1: Feito na hora */}
                    <div className="flex items-start gap-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#EADFD8]/60 hover:border-[#E94F2F]/30 transition-colors">
                      <input
                        type="checkbox"
                        id="chk-prod-prepared"
                        checked={prodPreparedToOrder}
                        onChange={() => setProdPreparedToOrder(!prodPreparedToOrder)}
                        className="w-4.5 h-4.5 accent-[#E94F2F] cursor-pointer mt-0.5 focus-visible:ring-2 focus-visible:ring-[#E94F2F]"
                      />
                      <label htmlFor="chk-prod-prepared" className="cursor-pointer select-none flex-1">
                        <span className="text-xs font-bold text-[#201A17] block">Feito na hora</span>
                        <span className="text-[9px] text-[#756B66] font-semibold leading-normal block mt-0.5">
                          O produto é preparado após o cliente realizar o pedido.
                        </span>
                      </label>
                    </div>

                    {/* Control 2: Ingredientes frescos */}
                    <div className="flex items-start gap-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#EADFD8]/60 hover:border-emerald-500/30 transition-colors">
                      <input
                        type="checkbox"
                        id="chk-prod-fresh"
                        checked={prodFreshIngredients}
                        onChange={() => setProdFreshIngredients(!prodFreshIngredients)}
                        className="w-4.5 h-4.5 accent-emerald-600 cursor-pointer mt-0.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
                      />
                      <label htmlFor="chk-prod-fresh" className="cursor-pointer select-none flex-1">
                        <span className="text-xs font-bold text-[#201A17] block">Ingredientes frescos</span>
                        <span className="text-[9px] text-[#756B66] font-semibold leading-normal block mt-0.5">
                          O estabelecimento confirma que este produto utiliza ingredientes frescos.
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* PROMOTION MANAGEMENT SECTION */}
                <div className="bg-white rounded-2xl border border-[#EADFD8] p-4 space-y-4 shadow-xs text-left">
                  <div className="flex items-center justify-between border-b border-[#F7F4EF] pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#E94F2F]" />
                      <h4 className="font-extrabold text-xs text-[#201A17] uppercase tracking-wider">Promoções e Ofertas</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="chk-promo-enabled"
                        checked={promoEnabled}
                        onChange={() => setPromoEnabled(!promoEnabled)}
                        className="w-4.5 h-4.5 accent-[#E94F2F] cursor-pointer"
                      />
                      <label htmlFor="chk-promo-enabled" className="text-xs font-bold text-[#E94F2F] cursor-pointer select-none">
                        Ativar Promoção
                      </label>
                    </div>
                  </div>

                  {promoEnabled && (
                    <div className="space-y-4 animate-fade-in text-left">
                      {promoSource === 'uaipertim' ? (
                        /* Read-only UaiPertim Promotion UI */
                        <div className="bg-orange-50 border border-orange-200 p-3.5 rounded-xl space-y-2.5">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-[#E94F2F] shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-extrabold text-[#E94F2F]">Oferta Oficial UaiPertim</p>
                              <p className="text-[10px] text-orange-800 leading-normal font-semibold">
                                Esta é uma promoção criada e subsidiada pela plataforma. Você não pode alterar as regras de preço e vigência, mas tem total autonomia para ativá-la ou desativá-la no seu cardápio pelo botão acima.
                              </p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-[10px] font-semibold text-[#756B66] border-t border-orange-100 pt-2.5">
                            <div>
                              <span className="block font-black uppercase text-[8px] text-[#A39994] mb-0.5">Preço Promocional</span>
                              <span className="text-[#2F9E69] text-xs font-black">R$ {promoPrice}</span>
                            </div>
                            <div>
                              <span className="block font-black uppercase text-[8px] text-[#A39994] mb-0.5">Selo da Oferta</span>
                              <span className="text-[#201A17] text-xs font-black">{promoLabel || 'Oferta UaiPertim'}</span>
                            </div>
                            {promoStartsAt && (
                              <div className="col-span-2 sm:col-span-1">
                                <span className="block font-black uppercase text-[8px] text-[#A39994] mb-0.5">Inicia em</span>
                                <span className="text-[#201A17]">{new Date(promoStartsAt).toLocaleString('pt-BR')}</span>
                              </div>
                            )}
                            {promoEndsAt && (
                              <div className="col-span-2 sm:col-span-1">
                                <span className="block font-black uppercase text-[8px] text-[#A39994] mb-0.5">Encerra em</span>
                                <span className="text-[#201A17]">{new Date(promoEndsAt).toLocaleString('pt-BR')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Editable Establishment Promotion UI */
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase">Preço Promocional (R$) *</label>
                              <input
                                type="text"
                                required={promoEnabled}
                                placeholder="Ex: 19.90"
                                value={promoPrice}
                                onChange={(e) => setPromoPrice(e.target.value)}
                                className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                              />
                              <p className="text-[9px] text-[#756B66] font-medium">Deve ser menor que o preço normal do prato (R$ {prodPrice}).</p>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase">Texto do Selo (Ex: Oferta, Especial) *</label>
                              <input
                                type="text"
                                required={promoEnabled}
                                placeholder="Ex: Oferta"
                                value={promoLabel}
                                onChange={(e) => setPromoLabel(e.target.value.substring(0, 15))}
                                className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                              />
                              <p className="text-[9px] text-[#756B66] font-medium">Até 15 caracteres. Exibido em destaque no cardápio.</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#F7F4EF] pt-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase font-sans">Vigência - Início (Opcional)</label>
                              <input
                                type="datetime-local"
                                value={promoStartsAt}
                                onChange={(e) => setPromoStartsAt(e.target.value)}
                                className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-sans"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase font-sans">Vigência - Encerramento (Opcional)</label>
                              <input
                                type="datetime-local"
                                value={promoEndsAt}
                                onChange={(e) => setPromoEndsAt(e.target.value)}
                                className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-sans"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* OPCIONAIS E ADICIONAIS */}
                <div className="border-t border-[#EADFD8] pt-4 mt-2 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-black text-[#201A17] uppercase tracking-wider">Opcionais e Adicionais</h4>
                      <p className="text-[10px] text-[#756B66] font-normal">
                        Crie grupos de escolhas como tamanho, borda, complementos ou personalizações.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddOptionGroup}
                      className="flex items-center gap-1.5 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer select-none"
                    >
                      <Plus className="w-4 h-4" />
                      Grupo
                    </button>
                  </div>

                  {optionGroups.length === 0 ? (
                    <div className="text-center py-6 bg-[#F7F4EF] rounded-2xl border border-dashed border-[#EADFD8] text-[#756B66]">
                      <p className="font-semibold text-xs">Nenhum grupo cadastrado para este produto.</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Clique em "+ Grupo" para começar a personalizar.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {optionGroups.map((group, index) => {
                        const isExpanded = expandedGroupId === group.id;
                        const activeOptionsCount = group.options.filter(o => o.active).length;
                        const groupError = groupErrors[group.id];
                        const hasError = !!groupError;
                        const hasErrorField = groupError?.field;

                        return (
                          <div
                            key={group.id}
                            id={`group-card-${group.id}`}
                            className={`bg-[#F7F4EF]/75 rounded-2xl border overflow-hidden transition-all ${
                              hasError 
                                ? 'border-red-500 ring-2 ring-red-500/20' 
                                : 'border-[#EADFD8]'
                            }`}
                          >
                            {/* Card Header */}
                            <div
                              className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#F7F4EF] select-none"
                              onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-xs text-[#201A17] truncate">
                                    {group.name || <span className="text-gray-400 italic">Sem nome</span>}
                                  </span>
                                  {group.required ? (
                                    <span className="bg-[#E94F2F]/10 text-[#E94F2F] text-[9px] font-black px-1.5 py-0.5 rounded">
                                      Obrigatório
                                    </span>
                                  ) : (
                                    <span className="bg-gray-200 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                      Opcional
                                    </span>
                                  )}
                                  <span className="bg-amber-100 text-amber-800 text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                    Mín: {group.minSelect} · Máx: {group.maxSelect}
                                  </span>
                                  {!group.active && (
                                    <span className="bg-gray-300 text-gray-700 text-[9px] font-black px-1.5 py-0.5 rounded">
                                      Inativo
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[#756B66] font-normal truncate mt-0.5">
                                  {group.description || 'Sem descrição'} · {group.options.length} opções ({activeOptionsCount} ativas)
                                </p>
                                {hasError && (
                                  <p className="text-[10px] text-red-600 font-extrabold mt-1.5 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{groupError.message}</span>
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {/* Reordering buttons */}
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => handleMoveOptionGroup(index, 'up')}
                                  className="p-1 hover:bg-gray-200 text-[#756B66] rounded disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === optionGroups.length - 1}
                                  onClick={() => handleMoveOptionGroup(index, 'down')}
                                  className="p-1 hover:bg-gray-200 text-[#756B66] rounded disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    requestDeleteOptionGroup(group.clientKey ?? group.id);
                                  }}
                                  className="relative z-20 pointer-events-auto p-1 hover:bg-red-100 text-red-600 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 pointer-events-none" pointerEvents="none" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                                  className="p-1 hover:bg-gray-200 text-[#756B66] rounded cursor-pointer"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Collapsible Content */}
                            {isExpanded && (
                              <div className="p-4 border-t border-[#EADFD8] bg-white space-y-3.5">
                                {hasError && (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs font-bold flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-extrabold text-red-800">Atenção: Configuração Inválida</p>
                                      <p className="font-semibold text-[11px] text-red-700 mt-0.5">{groupError.message}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Group Fields */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Nome do Grupo *</label>
                                    <input
                                      type="text"
                                      id={`group-name-${group.id}`}
                                      placeholder="Ex: Escolha o tamanho, Adicionais"
                                      value={group.name}
                                      onChange={(e) => handleUpdateOptionGroup(group.id, { name: e.target.value })}
                                      className={`w-full p-2.5 rounded-lg border outline-none bg-white text-xs font-semibold ${
                                        hasErrorField === 'name' ? 'border-red-500 bg-red-50/10 focus:border-red-500' : 'border-[#EADFD8] focus:border-[#E94F2F]/50'
                                      }`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Descrição (Opcional)</label>
                                    <input
                                      type="text"
                                      placeholder="Ex: Escolha apenas 1, Até 3 itens"
                                      value={group.description || ''}
                                      onChange={(e) => handleUpdateOptionGroup(group.id, { description: e.target.value })}
                                      className="w-full p-2.5 rounded-lg border border-[#EADFD8] outline-none bg-white text-xs font-semibold focus:border-[#E94F2F]/50"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Obrigatório?</label>
                                    <select
                                      value={group.required ? 'true' : 'false'}
                                      onChange={(e) => handleUpdateOptionGroup(group.id, { required: e.target.value === 'true' })}
                                      className="w-full p-2.5 rounded-lg border border-[#EADFD8] outline-none bg-white text-xs font-semibold focus:border-[#E94F2F]/50"
                                    >
                                      <option value="false">Não (Opcional)</option>
                                      <option value="true">Sim (Obrigatório)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Qtd Mínima</label>
                                    <input
                                      type="number"
                                      id={`group-min-${group.id}`}
                                      min={group.required ? 1 : 0}
                                      value={group.required ? group.minSelect : 0}
                                      disabled={!group.required}
                                      onChange={(e) => {
                                        const val = Math.max(group.required ? 1 : 0, parseInt(e.target.value) || 0);
                                        handleUpdateOptionGroup(group.id, { minSelect: val, minSelections: val });
                                      }}
                                      className={`w-full p-2.5 rounded-lg border outline-none text-xs font-semibold ${
                                        !group.required 
                                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                                          : hasErrorField === 'minSelect' || hasErrorField === 'minSelections' 
                                            ? 'border-red-500 bg-red-50/10 focus:border-red-500 bg-white' 
                                            : 'border-[#EADFD8] focus:border-[#E94F2F]/50 bg-white'
                                      }`}
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Qtd Máxima</label>
                                    <input
                                      type="number"
                                      id={`group-max-${group.id}`}
                                      min={group.minSelect}
                                      value={group.maxSelect}
                                      onChange={(e) => {
                                        const val = Math.max(group.minSelect, parseInt(e.target.value) || 1);
                                        handleUpdateOptionGroup(group.id, { maxSelect: val, maxSelections: val });
                                      }}
                                      className={`w-full p-2.5 rounded-lg border outline-none bg-white text-xs font-semibold ${
                                        hasErrorField === 'maxSelect' || hasErrorField === 'maxSelections' ? 'border-red-500 bg-red-50/10 focus:border-red-500' : 'border-[#EADFD8] focus:border-[#E94F2F]/50'
                                      }`}
                                    />
                                    {group.options.filter(o => o.active).length < group.maxSelect && (
                                      <p className="text-[10px] text-gray-500 font-medium leading-tight mt-1 text-left">
                                        Atualmente existe {group.options.filter(o => o.active).length} opção(ões) ativa(s). O limite configurado será utilizado quando novas opções forem adicionadas.
                                      </p>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Estilo Visual</label>
                                    <select
                                      value={group.displayType || 'list'}
                                      onChange={(e) => handleUpdateOptionGroup(group.id, { displayType: e.target.value as 'segmented' | 'list' })}
                                      className="w-full p-2.5 rounded-lg border border-[#EADFD8] outline-none bg-white text-xs font-semibold focus:border-[#E94F2F]/50"
                                    >
                                      <option value="list">Linhas / Lista (Checkboxes)</option>
                                      <option value="segmented">Botões Lado a Lado (Segmentado)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Status do Grupo</label>
                                    <select
                                      value={group.active ? 'true' : 'false'}
                                      onChange={(e) => handleUpdateOptionGroup(group.id, { active: e.target.value === 'true' })}
                                      className="w-full p-2.5 rounded-lg border border-[#EADFD8] outline-none bg-white text-xs font-semibold"
                                    >
                                      <option value="true">Ativo</option>
                                      <option value="false">Inativo</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Permitir quantidade por opção?</label>
                                    <select
                                      value={group.allowOptionQuantity ? 'true' : 'false'}
                                      onChange={(e) => handleUpdateOptionGroup(group.id, { allowOptionQuantity: e.target.value === 'true' })}
                                      className="w-full p-2.5 rounded-lg border border-[#EADFD8] outline-none bg-white text-xs font-semibold focus:border-[#E94F2F]/50"
                                    >
                                      <option value="false">Não (Apenas selecionar item)</option>
                                      <option value="true">Sim (Permitir +/- unidades do mesmo item)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-[#756B66] uppercase">Máximo de unidades por opção</label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={group.maxQuantityPerOption ?? 5}
                                      disabled={!group.allowOptionQuantity}
                                      onChange={(e) => {
                                        const val = Math.max(1, parseInt(e.target.value) || 1);
                                        handleUpdateOptionGroup(group.id, { maxQuantityPerOption: val });
                                      }}
                                      className={`w-full p-2.5 rounded-lg border outline-none text-xs font-semibold ${
                                        !group.allowOptionQuantity 
                                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                                          : 'border-[#EADFD8] focus:border-[#E94F2F]/50 bg-white'
                                      }`}
                                    />
                                  </div>
                                </div>

                                {/* Options list inside group */}
                                <div className="space-y-2.5 pt-2 border-t border-dashed border-[#EADFD8]">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Itens do Grupo</span>
                                    <button
                                      type="button"
                                      onClick={() => handleAddOptionItem(group.id)}
                                      className="text-[10px] text-[#E94F2F] hover:underline font-black uppercase tracking-wider cursor-pointer"
                                    >
                                      + Adicionar Opção
                                    </button>
                                  </div>

                                  {group.options.length === 0 ? (
                                    <p className="text-center py-4 text-gray-400 italic text-[10px]">
                                      Nenhuma opção criada neste grupo. Adicione itens acima!
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {group.options.map((opt, optIndex) => {
                                        const isOptNameError = hasErrorField === `opt-name-${opt.id}`;
                                        return (
                                          <div
                                            key={opt.id}
                                            className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-2 relative text-xs font-semibold"
                                          >
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                              <div className="space-y-1">
                                                <input
                                                  type="text"
                                                  id={`opt-name-${opt.id}`}
                                                  placeholder="Nome (Ex: Calabresa)"
                                                  value={opt.name}
                                                  onChange={(e) => handleUpdateOptionItem(group.id, opt.id, { name: e.target.value })}
                                                  className={`w-full p-2 rounded-md border outline-none bg-white text-xs font-semibold ${
                                                    isOptNameError ? 'border-red-500 bg-red-50/10 focus:border-red-500' : 'border-gray-300 focus:border-gray-400'
                                                  }`}
                                                />
                                              </div>
                                            <div className="space-y-1">
                                              <input
                                                type="text"
                                                placeholder="Descrição (Opcional)"
                                                value={opt.description || ''}
                                                onChange={(e) => handleUpdateOptionItem(group.id, opt.id, { description: e.target.value })}
                                                className="w-full p-2 rounded-md border border-gray-300 outline-none bg-white text-xs font-semibold"
                                              />
                                            </div>
                                            <div className="flex gap-2 items-center">
                                              <div className="relative flex-1">
                                                <span className="absolute left-2.5 top-2 text-gray-400 text-[10px]">R$</span>
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  min="0"
                                                  placeholder="0.00"
                                                  value={opt.additionalPrice === 0 ? '' : opt.additionalPrice}
                                                  onChange={(e) => {
                                                    const parsedVal = parseFloat(e.target.value);
                                                    const val = isNaN(parsedVal) ? 0 : Math.max(0, parsedVal);
                                                    handleUpdateOptionItem(group.id, opt.id, { additionalPrice: val });
                                                  }}
                                                  className="w-full p-2 pl-7 rounded-md border border-gray-300 outline-none bg-white text-xs font-semibold"
                                                />
                                              </div>
                                              <div className="flex items-center gap-1.5 pl-1.5 border-l border-gray-200">
                                                <button
                                                  type="button"
                                                  disabled={optIndex === 0}
                                                  onClick={() => handleMoveOptionItem(group.id, optIndex, 'up')}
                                                  className="p-1 hover:bg-gray-200 text-gray-500 rounded disabled:opacity-30 cursor-pointer"
                                                >
                                                  <ArrowUp className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={optIndex === group.options.length - 1}
                                                  onClick={() => handleMoveOptionItem(group.id, optIndex, 'down')}
                                                  className="p-1 hover:bg-gray-200 text-gray-500 rounded disabled:opacity-30 cursor-pointer"
                                                >
                                                  <ArrowDown className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleRemoveOptionItem(group.id, opt.id);
                                                  }}
                                                  className="relative z-20 pointer-events-auto p-1 hover:bg-red-100 text-red-600 rounded cursor-pointer"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5 pointer-events-none" pointerEvents="none" />
                                                </button>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <input
                                              type="checkbox"
                                              id={`chk-opt-${opt.id}`}
                                              checked={opt.active}
                                              onChange={(e) => handleUpdateOptionItem(group.id, opt.id, { active: e.target.checked })}
                                              className="w-3.5 h-3.5 accent-[#2F9E69] cursor-pointer"
                                            />
                                            <label htmlFor={`chk-opt-${opt.id}`} className="text-[10px] text-gray-500 cursor-pointer select-none">
                                              Opção ativa para escolha do cliente
                                            </label>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSavingProduct}
                    onClick={() => setIsProductModalOpen(false)}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProduct}
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSavingProduct ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Salvando...</span>
                      </>
                    ) : (
                      editingProduct ? 'Salvar Edições' : 'Cadastrar Produto'
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {chatOrder && (
        <PremiumOrderChat
          order={chatOrder}
          viewerRole="merchant"
          onClose={() => {
            setChatOrder(null);
            setMerchantHighlightMessageId(undefined);
          }}
          highlightMessageId={merchantHighlightMessageId}
        />
      )}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-[#201A17]/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-[#EADFD8] w-full max-w-2xl overflow-hidden shadow-xl"
            >
              {/* Modal Header */}
              <div className="bg-[#F7F4EF] p-5 border-b border-[#EADFD8] flex justify-between items-center">
                <div className="text-left">
                  <span className="bg-[#201A17] text-[#FFBE5C] text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {isFinalOrderStatus(selectedOrder.status) ? 'Pedido Encerrado — Somente Leitura' : 'Pedido Ativo'}
                  </span>
                  <h3 className="font-extrabold text-base text-[#201A17] mt-1.5">
                    Detalhes do Pedido {selectedOrder.id}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 hover:bg-[#EADFD8] rounded-xl transition-all cursor-pointer text-[#756B66] hover:text-[#201A17]"
                  aria-label="Fechar detalhes"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs font-semibold text-[#201A17] scrollbar-thin">
                {/* Header of details */}
                <div className="flex flex-wrap justify-between items-start gap-4 border-b border-[#F7F4EF] pb-4 text-left">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-lg text-[#201A17]">{selectedOrder.id}</h4>
                      {(() => {
                        const statusDetailsMap: Record<string, { label: string; bgClass: string }> = {
                          aguardando_confirmacao: { label: 'Aguardando Confirmação', bgClass: 'bg-amber-100 text-amber-800' },
                          confirmado: { label: 'Confirmado', bgClass: 'bg-blue-100 text-blue-800' },
                          em_preparacao: { label: 'Em Preparação', bgClass: 'bg-orange-100 text-orange-800' },
                          pronto: { label: 'Pronto p/ Entrega', bgClass: 'bg-indigo-100 text-indigo-800' },
                          pronto_retirada: { label: 'Pronto p/ Retirada', bgClass: 'bg-purple-100 text-purple-800' },
                          saiu_entrega: { label: 'Saiu p/ Entrega', bgClass: 'bg-pink-100 text-pink-800' },
                          concluido: { label: 'Concluído', bgClass: 'bg-emerald-100 text-emerald-800' },
                          recusado: { label: 'Recusado', bgClass: 'bg-rose-100 text-rose-800' },
                          cancelado: { label: 'Cancelado', bgClass: 'bg-neutral-100 text-neutral-800' },
                        };
                        const info = statusDetailsMap[selectedOrder.status] || { label: selectedOrder.status, bgClass: 'bg-neutral-100 text-neutral-800' };
                        return (
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${info.bgClass}`}>
                            {info.label}
                          </span>
                        );
                      })()}
                      <span className="bg-[#F7F4EF] text-[#756B66] text-[10px] font-black px-2 py-0.5 rounded uppercase">
                        {selectedOrder.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#756B66] font-bold flex items-center gap-1.5 mt-1">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Feito em: {formatOrderTime(selectedOrder.createdAt)} ({parseOrderDate(selectedOrder.createdAt).toLocaleDateString('pt-BR')})</span>
                    </p>
                    <p className="text-xs text-[#756B66] font-medium pt-1">
                      Cliente: <strong>{selectedOrder.customerName}</strong> ({selectedOrder.customerPhone})
                    </p>
                    {selectedOrder.deliveryType === 'entrega' && (
                      <p className="text-xs text-[#756B66] font-medium">
                        Endereço: <strong>{selectedOrder.customerAddress?.street || 'Sem endereço'}, {selectedOrder.customerAddress?.number || ''} - {selectedOrder.customerAddress?.bairro || ''}</strong>
                        {selectedOrder.customerAddress?.complement && <span> ({selectedOrder.customerAddress.complement})</span>}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#756B66] font-black uppercase">Pagamento</p>
                    <p className="text-xs font-bold text-[#201A17] uppercase">{getPaymentMethodLabel(selectedOrder.paymentMethod, selectedOrder.deliveryType)}</p>
                    <p className="text-base font-black text-[#2F9E69] mt-0.5">R$ {selectedOrder.total.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>

                {/* Items list */}
                <div className="bg-[#F7F4EF]/60 p-4 rounded-xl space-y-2 text-xs text-left">
                  <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Produtos</p>
                  <div className="space-y-2 font-semibold text-[#201A17]">
                    {selectedOrder.items.map((rawItem, idx) => {
                      const item = normalizeOrderItem(rawItem);
                      return (
                        <div key={idx} className="border-b border-[#EADFD8]/40 pb-1.5 last:border-0 last:pb-0 space-y-0.5">
                          <div className="flex justify-between font-bold text-[#201A17]">
                            <span>{item.quantity}x {item.productName}</span>
                            <span>R$ {item.lineTotal.toFixed(2).replace('.', ',')}</span>
                          </div>
                          <div className="pl-4 text-[10px] text-[#756B66] space-y-2 mt-1">
                            {(() => {
                              const customizationLines = getCartItemCustomizationLines(item);
                              const groupedCustomizations = customizationLines.reduce((acc, line) => {
                                const existing = acc.find(g => g.groupName === line.groupName);
                                if (existing) {
                                  existing.options.push(line);
                                } else {
                                  acc.push({
                                    groupName: line.groupName,
                                    options: [line]
                                  });
                                }
                                return acc;
                              }, [] as { groupName: string; options: typeof customizationLines }[]);

                              return (
                                <>
                                  {groupedCustomizations.map((group, gIdx) => (
                                    <div key={gIdx} className="space-y-0.5">
                                      <p className="text-[9px] font-bold text-[#756B66]/80 uppercase tracking-wider">
                                        {group.groupName}
                                      </p>
                                      <div className="space-y-0.5 pl-1.5 border-l border-gray-200">
                                        {group.options.map((opt, oIdx) => {
                                          const hasQty = opt.quantity && opt.quantity > 1;
                                          const displayName = hasQty ? `${opt.optionName} × ${opt.quantity}` : opt.optionName;
                                          const priceText = opt.additionalPrice > 0 
                                            ? ` (+ R$ ${(opt.additionalPrice * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')})` 
                                            : opt.additionalPrice < 0 
                                              ? ` (- R$ ${(Math.abs(opt.additionalPrice) * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')})` 
                                              : ' (Incluso)';

                                          return (
                                            <p key={oIdx} className="text-[10px]">
                                              {displayName}{priceText}
                                            </p>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </>
                              );
                            })()}

                            {item.notes && <p className="italic text-amber-700">Obs: "{item.notes}"</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Values Breakdown */}
                <div className="bg-[#F7F4EF]/30 p-4 rounded-xl border border-[#EADFD8]/50 text-xs space-y-1.5 text-left">
                  <div className="flex justify-between text-[#756B66]">
                    <span>Subtotal:</span>
                    <span className="font-bold text-[#201A17]">R$ {selectedOrder.subtotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                  {selectedOrder.deliveryType === 'entrega' && (
                    <div className="flex justify-between text-[#756B66]">
                      <span>Taxa de Entrega:</span>
                      <span className="font-bold text-[#201A17]">R$ {selectedOrder.deliveryFee.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Descontos:</span>
                      <span className="font-bold">- R$ {selectedOrder.discount.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  <div className="border-t border-[#EADFD8] pt-1.5 flex justify-between font-black text-[#201A17] text-sm">
                    <span>Total:</span>
                    <span className="text-[#2F9E69]">R$ {selectedOrder.total.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>

                {/* Notes / Observações */}
                {selectedOrder.notes && (
                  <div className="bg-amber-50 border border-amber-200/50 p-3 rounded-xl text-left">
                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Observações do Cliente</p>
                    <p className="text-xs text-amber-900 font-bold italic mt-1">“{selectedOrder.notes}”</p>
                  </div>
                )}

                {/* Timeline / Linha do Tempo */}
                {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
                  <div className="border-t border-[#EADFD8] pt-4 space-y-2 text-left">
                    <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Linha do Tempo (Status)</p>
                    <div className="space-y-2 pl-2 border-l-2 border-[#EADFD8]">
                      {selectedOrder.statusHistory.map((step, idx) => {
                        const stepTime = new Date(step.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        const stepDate = new Date(step.timestamp).toLocaleDateString('pt-BR');
                        return (
                          <div key={idx} className="relative pl-4">
                            <span className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-[#E94F2F]" />
                            <p className="text-xs font-bold text-[#201A17] capitalize">{step.status.replace(/_/g, ' ')}</p>
                            <p className="text-[10px] text-[#756B66]">{stepDate} às {stepTime}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Chat and Action Buttons */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-[#F7F4EF] w-full">
                  {isFinalOrderStatus(selectedOrder.status) ? (
                    <>
                      <p className="text-[10px] text-[#756B66] font-bold italic mr-auto">
                        Modo histórico — Edição e alteração de status indisponíveis.
                      </p>
                      <button
                        type="button"
                        onClick={() => setChatOrder(selectedOrder)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]"
                      >
                        <MessageSquare className="w-4 h-4 text-orange-600" />
                        <span>Ver mensagem</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                      {selectedOrder.status === 'aguardando_confirmacao' ? (
                        <>
                          <button
                            onClick={() => {
                              handleUpdateOrderStatus(selectedOrder.id, 'recusado');
                              setSelectedOrder(null);
                            }}
                            className="w-full sm:w-auto px-4 py-2.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-xl font-bold text-xs transition-all"
                          >
                            Recusar
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setChatOrder(selectedOrder)}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]"
                          >
                            <MessageSquare className="w-4 h-4 text-[#E94F2F]" />
                            <span>Conversar com o cliente</span>
                          </button>

                          <button
                            onClick={() => {
                              handleUpdateOrderStatus(selectedOrder.id, 'confirmado');
                              setSelectedOrder(null);
                            }}
                            className="w-full sm:flex-1 py-3 bg-[#2F9E69] hover:bg-emerald-700 text-white rounded-xl font-black text-sm shadow-md transition-all text-center"
                          >
                            Aceitar pedido
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-[#2F9E69] font-bold mr-auto">
                            Status do pedido: <span className="capitalize">{selectedOrder.status.replace(/_/g, ' ')}</span>
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => setChatOrder(selectedOrder)}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border bg-[#F7F4EF] hover:bg-[#EAE5DC] text-[#756B66] border-[#EADFD8]"
                            >
                              <MessageSquare className="w-4 h-4 text-orange-600" />
                              <span>Conversar com o cliente</span>
                            </button>
                            
                            {selectedOrder.status === 'confirmado' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'em_preparacao')}
                                disabled={updatingOrders[selectedOrder.id]}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {updatingOrders[selectedOrder.id] ? 'Iniciando...' : 'Iniciar preparação'}
                              </button>
                            )}
                            {selectedOrder.status === 'em_preparacao' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(selectedOrder.id, selectedOrder.deliveryType === 'entrega' ? 'pronto' : 'pronto_retirada')}
                                disabled={updatingOrders[selectedOrder.id]}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {updatingOrders[selectedOrder.id] ? 'Processando...' : (selectedOrder.deliveryType === 'entrega' ? 'Pronto para entrega' : 'Pronto para retirada')}
                              </button>
                            )}
                            {(selectedOrder.status === 'pronto' || selectedOrder.status === 'pronto_retirada') && (
                              <button
                                onClick={async () => {
                                  const targetStatus = selectedOrder.deliveryType === 'entrega' ? 'saiu_entrega' : 'concluido';
                                  await handleUpdateOrderStatus(selectedOrder.id, targetStatus);
                                  if (targetStatus === 'concluido') {
                                    setSelectedOrder(null);
                                  }
                                }}
                                disabled={updatingOrders[selectedOrder.id]}
                                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                                  updatingOrders[selectedOrder.id]
                                    ? 'bg-indigo-600/50 cursor-not-allowed text-indigo-100'
                                    : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                }`}
                              >
                                {updatingOrders[selectedOrder.id] ? 'Processando...' : (selectedOrder.deliveryType === 'entrega' ? 'Saiu para entrega' : 'Concluir')}
                              </button>
                            )}
                            {selectedOrder.status === 'saiu_entrega' && (
                              <button
                                onClick={async () => {
                                  await handleUpdateOrderStatus(selectedOrder.id, 'concluido');
                                  setSelectedOrder(null);
                                }}
                                disabled={updatingOrders[selectedOrder.id]}
                                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                                  updatingOrders[selectedOrder.id]
                                    ? 'bg-emerald-600/50 cursor-not-allowed text-emerald-100'
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                }`}
                              >
                                {updatingOrders[selectedOrder.id] ? 'Concluindo...' : 'Concluir'}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- ALL OPERATIONAL PENDENCIES MODAL -------------------- */}
      <AnimatePresence>
        {isAllPendenciesModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="merchant-all-pendencies-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-[#EADFD8] flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <div className="space-y-0.5 text-left">
                  <h3 className="font-extrabold text-lg text-[#201A17] flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-[#E94F2F]" />
                    <span>Todas as Pendências Operacionais</span>
                  </h3>
                  <p className="text-xs text-[#756B66] font-semibold">
                    Selecione os filtros abaixo para visualizar pendências por categoria.
                  </p>
                </div>
                <button 
                  onClick={() => setIsAllPendenciesModalOpen(false)} 
                  className="text-[#756B66] hover:text-[#201A17] p-1.5 hover:bg-[#EADFD8]/30 rounded-xl transition-all"
                  aria-label="Fechar modal de pendências"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filters */}
              <div className="p-4 border-b border-[#F7F4EF] flex flex-wrap gap-2 justify-start bg-white">
                {(['todas', 'pedidos', 'mensagens', 'catalogo', 'configuracoes'] as const).map(f => {
                  const label = f === 'todas' ? 'Todas'
                    : f === 'pedidos' ? 'Pedidos'
                    : f === 'mensagens' ? 'Mensagens'
                    : f === 'catalogo' ? 'Catálogo'
                    : 'Configurações';

                  const count = pendencies.filter(p => {
                    if (f === 'todas') return true;
                    if (f === 'pedidos') return p.type === 'pedido_aguardando' || p.type === 'pedido_atrasado';
                    if (f === 'mensagens') return p.type === 'mensagem_nao_respondida';
                    if (f === 'catalogo') return p.type === 'produto_sem_imagem' || p.type === 'promocao_encerrando';
                    if (f === 'configuracoes') return p.type === 'horario_nao_configurado' || p.type === 'entrega_incompleta';
                    return false;
                  }).length;

                  return (
                    <button
                      key={f}
                      onClick={() => setPendencyFilter(f)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                        pendencyFilter === f 
                          ? 'bg-[#E94F2F] text-white border-transparent' 
                          : 'bg-[#F7F4EF]/30 text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]/70'
                      }`}
                      aria-label={`Filtrar por ${label}`}
                    >
                      <span>{label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        pendencyFilter === f ? 'bg-white/20 text-white' : 'bg-[#EADFD8]/40 text-[#756B66]'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Pendencies List */}
              <div className="p-6 overflow-y-auto space-y-3 bg-[#F7F4EF]/10 flex-1 min-h-0">
                {(() => {
                  const filtered = pendencies.filter(p => {
                    if (pendencyFilter === 'todas') return true;
                    if (pendencyFilter === 'pedidos') return p.type === 'pedido_aguardando' || p.type === 'pedido_atrasado';
                    if (pendencyFilter === 'mensagens') return p.type === 'mensagem_nao_respondida';
                    if (pendencyFilter === 'catalogo') return p.type === 'produto_sem_imagem' || p.type === 'promocao_encerrando';
                    if (pendencyFilter === 'configuracoes') return p.type === 'horario_nao_configurado' || p.type === 'entrega_incompleta';
                    return false;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center space-y-3 bg-white border border-[#EADFD8] rounded-2xl">
                        <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                        <div>
                          <p className="text-xs font-black text-[#201A17]">Sem pendências nesta categoria</p>
                          <p className="text-[10px] text-[#756B66]">Tudo certo ou nenhum filtro ativo retornou itens.</p>
                        </div>
                      </div>
                    );
                  }

                  return filtered.map(p => {
                    const originalClick = p.onClick;
                    const wrappedClick = () => {
                      setIsAllPendenciesModalOpen(false);
                      originalClick();
                    };
                    return renderPendencyItem({ ...p, onClick: wrappedClick });
                  });
                })()}
              </div>

              <div className="p-4 border-t border-[#EADFD8] flex justify-end bg-[#F7F4EF]/30">
                <button
                  onClick={() => setIsAllPendenciesModalOpen(false)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-[#756B66] rounded-xl font-bold text-xs transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Order Overlay */}
      {isFetchingOrder && (
        <div className="fixed inset-0 bg-[#201A17]/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-[#EADFD8] p-8 max-w-sm w-full shadow-xl flex flex-col items-center text-center">
            <RefreshCw className="w-10 h-10 text-[#E94F2F] animate-spin mb-4" />
            <h3 className="font-extrabold text-lg text-[#201A17] mb-2">{fetchingOrderMessage}</h3>
            <p className="text-xs text-[#756B66] font-medium">Sincronizando com os servidores para carregar os detalhes.</p>
          </div>
        </div>
      )}

      {/* Fetching Order Error Overlay */}
      {fetchingOrderError && (
        <div className="fixed inset-0 bg-[#201A17]/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-[#EADFD8] p-8 max-w-sm w-full shadow-xl flex flex-col items-center text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
            <h3 className="font-extrabold text-lg text-[#201A17] mb-2">Ops! Ocorreu um erro</h3>
            <p className="text-xs text-[#756B66] font-bold mb-6">{fetchingOrderError}</p>
            <button
              onClick={() => setFetchingOrderError(null)}
              className="w-full bg-[#201A17] text-[#FFBE5C] hover:bg-[#3E342F] py-3 px-6 rounded-2xl font-bold text-xs transition-colors"
            >
              Fechar aviso
            </button>
          </div>
        </div>
      )}
     </div>
   );
 };
