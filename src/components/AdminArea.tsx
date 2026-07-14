import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { isFirebaseConnected } from '../lib/firebase';
import { Establishment, Order, SupportTicket, Feedback, OrderStatus } from '../types';
import { normalizeOrderItem } from '../utils/orderCalculation';
import { getPaymentMethodLabel } from '../utils/paymentLabels';
import { formatOrderDate, formatOrderDateTime } from '../utils/dateUtils';
import { CatalogMigrationPage } from './CatalogMigrationPage';
import { 
  Building2, ShoppingCart, MessageSquare, Star, Shield, Plus, X, 
  Check, Phone, Mail, Award, DollarSign, Activity, FileText, 
  UserCheck, AlertTriangle, Eye, ArrowUpRight, HelpCircle, Search, Filter, Calendar, Clock, ChevronDown, MapPin,
  Database, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AdminArea: React.FC = () => {
  const {
    cities,
    establishments,
    setEstablishments,
    orders,
    tickets,
    setTickets,
    feedbacks,
    setFeedbacks,
    showToast,
    updateOrderPaymentStatus,
    updateOrderStatus,
    adminFilters,
    setAdminFilters,
    connectionStatus
  } = useApp();

  const { isAuthenticated, userProfile, logout } = useAuth();
  const [path, navigate] = useLocation();
  const isDemo = path === '/demo';

  const [adminTab, setAdminTab] = useState<'dashboard' | 'pedidos' | 'lojas' | 'cidades' | 'suporte' | 'feedbacks'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Administrative City Filters
  const [dashboardCityFilter, setDashboardCityFilter] = useState('all');
  const [ordersCityFilter, setOrdersCityFilter] = useState('all');
  const [lojasCityFilter, setLojasCityFilter] = useState('all');
  const [selectedEstFilter, setSelectedEstFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Synchronize local filter states with central adminFilters in AppContext for real-time Firestore queries
  useEffect(() => {
    if (setAdminFilters) {
      setAdminFilters({
        cityId: ordersCityFilter === 'all' ? null : ordersCityFilter,
        establishmentId: selectedEstFilter === 'all' ? null : selectedEstFilter,
        status: selectedStatusFilter === 'all' ? null : (selectedStatusFilter as any),
      });
    }
  }, [ordersCityFilter, selectedEstFilter, selectedStatusFilter, setAdminFilters]);

  // Synchronize adminTab with URL path for /admin/migracao-catalogo
  useEffect(() => {
    if (path === '/admin/migracao-catalogo') {
      setAdminTab('migracao' as any);
    } else if (path === '/admin') {
      setAdminTab(prev => prev === ('migracao' as any) ? 'dashboard' : prev);
    }
  }, [path]);

  // Platform KPIs requested in 4. PAINEL ADMINISTRATIVO
  const kpis = useMemo(() => {
    const filteredEsts = dashboardCityFilter === 'all'
      ? establishments
      : establishments.filter(e => e.cityId === dashboardCityFilter);
    const filteredOrds = dashboardCityFilter === 'all'
      ? orders
      : orders.filter(o => o.cityId === dashboardCityFilter);

    const totalStoresCount = filteredEsts.length;
    const activeStoresCount = filteredEsts.filter(e => e.isOpen).length;
    
    const todayOrders = filteredOrds;
    const activeOrders = todayOrders.filter(o => o.status !== 'concluido' && o.status !== 'recusado');
    const completedOrders = todayOrders.filter(o => o.status === 'concluido');
    
    const volumeMovimentado = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const ticketMedia = completedOrders.length > 0 ? (volumeMovimentado / completedOrders.length) : 0;
    
    const openTicketsCount = tickets.filter(t => t.status === 'aberto').length;

    // Calculate delayed orders (active and older than 40 minutes)
    const delayedOrdersCount = todayOrders.filter(o => {
      if (o.status === 'concluido' || o.status === 'recusado') return false;
      const elapsedMin = (new Date().getTime() - new Date(o.createdAt).getTime()) / 60000;
      return elapsedMin > 40;
    }).length;

    return {
      totalStores: totalStoresCount,
      activeStores: activeStoresCount,
      ordersTodayCount: todayOrders.length,
      activeOrdersCount: activeOrders.length,
      volumeMovimentado,
      ticketMedia,
      openTickets: openTicketsCount,
      delayedOrders: delayedOrdersCount
    };
  }, [establishments, orders, tickets, dashboardCityFilter]);

  // Support Reply States
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');

  // New Merchant Registration Form states
  const [isNewStoreModalOpen, setIsNewStoreModalOpen] = useState(false);
  
  const [storeName, setStoreName] = useState('');
  const [storeCategory, setStoreCategory] = useState('Pizzas');
  const [storeOwner, setStoreOwner] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeCity, setStoreCity] = useState('São João Batista do Glória');
  const [storeCityId, setStoreCityId] = useState('sao-joao-batista-do-gloria-mg');
  const [storeBairro, setStoreBairro] = useState('');
  const [storeCep, setStoreCep] = useState('');
  const [storeAtendeRetirada, setStoreAtendeRetirada] = useState(true);
  const [storeEntregaPropria, setStoreEntregaPropria] = useState(true);
  const [storeBairrosAtendidos, setStoreBairrosAtendidos] = useState('');
  const [storeDeliveryFee, setStoreDeliveryFee] = useState(6.00);
  const [storeMinOrderValue, setStoreMinOrderValue] = useState(25.00);
  const [storeDocument, setStoreDocument] = useState('');
  const [storeCompanyName, setStoreCompanyName] = useState('');
  const [storePlatformFee, setStorePlatformFee] = useState(10);

  // States for Search & Filters inside "Todos os pedidos"
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeliveryFilter, setSelectedDeliveryFilter] = useState('all');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState('all');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState('all'); // all, hoje, ontem, 7d

  // State for order detail modal
  const [selectedDetailedOrder, setSelectedDetailedOrder] = useState<Order | null>(null);

  const activeDetailedOrder = useMemo(() => {
    if (!selectedDetailedOrder) return null;
    return orders.find(o => o.id === selectedDetailedOrder.id) || selectedDetailedOrder;
  }, [orders, selectedDetailedOrder]);

  // Cities summary section data helper
  const citiesData = useMemo(() => {
    return cities.map(c => {
      const cityEsts = establishments.filter(e => e.cityId === c.id);
      const cityOrds = orders.filter(o => o.cityId === c.id);
      const completedOrds = cityOrds.filter(o => o.status === 'concluido');
      
      const demoBases: Record<string, number> = {
        'sao-joao-batista-do-gloria-mg': 1240.00,
        'passos-mg': 890.00
      };

      const volume = completedOrds.reduce((sum, o) => sum + o.total, 0) + (demoBases[c.id] || 0);

      return {
        id: c.id,
        name: c.name,
        state: c.state,
        storesCount: cityEsts.length,
        activeStoresCount: cityEsts.filter(e => e.isOpen).length,
        ordersTodayCount: cityOrds.length,
        volumeMovimentado: volume,
        status: "Operação Ativa"
      };
    });
  }, [cities, establishments, orders]);

  // Compute filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // City filter match
      if (ordersCityFilter !== 'all' && o.cityId !== ordersCityFilter) return false;

      // Search matches customerName, phone, or ID
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const nameMatch = o.customerName.toLowerCase().includes(query);
        const phoneMatch = o.customerPhone.includes(query);
        const idMatch = o.id.toLowerCase().includes(query);
        if (!nameMatch && !phoneMatch && !idMatch) return false;
      }

      // Est match
      if (selectedEstFilter !== 'all' && o.establishmentId !== selectedEstFilter) return false;

      // Status match
      if (selectedStatusFilter !== 'all' && o.status !== selectedStatusFilter) return false;

      // Delivery type match
      if (selectedDeliveryFilter !== 'all' && o.deliveryType !== selectedDeliveryFilter) return false;

      // Payment method match
      if (selectedPaymentFilter !== 'all' && o.paymentMethod !== selectedPaymentFilter) return false;

      // Period match (hoje, ontem, 7d)
      if (selectedPeriodFilter !== 'all') {
        const orderTime = new Date(o.createdAt).getTime();
        const now = new Date().getTime();
        const diffHours = (now - orderTime) / (1000 * 60 * 60);

        if (selectedPeriodFilter === 'hoje' && diffHours > 24) return false;
        if (selectedPeriodFilter === 'ontem' && (diffHours < 24 || diffHours > 48)) return false;
        if (selectedPeriodFilter === '7d' && diffHours > 168) return false;
      }

      return true;
    });
  }, [orders, searchQuery, selectedEstFilter, selectedStatusFilter, selectedDeliveryFilter, selectedPaymentFilter, selectedPeriodFilter, ordersCityFilter]);

  // Compute fictional revenues for merchants in the table
  const merchantRevenueLog = useMemo(() => {
    const filteredEsts = lojasCityFilter === 'all'
      ? establishments
      : establishments.filter(e => e.cityId === lojasCityFilter);

    return filteredEsts.map(est => {
      // Calculate real total from active/concluido orders
      const estOrders = orders.filter(o => o.establishmentId === est.id);
      const realRev = estOrders.filter(o => o.status === 'concluido').reduce((sum, o) => sum + o.total, 0);
      
      const demoBases: Record<string, number> = {
        'pizzaria-da-praca': 1240.00,
        'burger-17': 890.00,
        'sushi-nori': 520.00,
        'mercado-avenida': 1410.00
      };
      
      const totalRevenue = realRev + (demoBases[est.id] || 0);
      const totalOrdersCount = estOrders.length + Math.floor((demoBases[est.id] || 100) / 35);

      return {
        ...est,
        revenue: totalRevenue,
        orderCount: totalOrdersCount
      };
    });
  }, [establishments, orders, lojasCityFilter]);

  // Toggle open status
  const toggleMerchantOpenState = (estId: string) => {
    const targetEst = establishments.find(e => e.id === estId);
    if (!targetEst) return;
    const nextState = !targetEst.isOpen;
    showToast(`Loja ${targetEst.name} atualizada para ${nextState ? 'Ativa' : 'Pausada'}.`, 'info');
    setEstablishments(prev =>
      prev.map(e => {
        if (e.id === estId) {
          return { ...e, isOpen: nextState };
        }
        return e;
      })
    );
  };

  // Onboard New Merchant
  const handleOnboardMerchantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName || !storeOwner || !storePhone || !storeCompanyName) {
      showToast('Por favor, preencha todos os campos obrigatórios do formulário.', 'error');
      return;
    }

    const cityObj = cities.find(c => c.id === storeCityId) || cities[0];

    const newEst: Establishment = {
      id: `est-${Date.now()}`,
      name: storeName,
      category: storeCategory,
      rating: 5.0,
      deliveryTime: '30-45 min',
      deliveryFee: storeDeliveryFee,
      minOrderValue: storeMinOrderValue,
      isOpen: true,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80',
      phone: storePhone,
      email: storeEmail,
      owner: storeOwner,
      address: storeAddress,
      city: cityObj.name,
      cityId: cityObj.id,
      cityName: cityObj.name,
      state: cityObj.state,
      active: true,
      featured: false,
      document: storeDocument,
      companyName: storeCompanyName,
      platformFeePercent: storePlatformFee,
      bairro: storeBairro,
      cep: storeCep,
      atendeRetirada: storeAtendeRetirada,
      entregaPropria: storeEntregaPropria,
      bairrosAtendidos: storeBairrosAtendidos
    };

    setEstablishments(prev => [...prev, newEst]);
    setIsNewStoreModalOpen(false);
    showToast(`Estabelecimento ${storeName} cadastrado com sucesso!`, 'success');

    // Reset Form fields
    setStoreName('');
    setStoreOwner('');
    setStorePhone('');
    setStoreEmail('');
    setStoreAddress('');
    setStoreDocument('');
    setStoreCompanyName('');
    setStorePlatformFee(10);
    setStoreCityId('sao-joao-batista-do-gloria-mg');
    setStoreBairro('');
    setStoreCep('');
    setStoreAtendeRetirada(true);
    setStoreEntregaPropria(true);
    setStoreBairrosAtendidos('');
    setStoreDeliveryFee(6.00);
    setStoreMinOrderValue(25.00);
  };

  // Respond to support ticket
  const handleSendTicketReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    const updatedTickets = tickets.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          status: 'respondido' as const,
          replies: [
            ...t.replies,
            {
              sender: 'Suporte UaiPertim',
              message: replyMessage.trim(),
              date: new Date().toISOString()
            }
          ]
        };
      }
      return t;
    });

    setTickets(updatedTickets);
    setReplyMessage('');
    setSelectedTicket(null);
    showToast(`Chamado ${selectedTicket.id} respondido com sucesso!`, 'success');
  };

  // Status progression timestamps for realistic demo
  const getTimelineHistory = (order: Order) => {
    const start = new Date(order.createdAt);
    const getHourStr = (addMinutes: number) => {
      return new Date(start.getTime() + addMinutes * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const history = [
      { status: 'aguardando_confirmacao', label: 'Pedido Recebido', time: getHourStr(0), done: true },
      { status: 'confirmado', label: 'Confirmado pelo Parceiro', time: getHourStr(2), done: false },
      { status: 'em_preparacao', label: 'Em Preparação', time: getHourStr(5), done: false },
    ];

    if (order.deliveryType === 'entrega') {
      history.push(
        { status: 'pronto', label: 'Pronto para Entrega', time: getHourStr(25), done: false },
        { status: 'saiu_entrega', label: 'Saiu para Entrega', time: getHourStr(27), done: false },
        { status: 'concluido', label: 'Entregue e Concluído', time: getHourStr(40), done: false }
      );
    } else {
      history.push(
        { status: 'pronto_retirada', label: 'Pronto para Retirada', time: getHourStr(23), done: false },
        { status: 'concluido', label: 'Retirado pelo Cliente', time: getHourStr(35), done: false }
      );
    }

    // Map which ones are completed based on order's current status
    let activeMatch = true;
    const updatedHistory = history.map((item) => {
      if (activeMatch) {
        item.done = true;
      }
      // If we reach current status, anything after is pending (not done)
      if (item.status === order.status) {
        activeMatch = false;
      }
      return item;
    });

    // If order is recusado, replace the rest with Recusado
    if (order.status === 'recusado') {
      return [
        { label: 'Pedido Recebido', time: getHourStr(0), done: true, color: 'text-neutral-500' },
        { label: 'Recusado e Cancelado', time: getHourStr(1), done: true, color: 'text-rose-600' }
      ];
    }

    return updatedHistory;
  };

  return (
    <div className="bg-[#F7F4EF] min-h-screen pb-16 text-[#201A17]" id="admin-area-wrapper">
      
      {/* Title Header */}
      <div className="bg-white border-b border-[#EADFD8] py-5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#201A17] text-white p-3 rounded-2xl shadow-sm">
              <Shield className="w-7 h-7 text-[#FFBE5C]" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-[#201A17] tracking-tight">Painel Administrativo UaiPertim</h2>
              <p className="text-xs text-[#756B66] font-semibold mt-0.5">Visão Global e Controle da Plataforma</p>
            </div>
          </div>

          <span className="bg-[#FFBE5C]/25 text-[#201A17] text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
            Acesso Administrador Principal
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Collapsible Mobile Menu & Desktop Sidebar */}
          <div className="lg:col-span-1 bg-white p-3 rounded-2xl border border-[#EADFD8] shadow-sm self-start">
            {/* Mobile Header for Admin Tabs */}
            <div className="lg:hidden flex items-center justify-between">
              <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Módulos Administrativos</span>
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="px-3 py-1.5 bg-[#F7F4EF] text-xs font-bold text-[#201A17] rounded-lg flex items-center gap-1 border border-[#EADFD8]"
              >
                <span>{isMobileMenuOpen ? 'Fechar Menu' : 'Alterar Aba'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#756B66] transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* List of Admin navigation tabs */}
            <div className={`mt-3 lg:mt-0 space-y-1 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
              <p className="hidden lg:block text-[10px] font-black text-[#756B66] uppercase tracking-wider px-3.5 py-1">Módulos Administrativos</p>
              {[
                { id: 'dashboard', label: 'Painel Central', icon: Activity },
                { id: 'pedidos', label: 'Todos os pedidos', icon: ShoppingCart },
                { id: 'lojas', label: 'Estabelecimentos', icon: Building2 },
                { id: 'cidades', label: 'Cidades atendidas', icon: MapPin },
                { id: 'migracao', label: 'Migração do catálogo', icon: Database },
                { id: 'suporte', label: 'Central de suporte', icon: HelpCircle, badge: kpis.openTickets },
                { id: 'feedbacks', label: 'Avaliações e feedbacks', icon: Star },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = adminTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'migracao') {
                        navigate('/admin/migracao-catalogo');
                      } else {
                        navigate('/admin');
                        setAdminTab(tab.id as any);
                      }
                      setIsMobileMenuOpen(false); // Auto close
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-[#201A17] text-[#FFBE5C] shadow-sm'
                        : 'text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4.5 h-4.5 shrink-0" />
                      <span>{tab.label}</span>
                    </span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#FFBE5C] text-[#201A17]' : 'bg-[#E94F2F] text-white'}`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Sair button for authenticated admins */}
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

          {/* Main Display Box */}
          <div className="lg:col-span-3 space-y-6">

            {/* -------------------- TAB: DASHBOARD / PAINEL CENTRAL -------------------- */}
            {adminTab === 'dashboard' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Database Connection Status Section */}
                {connectionStatus && (
                  <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3 w-full">
                      <div className={`p-2.5 rounded-xl border ${
                        connectionStatus.status === 'firebase-connected'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                          : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                        <Database className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-between">
                          <h4 className="font-extrabold text-[#201A17] text-sm flex items-center gap-2">
                            <span>Status da Aplicação</span>
                          </h4>
                          <div className="flex items-center gap-2">
                            {isDemo ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-amber-50 text-amber-800 border-amber-200">
                                Modo demonstração
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                connectionStatus.status === 'firebase-connected'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}>
                                {connectionStatus.status === 'firebase-connected' ? 'Firebase conectado' : 'Firebase indisponível'}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-amber-50 text-amber-800 border-amber-200">
                              Fonte: {isDemo ? 'localStorage' : 'Demonstração local'}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-[#756B66] mt-1.5 font-semibold leading-relaxed">
                          {isDemo 
                            ? 'Este painel está rodando no ambiente de demonstração comercial utilizando dados locais salvos neste navegador.'
                            : 'Painel administrativo oficial com autenticação real e controle de acesso via Firestore.'}
                        </p>

                        {/* Auth Status indicators */}
                        <div className="mt-3 pt-3 border-t border-[#EADFD8]/60 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-bold text-[#756B66]">
                          {isDemo ? (
                            <>
                              <div className="flex flex-wrap items-center gap-4">
                                <div>
                                  <span className="text-[#201A17] font-black uppercase tracking-wider text-[9px] mr-1.5">Autenticação:</span>
                                  <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px] font-extrabold">Modo demonstração</span>
                                </div>
                                <div>
                                  <span className="text-[#201A17] font-black uppercase tracking-wider text-[9px] mr-1.5">Fonte dos dados:</span>
                                  <span className="text-gray-800 bg-gray-50 px-2 py-0.5 rounded border border-gray-200 text-[10px] font-extrabold">localStorage</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-4">
                                <div>
                                  <span className="text-[#201A17] font-black uppercase tracking-wider text-[9px] mr-1.5">Autenticação:</span>
                                  <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] font-extrabold">Firebase Authentication</span>
                                </div>
                                <div>
                                  <span className="text-[#201A17] font-black uppercase tracking-wider text-[9px] mr-1.5">Perfil:</span>
                                  <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] font-extrabold">Administrador autenticado</span>
                                </div>
                                <div>
                                  <span className="text-[#201A17] font-black uppercase tracking-wider text-[9px] mr-1.5">Fonte dos dados comerciais:</span>
                                  <span className="text-orange-800 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 text-[10px] font-extrabold">Demonstração local</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Seletor de cidade do Dashboard Administrativo */}
                <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-wrap items-center justify-between gap-4 shadow-sm text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#E94F2F]" />
                    <span className="font-extrabold text-[#201A17] text-sm">Filtro do Painel por Cidade:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setDashboardCityFilter('all')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        dashboardCityFilter === 'all'
                          ? 'bg-[#201A17] text-[#FFBE5C] shadow-sm'
                          : 'bg-[#F7F4EF] text-[#756B66] hover:bg-gray-100'
                      }`}
                    >
                      Visão Geral
                    </button>
                    {cities.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setDashboardCityFilter(c.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          dashboardCityFilter === c.id
                            ? 'bg-[#201A17] text-[#FFBE5C] shadow-sm'
                            : 'bg-[#F7F4EF] text-[#756B66] hover:bg-gray-100'
                        }`}
                      >
                        {c.name} - {c.state}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 7 KPI Cards Grid requested in 4. PAINEL ADMINISTRATIVO */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Pedidos hoje</p>
                    <p className="text-2xl font-black text-[#201A17]">{kpis.ordersTodayCount}</p>
                    <p className="text-[9px] text-[#756B66] font-semibold">Total recebido nas filiais</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Pedidos ativos</p>
                    <p className="text-2xl font-black text-[#E94F2F]">{kpis.activeOrdersCount}</p>
                    <p className="text-[9px] text-orange-600 font-bold">Em processamento</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Volume movimentado</p>
                    <p className="text-2xl font-black text-[#2F9E69]">R$ {kpis.volumeMovimentado.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[9px] text-[#2F9E69] font-bold">Soma de concluídos</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Ticket médio</p>
                    <p className="text-2xl font-black text-[#201A17]">R$ {kpis.ticketMedia.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[9px] text-[#756B66] font-semibold">Média por pedido</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Lojas abertas</p>
                    <p className="text-2xl font-black text-[#201A17]">{kpis.activeStores}</p>
                    <p className="text-[9px] text-emerald-600 font-bold">De {kpis.totalStores} credenciadas</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Pedidos com atraso</p>
                    <p className="text-2xl font-black text-rose-600">{kpis.delayedOrders}</p>
                    <p className="text-[9px] text-rose-500 font-bold">Atraso &gt; 40 min</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-2 col-span-2 md:col-span-2">
                    <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Chamados de suporte</p>
                    <p className="text-2xl font-black text-blue-600">{kpis.openTickets}</p>
                    <p className="text-[9px] text-blue-500 font-bold">Atendimentos abertos na central</p>
                  </div>
                </div>

                {/* Secondary operational metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-base text-[#201A17]">Desempenho e Modelo Comercial</h3>
                    <p className="text-xs text-[#756B66] leading-relaxed">
                      A plataforma UaiPertim atua de forma independente nas cidades pequenas da região.
                    </p>
                    <div className="bg-[#F7F4EF] p-4 rounded-xl flex flex-col gap-2 text-xs font-semibold text-[#756B66]">
                      <div className="flex justify-between items-center border-b border-[#EADFD8]/60 pb-2">
                        <span>Modelo comercial:</span>
                        <span className="font-bold text-[#201A17]">Mensalidade por estabelecimento</span>
                      </div>
                      <div className="pt-1 text-[11px] text-[#756B66] leading-normal font-medium">
                        <strong>Observação:</strong> Os pagamentos dos pedidos são realizados diretamente aos estabelecimentos. A UaiPertim não cobra taxas sobre o volume de vendas e não realiza o processamento financeiro das transações.
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-base text-[#201A17]">Suporte Técnico do Município</h3>
                    <p className="text-xs text-[#756B66] leading-relaxed">
                      Tempo médio de resposta do suporte de TI da central UaiPertim é de <strong>4 minutos</strong> neste navegador de simulação.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: TODOS OS PEDIDOS (Todos os Pedidos) -------------------- */}
            {adminTab === 'pedidos' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Search & Filters block requested in 4. PAINEL ADMINISTRATIVO */}
                <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-sm space-y-4 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#E94F2F]" />
                    <h4 className="font-black text-sm text-[#201A17]">Filtros e Pesquisa de Pedidos</h4>
                  </div>

                  {/* Search Input Row */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#756B66]" />
                    <input
                      type="text"
                      placeholder="Buscar por cliente, telefone ou código (#PL-1234)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  {/* Multi-Filter Dropdown Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Cidade */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Cidade de atuação</label>
                      <select
                        value={ordersCityFilter}
                        onChange={(e) => setOrdersCityFilter(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-[#EADFD8] bg-white text-xs font-bold"
                      >
                        <option value="all">Todas as cidades</option>
                        {cities.map(c => (
                          <option key={c.id} value={c.id}>{c.name} - {c.state}</option>
                        ))}
                      </select>
                    </div>

                    {/* Estabelecimento */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Estabelecimento</label>
                      <select
                        value={selectedEstFilter}
                        onChange={(e) => setSelectedEstFilter(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-[#EADFD8] bg-white text-xs font-bold"
                      >
                        <option value="all">Todos</option>
                        {establishments.map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Status</label>
                      <select
                        value={selectedStatusFilter}
                        onChange={(e) => setSelectedStatusFilter(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-[#EADFD8] bg-white text-xs font-bold"
                      >
                        <option value="all">Todos</option>
                        <option value="aguardando_confirmacao">Aguardando Aceite</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="em_preparacao">Em Preparação</option>
                        <option value="pronto">Pronto p/ Entrega</option>
                        <option value="pronto_retirada">Pronto p/ Retirada</option>
                        <option value="saiu_entrega">Saiu para Entrega</option>
                        <option value="concluido">Concluído</option>
                        <option value="recusado">Recusado</option>
                      </select>
                    </div>

                    {/* Tipo de Entrega */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Tipo de Entrega</label>
                      <select
                        value={selectedDeliveryFilter}
                        onChange={(e) => setSelectedDeliveryFilter(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-[#EADFD8] bg-white text-xs font-bold"
                      >
                        <option value="all">Todos</option>
                        <option value="entrega">Delivery</option>
                        <option value="retirada">Retirada</option>
                      </select>
                    </div>

                    {/* Forma de Pagamento */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Pagamento</label>
                      <select
                        value={selectedPaymentFilter}
                        onChange={(e) => setSelectedPaymentFilter(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-[#EADFD8] bg-white text-xs font-bold"
                      >
                        <option value="all">Todos</option>
                        <option value="pix">Pix</option>
                        <option value="entrega_cartao">Cartão</option>
                        <option value="entrega_dinheiro">Dinheiro</option>
                      </select>
                    </div>

                    {/* Período */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Período</label>
                      <select
                        value={selectedPeriodFilter}
                        onChange={(e) => setSelectedPeriodFilter(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-[#EADFD8] bg-white text-xs font-bold"
                      >
                        <option value="all">Todo histórico</option>
                        <option value="hoje">Últimas 24 horas</option>
                        <option value="ontem">Ontem (24h - 48h)</option>
                        <option value="7d">Últimos 7 dias</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Orders Results Counter */}
                <div className="flex justify-between items-center text-xs text-[#756B66] px-1 font-bold">
                  <span>Mostrando {filteredOrders.length} pedido(s) correspondente(s)</span>
                  {(searchQuery || selectedEstFilter !== 'all' || selectedStatusFilter !== 'all' || selectedDeliveryFilter !== 'all' || selectedPaymentFilter !== 'all' || selectedPeriodFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedEstFilter('all');
                        setSelectedStatusFilter('all');
                        setSelectedDeliveryFilter('all');
                        setSelectedPaymentFilter('all');
                        setSelectedPeriodFilter('all');
                      }}
                      className="text-[#E94F2F] hover:underline"
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>

                {/* Orders List / Cards on Mobile or table on Desktop */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                          <th className="py-3.5 px-4">Código</th>
                          <th className="py-3.5 px-4">Estabelecimento</th>
                          <th className="py-3.5 px-4">Cliente / Contato</th>
                          <th className="py-3.5 px-4">Valor Total</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4">Canal</th>
                          <th className="py-3.5 px-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F7F4EF] text-xs font-semibold">
                        {filteredOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                            <td className="py-4 px-4 font-black text-[#201A17]">{o.id}</td>
                            <td className="py-4 px-4 text-xs font-bold text-[#E94F2F]">{o.establishmentName}</td>
                            <td className="py-4 px-4 text-[#201A17]">
                              <div>{o.customerName}</div>
                              <div className="text-[10px] text-[#756B66] font-medium">{o.customerPhone}</div>
                            </td>
                            <td className="py-4 px-4 text-[#2F9E69] font-black">R$ {o.total.toFixed(2).replace('.', ',')}</td>
                            <td className="py-4 px-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                o.status === 'concluido'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : o.status === 'recusado'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {o.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="bg-[#F7F4EF] text-[#756B66] font-bold text-[9px] px-2 py-0.5 rounded">
                                {o.deliveryType === 'entrega' ? 'Delivery' : 'Retirada'}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right">
                              {/* "Ver detalhes" button as requested */}
                              <button
                                onClick={() => setSelectedDetailedOrder(o)}
                                className="px-3 py-1.5 bg-[#201A17] hover:bg-[#E94F2F] text-[#FFBE5C] hover:text-white rounded-lg text-[10px] font-black transition-all"
                              >
                                Ver detalhes
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: ESTABELECIMENTOS -------------------- */}
            {adminTab === 'lojas' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#EADFD8]">
                  <div>
                    <h3 className="font-extrabold text-base text-[#201A17]">Parceiros Credenciados ({establishments.length})</h3>
                    <p className="text-xs text-[#756B66]">Supervisione as taxas, faturamentos e documentação</p>
                  </div>

                  <button
                    onClick={() => setIsNewStoreModalOpen(true)}
                    className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Cadastrar Estabelecimento</span>
                  </button>
                </div>

                {/* Filtro por cidade de atuação */}
                <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex items-center gap-3 text-xs font-semibold shadow-xs">
                  <MapPin className="w-4 h-4 text-[#E94F2F]" />
                  <span className="text-[#756B66] font-black uppercase text-[10px]">Filtrar por Cidade:</span>
                  <select
                    value={lojasCityFilter}
                    onChange={(e) => setLojasCityFilter(e.target.value)}
                    className="p-2 px-3 border border-[#EADFD8] rounded-xl bg-white font-bold text-xs outline-none focus:border-[#E94F2F]/50"
                  >
                    <option value="all">Todas as cidades</option>
                    {cities.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.state}</option>
                    ))}
                  </select>
                </div>

                {/* Establishments Grid / Table */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                          <th className="py-3.5 px-4">Loja / Categoria</th>
                          <th className="py-3.5 px-4">Cidade</th>
                          <th className="py-3.5 px-4">Responsável / Doc</th>
                          <th className="py-3.5 px-4">Faturamento (Demo)</th>
                          <th className="py-3.5 px-4">Plataforma Taxa</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F7F4EF] text-xs font-semibold">
                        {merchantRevenueLog.map((est) => (
                          <tr key={est.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                            <td className="py-4 px-4 flex items-center gap-3">
                              <img src={est.image} alt={est.name} className="w-10 h-10 rounded-lg object-cover" />
                              <div>
                                <h4 className="font-bold text-[#201A17]">{est.name}</h4>
                                <p className="text-[10px] text-[#756B66] font-medium">{est.category}</p>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-[#201A17] font-bold">
                              {est.cityName || est.city || 'São João Batista do Glória'} - {est.state || 'MG'}
                            </td>
                            <td className="py-4 px-4 text-[#756B66]">
                              <div>{est.owner}</div>
                              <div className="text-[10px] text-[#756B66] font-medium">{est.document}</div>
                            </td>
                            <td className="py-4 px-4 text-[#2F9E69] font-bold">
                              R$ {est.revenue.toFixed(2).replace('.', ',')}
                              <span className="text-[9px] text-[#756B66] block font-medium">{est.orderCount} pedidos</span>
                            </td>
                            <td className="py-4 px-4 text-[#201A17] font-bold">{est.platformFeePercent}%</td>
                            <td className="py-4 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                est.isOpen
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {est.isOpen ? 'Ativo' : 'Pausado'}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <button
                                onClick={() => toggleMerchantOpenState(est.id)}
                                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                                  est.isOpen
                                    ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                {est.isOpen ? 'Pausar' : 'Aprovar / Ativar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: CIDADES ATENDIDAS -------------------- */}
            {adminTab === 'cidades' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-sm space-y-2">
                  <h3 className="font-extrabold text-base text-[#201A17] flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#E94F2F]" />
                    Cidades Atendidas
                  </h3>
                  <p className="text-xs text-[#756B66]">Cidades reais de atuação da plataforma UaiPertim em Minas Gerais.</p>
                </div>

                <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-semibold">
                      <thead>
                        <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                          <th className="py-3.5 px-4">Cidade / Estado</th>
                          <th className="py-3.5 px-4 text-center">Estabelecimentos</th>
                          <th className="py-3.5 px-4 text-center">Ativos</th>
                          <th className="py-3.5 px-4 text-center">Pedidos Hoje</th>
                          <th className="py-3.5 px-4">Volume Comercial (Demo)</th>
                          <th className="py-3.5 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F7F4EF] text-[#201A17]">
                        {citiesData.map((c) => (
                          <tr key={c.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                            <td className="py-4 px-4 font-bold">
                              <div>{c.name}</div>
                              <span className="text-[10px] text-[#756B66] uppercase">{c.state}</span>
                            </td>
                            <td className="py-4 px-4 text-center font-bold">{c.storesCount}</td>
                            <td className="py-4 px-4 text-center text-emerald-600 font-extrabold">{c.activeStoresCount}</td>
                            <td className="py-4 px-4 text-center font-bold">{c.ordersTodayCount}</td>
                            <td className="py-4 px-4 text-[#2F9E69] font-black">
                              R$ {c.volumeMovimentado.toFixed(2).replace('.', ',')}
                            </td>
                            <td className="py-4 px-4">
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: SUPORTE ATENDIMENTO (Central de suporte) -------------------- */}
            {adminTab === 'suporte' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#EADFD8]">
                  <h3 className="font-extrabold text-base text-[#201A17]">Central de suporte</h3>
                  <span className="bg-[#E94F2F] text-white text-xs font-black px-3 py-1 rounded-full">
                    Fila: {tickets.filter(t => t.status === 'aberto').length} abertos
                  </span>
                </div>

                <div className="space-y-4">
                  {tickets.map((t) => (
                    <div key={t.id} className="bg-white rounded-3xl border border-[#EADFD8] p-5 shadow-xs space-y-3">
                      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[#F7F4EF]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#E94F2F]">{t.id}</span>
                            <h4 className="font-extrabold text-sm text-[#201A17]">{t.subject}</h4>
                          </div>
                          <p className="text-[10px] text-[#756B66] font-medium mt-0.5">
                            De: <strong>{t.sender}</strong> ({t.type === 'cliente' ? 'Consumidor' : 'Parceiro'})
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                            t.priority === 'alta'
                              ? 'bg-rose-100 text-rose-800'
                              : t.priority === 'media'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {t.priority}
                          </span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                            t.status === 'aberto' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-[#201A17] font-semibold leading-relaxed bg-[#F7F4EF] p-3 rounded-xl">
                        “ {t.description} ”
                      </p>

                      {/* Reply threads */}
                      {t.replies.length > 0 && (
                        <div className="space-y-2.5 pl-4 border-l-2 border-[#E94F2F]/30 pt-1">
                          {t.replies.map((rep, rIdx) => (
                            <div key={rIdx} className="text-[11px] font-semibold leading-normal text-gray-700">
                              <p className="text-[10px] text-[#756B66] font-black">{rep.sender} diz:</p>
                              <p className="mt-0.5 italic">“{rep.message}”</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action response */}
                      {t.status === 'aberto' && (
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => setSelectedTicket(t)}
                            className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-4 py-2 rounded-xl text-xs font-bold"
                          >
                            Responder Chamado
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: FEEDBACKS (Avaliações e feedbacks) -------------------- */}
            {adminTab === 'feedbacks' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#EADFD8]">
                  <h3 className="font-extrabold text-base text-[#201A17]">Avaliações e feedbacks</h3>
                  <span className="bg-[#2F9E69]/10 text-[#2F9E69] text-xs font-black px-3 py-1 rounded-full">
                    Ativas: {feedbacks.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {feedbacks.map((f) => (
                    <div key={f.id} className="bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-sm text-[#201A17]">{f.customerName}</h4>
                          <p className="text-[10px] text-[#756B66] font-semibold mt-0.5">Para: {f.establishmentName}</p>
                        </div>

                        {/* Stars */}
                        <div className="flex gap-0.5 text-[#FFBE5C]">
                          {Array.from({ length: 5 }).map((_, sIdx) => (
                            <Star 
                              key={sIdx} 
                              className={`w-3.5 h-3.5 ${sIdx < f.rating ? 'fill-current' : 'text-gray-200'}`} 
                            />
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-[#201A17] font-semibold leading-relaxed">
                        “ {f.comment} ”
                      </p>

                      <div className="flex justify-between items-center pt-2.5 border-t border-[#F7F4EF] text-[10px] text-[#756B66] font-bold">
                        <span>Data: {formatOrderDate(f.date)}</span>
                        <span className="text-emerald-600">● APROVADA</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* -------------------- TAB: CATALOGO MIGRACAO -------------------- */}
            {adminTab === ('migracao' as any) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <CatalogMigrationPage />
              </motion.div>
            )}

          </div>
        </div>
      </div>

      {/* -------------------- DETAILED ORDER MODAL (4. PAINEL ADMINISTRATIVO) -------------------- */}
      <AnimatePresence>
        {selectedDetailedOrder && activeDetailedOrder && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="admin-detailed-order-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-[#EADFD8] flex flex-col max-h-[92vh]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <div>
                  <h3 className="font-black text-[#201A17] text-lg flex items-center gap-2">
                    <span>Pedido {activeDetailedOrder.id}</span>
                    <span className="bg-[#201A17] text-[#FFBE5C] text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      {activeDetailedOrder.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                    </span>
                  </h3>
                  <p className="text-[10px] text-[#756B66] font-semibold">Realizado em {formatOrderDateTime(activeDetailedOrder.createdAt)}</p>
                </div>
                <button onClick={() => setSelectedDetailedOrder(null)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#201A17]">
                
                {/* 2-Column top section: Client & Est */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#F7F4EF]/70 p-4 rounded-2xl border border-[#EADFD8]/50 space-y-2">
                    <p className="text-[10px] font-black text-[#756B66] uppercase">Dados do Cliente</p>
                    <p className="font-bold text-[#201A17] text-sm">{activeDetailedOrder.customerName}</p>
                    <p className="font-semibold text-gray-700">Tel: {activeDetailedOrder.customerPhone}</p>
                    <p className="font-semibold text-gray-700 leading-relaxed">
                      Endereço: {activeDetailedOrder.customerAddress?.street || 'Sem endereço'}, {activeDetailedOrder.customerAddress?.number || ''} - {activeDetailedOrder.customerAddress?.bairro || ''}
                      {activeDetailedOrder.customerAddress?.complement && ` (${activeDetailedOrder.customerAddress.complement})`}
                    </p>
                  </div>

                  <div className="bg-[#F7F4EF]/70 p-4 rounded-2xl border border-[#EADFD8]/50 space-y-2">
                    <p className="text-[10px] font-black text-[#756B66] uppercase">Estabelecimento</p>
                    <p className="font-bold text-[#E94F2F] text-sm">{activeDetailedOrder.establishmentName}</p>
                    <p className="font-semibold text-[#756B66]">ID: {activeDetailedOrder.establishmentId}</p>
                    <p className="font-semibold text-gray-700">Forma de pagamento: <span className="uppercase font-bold">
                      {getPaymentMethodLabel(activeDetailedOrder.paymentMethod, activeDetailedOrder.deliveryType)}
                    </span></p>
                  </div>
                </div>

                {/* Items & Financial */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Produtos do Pedido</p>
                  <div className="bg-neutral-50 p-4 rounded-2xl border border-[#EADFD8]/40 divide-y divide-[#EADFD8]/40 space-y-2">
                    {activeDetailedOrder.items.map((rawItem, idx) => {
                      const item = normalizeOrderItem(rawItem);
                      return (
                        <div key={idx} className="flex justify-between py-1.5 font-semibold text-xs">
                          <div>
                            <p className="font-bold text-gray-800">{item.quantity}x {item.productName}</p>
                            <div className="pl-4 text-[10px] text-[#756B66] space-y-0.5 mt-0.5">
                              {item.selectedSize && <p>Tamanho: {item.selectedSize.name}</p>}
                              {item.selectedCrust && item.selectedCrust.name !== 'Sem borda' && <p>Borda: {item.selectedCrust.name}</p>}
                              {item.selectedExtras.length > 0 && (
                                <p>Adicionais: {item.selectedExtras.map(e => `${e.name} (${e.quantity}x)`).join(', ')}</p>
                              )}
                              {item.notes && <p className="italic text-amber-700">Obs: "{item.notes}"</p>}
                            </div>
                          </div>
                          <span className="font-bold text-gray-800">R$ {item.lineTotal.toFixed(2).replace('.', ',')}</span>
                        </div>
                      );
                    })}
                    
                    {/* Sum of prices */}
                    <div className="pt-2 text-right space-y-1 font-semibold text-[#756B66]">
                      <p>Subtotal: R$ {activeDetailedOrder.subtotal.toFixed(2).replace('.', ',')}</p>
                      <p>Taxa de Entrega: R$ {activeDetailedOrder.deliveryFee.toFixed(2).replace('.', ',')}</p>
                      {activeDetailedOrder.discount > 0 && <p className="text-rose-600">Desconto: -R$ {activeDetailedOrder.discount.toFixed(2).replace('.', ',')}</p>}
                      <p className="text-base font-black text-[#2F9E69] pt-1">Total Geral: R$ {activeDetailedOrder.total.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                </div>

                {/* ADMIN STATUS TRANSITIONS CONTROLS */}
                {activeDetailedOrder.status !== 'concluido' && activeDetailedOrder.status !== 'recusado' && (
                  <div className="bg-white rounded-3xl border border-[#EADFD8] p-5 shadow-sm space-y-4">
                    <h4 className="font-extrabold text-[#201A17] text-sm flex items-center gap-2">
                      <span>Gerenciar Status do Pedido</span>
                    </h4>
                    
                    {/* Admin observation input */}
                    <div className="flex flex-col gap-1 w-full">
                      <label className="text-[10px] font-black text-[#8A7F79] uppercase">Observação de Alteração (Opcional):</label>
                      <input
                        type="text"
                        placeholder="Ex: Cancelado pelo cliente, atraso no motoboy..."
                        id="admin-order-note-input"
                        className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {activeDetailedOrder.status === 'aguardando_confirmacao' && (
                        <>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'confirmado', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-[#2F9E69] hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Confirmar Pedido
                          </button>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'recusado', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Recusar / Cancelar
                          </button>
                        </>
                      )}

                      {activeDetailedOrder.status === 'confirmado' && (
                        <>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'em_preparacao', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Iniciar Preparação
                          </button>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'recusado', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Cancelar Pedido
                          </button>
                        </>
                      )}

                      {activeDetailedOrder.status === 'em_preparacao' && (
                        <>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              const nextStatus = activeDetailedOrder.deliveryType === 'entrega' ? 'pronto' : 'pronto_retirada';
                              await updateOrderStatus(activeDetailedOrder.id, nextStatus, undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-[#2F9E69] hover:bg-[#208453] text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Marcar como Pronto
                          </button>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'recusado', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Cancelar Pedido
                          </button>
                        </>
                      )}

                      {(activeDetailedOrder.status === 'pronto' || activeDetailedOrder.status === 'pronto_retirada') && (
                        <>
                          {activeDetailedOrder.deliveryType === 'entrega' ? (
                            <button
                              onClick={async () => {
                                const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                                const note = noteInput?.value || null;
                                await updateOrderStatus(activeDetailedOrder.id, 'saiu_entrega', undefined, undefined, note);
                                if (noteInput) noteInput.value = '';
                              }}
                              className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                            >
                              Saiu para Entrega
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                                const note = noteInput?.value || null;
                                await updateOrderStatus(activeDetailedOrder.id, 'concluido', undefined, undefined, note);
                                if (noteInput) noteInput.value = '';
                              }}
                              className="bg-[#2F9E69] hover:bg-[#208453] text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                            >
                              Concluir (Retirado)
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'recusado', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Cancelar Pedido
                          </button>
                        </>
                      )}

                      {activeDetailedOrder.status === 'saiu_entrega' && (
                        <>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'concluido', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-[#2F9E69] hover:bg-[#208453] text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Concluir Pedido
                          </button>
                          <button
                            onClick={async () => {
                              const noteInput = document.getElementById('admin-order-note-input') as HTMLInputElement;
                              const note = noteInput?.value || null;
                              await updateOrderStatus(activeDetailedOrder.id, 'recusado', undefined, undefined, note);
                              if (noteInput) noteInput.value = '';
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition-all"
                          >
                            Cancelar Pedido
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* CONTROLE FINANCEIRO DO PAGAMENTO */}
                <div className="bg-white rounded-3xl border border-[#EADFD8] p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-extrabold text-[#201A17] text-sm flex items-center gap-2">
                      <span>Controle de Pagamento Direto</span>
                    </h4>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      activeDetailedOrder.paymentStatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : activeDetailedOrder.paymentStatus === 'not_paid'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {activeDetailedOrder.paymentStatus === 'paid' ? 'Pago ao Estabelecimento' : activeDetailedOrder.paymentStatus === 'not_paid' ? 'Pagamento Falhou' : 'Pendente de Recebimento'}
                    </span>
                  </div>

                  <p className="text-xs text-[#756B66] leading-relaxed">
                    A UaiPertim não retém ou processa pagamentos. O pagamento deste pedido é efetuado <strong>diretamente ao estabelecimento</strong> na modalidade de {activeDetailedOrder.deliveryType === 'entrega' ? 'entrega delivery' : 'retirada física'}.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button
                      onClick={() => updateOrderPaymentStatus(activeDetailedOrder.id, 'paid')}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                        activeDetailedOrder.paymentStatus === 'paid'
                          ? 'bg-emerald-600 text-white border-transparent shadow-xs'
                          : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>Marcar pagamento como recebido</span>
                    </button>

                    <button
                      onClick={() => updateOrderPaymentStatus(activeDetailedOrder.id, 'not_paid')}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                        activeDetailedOrder.paymentStatus === 'not_paid'
                          ? 'bg-rose-600 text-white border-transparent shadow-xs'
                          : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <X className="w-4 h-4" />
                      <span>Pagamento não realizado</span>
                    </button>
                  </div>
                </div>

                {/* Timeline History requested in 4. PAINEL ADMINISTRATIVO */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Histórico de Alterações &amp; Status</p>
                  <div className="bg-white p-5 border border-[#EADFD8] rounded-2xl space-y-4">
                    {activeDetailedOrder.statusHistory && activeDetailedOrder.statusHistory.length > 0 ? (
                      <div className="space-y-3">
                        {activeDetailedOrder.statusHistory.map((historyEntry, idx) => {
                          const date = new Date(historyEntry.timestamp);
                          const formattedTime = isNaN(date.getTime()) 
                            ? "" 
                            : date.toLocaleDateString('pt-BR') + ' às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                          
                          const statusLabels: Record<string, string> = {
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
                    ) : (
                      <div className="relative border-l-2 border-[#EADFD8] ml-2.5 pl-5 space-y-4">
                        {getTimelineHistory(activeDetailedOrder).map((point, pIdx) => (
                          <div key={pIdx} className="relative">
                            <span className={`absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full border-2 ${
                              point.done 
                                ? 'bg-[#2F9E69] border-[#2F9E69]' 
                                : 'bg-white border-[#EADFD8]'
                            }`} />
                            
                            <div className="flex justify-between items-start">
                              <div>
                                <p className={`font-bold ${point.done ? 'text-[#201A17]' : 'text-neutral-400'}`}>{point.label}</p>
                                <p className="text-[9px] text-[#756B66] font-semibold">{point.done ? 'Sincronizado' : 'Aguardando ação correspondente'}</p>
                              </div>
                              <span className="text-[10px] text-[#756B66] font-mono font-bold bg-[#F7F4EF] px-1.5 py-0.5 rounded">
                                {point.time}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="p-4 border-t border-[#EADFD8] bg-[#F7F4EF] flex justify-end">
                <button
                  onClick={() => setSelectedDetailedOrder(null)}
                  className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-5 py-2 rounded-xl font-bold transition-all text-xs"
                >
                  Fechar Detalhes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- REGISTER NEW MERCHANT MODAL -------------------- */}
      <AnimatePresence>
        {isNewStoreModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="new-store-onboard-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17]">Credenciar Novo Estabelecimento</h3>
                <button onClick={() => setIsNewStoreModalOpen(false)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleOnboardMerchantSubmit} className="p-6 overflow-y-auto space-y-4 text-xs font-semibold text-[#201A17]">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Nome Comercial *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Açaí do Bosque"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Categoria Principal *</label>
                    <select
                      value={storeCategory}
                      onChange={(e) => setStoreCategory(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    >
                      <option value="Pizzas">Pizzas</option>
                      <option value="Lanches">Lanches</option>
                      <option value="Japonesa">Japonesa</option>
                      <option value="Brasileira">Brasileira</option>
                      <option value="Açaí e doces">Açaí e doces</option>
                      <option value="Mercados">Mercados</option>
                      <option value="Conveniências">Conveniências</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Razão Social *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Alimentos Gourmet Ltda"
                      value={storeCompanyName}
                      onChange={(e) => setStoreCompanyName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">CNPJ / Documento *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 00.000.000/0001-00"
                      value={storeDocument}
                      onChange={(e) => setStoreDocument(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Nome do Responsável *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Marcos Antunes"
                      value={storeOwner}
                      onChange={(e) => setStoreOwner(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Telefone de Contato *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (19) 98124-5678"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Cidade de atuação *</label>
                    <select
                      value={storeCityId}
                      onChange={(e) => setStoreCityId(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                    >
                      {cities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Estado (Preenchido auto)</label>
                    <input
                      type="text"
                      disabled
                      value="MG"
                      className="w-full p-3 rounded-xl border border-[#EADFD8] bg-gray-50 text-gray-500 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">E-mail Comercial</label>
                    <input
                      type="email"
                      placeholder="parceiro@uaipertim.com"
                      value={storeEmail}
                      onChange={(e) => setStoreEmail(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">CEP</label>
                    <input
                      type="text"
                      placeholder="Ex: 37920-000"
                      value={storeCep}
                      onChange={(e) => setStoreCep(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Endereço *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Rua Central, 45"
                      value={storeAddress}
                      onChange={(e) => setStoreAddress(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Bairro *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Centro"
                      value={storeBairro}
                      onChange={(e) => setStoreBairro(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Atende Retirada no Local?</label>
                    <select
                      value={storeAtendeRetirada ? 'true' : 'false'}
                      onChange={(e) => setStoreAtendeRetirada(e.target.value === 'true')}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                    >
                      <option value="true">Sim, permite retirada</option>
                      <option value="false">Não, apenas delivery</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Realiza Entrega Própria?</label>
                    <select
                      value={storeEntregaPropria ? 'true' : 'false'}
                      onChange={(e) => setStoreEntregaPropria(e.target.value === 'true')}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                    >
                      <option value="true">Sim, entrega própria</option>
                      <option value="false">Não, utiliza logística central</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Bairros ou Regiões Atendidas</label>
                  <input
                    type="text"
                    placeholder="Ex: Centro, Cohab, Bosque (separados por vírgula)"
                    value={storeBairrosAtendidos}
                    onChange={(e) => setStoreBairrosAtendidos(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Taxa de entrega (R$)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      value={storeDeliveryFee}
                      onChange={(e) => setStoreDeliveryFee(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Pedido mínimo (R$)</label>
                    <input
                      type="number"
                      step="1.00"
                      min="0"
                      value={storeMinOrderValue}
                      onChange={(e) => setStoreMinOrderValue(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Plataforma Comissão (%)</label>
                    <input
                      type="number"
                      min="5"
                      max="25"
                      required
                      value={storePlatformFee}
                      onChange={(e) => setStorePlatformFee(parseInt(e.target.value) || 10)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewStoreModalOpen(false)}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#201A17] hover:bg-[#E94F2F] text-[#FFBE5C] hover:text-white py-3 rounded-xl font-bold transition-all"
                  >
                    Aprovar e Ativar Loja
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- RESPOND TO SUPPORT TICKET MODAL -------------------- */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="ticket-response-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-base text-[#201A17]">Responder Chamado {selectedTicket.id}</h3>
                <button onClick={() => setSelectedTicket(null)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSendTicketReply} className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <div className="space-y-1">
                  <p className="text-[10px] text-[#756B66] uppercase">Assunto</p>
                  <p className="font-extrabold text-[#201A17] text-sm">{selectedTicket.subject}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-[#756B66] uppercase">Mensagem do Cliente/Estabelecimento</p>
                  <p className="p-3 bg-[#F7F4EF] rounded-xl italic font-medium leading-relaxed">
                    “{selectedTicket.description}”
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Sua Resposta Oficial *</label>
                  <textarea
                    required
                    placeholder="Digite aqui as orientações de suporte da plataforma..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={4}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 resize-none bg-white font-semibold"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(null)}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold shadow-xs"
                  >
                    Enviar Resposta
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
