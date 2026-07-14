import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { Product, Order, OrderStatus, BusinessHours, DeliveryNeighborhood } from '../types';
import { normalizeOrderItem } from '../utils/orderCalculation';
import { getPaymentMethodLabel } from '../utils/paymentLabels';
import { 
  Store, List, Clock, Truck, TrendingUp, ShoppingBag, CheckCircle, 
  Settings, Save, Plus, Edit2, Trash2, Power, Eye, EyeOff, X, 
  DollarSign, BarChart3, Clock3, Users, Compass, AlertCircle, ChevronDown, Check, RefreshCw,
  LogOut, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PremiumOrderChat } from './order-chat/PremiumOrderChat';
import { formatOrderTime, parseOrderDate } from '../utils/dateUtils';

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
    showToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'geral' | 'pedidos' | 'cardapio' | 'horarios' | 'entregas'>('pedidos');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [orderObservations, setOrderObservations] = useState<Record<string, string>>({});

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const note = orderObservations[orderId] || null;
    try {
      await updateOrderStatus(orderId, status, undefined, undefined, note);
      setOrderObservations(prev => ({ ...prev, [orderId]: '' }));
    } catch (e) {
      console.error(e);
    }
  };

  const { establishmentId: authEstId, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();

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
    const todayOrders = merchantOrders;
    const waitingOrders = todayOrders.filter(o => o.status === 'aguardando_confirmacao');
    const preparingOrders = todayOrders.filter(o => o.status === 'em_preparacao');
    const completedToday = todayOrders.filter(o => o.status === 'concluido');
    const revenue = completedToday.reduce((sum, o) => sum + o.total, 0);
    const ticketMedia = completedToday.length > 0 ? (revenue / completedToday.length) : 0;

    return {
      waiting: waitingOrders.length,
      preparing: preparingOrders.length,
      completedToday: completedToday.length,
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
    const concluidos = merchantOrders.filter(o => o.status === 'concluido' || o.status === 'recusado');

    return {
      novos,
      emPreparacao,
      prontos,
      emEntrega,
      concluidos
    };
  }, [merchantOrders]);

  // Tab filters inside orders tab
  const [pedidosFilter, setPedidosFilter] = useState<'todos' | 'novos' | 'preparacao' | 'prontos' | 'entrega' | 'concluidos'>('todos');

  // Merchant status toggles
  const toggleOpen = () => {
    if (!currentMerchant) return;
    const currentOpen = currentMerchant.open !== undefined ? currentMerchant.open : currentMerchant.isOpen;
    const nextState = !currentOpen;
    showToast(nextState ? 'Sua loja está ABERTA!' : 'Sua loja está FECHADA para novos pedidos.', 'info');
    setEstablishments(prev => 
      prev.map(e => {
        if (e.id === merchantId) {
          return { ...e, open: nextState, isOpen: nextState };
        }
        return e;
      })
    );
  };

  const toggleAcceptingOrders = () => {
    if (!currentMerchant) return;
    const currentAccepting = currentMerchant.acceptingOrders !== undefined ? currentMerchant.acceptingOrders : true;
    const nextState = !currentAccepting;
    showToast(nextState ? 'Sua loja agora está ACEITANDO pedidos!' : 'Sua loja NÃO está aceitando novos pedidos no momento.', 'info');
    setEstablishments(prev => 
      prev.map(e => {
        if (e.id === merchantId) {
          return { ...e, acceptingOrders: nextState };
        }
        return e;
      })
    );
  };

  const toggleTemporarilyPaused = () => {
    if (!currentMerchant) return;
    const currentPaused = currentMerchant.temporarilyPaused === true;
    const nextState = !currentPaused;
    showToast(nextState ? 'Sua loja está com PEDIDOS PAUSADOS temporariamente!' : 'Sua loja está ATIVA (pausa temporária removida).', 'info');
    setEstablishments(prev => 
      prev.map(e => {
        if (e.id === merchantId) {
          return { ...e, temporarilyPaused: nextState };
        }
        return e;
      })
    );
  };

  // Product CRUD states
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [chatOrder, setChatOrder] = useState<Order | null>(null);
  
  // Product Form states
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('0.00');
  const [prodCategory, setProdCategory] = useState('Pizzas tradicionais');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodImage, setProdImage] = useState('');

  // Handle opening product create/edit
  const handleOpenProductForm = (prod?: Product) => {
    if (prod) {
      setEditingProduct(prod);
      setProdName(prod.name);
      setProdDesc(prod.description);
      setProdPrice(prod.price.toFixed(2));
      setProdCategory(prod.category);
      setProdAvailable(prod.available);
      setProdImage(prod.image || '');
    } else {
      setEditingProduct(null);
      setProdName('');
      setProdDesc('');
      setProdPrice('0.00');
      setProdCategory('Pizzas tradicionais');
      setProdAvailable(true);
      setProdImage('');
    }
    setIsProductModalOpen(true);
  };

  // Submit product
  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName || !prodCategory || isNaN(parseFloat(prodPrice))) {
      showToast('Por favor, preencha os dados do produto corretamente.', 'error');
      return;
    }

    const priceNum = parseFloat(prodPrice);
    const productData: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: prodName,
      description: prodDesc,
      price: priceNum,
      category: prodCategory,
      available: prodAvailable,
      image: prodImage || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=80',
      sizes: editingProduct?.sizes || ['Pequena', 'Média', 'Grande'],
      borders: editingProduct?.borders || ['Sem borda', 'Borda de Catupiry', 'Borda de Cheddar'],
      extras: editingProduct?.extras || [
        { name: 'Dobro de Queijo', price: 8.00 },
        { name: 'Cebola Extra', price: 2.00 },
        { name: 'Bacon fatiado', price: 6.50 }
      ]
    };

    addOrUpdateProduct(merchantId, productData);
    setIsProductModalOpen(false);
  };

  // Delete product
  const handleDeleteProductClick = (prodId: string) => {
    if (confirm('Deseja realmente remover este produto do cardápio permanentemente?')) {
      deleteProduct(merchantId, prodId);
    }
  };

  // Local settings for business hours and neighborhoods
  const [localHours, setLocalHours] = useState<BusinessHours[]>([...businessHours]);
  const [localNeighborhoods, setLocalNeighborhoods] = useState<DeliveryNeighborhood[]>([...neighborhoods]);

  // Local payment configurations
  const [acceptCash, setAcceptCash] = useState<boolean>(true);
  const [acceptPix, setAcceptPix] = useState<boolean>(true);
  const [acceptDebitCard, setAcceptDebitCard] = useState<boolean>(true);
  const [acceptCreditCard, setAcceptCreditCard] = useState<boolean>(true);
  const [acceptContactless, setAcceptContactless] = useState<boolean>(true);
  const [acceptDeliveryPayment, setAcceptDeliveryPayment] = useState<boolean>(true);
  const [acceptPickupPayment, setAcceptPickupPayment] = useState<boolean>(true);

  React.useEffect(() => {
    if (currentMerchant) {
      setAcceptCash(currentMerchant.acceptCash !== false);
      setAcceptPix(currentMerchant.acceptPix !== false);
      setAcceptDebitCard(currentMerchant.acceptDebitCard !== false);
      setAcceptCreditCard(currentMerchant.acceptCreditCard !== false);
      setAcceptContactless(currentMerchant.acceptContactless !== false);
      setAcceptDeliveryPayment(currentMerchant.acceptDeliveryPayment !== false);
      setAcceptPickupPayment(currentMerchant.acceptPickupPayment !== false);
    }
  }, [currentMerchant]);

  const handleSavePaymentConfig = () => {
    setEstablishments(prev =>
      prev.map(e => {
        if (e.id === merchantId) {
          return {
            ...e,
            acceptCash,
            acceptPix,
            acceptDebitCard,
            acceptCreditCard,
            acceptContactless,
            acceptDeliveryPayment,
            acceptPickupPayment
          };
        }
        return e;
      })
    );
    showToast('Configurações de pagamento salvas com sucesso!', 'success');
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

          <div className="flex flex-wrap items-center gap-4 bg-[#F7F4EF] p-3 rounded-2xl border border-[#EADFD8] w-full sm:w-auto justify-between sm:justify-start">
            {/* Control 1: Loja aberta / fechada */}
            <div className="flex items-center gap-2 pr-3 border-r border-[#EADFD8]">
              <div className="text-left">
                <p className="text-[9px] text-[#756B66] font-black uppercase leading-tight">Loja</p>
                <p className={`text-[11px] font-black leading-tight ${(currentMerchant.open !== undefined ? currentMerchant.open : currentMerchant.isOpen) ? 'text-[#2F9E69]' : 'text-rose-500'}`}>
                  {(currentMerchant.open !== undefined ? currentMerchant.open : currentMerchant.isOpen) ? 'Aberta' : 'Fechada'}
                </p>
              </div>
              <button
                onClick={toggleOpen}
                className={`p-1.5 rounded-lg transition-all ${(currentMerchant.open !== undefined ? currentMerchant.open : currentMerchant.isOpen) ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                title={(currentMerchant.open !== undefined ? currentMerchant.open : currentMerchant.isOpen) ? 'Fechar Loja' : 'Abrir Loja'}
              >
                <Power className="w-4 h-4" />
              </button>
            </div>

            {/* Control 2: Aceitando Pedidos */}
            <div className="flex items-center gap-2 pr-3 border-r border-[#EADFD8]">
              <div className="text-left">
                <p className="text-[9px] text-[#756B66] font-black uppercase leading-tight">Pedidos</p>
                <p className={`text-[11px] font-black leading-tight ${(currentMerchant.acceptingOrders !== false) ? 'text-[#2F9E69]' : 'text-rose-500'}`}>
                  {(currentMerchant.acceptingOrders !== false) ? 'Aceitando' : 'Recusando'}
                </p>
              </div>
              <button
                onClick={toggleAcceptingOrders}
                className={`p-1.5 rounded-lg transition-all ${(currentMerchant.acceptingOrders !== false) ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                title={(currentMerchant.acceptingOrders !== false) ? 'Bloquear Pedidos' : 'Aceitar Pedidos'}
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Control 3: Pausa temporária */}
            <div className="flex items-center gap-2">
              <div className="text-left">
                <p className="text-[9px] text-[#756B66] font-black uppercase leading-tight">Pausa</p>
                <p className={`text-[11px] font-black leading-tight ${currentMerchant.temporarilyPaused ? 'text-amber-600' : 'text-[#756B66]'}`}>
                  {currentMerchant.temporarilyPaused ? 'Pausado' : 'Ativo'}
                </p>
              </div>
              <button
                onClick={toggleTemporarilyPaused}
                className={`p-1.5 rounded-lg transition-all ${currentMerchant.temporarilyPaused ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                title={currentMerchant.temporarilyPaused ? 'Remover Pausa' : 'Pausar Temporariamente'}
              >
                <Clock className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
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
                { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag, badge: stats.waiting },
                { id: 'cardapio', label: 'Cardápio', icon: List },
                { id: 'horarios', label: 'Horários de Funcionamento', icon: Clock },
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
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Faturamento do dia</p>
                    <p className="text-2xl font-black text-[#2F9E69]">R$ {stats.revenue.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[10px] text-emerald-600 font-bold">Repasse bruto total</p>
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
                  <div className="flex justify-between items-center">
                    <h3 className="font-extrabold text-base text-[#201A17]">Painel de Pedidos Sincronizados</h3>
                    <span className="bg-[#E94F2F]/10 text-[#E94F2F] text-xs font-black px-3 py-1 rounded-full">
                      Total: {merchantOrders.length}
                    </span>
                  </div>

                  {/* Horizontal Scroll Pill Filter for Categories */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {[
                      { id: 'todos', label: 'Todos', count: merchantOrders.length },
                      { id: 'novos', label: 'Novos', count: categorizedOrders.novos.length, highlight: true },
                      { id: 'preparacao', label: 'Em Preparação', count: categorizedOrders.emPreparacao.length },
                      { id: 'prontos', label: 'Prontos', count: categorizedOrders.prontos.length },
                      { id: 'entrega', label: 'Em Entrega', count: categorizedOrders.emEntrega.length },
                      { id: 'concluidos', label: 'Concluídos', count: categorizedOrders.concluidos.length, quiet: true },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        onClick={() => setPedidosFilter(pill.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                          pedidosFilter === pill.id
                            ? 'bg-[#201A17] text-[#FFBE5C]'
                            : pill.highlight && pill.count > 0
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                            : 'bg-[#F7F4EF] text-[#756B66] hover:bg-neutral-200'
                        }`}
                      >
                        <span>{pill.label}</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded-full ${
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
                            className="relative bg-white rounded-3xl border-2 border-amber-300 shadow-md p-6 space-y-4 overflow-hidden"
                            id={`new-order-card-${order.id}`}
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
                                  {order.deliveryType === 'entrega' ? 'Delivery' : 'Retirada'}
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
                                    <div className="pl-4 text-[10px] text-[#756B66] space-y-0.5 mt-0.5">
                                      {item.selectedSize && <p>Tamanho: {item.selectedSize.name}</p>}
                                      {item.selectedCrust && item.selectedCrust.name !== 'Sem borda' && <p>Borda: {item.selectedCrust.name}</p>}
                                      {item.selectedExtras.length > 0 && (
                                        <p>Adicionais: {item.selectedExtras.map(e => `${e.name} (${e.quantity}x)`).join(', ')}</p>
                                      )}
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
                        <div key={order.id} className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
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
                                  {order.deliveryType === 'entrega' ? 'Delivery' : 'Retirada'}
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
                                  <div className="pl-4 text-[10px] text-[#756B66] space-y-0.5">
                                    {item.selectedSize && <p>Tamanho: {item.selectedSize.name}</p>}
                                    {item.selectedCrust && item.selectedCrust.name !== 'Sem borda' && <p>Borda: {item.selectedCrust.name}</p>}
                                    {item.selectedExtras.length > 0 && (
                                      <p>Adicionais: {item.selectedExtras.map(e => `${e.name} (${e.quantity}x)`).join(', ')}</p>
                                    )}
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
                        <div key={order.id} className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
                          <div className="flex justify-between items-start border-b border-[#F7F4EF] pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-base text-[#201A17]">{order.id}</h4>
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                  {order.status === 'pronto_retirada' ? 'Pronto p/ Retirada' : 'Pronto p/ Entrega'}
                                </span>
                                <span className="bg-[#F7F4EF] text-[#756B66] text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                  {order.deliveryType === 'entrega' ? 'Delivery' : 'Retirada'}
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
                        <div key={order.id} className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
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
                              className="px-5 py-2.5 bg-[#2F9E69] hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors"
                            >
                              Concluir pedido
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {/* CONCLUÍDOS SECTION - Appearence more quiet / discreta */}
                  {(pedidosFilter === 'todos' || pedidosFilter === 'concluidos') && (categorizedOrders.concluidos.length > 0) && (
                    <div className="space-y-3 opacity-65 saturate-75 hover:opacity-100 transition-all">
                      <h4 className="text-xs font-black text-neutral-500 uppercase tracking-wider">Histórico de Pedidos Fechados ({categorizedOrders.concluidos.length})</h4>
                      
                      {categorizedOrders.concluidos.map((order) => (
                        <div key={order.id} className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[#201A17]">{order.id} - {order.customerName}</span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                              order.status === 'concluido' ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                            }`}>
                              {order.status === 'concluido' ? 'Concluído' : 'Recusado'}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 font-medium">
                            Total: R$ {order.total.toFixed(2).replace('.', ',')} • {order.deliveryType === 'entrega' ? 'Delivery' : 'Retirada'}
                          </p>
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
                   categorizedOrders.concluidos.length === 0 && (
                    <div className="bg-white p-12 text-center rounded-2xl border border-[#EADFD8] text-[#756B66] text-xs">
                      Sem correspondência de pedidos para este filtro.
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: GERENCIAR CARDÁPIO (Cardápio) -------------------- */}
            {activeTab === 'cardapio' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
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
                              {p.image && <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                              <div>
                                <h4 className="font-bold text-[#201A17]">{p.name}</h4>
                                <p className="text-[10px] text-[#756B66] font-medium line-clamp-1 max-w-xs">{p.description}</p>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-[#756B66]">{p.category}</td>
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
                                  onClick={() => handleDeleteProductClick(p.id)}
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
                {/* CONFIGURAÇÃO DE BAIRROS */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-6">
                  <div>
                    <h3 className="font-extrabold text-base text-[#201A17]">Configurações de Entrega por Bairro</h3>
                    <p className="text-xs text-[#756B66] mt-0.5">Estipule taxas de entrega personalizadas para cada bairro cadastrado em Cidade Modelo.</p>
                  </div>

                  <div className="space-y-4">
                    {localNeighborhoods.map((n, idx) => (
                      <div key={n.id} className="flex items-center justify-between border-b border-[#F7F4EF] pb-3 text-xs font-bold text-[#201A17]">
                        <div className="space-y-0.5">
                          <p>{n.name}</p>
                          <p className="text-[10px] text-[#756B66] font-medium">Tempo médio: {n.timeEstimate}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 font-semibold">R$</span>
                          <input
                            type="number"
                            step="0.50"
                            value={n.fee}
                            onChange={(e) => handleNeighborhoodFeeChange(idx, e.target.value)}
                            className="w-24 p-2 border border-[#EADFD8] rounded-lg text-xs font-bold outline-none focus:border-[#E94F2F]/50 bg-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-[#F7F4EF] flex justify-end">
                    <button
                      onClick={handleSaveNeighborhoods}
                      className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Salvar Tarifas</span>
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
                            checked={acceptDeliveryPayment}
                            onChange={(e) => setAcceptDeliveryPayment(e.target.checked)}
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
                            checked={acceptPickupPayment}
                            onChange={(e) => setAcceptPickupPayment(e.target.checked)}
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

          </div>
        </div>
      </div>

      {/* -------------------- CREATE/EDIT PRODUCT FORM MODAL -------------------- */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="merchant-product-form-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17]">
                  {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
                </h3>
                <button onClick={() => setIsProductModalOpen(false)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleProductSubmit} className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                
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
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Descrição do cardápio *</label>
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
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white"
                    >
                      <option value="Pizzas tradicionais">Pizzas tradicionais</option>
                      <option value="Pizzas especiais">Pizzas especiais</option>
                      <option value="Combos">Combos</option>
                      <option value="Bebidas">Bebidas</option>
                      <option value="Sobremesas">Sobremesas</option>
                    </select>
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

                {/* Form Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold shadow-xs"
                  >
                    {editingProduct ? 'Salvar Edições' : 'Cadastrar Produto'}
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
          onClose={() => setChatOrder(null)}
        />
      )}
     </div>
   );
 };
