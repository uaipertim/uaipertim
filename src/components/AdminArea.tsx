import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { isFirebaseConnected, auth, db } from '../lib/firebase';
import { doc, updateDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { orderService } from '../services/orderService';
import { Establishment, Order, SupportTicket, Feedback, OrderStatus, ESTABLISHMENT_CATEGORIES, CATEGORY_LABELS, PUBLIC_ESTABLISHMENT_CATEGORIES } from '../types';
import { getCategoryLabel } from '../utils/labelUtils';
import { normalizeOrderItem } from '../utils/orderCalculation';
import { getPaymentMethodLabel } from '../utils/paymentLabels';
import { formatOrderDate, formatOrderDateTime } from '../utils/dateUtils';
import { CatalogMigrationPage } from './CatalogMigrationPage';
import { FinanceiroAdmin } from './FinanceiroAdmin';
import { adminService } from '../services/adminService';
import { normalizeEstablishmentFromFirestore } from '../services/productNormalizer';
import { MoreVertical, Edit, User, Trash2, Archive, ShieldAlert, RotateCcw } from 'lucide-react';
import { 
  Building2, ShoppingCart, MessageSquare, Star, Shield, Plus, X, 
  Check, Phone, Mail, Award, DollarSign, Activity, FileText, 
  UserCheck, AlertTriangle, Eye, EyeOff, ArrowUpRight, HelpCircle, Search, Filter, Calendar, Clock, ChevronDown, MapPin,
  Database, LogOut, Settings, Gift, RefreshCw, Copy, ExternalLink, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { loyaltyService, LoyaltyConfig, LoyaltyReward, LoyaltyRedemption } from '../services/loyaltyService';
import { EstablishmentImage } from './EstablishmentImage';
import { resolveEstablishmentLogo, resolveEstablishmentCover } from '../utils/imageUtils';

export const AdminArea: React.FC = () => {
  const {
    cities,
    neighborhoods,
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
    connectionStatus,
    catalogDataSource
  } = useApp();

  const { isAuthenticated, currentUser, userProfile, logout } = useAuth();
  const [path, navigate] = useLocation();
  const isDemo = path === '/demo';

  const [adminTab, setAdminTab] = useState<'dashboard' | 'pedidos' | 'lojas' | 'cidades' | 'suporte' | 'feedbacks' | 'fidelidade' | 'financeiro'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Loyalty management state
  const [loyaltySubTab, setLoyaltySubTab] = useState<'config' | 'rewards' | 'redemptions'>('config');
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);
  const [loyaltyRewards, setLoyaltyRewards] = useState<LoyaltyReward[]>([]);
  const [loyaltyRedemptions, setLoyaltyRedemptions] = useState<LoyaltyRedemption[]>([]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLoadingLoyalty, setIsLoadingLoyalty] = useState(false);

  // Reward Create/Edit form states
  const [editingReward, setEditingReward] = useState<LoyaltyReward | null>(null);
  const [isRewardFormOpen, setIsRewardFormOpen] = useState(false);
  const [rewardFormTitle, setRewardFormTitle] = useState('');
  const [rewardFormDesc, setRewardFormDesc] = useState('');
  const [rewardFormCost, setRewardFormCost] = useState(100);
  const [rewardFormType, setRewardFormType] = useState<'percentage_discount' | 'fixed_discount' | 'delivery_benefit'>('percentage_discount');
  const [rewardFormValue, setRewardFormValue] = useState(10);
  const [rewardFormMaxDisc, setRewardFormMaxDisc] = useState<number | undefined>(undefined);
  const [rewardFormMinOrder, setRewardFormMinOrder] = useState<number | undefined>(undefined);
  const [rewardFormAllMerchants, setRewardFormAllMerchants] = useState(true);
  const [rewardFormMerchants, setRewardFormMerchants] = useState<string[]>([]);
  const [rewardFormStock, setRewardFormStock] = useState<number | undefined>(undefined);
  const [rewardFormLimitPerCustomer, setRewardFormLimitPerCustomer] = useState<number | undefined>(undefined);
  const [rewardFormStartsAt, setRewardFormStartsAt] = useState('');
  const [rewardFormExpiresAt, setRewardFormExpiresAt] = useState('');

  const loadLoyaltyData = async () => {
    setIsLoadingLoyalty(true);
    try {
      const config = await loyaltyService.getConfig();
      setLoyaltyConfig(config);
      const rewards = await loyaltyService.getRewards(true); // include inactive
      setLoyaltyRewards(rewards);
      const redemptionsList = await loyaltyService.getRedemptions();
      setLoyaltyRedemptions(redemptionsList);
    } catch (e) {
      console.error("Error loading loyalty data:", e);
    } finally {
      setIsLoadingLoyalty(false);
    }
  };

  useEffect(() => {
    if (adminTab === 'fidelidade') {
      loadLoyaltyData();
    }
  }, [adminTab]);

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
  const [storeCategory, setStoreCategory] = useState('restaurants');
  const [storeCategoryIds, setStoreCategoryIds] = useState<string[]>([]);
  const [storeLegalContactName, setStoreLegalContactName] = useState('');
  const [storeLegalContactPhone, setStoreLegalContactPhone] = useState('');
  const [storeLegalContactEmail, setStoreLegalContactEmail] = useState('');
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
  const [storeLogoUrl, setStoreLogoUrl] = useState('');
  const [storeCoverImageUrl, setStoreCoverImageUrl] = useState('');
  const [storeIsFeaturedPartner, setStoreIsFeaturedPartner] = useState(false);
  const [storeFeaturedOrder, setStoreFeaturedOrder] = useState(0);

  // Establishments filter & search
  const [lojasSearchQuery, setLojasSearchQuery] = useState('');
  const [lojasStatusFilter, setLojasStatusFilter] = useState<'all' | 'active' | 'paused' | 'inactive' | 'archived'>('all');

  // Establishment Action modals / state
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [viewingStore, setViewingStore] = useState<Establishment | null>(null);
  const [editingStore, setEditingStore] = useState<Establishment | null>(null);

  // Admin Edit Store Modal Tab & Delivery Zone States (Phase 2)
  const [editModalTab, setEditModalTab] = useState<'geral' | 'entregas'>('geral');
  const [adminDeliveryZones, setAdminDeliveryZones] = useState<any[]>([]);
  const [adminZonesLoading, setAdminZonesLoading] = useState(false);
  const [adminZoneSearchQuery, setAdminZoneSearchQuery] = useState('');
  const [adminZoneStatusFilter, setAdminZoneStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isAdminZoneModalOpen, setIsAdminZoneModalOpen] = useState(false);
  const [adminEditingZone, setAdminEditingZone] = useState<any | null>(null);

  // Delivery Zone form fields for Admin
  const [adminZoneNeighborhoodId, setAdminZoneNeighborhoodId] = useState('');
  const [adminZoneNeighborhoodName, setAdminZoneNeighborhoodName] = useState('');
  const [adminZoneFee, setAdminZoneFee] = useState<string | number>('');
  const [adminZoneAdditionalMinutes, setAdminZoneAdditionalMinutes] = useState<string | number>('');
  const [adminZoneMinOrder, setAdminZoneMinOrder] = useState<string>('');
  const [adminZoneActive, setAdminZoneActive] = useState(true);
  const [adminZoneIsManualNeighborhood, setAdminZoneIsManualNeighborhood] = useState(false);

  // Default Delivery Settings states
  const [defaultEnabled, setDefaultEnabled] = useState(true);
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState<string | number>('');
  const [defaultMinOrder, setDefaultMinOrder] = useState<string | number>('');
  const [defaultAdditionalMinutes, setDefaultAdditionalMinutes] = useState<string | number>('');
  const [defaultCityId, setDefaultCityId] = useState('sao-joao-batista-do-gloria-mg');
  const [defaultCityName, setDefaultCityName] = useState('São João Batista do Glória');
  const [defaultCoverageMode, setDefaultCoverageMode] = useState<'entire_city' | 'listed_zones_only'>('entire_city');
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  // Fetch Delivery Zones for Admin editingStore
  const fetchAdminZones = async (storeId: string) => {
    setAdminZonesLoading(true);
    try {
      if (isFirebaseConnected && db) {
        const zonesColRef = collection(db, 'establishments', storeId, 'deliveryZones');
        const snapshot = await getDocs(zonesColRef);
        const zonesList: any[] = [];
        snapshot.forEach((doc) => {
          zonesList.push({ id: doc.id, ...doc.data() });
        });
        setAdminDeliveryZones(zonesList);
      } else {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`/api/admin/establishments/${storeId}/delivery-zones`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setAdminDeliveryZones(data);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAdminZonesLoading(false);
    }
  };

  useEffect(() => {
    if (editingStore) {
      const settings = editingStore.deliverySettings || {
        enabled: editingStore.entregaPropria !== false,
        defaultDeliveryFee: editingStore.deliveryFee ?? 0,
        defaultMinimumOrderValue: editingStore.minOrderValue ?? editingStore.minimumOrderValue ?? 0,
        defaultAdditionalMinutes: 0,
        cityId: editingStore.cityId || 'sao-joao-batista-do-gloria-mg',
        cityName: editingStore.cityName || editingStore.city || 'São João Batista do Glória',
        coverageMode: 'entire_city'
      };
      
      setDefaultEnabled(settings.enabled);
      setDefaultDeliveryFee(settings.defaultDeliveryFee);
      setDefaultMinOrder(settings.defaultMinimumOrderValue);
      setDefaultAdditionalMinutes(settings.defaultAdditionalMinutes);
      setDefaultCityId(settings.cityId);
      setDefaultCityName(settings.cityName);
      setDefaultCoverageMode(settings.coverageMode || 'entire_city');
    }
  }, [editingStore]);

  const handleSaveDefaultSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;
    setIsSavingDefaults(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      
      const parseBrazilianNumber = (value: any): number => {
        if (value === undefined || value === null) return 0;
        if (typeof value === 'number') return isFinite(value) ? value : 0;
        const str = String(value).trim().replace(/\s/g, '');
        if (str === '') return 0;
        const normalized = str.replace(',', '.');
        const parsed = parseFloat(normalized);
        return isFinite(parsed) ? parsed : 0;
      };

      const parsedFee = parseBrazilianNumber(defaultDeliveryFee);
      const parsedMinOrder = parseBrazilianNumber(defaultMinOrder);
      const parsedAddMinutes = parseBrazilianNumber(defaultAdditionalMinutes);

      const establishmentIdMascarado = editingStore.id ? (editingStore.id.substring(0, 6) + '...') : 'undefined';
      const hasAuthToken = !!token;
      
      console.log("TEMPORARY_FRONTEND_DIAGNOSTIC:", {
        endpoint: `/api/admin/establishments/${editingStore.id}/delivery-settings`,
        method: 'POST',
        establishmentIdMascarado,
        hasAuthToken,
        payloadKeys: ['enabled', 'defaultDeliveryFee', 'defaultMinimumOrderValue', 'defaultAdditionalMinutes', 'cityId', 'cityName'],
        deliveryEnabled: defaultEnabled,
        defaultDeliveryFee: parsedFee,
        defaultMinimumOrder: parsedMinOrder,
        defaultAdditionalMinutes: parsedAddMinutes
      });

      if (isFirebaseConnected && db) {
        // Direct Client-Side Firestore Update
        const docRef = doc(db, 'establishments', editingStore.id);
        const deliverySettings = {
          enabled: defaultEnabled,
          defaultDeliveryFee: parsedFee,
          defaultMinimumOrderValue: parsedMinOrder,
          defaultAdditionalMinutes: parsedAddMinutes,
          cityId: defaultCityId,
          cityName: defaultCityName,
          coverageMode: defaultCoverageMode,
          updatedAt: new Date(),
          updatedBy: auth.currentUser?.uid || 'unknown'
        };
        
        await updateDoc(docRef, {
          deliverySettings,
          entregaPropria: defaultEnabled,
          deliveryFee: parsedFee,
          minOrderValue: parsedMinOrder,
          minimumOrderValue: parsedMinOrder,
          cityId: defaultCityId,
          cityName: defaultCityName,
          updatedAt: new Date()
        });
        
        showToast('Configuração padrão salva com sucesso!', 'success');
        setEditingStore({
          ...editingStore,
          deliverySettings,
          entregaPropria: defaultEnabled,
          deliveryFee: parsedFee,
          minOrderValue: parsedMinOrder,
          minimumOrderValue: parsedMinOrder,
          cityId: defaultCityId,
          cityName: defaultCityName
        });
        setIsSavingDefaults(false);
        return;
      }

      const response = await fetch(`/api/admin/establishments/${editingStore.id}/delivery-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: defaultEnabled,
          defaultDeliveryFee: parsedFee,
          defaultMinimumOrderValue: parsedMinOrder,
          defaultAdditionalMinutes: parsedAddMinutes,
          cityId: defaultCityId,
          cityName: defaultCityName,
          coverageMode: defaultCoverageMode
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("TEMPORARY_FRONTEND_RESPONSE_DIAGNOSTIC (SUCCESS):", {
          status: response.status,
          success: result.success,
          data: result.data
        });
        showToast('Configuração padrão salva com sucesso!', 'success');
        setEditingStore({
          ...editingStore,
          deliverySettings: result.deliverySettings,
          entregaPropria: result.data.deliveryEnabled,
          deliveryFee: result.data.defaultDeliveryFee,
          minOrderValue: result.data.defaultMinimumOrderValue,
          minimumOrderValue: result.data.defaultMinimumOrderValue,
          cityId: result.data.cityId,
          cityName: result.data.cityName
        });
      } else {
        const err = await response.json().catch(() => ({}));
        const errorCode = err.code || err.error?.code || 'UNKNOWN';
        const errorMessage = err.message || err.error?.message || err.error || 'Erro ao salvar configuração padrão.';
        console.error("TEMPORARY_FRONTEND_RESPONSE_DIAGNOSTIC (ERROR):", {
          status: response.status,
          errorCode,
          errorMessage,
          responseBody: err
        });
        showToast(`Erro [${errorCode}]: ${errorMessage}`, 'error');
      }
    } catch (err: any) {
      console.error("TEMPORARY_FRONTEND_RESPONSE_DIAGNOSTIC (NETWORK_EXCEPTION):", err);
      showToast(`Erro de rede ao salvar configuração padrão: ${err.message || err}`, 'error');
    } finally {
      setIsSavingDefaults(false);
    }
  };

  useEffect(() => {
    if (editingStore && editModalTab === 'entregas') {
      fetchAdminZones(editingStore.id);
    }
  }, [editingStore, editModalTab]);

  // Toggle delivery zone active status for Admin
  const handleToggleAdminZoneStatus = async (zone: any) => {
    if (!editingStore) return;
    try {
      const newStatus = !zone.active;
      
      if (isFirebaseConnected && db) {
        const zoneDocRef = doc(db, 'establishments', editingStore.id, 'deliveryZones', zone.neighborhoodId);
        await updateDoc(zoneDocRef, {
          active: newStatus,
          updatedAt: new Date()
        });
        showToast(`Status de ${zone.neighborhoodName} atualizado com sucesso!`, 'success');
        fetchAdminZones(editingStore.id);
        return;
      }

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`/api/admin/establishments/${editingStore.id}/delivery-zones/${zone.neighborhoodId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: newStatus })
      });
      if (response.ok) {
        showToast(`Status de ${zone.neighborhoodName} atualizado com sucesso!`, 'success');
        fetchAdminZones(editingStore.id);
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.error || 'Erro ao alterar status.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro de rede ao alterar status.', 'error');
    }
  };

  // Submit delivery zone for Admin (Create / Edit)
  const handleSaveAdminZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;
    if (!adminZoneNeighborhoodName) {
      showToast('Por favor, informe o nome do bairro.', 'error');
      return;
    }
    
    try {
      const storeCityId = editingStore.cityId || 'sao-joao-batista-do-gloria-mg';
      const parsedFee = adminZoneFee !== '' ? Number(adminZoneFee) : null;
      const parsedMinOrder = adminZoneMinOrder.trim() !== '' ? Number(adminZoneMinOrder) : null;
      const parsedAddMinutes = adminZoneAdditionalMinutes !== '' ? Number(adminZoneAdditionalMinutes) : null;

      if (isFirebaseConnected && db) {
        const normalizeName = (name: string): string => {
          return name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
        };

        const normalizedName = normalizeName(adminZoneNeighborhoodName);
        let neighborhoodId = adminZoneNeighborhoodId;
        if (!neighborhoodId) {
          neighborhoodId = `manual-${normalizedName}`;
        }

        const zonesColRef = collection(db, 'establishments', editingStore.id, 'deliveryZones');
        const zoneDocRef = doc(zonesColRef, neighborhoodId);

        const zoneData = {
          establishmentId: editingStore.id,
          cityId: storeCityId,
          neighborhoodId: neighborhoodId,
          neighborhoodName: adminZoneNeighborhoodName,
          normalizedNeighborhoodName: normalizedName,
          deliveryFee: parsedFee,
          minimumOrderValue: parsedMinOrder,
          additionalEstimatedMinutes: parsedAddMinutes,
          active: adminZoneActive,
          updatedAt: new Date(),
          updatedBy: auth.currentUser?.uid || 'unknown'
        };

        await setDoc(zoneDocRef, zoneData, { merge: true });

        showToast('Regra de entrega salva com sucesso!', 'success');
        setIsAdminZoneModalOpen(false);
        setAdminEditingZone(null);
        fetchAdminZones(editingStore.id);
        return;
      }

      const token = await auth.currentUser?.getIdToken();
      const body = {
        cityId: storeCityId,
        neighborhoodId: adminZoneNeighborhoodId || null,
        neighborhoodName: adminZoneNeighborhoodName,
        deliveryFee: parsedFee,
        additionalEstimatedMinutes: parsedAddMinutes,
        minimumOrderValue: parsedMinOrder,
        active: adminZoneActive
      };
      
      let url = `/api/admin/establishments/${editingStore.id}/delivery-zones`;
      let method = 'POST';
      
      if (adminEditingZone) {
        url = `/api/admin/establishments/${editingStore.id}/delivery-zones/${adminEditingZone.neighborhoodId}`;
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
        const data = await response.json();
        if (data.success === false && data.error) {
          showToast(data.error.message || 'Erro ao salvar regra.', 'error');
        } else {
          showToast('Regra de entrega salva com sucesso!', 'success');
          setIsAdminZoneModalOpen(false);
          setAdminEditingZone(null);
          fetchAdminZones(editingStore.id);
        }
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.error?.message || err.error || 'Erro ao salvar regra.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de rede ao salvar regra.', 'error');
    }
  };

  const handleOpenEditAdminZoneModal = (zone: any) => {
    setAdminEditingZone(zone);
    setAdminZoneNeighborhoodId(zone.neighborhoodId);
    setAdminZoneNeighborhoodName(zone.neighborhoodName);
    setAdminZoneFee(zone.deliveryFee !== null && zone.deliveryFee !== undefined ? zone.deliveryFee : '');
    setAdminZoneAdditionalMinutes(zone.additionalEstimatedMinutes !== null && zone.additionalEstimatedMinutes !== undefined ? zone.additionalEstimatedMinutes : '');
    setAdminZoneMinOrder(zone.minimumOrderValue !== null && zone.minimumOrderValue !== undefined ? String(zone.minimumOrderValue) : '');
    setAdminZoneActive(zone.active);
    setAdminZoneIsManualNeighborhood(zone.neighborhoodId.startsWith('manual-'));
    setIsAdminZoneModalOpen(true);
  };

  const handleOpenCreateAdminZoneModal = () => {
    setAdminEditingZone(null);
    setAdminZoneNeighborhoodId('');
    setAdminZoneNeighborhoodName('');
    setAdminZoneFee('');
    setAdminZoneAdditionalMinutes('');
    setAdminZoneMinOrder('');
    setAdminZoneActive(true);
    setAdminZoneIsManualNeighborhood(false);
    setIsAdminZoneModalOpen(true);
  };
  const [linkingUserStore, setLinkingUserStore] = useState<Establishment | null>(null);
  const [selectedMerchantUid, setSelectedMerchantUid] = useState('');
  const [merchantsList, setMerchantsList] = useState<any[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(false);
  const [isSubmittingStore, setIsSubmittingStore] = useState(false);

  // Link Owner Modal states
  const [ownerModalTab, setOwnerModalTab] = useState<'create' | 'link_existing'>('create');
  
  // Link Owner: Create Form
  const [createOwnerName, setCreateOwnerName] = useState('');
  const [createOwnerEmail, setCreateOwnerEmail] = useState('');
  const [createOwnerPhone, setCreateOwnerPhone] = useState('');
  const [createOwnerPassword, setCreateOwnerPassword] = useState('');
  const [createOwnerConfirmPassword, setCreateOwnerConfirmPassword] = useState('');
  const [showCreateOwnerPassword, setShowCreateOwnerPassword] = useState(false);
  const [showCreateOwnerConfirmPassword, setShowCreateOwnerConfirmPassword] = useState(false);
  
  // Link Owner: Existing Search
  const [searchOwnerQuery, setSearchOwnerQuery] = useState('');
  const [searchOwnerResults, setSearchOwnerResults] = useState<any[]>([]);
  const [isSearchingOwners, setIsSearchingOwners] = useState(false);
  const [selectedExistingOwner, setSelectedExistingOwner] = useState<any | null>(null);
  
  // Confirmation and success outputs
  const [ownerConfirmationPrompt, setOwnerConfirmationPrompt] = useState<{
    message: string;
    user: any;
    isReplace: boolean;
  } | null>(null);
  const [ownerSuccessInviteResult, setOwnerSuccessInviteResult] = useState<{
    email: string;
    uid: string;
    passwordResetLink: string;
    name: string;
  } | null>(null);

  // Edit Establishment Form states
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreCategory, setEditStoreCategory] = useState('restaurants');
  const [editStoreCategoryIds, setEditStoreCategoryIds] = useState<string[]>([]);
  const [editStoreCompanyName, setEditStoreCompanyName] = useState('');
  const [editStoreDocument, setEditStoreDocument] = useState('');
  const [editStoreLegalContactName, setEditStoreLegalContactName] = useState('');
  const [editStoreLegalContactPhone, setEditStoreLegalContactPhone] = useState('');
  const [editStoreLegalContactEmail, setEditStoreLegalContactEmail] = useState('');
  const [editStoreAddress, setEditStoreAddress] = useState('');
  const [editStoreBairro, setEditStoreBairro] = useState('');
  const [editStoreCep, setEditStoreCep] = useState('');
  const [editStoreCityId, setEditStoreCityId] = useState('sao-joao-batista-do-gloria-mg');
  const [editStoreDeliveryFee, setEditStoreDeliveryFee] = useState(6.00);
  const [editStoreMinOrderValue, setEditStoreMinOrderValue] = useState(25.00);
  const [editStoreAtendeRetirada, setEditStoreAtendeRetirada] = useState(true);
  const [editStoreEntregaPropria, setEditStoreEntregaPropria] = useState(true);
  const [editStoreBairrosAtendidos, setEditStoreBairrosAtendidos] = useState('');
  const [formData, setFormData] = useState<{ logoUrl: string | null }>({ logoUrl: '' });
  const [editStoreCoverImageUrl, setEditStoreCoverImageUrl] = useState('');
  const [editStoreIsFeaturedPartner, setEditStoreIsFeaturedPartner] = useState(false);
  const [editStoreFeaturedOrder, setEditStoreFeaturedOrder] = useState(0);

  // State for administrative status change (deactivation/archiving confirmation)
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<{
    id: string;
    name: string;
    status: 'inactive' | 'archived';
  } | null>(null);
  const [statusChangeReason, setStatusChangeReason] = useState('');

  // Load merchants list on mount
  useEffect(() => {
    const fetchMerchants = async () => {
      try {
        setIsLoadingMerchants(true);
        const list = await adminService.getMerchants();
        setMerchantsList(list);
      } catch (err) {
        console.error("Error loading merchants:", err);
      } finally {
        setIsLoadingMerchants(false);
      }
    };
    if (adminTab === 'lojas' && !isDemo && catalogDataSource === 'firestore') {
      fetchMerchants();
    }
  }, [adminTab, isDemo, catalogDataSource]);

  // Sync editing store values
  useEffect(() => {
    if (editingStore) {
      setEditStoreName(editingStore.name || '');
      setEditStoreCategory(editingStore.category || 'Pizzas');
      setEditStoreCompanyName(editingStore.companyName || '');
      setEditStoreDocument(editingStore.document || '');
      setEditStoreLegalContactName(editingStore.legalContactName || editingStore.owner || '');
      setEditStoreLegalContactPhone(editingStore.legalContactPhone || editingStore.phone || '');
      setEditStoreLegalContactEmail(editingStore.legalContactEmail || editingStore.email || '');
      
      const addrStr = typeof editingStore.address === 'object' && editingStore.address 
        ? (editingStore.address as any).street || '' 
        : (editingStore.address || '');
      setEditStoreAddress(addrStr);
      
      const bStr = typeof editingStore.address === 'object' && editingStore.address
        ? (editingStore.address as any).neighborhood || editingStore.bairro || ''
        : editingStore.bairro || '';
      setEditStoreBairro(bStr);

      const cStr = typeof editingStore.address === 'object' && editingStore.address
        ? (editingStore.address as any).zipCode || editingStore.cep || ''
        : editingStore.cep || '';
      setEditStoreCep(cStr);

      setEditStoreCityId(editingStore.cityId || 'sao-joao-batista-do-gloria-mg');
      setEditStoreDeliveryFee(editingStore.deliveryFee || 0);
      setEditStoreMinOrderValue(editingStore.minOrderValue || 0);
      setEditStoreAtendeRetirada(editingStore.atendeRetirada !== false);
      setEditStoreEntregaPropria(editingStore.entregaPropria !== false);
      setEditStoreBairrosAtendidos(editingStore.bairrosAtendidos || '');
      setFormData({ logoUrl: editingStore.logoUrl || '' });
      setEditStoreCoverImageUrl(editingStore.coverImageUrl || '');
      setEditStoreIsFeaturedPartner(editingStore.isFeaturedPartner === true || editingStore.featured === true);
      setEditStoreFeaturedOrder(editingStore.featuredOrder || 0);
      setEditStoreCategoryIds(editingStore.categoryIds || []);
    }
  }, [editingStore]);

  const filteredAdminDeliveryZones = useMemo(() => {
    return adminDeliveryZones.filter(zone => {
      const matchesSearch = zone.neighborhoodName.toLowerCase().includes(adminZoneSearchQuery.toLowerCase());
      const matchesStatus = 
        adminZoneStatusFilter === 'all' ? true :
        adminZoneStatusFilter === 'active' ? zone.active === true :
        zone.active === false;
      return matchesSearch && matchesStatus;
    });
  }, [adminDeliveryZones, adminZoneSearchQuery, adminZoneStatusFilter]);

  // Helper to determine active status of an establishment
  const getEstablishmentStatus = (est: Establishment) => {
    if (est.platformStatus) return est.platformStatus;
    if ((est as any).archived === true) return 'archived';
    if (est.active === false || (est as any).suspended) return 'inactive';
    return 'active';
  };

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

  // Calculate counts for each status to display in buttons/tabs
  const establishmentStatusCounts = useMemo(() => {
    let active = 0;
    let paused = 0;
    let inactive = 0;
    let archived = 0;
    establishments.forEach(e => {
      const status = getEstablishmentStatus(e);
      if (status === 'active') {
        if (e.operationalPause || (e as any).temporarilyPaused) {
          paused++;
        } else {
          active++;
        }
      } else if (status === 'inactive') {
        inactive++;
      } else if (status === 'archived') {
        archived++;
      }
    });
    return { all: establishments.length, active, paused, inactive, archived };
  }, [establishments]);

  // Compute real & demo revenues for merchants in the table with search & lifecycle filters
  const merchantRevenueLog = useMemo(() => {
    let filteredEsts = establishments;

    // Filter by city
    if (lojasCityFilter !== 'all') {
      filteredEsts = filteredEsts.filter(e => e.cityId === lojasCityFilter);
    }

    // Filter by lifecycle status
    if (lojasStatusFilter !== 'all') {
      filteredEsts = filteredEsts.filter(e => {
        if (lojasStatusFilter === 'paused') {
          return getEstablishmentStatus(e) === 'active' && (e.operationalPause || (e as any).temporarilyPaused);
        }
        const status = getEstablishmentStatus(e);
        return status === lojasStatusFilter;
      });
    }

    // Search query: name, CNPJ/document, owner
    if (lojasSearchQuery.trim()) {
      const queryStr = lojasSearchQuery.toLowerCase().trim();
      filteredEsts = filteredEsts.filter(e => {
        const nameMatch = (e.name || '').toLowerCase().includes(queryStr);
        const docMatch = (e.document || '').toLowerCase().includes(queryStr);
        const ownerMatch = (e.owner || '').toLowerCase().includes(queryStr);
        const companyMatch = (e.companyName || '').toLowerCase().includes(queryStr);
        return nameMatch || docMatch || ownerMatch || companyMatch;
      });
    }

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
  }, [establishments, orders, lojasCityFilter, lojasStatusFilter, lojasSearchQuery]);

  // Update establishment lifecycle status with validation
  const handleUpdateStoreStatus = async (estId: string, newStatus: 'active' | 'paused' | 'inactive' | 'archived', reason?: string) => {
    try {
      if (isDemo) {
        // Mock update for demo mode
        setEstablishments(prev => prev.map(e => {
          if (e.id === estId) {
            let updateFields: any = {};
            switch (newStatus) {
              case 'active':
                updateFields = { platformStatus: 'active', active: true, suspended: false, archived: false, temporarilyPaused: false, operationalPause: false, isOpen: true, open: true, acceptingOrders: true };
                break;
              case 'paused':
                updateFields = { platformStatus: 'active', active: true, suspended: false, archived: false, temporarilyPaused: true, operationalPause: true, isOpen: false, open: false, acceptingOrders: false };
                break;
              case 'inactive':
                updateFields = { platformStatus: 'inactive', active: false, suspended: true, archived: false, temporarilyPaused: false, operationalPause: false, isOpen: false, open: false, deactivationReason: reason, archiveReason: null, acceptingOrders: false };
                break;
              case 'archived':
                updateFields = { platformStatus: 'archived', active: false, suspended: true, archived: true, temporarilyPaused: false, operationalPause: false, isOpen: false, open: false, archiveReason: reason, deactivationReason: null, acceptingOrders: false };
                break;
            }
            return { ...e, ...updateFields };
          }
          return e;
        }));
        showToast(`Status atualizado para ${newStatus} com sucesso (Modo Demo).`, 'success');
        return;
      }

      await adminService.updateEstablishmentStatus(estId, newStatus, reason);
      
      // Update local establishments state dynamically
      setEstablishments(prev => prev.map(e => {
        if (e.id === estId) {
          let updateFields: any = {};
          switch (newStatus) {
            case 'active':
              updateFields = { platformStatus: 'active', active: true, suspended: false, archived: false, temporarilyPaused: false, operationalPause: false, isOpen: true, open: true, acceptingOrders: true };
              break;
            case 'paused':
              updateFields = { platformStatus: 'active', active: true, suspended: false, archived: false, temporarilyPaused: true, operationalPause: true, isOpen: false, open: false, acceptingOrders: false };
              break;
            case 'inactive':
              updateFields = { platformStatus: 'inactive', active: false, suspended: true, archived: false, temporarilyPaused: false, operationalPause: false, isOpen: false, open: false, deactivationReason: reason, archiveReason: null, acceptingOrders: false };
              break;
            case 'archived':
              updateFields = { platformStatus: 'archived', active: false, suspended: true, archived: true, temporarilyPaused: false, operationalPause: false, isOpen: false, open: false, archiveReason: reason, deactivationReason: null, acceptingOrders: false };
              break;
          }
          return { ...e, ...updateFields };
        }
        return e;
      }));

      showToast(`Status do estabelecimento alterado para ${newStatus} com sucesso!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao atualizar status do estabelecimento.', 'error');
    }
  };

  // Onboard New Merchant (Secure Server API or local fallback)
  const handleOnboardMerchantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName || !storeLegalContactName || !storeLegalContactPhone || !storeCompanyName) {
      showToast('Por favor, preencha todos os campos obrigatórios do formulário.', 'error');
      return;
    }

    const cityObj = cities.find(c => c.id === storeCityId) || cities[0];

    // Compute canonical category IDs strictly from checked/public category checkboxes
    const finalCategoryIds = Array.from(new Set(storeCategoryIds || [])).filter(Boolean);

    if ((import.meta as any).env?.DEV) {
      console.debug("ESTABLISHMENT_CATEGORY_SAVE", {
        establishmentId: "new",
        primaryCategory: storeCategory,
        categoryIds: finalCategoryIds
      });
    }

    const newEstData = {
      name: storeName,
      category: storeCategory,
      categoryName: storeCategory,
      categoryIds: finalCategoryIds,
      deliveryFee: storeDeliveryFee,
      minOrderValue: storeMinOrderValue,
      legalContactName: storeLegalContactName,
      legalContactPhone: storeLegalContactPhone,
      legalContactEmail: storeLegalContactEmail,
      address: {
        street: storeAddress,
        number: '',
        complement: '',
        neighborhood: storeBairro,
        zipCode: storeCep,
        cityName: cityObj.name,
        state: cityObj.state
      },
      cityId: cityObj.id,
      cityName: cityObj.name,
      state: cityObj.state,
      document: storeDocument,
      companyName: storeCompanyName,
      bairro: storeBairro,
      cep: storeCep,
      atendeRetirada: storeAtendeRetirada,
      entregaPropria: storeEntregaPropria,
      bairrosAtendidos: storeBairrosAtendidos,
      logoUrl: storeLogoUrl.trim() || null,
      coverImageUrl: storeCoverImageUrl,
      isFeaturedPartner: storeIsFeaturedPartner,
      featuredOrder: storeFeaturedOrder
    };

    setIsSubmittingStore(true);
    try {
      if (isDemo) {
        const localEst: Establishment = {
          id: `est-${Date.now()}`,
          active: true,
          isOpen: true,
          open: true,
          acceptingOrders: true,
          rating: 5.0,
          ...newEstData,
          category: storeCategory
        } as any;
        setEstablishments(prev => [...prev, localEst]);
        setIsNewStoreModalOpen(false);
        showToast(`Estabelecimento ${storeName} cadastrado com sucesso!`, 'success');
      } else {
        const res = await adminService.createEstablishment(newEstData);
        setIsNewStoreModalOpen(false);
        showToast(`Estabelecimento ${storeName} cadastrado com sucesso no servidor!`, 'success');
        if (res?.establishment) {
          const normalized = normalizeEstablishmentFromFirestore(res.establishment, res.establishment.id);
          setViewingStore(normalized);
        }
      }

      // Reset Form fields
      setStoreName('');
      setStoreCategoryIds([]);
      setStoreLegalContactName('');
      setStoreLegalContactPhone('');
      setStoreLegalContactEmail('');
      setStoreAddress('');
      setStoreDocument('');
      setStoreCompanyName('');
      setStoreCityId('sao-joao-batista-do-gloria-mg');
      setStoreBairro('');
      setStoreCep('');
      setStoreAtendeRetirada(true);
      setStoreEntregaPropria(true);
      setStoreBairrosAtendidos('');
      setStoreDeliveryFee(6.00);
      setStoreMinOrderValue(25.00);
      setStoreLogoUrl('');
      setStoreCoverImageUrl('');
      setStoreIsFeaturedPartner(false);
      setStoreFeaturedOrder(0);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao cadastrar estabelecimento.', 'error');
    } finally {
      setIsSubmittingStore(false);
    }
  };

  // Submit edits for general data
  const handleEditMerchantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;

    if (!editStoreName || !editStoreLegalContactName || !editStoreLegalContactPhone || !editStoreCompanyName) {
      showToast('Por favor, preencha todos os campos obrigatórios do formulário.', 'error');
      return;
    }

    const cityObj = cities.find(c => c.id === editStoreCityId) || cities[0];

    // Compute canonical category IDs strictly from checked/public category checkboxes
    const finalEditCategoryIds = Array.from(new Set(editStoreCategoryIds || [])).filter(Boolean);

    if ((import.meta as any).env?.DEV) {
      console.debug("ESTABLISHMENT_CATEGORY_SAVE", {
        establishmentId: editingStore.id,
        primaryCategory: editStoreCategory,
        categoryIds: finalEditCategoryIds
      });
    }

    const updatedEstData = {
      name: editStoreName,
      category: editStoreCategory,
      categoryName: editStoreCategory,
      categoryIds: finalEditCategoryIds,
      deliveryFee: editStoreDeliveryFee,
      minOrderValue: editStoreMinOrderValue,
      legalContactName: editStoreLegalContactName,
      legalContactPhone: editStoreLegalContactPhone,
      legalContactEmail: editStoreLegalContactEmail,
      address: {
        street: editStoreAddress,
        number: '',
        complement: '',
        neighborhood: editStoreBairro,
        zipCode: editStoreCep,
        cityName: cityObj.name,
        state: cityObj.state
      },
      cityId: cityObj.id,
      cityName: cityObj.name,
      state: cityObj.state,
      document: editStoreDocument,
      companyName: editStoreCompanyName,
      bairro: editStoreBairro,
      cep: editStoreCep,
      atendeRetirada: editStoreAtendeRetirada,
      entregaPropria: editStoreEntregaPropria,
      bairrosAtendidos: editStoreBairrosAtendidos,
      logoUrl: formData.logoUrl ? formData.logoUrl.trim() || null : null,
      coverImageUrl: editStoreCoverImageUrl,
      isFeaturedPartner: editStoreIsFeaturedPartner,
      featured: editStoreIsFeaturedPartner,
      featuredOrder: Number(editStoreFeaturedOrder),
      fulfillment: {
        delivery: editStoreEntregaPropria,
        pickup: editStoreAtendeRetirada
      }
    };

    // Antes da requisição, verificar de forma segura:
    const logoDiagnostic = {
      logoUrlIncluded: Object.prototype.hasOwnProperty.call(updatedEstData, "logoUrl"),
      hasLogoUrl: Boolean(updatedEstData.logoUrl)
    };
    console.log("LOGO_SAVE_DIAGNOSTIC", logoDiagnostic);

    setIsSubmittingStore(true);
    try {
      if (isDemo) {
        setEstablishments(prev => prev.map(e => {
          if (e.id === editingStore.id) {
            return {
              ...e,
              ...updatedEstData,
              id: editingStore.id
            } as any;
          }
          return e;
        }));
        setEditingStore(null);
        showToast(`Estabelecimento ${editStoreName} editado com sucesso!`, 'success');
      } else {
        const result = await adminService.updateEstablishment(editingStore.id, updatedEstData);
        if (result && result.success) {
          const normalizedResult = normalizeEstablishmentFromFirestore(result.data, editingStore.id);
          
          setEstablishments(prev => prev.map(e => e.id === editingStore.id ? normalizedResult : e));
          setEditingStore(null);
          showToast(`Estabelecimento ${editStoreName} editado com sucesso no servidor!`, 'success');
          setViewingStore(normalizedResult);
        } else {
          const errMsg = result?.error?.message || 'A URL do logotipo não foi persistida.';
          showToast(errMsg, 'error');
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao editar estabelecimento.', 'error');
    } finally {
      setIsSubmittingStore(false);
    }
  };

  // Trigger searching users
  const handleSearchOwners = async (query: string) => {
    if (!query.trim()) {
      setSearchOwnerResults([]);
      return;
    }
    setIsSearchingOwners(true);
    try {
      const results = await adminService.searchUsers(query);
      setSearchOwnerResults(results);
    } catch (err: any) {
      showToast(err.message || 'Erro ao buscar usuários.', 'error');
    } finally {
      setIsSearchingOwners(false);
    }
  };

  const maskEmail = (email: string) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    if (local.length <= 3) {
      return `${local[0]}***@${domain}`;
    }
    return `${local.substring(0, 2)}***${local.substring(local.length - 2)}@${domain}`;
  };

  const handleCloseOwnerModal = () => {
    setLinkingUserStore(null);
    setOwnerModalTab('create');
    setCreateOwnerName('');
    setCreateOwnerEmail('');
    setCreateOwnerPhone('');
    setCreateOwnerPassword('');
    setCreateOwnerConfirmPassword('');
    setShowCreateOwnerPassword(false);
    setShowCreateOwnerConfirmPassword(false);
    setSearchOwnerQuery('');
    setSearchOwnerResults([]);
    setSelectedExistingOwner(null);
    setOwnerConfirmationPrompt(null);
    setOwnerSuccessInviteResult(null);
  };

  // Submit linking new or existing owner
  const handleLinkOwnerSubmit = async (e: React.FormEvent, isReplace: boolean = false, allowConversion: boolean = false) => {
    if (e) e.preventDefault();
    if (!linkingUserStore) return;

    setIsSubmittingStore(true);
    try {
      if (isDemo) {
        showToast(`Proprietário vinculado com sucesso (Modo Demo).`, 'success');
        handleCloseOwnerModal();
        return;
      }

      let payload: any = {};
      if (ownerModalTab === 'create') {
        if (!createOwnerName.trim()) {
          showToast('O nome do responsável é obrigatório.', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (!createOwnerEmail.trim()) {
          showToast('E-mail é obrigatório.', 'error');
          setIsSubmittingStore(false);
          return;
        }
        
        // Password validation rules
        if (!createOwnerPassword) {
          showToast('A senha inicial é obrigatória.', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (createOwnerPassword.length < 8) {
          showToast('A senha deve ter pelo menos 8 caracteres. (PASSWORD_TOO_SHORT)', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (!/[A-Za-z]/.test(createOwnerPassword)) {
          showToast('A senha deve conter pelo menos uma letra. (PASSWORD_REQUIRES_LETTER)', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (!/[0-9]/.test(createOwnerPassword)) {
          showToast('A senha deve conter pelo menos um número. (PASSWORD_REQUIRES_NUMBER)', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (createOwnerPassword.trim() === '') {
          showToast('A senha não pode conter apenas espaços. (PASSWORD_INVALID)', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (createOwnerPassword === createOwnerEmail.trim().toLowerCase()) {
          showToast('A senha não pode ser igual ao e-mail. (PASSWORD_EQUALS_EMAIL)', 'error');
          setIsSubmittingStore(false);
          return;
        }
        if (createOwnerPassword !== createOwnerConfirmPassword) {
          showToast('As senhas digitadas não coincidem. (PASSWORD_CONFIRMATION_MISMATCH)', 'error');
          setIsSubmittingStore(false);
          return;
        }

        payload = {
          name: createOwnerName.trim(),
          email: createOwnerEmail.trim(),
          phone: createOwnerPhone.trim(),
          password: createOwnerPassword,
          isReplace: isReplace
        };
      } else {
        if (!selectedExistingOwner) {
          showToast('Por favor, selecione um usuário na busca.', 'error');
          setIsSubmittingStore(false);
          return;
        }
        payload = {
          uid: selectedExistingOwner.uid,
          email: selectedExistingOwner.email,
          allowCustomerConversion: allowConversion
        };
      }

      let res: any;
      if (ownerModalTab === 'create') {
        res = await adminService.createOwnerAccess(linkingUserStore.id, payload);
      } else {
        const actionFn = isReplace ? adminService.replaceOwner : adminService.linkOwner;
        res = await actionFn(linkingUserStore.id, payload);
      }

      if (res.requiresConfirmation) {
        setOwnerConfirmationPrompt({
          message: res.message,
          user: res.user,
          isReplace
        });
        setIsSubmittingStore(false);
        return;
      }

      showToast(res.message || 'Acesso criado e proprietário vinculado com sucesso.', 'success');
      
      // Update local establishments list
      const updatedStore = {
        ...linkingUserStore,
        ownerUid: res.data ? res.data.uid : res.user.uid,
        merchantUid: res.data ? res.data.uid : res.user.uid,
        merchantOwnerUid: res.data ? res.data.uid : res.user.uid,
        owner: res.data ? res.data.name : res.user.name, // Legal Contact Name
        ownerName: res.data ? res.data.name : res.user.name,
        ownerEmail: res.data ? res.data.email : res.user.email,
        ownerPhone: res.data ? res.data.phone : res.user.phone,
        phone: (res.data ? res.data.phone : res.user.phone) || linkingUserStore.phone,
        email: (res.data ? res.data.email : res.user.email) || linkingUserStore.email
      };
      setEstablishments(prev => prev.map(est => est.id === linkingUserStore.id ? updatedStore : est));
      setLinkingUserStore(updatedStore);

      // Reset and close
      handleCloseOwnerModal();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro na operação.', 'error');
    } finally {
      setIsSubmittingStore(false);
    }
  };

  const handleUnlinkOwner = async () => {
    if (!linkingUserStore) return;
    if (!window.confirm(`Tem certeza que deseja desvincular o proprietário do estabelecimento "${linkingUserStore.name}"? Ele perderá o acesso imediatamente.`)) {
      return;
    }

    setIsSubmittingStore(true);
    try {
      if (isDemo) {
        showToast('Proprietário desvinculado (Modo Demo).', 'success');
        handleCloseOwnerModal();
        return;
      }

      await adminService.unlinkOwner(linkingUserStore.id);
      showToast('Proprietário desvinculado com sucesso!', 'success');
      
      const updatedStore = {
        ...linkingUserStore,
        ownerUid: null,
        merchantUid: null,
        merchantOwnerUid: null,
        owner: null,
        ownerName: null,
        ownerEmail: null,
        ownerPhone: null
      };
      setEstablishments(prev => prev.map(est => est.id === linkingUserStore.id ? updatedStore : est));
      setLinkingUserStore(updatedStore);
      handleCloseOwnerModal();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao desvincular.', 'error');
    } finally {
      setIsSubmittingStore(false);
    }
  };

  const handleResendInvite = async () => {
    if (!linkingUserStore) return;
    setIsSubmittingStore(true);
    try {
      if (isDemo) {
        showToast('Convite reenviado (Modo Demo).', 'success');
        setIsSubmittingStore(false);
        return;
      }

      const res = await adminService.resendInvite(linkingUserStore.id);
      showToast('Convite reenviado com sucesso!', 'success');
      if (res.passwordResetLink) {
        setOwnerSuccessInviteResult({
          email: linkingUserStore.ownerEmail || linkingUserStore.email || '',
          uid: linkingUserStore.ownerUid || '',
          passwordResetLink: res.passwordResetLink,
          name: linkingUserStore.ownerName || linkingUserStore.owner || ''
        });
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao reenviar convite.', 'error');
    } finally {
      setIsSubmittingStore(false);
    }
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

  // Loyalty Management Event Handlers
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loyaltyConfig) return;
    setIsSavingConfig(true);
    try {
      await loyaltyService.updateConfig(loyaltyConfig);
      showToast('Configurações de fidelidade salvas com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar as configurações.', 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewardFormTitle.trim()) {
      showToast('Preencha o título do prêmio.', 'error');
      return;
    }
    try {
      const rewardToSave: LoyaltyReward = {
        id: editingReward?.id,
        title: rewardFormTitle.trim(),
        description: rewardFormDesc.trim(),
        pointsCost: Number(rewardFormCost),
        rewardType: rewardFormType,
        rewardValue: Number(rewardFormValue),
        maximumDiscount: rewardFormMaxDisc ? Number(rewardFormMaxDisc) : undefined,
        minimumOrderValue: rewardFormMinOrder ? Number(rewardFormMinOrder) : undefined,
        availableForAllMerchants: rewardFormAllMerchants,
        eligibleMerchantIds: rewardFormAllMerchants ? [] : rewardFormMerchants,
        stock: rewardFormStock ? Number(rewardFormStock) : undefined,
        limitPerCustomer: rewardFormLimitPerCustomer ? Number(rewardFormLimitPerCustomer) : undefined,
        startsAt: rewardFormStartsAt || undefined,
        expiresAt: rewardFormExpiresAt || undefined,
        active: editingReward ? editingReward.active : true,
      };
      
      await loyaltyService.saveReward(rewardToSave);
      showToast(editingReward ? 'Prêmio atualizado com sucesso!' : 'Prêmio criado com sucesso!', 'success');
      setIsRewardFormOpen(false);
      setEditingReward(null);
      // Reload loyalty rewards
      const rewards = await loyaltyService.getRewards(true);
      setLoyaltyRewards(rewards);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar prêmio.', 'error');
    }
  };

  const handleToggleRewardActive = async (reward: LoyaltyReward) => {
    if (!reward.id) return;
    try {
      const updated = { ...reward, active: !reward.active };
      await loyaltyService.saveReward(updated);
      showToast(`Prêmio "${reward.title}" foi ${!reward.active ? 'ativado' : 'desativado'}!`, 'success');
      // Reload loyalty rewards
      const rewards = await loyaltyService.getRewards(true);
      setLoyaltyRewards(rewards);
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar status do prêmio.', 'error');
    }
  };

  const handleEditRewardClick = (reward: LoyaltyReward) => {
    setEditingReward(reward);
    setRewardFormTitle(reward.title);
    setRewardFormDesc(reward.description || '');
    setRewardFormCost(reward.pointsCost);
    setRewardFormType(reward.rewardType);
    setRewardFormValue(reward.rewardValue);
    setRewardFormMaxDisc(reward.maximumDiscount);
    setRewardFormMinOrder(reward.minimumOrderValue);
    setRewardFormAllMerchants(reward.availableForAllMerchants);
    setRewardFormMerchants(reward.eligibleMerchantIds || []);
    setRewardFormStock(reward.stock);
    setRewardFormLimitPerCustomer(reward.limitPerCustomer);
    setRewardFormStartsAt(reward.startsAt || '');
    setRewardFormExpiresAt(reward.expiresAt || '');
    setIsRewardFormOpen(true);
  };

  const handleNewRewardClick = () => {
    setEditingReward(null);
    setRewardFormTitle('');
    setRewardFormDesc('');
    setRewardFormCost(100);
    setRewardFormType('percentage_discount');
    setRewardFormValue(10);
    setRewardFormMaxDisc(undefined);
    setRewardFormMinOrder(undefined);
    setRewardFormAllMerchants(true);
    setRewardFormMerchants([]);
    setRewardFormStock(undefined);
    setRewardFormLimitPerCustomer(undefined);
    setRewardFormStartsAt('');
    setRewardFormExpiresAt('');
    setIsRewardFormOpen(true);
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
                { id: 'financeiro', label: 'Painel Financeiro', icon: DollarSign },
                { id: 'pedidos', label: 'Todos os pedidos', icon: ShoppingCart },
                { id: 'lojas', label: 'Estabelecimentos', icon: Building2 },
                { id: 'cidades', label: 'Cidades atendidas', icon: MapPin },
                { id: 'migracao', label: 'Migração do catálogo', icon: Database },
                { id: 'suporte', label: 'Central de suporte', icon: HelpCircle, badge: kpis.openTickets },
                { id: 'feedbacks', label: 'Avaliações e feedbacks', icon: Star },
                { id: 'fidelidade', label: 'Programa de Fidelidade', icon: Award },
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
                                Ambiente de gerenciamento
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
                            ? ''
                            : 'Painel administrativo oficial com autenticação real e controle de acesso via Firestore.'}
                        </p>

                        {/* Auth Status indicators */}
                        <div className="mt-3 pt-3 border-t border-[#EADFD8]/60 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-bold text-[#756B66]">
                          {isDemo ? (
                            <>
                              <div className="flex flex-wrap items-center gap-4">
                                <div>
                                  <span className="text-[#201A17] font-black uppercase tracking-wider text-[9px] mr-1.5">Autenticação:</span>
                                  <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px] font-extrabold">Ambiente de gerenciamento</span>
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
                              {(!o.customerId || o.customerId === 'anonymous') && (
                                <div className="mt-1">
                                  <span className="bg-amber-100 text-amber-800 text-[8px] font-black uppercase px-1.5 py-0.5 rounded leading-none inline-block">
                                    Pedido sem vínculo de conta
                                  </span>
                                </div>
                              )}
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

                {/* Botões de Filtro de Status com Contador */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setLojasStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                      lojasStatusFilter === 'all'
                        ? 'bg-[#201A17] text-[#FFBE5C]'
                        : 'bg-white text-[#756B66] border border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    <span>Todos os Status</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F7F4EF] text-[#201A17] font-black">
                      {establishmentStatusCounts.all}
                    </span>
                  </button>
                  <button
                    onClick={() => setLojasStatusFilter('active')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                      lojasStatusFilter === 'active'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-[#756B66] border border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Ativas</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F7F4EF] text-[#201A17] font-black">
                      {establishmentStatusCounts.active}
                    </span>
                  </button>
                  <button
                    onClick={() => setLojasStatusFilter('paused')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                      lojasStatusFilter === 'paused'
                        ? 'bg-amber-500 text-white'
                        : 'bg-white text-[#756B66] border border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>Pausadas</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F7F4EF] text-[#201A17] font-black">
                      {establishmentStatusCounts.paused}
                    </span>
                  </button>
                  <button
                    onClick={() => setLojasStatusFilter('inactive')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                      lojasStatusFilter === 'inactive'
                        ? 'bg-rose-600 text-white'
                        : 'bg-white text-[#756B66] border border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>Inativas</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F7F4EF] text-[#201A17] font-black">
                      {establishmentStatusCounts.inactive}
                    </span>
                  </button>
                  <button
                    onClick={() => setLojasStatusFilter('archived')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                      lojasStatusFilter === 'archived'
                        ? 'bg-gray-500 text-white'
                        : 'bg-white text-[#756B66] border border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Arquivadas</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F7F4EF] text-[#201A17] font-black">
                      {establishmentStatusCounts.archived}
                    </span>
                  </button>
                </div>

                {/* Filtros e Busca de Estabelecimentos */}
                <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold shadow-xs">
                  {/* Busca por texto */}
                  <div className="relative col-span-1 md:col-span-2">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#756B66]" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, CNPJ ou proprietário..."
                      value={lojasSearchQuery}
                      onChange={(e) => setLojasSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-[#EADFD8] rounded-xl bg-[#F7F4EF]/30 font-bold text-xs outline-none focus:border-[#E94F2F]/50"
                    />
                  </div>

                  {/* Filtro por Cidade */}
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#E94F2F]" />
                    <select
                      value={lojasCityFilter}
                      onChange={(e) => setLojasCityFilter(e.target.value)}
                      className="w-full p-2 border border-[#EADFD8] rounded-xl bg-white font-bold text-xs outline-none focus:border-[#E94F2F]/50"
                    >
                      <option value="all">Todas as cidades</option>
                      {cities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filtro por Status */}
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#756B66]" />
                    <select
                      value={lojasStatusFilter}
                      onChange={(e) => setLojasStatusFilter(e.target.value as any)}
                      className="w-full p-2 border border-[#EADFD8] rounded-xl bg-white font-bold text-xs outline-none focus:border-[#E94F2F]/50"
                    >
                      <option value="all">Todos os Status</option>
                      <option value="active">Ativas (Em operação)</option>
                      <option value="paused">Pausadas</option>
                      <option value="inactive">Inativas (Bloqueadas)</option>
                      <option value="archived">Arquivadas (Histórico)</option>
                    </select>
                  </div>
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
                          <th className="py-3.5 px-4">Status da Plataforma</th>
                          <th className="py-3.5 px-4">Situação Operacional</th>
                          <th className="py-3.5 px-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F7F4EF] text-xs font-semibold">
                        {merchantRevenueLog.map((est) => {
                          const status = getEstablishmentStatus(est);
                          const opPause = est.operationalPause || (est as any).temporarilyPaused;
                          const opOpen = est.isOpen || (est as any).open;
                          return (
                            <tr key={est.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                              <td className="py-4 px-4 flex items-center gap-3">
                                <EstablishmentImage src={resolveEstablishmentLogo(est)} alt={est.name} fallbackType="logo" className="w-10 h-10 rounded-lg object-cover" />
                                <div>
                                  <h4 className="font-bold text-[#201A17]">{est.name}</h4>
                                  <p className="text-[10px] text-[#756B66] font-medium">{getCategoryLabel(est.category || est.categoryId)}</p>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-[#201A17] font-bold">
                                {est.cityName || est.city || 'São João Batista do Glória'} - {est.state || 'MG'}
                              </td>
                              <td className="py-4 px-4 text-[#756B66]">
                                <div>{est.legalContactName || est.owner || 'Não informado'}</div>
                                <div className="text-[10px] text-[#756B66] font-medium">{est.document || 'Sem CNPJ'}</div>
                              </td>
                              <td className="py-4 px-4 text-[#2F9E69] font-bold">
                                R$ {est.revenue.toFixed(2).replace('.', ',')}
                                <span className="text-[9px] text-[#756B66] block font-medium">{est.orderCount} pedidos</span>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                                  status === 'active'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : status === 'inactive'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {status === 'active' ? 'Ativa' : status === 'inactive' ? 'Inativa' : 'Arquivada'}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                                  opPause
                                    ? 'bg-amber-100 text-amber-800'
                                    : opOpen
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {opPause ? 'Pausada' : opOpen ? 'Aberta' : 'Fechada'}
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDropdownId(openDropdownId === est.id ? null : est.id);
                                  }}
                                  className="p-2 hover:bg-[#F7F4EF] rounded-lg transition-colors text-[#756B66] inline-flex items-center"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                
                                {openDropdownId === est.id && (
                                  <div className="absolute right-4 mt-1 w-56 bg-white border border-[#EADFD8] rounded-xl shadow-lg z-50 py-1 text-left">
                                    <button
                                      onClick={() => {
                                        setViewingStore(est);
                                        setOpenDropdownId(null);
                                      }}
                                      className="w-full px-4 py-2 text-xs font-bold text-[#201A17] hover:bg-[#F7F4EF] flex items-center gap-2"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-[#E94F2F]" />
                                      Visualizar Detalhes
                                    </button>
                                    
                                    {status !== 'archived' && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setEditingStore(est);
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full px-4 py-2 text-xs font-bold text-[#201A17] hover:bg-[#F7F4EF] flex items-center gap-2"
                                        >
                                          <Edit className="w-3.5 h-3.5 text-blue-500" />
                                          Editar Dados Gerais
                                        </button>
                                        
                                        <button
                                          onClick={() => {
                                            setLinkingUserStore(est);
                                            setSelectedMerchantUid(est.ownerUid || '');
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full px-4 py-2 text-xs font-bold text-[#201A17] hover:bg-[#F7F4EF] flex items-center gap-2"
                                        >
                                          <User className="w-3.5 h-3.5 text-amber-500" />
                                          Vincular Proprietário
                                        </button>
                                      </>
                                    )}
                                    
                                    <div className="border-t border-[#F7F4EF] my-1"></div>
                                    <div className="px-3 py-1 text-[9px] font-black text-[#756B66] uppercase">Alterar Status</div>
                                    
                                    {status === 'inactive' && (
                                      <button
                                        onClick={() => {
                                          handleUpdateStoreStatus(est.id, 'active');
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full px-4 py-1.5 text-xs font-bold text-[#201A17] hover:bg-[#F7F4EF] flex items-center gap-2"
                                      >
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        Ativar Loja
                                      </button>
                                    )}

                                    {status === 'active' && (
                                      <button
                                        onClick={() => {
                                          handleUpdateStoreStatus(est.id, 'paused');
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full px-4 py-1.5 text-xs font-bold text-[#201A17] hover:bg-[#F7F4EF] flex items-center gap-2"
                                      >
                                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                        Pausar Operação
                                      </button>
                                    )}

                                    {status !== 'inactive' && status !== 'archived' && (
                                      <button
                                        onClick={() => {
                                          setStatusUpdateTarget({ id: est.id, name: est.name, status: 'inactive' });
                                          setStatusChangeReason('');
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full px-4 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                      >
                                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                        Desativar Loja
                                      </button>
                                    )}

                                    {status !== 'archived' && (
                                      <button
                                        onClick={() => {
                                          setStatusUpdateTarget({ id: est.id, name: est.name, status: 'archived' });
                                          setStatusChangeReason('');
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full px-4 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 flex items-center gap-2"
                                      >
                                        <Archive className="w-3.5 h-3.5" />
                                        Arquivar Loja
                                      </button>
                                    )}

                                    {status === 'archived' && (
                                      <button
                                        onClick={() => {
                                          if (window.confirm(`Deseja realmente restaurar o estabelecimento "${est.name}"? Ele retornará ao status Inativo.`)) {
                                            handleUpdateStoreStatus(est.id, 'inactive', 'Restaurado do arquivo');
                                          }
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full px-4 py-1.5 text-xs font-bold text-[#E94F2F] hover:bg-orange-50 flex items-center gap-2"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5 text-[#E94F2F]" />
                                        Restaurar Loja
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
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

            {/* -------------------- TAB: FIDELIDADE (Programa de Fidelidade) -------------------- */}
            {adminTab === 'fidelidade' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Header Section */}
                <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h3 className="font-extrabold text-lg text-[#201A17]">Fidelidade Uai - Gestão do Programa</h3>
                    <p className="text-xs text-[#756B66] font-semibold mt-0.5">Defina as regras, crie cupons de resgate e acompanhe a atividade dos clientes.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={loadLoyaltyData}
                    disabled={isLoadingLoyalty}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F4EF] border border-[#EADFD8] text-xs font-black text-[#5C534E] rounded-xl hover:bg-white transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLoyalty ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                </div>

                {/* Sub-tabs menu */}
                <div className="flex border-b border-[#EADFD8] gap-6 text-xs font-black">
                  <button
                    type="button"
                    onClick={() => setLoyaltySubTab('config')}
                    className={`pb-2.5 px-1 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                      loyaltySubTab === 'config'
                        ? 'border-[#E94F2F] text-[#E94F2F]'
                        : 'border-transparent text-[#756B66] hover:text-[#201A17]'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configurações</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoyaltySubTab('rewards')}
                    className={`pb-2.5 px-1 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                      loyaltySubTab === 'rewards'
                        ? 'border-[#E94F2F] text-[#E94F2F]'
                        : 'border-transparent text-[#756B66] hover:text-[#201A17]'
                    }`}
                  >
                    <Gift className="w-4 h-4" />
                    <span>Prêmios</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoyaltySubTab('redemptions')}
                    className={`pb-2.5 px-1 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                      loyaltySubTab === 'redemptions'
                        ? 'border-[#E94F2F] text-[#E94F2F]'
                        : 'border-transparent text-[#756B66] hover:text-[#201A17]'
                    }`}
                  >
                    <Award className="w-4 h-4" />
                    <span>Resgates</span>
                  </button>
                </div>

                {isLoadingLoyalty && !loyaltyConfig ? (
                  <div className="bg-white p-8 rounded-3xl border border-[#EADFD8] text-center space-y-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E94F2F] mx-auto" />
                    <p className="text-xs text-[#756B66] font-semibold">Carregando dados do programa...</p>
                  </div>
                ) : (
                  <>
                    {/* SUB-TAB: CONFIG */}
                    {loyaltySubTab === 'config' && loyaltyConfig && (
                      <form onSubmit={handleSaveConfig} className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-sm space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-semibold">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Pontos de Boas-vindas</label>
                            <input
                              type="number"
                              required
                              min="0"
                              value={loyaltyConfig.welcomeBonusPoints}
                              onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, welcomeBonusPoints: Number(e.target.value) })}
                              className="w-full px-3 py-2.5 rounded-xl border border-[#EADFD8] bg-white outline-none focus:border-[#E94F2F]/50 font-bold"
                            />
                            <p className="text-[10px] text-gray-400">Pontos creditados automaticamente no primeiro acesso do cliente.</p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Pontos por Pedido Concluído</label>
                            <input
                              type="number"
                              required
                              min="0"
                              value={loyaltyConfig.pointsPerCompletedOrder}
                              onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, pointsPerCompletedOrder: Number(e.target.value) })}
                              className="w-full px-3 py-2.5 rounded-xl border border-[#EADFD8] bg-white outline-none focus:border-[#E94F2F]/50 font-bold"
                            />
                            <p className="text-[10px] text-gray-400">Pontos creditados quando o estabelecimento conclui o pedido.</p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Validade dos Cupons de Resgate (Dias)</label>
                            <input
                              type="number"
                              required
                              min="1"
                              value={loyaltyConfig.defaultValidityDays}
                              onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, defaultValidityDays: Number(e.target.value) })}
                              className="w-full px-3 py-2.5 rounded-xl border border-[#EADFD8] bg-white outline-none focus:border-[#E94F2F]/50 font-bold"
                            />
                            <p className="text-[10px] text-gray-400">Prazo de validade do cupom de desconto após o resgate.</p>
                          </div>
                        </div>

                        {/* Tier levels block */}
                        <div className="border-t border-[#F7F4EF] pt-6 space-y-4">
                          <h4 className="font-extrabold text-sm text-[#201A17]">Requisitos de Pontuação por Nível</h4>
                          <p className="text-[11px] text-[#756B66] font-semibold">Os níveis (tiers) determinam o status do cliente com base no total acumulado de pontos na vida toda (lifetimePoints).</p>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase block">Bronze 🧀</label>
                              <input
                                type="number"
                                required
                                disabled
                                value={loyaltyConfig.bronzeLimit}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-400 font-bold"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase block">Prata 🥈</label>
                              <input
                                type="number"
                                required
                                min="1"
                                value={loyaltyConfig.prataLimit}
                                onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, prataLimit: Number(e.target.value) })}
                                className="w-full px-3 py-2.5 rounded-xl border border-[#EADFD8] bg-white outline-none focus:border-[#E94F2F]/50 font-bold"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase block">Ouro 🥇</label>
                              <input
                                type="number"
                                required
                                min="1"
                                value={loyaltyConfig.ouroLimit}
                                onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, ouroLimit: Number(e.target.value) })}
                                className="w-full px-3 py-2.5 rounded-xl border border-[#EADFD8] bg-white outline-none focus:border-[#E94F2F]/50 font-bold"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-[#756B66] uppercase block">Diamante 💎</label>
                              <input
                                type="number"
                                required
                                min="1"
                                value={loyaltyConfig.diamanteLimit}
                                onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, diamanteLimit: Number(e.target.value) })}
                                className="w-full px-3 py-2.5 rounded-xl border border-[#EADFD8] bg-white outline-none focus:border-[#E94F2F]/50 font-bold"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-[#F7F4EF]">
                          <button
                            type="submit"
                            disabled={isSavingConfig}
                            className="px-6 py-2.5 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs font-black rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
                          >
                            {isSavingConfig ? 'Salvando...' : 'Salvar Configurações'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* SUB-TAB: REWARDS (PRÊMIOS) */}
                    {loyaltySubTab === 'rewards' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="font-extrabold text-sm text-[#201A17]">Lista de Prêmios</h4>
                          <button
                            type="button"
                            onClick={handleNewRewardClick}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs font-black rounded-xl transition-all shadow-sm active:scale-95"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Novo Prêmio</span>
                          </button>
                        </div>

                        {loyaltyRewards.length === 0 ? (
                          <div className="bg-white p-8 rounded-3xl border border-[#EADFD8] text-center space-y-2">
                            <p className="font-extrabold text-sm text-[#201A17]">Nenhum prêmio cadastrado.</p>
                            <p className="text-xs text-[#756B66] font-semibold">Clique em "Novo Prêmio" para criar seu primeiro benefício.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {loyaltyRewards.map((reward) => (
                              <div key={reward.id} className={`bg-white p-5 rounded-2xl border border-[#EADFD8] shadow-sm flex flex-col justify-between gap-4 ${!reward.active ? 'opacity-60 bg-gray-50/50' : ''}`}>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start gap-2">
                                    <h5 className="font-black text-[#201A17] text-sm">{reward.title}</h5>
                                    <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full shrink-0">
                                      {reward.pointsCost} pts
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#756B66] font-semibold leading-relaxed">{reward.description}</p>
                                  
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-gray-500 font-bold pt-1.5 border-t border-[#F7F4EF]">
                                    <div>
                                      <span className="text-gray-400 font-medium">Benefício: </span>
                                      <span>
                                        {reward.rewardType === 'percentage_discount' ? `${reward.rewardValue}%` : `R$ ${reward.rewardValue}`}
                                      </span>
                                    </div>
                                    {reward.maximumDiscount && (
                                      <div>
                                        <span className="text-gray-400 font-medium">Desc. Máximo: </span>
                                        <span>R$ {reward.maximumDiscount}</span>
                                      </div>
                                    )}
                                    {reward.minimumOrderValue && (
                                      <div>
                                        <span className="text-gray-400 font-medium">Pedido Mín.: </span>
                                        <span>R$ {reward.minimumOrderValue}</span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-gray-400 font-medium">Estab.: </span>
                                      <span>{reward.availableForAllMerchants ? 'Todos' : `${reward.eligibleMerchantIds?.length || 0} selecionados`}</span>
                                    </div>
                                    {reward.stock !== undefined && (
                                      <div>
                                        <span className="text-gray-400 font-medium">Estoque: </span>
                                        <span>{reward.stock}</span>
                                      </div>
                                    )}
                                    {reward.limitPerCustomer && (
                                      <div>
                                        <span className="text-gray-400 font-medium">Lim. Cliente: </span>
                                        <span>{reward.limitPerCustomer}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-2.5 pt-2 border-t border-[#F7F4EF]">
                                  <button
                                    type="button"
                                    onClick={() => handleEditRewardClick(reward)}
                                    className="flex-1 py-1.5 bg-[#F7F4EF] hover:bg-white text-[#5C534E] text-xs font-black border border-[#EADFD8] rounded-lg transition-all"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRewardActive(reward)}
                                    className={`flex-1 py-1.5 text-xs font-black border rounded-lg transition-all ${
                                      reward.active
                                        ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                                        : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                    }`}
                                  >
                                    {reward.active ? 'Desativar' : 'Ativar'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* SUB-TAB: REDEMPTIONS (RESGATES) */}
                    {loyaltySubTab === 'redemptions' && (
                      <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[10px] font-black text-[#756B66] uppercase tracking-wider">
                                <th className="py-3 px-4">Código / Cupom</th>
                                <th className="py-3 px-4">Cliente (ID)</th>
                                <th className="py-3 px-4">Prêmio</th>
                                <th className="py-3 px-4">Pontos Gastos</th>
                                <th className="py-3 px-4">Data</th>
                                <th className="py-3 px-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F7F4EF] text-xs font-semibold text-[#201A17]">
                              {loyaltyRedemptions.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-8 text-center text-gray-400">
                                    Nenhum resgate efetuado até o momento.
                                  </td>
                                </tr>
                              ) : (
                                loyaltyRedemptions.map((red) => (
                                  <tr key={red.id} className="hover:bg-[#F7F4EF]/30">
                                    <td className="py-3 px-4">
                                      <span className="font-mono bg-amber-50 border border-dashed border-amber-300 text-amber-800 px-2 py-0.5 rounded text-xs font-black">
                                        {red.couponCode}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-[#756B66] truncate max-w-[120px]" title={red.customerId}>
                                      {red.customerId}
                                    </td>
                                    <td className="py-3 px-4 font-bold text-[#201A17]">{red.rewardTitle || 'Prêmio'}</td>
                                    <td className="py-3 px-4 font-black text-amber-700">-{red.pointsSpent} pts</td>
                                    <td className="py-3 px-4 text-[#756B66]">
                                      {red.createdAt ? new Date(red.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : ''}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                        red.status === 'available'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : red.status === 'used'
                                          ? 'bg-gray-100 text-gray-500 border border-gray-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        {red.status === 'available' ? 'Disponível' : red.status === 'used' ? 'Utilizado' : 'Expirado'}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* REWARD FORM MODAL */}
                {isRewardFormOpen && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-lg w-full border border-[#EADFD8] overflow-hidden flex flex-col shadow-2xl max-h-[92vh]">
                      <div className="p-5 border-b border-[#EADFD8] bg-[#F7F4EF] flex justify-between items-center">
                        <h4 className="font-extrabold text-base text-[#201A17]">
                          {editingReward ? 'Editar Prêmio' : 'Novo Prêmio de Fidelidade'}
                        </h4>
                        <button type="button" onClick={() => setIsRewardFormOpen(false)} className="text-[#756B66] hover:text-[#201A17]">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <form onSubmit={handleSaveReward} className="p-6 overflow-y-auto space-y-4 text-xs font-semibold text-[#201A17]">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-[#756B66] uppercase">Título do Prêmio *</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: R$ 15 de desconto"
                            value={rewardFormTitle}
                            onChange={(e) => setRewardFormTitle(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-[#756B66] uppercase">Descrição do Prêmio</label>
                          <input
                            type="text"
                            placeholder="Ex: Desconto de R$ 15 em compras acima de R$ 60"
                            value={rewardFormDesc}
                            onChange={(e) => setRewardFormDesc(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Custo em Pontos *</label>
                            <input
                              type="number"
                              required
                              min="1"
                              value={rewardFormCost}
                              onChange={(e) => setRewardFormCost(Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none font-bold text-amber-700"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Tipo de Benefício *</label>
                            <select
                              value={rewardFormType}
                              onChange={(e) => setRewardFormType(e.target.value as any)}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] bg-white outline-none font-bold"
                            >
                              <option value="percentage_discount">Desconto %</option>
                              <option value="fixed_discount">Desconto Fixo (R$)</option>
                              <option value="delivery_benefit">Benefício de Entrega (R$)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Valor do Benefício *</label>
                            <input
                              type="number"
                              required
                              min="0"
                              step="any"
                              value={rewardFormValue}
                              onChange={(e) => setRewardFormValue(Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Desconto Máximo (R$)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Sem limite"
                              value={rewardFormMaxDisc ?? ''}
                              onChange={(e) => setRewardFormMaxDisc(e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Pedido Mínimo (R$)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Sem mínimo"
                              value={rewardFormMinOrder ?? ''}
                              onChange={(e) => setRewardFormMinOrder(e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Estoque (Qtd)</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="Sem limite"
                              value={rewardFormStock ?? ''}
                              onChange={(e) => setRewardFormStock(e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Limite por Cliente</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="Sem limite"
                              value={rewardFormLimitPerCustomer ?? ''}
                              onChange={(e) => setRewardFormLimitPerCustomer(e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-3 py-2 rounded-xl border border-[#EADFD8] outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-[#756B66] uppercase block">Data Início</label>
                              <input
                                type="date"
                                value={rewardFormStartsAt}
                                onChange={(e) => setRewardFormStartsAt(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-[#EADFD8] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-[#756B66] uppercase block">Data Fim</label>
                              <input
                                type="date"
                                value={rewardFormExpiresAt}
                                onChange={(e) => setRewardFormExpiresAt(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-[#EADFD8] outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Establishments selector */}
                        <div className="border-t border-[#F7F4EF] pt-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-[#756B66] uppercase">Estabelecimentos Elegíveis</span>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rewardFormAllMerchants}
                                onChange={(e) => setRewardFormAllMerchants(e.target.checked)}
                                className="rounded text-[#E94F2F] focus:ring-[#E94F2F]/20"
                              />
                              <span className="text-[10px] text-[#5C534E] font-bold">Disponível em todos</span>
                            </label>
                          </div>

                          {!rewardFormAllMerchants && (
                            <div className="max-h-24 overflow-y-auto border border-[#EADFD8] rounded-xl p-3 bg-[#FCFAF6] space-y-1.5">
                              {establishments.map((est) => {
                                const isChecked = rewardFormMerchants.includes(est.id);
                                return (
                                  <label key={est.id} className="flex items-center gap-2 text-[11px] font-bold text-[#5C534E] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setRewardFormMerchants(rewardFormMerchants.filter(id => id !== est.id));
                                        } else {
                                          setRewardFormMerchants([...rewardFormMerchants, est.id]);
                                        }
                                      }}
                                      className="rounded text-[#E94F2F] focus:ring-[#E94F2F]/20"
                                    />
                                    <span>{est.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2.5 pt-4 border-t border-[#F7F4EF]">
                          <button
                            type="button"
                            onClick={() => setIsRewardFormOpen(false)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#5C534E] text-xs font-black rounded-xl transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs font-black rounded-xl transition-all shadow-sm active:scale-95"
                          >
                            Salvar Prêmio
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* -------------------- TAB: FINANCEIRO E METRICAS REAL -------------------- */}
            {adminTab === 'financeiro' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <FinanceiroAdmin />
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

                {/* ORPHANED ORDER MANAGEMENT SECTION */}
                {(!activeDetailedOrder.customerId || activeDetailedOrder.customerId === 'anonymous') && (
                  <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 shadow-xs space-y-4">
                    <h4 className="font-extrabold text-amber-900 text-sm flex items-center gap-2">
                      <span>⚠️ Pedido sem vínculo de conta</span>
                    </h4>
                    <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                      Este pedido foi gerado sem associação com um perfil de cliente autenticado (UID ausente ou anônimo).
                    </p>
                    
                    <div className="bg-white p-4 rounded-2xl border border-amber-200/60 space-y-3">
                      <p className="text-xs font-black text-[#756B66] uppercase">Vincular Manualmente a um Cliente</p>
                      
                      <div className="flex flex-col gap-1 w-full">
                        <label className="text-[10px] font-black text-[#8A7F79] uppercase">UID do Cliente (User ID):</label>
                        <input
                          type="text"
                          placeholder="Ex: u8Xy9Z..."
                          id="admin-link-customer-uid"
                          className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                        />
                      </div>

                      <div className="flex flex-col gap-1 w-full">
                        <label className="text-[10px] font-black text-[#8A7F79] uppercase">Motivo do Vínculo:</label>
                        <input
                          type="text"
                          placeholder="Ex: Cliente fez pedido como visitante antes da correção..."
                          id="admin-link-customer-reason"
                          className="w-full text-xs bg-[#F7F4EF] border border-[#EADFD8] rounded-xl px-3 py-2 font-semibold text-[#201A17] focus:outline-hidden focus:ring-1 focus:ring-[#E94F2F]"
                        />
                      </div>

                      <button
                        onClick={async () => {
                          const uidInput = document.getElementById('admin-link-customer-uid') as HTMLInputElement;
                          const reasonInput = document.getElementById('admin-link-customer-reason') as HTMLInputElement;
                          const targetUid = uidInput?.value?.trim();
                          const reason = reasonInput?.value?.trim();

                          if (!targetUid || !reason) {
                            showToast("Por favor, preencha o UID e o motivo do vínculo.", "error");
                            return;
                          }

                          try {
                            await orderService.linkOrderToCustomer({
                              orderId: activeDetailedOrder.id,
                              adminId: currentUser?.uid || "admin",
                              previousCustomerId: activeDetailedOrder.customerId,
                              newCustomerId: targetUid,
                              reason: reason
                            });
                            showToast("Pedido vinculado com sucesso!", "success");
                            // Update local detailed order view
                            setSelectedDetailedOrder(prev => prev ? { 
                              ...prev, 
                              customerId: targetUid,
                              customerName: "Cliente Vinculado (Aguarde recarga)"
                            } : null);
                            if (uidInput) uidInput.value = '';
                            if (reasonInput) reasonInput.value = '';
                          } catch (err: any) {
                            showToast(err.message || "Erro ao vincular pedido.", "error");
                          }
                        }}
                        className="bg-[#E94F2F] hover:bg-[#BD351C] text-white w-full py-2 rounded-xl text-xs font-black shadow-xs transition-all active:scale-95"
                      >
                        Vincular Manualmente ao UID
                      </button>
                    </div>
                  </div>
                )}

                {/* AUDIT TRAIL FOR MANUAL LINKING */}
                {(activeDetailedOrder as any).linkingAuditHistory && (activeDetailedOrder as any).linkingAuditHistory.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 shadow-xs space-y-3">
                    <h4 className="font-extrabold text-emerald-900 text-sm">
                      Histórico de Auditoria de Vínculo
                    </h4>
                    <div className="space-y-2">
                      {(activeDetailedOrder as any).linkingAuditHistory.map((audit: any, index: number) => (
                        <div key={index} className="text-xs text-emerald-800 font-semibold border-b border-emerald-200/50 pb-2 last:border-0 last:pb-0">
                          <p><strong>Admin ID:</strong> {audit.adminId}</p>
                          <p><strong>De:</strong> {audit.previousCustomerId} ➔ <strong>Para:</strong> {audit.newCustomerId}</p>
                          <p><strong>Motivo:</strong> {audit.reason}</p>
                          <p><strong>Data:</strong> {new Date(audit.timestamp).toLocaleString('pt-BR')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

      {/* -------------------- ADMIN STATUS UPDATE CONFIRMATION MODAL -------------------- */}
      <AnimatePresence>
        {statusUpdateTarget && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="admin-status-update-confirm-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full flex flex-col shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17]">
                  {statusUpdateTarget.status === 'inactive' ? 'Desativar Estabelecimento' : 'Arquivar Estabelecimento'}
                </h3>
                <button onClick={() => setStatusUpdateTarget(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <p className="text-sm text-[#756B66] leading-relaxed">
                  Você solicitou a alteração de status de <strong className="text-[#201A17]">{statusUpdateTarget.name}</strong> para{' '}
                  <span className="text-rose-600 font-bold uppercase">
                    {statusUpdateTarget.status === 'inactive' ? 'Inativo (Suspenso)' : 'Arquivado'}
                  </span>.
                </p>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-[#756B66]">
                  <h4 className="font-black text-amber-800 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Impacto da Operação:
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                    <li>A loja deixará de aparecer para clientes no aplicativo.</li>
                    <li>Nenhum novo pedido poderá ser criado para este estabelecimento.</li>
                    <li>O histórico de pedidos e o catálogo de produtos serão totalmente preservados.</li>
                    {statusUpdateTarget.status === 'archived' && (
                      <li>A loja será removida da listagem padrão de controle administrativo (disponível apenas no filtro "Arquivadas").</li>
                    )}
                  </ul>
                </div>

                {/* Active orders verification */}
                {(() => {
                  const activeOrders = orders.filter(o => 
                    o.establishmentId === statusUpdateTarget.id && 
                    ['aguardando_confirmacao', 'confirmado', 'em_preparacao', 'pronto', 'saiu_entrega', 'pronto_retirada'].includes(o.status)
                  );
                  const hasActiveOrders = activeOrders.length > 0;

                  return (
                    <>
                      {hasActiveOrders ? (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
                          <h4 className="font-black text-rose-800 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4 text-rose-600" />
                            Ação Bloqueada
                          </h4>
                          <p className="text-[11px] text-rose-700 leading-relaxed">
                            Este estabelecimento possui <strong className="font-bold">{activeOrders.length} pedido(s) ativo(s)</strong> em andamento. Você precisa concluir ou cancelar todos os pedidos ativos antes de desativar ou arquivar a loja.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-[#756B66] uppercase">Motivo da Alteração *</label>
                          <textarea
                            required
                            rows={3}
                            placeholder={statusUpdateTarget.status === 'inactive' 
                              ? "Descreva o motivo da desativação (Ex: Pausa longa de férias, encerramento de contrato, etc.)" 
                              : "Descreva o motivo do arquivamento para fins históricos..."
                            }
                            value={statusChangeReason}
                            onChange={(e) => setStatusChangeReason(e.target.value)}
                            className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold placeholder:text-gray-400"
                          />
                        </div>
                      )}

                      <div className="flex justify-end gap-3 pt-4 border-t border-[#EADFD8]">
                        <button
                          type="button"
                          onClick={() => setStatusUpdateTarget(null)}
                          className="px-4 py-2 border border-[#EADFD8] rounded-xl text-gray-500 hover:bg-[#F7F4EF] font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={hasActiveOrders || !statusChangeReason.trim()}
                          onClick={async () => {
                            await handleUpdateStoreStatus(statusUpdateTarget.id, statusUpdateTarget.status, statusChangeReason);
                            setStatusUpdateTarget(null);
                          }}
                          className={`px-5 py-2 rounded-xl text-white font-bold flex items-center gap-2 ${
                            hasActiveOrders || !statusChangeReason.trim()
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          Confirmar {statusUpdateTarget.status === 'inactive' ? 'Desativação' : 'Arquivamento'}
                        </button>
                      </div>
                    </>
                  );
                })()}

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
                      onChange={(e) => {
                        const val = e.target.value;
                        setStoreCategory(val);
                        setStoreCategoryIds(prev => {
                          if (!prev.includes(val)) {
                            return [...prev, val];
                          }
                          return prev;
                        });
                      }}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    >
                      {ESTABLISHMENT_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Categorias Públicas do Cardápio (Exibição na Home)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4 rounded-xl border border-[#EADFD8] bg-[#FAF8F6] max-h-[250px] overflow-y-auto">
                      {PUBLIC_ESTABLISHMENT_CATEGORIES.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2.5 text-xs font-bold text-[#756B66] cursor-pointer hover:text-[#201A17] hover:bg-[#E94F2F]/5 p-2 rounded-lg transition-all w-full select-none">
                          <input
                            type="checkbox"
                            checked={storeCategoryIds.includes(cat.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setStoreCategoryIds(prev => [...prev, cat.id]);
                              } else {
                                setStoreCategoryIds(prev => prev.filter(id => id !== cat.id));
                              }
                            }}
                            className="rounded text-[#E94F2F] focus:ring-[#E94F2F]/50 h-4 w-4 shrink-0"
                          />
                          <span className="truncate whitespace-nowrap">{cat.icon} {cat.label}</span>
                        </label>
                      ))}
                    </div>
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
                      value={storeLegalContactName}
                      onChange={(e) => setStoreLegalContactName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Telefone de Contato *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (19) 98124-5678"
                      value={storeLegalContactPhone}
                      onChange={(e) => setStoreLegalContactPhone(e.target.value)}
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
                      value={storeLegalContactEmail}
                      onChange={(e) => setStoreLegalContactEmail(e.target.value)}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>

                <div className="border-t border-[#EADFD8] pt-4 space-y-4">
                  <h4 className="font-extrabold text-sm text-[#201A17] tracking-tight">Identidade Visual & Destaque</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">URL do Logotipo</label>
                      <input
                        type="url"
                        placeholder="Ex: https://dominio.com/logo.png"
                        value={storeLogoUrl}
                        onChange={(e) => setStoreLogoUrl(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                      />
                      <div className="mt-2">
                        <EstablishmentImage 
                          src={storeLogoUrl} 
                          alt={storeName} 
                          fallbackType="logo" 
                          className="w-16 h-16 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">URL da Imagem de Capa</label>
                      <input
                        type="url"
                        placeholder="Ex: https://dominio.com/capa.jpg"
                        value={storeCoverImageUrl}
                        onChange={(e) => setStoreCoverImageUrl(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Parceiro UaiPertim (Destaque)?</label>
                      <select
                        value={storeIsFeaturedPartner ? 'true' : 'false'}
                        onChange={(e) => setStoreIsFeaturedPartner(e.target.value === 'true')}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                      >
                        <option value="false">Não, estabelecimento padrão</option>
                        <option value="true">Sim, destacar como Parceiro</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Ordem de Exibição do Destaque</label>
                      <input
                        type="number"
                        min="0"
                        value={storeFeaturedOrder}
                        onChange={(e) => setStoreFeaturedOrder(parseInt(e.target.value) || 0)}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                        disabled={!storeIsFeaturedPartner}
                      />
                    </div>
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

      {/* -------------------- VIEW ESTABLISHMENT DETAILS MODAL -------------------- */}
      <AnimatePresence>
        {viewingStore && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="view-store-details-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <div>
                  <span className="text-[9px] font-black uppercase text-[#E94F2F] tracking-wider">Painel Administrativo</span>
                  <h3 className="font-extrabold text-base text-[#201A17]">{viewingStore.name}</h3>
                </div>
                <button onClick={() => setViewingStore(null)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#201A17]">
                {/* Banner & Brand Info */}
                <div className="relative h-32 rounded-2xl overflow-hidden bg-gray-100 border border-[#EADFD8]">
                  <EstablishmentImage src={resolveEstablishmentCover(viewingStore)} alt={viewingStore.name} fallbackType="cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white rounded-xl p-1 shadow-md border border-[#EADFD8]">
                        <EstablishmentImage src={resolveEstablishmentLogo(viewingStore)} alt="logo" fallbackType="logo" className="w-full h-full object-contain rounded-lg" />
                      </div>
                      <div className="text-white">
                        <h4 className="font-extrabold text-sm leading-tight">{viewingStore.name}</h4>
                        <p className="text-[10px] text-white/80">{getCategoryLabel(viewingStore.category || viewingStore.categoryId)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid Info sections */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* General / Business details */}
                  <div className="space-y-4 bg-[#F7F4EF]/30 p-4 rounded-2xl border border-[#EADFD8]/60">
                    <h4 className="font-black text-[#756B66] uppercase text-[9px] tracking-wider flex items-center gap-1.5 border-b border-[#EADFD8] pb-1">
                      <Building2 className="w-3.5 h-3.5" />
                      Dados Jurídicos & Comerciais
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Razão Social</p>
                        <p className="font-extrabold text-xs">{viewingStore.companyName || 'Não Informado'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">CNPJ / Documento</p>
                        <p className="font-extrabold text-xs">{viewingStore.document || 'Não Informado'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">ID Administrativo (Slug)</p>
                        <p className="font-mono text-[10px] font-bold text-gray-500">{viewingStore.id}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Avaliação Média</p>
                        <p className="font-extrabold text-xs text-amber-600">★ {viewingStore.rating || '5.0'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Proprietor & Contact details */}
                  <div className="space-y-4 bg-[#F7F4EF]/30 p-4 rounded-2xl border border-[#EADFD8]/60">
                    <h4 className="font-black text-[#756B66] uppercase text-[9px] tracking-wider flex items-center gap-1.5 border-b border-[#EADFD8] pb-1">
                      <User className="w-3.5 h-3.5" />
                      Proprietário / Contato
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Responsável Legal</p>
                        <p className="font-extrabold text-xs">{viewingStore.owner || 'Não Vinculado'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Telefone de Contato</p>
                        <p className="font-extrabold text-xs">{viewingStore.phone || 'Não Informado'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">E-mail Comercial</p>
                        <p className="font-extrabold text-xs break-all">{viewingStore.email || 'Não Informado'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">UID Proprietário Vinculado</p>
                        <p className="font-mono text-[9px] text-[#756B66] truncate">{viewingStore.ownerUid || 'Nenhum proprietário de fato vinculado'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Logistics Settings */}
                  <div className="space-y-4 bg-[#F7F4EF]/30 p-4 rounded-2xl border border-[#EADFD8]/60">
                    <h4 className="font-black text-[#756B66] uppercase text-[9px] tracking-wider flex items-center gap-1.5 border-b border-[#EADFD8] pb-1">
                      <ShoppingCart className="w-3.5 h-3.5" />
                      Logística & Operações
                    </h4>
                    <div className="space-y-2 text-xs font-semibold">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-[#756B66] font-semibold uppercase">Taxa Entrega</p>
                          <p className="font-extrabold">R$ {viewingStore.deliveryFee?.toFixed(2).replace('.', ',') || '0,00'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#756B66] font-semibold uppercase">Pedido Mínimo</p>
                          <p className="font-extrabold">R$ {viewingStore.minOrderValue?.toFixed(2).replace('.', ',') || '0,00'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-[#756B66] font-semibold uppercase">Entrega Própria</p>
                          <p className="font-extrabold">{viewingStore.entregaPropria !== false ? 'Sim' : 'Não'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#756B66] font-semibold uppercase">Atende Retirada</p>
                          <p className="font-extrabold">{viewingStore.atendeRetirada !== false ? 'Sim' : 'Não'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Bairros Atendidos</p>
                        <p className="font-bold text-[#756B66] text-[11px] leading-relaxed">
                          {viewingStore.bairrosAtendidos || 'Atendimento Geral'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Real Address Details */}
                  <div className="space-y-4 bg-[#F7F4EF]/30 p-4 rounded-2xl border border-[#EADFD8]/60">
                    <h4 className="font-black text-[#756B66] uppercase text-[9px] tracking-wider flex items-center gap-1.5 border-b border-[#EADFD8] pb-1">
                      <MapPin className="w-3.5 h-3.5" />
                      Localização Física
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Endereço Comercial</p>
                        <p className="font-bold text-xs">
                          {typeof viewingStore.address === 'object' && viewingStore.address 
                            ? (viewingStore.address as any).street 
                            : (viewingStore.address || 'Não Informado')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#756B66] font-semibold uppercase">Bairro</p>
                        <p className="font-extrabold text-xs">{viewingStore.bairro || 'Não Informado'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-[#756B66] font-semibold uppercase">CEP</p>
                          <p className="font-bold text-xs">{viewingStore.cep || 'Não Informado'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#756B66] font-semibold uppercase">Cidade / Estado</p>
                          <p className="font-extrabold text-xs">{viewingStore.cityName || viewingStore.city} - {viewingStore.state || 'MG'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-[#EADFD8]">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStore(viewingStore);
                      setViewingStore(null);
                    }}
                    className="flex-1 bg-white hover:bg-[#F7F4EF] text-[#201A17] border border-[#EADFD8] py-3 rounded-xl font-bold flex items-center justify-center gap-1.5"
                  >
                    <Edit className="w-4 h-4 text-blue-500" />
                    <span>Editar Dados Gerais</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingStore(null)}
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold shadow-sm"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- EDIT ESTABLISHMENT DETAILS MODAL -------------------- */}
      <AnimatePresence>
        {editingStore && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="edit-store-details-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex flex-col gap-3 bg-[#F7F4EF]">
                <div className="flex justify-between items-center">
                  <h3 className="font-extrabold text-lg text-[#201A17]">Editar Estabelecimento</h3>
                  <button onClick={() => { setEditingStore(null); setEditModalTab('geral'); }} className="text-gray-500 hover:text-red-500 transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                {/* Tabs inside Admin Edit Modal */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditModalTab('geral')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${editModalTab === 'geral' ? 'bg-[#201A17] text-[#FFBE5C]' : 'bg-white text-[#756B66] hover:bg-gray-100 border border-[#EADFD8]'}`}
                  >
                    Dados Gerais
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModalTab('entregas')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${editModalTab === 'entregas' ? 'bg-[#201A17] text-[#FFBE5C]' : 'bg-white text-[#756B66] hover:bg-gray-100 border border-[#EADFD8]'}`}
                  >
                    Entregas e taxas
                  </button>
                </div>
              </div>

              {editModalTab === 'geral' && (
                <form onSubmit={handleEditMerchantSubmit} className="p-6 overflow-y-auto space-y-4 text-xs font-semibold text-[#201A17]">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Nome Comercial *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Pizzaria Carioca"
                      value={editStoreName}
                      onChange={(e) => setEditStoreName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Categoria Principal *</label>
                    <select
                      value={editStoreCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditStoreCategory(val);
                        setEditStoreCategoryIds(prev => {
                          if (!prev.includes(val)) {
                            return [...prev, val];
                          }
                          return prev;
                        });
                      }}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    >
                      {ESTABLISHMENT_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Categorias Públicas do Cardápio (Exibição na Home)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4 rounded-xl border border-[#EADFD8] bg-[#FAF8F6] max-h-[250px] overflow-y-auto">
                      {PUBLIC_ESTABLISHMENT_CATEGORIES.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2.5 text-xs font-bold text-[#756B66] cursor-pointer hover:text-[#201A17] hover:bg-[#E94F2F]/5 p-2 rounded-lg transition-all w-full select-none">
                          <input
                            type="checkbox"
                            checked={editStoreCategoryIds.includes(cat.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditStoreCategoryIds(prev => [...prev, cat.id]);
                              } else {
                                setEditStoreCategoryIds(prev => prev.filter(id => id !== cat.id));
                              }
                            }}
                            className="rounded text-[#E94F2F] focus:ring-[#E94F2F]/50 h-4 w-4 shrink-0"
                          />
                          <span className="truncate whitespace-nowrap">{cat.icon} {cat.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Razão Social *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Silva & Santos LTDA"
                      value={editStoreCompanyName}
                      onChange={(e) => setEditStoreCompanyName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">CNPJ ou CPF Comercial *</label>
                    <input
                      type="text"
                      required
                      placeholder="00.000.000/0000-00"
                      value={editStoreDocument}
                      onChange={(e) => setEditStoreDocument(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Responsável / Proprietário *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João da Silva"
                      value={editStoreLegalContactName}
                      onChange={(e) => setEditStoreLegalContactName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Telefone de Contato *</label>
                    <input
                      type="text"
                      required
                      placeholder="(35) 99999-9999"
                      value={editStoreLegalContactPhone}
                      onChange={(e) => setEditStoreLegalContactPhone(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">E-mail Comercial</label>
                    <input
                      type="email"
                      placeholder="contato@loja.com"
                      value={editStoreLegalContactEmail}
                      onChange={(e) => setEditStoreLegalContactEmail(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#756B66] uppercase">Endereço Comercial (Rua, Número, Comp)</label>
                  <input
                    type="text"
                    placeholder="Av. Getúlio Vargas, 120"
                    value={editStoreAddress}
                    onChange={(e) => setEditStoreAddress(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Bairro</label>
                    <input
                      type="text"
                      placeholder="Centro"
                      value={editStoreBairro}
                      onChange={(e) => setEditStoreBairro(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">CEP</label>
                    <input
                      type="text"
                      placeholder="37924-000"
                      value={editStoreCep}
                      onChange={(e) => setEditStoreCep(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Cidade de Atuação *</label>
                    <select
                      value={editStoreCityId}
                      onChange={(e) => setEditStoreCityId(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    >
                      {cities.map(c => (
                        <option key={c.id} value={c.id}>{c.name} - {c.state}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#EADFD8] pt-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Taxa de Entrega Padrão (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="6.00"
                      value={editStoreDeliveryFee}
                      onChange={(e) => setEditStoreDeliveryFee(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase">Valor Mínimo do Pedido (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="25.00"
                      value={editStoreMinOrderValue}
                      onChange={(e) => setEditStoreMinOrderValue(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                    />
                  </div>


                </div>

                <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/60 space-y-3">
                  <h4 className="font-black text-[#756B66] uppercase text-[9px] tracking-wider">Logística e Fulfillment</h4>
                  
                  <div className="flex gap-6 text-[11px] font-bold">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editStoreEntregaPropria}
                        onChange={(e) => setEditStoreEntregaPropria(e.target.checked)}
                        className="rounded border-[#EADFD8] text-[#E94F2F] focus:ring-[#E94F2F]"
                      />
                      <span>Oferece Entrega em Domicílio</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editStoreAtendeRetirada}
                        onChange={(e) => setEditStoreAtendeRetirada(e.target.checked)}
                        className="rounded border-[#EADFD8] text-[#E94F2F] focus:ring-[#E94F2F]"
                      />
                      <span>Permite Retirada Balcão</span>
                    </label>
                  </div>

                  {editStoreEntregaPropria && (
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-[#756B66] uppercase">Bairros Atendidos (separados por vírgula)</label>
                      <input
                        type="text"
                        placeholder="Centro, Bairro Novo, Bosque, Vista Alegre"
                        value={editStoreBairrosAtendidos}
                        onChange={(e) => setEditStoreBairrosAtendidos(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                      />
                    </div>
                  )}
                </div>

                <div className="border-t border-[#EADFD8] pt-4 space-y-4">
                  <h4 className="font-extrabold text-sm text-[#201A17] tracking-tight">Identidade Visual & Destaque</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">URL do Logotipo</label>
                      <input
                        type="url"
                        placeholder="Ex: https://dominio.com/logo.png"
                        value={formData.logoUrl ?? ""}
                        onChange={(e) => setFormData(previous => ({
                          ...previous,
                          logoUrl: e.target.value
                        }))}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                      />
                      <div className="mt-2">
                        <EstablishmentImage 
                          src={formData.logoUrl} 
                          alt={editStoreName} 
                          fallbackType="logo" 
                          className="w-16 h-16 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">URL da Imagem de Capa</label>
                      <input
                        type="url"
                        placeholder="Ex: https://dominio.com/capa.jpg"
                        value={editStoreCoverImageUrl}
                        onChange={(e) => setEditStoreCoverImageUrl(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Parceiro UaiPertim (Destaque)?</label>
                      <select
                        value={editStoreIsFeaturedPartner ? 'true' : 'false'}
                        onChange={(e) => setEditStoreIsFeaturedPartner(e.target.value === 'true')}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                      >
                        <option value="false">Não, estabelecimento padrão</option>
                        <option value="true">Sim, destacar como Parceiro</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#756B66] uppercase">Ordem de Exibição do Destaque</label>
                      <input
                        type="number"
                        min="0"
                        value={editStoreFeaturedOrder}
                        onChange={(e) => setEditStoreFeaturedOrder(parseInt(e.target.value) || 0)}
                        className="w-full p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                        disabled={!editStoreIsFeaturedPartner}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-[#EADFD8]">
                  <button
                    type="button"
                    onClick={() => { setEditingStore(null); setEditModalTab('geral'); }}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingStore}
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold shadow-xs flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingStore ? 'Gravando Alterações...' : 'Salvar Alterações'}
                  </button>
                </div>

              </form>
            )}

            {editModalTab === 'entregas' && (
              <div className="p-6 overflow-y-auto space-y-6 text-xs font-semibold text-[#201A17] flex-1">
                {/* 1. CONFIGURAÇÃO PADRÃO DE ENTREGA */}
                <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-200/60 space-y-4">
                  <div>
                    <h4 className="font-extrabold text-sm text-[#201A17]">1. Configuração Padrão de Entrega</h4>
                    <p className="text-[11px] text-[#756B66] font-medium">Defina os valores padrão que serão aplicados para toda a cidade do estabelecimento.</p>
                  </div>

                  <form onSubmit={handleSaveDefaultSettings} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 flex items-center gap-2 pb-1">
                      <input
                        type="checkbox"
                        id="default-delivery-enabled"
                        checked={defaultEnabled}
                        onChange={(e) => setDefaultEnabled(e.target.checked)}
                        className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                      />
                      <label htmlFor="default-delivery-enabled" className="font-extrabold text-[#201A17] cursor-pointer">
                        Ativar serviço de entrega para este estabelecimento
                      </label>
                    </div>

                    <div className="sm:col-span-2 p-4 bg-white/80 rounded-xl border border-[#EADFD8] space-y-3">
                      <div>
                        <label className="text-[10px] font-black text-[#756B66] uppercase block">Modo de Cobertura de Entrega</label>
                        <p className="text-[10px] text-[#756B66] font-medium mt-0.5">Determine como a taxa padrão se comporta em bairros não listados nas exceções.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${defaultCoverageMode === 'entire_city' ? 'border-[#E94F2F] bg-[#E94F2F]/5 text-[#E94F2F]' : 'border-[#EADFD8] bg-white hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name="coverage-mode"
                            checked={defaultCoverageMode === 'entire_city'}
                            onChange={() => setDefaultCoverageMode('entire_city')}
                            className="mt-1 accent-[#E94F2F] cursor-pointer"
                          />
                          <div>
                            <span className="font-extrabold text-xs block">Toda a Cidade (Recomendado)</span>
                            <span className="text-[10px] opacity-80 leading-relaxed font-medium block mt-0.5">
                              A entrega atende automaticamente qualquer bairro da cidade usando os valores padrão. As áreas cadastradas funcionam apenas como exceções (ex: bairros mais distantes).
                            </span>
                          </div>
                        </label>

                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${defaultCoverageMode === 'listed_zones_only' ? 'border-[#E94F2F] bg-[#E94F2F]/5 text-[#E94F2F]' : 'border-[#EADFD8] bg-white hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name="coverage-mode"
                            checked={defaultCoverageMode === 'listed_zones_only'}
                            onChange={() => setDefaultCoverageMode('listed_zones_only')}
                            className="mt-1 accent-[#E94F2F] cursor-pointer"
                          />
                          <div>
                            <span className="font-extrabold text-xs block">Apenas Áreas Listadas</span>
                            <span className="text-[10px] opacity-80 leading-relaxed font-medium block mt-0.5">
                              A entrega é restrita estritamente aos bairros cadastrados na seção de exceções abaixo. Clientes em bairros não cadastrados não conseguirão fazer pedidos.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase block">Cidade Atendida</label>
                      <input
                        type="text"
                        disabled
                        value={defaultCityName}
                        className="w-full p-2.5 bg-gray-100 rounded-xl border border-[#EADFD8] text-gray-500 cursor-not-allowed outline-none font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase block">Taxa de Entrega Padrão (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        disabled={!defaultEnabled}
                        value={defaultDeliveryFee}
                        onChange={(e) => setDefaultDeliveryFee(e.target.value)}
                        className="w-full p-2.5 bg-white rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase block">Pedido Mínimo Padrão (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        disabled={!defaultEnabled}
                        value={defaultMinOrder}
                        onChange={(e) => setDefaultMinOrder(e.target.value)}
                        className="w-full p-2.5 bg-white rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#756B66] uppercase block">Tempo Adicional Padrão (Minutos)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        disabled={!defaultEnabled}
                        value={defaultAdditionalMinutes}
                        onChange={(e) => setDefaultAdditionalMinutes(e.target.value)}
                        className="w-full p-2.5 bg-white rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2 flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSavingDefaults}
                        className="bg-[#201A17] hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        {isSavingDefaults ? 'Salvando...' : 'Salvar Configuração Padrão'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="flex justify-between items-center border-b border-[#F7F4EF] pb-3 pt-4">
                  <div>
                    <h4 className="font-extrabold text-sm text-[#201A17]">
                      {defaultCoverageMode === 'listed_zones_only' ? '2. Áreas de Entrega Atendidas' : '2. Exceções por Bairro (Opcional)'}
                    </h4>
                    <p className="text-[11px] text-[#756B66] font-medium">
                      {defaultCoverageMode === 'listed_zones_only'
                        ? 'Cadastre e configure todos os bairros onde o estabelecimento realiza entregas (clientes de outros bairros não serão atendidos).'
                        : 'Configure regras específicas apenas para os bairros que possuem taxas ou prazos diferentes do padrão.'
                      }
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCreateAdminZoneModal}
                    className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nova Área</span>
                  </button>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Buscar bairro..."
                      value={adminZoneSearchQuery}
                      onChange={(e) => setAdminZoneSearchQuery(e.target.value)}
                      className="w-full p-2.5 pl-8 rounded-xl border border-[#EADFD8] outline-none text-xs bg-white font-bold"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAdminZoneStatusFilter('all')}
                      className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${adminZoneStatusFilter === 'all' ? 'bg-[#201A17] text-white' : 'bg-gray-100 text-[#756B66] border border-[#EADFD8]'}`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminZoneStatusFilter('active')}
                      className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${adminZoneStatusFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-[#756B66] border border-[#EADFD8]'}`}
                    >
                      Ativos
                    </button>
                  </div>
                </div>

                {/* Zones List */}
                {adminZonesLoading ? (
                  <div className="py-8 text-center font-bold text-gray-500 flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-[#E94F2F] animate-spin" />
                    <span>Carregando áreas...</span>
                  </div>
                ) : filteredAdminDeliveryZones.length === 0 ? (
                  <div className="py-8 bg-gray-50 rounded-2xl border border-dashed border-[#EADFD8] text-center text-gray-400 font-medium">
                    {defaultCoverageMode === 'listed_zones_only'
                      ? 'Nenhuma área cadastrada. Como o estabelecimento está configurado para atender apenas áreas listadas, o serviço de entrega ficará indisponível para todos os clientes até que você adicione uma área.'
                      : 'Nenhuma exceção cadastrada. Todos os bairros desta cidade usarão a configuração padrão acima.'
                    }
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                    {filteredAdminDeliveryZones.map((zone) => {
                      const finalFee = zone.deliveryFee !== null && zone.deliveryFee !== undefined ? zone.deliveryFee : Number(defaultDeliveryFee || 0);
                      const additionalMinutes = zone.additionalEstimatedMinutes !== null && zone.additionalEstimatedMinutes !== undefined ? zone.additionalEstimatedMinutes : Number(defaultAdditionalMinutes || 0);
                      const finalMinOrder = zone.minimumOrderValue !== null && zone.minimumOrderValue !== undefined ? zone.minimumOrderValue : Number(defaultMinOrder || 0);
                      const totalEstimatedMinutes = (editingStore.baseEstimatedMinutes || 30) + additionalMinutes;

                      return (
                        <div key={zone.neighborhoodId} className="p-3 bg-gray-50 rounded-xl border border-[#EADFD8] flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="font-extrabold text-xs">{zone.neighborhoodName}</p>
                            <p className="text-[10px] text-gray-500 font-medium">
                              Taxa: {zone.deliveryFee !== null && zone.deliveryFee !== undefined ? `R$ ${zone.deliveryFee.toFixed(2).replace('.', ',')}` : `Padrão (R$ ${Number(defaultDeliveryFee || 0).toFixed(2).replace('.', ',')})`} • {totalEstimatedMinutes} min
                            </p>
                            <p className="text-[9px] text-rose-600 font-bold">
                              Pedido Mín: {zone.minimumOrderValue !== null && zone.minimumOrderValue !== undefined ? `R$ ${zone.minimumOrderValue.toFixed(2).replace('.', ',')}` : `Padrão (R$ ${Number(defaultMinOrder || 0).toFixed(2).replace('.', ',')})`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleAdminZoneStatus(zone)}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${zone.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}
                            >
                              {zone.active ? 'Ativo' : 'Inativo'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditAdminZoneModal(zone)}
                              className="p-1 hover:bg-gray-200 rounded-lg text-[#756B66]"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-[#EADFD8]">
                  <button
                    type="button"
                    onClick={() => { setEditingStore(null); setEditModalTab('geral'); }}
                    className="bg-[#201A17] hover:bg-black text-white px-5 py-2.5 rounded-xl font-bold text-xs"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* ADMIN SUB-MODAL FOR DELIVERY ZONE CREATE/EDIT */}
    <AnimatePresence>
      {isAdminZoneModalOpen && editingStore && (
        <div className="fixed inset-0 bg-[#201A17]/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl border border-[#EADFD8] p-6 max-w-md w-full shadow-2xl space-y-4 text-[#201A17]"
          >
            <div className="flex justify-between items-center pb-2 border-b border-[#F7F4EF]">
              <h4 className="font-extrabold text-base">
                {adminEditingZone ? `Editar Área: ${adminEditingZone.neighborhoodName}` : 'Adicionar Nova Área de Entrega'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setIsAdminZoneModalOpen(false);
                  setAdminEditingZone(null);
                }}
                className="p-1.5 hover:bg-[#F7F4EF] rounded-xl text-[#756B66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdminZoneSubmit} className="space-y-4 text-xs font-bold">
              {(() => {
                const storeCityId = editingStore.cityId || 'sao-joao-batista-do-gloria-mg';
                const cityNeighborhoods = neighborhoods.filter(n => n.cityId === storeCityId);
                const availableNeighborhoods = cityNeighborhoods.filter(n => 
                  !adminDeliveryZones.some(dz => dz.neighborhoodId === n.id)
                );
                
                const hasNoNeighborhoods = cityNeighborhoods.length === 0;

                return (
                  <>
                    {/* Bairro Selector/Input */}
                    {adminEditingZone ? (
                      <div className="space-y-1">
                        <label className="text-[#756B66] block">Bairro</label>
                        <input
                          type="text"
                          disabled
                          value={adminEditingZone.neighborhoodName}
                          className="w-full p-2.5 bg-gray-100 rounded-xl border border-[#EADFD8] text-gray-500 cursor-not-allowed outline-none font-bold"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {hasNoNeighborhoods || adminZoneIsManualNeighborhood ? (
                          <>
                            <div className="flex justify-between items-center">
                              <label className="text-[#756B66] block">Nome do Bairro</label>
                              {!hasNoNeighborhoods && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdminZoneIsManualNeighborhood(false);
                                    setAdminZoneNeighborhoodId('');
                                    setAdminZoneNeighborhoodName('');
                                  }}
                                  className="text-[#E94F2F] hover:underline text-[10px] font-black uppercase"
                                >
                                  Selecionar da lista
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              required
                              placeholder="Ex: Cohab, Alto da Serra..."
                              value={adminZoneNeighborhoodName}
                              onChange={(e) => {
                                setAdminZoneNeighborhoodName(e.target.value);
                                setAdminZoneNeighborhoodId('');
                              }}
                              className="w-full p-2.5 bg-white rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 text-xs font-bold"
                            />
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between items-center">
                              <label className="text-[#756B66] block">Selecione o Bairro</label>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdminZoneIsManualNeighborhood(true);
                                  setAdminZoneNeighborhoodId('');
                                  setAdminZoneNeighborhoodName('');
                                }}
                                className="text-[#E94F2F] hover:underline text-[10px] font-black uppercase"
                              >
                                Digitar nome livre
                              </button>
                            </div>
                            <select
                              required
                              value={adminZoneNeighborhoodId}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const found = cityNeighborhoods.find(n => n.id === selectedId);
                                if (found) {
                                  setAdminZoneNeighborhoodId(found.id);
                                  setAdminZoneNeighborhoodName(found.name);
                                }
                              }}
                              className="w-full p-2.5 bg-white rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 text-xs font-bold"
                            >
                              <option value="">Selecione um Bairro...</option>
                              {availableNeighborhoods.map(n => (
                                <option key={n.id} value={n.id}>{n.name}</option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    )}

                    {/* Taxa de entrega */}
                    <div className="space-y-1">
                      <label className="block text-[#756B66]">Taxa de Entrega (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Deixar em branco para usar padrão: R$ ${Number(defaultDeliveryFee || 0).toFixed(2).replace('.', ',')}`}
                        value={adminZoneFee}
                        onChange={(e) => setAdminZoneFee(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-white text-[#201A17] outline-none focus:border-[#E94F2F]/50 font-bold"
                      />
                    </div>

                    {/* Pedido Mínimo */}
                    <div className="space-y-1">
                      <label className="block text-[#756B66]">Pedido Mínimo para Entrega (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Deixar em branco para usar padrão: R$ ${Number(defaultMinOrder || 0).toFixed(2).replace('.', ',')}`}
                        value={adminZoneMinOrder}
                        onChange={(e) => setAdminZoneMinOrder(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-white text-[#201A17] outline-none focus:border-[#E94F2F]/50 font-bold"
                      />
                    </div>

                    {/* Tempo adicional */}
                    <div className="space-y-1">
                      <label className="block text-[#756B66]">Tempo Estimado de Entrega (Minutos)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={`Deixar em branco para usar padrão: ${Number(defaultAdditionalMinutes || 0)} min`}
                        value={adminZoneAdditionalMinutes}
                        onChange={(e) => setAdminZoneAdditionalMinutes(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-white text-[#201A17] outline-none focus:border-[#E94F2F]/50 font-bold"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="admin-zone-active-checkbox"
                        checked={adminZoneActive}
                        onChange={(e) => setAdminZoneActive(e.target.checked)}
                        className="w-4 h-4 accent-[#E94F2F] cursor-pointer"
                      />
                      <label htmlFor="admin-zone-active-checkbox" className="select-none cursor-pointer">Ativo</label>
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-[#F7F4EF]">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminZoneModalOpen(false);
                          setAdminEditingZone(null);
                        }}
                        className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-[#756B66]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 rounded-xl font-bold text-white transition-all bg-[#E94F2F] hover:bg-[#BD351C]"
                      >
                        Salvar Área
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

      {/* -------------------- LINK OWNER MODAL -------------------- */}
      <AnimatePresence>
        {linkingUserStore && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="link-owner-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#FCFBF9] rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <div>
                  <h3 className="font-extrabold text-base text-[#201A17]">Gestão do Proprietário</h3>
                  <p className="text-[10px] text-[#756B66] font-bold uppercase tracking-wider">{linkingUserStore.name}</p>
                </div>
                <button onClick={handleCloseOwnerModal} className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-white/55">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 text-xs text-[#201A17]">
                {/* 1. SUCCESS / INVITATION LINK DISPLAY */}
                {ownerSuccessInviteResult ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 space-y-2">
                      <div className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                        <p className="font-extrabold text-sm">Acesso Gerado com Sucesso!</p>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        A conta para <strong>{ownerSuccessInviteResult.name}</strong> ({ownerSuccessInviteResult.email}) foi vinculada. O status inicial é <strong>"Convidado"</strong>.
                      </p>
                    </div>

                    <div className="space-y-2 bg-[#F7F4EF] p-4 rounded-2xl border border-[#EADFD8]">
                      <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                        <Lock className="w-3.5 h-3.5" />
                        <p className="text-[10px] uppercase tracking-wider">Link para Definição de Senha</p>
                      </div>
                      <p className="text-[11px] text-[#756B66] leading-normal">
                        Como o ambiente pode não disparar e-mails reais de forma automatizada, copie o link seguro abaixo e envie diretamente ao proprietário para que ele defina sua senha de acesso inicial:
                      </p>
                      
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={ownerSuccessInviteResult.passwordResetLink}
                          className="flex-1 p-2 bg-white rounded-lg border border-[#EADFD8] font-mono text-[10px] text-gray-600 outline-none select-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(ownerSuccessInviteResult.passwordResetLink);
                            showToast('Link de convite copiado!', 'success');
                          }}
                          className="bg-[#E94F2F] hover:bg-[#BD351C] text-white p-2.5 rounded-lg flex items-center justify-center transition-colors"
                          title="Copiar Link"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCloseOwnerModal}
                      className="w-full bg-[#EADFD8] hover:bg-[#DFD3C9] text-[#201A17] py-3 rounded-xl font-bold transition-colors mt-2"
                    >
                      Concluir e Fechar
                    </button>
                  </div>
                ) : ownerConfirmationPrompt ? (
                  /* 2. CONFIRM CUSTOMER CONVERSION */
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <p className="font-extrabold text-sm">Conversão de Perfil Requerida</p>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {ownerConfirmationPrompt.message}
                      </p>
                    </div>

                    <div className="p-4 bg-white border border-[#EADFD8] rounded-2xl space-y-2">
                      <p className="text-[10px] text-[#756B66] uppercase">Usuário Identificado</p>
                      <p className="font-bold text-sm">{ownerConfirmationPrompt.user.name}</p>
                      <p className="font-mono text-xs text-[#756B66]">{ownerConfirmationPrompt.user.email}</p>
                      <p className="text-[10px] text-gray-500 font-bold">Perfil atual: Cliente (customer)</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setOwnerConfirmationPrompt(null)}
                        className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLinkOwnerSubmit(null as any, ownerConfirmationPrompt.isReplace, true)}
                        className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold transition-colors shadow-xs"
                      >
                        Sim, Conceder Acesso
                      </button>
                    </div>
                  </div>
                ) : linkingUserStore.ownerUid ? (
                  /* 3. CURRENT OWNER VIEW AND MANAGEMENT */
                  <div className="space-y-5">
                    <div className="p-4 bg-white rounded-2xl border border-[#EADFD8] space-y-3 shadow-xs">
                      <div className="flex justify-between items-start border-b border-[#F7F4EF] pb-2">
                        <div>
                          <p className="text-[9px] text-[#756B66] uppercase font-bold tracking-wider">Proprietário Vinculado</p>
                          <p className="font-black text-[#201A17] text-sm mt-0.5">{linkingUserStore.ownerName || linkingUserStore.owner || 'Não informado'}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[9px] font-black uppercase tracking-wide border border-emerald-200">
                          Vinculado
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-[11px] font-semibold text-[#544B45]">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-[#756B66]" />
                          <span className="truncate">{linkingUserStore.ownerEmail || linkingUserStore.email || 'E-mail ausente'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-[#756B66]" />
                          <span>{linkingUserStore.ownerPhone || linkingUserStore.phone || 'Telefone ausente'}</span>
                        </div>
                        <div className="flex items-center gap-2 pt-1 border-t border-[#F7F4EF] font-mono text-[9px] text-gray-400">
                          <Database className="w-3.5 h-3.5" />
                          <span className="truncate">UID: {linkingUserStore.ownerUid}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#F7F4EF]/55 p-3 rounded-2xl border border-[#EADFD8]/60 space-y-2">
                      <p className="text-[10px] font-bold text-[#756B66] uppercase tracking-wider">Ações Administrativas</p>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleResendInvite}
                          disabled={isSubmittingStore}
                          className="p-2.5 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${isSubmittingStore ? 'animate-spin' : ''}`} />
                          Gerar Novo Convite
                        </button>
                        <button
                          type="button"
                          onClick={handleUnlinkOwner}
                          disabled={isSubmittingStore}
                          className="p-2.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-800 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          Desvincular Proprietário
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[#EADFD8] pt-4 space-y-3">
                      <p className="text-[10px] text-[#756B66] uppercase font-bold tracking-wider">Substituir por Outro Responsável</p>
                      
                      {/* Tabs inside replacement view */}
                      <div className="bg-[#F7F4EF] p-1 rounded-xl border border-[#EADFD8] flex">
                        <button
                          type="button"
                          onClick={() => setOwnerModalTab('create')}
                          className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all ${ownerModalTab === 'create' ? 'bg-[#E94F2F] text-white shadow-xs' : 'text-[#756B66] hover:text-[#201A17]'}`}
                        >
                          Criar Novo Acesso
                        </button>
                        <button
                          type="button"
                          onClick={() => setOwnerModalTab('link_existing')}
                          className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all ${ownerModalTab === 'link_existing' ? 'bg-[#E94F2F] text-white shadow-xs' : 'text-[#756B66] hover:text-[#201A17]'}`}
                        >
                          Vincular Usuário Existente
                        </button>
                      </div>

                      {ownerModalTab === 'create' ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-[#756B66] uppercase">Nome do Novo Responsável *</label>
                            <input
                              type="text"
                              required
                              placeholder="Nome completo"
                              value={createOwnerName}
                              onChange={(e) => setCreateOwnerName(e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[#756B66] uppercase">E-mail *</label>
                              <input
                                type="email"
                                required
                                placeholder="exemplo@gmail.com"
                                value={createOwnerEmail}
                                onChange={(e) => setCreateOwnerEmail(e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[#756B66] uppercase">Telefone / WhatsApp</label>
                              <input
                                type="tel"
                                placeholder="(31) 99999-9999"
                                value={createOwnerPhone}
                                onChange={(e) => setCreateOwnerPhone(e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[#756B66] uppercase">Senha Inicial *</label>
                              <div className="relative">
                                <input
                                  type={showCreateOwnerPassword ? "text" : "password"}
                                  required
                                  placeholder="Mínimo 8 caracteres"
                                  value={createOwnerPassword}
                                  onChange={(e) => setCreateOwnerPassword(e.target.value)}
                                  className="w-full p-2.5 pr-10 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowCreateOwnerPassword(!showCreateOwnerPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#756B66] hover:text-[#201A17]"
                                >
                                  {showCreateOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[#756B66] uppercase">Confirmar Senha *</label>
                              <div className="relative">
                                <input
                                  type={showCreateOwnerConfirmPassword ? "text" : "password"}
                                  required
                                  placeholder="Mínimo 8 caracteres"
                                  value={createOwnerConfirmPassword}
                                  onChange={(e) => setCreateOwnerConfirmPassword(e.target.value)}
                                  className="w-full p-2.5 pr-10 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowCreateOwnerConfirmPassword(!showCreateOwnerConfirmPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#756B66] hover:text-[#201A17]"
                                >
                                  {showCreateOwnerConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                          <p className="text-[9px] text-[#756B66] leading-relaxed">
                            O administrador está criando a senha inicial deste acesso. Por segurança, não será possível visualizar a senha novamente após a criação.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-[#756B66] uppercase">Buscar por E-mail ou Nome</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Digite nome ou e-mail..."
                                value={searchOwnerQuery}
                                onChange={(e) => setSearchOwnerQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchOwners(searchOwnerQuery); }}}
                                className="flex-1 p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleSearchOwners(searchOwnerQuery)}
                                disabled={isSearchingOwners}
                                className="px-3 bg-[#E94F2F] hover:bg-[#BD351C] text-white rounded-xl font-bold flex items-center justify-center transition-colors"
                              >
                                {isSearchingOwners ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {searchOwnerResults.length > 0 ? (
                            <div className="max-h-36 overflow-y-auto border border-[#EADFD8] rounded-xl bg-white divide-y divide-[#F7F4EF]">
                              {searchOwnerResults.map(u => (
                                <button
                                  key={u.uid}
                                  type="button"
                                  onClick={() => setSelectedExistingOwner(u)}
                                  className={`w-full text-left p-2 text-[11px] transition-colors ${selectedExistingOwner?.uid === u.uid ? 'bg-amber-50/70 border-l-4 border-amber-500' : 'hover:bg-[#FCFBF9]'}`}
                                >
                                  <div className="font-bold text-[#201A17] flex justify-between">
                                    <span>{u.name || 'Sem Nome'}</span>
                                    <span className="px-1.5 py-0.2 bg-gray-100 rounded text-[9px] uppercase font-black text-gray-500">{u.role}</span>
                                  </div>
                                  <div className="text-[#756B66] font-mono text-[10px] mt-0.5">{maskEmail(u.email)}</div>
                                </button>
                              ))}
                            </div>
                          ) : searchOwnerQuery && !isSearchingOwners ? (
                            <p className="text-[#756B66] text-center py-2 italic">Nenhum usuário encontrado.</p>
                          ) : null}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleLinkOwnerSubmit(e, true, false)}
                        disabled={isSubmittingStore || (ownerModalTab === 'link_existing' && !selectedExistingOwner)}
                        className="w-full bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold transition-colors shadow-xs mt-2"
                      >
                        {isSubmittingStore ? 'Processando Substituição...' : 'Confirmar e Substituir Proprietário'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 4. CHOOSE ACCESSIBILITY FOR EMPTY OWNER LINKAGE */
                  <div className="space-y-4">
                    <div className="bg-[#F7F4EF] p-1 rounded-xl border border-[#EADFD8] flex">
                      <button
                        type="button"
                        onClick={() => setOwnerModalTab('create')}
                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${ownerModalTab === 'create' ? 'bg-[#E94F2F] text-white shadow-xs' : 'text-[#756B66] hover:text-[#201A17]'}`}
                      >
                        Criar Novo Acesso
                      </button>
                      <button
                        type="button"
                        onClick={() => setOwnerModalTab('link_existing')}
                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${ownerModalTab === 'link_existing' ? 'bg-[#E94F2F] text-white shadow-xs' : 'text-[#756B66] hover:text-[#201A17]'}`}
                      >
                        Vincular Usuário Existente
                      </button>
                    </div>

                    {ownerModalTab === 'create' ? (
                      <form onSubmit={(e) => handleLinkOwnerSubmit(e, false, false)} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-[#756B66] uppercase">Nome do Proprietário/Responsável *</label>
                          <input
                            type="text"
                            required
                            placeholder="Nome completo do parceiro"
                            value={createOwnerName}
                            onChange={(e) => setCreateOwnerName(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-[#756B66] uppercase">E-mail Comercial (Acesso) *</label>
                          <input
                            type="email"
                            required
                            placeholder="exemplo@gmail.com"
                            value={createOwnerEmail}
                            onChange={(e) => setCreateOwnerEmail(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-[#756B66] uppercase">WhatsApp / Telefone</label>
                          <input
                            type="tel"
                            placeholder="(31) 99999-9999"
                            value={createOwnerPhone}
                            onChange={(e) => setCreateOwnerPhone(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-[#756B66] uppercase">Senha Inicial *</label>
                            <div className="relative">
                              <input
                                type={showCreateOwnerPassword ? "text" : "password"}
                                required
                                placeholder="Mínimo 8 caracteres"
                                value={createOwnerPassword}
                                onChange={(e) => setCreateOwnerPassword(e.target.value)}
                                className="w-full p-2.5 pr-10 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCreateOwnerPassword(!showCreateOwnerPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#756B66] hover:text-[#201A17]"
                              >
                                {showCreateOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-[#756B66] uppercase">Confirmar Senha *</label>
                            <div className="relative">
                              <input
                                type={showCreateOwnerConfirmPassword ? "text" : "password"}
                                required
                                placeholder="Mínimo 8 caracteres"
                                value={createOwnerConfirmPassword}
                                onChange={(e) => setCreateOwnerConfirmPassword(e.target.value)}
                                className="w-full p-2.5 pr-10 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCreateOwnerConfirmPassword(!showCreateOwnerConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#756B66] hover:text-[#201A17]"
                              >
                                {showCreateOwnerConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] leading-relaxed space-y-1">
                          <p className="font-semibold text-amber-900">
                            O administrador está criando a senha inicial deste acesso. Por segurança, não será possível visualizar a senha novamente após a criação.
                          </p>
                          <p>
                            A senha será utilizada no primeiro acesso do responsável e poderá ser alterada posteriormente em Segurança.
                          </p>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button
                            type="button"
                            onClick={handleCloseOwnerModal}
                            className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingStore}
                            className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold transition-colors shadow-xs"
                          >
                            {isSubmittingStore ? 'Criando...' : 'Criar e Vincular'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-[#756B66] uppercase">Buscar por E-mail ou Nome</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Pesquise por nome ou e-mail..."
                              value={searchOwnerQuery}
                              onChange={(e) => setSearchOwnerQuery(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchOwners(searchOwnerQuery); }}}
                              className="flex-1 p-2.5 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => handleSearchOwners(searchOwnerQuery)}
                              disabled={isSearchingOwners}
                              className="px-3 bg-[#E94F2F] hover:bg-[#BD351C] text-white rounded-xl font-bold flex items-center justify-center transition-colors"
                            >
                              {isSearchingOwners ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {searchOwnerResults.length > 0 ? (
                          <div className="max-h-48 overflow-y-auto border border-[#EADFD8] rounded-xl bg-white divide-y divide-[#F7F4EF] shadow-xs">
                            {searchOwnerResults.map(u => (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => setSelectedExistingOwner(u)}
                                className={`w-full text-left p-2.5 text-[11px] transition-colors ${selectedExistingOwner?.uid === u.uid ? 'bg-amber-50/70 border-l-4 border-amber-500' : 'hover:bg-[#FCFBF9]'}`}
                              >
                                <div className="font-bold text-[#201A17] flex justify-between">
                                  <span>{u.name || 'Sem Nome'}</span>
                                  <span className="px-1.5 py-0.2 bg-gray-100 rounded text-[9px] uppercase font-black text-gray-500">{u.role}</span>
                                </div>
                                <div className="text-[#756B66] font-mono text-[10px] mt-0.5">{maskEmail(u.email)}</div>
                              </button>
                            ))}
                          </div>
                        ) : searchOwnerQuery && !isSearchingOwners ? (
                          <p className="text-[#756B66] text-center py-4 italic">Nenhum usuário encontrado para a busca.</p>
                        ) : (
                          <p className="text-gray-400 text-center py-4 italic">Digite um e-mail ou nome acima para pesquisar usuários.</p>
                        )}

                        <div className="flex gap-3 pt-2 border-t border-[#EADFD8] mt-4">
                          <button
                            type="button"
                            onClick={handleCloseOwnerModal}
                            className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleLinkOwnerSubmit(e, false, false)}
                            disabled={isSubmittingStore || !selectedExistingOwner}
                            className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold transition-colors shadow-xs"
                          >
                            {isSubmittingStore ? 'Vinculando...' : 'Vincular Selecionado'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
