import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Product, CartItem, Order, Establishment, SelectedOptionGroup, PUBLIC_ESTABLISHMENT_CATEGORIES, MenuCategory } from '../types';
import { calculateConfiguredOrderItem, normalizeOrderItem, getCartItemCustomizationLines } from '../utils/orderCalculation';
import { formatOrderDateTime } from '../utils/dateUtils';
import { getPaymentMethodLabel } from '../utils/paymentLabels';
import { 
  Search, Star, Clock, ShoppingBag, Plus, Minus, X, Check, MapPin, 
  ChevronRight, ArrowLeft, Heart, Bike, DollarSign, MessageSquare, Clipboard, FileText, CheckCircle2,
  Medal, Award, Sparkles, AlertCircle,
  LayoutGrid, ShoppingBasket, Pill, PawPrint, Utensils, Pizza, Store, Sprout, IceCream, Fish, Flame, Hamburger,
  Sandwich, Croissant, CakeSlice, Apple, Beef, Beer, Pencil, Flower2, Hammer, House
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OrderStatusTracker } from './OrderStatusTracker';
import { useLocation } from '../hooks/useLocation';
import { canEstablishmentReceiveOrders, getNextOpeningTimeText } from '../utils/establishmentUtils';
import { getCategoryLabel, getEstablishmentCategoryIds } from '../utils/labelUtils';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../lib/firebase';
import { addressService } from '../services/addressService';
import { UserAddress } from '../types/address';
import { AddressForm } from './account/AddressForm';
import { EstablishmentImage } from './EstablishmentImage';
import { resolveEstablishmentLogo, resolveEstablishmentCover } from '../utils/imageUtils';
import { FidelityModal } from './FidelityModal';
import { MyAccount } from './MyAccount';
import { OrderTrackingPage } from './account/OrderTrackingPage';

function normalizeString(val: string): string {
  if (!val) return "";
  return val
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, " ")            // resolve duplicate spaces
    .replace(/[^a-z0-9 ]/g, "")      // keep only alphanumeric and standard spaces
    .trim();
}

export const ClientArea: React.FC = () => {
  const { currentUser, userProfile, loading: authLoading, isAuthenticated } = useAuth();
  const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);
  const {
    establishments,
    products,
    menuCategories: allMenuCategories,
    cart,
    addToCart,
    updateCartItemQuantity,
    removeFromCart,
    placeOrder,
    orders,
    selectedEstablishmentId,
    setSelectedEstablishmentId,
    showToast,
    neighborhoods,
    selectedCity,
    setSelectedCity,
    cities,
    clearCart,
    businessHours
  } = useApp();

  const [path, navigate] = useLocation();
  const isDemo = path === '/demo';
  const isAccountRoute = path === '/minha-conta' || path === '/meus-pedidos';
  const isTrackingRoute = path.startsWith('/acompanhar-pedido/');
  const isSpecialRoute = isAccountRoute || isTrackingRoute;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [swipeStart, setSwipeStart] = useState<{ x: number, y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select')) return;
    setSwipeStart({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!swipeStart) return;
    const deltaX = e.clientX - swipeStart.x;
    const deltaY = e.clientY - swipeStart.y;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setActiveIndex(prev => (prev === 0 ? 1 : 0));
    }
    setSwipeStart(null);
  };
  const [isFidelityModalOpen, setIsFidelityModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [isAllCategoriesModalOpen, setIsAllCategoriesModalOpen] = useState(false);

  // Category visual styles and icons
  const categoryStyles = useMemo<Record<string, { bg: string; text: string; icon: any }>>(() => ({
    Todos: { bg: 'bg-[#FDF3F0]', text: 'text-[#E94F2F]', icon: LayoutGrid },
    restaurantes: { bg: 'bg-[#F5F5F4]', text: 'text-[#44403C]', icon: Utensils },
    pizzarias: { bg: 'bg-[#FEF6F0]', text: 'text-[#D97706]', icon: Pizza },
    lanches: { bg: 'bg-[#FEF2F2]', text: 'text-[#EF4444]', icon: Sandwich },
    hamburgueres: { bg: 'bg-[#FFFBEB]', text: 'text-[#F59E0B]', icon: Hamburger },
    acai_doces: { bg: 'bg-[#FAF5FF]', text: 'text-[#9333EA]', icon: IceCream },
    padarias: { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', icon: Croissant },
    confeitarias: { bg: 'bg-[#FDF2F8]', text: 'text-[#DB2777]', icon: CakeSlice },
    japonesa: { bg: 'bg-[#F0FDF4]', text: 'text-[#16A34A]', icon: Fish },
    brasileira: { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', icon: Utensils },
    mercados: { bg: 'bg-[#EFF6FF]', text: 'text-[#2563EB]', icon: ShoppingBasket },
    mercearias: { bg: 'bg-[#F0FDFA]', text: 'text-[#0D9488]', icon: ShoppingBasket },
    hortifrutis: { bg: 'bg-[#F0FDF4]', text: 'text-[#16A34A]', icon: Apple },
    acougues: { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', icon: Beef },
    farmacias: { bg: 'bg-[#FFF1F2]', text: 'text-[#E11D48]', icon: Pill },
    pet_shops: { bg: 'bg-[#FAF8F6]', text: 'text-[#7C2D12]', icon: PawPrint },
    agropecuarias: { bg: 'bg-[#F0FDF4]', text: 'text-[#15803D]', icon: Sprout },
    bebidas: { bg: 'bg-[#FFF7ED]', text: 'text-[#D97706]', icon: Beer },
    conveniencias: { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', icon: Store },
    papelarias: { bg: 'bg-[#EFF6FF]', text: 'text-[#2563EB]', icon: Pencil },
    floriculturas: { bg: 'bg-[#FDF2F8]', text: 'text-[#EC4899]', icon: Flower2 },
    materiais_construcao: { bg: 'bg-[#FAF7F5]', text: 'text-[#B45309]', icon: Hammer },
    utilidades_domesticas: { bg: 'bg-[#F0FDFA]', text: 'text-[#0891B2]', icon: House },
    // Legacy aliases for extra safety
    pizzas: { bg: 'bg-[#FEF6F0]', text: 'text-[#D97706]', icon: Pizza },
    restaurants: { bg: 'bg-[#F5F5F4]', text: 'text-[#44403C]', icon: Utensils }
  }), []);

  const getCategoryStyle = (id: string) => {
    const style = categoryStyles[id];
    if (!style && id !== 'Todos') {
      const isDev = typeof window !== 'undefined' && (
        (window as any).__vite_plugin_react_preamble_installed__ || 
        (import.meta as any).env?.DEV
      );
      if (isDev) {
        console.warn("CATEGORY_WITHOUT_ICON", id);
      }
    }
    return style || { bg: 'bg-[#FAF8F6]', text: 'text-[#756B66]', icon: LayoutGrid };
  };

  const getCategoryIdByLabel = (label: string): string => {
    if (label === 'Todos') return 'Todos';
    const found = PUBLIC_ESTABLISHMENT_CATEGORIES.find(c => c.label === label);
    return found ? found.id : 'Todos';
  };

  const activeCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    establishments.forEach(est => {
      if (est.cityId === selectedCity.id) {
        const isActive = est.platformStatus !== undefined 
          ? est.platformStatus === 'active'
          : (est.active === true && est.archived !== true && est.suspended !== true);
        if (isActive) {
          const catIds = getEstablishmentCategoryIds(est);
          catIds.forEach(id => ids.add(id));
        }
      }
    });
    return ids;
  }, [establishments, selectedCity]);

  const homeCategories = useMemo(() => {
    const homeOnly = PUBLIC_ESTABLISHMENT_CATEGORIES
      .filter(cat => activeCategoryIds.has(cat.id))
      .sort((a, b) => (a.homeOrder || 0) - (b.homeOrder || 0))
      .map(cat => cat.label);
    return ['Todos', ...homeOnly];
  }, [activeCategoryIds]);

  const allCategoriesList = useMemo(() => {
    const sorted = [...PUBLIC_ESTABLISHMENT_CATEGORIES]
      .filter(cat => activeCategoryIds.has(cat.id))
      .sort((a, b) => (a.homeOrder || 0) - (b.homeOrder || 0))
      .map(cat => cat.label);
    return ['Todos', ...sorted];
  }, [activeCategoryIds]);

  const [clientSubView, setClientSubView] = useState<'home' | 'menu' | 'tracking'>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Drag to scroll logic for categories (Desktop and Mobile)
  const desktopScrollRef = React.useRef<HTMLDivElement>(null);
  const [desktopIsDragging, setDesktopIsDragging] = useState(false);
  const [desktopStartX, setDesktopStartX] = useState(0);
  const [desktopScrollLeft, setDesktopScrollLeft] = useState(0);
  const [desktopDraggedDistance, setDesktopDraggedDistance] = useState(0);

  const handleDesktopMouseDown = (e: React.MouseEvent) => {
    if (!desktopScrollRef.current) return;
    setDesktopIsDragging(true);
    setDesktopStartX(e.pageX - desktopScrollRef.current.offsetLeft);
    setDesktopScrollLeft(desktopScrollRef.current.scrollLeft);
    setDesktopDraggedDistance(0);
  };

  const handleDesktopMouseMove = (e: React.MouseEvent) => {
    if (!desktopIsDragging || !desktopScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - desktopScrollRef.current.offsetLeft;
    const walk = (x - desktopStartX) * 1.5; // speed multiplier
    desktopScrollRef.current.scrollLeft = desktopScrollLeft - walk;
    setDesktopDraggedDistance(Math.abs(x - desktopStartX));
  };

  const handleDesktopMouseUp = () => {
    setDesktopIsDragging(false);
  };

  const handleDesktopMouseLeave = () => {
    setDesktopIsDragging(false);
  };

  // Mobile Drag to Scroll if mouse is used
  const mobileScrollRef = React.useRef<HTMLDivElement>(null);
  const [mobileIsDragging, setMobileIsDragging] = useState(false);
  const [mobileStartX, setMobileStartX] = useState(0);
  const [mobileScrollLeft, setMobileScrollLeft] = useState(0);
  const [mobileDraggedDistance, setMobileDraggedDistance] = useState(0);

  const handleMobileMouseDown = (e: React.MouseEvent) => {
    if (!mobileScrollRef.current) return;
    setMobileIsDragging(true);
    setMobileStartX(e.pageX - mobileScrollRef.current.offsetLeft);
    setMobileScrollLeft(mobileScrollRef.current.scrollLeft);
    setMobileDraggedDistance(0);
  };

  const handleMobileMouseMove = (e: React.MouseEvent) => {
    if (!mobileIsDragging || !mobileScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - mobileScrollRef.current.offsetLeft;
    const walk = (x - mobileStartX) * 1.5;
    mobileScrollRef.current.scrollLeft = mobileScrollLeft - walk;
    setMobileDraggedDistance(Math.abs(x - mobileStartX));
  };

  const handleMobileMouseUp = () => {
    setMobileIsDragging(false);
  };

  const handleMobileMouseLeave = () => {
    setMobileIsDragging(false);
  };
  
  // City Select Modal and Cart Warning States
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [pendingCityToChange, setPendingCityToChange] = useState<any>(null);
  const [isCityCartWarningOpen, setIsCityCartWarningOpen] = useState(false);

  const handleCitySelect = (city: any) => {
    if (city.id === selectedCity.id) {
      setIsCityModalOpen(false);
      return;
    }
    if (cart.length > 0) {
      setPendingCityToChange(city);
      setIsCityCartWarningOpen(true);
    } else {
      setSelectedCity(city);
      setSelectedCategory('Todos');
      setSearchQuery('');
      setIsCityModalOpen(false);
      showToast(`Agora você está vendo os estabelecimentos de ${city.name} - ${city.state}`, 'success');
    }
  };

  const confirmCityChange = () => {
    if (pendingCityToChange) {
      clearCart();
      setSelectedCity(pendingCityToChange);
      setSelectedCategory('Todos');
      setSearchQuery('');
      showToast(`Agora você está vendo os estabelecimentos de ${pendingCityToChange.name} - ${pendingCityToChange.state} (Carrinho esvaziado)`, 'success');
    }
    setPendingCityToChange(null);
    setIsCityCartWarningOpen(false);
    setIsCityModalOpen(false);
  };

  const cancelCityChange = () => {
    setPendingCityToChange(null);
    setIsCityCartWarningOpen(false);
  };
  
  // Product Detail States
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedBorder, setSelectedBorder] = useState<string>('');
  const [selectedExtras, setSelectedExtras] = useState<{ name: string; price: number }[]>([]);
  const [selectedOptionGroups, setSelectedOptionGroups] = useState<SelectedOptionGroup[]>([]);
  const [productNotes, setProductNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [invalidGroupIds, setInvalidGroupIds] = useState<string[]>([]);

  // Cart / Checkout Modal
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  React.useEffect(() => {
    const handleOpenCart = () => {
      setIsCartOpen(true);
    };
    const handleOpenTracking = () => {
      setClientSubView('tracking');
    };
    window.addEventListener('open-cart', handleOpenCart);
    window.addEventListener('open-tracking', handleOpenTracking);
    return () => {
      window.removeEventListener('open-cart', handleOpenCart);
      window.removeEventListener('open-tracking', handleOpenTracking);
    };
  }, []);

  // Checkout Form States
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [bairro, setBairro] = useState('');
  const [debouncedBairro, setDebouncedBairro] = useState('');
  const activeRequestRef = React.useRef<number>(0);
  const isSavedAddressChangeRef = React.useRef<boolean>(false);
  const [quotePricingSource, setQuotePricingSource] = useState<string | null>(null);
  const [quoteNeighborhood, setQuoteNeighborhood] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [complement, setComplement] = useState('');
  const [deliveryType, setDeliveryType] = useState<'entrega' | 'retirada'>('entrega');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card_on_delivery' | 'pix_on_delivery'>('pix_on_delivery');
  const [changeRequired, setChangeRequired] = useState<boolean>(false);
  const [changeFor, setChangeFor] = useState<string>('');
  const [confirmPaymentToEst, setConfirmPaymentToEst] = useState<boolean>(false);
  const [checkoutNotes, setCheckoutNotes] = useState('');

  // Address integration for checkout
  const [userAddresses, setUserAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteAvailable, setQuoteAvailable] = useState<boolean>(true);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [quoteMinOrderValue, setQuoteMinOrderValue] = useState<number>(0);
  const [quoteEstimatedMinutes, setQuoteEstimatedMinutes] = useState<number>(35);
  const [showNewAddressModal, setShowNewAddressModal] = useState(false);

  // New P0 state variables for dynamic logistics & establishment-specific zones
  const [establishmentZones, setEstablishmentZones] = useState<any[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [manualBairroType, setManualBairroType] = useState<'select' | 'input'>('select');
  const [prevEstId, setPrevEstId] = useState<string>('');

  // Restore checkout state after successful login/registration redirect
  React.useEffect(() => {
    const savedState = sessionStorage.getItem('uaipertim_checkout_state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.customerName) setCustomerName(state.customerName);
        if (state.customerPhone) setCustomerPhone(state.customerPhone);
        if (state.street) setStreet(state.street);
        if (state.number) setNumber(state.number);
        if (state.bairro) setBairro(state.bairro);
        if (state.complement) setComplement(state.complement);
        if (state.deliveryType) setDeliveryType(state.deliveryType);
        if (state.paymentMethod) setPaymentMethod(state.paymentMethod);
        if (state.changeRequired !== undefined) setChangeRequired(state.changeRequired);
        if (state.changeFor) setChangeFor(state.changeFor);
        if (state.checkoutNotes) setCheckoutNotes(state.checkoutNotes);
        if (state.couponCode) setCouponCode(state.couponCode);
        if (state.couponDiscount !== undefined) setCouponDiscount(state.couponDiscount);
        if (state.isCheckoutOpen) setIsCheckoutOpen(true);
        // Clear it so it doesn't open on random future visits
        sessionStorage.removeItem('uaipertim_checkout_state');
      } catch (err) {
        console.error('Error restoring checkout state:', err);
      }
    }
  }, []);

  // Diagnostic logging of auth changes
  React.useEffect(() => {
    const authResolved = !authLoading;
    console.log("CHECKOUT_AUTH_DIAGNOSTIC", {
      authResolved,
      currentUserUid: currentUser?.uid ?? null,
      firebaseCurrentUserUid: auth?.currentUser?.uid ?? null,
      userProfileUid: userProfile?.uid ?? null,
      userRole: userProfile?.role ?? null,
      isAuthenticated
    });
  }, [currentUser, userProfile, authLoading, isAuthenticated]);

  // Prefill name, phone, preferred fulfillment, and load saved addresses when checkout opens
  React.useEffect(() => {
    if (isCheckoutOpen) {
      if (userProfile) {
        setCustomerName(userProfile.name);
        if (userProfile.phone) {
          setCustomerPhone(userProfile.phone);
        }
        
        // Preferred Fulfillment
        if (userProfile.preferences?.preferredFulfillment) {
          setDeliveryType(userProfile.preferences.preferredFulfillment === 'delivery' ? 'entrega' : 'retirada');
        }
      }

      if (currentUser) {
        addressService.getAddresses(currentUser.uid)
          .then((list) => {
            setUserAddresses(list);
            const def = list.find((a) => a.isDefault) || list[0] || null;
            if (def) {
              setSelectedAddressId(def.id || '');
              setStreet(def.street);
              setNumber(def.number);
              isSavedAddressChangeRef.current = true;
              setBairro(def.neighborhood);
              setComplement(def.complement || '');
            }
          })
          .catch((err) => console.error("Error loading checkout addresses:", err));
      }
    }
  }, [isCheckoutOpen, currentUser, userProfile]);

  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddressId(addrId);
    const selected = userAddresses.find((a) => a.id === addrId);
    if (selected) {
      setStreet(selected.street);
      setNumber(selected.number);
      isSavedAddressChangeRef.current = true;
      setBairro(selected.neighborhood);
      setComplement(selected.complement || '');
    }
  };

  const handleCreateAddressInCheckout = async (addressData: Omit<UserAddress, 'id'>) => {
    if (!currentUser) return;
    try {
      const newId = await addressService.addAddress(currentUser.uid, addressData);
      showToast('Endereço adicionado com sucesso!', 'success');
      
      // Reload list
      const list = await addressService.getAddresses(currentUser.uid);
      setUserAddresses(list);
      
      // Set as active selected
      setSelectedAddressId(newId);
      setStreet(addressData.street);
      setNumber(addressData.number);
      isSavedAddressChangeRef.current = true;
      setBairro(addressData.neighborhood);
      setComplement(addressData.complement || '');
      
      setShowNewAddressModal(false);
    } catch (err) {
      console.error('Error adding address in checkout:', err);
      showToast('Erro ao cadastrar endereço.', 'error');
    }
  };

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Filter establishments
  const filteredEstablishments = useMemo(() => {
    return establishments.filter(est => {
      // 1. filtrar por cidade
      const matchesCity = est.cityId === selectedCity.id;
      if (!matchesCity) return false;

      // 2. filtrar por estabelecimento ativo (plataformStatus !== 'inactive' e !== 'archived')
      const isPlatformActive = est.platformStatus !== undefined 
        ? est.platformStatus === 'active'
        : (est.active === true && est.archived !== true && est.suspended !== true);
      if (!isPlatformActive) return false;

      // 3. aplicar categoria
      if (selectedCategory !== 'Todos') {
        if (selectedCategory === 'Destaques') {
          const isDestacado = est.isFeaturedPartner === true || est.featured === true || est.id === 'pizzaria-da-praca';
          if (!isDestacado) return false;
        } else {
          const visualToCanonicalMap: Record<string, string> = {};
          PUBLIC_ESTABLISHMENT_CATEGORIES.forEach(cat => {
            visualToCanonicalMap[cat.label] = cat.id;
          });
          const canonicalId = visualToCanonicalMap[selectedCategory] || selectedCategory.toLowerCase();
          const estCatIds = getEstablishmentCategoryIds(est);
          const hasMatch = estCatIds.includes(canonicalId);
          if (!hasMatch) return false;
        }
      }

      // 4. aplicar busca por nome, categoria ou produto
      if (searchQuery.trim() !== '') {
        const estProducts = products[est.id] || [];
        const matchesProduct = estProducts.some(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
        const matchesSearch = est.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              est.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              getCategoryLabel(est.category).toLowerCase().includes(searchQuery.toLowerCase()) ||
                              matchesProduct;
        if (!matchesSearch) return false;
      }

      return true;
    }).sort((a, b) => {
      // 1. Sort by open status (can receive orders) first
      const aCanReceive = canEstablishmentReceiveOrders(a);
      const bCanReceive = canEstablishmentReceiveOrders(b);
      if (aCanReceive && !bCanReceive) return -1;
      if (!aCanReceive && bCanReceive) return 1;

      // 2. Ordenação por parceiros destacados ativos (isFeaturedPartner) dentro de cada grupo
      const aFeatured = a.isFeaturedPartner === true || a.featured === true || a.id === 'pizzaria-da-praca';
      const bFeatured = b.isFeaturedPartner === true || b.featured === true || b.id === 'pizzaria-da-praca';

      if (aFeatured && !bFeatured) return -1;
      if (!aFeatured && bFeatured) return 1;

      if (aFeatured && bFeatured) {
        const aOrder = a.featuredOrder !== undefined && a.featuredOrder !== null ? Number(a.featuredOrder) : Infinity;
        const bOrder = b.featuredOrder !== undefined && b.featuredOrder !== null ? Number(b.featuredOrder) : Infinity;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
      }

      const aPaused = a.temporarilyPaused === true || a.operationalPause === true;
      const bPaused = b.temporarilyPaused === true || b.operationalPause === true;
      if (aPaused && !bPaused) return -1;
      if (!aPaused && bPaused) return 1;

      return 0;
    });
  }, [establishments, selectedCategory, searchQuery, selectedCity, products]);

  // Current viewed establishment
  const currentEst = useMemo(() => {
    return establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
  }, [establishments, selectedEstablishmentId]);

  // 1. Reset logistics states when store changes
  React.useEffect(() => {
    if (currentEst?.id && currentEst.id !== prevEstId) {
      setPrevEstId(currentEst.id);
      setBairro('');
      setStreet('');
      setNumber('');
      setComplement('');
      setSelectedAddressId('');
      setQuoteLoading(false);
      setQuoteError(null);
      setQuoteAvailable(true);
      setDeliveryFee(0);
    }
  }, [currentEst?.id, prevEstId]);

  // 2. Fetch active delivery zones for the establishment
  React.useEffect(() => {
    if (isCheckoutOpen && currentEst?.id) {
      setZonesLoading(true);
      fetch(`/api/establishments/${currentEst.id}/delivery-zones`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setEstablishmentZones(data);
          } else {
            setEstablishmentZones([]);
          }
        })
        .catch((err) => {
          console.error("Error fetching establishment delivery zones:", err);
          setEstablishmentZones([]);
        })
        .finally(() => {
          setZonesLoading(false);
        });
    } else {
      setEstablishmentZones([]);
    }
  }, [isCheckoutOpen, currentEst?.id]);

  // 3. Keep manual address mode as 'input' always to allow typing normal
  React.useEffect(() => {
    setManualBairroType('input');
  }, []);

  // 4. Debounce effect for neighborhood text input
  React.useEffect(() => {
    if (!isCheckoutOpen || deliveryType !== 'entrega') {
      return;
    }

    const trimmed = bairro?.trim() || '';

    // If neighborhood is erased or too short:
    // - clear delivery fee, clear estimated time, block checkout
    if (trimmed.length < 2) {
      setQuoteLoading(false);
      setQuoteAvailable(false);
      setQuoteError("Informe o bairro para calcular a entrega.");
      setDeliveryFee(0);
      setQuotePricingSource(null);
      setQuoteNeighborhood('');
      setDebouncedBairro('');
      return;
    }

    // When the customer changes the neighborhood:
    // - invalidate the previous quote immediately
    // - show calculation state
    // - do not keep the previous total while fetching the new one
    setQuoteLoading(true);
    setQuoteAvailable(false);
    setQuoteError(null);
    setDeliveryFee(0);
    setQuotePricingSource(null);
    setQuoteNeighborhood('');

    if (isSavedAddressChangeRef.current) {
      isSavedAddressChangeRef.current = false;
      setDebouncedBairro(bairro);
      return;
    }

    const delay = 500; // Between 400ms and 600ms
    const timer = setTimeout(() => {
      setDebouncedBairro(bairro);
    }, delay);

    return () => clearTimeout(timer);
  }, [bairro, isCheckoutOpen, deliveryType]);

  // Filtered payment options accepted by the current establishment
  const paymentOptions = useMemo(() => {
    const options = [];
    if (currentEst?.acceptCash !== false) {
      options.push({ id: 'cash', label: 'Dinheiro na entrega ou retirada' });
    }
    if (currentEst?.acceptDebitCard !== false || currentEst?.acceptCreditCard !== false) {
      options.push({ id: 'card_on_delivery', label: 'Cartão na entrega ou retirada' });
    }
    if (currentEst?.acceptPix !== false) {
      options.push({ id: 'pix_on_delivery', label: 'Pix na entrega ou retirada' });
    }
    return options;
  }, [currentEst]);

  // Filter exceptions/delivery zones for the Bairro text input autocomplete
  const filteredZones = useMemo(() => {
    if (!bairro || bairro.trim().length === 0) return [];
    const normalizedBairro = normalizeString(bairro);
    return establishmentZones.filter((z) => {
      if (!z.neighborhoodName) return false;
      return normalizeString(z.neighborhoodName).includes(normalizedBairro);
    });
  }, [bairro, establishmentZones]);

  // Sync payment method when options change
  React.useEffect(() => {
    if (paymentOptions.length > 0) {
      const isValid = paymentOptions.some(opt => opt.id === paymentMethod);
      if (!isValid) {
        setPaymentMethod(paymentOptions[0].id as any);
      }
    }
  }, [paymentOptions, paymentMethod]);

  // Sync deliveryType if establishment has disabled certain modalities
  React.useEffect(() => {
    if (isCheckoutOpen && currentEst) {
      const isDeliveryAllowed = currentEst.entregaPropria !== false;
      const isPickupAllowed = currentEst.atendeRetirada !== false;
      if (!isDeliveryAllowed && isPickupAllowed) {
        setDeliveryType('retirada');
      } else if (!isPickupAllowed && isDeliveryAllowed) {
        setDeliveryType('entrega');
      }
    }
  }, [isCheckoutOpen, currentEst]);

  // Current establishment's products
  const currentProducts = useMemo(() => {
    return products[selectedEstablishmentId] || [];
  }, [products, selectedEstablishmentId]);

  // Categories in the viewed menu
  const menuCategories = useMemo<MenuCategory[]>(() => {
    const list = allMenuCategories[selectedEstablishmentId] || [];
    return list.filter(cat => {
      if (!cat.active) return false;
      return currentProducts.some(p => p.menuCategoryId === cat.id && p.available !== false && (p as any).active !== false);
    });
  }, [allMenuCategories, selectedEstablishmentId, currentProducts]);

  // Handle viewing an establishment's menu
  const handleViewMenu = (estId: string) => {
    const est = establishments.find(e => e.id === estId);
    if (est && !canEstablishmentReceiveOrders(est)) {
      return;
    }
    setSelectedEstablishmentId(estId);
    setClientSubView('menu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to sync legacy selectedSize, selectedBorder, and selectedExtras states with optionGroups
  const syncLegacyStatesFromOptionGroups = (groups: SelectedOptionGroup[]) => {
    // 1. Size
    const sizeGroup = groups.find(g => g.groupId === 'escolha-o-tamanho' || g.groupName.toLowerCase().includes('tamanho'));
    if (sizeGroup && sizeGroup.selectedOptions.length > 0) {
      setSelectedSize(sizeGroup.selectedOptions[0].name);
    } else {
      setSelectedSize('');
    }

    // 2. Border
    const borderGroup = groups.find(g => g.groupId === 'escolha-a-borda' || g.groupName.toLowerCase().includes('borda'));
    if (borderGroup && borderGroup.selectedOptions.length > 0) {
      setSelectedBorder(borderGroup.selectedOptions[0].name);
    } else {
      setSelectedBorder('');
    }

    // 3. Extras
    const extrasGroup = groups.find(g => g.groupId === 'adicionais-premium' || g.groupName.toLowerCase().includes('adicionais premium') || g.groupName.toLowerCase() === 'adicionais');
    if (extrasGroup) {
      const extras = extrasGroup.selectedOptions.map(o => ({
        name: o.name,
        price: o.additionalPrice
      }));
      setSelectedExtras(extras);
    } else {
      setSelectedExtras([]);
    }
  };

  React.useEffect(() => {
    syncLegacyStatesFromOptionGroups(selectedOptionGroups);
  }, [selectedOptionGroups]);

  // Open item detail
  const handleOpenProduct = (product: Product) => {
    if (!product.available) {
      showToast('Este produto está indisponível no momento.', 'error');
      return;
    }
    
    // Default legacy selections (set to empty initially to require explicit customer action under Rule B)
    setSelectedProduct(product);
    setSelectedSize('');
    setSelectedBorder('');
    setSelectedExtras([]);
    setProductNotes('');
    setQuantity(1);
    setInvalidGroupIds([]);

    // Pre-populate option groups only if an official default property exists (Rule B: wait for explicit choice since no official default is configured)
    const initialGroups: SelectedOptionGroup[] = [];
    
    setSelectedOptionGroups(initialGroups);
  };

  // Toggle Extra topping
  const handleToggleExtra = (extra: { name: string; price: number }) => {
    setSelectedExtras(prev => {
      const exists = prev.some(e => e.name === extra.name);
      if (exists) {
        return prev.filter(e => e.name !== extra.name);
      } else {
        return [...prev, extra];
      }
    });
  };

  // Toggle a custom option group option with optional quantity change
  const handleToggleOption = (group: any, option: any, qtyChange?: number) => {
    setInvalidGroupIds(prev => prev.filter(id => id !== group.id));
    setSelectedOptionGroups(prev => {
      let next: SelectedOptionGroup[] = [];
      const existingGroup = prev.find(g => g.groupId === group.id);
      const isSingle = group.maxSelections === 1;

      if (isSingle) {
        // Exclusive Single Selection / Radio Group behavior (Requirement 2 & 4)
        const currentOptSelections = existingGroup
          ? existingGroup.selectedOptions.filter(o => o.optionId === option.id)
          : [];
        const currentOptQty = currentOptSelections.reduce((sum, o) => sum + (o.quantity ?? 1), 0);

        let targetQty = currentOptQty;
        if (qtyChange !== undefined) {
          targetQty = Math.min(1, Math.max(0, currentOptQty + qtyChange));
        } else {
          if (currentOptQty > 0) {
            if (group.required) {
              // Clicking already selected option in required group does nothing (Requirement 12)
              return prev;
            } else {
              targetQty = 0; // Deselect for optional group
            }
          } else {
            targetQty = 1;
          }
        }

        if (targetQty === 0) {
          return prev.filter(g => g.groupId !== group.id);
        } else {
          const newGroup: SelectedOptionGroup = {
            groupId: group.id,
            groupName: group.name,
            selectedOptions: [
              {
                optionId: option.id,
                name: option.name,
                additionalPrice: option.additionalPrice || 0
              }
            ]
          };

          if (existingGroup) {
            return prev.map(g => g.groupId === group.id ? newGroup : g);
          } else {
            return [...prev, newGroup];
          }
        }
      }

      // Current selections for this specific option (Multi-select)
      const currentOptSelections = existingGroup
        ? existingGroup.selectedOptions.filter(o => o.optionId === option.id)
        : [];
      const currentOptQty = currentOptSelections.reduce((sum, o) => sum + (o.quantity ?? 1), 0);

      // Selection count for OTHER options in the group
      const otherSelectionsCount = existingGroup
        ? existingGroup.selectedOptions.filter(o => o.optionId !== option.id).reduce((sum, o) => sum + (o.quantity ?? 1), 0)
        : 0;

      // Handle change
      let targetQty = currentOptQty;
      if (qtyChange !== undefined) {
        targetQty = Math.max(0, currentOptQty + qtyChange);
      } else {
        // Multi-select: click on row toggle from 0 to 1, or from 1 to 0
        targetQty = currentOptQty > 0 ? 0 : 1;
      }

      // Check limits
      const totalGroupSelections = otherSelectionsCount + targetQty;
      if (totalGroupSelections > group.maxSelections) {
        showToast(`Você pode selecionar no máximo ${group.maxSelections} opções para "${group.name}".`, 'warning');
        return prev;
      }

      // Build objects for target quantity
      const addedOptions = Array.from({ length: targetQty }, () => ({
        optionId: option.id,
        name: option.name,
        additionalPrice: option.additionalPrice || 0
      }));

      if (!existingGroup) {
        if (targetQty > 0) {
          next = [
            ...prev,
            {
              groupId: group.id,
              groupName: group.name,
              selectedOptions: addedOptions
            }
          ];
        } else {
          next = prev;
        }
      } else {
        const updatedOptions = [
          ...existingGroup.selectedOptions.filter(o => o.optionId !== option.id),
          ...addedOptions
        ];

        if (updatedOptions.length === 0) {
          next = prev.filter(g => g.groupId !== group.id);
        } else {
          next = prev.map(g => {
            if (g.groupId === group.id) {
              return { ...g, selectedOptions: updatedOptions };
            }
            return g;
          });
        }
      }

      return next;
    });
  };

  // Dynamic Product Price calculation
  const calculatedProductPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    const item = calculateConfiguredOrderItem(
      selectedProduct,
      selectedSize,
      selectedBorder,
      selectedExtras,
      quantity,
      productNotes,
      selectedOptionGroups
    );
    return item.lineTotal;
  }, [selectedProduct, selectedSize, selectedBorder, selectedExtras, quantity, productNotes, selectedOptionGroups]);

  // Handle adding configured item to cart
  const handleConfirmAddToCart = () => {
    if (!selectedProduct) return;

    // Validate Option Groups selections
    const newInvalidGroupIds: string[] = [];
    if (selectedProduct.optionGroups && selectedProduct.optionGroups.length > 0) {
      for (const group of selectedProduct.optionGroups) {
        if (!group.active) continue;
        const selection = selectedOptionGroups.find(sg => sg.groupId === group.id);
        const selectedCount = selection ? selection.selectedOptions.reduce((sum, so) => sum + (so.quantity ?? 1), 0) : 0;

        if (group.required && selectedCount < group.minSelections) {
          newInvalidGroupIds.push(group.id);
        } else if (selectedCount < group.minSelections) {
          newInvalidGroupIds.push(group.id);
        } else if (selectedCount > group.maxSelections) {
          newInvalidGroupIds.push(group.id);
        }
      }
    }

    if (newInvalidGroupIds.length > 0) {
      setInvalidGroupIds(newInvalidGroupIds);
      showToast("Selecione uma opção para continuar.", "error");
      
      setTimeout(() => {
        const firstInvalidId = newInvalidGroupIds[0];
        const element = document.getElementById(`group-${firstInvalidId}`);
        const container = document.getElementById("product-config-scroll-container");
        if (element && container) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({
            top: relativeTop - 20,
            behavior: 'smooth'
          });
        }
      }, 100);
      return;
    }

    setInvalidGroupIds([]);
    
    const cartItem: CartItem = {
      product: selectedProduct,
      quantity,
      selectedSize: selectedSize || undefined,
      selectedBorder: selectedBorder || undefined,
      selectedExtras: [...selectedExtras],
      selectedOptionGroups: [...selectedOptionGroups],
      notes: productNotes.trim() || undefined
    };

    addToCart(cartItem);
    setSelectedProduct(null);
  };

  const handleQueroClick = () => {
    const container = document.getElementById('product-config-scroll-container');
    if (container) {
      const firstGroup = container.querySelector('[id^="group-"]');
      if (firstGroup) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = firstGroup.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({
          top: relativeTop - 20,
          behavior: 'smooth'
        });
      } else {
        container.scrollTo({ top: 320, behavior: 'smooth' });
      }
    }
  };

  // Cart calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const normalized = normalizeOrderItem(item);
      return sum + normalized.lineTotal;
    }, 0);
  }, [cart]);

  // Dynamic quotation fetcher
  React.useEffect(() => {
    if (!isCheckoutOpen) return;
    
    if (deliveryType === 'retirada') {
      setDeliveryFee(0);
      setQuoteMinOrderValue(currentEst.minOrderValue ?? currentEst.minimumOrderValue ?? 0);
      setQuoteEstimatedMinutes(currentEst.pickupEstimatedMinutes ?? 15);
      setQuoteAvailable(true);
      setQuoteError(null);
      setQuotePricingSource(null);
      setQuoteNeighborhood('');
      setQuoteLoading(false);
      return;
    }
    
    const trimmed = debouncedBairro?.trim() || '';
    if (!selectedAddressId && trimmed.length < 2) {
      setQuoteAvailable(false);
      setQuoteError("Informe o bairro para calcular a entrega.");
      setDeliveryFee(0);
      setQuoteLoading(false);
      return;
    }
    
    const currentReqId = ++activeRequestRef.current;
    
    const fetchQuote = async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        
        const resolvedNeighborhood = selectedAddressId
          ? (userAddresses.find(a => a.id === selectedAddressId)?.neighborhood || bairro)
          : debouncedBairro;
        
        const response = await fetch("/api/delivery/quote", {
          method: "POST",
          headers,
          body: JSON.stringify({
            establishmentId: currentEst.id,
            addressId: selectedAddressId || null,
            fulfillmentType: "delivery",
            city: currentEst.cityId || currentEst.city || "sao-joao-batista-do-gloria-mg",
            neighborhood: resolvedNeighborhood,
            subtotal: cartSubtotal
          })
        });
        
        // Race condition check: ignore if a newer request has started
        if (currentReqId !== activeRequestRef.current) {
          return;
        }
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (errData.code === "NEIGHBORHOOD_NOT_SUPPORTED") {
            throw new Error("Este estabelecimento não atende ao bairro informado.");
          }
          throw new Error("Não foi possível calcular a entrega. Tente novamente.");
        }
        
        const data = await response.json();
        
        if (currentReqId !== activeRequestRef.current) {
          return;
        }
        
        if (data.available === false) {
          setQuoteAvailable(false);
          setQuoteError(data.reason || data.error || "Este estabelecimento não atende ao bairro informado.");
          setDeliveryFee(0);
          setQuotePricingSource(null);
          setQuoteNeighborhood('');
        } else {
          setQuoteAvailable(true);
          setDeliveryFee(data.deliveryFee);
          setQuoteMinOrderValue(data.minimumOrderValue);
          setQuoteEstimatedMinutes(data.estimatedMinutes);
          setQuotePricingSource(data.pricingSource);
          setQuoteNeighborhood(data.neighborhoodName || resolvedNeighborhood);
        }
      } catch (err: any) {
        if (currentReqId !== activeRequestRef.current) {
          return;
        }
        console.error("Error fetching delivery quote:", err);
        setQuoteError(err.message || "Não foi possível calcular a entrega. Tente novamente.");
        setQuoteAvailable(false);
        setDeliveryFee(0);
      } finally {
        if (currentReqId === activeRequestRef.current) {
          setQuoteLoading(false);
        }
      }
    };
    
    fetchQuote();
  }, [
    isCheckoutOpen,
    deliveryType,
    selectedAddressId,
    currentEst,
    debouncedBairro,
    cartSubtotal,
    userAddresses
  ]);

  const cartTotal = useMemo(() => {
    const afterDiscount = cartSubtotal - couponDiscount;
    return Math.max(0, afterDiscount + (deliveryType === 'entrega' && (quoteLoading || quoteError || !quoteAvailable) ? 0 : deliveryFee));
  }, [cartSubtotal, couponDiscount, deliveryFee, deliveryType, quoteLoading, quoteError, quoteAvailable]);

  const isSubmitDisabled = useMemo(() => {
    if (authLoading) return true;
    
    // Check if establishment can receive orders
    if (!currentEst || !canEstablishmentReceiveOrders(currentEst)) return true;

    // Check availability of chosen delivery type
    if (deliveryType === 'entrega') {
      const entregaPropria = currentEst.entregaPropria !== false;
      if (!entregaPropria) return true;
      if (quoteLoading) return true;
      if (!quoteAvailable) return true;
      if (quoteError !== null) return true;
      if (!bairro || bairro.trim() === '') return true;
      if (cartSubtotal < quoteMinOrderValue) return true;
    } else if (deliveryType === 'retirada') {
      const atendeRetirada = currentEst.atendeRetirada !== false;
      if (!atendeRetirada) return true;
      if (cartSubtotal < quoteMinOrderValue) return true;
    } else {
      return true; // Unknown delivery type
    }
    
    return false;
  }, [authLoading, currentEst, deliveryType, quoteLoading, quoteAvailable, quoteError, bairro, cartSubtotal, quoteMinOrderValue]);

  const submitButtonLabel = useMemo(() => {
    if (!currentEst || !canEstablishmentReceiveOrders(currentEst)) {
      return "Estabelecimento Fechado";
    }
    if (deliveryType === 'entrega') {
      const entregaPropria = currentEst.entregaPropria !== false;
      if (!entregaPropria) return "Entrega Indisponível";
      if (quoteLoading) return "Calculando Taxa...";
      if (!bairro || bairro.trim() === '') return "Informe o Bairro";
      if (quoteError !== null || !quoteAvailable) return "Entrega Indisponível";
      if (cartSubtotal < quoteMinOrderValue) return "Abaixo do Pedido Mínimo";
    } else {
      const atendeRetirada = currentEst.atendeRetirada !== false;
      if (!atendeRetirada) return "Retirada Indisponível";
      if (cartSubtotal < quoteMinOrderValue) return "Abaixo do Pedido Mínimo";
    }
    return "Finalizar e Enviar Pedido";
  }, [currentEst, deliveryType, quoteLoading, bairro, quoteError, quoteAvailable, cartSubtotal, quoteMinOrderValue]);

  // Apply Coupon
  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponDiscount(0);
      return;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          code,
          establishmentId: currentEst.id,
          subtotal: cartSubtotal,
          deliveryFee
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Cupom inválido ou expirado.");
      }

      setCouponDiscount(data.discount);
      showToast(data.message || `Cupom ${code} aplicado com sucesso!`, 'success');
    } catch (err: any) {
      setCouponDiscount(0);
      showToast(err.message || 'Cupom inválido ou expirado.', 'error');
    }
  };

  // Handle checkout submit
  const handlePlaceOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure the client is fully authenticated and has the active customer role
    if (
      authLoading ||
      !currentUser?.uid ||
      !userProfile ||
      userProfile.role !== "customer" ||
      userProfile.active !== true
    ) {
      // Save all checkout fields to sessionStorage to preserve state
      const checkoutState = {
        customerName,
        customerPhone,
        street,
        number,
        bairro,
        complement,
        deliveryType,
        paymentMethod,
        changeRequired,
        changeFor,
        checkoutNotes,
        couponCode,
        couponDiscount,
        isCheckoutOpen: true
      };
      sessionStorage.setItem('uaipertim_checkout_state', JSON.stringify(checkoutState));
      sessionStorage.setItem('redirect_after_login', '/');

      // Open the auth required modal
      setShowAuthRequiredModal(true);
      return;
    }

    if (!customerName || !customerPhone || (deliveryType === 'entrega' && (!street || !number || !bairro))) {
      showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }

    // Secure quote & delivery validation
    if (deliveryType === 'entrega' && !quoteAvailable) {
      showToast(quoteError || 'Este estabelecimento não realiza entregas no seu bairro.', 'error');
      return;
    }

    if (cartSubtotal < quoteMinOrderValue) {
      showToast(`O subtotal (R$ ${cartSubtotal.toFixed(2).replace('.', ',')}) é menor que o pedido mínimo exigido para este local (R$ ${quoteMinOrderValue.toFixed(2).replace('.', ',')}).`, 'error');
      return;
    }

    // Money change validation
    let parsedChangeFor: number | null = null;
    if (paymentMethod === 'cash') {
      if (changeRequired) {
        if (!changeFor) {
          showToast('Por favor, informe o valor para o troco.', 'error');
          return;
        }
        const val = parseFloat(changeFor.replace(',', '.'));
        if (isNaN(val) || val < cartTotal) {
          showToast(`O valor para troco deve ser maior ou igual ao total do pedido (R$ ${cartTotal.toFixed(2).replace('.', ',')}).`, 'error');
          return;
        }
        parsedChangeFor = val;
      }
    }

    // Confirmation checkbox validation
    if (!confirmPaymentToEst) {
      showToast('Você precisa confirmar que o pagamento será feito diretamente ao estabelecimento.', 'error');
      return;
    }

    // Validate establishment availability again immediately before confirmation
    if (!canEstablishmentReceiveOrders(currentEst)) {
      showToast(
        "O estabelecimento deixou de aceitar pedidos durante a finalização. Seu carrinho foi preservado, mas o pedido não poderá ser enviado agora.",
        "error"
      );
      setIsCheckoutOpen(false); // Return the client to the cart
      setIsCartOpen(true);
      return;
    }

    try {
      let finalAddressId = selectedAddressId;
      if (deliveryType === 'entrega' && !finalAddressId && currentUser?.uid) {
        try {
          const newId = await addressService.addAddress(currentUser.uid, {
            label: 'Casa',
            recipientName: customerName,
            phone: customerPhone,
            zipCode: '37940-000',
            street,
            number,
            neighborhood: bairro,
            cityId: currentEst.cityId || 'sao-joao-batista-do-gloria-mg',
            cityName: currentEst.cityName || 'São João Batista do Glória',
            state: currentEst.state || 'MG',
            isDefault: true
          });
          finalAddressId = newId;
          setSelectedAddressId(newId);
        } catch (addrErr) {
          console.error("Error creating address automatically during checkout:", addrErr);
          showToast('Erro ao processar o endereço de entrega no servidor.', 'error');
          return;
        }
      }

      const orderObj = await placeOrder({
        addressId: finalAddressId,
        customerId: currentUser?.uid,
        customerName,
        customerPhone,
        customerAddress: {
          street: deliveryType === 'entrega' ? street : 'Retirada no estabelecimento',
          number: deliveryType === 'entrega' ? number : '-',
          bairro: deliveryType === 'entrega' ? bairro : '-',
          complement: deliveryType === 'entrega' ? complement : undefined
        },
        items: cart.map((item) => normalizeOrderItem(item)),
        subtotal: cartSubtotal,
        deliveryFee,
        discount: couponDiscount,
        couponCode: couponCode ? couponCode.trim().toUpperCase() : undefined,
        total: cartTotal,
        paymentMethod,
        deliveryType,
        notes: checkoutNotes,
        paymentStatus: 'pending',
        paymentLocation: deliveryType === 'entrega' ? 'delivery' : 'pickup',
        changeRequired,
        changeFor: parsedChangeFor,
        platformProcessedPayment: false
      });

      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      // Reset states
      setChangeRequired(false);
      setChangeFor('');
      setConfirmPaymentToEst(false);
      
      // Redirect directly to the standalone tracking page
      navigate(`/acompanhar-pedido/${orderObj.id}`);
    } catch (e: any) {
      showToast(e.message || "Erro ao criar o pedido. Tente novamente.", 'error');
    }
  };

  // Filter orders related to this mock customer (we show all client orders)
  const clientOrders = useMemo(() => {
    return orders;
  }, [orders]);

  const getStatusStep = (status: string) => {
    switch (status) {
      case 'aguardando_confirmacao': return 1;
      case 'confirmado': return 2;
      case 'em_preparacao': return 3;
      case 'pronto': return 4;
      case 'pronto_retirada': return 4;
      case 'saiu_entrega': return 5;
      case 'concluido': return 6;
      case 'recusado': return -1;
      default: return 1;
    }
  };

  const getTimelineSteps = (order: Order) => {
    const isEntrega = order.deliveryType === 'entrega';
    
    // Status values for Delivery timeline
    const statusValuesEntrega: Record<string, number> = {
      'recusado': -1,
      'aguardando_confirmacao': 1,
      'confirmado': 2,
      'em_preparacao': 3,
      'pronto': 4,
      'pronto_retirada': 4,
      'saiu_entrega': 5,
      'concluido': 6
    };

    // Status values for Pick-up (Retirada) timeline
    const statusValuesRetirada: Record<string, number> = {
      'recusado': -1,
      'aguardando_confirmacao': 1,
      'confirmado': 2,
      'em_preparacao': 3,
      'pronto': 3,
      'pronto_retirada': 4,
      'saiu_entrega': 4,
      'concluido': 5
    };

    const currentVal = isEntrega 
      ? (statusValuesEntrega[order.status] || 1) 
      : (statusValuesRetirada[order.status] || 1);

    if (isEntrega) {
      return [
        { label: 'Aguardando', val: 1 },
        { label: 'Confirmado', val: 2 },
        { label: 'Em preparo', val: 3 },
        { label: 'Pronto', val: 4 },
        { label: 'Em entrega', val: 5 },
        { label: 'Concluído', val: 6 }
      ].map(s => ({
        ...s,
        isActive: currentVal >= s.val,
        isCurrent: currentVal === s.val
      }));
    } else {
      return [
        { label: 'Aguardando', val: 1 },
        { label: 'Confirmado', val: 2 },
        { label: 'Em preparo', val: 3 },
        { label: 'Pronto para retirada', val: 4 },
        { label: 'Concluído', val: 5 }
      ].map(s => ({
        ...s,
        isActive: currentVal >= s.val,
        isCurrent: currentVal === s.val
      }));
    }
  };

  return (
    <div className="bg-[#F7F4EF] min-h-screen pb-16 text-[#201A17]" id="client-area-wrapper">
      
      {/* Sub Header / Client Bar - ONLY on demo route */}
      {isDemo && (
        <div className={`bg-white shadow-sm border-b border-[#EADFD8] py-3 sticky z-40 ${isDemo ? 'top-[144px] md:top-[102px]' : 'top-[112px] md:top-[72px]'}`}>
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <button
              onClick={() => setIsCityModalOpen(true)}
              className="flex items-center gap-2 text-left hover:opacity-85 transition-opacity cursor-pointer group w-full sm:w-auto"
              title="Clique para mudar a cidade de entrega"
            >
              <MapPin className="w-5 h-5 text-[#E94F2F] group-hover:scale-110 transition-transform shrink-0" />
              <div>
                <p className="text-[10px] text-[#756B66] uppercase tracking-wider font-extrabold leading-none">Entregar em</p>
                <h4 className="text-sm font-black text-[#201A17] flex items-center flex-wrap gap-1">
                  {selectedCity.name} - {selectedCity.state}
                  <span className="text-[10px] text-[#E94F2F] font-bold underline bg-[#E94F2F]/10 px-1.5 py-0.5 rounded-full ml-1.5">Alterar</span>
                </h4>
              </div>
            </button>

            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
              <button
                onClick={() => setClientSubView(clientSubView === 'tracking' ? 'home' : 'tracking')}
                className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-[#756B66] hover:text-[#E94F2F] bg-[#F7F4EF] px-3 py-1.5 rounded-lg border border-[#EADFD8] flex-1 sm:flex-initial"
              >
                <Clipboard className="w-4 h-4 shrink-0" />
                <span>Acompanhar Pedidos ({clientOrders.length})</span>
              </button>

              {/* Cart Button */}
              <button
                onClick={() => setIsCartOpen(true)}
                className="hidden sm:flex bg-[#E94F2F] hover:bg-[#BD351C] text-white px-4 py-2 rounded-xl items-center justify-center gap-2 shadow-md transition-transform active:scale-95 font-bold text-sm relative sm:flex-initial"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Carrinho</span>
                <span className="bg-[#FFBE5C] text-[#201A17] text-xs font-black px-2 py-0.5 rounded-full">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isSpecialRoute ? (
        <div className="w-full">
          {isAccountRoute && <MyAccount />}
          {isTrackingRoute && <OrderTrackingPage />}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          
          {clientSubView === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Banner Carrossel */}
            <div 
              className="relative rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden min-h-[320px] sm:min-h-[360px]"
              style={{ touchAction: 'pan-y' }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              <AnimatePresence mode="wait">
                {/* Slide 1: Original Banner */}
                {activeIndex === 0 && (
                  <motion.div
                    key="slide1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-gradient-to-br from-[#E94F2F] to-[#BD351C] text-white p-6 sm:p-8 md:p-12 flex flex-col justify-center"
                  >
                    <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-15 hidden md:block">
                      <img 
                        src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=60" 
                        alt="Background Pizza" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="eager"
                        decoding="async"
                        {...{ fetchPriority: "high" }}
                      />
                    </div>
                    <div className="max-w-2xl relative z-10 space-y-3 sm:space-y-4">
                      <span className="bg-[#FFBE5C] text-[#201A17] text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Startup Regional
                      </span>
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight">
                        O melhor da sua cidade, em um só lugar.
                      </h2>
                      <p className="text-xs sm:text-sm md:text-base text-white/95 font-medium leading-relaxed max-w-lg">
                        Encontre restaurantes, mercados e sabores locais. Peça pelo celular e acompanhe tudo em tempo real.
                      </p>
                      
                      {/* Search Bar */}
                      <div className="pt-2">
                        <div className="bg-white rounded-2xl p-1.5 shadow-lg flex items-center gap-2 max-w-md border border-[#EADFD8]">
                          <Search className="w-5 h-5 text-[#756B66] ml-3" />
                          <input
                            type="text"
                            placeholder="Busque por comida ou estabelecimento..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 px-1 py-2 text-sm text-[#201A17] outline-none placeholder:text-[#756B66]"
                          />
                          {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-[#756B66] hover:text-[#201A17]">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Slide 2: Fidelity Banner */}
                {activeIndex === 1 && (
                  <motion.div
                    key="slide2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-[#FFF5EE] text-[#201A17] p-6 sm:p-8 md:p-12 flex flex-col justify-center border border-[#EADFD8]"
                  >
                    <div className="max-w-xl relative z-10 space-y-3 sm:space-y-4">
                      <span className="bg-[#E94F2F] text-white text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                        FIDELIDADE UAI
                      </span>
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight text-[#E94F2F]">
                        Compre pertim.<br />Ganhe pontos.<br />Aproveite mais.
                      </h2>
                      <p className="text-xs sm:text-sm md:text-base text-[#756B66] font-medium leading-relaxed max-w-lg">
                        A cada pedido concluído, você acumula Pão de Queijo Points para trocar por descontos e benefícios.
                      </p>
                      <div className="pt-2">
                        <button 
                            onClick={() => setIsFidelityModalOpen(true)}
                            className="bg-[#E94F2F] text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-[#BD351C] transition-colors shadow-lg"
                        >
                          Conhecer o programa
                        </button>
                      </div>
                    </div>
                    {/* Visual composition for fidelity */}
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 w-48 h-48 hidden md:flex items-center justify-center">
                      <div className="relative w-40 h-32 bg-[#FFBE5C] rounded-xl shadow-lg rotate-3 p-4 flex flex-col justify-between">
                         <div className="flex justify-between items-start">
                            <Medal className="w-6 h-6 text-[#E94F2F]" />
                            <span className="text-[9px] font-black text-[#201A17] bg-white/50 px-1.5 py-0.5 rounded">BRONZE</span>
                         </div>
                         <div className="space-y-1">
                            <div className="text-xl font-black text-[#201A17]">+30</div>
                            <div className="w-full h-1 bg-white/50 rounded-full overflow-hidden">
                                <div className="w-1/3 h-full bg-[#E94F2F]" />
                            </div>
                         </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation Controls */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20">
                {[0, 1].map((index) => (
                  <button
                    key={index}
                    onClick={() => setActiveIndex(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      activeIndex === index ? 'bg-[#E94F2F] w-6' : 'bg-[#E94F2F]/30'
                    }`}
                    aria-label={`Ir para slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            {isFidelityModalOpen && (
                <FidelityModal onClose={() => setIsFidelityModalOpen(false)} />
            )}

        {/* Categorias */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base sm:text-lg font-black text-[#201A17] tracking-tight">Categorias recomendadas</h3>
                <button 
                  type="button"
                  onClick={() => setIsAllCategoriesModalOpen(true)}
                  className="text-[#E94F2F] hover:text-[#c43c1f] text-xs sm:text-sm font-bold transition-colors cursor-pointer hover:underline"
                >
                  Ver todas
                </button>
              </div>

              {/* Mobile View: Horizontal Scroll */}
              <div className="block md:hidden">
                <div 
                  ref={mobileScrollRef}
                  onMouseDown={handleMobileMouseDown}
                  onMouseMove={handleMobileMouseMove}
                  onMouseUp={handleMobileMouseUp}
                  onMouseLeave={handleMobileMouseLeave}
                  className={`flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden pb-2 category-scroll scroll-smooth overscroll-x-contain select-none -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x snap-proximity ${mobileIsDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  {homeCategories.map((label) => {
                    const catId = getCategoryIdByLabel(label);
                    const style = getCategoryStyle(catId);
                    const IconComponent = style.icon;
                    const isSelected = selectedCategory === label;

                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={(e) => {
                          if (mobileDraggedDistance > 8) {
                            e.preventDefault();
                            return;
                          }
                          setSelectedCategory(label);
                          e.currentTarget.scrollIntoView({
                            behavior: "smooth",
                            inline: "center",
                            block: "nearest"
                          });
                        }}
                        aria-pressed={isSelected}
                        aria-label={`Categoria ${label}`}
                        className="flex flex-col items-center gap-1.5 shrink-0 snap-start focus:outline-none select-none group cursor-pointer"
                        style={{ width: '72px', flex: '0 0 auto' }}
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                            isSelected
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F] shadow-lg shadow-[#E94F2F]/15 scale-105'
                              : `bg-white border-[#EADFD8] group-hover:border-[#E94F2F]/40 group-hover:bg-[#FAF8F6]`
                          }`}
                        >
                          <IconComponent 
                            className={`w-6 h-6 transition-colors ${isSelected ? 'text-white' : style.text}`} 
                          />
                        </div>
                        <span
                          className={`text-[10px] sm:text-[11px] font-bold text-center tracking-tight transition-colors break-words w-full h-8 flex items-center justify-center leading-tight line-clamp-2 ${
                            isSelected ? 'text-[#E94F2F] font-extrabold' : 'text-[#756B66] group-hover:text-[#201A17]'
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Desktop View: Compact Multi-category Horizontal Row */}
              <div className="hidden md:block">
                <div 
                  ref={desktopScrollRef}
                  onMouseDown={handleDesktopMouseDown}
                  onMouseMove={handleDesktopMouseMove}
                  onMouseUp={handleDesktopMouseUp}
                  onMouseLeave={handleDesktopMouseLeave}
                  className={`flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden pb-2 category-scroll scroll-smooth overscroll-x-contain select-none snap-x snap-proximity ${desktopIsDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  {allCategoriesList.map((label) => {
                    const catId = getCategoryIdByLabel(label);
                    const style = getCategoryStyle(catId);
                    const IconComponent = style.icon;
                    const isSelected = selectedCategory === label;

                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={(e) => {
                          if (desktopDraggedDistance > 8) {
                            e.preventDefault();
                            return;
                          }
                          setSelectedCategory(label);
                          e.currentTarget.scrollIntoView({
                            behavior: "smooth",
                            inline: "center",
                            block: "nearest"
                          });
                        }}
                        aria-pressed={isSelected}
                        aria-label={`Categoria ${label}`}
                        className="flex flex-col items-center gap-1.5 shrink-0 snap-start focus:outline-none select-none group cursor-pointer"
                        style={{ width: '80px', flex: '0 0 auto' }}
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                            isSelected
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F] shadow-lg shadow-[#E94F2F]/15 scale-105'
                              : `bg-white border-[#EADFD8] group-hover:border-[#E94F2F]/40 group-hover:bg-[#FAF8F6]`
                          }`}
                        >
                          <IconComponent 
                            className={`w-6 h-6 transition-colors ${isSelected ? 'text-white' : style.text}`} 
                          />
                        </div>
                        <span
                          className={`text-[10px] sm:text-[11px] font-bold text-center tracking-tight transition-colors break-words w-full h-8 flex items-center justify-center leading-tight line-clamp-2 ${
                            isSelected ? 'text-[#E94F2F] font-extrabold' : 'text-[#756B66] group-hover:text-[#201A17]'
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Lista de Estabelecimentos */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h3 id="establishments-section-title" className="text-xl font-black text-[#201A17] tracking-tight flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const prefix = (() => {
                      if (selectedCategory === 'Todos') return 'Estabelecimentos';
                      if (selectedCategory === 'Destaques') return 'Destaques';
                      const categoryTitles: Record<string, string> = {};
                      PUBLIC_ESTABLISHMENT_CATEGORIES.forEach(cat => {
                        categoryTitles[cat.label] = cat.homeTitle;
                      });
                      return categoryTitles[selectedCategory] || selectedCategory;
                    })();
                    return (
                      <>
                        <span>{prefix}</span>
                        <span className="text-[#E94F2F] font-black">
                          em {selectedCity.name}
                        </span>
                      </>
                    );
                  })()}
                </h3>
                <span className="text-xs font-bold text-[#756B66] bg-white border border-[#EADFD8] px-2.5 py-1 rounded-full">
                  {filteredEstablishments.length} {filteredEstablishments.length === 1 ? 'encontrado' : 'encontrados'}
                </span>
              </div>

              {filteredEstablishments.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-[#EADFD8] space-y-3">
                  <p className="text-[#756B66] font-medium">
                    Nenhum estabelecimento encontrado {selectedCategory !== 'Todos' ? `na categoria ${selectedCategory}` : ''} para a cidade de <strong>{selectedCity.name} - {selectedCity.state}</strong>.
                  </p>
                  <button 
                    onClick={() => { setSelectedCategory('Todos'); setSearchQuery(''); }}
                    className="text-[#E94F2F] text-xs font-bold underline"
                  >
                    Ver todos os estabelecimentos
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {filteredEstablishments.map((est, index) => {
                    const opState = (() => {
                      const platformStatus = est.platformStatus || (est.active ? 'active' : 'inactive');
                      const isPaused = est.operationalPause === true || est.temporarilyPaused === true;
                      
                      if (platformStatus !== 'active') {
                        return 'indisponivel';
                      }
                      if (isPaused) {
                        return 'pausado';
                      }
                      
                      const isOpen = est.open !== undefined ? est.open === true : (est.isOpen !== undefined ? est.isOpen === true : true);
                      const acceptingOrders = est.acceptingOrders !== undefined ? est.acceptingOrders === true : true;
                      const isEstOpen = canEstablishmentReceiveOrders(est);

                      if (isOpen && acceptingOrders && isEstOpen) {
                        return 'aberto';
                      }
                      return 'fechado';
                    })();

                    const isAberto = opState === 'aberto';
                    let badgeText = 'Aberto';
                    let badgeClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-semibold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full';
                    let imgClass = 'w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl object-cover shrink-0 bg-gray-100 transition-all';
                    let buttonText = 'Pedir agora';
                    let nextTimeText = null;

                    if (opState === 'indisponivel') {
                      badgeText = 'Indisponível';
                      badgeClass = 'bg-neutral-50 text-neutral-600 border border-neutral-200/60 font-semibold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full';
                      imgClass += ' opacity-50 grayscale';
                      buttonText = 'Indisponível';
                    } else if (opState === 'pausado') {
                      badgeText = 'Pausado';
                      badgeClass = 'bg-amber-50 text-amber-800 border border-amber-200/60 font-semibold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full';
                      imgClass += ' opacity-60 grayscale';
                      buttonText = 'Pausado';
                    } else if (opState === 'fechado') {
                      badgeText = 'Fechado';
                      badgeClass = 'bg-[#F5F2F0] text-[#5A514B] border border-[#E4DDD7] font-semibold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full';
                      imgClass += ' opacity-60 grayscale';
                      buttonText = 'Fechado no momento';
                      nextTimeText = getNextOpeningTimeText(est.businessHours || businessHours);
                    } else {
                      badgeText = 'Aberto';
                      badgeClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-semibold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full';
                    }

                    const isPartner = est.isFeaturedPartner === true || est.featured === true || est.id === 'pizzaria-da-praca';

                    return (
                      <div 
                        key={est.id}
                        onClick={isAberto ? () => handleViewMenu(est.id) : undefined}
                        onKeyDown={isAberto ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleViewMenu(est.id);
                          }
                        } : undefined}
                        tabIndex={isAberto ? 0 : -1}
                        role={isAberto ? "button" : undefined}
                        aria-disabled={!isAberto ? "true" : undefined}
                        aria-label={isAberto ? `Ver cardápio de ${est.name}` : `Estabelecimento fechado. ${nextTimeText || ''}`}
                        className={
                          isAberto
                            ? `bg-white rounded-2xl border p-3 sm:p-4 flex flex-row gap-3 sm:gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer relative ${
                                isPartner 
                                  ? 'border-[#E94F2F]/40 ring-1 ring-[#E94F2F]/10 bg-gradient-to-br from-orange-50/10 to-white' 
                                  : 'border-[#EADFD8] hover:border-[#E94F2F]/40'
                              }`
                            : `bg-[#FAF9F7] rounded-2xl border border-[#E8DDD5] p-3 sm:p-4 flex flex-row gap-3 sm:gap-4 shadow-none cursor-not-allowed relative`
                        }
                      >
                        {isPartner && (
                          <span className="absolute -top-3 left-4 bg-orange-50 text-[#E94F2F] border border-[#E94F2F]/30 text-[9px] sm:text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs z-10 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#E94F2F]" />
                            Parceiro UaiPertim
                          </span>
                        )}

                        <EstablishmentImage src={resolveEstablishmentLogo(est)} alt={est.name} fallbackType="logo" className={imgClass} loading={index < 6 ? 'eager' : 'lazy'} />
                        
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <h4 className={`font-extrabold text-[#201A17] text-sm sm:text-base md:text-lg leading-snug truncate ${!isAberto ? 'opacity-65' : ''}`}>{est.name}</h4>
                              <span className={`shrink-0 ${badgeClass}`}>
                                {badgeText}
                              </span>
                            </div>
                            <p className={`text-[11px] sm:text-xs text-[#756B66] font-medium mt-0.5 ${!isAberto ? 'opacity-65' : ''}`}>
                              {getCategoryLabel(est.category || est.categoryId)} • {est.city}
                              {nextTimeText && <span className="block text-[10px] sm:text-[11px] text-[#C44327] font-semibold mt-1">{nextTimeText}</span>}
                            </p>
                            
                            <div className={`flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 mt-1.5 text-[10px] sm:text-xs text-[#201A17] font-semibold ${!isAberto ? 'opacity-65' : ''}`}>
                              <span className="flex items-center gap-0.5 text-amber-600">
                                <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-[#FFBE5C]" />
                                {est.rating}
                              </span>
                              <span className="text-[#EADFD8]">|</span>
                              <span className="flex items-center gap-0.5 text-[#756B66]">
                                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                {est.deliveryTime || 'Prazo sob consulta'}
                              </span>
                              <span className="text-[#EADFD8]">|</span>
                              <span className="text-[#2F9E69]">
                                {est.deliveryFee === undefined || est.deliveryFee === null
                                  ? 'Calcular entrega'
                                  : est.deliveryFee === 0 
                                    ? 'Grátis' 
                                    : `R$ ${est.deliveryFee.toFixed(2).replace('.', ',')}`}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-[#F7F4EF]">
                            <span className={`text-[9px] sm:text-[10px] text-[#756B66] font-bold ${!isAberto ? 'opacity-65' : ''}`}>Min: R$ {est.minOrderValue.toFixed(2)}</span>
                            {isAberto ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewMenu(est.id);
                                }}
                                className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg font-bold text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-colors cursor-pointer"
                              >
                                <span>{buttonText}</span>
                                <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                            ) : (
                              <button
                                disabled
                                className="bg-[#EADFD8]/30 text-[#756B66]/60 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg font-bold text-[10px] sm:text-xs flex items-center cursor-not-allowed border border-[#E8DDD5]"
                              >
                                <span>{buttonText}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* -------------------- CARDÁPIO DO ESTABELECIMENTO -------------------- */}
        {clientSubView === 'menu' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Botão voltar */}
            <button
              onClick={() => setClientSubView('home')}
              className="inline-flex items-center gap-2 text-xs font-black text-[#E94F2F] hover:text-[#BD351C] bg-white border border-[#EADFD8] px-4 py-2 rounded-xl shadow-sm transition-transform active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para lojas</span>
            </button>

            {/* Merchant Details Hero */}
            <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-sm relative">
              <div className="h-40 md:h-48 relative bg-neutral-100">
                <EstablishmentImage 
                  src={resolveEstablishmentCover(currentEst)}
                  alt={currentEst.name} 
                  fallbackType="cover"
                  className="w-full h-full object-cover" 
                />
                {/* Delivery Fee Badge */}
                <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm text-neutral-900 text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                  {currentEst.deliveryFee === undefined || currentEst.deliveryFee === null
                    ? 'Calcular entrega'
                    : currentEst.deliveryFee === 0 
                      ? 'Entrega grátis' 
                      : `Entrega R$ ${currentEst.deliveryFee.toFixed(2).replace('.', ',')}`}
                </div>
              </div>

              <div className="px-6 md:px-8 pb-8 pt-12 relative">
                {/* Logo (Overlapping) */}
                <div className="absolute -top-12 left-6 w-20 h-20 md:w-24 md:h-24 rounded-3xl border-4 border-white bg-white shadow-lg p-1.5 overflow-hidden shrink-0">
                  <EstablishmentImage 
                    src={resolveEstablishmentLogo(currentEst)}
                    alt="Logo" 
                    fallbackType="logo"
                    className="w-full h-full object-contain" 
                  />
                </div>

                <div className="flex flex-col gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-2xl md:text-3xl font-black text-[#201A17] tracking-tighter">{currentEst.name}</h2>
                      {(() => {
                        const platformStatus = currentEst.platformStatus || (currentEst.active ? 'active' : 'inactive');
                        const isPaused = currentEst.operationalPause === true || currentEst.temporarilyPaused === true;
                        const isCurrentEstOpen = canEstablishmentReceiveOrders(currentEst);

                        let headerBadgeText = 'ABERTO';
                        let headerBadgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';

                        if (platformStatus !== 'active') {
                          headerBadgeText = 'INDISPONÍVEL';
                          headerBadgeClass = 'bg-neutral-50 text-neutral-600 border border-neutral-100';
                        } else if (isPaused) {
                          headerBadgeText = 'PAUSADO';
                          headerBadgeClass = 'bg-amber-50 text-amber-700 border border-amber-100';
                        } else if (!isCurrentEstOpen) {
                          headerBadgeText = 'FECHADO';
                          headerBadgeClass = 'bg-rose-50 text-rose-700 border border-rose-100';
                        }

                        return (
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${headerBadgeClass}`}>
                            {headerBadgeText}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-sm text-[#756B66] font-medium leading-relaxed">
                      {getCategoryLabel(currentEst.category || currentEst.categoryId)} • {currentEst.address} • {currentEst.phone}
                    </p>
                  </div>

                  {/* Indicators Grid */}
                  <div className={`grid ${(currentEst.isFeaturedPartner || currentEst.featured || currentEst.id === 'pizzaria-da-praca') ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'} gap-3 pt-4 border-t border-[#F7F4EF]`}>
                    <div className="px-3 py-2 bg-[#F7F4EF]/50 rounded-xl border border-[#F7F4EF]">
                      <p className="text-[9px] text-[#A39994] font-black uppercase tracking-wider leading-none">Avaliação</p>
                      <p className="text-sm font-black text-[#201A17] mt-1 flex items-center gap-1">
                        <Star className="w-3 h-3 fill-current text-[#FFBE5C]" /> {currentEst.rating}
                      </p>
                    </div>
                    <div className="px-3 py-2 bg-[#F7F4EF]/50 rounded-xl border border-[#F7F4EF]">
                      <p className="text-[9px] text-[#A39994] font-black uppercase tracking-wider leading-none">Entrega</p>
                      <p className="text-sm font-black text-[#201A17] mt-1">{currentEst.deliveryTime}</p>
                    </div>
                    <div className="px-3 py-2 bg-[#F7F4EF]/50 rounded-xl border border-[#F7F4EF]">
                      <p className="text-[9px] text-[#A39994] font-black uppercase tracking-wider leading-none">Mínimo</p>
                      <p className="text-sm font-black text-[#201A17] mt-1">R$ {currentEst.minOrderValue.toFixed(2).replace('.', ',')}</p>
                    </div>
                    {(currentEst.isFeaturedPartner || currentEst.featured || currentEst.id === 'pizzaria-da-praca') && (
                      <div className="px-3 py-2 bg-[#FFF5F2] rounded-xl border border-[#FFE8E0]">
                        <p className="text-[9px] text-[#E94F2F] font-black uppercase tracking-wider leading-none">Parceria</p>
                        <p className="text-sm font-black text-[#E94F2F] mt-1">UaiPertim</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Banner destacado se não puder receber pedidos */}
            {!canEstablishmentReceiveOrders(currentEst) && (
              <div className="bg-rose-50 border border-rose-200 text-rose-950 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                <div className="space-y-1">
                  <h4 className="text-base font-black tracking-tight flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse shrink-0"></span>
                    {currentEst.suspended === true ? (
                      "Este estabelecimento está temporariamente indisponível."
                    ) : currentEst.temporarilyPaused === true ? (
                      "Pedidos temporariamente pausados"
                    ) : currentEst.acceptingOrders === false ? (
                      "Não está aceitando pedidos agora"
                    ) : (
                      "Este estabelecimento está fechado no momento."
                    )}
                  </h4>
                  <p className="text-xs text-rose-800 font-medium leading-relaxed">
                    {currentEst.suspended === true ? (
                      "Pedimos desculpas pelo transtorno. O cardápio continua disponível para consulta."
                    ) : currentEst.temporarilyPaused === true ? (
                      "O estabelecimento pausou o recebimento de novos pedidos por alguns instantes."
                    ) : currentEst.acceptingOrders === false ? (
                      "O cardápio continua disponível para consulta."
                    ) : (
                      <>
                        Você pode consultar o cardápio, mas novos pedidos só poderão ser feitos quando a loja estiver aberta.
                        {getNextOpeningTimeText(businessHours) && (
                          <span className="block text-rose-700 font-black mt-1">
                            {getNextOpeningTimeText(businessHours)}
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-xs bg-rose-100 border border-rose-300 text-rose-900 px-3 py-1.5 rounded-lg font-bold">
                  Consulta Apenas
                </div>
              </div>
            )}

            {/* Menu Sections & Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Category Anchor Side Menu */}
              <div className="lg:col-span-1 space-y-2 lg:sticky lg:top-[180px] self-start">
                <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider px-3">Categorias do Cardápio</h4>
                <div className="bg-white rounded-2xl border border-[#EADFD8] p-2 space-y-1">
                  {menuCategories.length === 0 ? (
                    <p className="text-xs text-[#756B66] p-3 text-center font-medium">Nenhuma categoria cadastrada.</p>
                  ) : (
                    menuCategories.map((cat) => (
                      <a
                        key={cat.id}
                        href={`#cat-${cat.id}`}
                        className="block px-3 py-2 rounded-xl text-xs font-bold text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17] transition-colors"
                      >
                        {cat.name}
                      </a>
                    ))
                  )}
                </div>
              </div>

              {/* Products list grouped by Category */}
              <div className="lg:col-span-3 space-y-10">
                {menuCategories.length === 0 ? (
                  <div className="bg-white p-12 text-center rounded-3xl border border-[#EADFD8]">
                    <p className="text-[#756B66] font-medium">Este estabelecimento ainda não cadastrou produtos no cardápio.</p>
                  </div>
                ) : (
                  menuCategories.map((cat) => {
                    const catProducts = currentProducts.filter(p => p.menuCategoryId === cat.id && p.available !== false && (p as any).active !== false);
                    return (
                      <div 
                        key={cat.id} 
                        id={`cat-${cat.id}`}
                        className="space-y-4 scroll-mt-48"
                      >
                        <h3 className="text-xl font-black text-[#201A17] border-b border-[#EADFD8] pb-2 tracking-tight">
                          {cat.name}
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          {catProducts.map((prod, idx) => (
                            <div
                              key={prod.id}
                              onClick={() => handleOpenProduct(prod)}
                              className={`group bg-white rounded-2xl border border-[#EADFD8]/50 p-4 flex gap-4 cursor-pointer hover:border-[#E94F2F]/30 hover:shadow-md hover:shadow-orange-500/[0.01] transition-all duration-300 relative ${
                                !prod.available ? 'opacity-65' : ''
                              }`}
                            >
                              <div className="flex-1 flex flex-col justify-between min-w-0">
                                <div className="space-y-1.5">
                                  {/* Badges / Status */}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {idx === 0 && prod.available && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-[#E94F2F] bg-[#E94F2F]/10 px-2 py-0.5 rounded-full uppercase tracking-wider leading-none">
                                        <Sparkles className="w-2.5 h-2.5 shrink-0" /> Mais pedido
                                      </span>
                                    )}
                                    {prod.category.toLowerCase().includes('combo') && prod.available && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider leading-none">
                                        <Award className="w-2.5 h-2.5 shrink-0" /> Combo Especial
                                      </span>
                                    )}
                                    {!prod.available && (
                                      <span className="bg-neutral-100 text-neutral-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider leading-none">
                                        Esgotado
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="font-extrabold text-[#201A17] text-sm md:text-base leading-tight group-hover:text-[#E94F2F] transition-colors duration-200 truncate">
                                    {prod.name}
                                  </h4>
                                  <p className="text-[11px] sm:text-xs text-[#756B66] font-medium line-clamp-2 leading-relaxed">
                                    {prod.description}
                                  </p>
                                </div>

                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#F7F4EF]">
                                  <span className="text-sm sm:text-base font-black text-[#2F9E69]">
                                    R$ {prod.price.toFixed(2).replace('.', ',')}
                                  </span>
                                  
                                  {prod.available && (
                                    canEstablishmentReceiveOrders(currentEst) ? (
                                      <span className="bg-[#FAF8F5] text-[#E94F2F] group-hover:bg-[#E94F2F] group-hover:text-white border border-[#EADFD8]/40 group-hover:border-transparent p-1.5 sm:p-2 rounded-xl transition-all duration-300 shrink-0 shadow-xs">
                                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                                      </span>
                                    ) : (
                                      <span className="text-[9px] sm:text-[10px] text-rose-600 font-black bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg transition-colors shrink-0">
                                        {currentEst.suspended === true ? "Indisponível" : "Ver detalhes"}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>

                              {prod.image && prod.image.trim() !== "" && (
                                <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-[#FAF8F5] border border-[#EADFD8]/15 shrink-0 shadow-xs relative self-center">
                                  <img 
                                    src={prod.image || undefined} 
                                    alt={prod.name} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    referrerPolicy="no-referrer"
                                    loading="lazy"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* -------------------- LINHA DO TEMPO / ACOMPANHAMENTO -------------------- */}
        {clientSubView === 'tracking' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
              <button
                onClick={() => setClientSubView('home')}
                className="inline-flex items-center justify-center gap-2 text-xs font-black text-[#E94F2F] hover:text-[#BD351C] bg-white border border-[#EADFD8] px-4 py-2.5 rounded-xl shadow-sm transition-transform active:scale-95 w-full sm:w-auto shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para as lojas</span>
              </button>
              <h2 className="text-xl font-black text-[#201A17] tracking-tight text-left sm:text-right">Meus Pedidos Ativos</h2>
            </div>

            {clientOrders.length === 0 ? (
              <div className="bg-white p-12 md:p-16 text-center rounded-3xl border border-[#EADFD8] space-y-4">
                <ShoppingBag className="w-12 h-12 text-[#756B66]/40 mx-auto animate-bounce" />
                <div className="space-y-1">
                  <h4 className="text-lg font-extrabold text-[#201A17]">Nenhum pedido realizado</h4>
                  <p className="text-sm text-[#756B66]">Faça seu primeiro pedido na área comercial do cliente!</p>
                </div>
                <button
                  onClick={() => setClientSubView('home')}
                  className="bg-[#E94F2F] text-white font-bold text-xs px-6 py-2.5 rounded-xl hover:bg-[#BD351C] transition-colors"
                >
                  Ver Lojas &amp; Cardápios
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {clientOrders.map((order) => {
                  const getStatusBadgeProps = (status: string) => {
                    if (status === 'concluido') {
                      return { label: 'Concluído', classes: 'bg-green-100 text-green-800 border-green-200' };
                    }
                    if (status === 'recusado') {
                      return { label: 'Cancelado', classes: 'bg-red-100 text-red-800 border-red-200' };
                    }
                    if (status === 'aguardando_confirmacao') {
                      return { label: 'Aguardando Confirmação', classes: 'bg-amber-100 text-amber-800 border-amber-200' };
                    }
                    const labels: Record<string, string> = {
                      confirmado: 'Confirmado',
                      em_preparacao: 'Em Preparação',
                      pronto: 'Pronto para Entrega',
                      pronto_retirada: 'Pronto para Retirada',
                      saiu_entrega: 'Saiu para Entrega'
                    };
                    return { label: labels[status] || status, classes: 'bg-orange-100 text-orange-800 border-orange-200' };
                  };

                  return (
                    <div key={order.id} className="bg-white rounded-3xl border border-[#EADFD8] p-5 sm:p-7 shadow-xs space-y-6">
                      
                      {/* Premium Header conforming to Requirement 9 */}
                      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 border-b border-[#F7F4EF] pb-5">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <h3 className="text-lg font-black text-[#201A17] tracking-tight">Pedido {order.id}</h3>
                            <span className="bg-[#E94F2F]/10 text-[#E94F2F] text-[10px] font-black px-2.5 py-1 rounded-lg">
                              {order.establishmentName}
                            </span>
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                              order.deliveryType === 'entrega' 
                                ? 'bg-blue-50 text-blue-700 border-blue-100' 
                                : 'bg-purple-50 text-purple-700 border-purple-100'
                            }`}>
                              {order.deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}
                            </span>
                          </div>
                          <p className="text-xs text-[#756B66] font-bold">
                            Realizado em: {formatOrderDateTime(order.createdAt)}
                          </p>
                        </div>
                        
                        <div className="text-left sm:text-right flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-2 w-full sm:w-auto border-t sm:border-t-0 border-[#F7F4EF] pt-3 sm:pt-0">
                          <div className="sm:space-y-0.5">
                            <p className="text-[10px] text-[#756B66] font-black uppercase tracking-wider leading-none">Valor Total</p>
                            <p className="text-xl font-black text-[#2F9E69] leading-none mt-1">R$ {order.total.toFixed(2).replace('.', ',')}</p>
                          </div>
                          
                          {/* Status Badge */}
                          <div className="shrink-0">
                            <span className={`inline-block text-xs font-black px-3 py-1 rounded-full border ${getStatusBadgeProps(order.status).classes}`}>
                              {getStatusBadgeProps(order.status).label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Premium Order Tracker Line & Cards */}
                      <OrderStatusTracker order={order} />

                      {/* Premium Resumo do Pedido Section conforming to Requirement 10 */}
                      <div className="bg-[#F7F4EF] p-5 rounded-2xl space-y-4">
                        <p className="text-xs font-black text-[#756B66] uppercase tracking-widest">Resumo do Pedido</p>
                        <div className="divide-y divide-[#EADFD8] space-y-3">
                          {order.items.map((rawItem, idx) => {
                            const item = normalizeOrderItem(rawItem);
                            return (
                              <div key={idx} className="pt-3 first:pt-0 flex justify-between items-start gap-4 text-sm">
                                <div className="space-y-1">
                                  <h5 className="font-extrabold text-[#201A17] flex items-center gap-1.5">
                                    <span className="text-[#E94F2F] font-black">{item.quantity}x</span> 
                                    {item.productName}
                                  </h5>
                                  
                                  {/* Variations & Options conforming to Requirement 6 */}
                                  <div className="space-y-2 mt-1">
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
                                              <p className="text-[10px] font-bold text-[#756B66]/80 uppercase tracking-wider">
                                                {group.groupName}
                                              </p>
                                              <div className="space-y-1">
                                                {group.options.map((opt, oIdx) => {
                                                  const hasQty = opt.quantity && opt.quantity > 1;
                                                  const displayName = hasQty ? `${opt.optionName} × ${opt.quantity}` : opt.optionName;

                                                  return (
                                                    <div key={oIdx} className="flex justify-between items-center text-xs text-[#201A17] pr-2">
                                                      <span className="font-semibold leading-relaxed">{displayName}</span>
                                                      {opt.additionalPrice > 0 ? (
                                                        <span className="font-extrabold text-[#2F9E69] shrink-0">
                                                          + R$ {(opt.additionalPrice * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')}
                                                        </span>
                                                      ) : opt.additionalPrice < 0 ? (
                                                        <span className="font-extrabold text-[#E94F2F] shrink-0">
                                                          - R$ {(Math.abs(opt.additionalPrice) * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')}
                                                        </span>
                                                      ) : (
                                                        <span className="text-[10px] font-bold text-[#756B66] bg-white border border-gray-100 px-1 rounded">
                                                          Incluso
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ))}
                                        </>
                                      );
                                    })()}

                                    {item.notes && (
                                      <div className="mt-2 pt-1 border-t border-[#EADFD8]/40">
                                        <p className="text-[10px] font-bold text-[#756B66]/80 uppercase tracking-wider">Observação</p>
                                        <p className="text-xs text-[#201A17] italic mt-0.5">
                                          “{item.notes}”
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="text-right shrink-0">
                                  <span className="font-black text-[#201A17]">
                                    R$ {item.lineTotal.toFixed(2).replace('.', ',')}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
        </div>
      )}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 bg-[#201A17]/70 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 select-none overflow-hidden" id="product-config-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-3xl overflow-hidden border-0 sm:border border-[#EADFD8]/40 relative max-w-lg lg:w-[calc(100vw-48px)] lg:max-w-[860px] lg:max-h-[min(90vh,880px)] sm:rounded-[32px]"
            >
              {/* Back / Close button */}
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 left-4 sm:top-5 sm:left-auto sm:right-5 z-50 bg-white/95 backdrop-blur-md hover:bg-white text-[#201A17] hover:text-[#E94F2F] border border-[#EADFD8]/30 w-10 h-10 rounded-full transition-all cursor-pointer shadow-md flex items-center justify-center active:scale-95"
                aria-label="Voltar"
              >
                <ArrowLeft className="sm:hidden w-5 h-5 stroke-[2.5]" />
                <X className="hidden sm:block w-4 h-4 stroke-[2.5]" />
              </button>

              {/* DESKTOP HEADER */}
              <div className="hidden lg:flex items-center gap-6 p-6 border-b border-[#EADFD8]/30 bg-white shrink-0 select-none">
                {selectedProduct.image && selectedProduct.image.trim() !== "" && (
                  <div className="w-32 h-24 relative bg-[#FAF8F5] rounded-xl overflow-hidden border border-[#EADFD8]/30 shrink-0">
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="space-y-1.5 flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-[#E94F2F] bg-[#E94F2F]/10 px-2 py-0.5 rounded-full uppercase tracking-wider leading-none">
                      {currentEst.name || 'UaiPertim'}
                    </span>
                    {selectedProduct.category && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full uppercase tracking-wider leading-none">
                        {selectedProduct.category}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-[#201A17] tracking-tight leading-none">
                    {selectedProduct.name}
                  </h3>
                  {selectedProduct.description && (
                    <p className="text-xs text-[#756B66] font-medium leading-relaxed line-clamp-2 max-w-2xl">
                      {selectedProduct.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Scrollable Config Body */}
              <div id="product-config-scroll-container" className="flex-1 overflow-y-auto min-h-0 bg-[#FAF8F5]/40 scrollbar-thin scrollbar-thumb-gray-200">
                {/* MOBILE Product Hero Image (Section 2) */}
                {selectedProduct.image && selectedProduct.image.trim() !== "" && (
                  <div className="lg:hidden w-full h-64 relative bg-[#FAF8F5] shrink-0 select-none overflow-hidden">
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
                    
                    {/* Floating Establishment Name inside Mobile Hero (Section 2) */}
                    <div className="absolute bottom-12 left-5 z-10 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#201A17] bg-white/90 backdrop-blur-md px-3 py-1 rounded-full uppercase tracking-wider leading-none shadow-sm">
                        <Bike className="w-3 h-3 text-[#E94F2F]" /> {currentEst.name || 'UaiPertim'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Main Content Padding */}
                <div className="p-0 sm:p-6 pb-28 sm:pb-32 lg:p-6 lg:pb-32">
                  <div className="flex flex-col lg:flex-row lg:gap-8 items-stretch">
                    
                    {/* Left Column (Desktop-only product summary & notes) */}
                    <div className="hidden lg:flex lg:flex-col lg:w-[280px] lg:shrink-0 text-left space-y-5">
                      {selectedProduct.image && selectedProduct.image.trim() !== "" && (
                        <div className="w-full h-44 relative bg-[#FAF8F5] rounded-2xl overflow-hidden border border-[#EADFD8]/30 shadow-xs">
                          <img
                            src={selectedProduct.image}
                            alt={selectedProduct.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <h3 className="text-base font-black text-[#201A17] tracking-tight leading-snug">
                          {selectedProduct.name}
                        </h3>
                        {selectedProduct.description && (
                          <p className="text-xs text-[#756B66] font-medium leading-relaxed">
                            {selectedProduct.description}
                          </p>
                        )}
                        <p className="text-sm font-black text-[#2F9E69] pt-1">
                          A partir de R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                      
                      {/* Customer Observation/Notes - Desktop Position */}
                      <div className="bg-white border border-[#EADFD8]/40 p-4 rounded-xl space-y-2.5 shadow-xs">
                        <div className="flex justify-between items-center">
                          <h4 className="text-[10px] font-black text-[#201A17] uppercase tracking-wider text-left">Alguma observação?</h4>
                          <span className="text-[9px] text-[#756B66]/60 font-bold">{productNotes.length}/140</span>
                        </div>
                        <textarea
                          placeholder="Ex: sem cebola, ponto da carne, etc."
                          value={productNotes}
                          onChange={(e) => setProductNotes(e.target.value.substring(0, 140))}
                          rows={3}
                          className="w-full text-xs p-3 rounded-lg border border-[#EADFD8]/60 outline-none focus:border-[#E94F2F]/50 focus:ring-1 focus:ring-[#E94F2F]/10 bg-[#FAF8F5]/30 resize-none placeholder:text-[#756B66]/60 font-semibold text-[#201A17]"
                        />
                      </div>
                    </div>

                    {/* Right Column / Mobile Scroll area */}
                    <div className="flex-1 space-y-5">
                      
                      {/* MOBILE Sheet Header Block (Section 3 & 4) */}
                      <div className={`lg:hidden text-left bg-white px-5 pt-6 pb-5 border-b border-[#EADFD8]/30 ${selectedProduct.image && selectedProduct.image.trim() !== '' ? '-mt-8 rounded-t-[32px] shadow-[0_-8px_24px_rgba(32,26,23,0.03)]' : 'pt-4'} relative z-10`}>
                        {/* Name and Description */}
                        <h3 className="text-xl sm:text-2xl font-black text-[#201A17] tracking-tight leading-snug mb-2">
                          {selectedProduct.name}
                        </h3>
                        {selectedProduct.description && (
                          <p className="text-xs sm:text-sm text-[#756B66] font-medium leading-relaxed mb-4">
                            {selectedProduct.description}
                          </p>
                        )}
                        
                        {/* Complementary metadata lines (Section 4) */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#756B66] font-extrabold mb-5 pb-4 border-b border-[#F7F4EF]">
                          <span className="flex items-center gap-1 bg-[#FAF8F5] border border-[#EADFD8]/40 px-2.5 py-1 rounded-full leading-none">
                            <Clock className="w-3.5 h-3.5 text-[#E94F2F]" /> Feito na hora
                          </span>
                          <span className="flex items-center gap-1 bg-[#FAF8F5] border border-[#EADFD8]/40 px-2.5 py-1 rounded-full leading-none">
                            <Heart className="w-3.5 h-3.5 text-emerald-600" /> Ingredientes frescos
                          </span>
                        </div>

                        {/* Prices & Quero CTA block (Section 4, 5 & 6) */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex flex-col">
                            <p className="text-[9px] text-[#756B66]/80 font-black uppercase tracking-widest mb-1 leading-none">Preço a partir de</p>
                            <div className="flex items-baseline gap-2">
                              {selectedProduct.category.toLowerCase().includes('combo') && (
                                <span className="text-xs text-[#756B66]/60 line-through font-bold">
                                  R$ {(selectedProduct.price * 1.25).toFixed(2).replace('.', ',')}
                                </span>
                              )}
                              <span className="text-xl sm:text-2xl font-black text-[#2F9E69] leading-none">
                                R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                              </span>
                              {selectedProduct.category.toLowerCase().includes('combo') && (
                                <span className="bg-[#2F9E69]/10 text-[#2F9E69] text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider leading-none">
                                  Combo Especial
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Secondary 'Quero' CTA */}
                          <button
                            type="button"
                            onClick={handleQueroClick}
                            className="bg-[#E94F2F]/10 text-[#E94F2F] hover:bg-[#E94F2F] hover:text-white text-xs sm:text-sm font-black px-4 py-2.5 rounded-xl flex items-center gap-1 transition-all duration-300 group/quero cursor-pointer select-none"
                          >
                            <span>Quero</span>
                            <ChevronRight className="w-4 h-4 transition-transform group-hover/quero:translate-x-0.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>

                      {/* Configured Option Groups rendered directly in canonical DB order (Section 7, 8, 9 & 10) */}
                      {selectedProduct.optionGroups && selectedProduct.optionGroups.length > 0 && (
                        <div className="space-y-5 p-4 sm:p-0">
                          {selectedProduct.optionGroups
                            .filter(group => group.active)
                            .map((group) => {
                              const selection = selectedOptionGroups.find(sg => sg.groupId === group.id);
                              const selectedCount = selection?.selectedOptions.reduce((sum, so) => sum + (so.quantity ?? 1), 0) || 0;
                              const isSegmented = group.displayType === 'segmented';
                              const isInvalid = invalidGroupIds.includes(group.id);
                              const isSingle = group.maxSelections === 1;

                              const getHelperText = () => {
                                if (group.required) {
                                  if (isSingle) {
                                    return selectedCount === 1 ? "Selecionado" : "Escolha 1";
                                  } else {
                                    return `${selectedCount} de ${group.maxSelections}`;
                                  }
                                } else {
                                  if (isSingle) {
                                    return selectedCount === 1 ? "Selecionado" : "Até 1";
                                  } else {
                                    return `${selectedCount} de ${group.maxSelections}`;
                                  }
                                }
                              };

                              return (
                                <div
                                  key={group.id}
                                  id={`group-${group.id}`}
                                  className={`bg-white p-5 sm:p-6 rounded-3xl border transition-all duration-300 space-y-4 shadow-[0_2px_12px_rgba(32,26,23,0.01)] ${
                                    isInvalid
                                      ? 'border-rose-400 bg-rose-50/10 shadow-md shadow-rose-100/30'
                                      : 'border-[#EADFD8]/40 hover:border-[#EADFD8]/80'
                                  }`}
                                >
                                  {/* Group Header conforming to Linha Principal & Linha Auxiliar requirement */}
                                  <div className="space-y-1.5 pb-1 text-left border-b border-[#F7F4EF]/50">
                                    <div className="flex justify-between items-center gap-4">
                                      <h4 className="text-sm sm:text-base font-black text-[#201A17] tracking-tight">
                                        {group.name}
                                      </h4>
                                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${
                                        group.required
                                          ? 'bg-[#201A17] text-white'
                                          : 'bg-neutral-100 text-[#756B66]'
                                      }`}>
                                        {group.required ? 'Obrigatório' : 'Opcional'}
                                      </span>
                                    </div>
                                    
                                    {(group.description || group.maxSelections > 0) && (
                                      <div className="flex justify-between items-start gap-4 text-xs font-medium text-[#756B66]">
                                        <div className="flex-1 min-w-0">
                                          {group.description ? (
                                            <p className="text-[11px] sm:text-xs leading-relaxed text-[#756B66]/80 break-words font-semibold">
                                              {group.description}
                                            </p>
                                          ) : (
                                            <p className="text-[11px] sm:text-xs leading-relaxed text-[#756B66]/50">
                                              Selecione as opções desejadas
                                            </p>
                                          )}
                                        </div>
                                        <div className="shrink-0 pt-0.5">
                                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md transition-all duration-200 uppercase tracking-wide whitespace-nowrap ${
                                            selectedCount >= (group.minSelections || 0) && (isSingle ? selectedCount === 1 : selectedCount > 0)
                                              ? 'text-emerald-700 bg-emerald-50' 
                                              : 'text-[#756B66]/80 bg-[#FAF8F5]'
                                          }`}>
                                            {selectedCount >= (group.minSelections || 0) && selectedCount > 0 ? (
                                              <span className="flex items-center gap-1">
                                                <Check className="w-3 h-3 stroke-[3]" />
                                                {isSingle ? 'Completo' : `${selectedCount} de ${group.maxSelections}`}
                                              </span>
                                            ) : (
                                              getHelperText()
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Inline Warning validation */}
                                  {isInvalid && (
                                    <div className="bg-rose-50/70 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2 text-left">
                                      <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0 animate-pulse"></span>
                                      <span>Por favor, selecione uma opção obrigatória para continuar.</span>
                                    </div>
                                  )}

                                  {/* Options list rendered as premium vertical lines */}
                                  <div 
                                    className="divide-y divide-[#F7F4EF]/50"
                                    role={isSingle ? "radiogroup" : undefined}
                                    aria-label={isSingle ? group.name : undefined}
                                  >
                                    {group.options
                                      .filter(o => o.active)
                                      .map((opt) => {
                                        const optSelections = selection?.selectedOptions.filter(so => so.optionId === opt.id) || [];
                                        const optCount = optSelections.reduce((sum, so) => sum + (so.quantity ?? 1), 0);
                                        const isSelected = optCount > 0;

                                        return (
                                          <div
                                            key={opt.id}
                                            onClick={() => {
                                              // Clicking the line selects it or toggles it
                                              if (!isSelected || isSingle) {
                                                handleToggleOption(group, opt);
                                              }
                                            }}
                                            role={isSingle ? "radio" : undefined}
                                            aria-checked={isSingle ? isSelected : undefined}
                                            tabIndex={isSingle ? 0 : undefined}
                                            onKeyDown={isSingle ? (e) => {
                                              if (e.key === ' ' || e.key === 'Enter') {
                                                e.preventDefault();
                                                handleToggleOption(group, opt);
                                              }
                                            } : undefined}
                                            className={`py-4 flex items-center justify-between cursor-pointer transition-all duration-200 select-none gap-4 group/opt min-h-[64px] outline-none ${
                                              isSelected && isSingle
                                                ? 'bg-[#E94F2F]/4 border-l-4 border-l-[#E94F2F] -mx-5 px-5 sm:-mx-6 sm:px-6'
                                                : 'bg-white hover:bg-[#FAF8F5]/30'
                                            }`}
                                          >
                                            {/* A. CONTENT */}
                                            <div className="flex-1 min-w-0 text-left space-y-0.5">
                                              <p className={`text-sm sm:text-base font-semibold leading-tight transition-colors ${
                                                isSelected ? 'text-[#201A17] font-black' : 'text-[#201A17] group-hover/opt:text-[#E94F2F]'
                                              }`}>
                                                {opt.name}
                                              </p>
                                              {opt.description && (
                                                <p className="text-[11px] sm:text-xs text-[#756B66]/80 leading-relaxed break-words whitespace-normal font-semibold">
                                                  {opt.description}
                                                </p>
                                              )}
                                            </div>

                                            {/* B. PREÇO */}
                                            <div className="shrink-0 text-right">
                                              {opt.additionalPrice > 0 ? (
                                                <span className="text-xs sm:text-sm font-semibold text-[#2F9E69] bg-[#2F9E69]/5 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                  + R$ {opt.additionalPrice.toFixed(2).replace('.', ',')}
                                                </span>
                                              ) : opt.additionalPrice < 0 ? (
                                                <span className="text-xs sm:text-sm font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                  - R$ {Math.abs(opt.additionalPrice).toFixed(2).replace('.', ',')}
                                                </span>
                                              ) : (
                                                <span className="text-xs font-semibold text-[#756B66]/60 bg-[#FAF8F5] px-2 py-0.5 rounded whitespace-nowrap">
                                                  Incluso
                                                </span>
                                              )}
                                            </div>

                                            {/* C. CONTROLE */}
                                            <div 
                                              className="shrink-0 flex items-center justify-end"
                                              onClick={(e) => {
                                                // Prevent double trigger if clicking control buttons
                                                e.stopPropagation();
                                              }}
                                            >
                                              {isSingle ? (
                                                // Single Choice Control
                                                isSelected ? (
                                                  <span className="w-8 h-8 flex items-center justify-center rounded-full bg-[#E94F2F]/10 border border-[#E94F2F]/20 text-[#E94F2F] shrink-0 shadow-xs">
                                                    <Check className="w-4 h-4 stroke-[3.5]" />
                                                  </span>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleToggleOption(group, opt)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#EADFD8]/60 text-[#E94F2F] hover:bg-[#E94F2F] hover:text-white hover:border-[#E94F2F] transition-all duration-200 shrink-0 shadow-xs cursor-pointer active:scale-90"
                                                    aria-label="Selecionar"
                                                  >
                                                    <Plus className="w-4 h-4 stroke-[3]" />
                                                  </button>
                                                )
                                              ) : (
                                                // Multi-Choice Control
                                                isSelected ? (
                                                  // Stepper control for multi-quantity option selection conforming to Requirement 2
                                                  <div className="flex items-center gap-2.5 bg-[#FAF8F5] px-2 py-1 rounded-full border border-[#EADFD8]/60 shadow-xs">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleToggleOption(group, opt, -1)}
                                                      className="w-6 h-6 flex items-center justify-center rounded-full bg-white border border-[#EADFD8]/40 text-[#756B66] hover:text-[#E94F2F] active:scale-90 transition-transform cursor-pointer"
                                                      aria-label="Diminuir"
                                                    >
                                                      <Minus className="w-3.5 h-3.5 stroke-[3]" />
                                                    </button>
                                                    <span className="text-xs sm:text-sm font-black text-[#201A17] min-w-[14px] text-center font-sans tabular-nums">
                                                      {optCount}
                                                    </span>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleToggleOption(group, opt, 1)}
                                                      className="w-6 h-6 flex items-center justify-center rounded-full bg-[#E94F2F] text-white hover:bg-[#BD351C] active:scale-90 transition-transform cursor-pointer"
                                                      aria-label="Aumentar"
                                                    >
                                                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleToggleOption(group, opt, 1)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#EADFD8]/60 text-[#E94F2F] hover:bg-[#E94F2F] hover:text-white hover:border-[#E94F2F] transition-all duration-200 shrink-0 shadow-xs cursor-pointer active:scale-90"
                                                    aria-label="Adicionar"
                                                  >
                                                    <Plus className="w-4 h-4 stroke-[3]" />
                                                  </button>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* MOBILE Customer Observation/Notes (Section 13) */}
                      <div className="lg:hidden p-4 sm:p-0">
                        <div className="bg-white border border-[#EADFD8]/40 p-4 rounded-3xl space-y-2.5 shadow-xs">
                          <div className="flex justify-between items-center">
                            <h4 className="text-[10px] font-black text-[#201A17] uppercase tracking-wider text-left">Alguma observação?</h4>
                            <span className="text-[9px] text-[#756B66]/60 font-bold">{productNotes.length}/140</span>
                          </div>
                          <textarea
                            placeholder="Ex: sem cebola, ponto da carne, etc."
                            value={productNotes}
                            onChange={(e) => setProductNotes(e.target.value.substring(0, 140))}
                            rows={2}
                            className="w-full text-xs p-3 rounded-2xl border border-[#EADFD8]/60 outline-none focus:border-[#E94F2F]/50 focus:ring-1 focus:ring-[#E94F2F]/10 bg-[#FAF8F5]/30 resize-none placeholder:text-[#756B66]/60 font-semibold text-[#201A17]"
                          />
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>

              {/* MOBILE/TABLET FOOTER (Section 12) */}
              <div className="lg:hidden p-4 sm:p-5 pb-[calc(1.2rem+env(safe-area-inset-bottom,0px))] bg-white border-t border-[#EADFD8]/40 shrink-0 select-none shadow-[0_-8px_30px_rgba(32,26,23,0.06)] z-10">
                <div className="flex items-center justify-between gap-4 w-full">
                  
                  {/* Left Side: Stepper */}
                  {canEstablishmentReceiveOrders(currentEst) ? (
                    <div className="flex items-center gap-3 bg-[#FAF8F5] px-3 py-1.5 rounded-2xl border border-[#EADFD8]/50 select-none h-12 shadow-xs shrink-0">
                      <button
                        type="button"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className={`text-[#756B66] hover:text-[#E94F2F] active:scale-90 transition-transform p-1.5 cursor-pointer flex items-center justify-center rounded-xl hover:bg-white ${quantity <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        <Minus className="w-4 h-4 stroke-[3]" />
                      </button>
                      <span className="text-base font-black w-6 text-center text-[#201A17] select-none font-sans tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(quantity + 1)}
                        className="text-[#756B66] hover:text-[#E94F2F] active:scale-90 transition-transform p-1.5 cursor-pointer flex items-center justify-center rounded-xl hover:bg-white"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-rose-600 font-extrabold bg-rose-50 border border-rose-100 px-3 py-3 rounded-2xl h-12 flex items-center shrink-0">
                      {currentEst.suspended === true ? "Indisponível" : "Fechada"}
                    </div>
                  )}

                  {/* Right Side: Solid Unified Add CTA (Section 12) */}
                  <div className="flex-1">
                    {canEstablishmentReceiveOrders(currentEst) ? (
                      <button
                        type="button"
                        onClick={handleConfirmAddToCart}
                        className="w-full bg-[#E94F2F] hover:bg-[#BD351C] text-white h-12 px-5 rounded-2xl font-black text-sm shadow-md shadow-orange-500/20 active:scale-[0.98] transition-all cursor-pointer tracking-wide flex items-center justify-center gap-1.5"
                      >
                        <ShoppingBag className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">Adicionar • R$ {calculatedProductPrice.toFixed(2).replace('.', ',')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full bg-neutral-100 text-neutral-400 cursor-not-allowed h-12 px-5 rounded-2xl font-black text-xs border border-neutral-200 text-center flex items-center justify-center"
                      >
                        Indisponível
                      </button>
                    )}
                  </div>

                </div>
              </div>

              {/* DESKTOP FOOTER (Section 12) */}
              <div className="hidden lg:flex lg:items-center lg:justify-between p-5 px-8 bg-white border-t border-[#EADFD8]/40 shrink-0 select-none shadow-[0_-8px_30px_rgba(32,26,23,0.04)] z-10">
                {/* Left side: Quantity Selector & Subtotal */}
                <div className="flex items-center gap-8">
                  {/* Quantity Selector */}
                  <div className="w-[150px]">
                    {canEstablishmentReceiveOrders(currentEst) ? (
                      <div className="flex items-center gap-3 bg-[#FAF8F5] px-4 py-2 rounded-2xl border border-[#EADFD8]/50 select-none h-12 w-full shadow-xs shrink-0 justify-between">
                        <button
                          type="button"
                          disabled={quantity <= 1}
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className={`text-[#756B66] hover:text-[#E94F2F] active:scale-90 transition-transform p-1 cursor-pointer flex items-center justify-center rounded-xl hover:bg-white border border-transparent ${quantity <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                          <Minus className="w-4 h-4 stroke-[3]" />
                        </button>
                        <span className="text-base font-black text-[#201A17] select-none font-sans tabular-nums">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(quantity + 1)}
                          className="text-[#756B66] hover:text-[#E94F2F] active:scale-90 transition-transform p-1 cursor-pointer flex items-center justify-center rounded-xl hover:bg-white border border-transparent"
                        >
                          <Plus className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-rose-600 font-extrabold bg-rose-50 border border-rose-100 px-4 py-3 rounded-2xl h-12 w-full flex items-center justify-center shrink-0">
                        {currentEst.suspended === true ? "Indisponível" : "Fechada"}
                      </div>
                    )}
                  </div>

                  {/* Subtotal */}
                  <div className="flex flex-col justify-center text-left">
                    <p className="text-[10px] text-[#756B66]/80 font-black uppercase tracking-widest leading-none mb-1">Total</p>
                    <p className="text-xl font-black text-[#2F9E69] leading-none">
                      R$ {calculatedProductPrice.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                </div>

                {/* Right side: Sleek Add CTA */}
                <div className="w-[280px]">
                  {canEstablishmentReceiveOrders(currentEst) ? (
                    <button
                      type="button"
                      onClick={handleConfirmAddToCart}
                      className="w-full bg-[#E94F2F] hover:bg-[#BD351C] text-white h-12 px-6 rounded-2xl font-black text-sm shadow-md shadow-orange-500/20 active:scale-[0.98] transition-all cursor-pointer tracking-wider text-center flex items-center justify-center gap-2"
                    >
                      <ShoppingBag className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">Adicionar ao carrinho</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full bg-neutral-100 text-neutral-400 cursor-not-allowed h-12 px-6 rounded-2xl font-black text-xs border border-neutral-200 text-center flex items-center justify-center"
                    >
                      Indisponível
                    </button>
                  )}
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- CARRINHO LATERAL DETALHADO -------------------- */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-50" id="cart-drawer-overlay">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsCartOpen(false)} />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#E94F2F]" />
                  <h3 className="font-extrabold text-lg text-[#201A17]">Seu Carrinho</h3>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 rounded-full hover:bg-gray-200 transition-colors text-gray-500"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Cart List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {cart.length > 0 && !canEstablishmentReceiveOrders(currentEst) && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-950 p-4 rounded-xl text-xs space-y-1">
                    <p className="font-extrabold flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-600 shrink-0"></span>
                      {currentEst.name} está fechada e não pode receber este pedido agora.
                    </p>
                    <p className="text-[#756B66] font-medium leading-relaxed">
                      O estabelecimento deixou de aceitar pedidos. Você pode continuar consultando o cardápio ou esvaziar seu carrinho.
                    </p>
                  </div>
                )}

                {cart.length === 0 ? (
                  <div className="text-center py-12 space-y-4">
                    <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-[#756B66]">Seu carrinho está vazio.</p>
                      <p className="text-xs text-[#756B66] mt-1">Navegue pelas categorias e escolha seus pratos favoritos.</p>
                    </div>
                  </div>
                ) : (
                  cart.map((item, index) => {
                    const normalized = normalizeOrderItem(item);

                    return (
                      <div key={index} className="border-b border-[#F7F4EF] pb-4 pt-1 space-y-3 text-xs">
                        {/* Header Row - spans full width of the card */}
                        <div className="flex justify-between items-start gap-4">
                          <h4 className="font-bold text-sm text-[#201A17] flex-1 min-w-0 break-words">{normalized.productName}</h4>
                          <span className="text-sm font-black text-[#2F9E69] shrink-0 whitespace-nowrap">
                            R$ {normalized.lineTotal.toFixed(2).replace('.', ',')}
                          </span>
                        </div>

                        {/* Config specifications conforming to Requirement 6 */}
                        <div className="space-y-2">
                          {(() => {
                            const customizationLines = getCartItemCustomizationLines(normalized);
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
                              <div className="space-y-3">
                                {groupedCustomizations.map((group, gIdx) => (
                                  <div key={gIdx} className="space-y-1">
                                    <p className="text-[10px] font-bold text-[#756B66]/80 uppercase tracking-wider">
                                      {group.groupName}
                                    </p>
                                    <div className="space-y-0.5">
                                      {group.options.map((opt, oIdx) => {
                                        const hasQty = opt.quantity && opt.quantity > 1;
                                        const displayName = hasQty ? `${opt.optionName} × ${opt.quantity}` : opt.optionName;

                                        return (
                                          <div key={oIdx} className="flex justify-between items-center text-xs py-0.5 gap-4">
                                            <span className="font-medium text-[#5C534E] truncate" title={displayName}>
                                              {displayName}
                                            </span>
                                            {opt.additionalPrice > 0 ? (
                                              <span className="font-semibold text-[#2F9E69] shrink-0 whitespace-nowrap">
                                                + R$ {(opt.additionalPrice * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')}
                                              </span>
                                            ) : opt.additionalPrice < 0 ? (
                                              <span className="font-semibold text-[#E94F2F] shrink-0 whitespace-nowrap">
                                                - R$ {(Math.abs(opt.additionalPrice) * (opt.quantity ?? 1)).toFixed(2).replace('.', ',')}
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-medium text-[#756B66] shrink-0 whitespace-nowrap bg-[#FAF8F5] border border-[#EADFD8]/40 px-1.5 py-0.5 rounded">
                                                Incluso
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          
                          {normalized.notes && (
                            <div className="mt-2 pt-2 border-t border-[#F7F4EF]/50">
                              <p className="text-[10px] font-bold text-[#756B66]/80 uppercase tracking-wider">Observação</p>
                              <p className="text-xs text-amber-800 font-semibold italic mt-0.5">
                                “{normalized.notes}”
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 pt-1">
                          <div className="flex items-center gap-2 bg-[#F7F4EF] px-2 py-0.5 rounded-lg border border-[#EADFD8]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateCartItemQuantity(index, -1);
                              }}
                              className="text-[#756B66] hover:text-[#E94F2F]"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black w-4 text-center text-[#201A17]">{normalized.quantity}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateCartItemQuantity(index, 1);
                              }}
                              className="text-[#756B66] hover:text-[#E94F2F]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            onClick={() => removeFromCart(index)}
                            className="text-xs font-bold text-rose-500 hover:underline"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Summary & Actions */}
              {cart.length > 0 && (
                <div className="p-5 border-t border-[#EADFD8] bg-[#F7F4EF] space-y-4">
                  {/* Coupon section */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Cupom (PEDENOVO)"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs text-[#201A17] border border-[#EADFD8] rounded-lg outline-none bg-white placeholder:text-gray-400 font-bold uppercase"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      className="bg-[#201A17] hover:bg-[#E94F2F] text-white px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>

                  {/* Calculations */}
                  <div className="space-y-1.5 text-xs text-[#756B66] font-semibold">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="text-[#201A17]">R$ {cartSubtotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    {couponDiscount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Desconto</span>
                        <span>- R$ {couponDiscount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Taxa de Entrega estimada</span>
                      <span className="text-[#201A17]">R$ {deliveryFee.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex justify-between text-sm text-[#201A17] font-black pt-1.5 border-t border-[#EADFD8]">
                      <span>Valor Total</span>
                      <span className="text-[#2F9E69]">R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>

                  {/* Place Order Trigger */}
                  {canEstablishmentReceiveOrders(currentEst) ? (
                    <button
                      onClick={() => {
                        if (!canEstablishmentReceiveOrders(currentEst)) {
                          showToast(`O estabelecimento deixou de aceitar pedidos.`, 'error');
                          return;
                        }
                        if (cartSubtotal < currentEst.minOrderValue) {
                          showToast(`O valor mínimo para entrega é R$ ${currentEst.minOrderValue.toFixed(2)}`, 'error');
                          return;
                        }
                        setIsCheckoutOpen(true);
                      }}
                      className="w-full bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95 text-center block"
                    >
                      Ir para o Checkout
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button
                        disabled
                        className="w-full bg-gray-200 text-gray-400 border border-gray-300 py-3 rounded-xl font-bold text-sm text-center cursor-not-allowed block"
                      >
                        Estabelecimento fechado
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setIsCartOpen(false)}
                          className="bg-white border border-[#EADFD8] text-[#201A17] py-2 rounded-xl text-xs font-bold hover:bg-[#F7F4EF] text-center"
                        >
                          Continuar consultando
                        </button>
                        <button
                          onClick={() => {
                            clearCart();
                            showToast("Carrinho esvaziado.", "success");
                          }}
                          className="bg-rose-50 border border-rose-200 text-rose-600 py-2 rounded-xl text-xs font-bold hover:bg-rose-100 text-center"
                        >
                          Esvaziar carrinho
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- MODAL CHECKOUT FINANCIAMENTO -------------------- */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="checkout-modal">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-lg text-[#201A17]">Finalizar seu Pedido</h3>
                <button onClick={() => setIsCheckoutOpen(false)} className="text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handlePlaceOrderSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                
                {/* Delivery Type Switch */}
                {(!currentEst || (currentEst.entregaPropria === false && currentEst.atendeRetirada === false)) ? (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
                    <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" id="no-modalities-alert" />
                    <span>Este estabelecimento não possui uma modalidade de atendimento disponível no momento.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-[#756B66] uppercase tracking-wider block">Modalidade</label>
                    {currentEst.entregaPropria !== false && currentEst.atendeRetirada !== false ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDeliveryType('entrega')}
                          className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            deliveryType === 'entrega'
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                              : 'bg-[#F7F4EF] text-[#756B66] border-[#EADFD8]'
                          }`}
                        >
                          <Bike className="w-3.5 h-3.5 inline mr-1.5" /> Entrega em casa
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryType('retirada')}
                          className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            deliveryType === 'retirada'
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                              : 'bg-[#F7F4EF] text-[#756B66] border-[#EADFD8]'
                          }`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5 inline mr-1.5" /> Retirada no balcão
                        </button>
                      </div>
                    ) : currentEst.entregaPropria !== false ? (
                      <div className="w-full">
                        <button
                          type="button"
                          disabled
                          className="w-full p-2.5 rounded-xl text-xs font-bold border bg-[#E94F2F] text-white border-[#E94F2F] text-center"
                        >
                          <Bike className="w-3.5 h-3.5 inline mr-1.5" /> Entrega em casa
                        </button>
                      </div>
                    ) : (
                      <div className="w-full">
                        <button
                          type="button"
                          disabled
                          className="w-full p-2.5 rounded-xl text-xs font-bold border bg-[#E94F2F] text-white border-[#E94F2F] text-center"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 inline mr-1.5" /> Retirada no balcão
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Cliente Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Nome do Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Amanda Silva"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Telefone para contato *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (19) 99876-5432"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50"
                    />
                  </div>
                </div>

                {/* Address Form (only if delivery) */}
                {deliveryType === 'entrega' && (
                  <div className="space-y-4 bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Endereço de Entrega</h4>
                      {currentUser && (
                        <button
                          type="button"
                          onClick={() => setShowNewAddressModal(true)}
                          className="text-[10px] font-black uppercase text-[#E94F2F] hover:text-[#BD351C] transition-colors cursor-pointer"
                        >
                          + Novo Endereço
                        </button>
                      )}
                    </div>

                    {currentUser && userAddresses.length > 0 ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-[#756B66] uppercase block">Selecione um Endereço Salvo:</label>
                          <select
                            value={selectedAddressId}
                            onChange={(e) => handleSelectSavedAddress(e.target.value)}
                            className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] bg-white font-bold outline-none focus:border-[#E94F2F]/50 cursor-pointer"
                          >
                            {userAddresses.map((addr) => (
                              <option key={addr.id} value={addr.id}>
                                {addr.label} - {addr.street}, {addr.number} ({addr.neighborhood})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Visual summary card */}
                        <div className="bg-white p-3.5 rounded-xl border border-[#EADFD8] text-xs space-y-1">
                          <p className="font-extrabold text-[#201A17]">
                            {street}, {number} {complement && ` - ${complement}`}
                          </p>
                          <p className="text-[11px] text-[#756B66] font-semibold">
                            Bairro: {bairro} • Cidade Atendida
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2 space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Rua *</label>
                            <input
                              type="text"
                              required
                              placeholder="Ex: Rua das Flores"
                              value={street}
                              onChange={(e) => setStreet(e.target.value)}
                              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none bg-white focus:border-[#E94F2F]/50 font-bold"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Número *</label>
                            <input
                              type="text"
                              required
                              placeholder="123"
                              value={number}
                              onChange={(e) => setNumber(e.target.value)}
                              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none bg-white focus:border-[#E94F2F]/50 font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5 relative">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Bairro *</label>
                            <input
                              type="text"
                              required
                              placeholder="Digite o nome do bairro"
                              value={bairro}
                              onChange={(e) => setBairro(e.target.value)}
                              onFocus={() => setShowSuggestions(true)}
                              onBlur={() => {
                                setTimeout(() => setShowSuggestions(false), 200);
                              }}
                              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none bg-white focus:border-[#E94F2F]/50 font-bold"
                            />
                            {showSuggestions && filteredZones.length > 0 && (
                              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#EADFD8] rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                {filteredZones.map((z) => (
                                  <button
                                    key={z.id || z.neighborhoodName}
                                    type="button"
                                    onMouseDown={() => {
                                      setBairro(z.neighborhoodName);
                                      setShowSuggestions(false);
                                    }}
                                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[#E94F2F]/5 transition-colors border-b border-[#F7F4EF] last:border-0 font-semibold text-[#201A17] flex justify-between items-center"
                                  >
                                    <span>{z.neighborhoodName}</span>
                                    <span className="text-[10px] text-[#E94F2F] font-bold">
                                      Taxa: {z.deliveryFee !== undefined && z.deliveryFee !== null ? `R$ ${z.deliveryFee.toFixed(2).replace('.', ',')}` : 'Padrão'}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Complemento</label>
                            <input
                              type="text"
                              placeholder="Apt, Bloco..."
                              value={complement}
                              onChange={(e) => setComplement(e.target.value)}
                              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none bg-white focus:border-[#E94F2F]/50 font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Título do Checkout & Informações de Pagamento */}
                <div className="space-y-2 bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]">
                  <h4 className="text-sm font-extrabold text-[#201A17]">Como você deseja pagar ao estabelecimento?</h4>
                  <p className="text-xs text-[#756B66] leading-relaxed">
                    O pagamento será realizado diretamente ao estabelecimento na entrega ou retirada. A UaiPertim não recebe nem processa o valor do pedido.
                  </p>
                </div>

                {/* Forma de Pagamento */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-[#756B66] uppercase tracking-wider block">Método de pagamento</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {paymentOptions.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id as any)}
                        className={`p-3 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 text-center ${
                          paymentMethod === pm.id
                            ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                            : 'bg-[#F7F4EF] text-[#756B66] border-[#EADFD8] hover:bg-gray-100'
                        }`}
                      >
                        <span className="font-extrabold">{pm.id === 'cash' ? 'Dinheiro' : pm.id === 'card_on_delivery' ? 'Cartão' : 'Pix'}</span>
                        <span className={`text-[10px] ${paymentMethod === pm.id ? 'text-white/80' : 'text-[#756B66]/80'}`}>
                          {pm.id === 'cash' ? 'No ato' : pm.id === 'card_on_delivery' ? 'Na maquininha' : 'Direto ao lojista'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional Payment Information */}
                {paymentMethod === 'cash' && (
                  <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/50 space-y-3">
                    <label className="text-xs font-black text-amber-900 uppercase tracking-wider block">Você precisa de troco?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setChangeRequired(false)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                          !changeRequired
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-[#756B66] border-amber-200 hover:bg-amber-50/30'
                        }`}
                      >
                        Não preciso de troco
                      </button>
                      <button
                        type="button"
                        onClick={() => setChangeRequired(true)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                          changeRequired
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-[#756B66] border-amber-200 hover:bg-amber-50/30'
                        }`}
                      >
                        Sim, preciso de troco
                      </button>
                    </div>

                    {changeRequired && (
                      <div className="space-y-1.5 pt-1.5 animate-fade-in">
                        <label className="text-[10px] font-black text-amber-900 uppercase">Troco para quanto? *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-amber-700">R$</span>
                          <input
                            type="text"
                            required
                            placeholder="Ex: 50,00"
                            value={changeFor}
                            onChange={(e) => setChangeFor(e.target.value)}
                            className="w-full text-xs pl-8 pr-3 py-2.5 rounded-xl border border-amber-200 outline-none bg-white focus:border-amber-500"
                          />
                        </div>
                        <p className="text-[10px] text-amber-800">
                          Informe um valor maior ou igual a R$ {cartTotal.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'card_on_delivery' && (
                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200/50 space-y-2 text-xs text-blue-900">
                    <p className="font-bold">O pagamento será feito diretamente na maquininha do estabelecimento.</p>
                    <div className="pt-1 flex flex-wrap gap-2 text-[10px] text-blue-800 font-medium">
                      {currentEst?.acceptDebitCard !== false && (
                        <span className="bg-blue-100/60 px-2.5 py-1 rounded-md border border-blue-200">✓ Aceita Cartão de Débito</span>
                      )}
                      {currentEst?.acceptCreditCard !== false && (
                        <span className="bg-blue-100/60 px-2.5 py-1 rounded-md border border-blue-200">✓ Aceita Cartão de Crédito</span>
                      )}
                      {currentEst?.acceptContactless !== false && (
                        <span className="bg-blue-100/60 px-2.5 py-1 rounded-md border border-blue-200">✓ Aceita Aproximação</span>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === 'pix_on_delivery' && (
                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/50 text-xs text-emerald-950 space-y-1">
                    <p className="font-bold">O pagamento será realizado diretamente ao estabelecimento no momento do recebimento.</p>
                    <p className="text-[10px] text-emerald-800 font-medium leading-relaxed">
                      O estabelecimento irá fornecer as instruções de pagamento (como chave Pix ou código) ao realizar a entrega ou no momento da retirada. Não há QR code automático ou intermediação financeira pela plataforma.
                    </p>
                  </div>
                )}

                {/* Caixa de Confirmação Obrigatória */}
                <div className="p-3.5 bg-red-50/40 border border-red-200/50 rounded-xl">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmPaymentToEst}
                      onChange={(e) => setConfirmPaymentToEst(e.target.checked)}
                      className="mt-0.5 rounded text-[#E94F2F] focus:ring-[#E94F2F]"
                    />
                    <span className="text-[11px] font-bold text-red-900 select-none leading-tight">
                      Confirmo que o pagamento será realizado diretamente ao estabelecimento no momento da entrega ou retirada.
                    </span>
                  </label>
                </div>

                {/* Observações de Envio */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-[#756B66] uppercase tracking-wider block">Mensagem ou observação para o motoboy</label>
                  <textarea
                    placeholder="Ex: Interfone com defeito, deixar na portaria, etc."
                    value={checkoutNotes}
                    onChange={(e) => setCheckoutNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 resize-none placeholder:text-[#756B66]"
                  />
                </div>

                {/* Quotation Info & Validation Alerts */}
                {deliveryType === 'entrega' && (
                  <div className="space-y-2">
                    {/* 1. Typing/No neighborhood yet */}
                    {(!bairro || bairro.trim().length < 2) && (
                      <div className="bg-[#F7F4EF] p-3.5 rounded-xl border border-[#EADFD8] flex items-center justify-center">
                        <span className="text-xs font-bold text-[#756B66]">Informe o bairro para calcular a entrega.</span>
                      </div>
                    )}

                    {/* 2. Loading state */}
                    {bairro && bairro.trim().length >= 2 && quoteLoading && (
                      <div className="bg-[#F7F4EF] p-3.5 rounded-xl border border-[#EADFD8] animate-pulse flex items-center justify-center">
                        <span className="text-xs font-bold text-[#756B66]">Calculando taxa de entrega...</span>
                      </div>
                    )}
                    
                    {/* 3. Error state */}
                    {bairro && bairro.trim().length >= 2 && !quoteLoading && quoteError && (
                      <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-rose-800 space-y-1 text-xs">
                        <p className="font-bold flex items-center gap-1.5 text-rose-900">
                          <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Não é possível entregar
                        </p>
                        <p className="font-medium text-[11px] leading-relaxed">{quoteError}</p>
                      </div>
                    )}

                    {/* 4. Valid Quote state */}
                    {bairro && bairro.trim().length >= 2 && !quoteLoading && !quoteError && quoteAvailable && (
                      <div className="bg-[#F4F9F6] border border-[#D5EADB] p-3.5 rounded-xl text-[#2F9E69] space-y-1 text-xs">
                        {/* Custom visual delivery fee description */}
                        <div className="p-2.5 bg-white/80 rounded-lg border border-[#D5EADB]/50 font-extrabold text-xs text-[#201A17] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#2F9E69]"></span>
                          {quotePricingSource === "neighborhood_override" ? (
                            <span>Taxa de entrega para {quoteNeighborhood || bairro}: R$ {deliveryFee.toFixed(2).replace('.', ',')}</span>
                          ) : (
                            <span>Taxa de entrega: R$ {deliveryFee.toFixed(2).replace('.', ',')}</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                          <div className="bg-white/80 p-2 rounded-lg border border-[#D5EADB]/50">
                            <span className="text-[#756B66] block uppercase text-[8px] font-black tracking-wider mb-0.5">Prazo Estimado</span>
                            <span className="text-[#201A17] font-black text-xs">{quoteEstimatedMinutes} min</span>
                          </div>
                          <div className="bg-white/80 p-2 rounded-lg border border-[#D5EADB]/50">
                            <span className="text-[#756B66] block uppercase text-[8px] font-black tracking-wider mb-0.5">Pedido Mínimo</span>
                            <span className="text-[#201A17] font-black text-xs">R$ {quoteMinOrderValue.toFixed(2).replace('.', ',')}</span>
                          </div>
                        </div>
                        {cartSubtotal < quoteMinOrderValue && (
                          <p className="text-rose-600 font-bold text-[10px] pt-1 block">
                            * Seu subtotal é R$ {cartSubtotal.toFixed(2).replace('.', ',')}. Faltam R$ {(quoteMinOrderValue - cartSubtotal).toFixed(2).replace('.', ',')} para atingir o pedido mínimo.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Final Cost Breakdown */}
                <div className="bg-[#F7F4EF] p-4 rounded-2xl border border-[#EADFD8] space-y-1">
                  <div className="flex justify-between text-xs text-[#756B66] font-bold">
                    <span>Produtos</span>
                    <span>R$ {cartSubtotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-xs text-rose-600 font-bold">
                      <span>Desconto</span>
                      <span>- R$ {couponDiscount.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-[#756B66] font-bold">
                    <span>Taxa de Entrega ({deliveryType === 'entrega' ? (bairro || 'Endereço') : 'Retirada'})</span>
                    <span>
                      {deliveryType === 'retirada' 
                        ? 'Grátis' 
                        : (quoteLoading 
                          ? 'Calculando...' 
                          : (quoteError || !quoteAvailable 
                            ? 'Indisponível' 
                            : `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`
                          )
                        )
                      }
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-[#201A17] font-black pt-2 border-t border-[#EADFD8] mt-2">
                    <span>Total a Pagar</span>
                    <span className="text-[#2F9E69] text-base">
                      {deliveryType === 'entrega' && (quoteLoading || quoteError || !quoteAvailable)
                        ? 'Indisponível'
                        : `R$ ${cartTotal.toFixed(2).replace('.', ',')}`
                      }
                    </span>
                  </div>
                </div>


                {/* Actions */}
                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(false)}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold text-xs"
                  >
                    Voltar ao Carrinho
                  </button>
                  {isSubmitDisabled ? (
                    <button
                      type="button"
                      disabled
                      className="flex-1 bg-gray-200 text-gray-400 border border-gray-300 py-3 rounded-xl font-bold text-xs cursor-not-allowed"
                    >
                      {submitButtonLabel}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold text-xs shadow-md"
                    >
                      {submitButtonLabel}
                    </button>
                  )}
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- SELECT CITY MODAL -------------------- */}
      <AnimatePresence>
        {isCityModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="city-selector-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-base text-[#201A17] flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#E94F2F]" />
                  Escolha a cidade para entrega
                </h3>
                <button onClick={() => setIsCityModalOpen(false)} className="text-gray-500 hover:text-gray-800 transition-colors cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-[#756B66] leading-relaxed">
                  Exibiremos apenas os estabelecimentos que entregam na sua região. Mude a cidade para visualizar os parceiros locais credenciados.
                </p>

                <div className="space-y-2">
                  {cities.map((city) => {
                    const isSelected = city.id === selectedCity.id;
                    return (
                      <button
                        key={city.id}
                        onClick={() => handleCitySelect(city)}
                        className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#201A17] border-[#201A17] text-[#FFBE5C]'
                            : 'bg-[#F7F4EF]/50 border-[#EADFD8] text-[#201A17] hover:bg-[#F7F4EF]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className={`w-5 h-5 ${isSelected ? 'text-[#FFBE5C]' : 'text-[#756B66]'}`} />
                          <div>
                            <p className="font-bold text-sm">{city.name}</p>
                            <p className={`text-[10px] uppercase font-bold ${isSelected ? 'text-white/80' : 'text-[#756B66]'}`}>{city.state}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="bg-[#FFBE5C] text-[#201A17] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Ativo
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setIsCityModalOpen(false)}
                  className="w-full bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold text-xs"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- ALL CATEGORIES MODAL (VER TODAS) -------------------- */}
      <AnimatePresence>
        {isAllCategoriesModalOpen && (
          <div className="fixed inset-0 bg-[#201A17]/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in" id="all-categories-modal">
            {/* Backdrop click to close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setIsAllCategoriesModalOpen(false)} />
            
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden border border-[#EADFD8] relative z-10 max-h-[85vh] sm:max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#FAF8F6]">
                <div>
                  <h3 className="font-extrabold text-base text-[#201A17] flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-[#E94F2F]" />
                    Todas as categorias
                  </h3>
                  <p className="text-[11px] text-[#756B66] font-bold mt-0.5">
                    Selecione uma categoria para filtrar o cardápio
                  </p>
                </div>
                <button 
                  onClick={() => setIsAllCategoriesModalOpen(false)} 
                  className="text-gray-500 hover:text-gray-800 transition-colors cursor-pointer p-1 rounded-full hover:bg-[#FAF8F6]"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Grid of categories */}
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                  {allCategoriesList.map((label) => {
                    const catId = getCategoryIdByLabel(label);
                    const style = getCategoryStyle(catId);
                    const IconComponent = style.icon;
                    const isSelected = selectedCategory === label;

                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(label);
                          setIsAllCategoriesModalOpen(false);
                          
                          // Scroll to results cleanly if needed
                          setTimeout(() => {
                            const resultsEl = document.getElementById('establishments-section-title');
                            if (resultsEl) {
                              resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }, 100);
                        }}
                        aria-pressed={isSelected}
                        aria-label={`Categoria ${label}`}
                        className="flex flex-col items-center gap-2 focus:outline-none select-none group cursor-pointer p-2 rounded-2xl hover:bg-[#FAF8F6] transition-all"
                      >
                        <div
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                            isSelected
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F] shadow-lg shadow-[#E94F2F]/15 scale-105'
                              : `bg-white border-[#EADFD8] group-hover:border-[#E94F2F]/40 group-hover:bg-[#FAF8F6]`
                          }`}
                        >
                          <IconComponent 
                            className={`w-6 h-6 transition-colors ${isSelected ? 'text-white' : style.text}`} 
                          />
                        </div>
                        <span
                          className={`text-[11px] sm:text-xs font-bold text-center tracking-tight transition-colors line-clamp-2 w-full px-1 ${
                            isSelected ? 'text-[#E94F2F] font-extrabold' : 'text-[#756B66] group-hover:text-[#201A17]'
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- CART CHANGE CITY WARNING MODAL -------------------- */}
      <AnimatePresence>
        {isCityCartWarningOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-55 overflow-y-auto" id="city-cart-warning-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-rose-50">
                <h3 className="font-extrabold text-base text-rose-800 flex items-center gap-2">
                  <span>Esvaziar o carrinho atual?</span>
                </h3>
                <button onClick={cancelCityChange} className="text-gray-500 hover:text-gray-800 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-[#201A17]">
                <p className="leading-relaxed">
                  Você possui itens no carrinho de um estabelecimento de <strong>{selectedCity.name}</strong>.
                </p>
                <p className="text-rose-600 leading-relaxed font-bold">
                  Ao mudar para <strong>{pendingCityToChange?.name}</strong>, seu carrinho será esvaziado. Deseja continuar?
                </p>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={cancelCityChange}
                    className="flex-1 bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmCityChange}
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold shadow-md transition-colors"
                  >
                    Sim, esvaziar e mudar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- NEW ADDRESS MODAL OVERLAY -------------------- */}
      <AnimatePresence>
        {showNewAddressModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-60 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="w-full max-w-lg shadow-2xl rounded-3xl overflow-hidden bg-white"
            >
              <div className="p-1">
                <AddressForm
                  onSubmit={handleCreateAddressInCheckout}
                  onCancel={() => setShowNewAddressModal(false)}
                  submitButtonText="Salvar e Usar Endereço"
                  establishmentZones={establishmentZones}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- MANDATORY AUTHENTICATION REQUIRED MODAL (4. CHECKOUT IMPEDIR SEM CONTA) -------------------- */}
      <AnimatePresence>
        {showAuthRequiredModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-55 overflow-y-auto" id="auth-required-checkout-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              <div className="p-5 border-b border-[#EADFD8] flex justify-between items-center bg-[#F7F4EF]">
                <h3 className="font-extrabold text-[#201A17] text-base flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#E94F2F]" />
                  <span>Entre para finalizar seu pedido</span>
                </h3>
                <button onClick={() => setShowAuthRequiredModal(false)} className="text-gray-500 hover:text-gray-800 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs font-semibold text-[#201A17]">
                <p className="leading-relaxed text-gray-700 text-sm">
                  Crie sua conta ou entre para acompanhar o pedido, conversar com a loja e receber atualizações.
                </p>

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowAuthRequiredModal(false);
                      setIsCheckoutOpen(false); // Close checkout modal before navigating
                      sessionStorage.setItem('redirect_after_login', '/');
                      navigate('/login');
                    }}
                    className="w-full bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3.5 rounded-xl font-black text-center shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Entrar
                  </button>
                  <button
                    onClick={() => {
                      setShowAuthRequiredModal(false);
                      setIsCheckoutOpen(false); // Close checkout modal before navigating
                      sessionStorage.setItem('redirect_after_login', '/');
                      navigate('/cadastro');
                    }}
                    className="w-full bg-[#201A17] hover:bg-black text-[#FFBE5C] py-3.5 rounded-xl font-black text-center shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Criar conta
                  </button>
                  <button
                    onClick={() => setShowAuthRequiredModal(false)}
                    className="w-full bg-[#F7F4EF] hover:bg-gray-100 text-[#756B66] border border-[#EADFD8] py-3.5 rounded-xl font-black text-center transition-all active:scale-95 cursor-pointer"
                  >
                    Voltar ao checkout
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
