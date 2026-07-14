import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Product, CartItem, Order, Establishment } from '../types';
import { calculateConfiguredOrderItem, normalizeOrderItem } from '../utils/orderCalculation';
import { formatOrderDateTime } from '../utils/dateUtils';
import { getPaymentMethodLabel } from '../utils/paymentLabels';
import { 
  Search, Star, Clock, ShoppingBag, Plus, Minus, X, Check, MapPin, 
  ChevronRight, ArrowLeft, Heart, Bike, DollarSign, MessageSquare, Clipboard, FileText, CheckCircle2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OrderStatusTracker } from './OrderStatusTracker';
import { useLocation } from '../hooks/useLocation';
import { canEstablishmentReceiveOrders, getNextOpeningTimeText } from '../utils/establishmentUtils';
import { useAuth } from '../hooks/useAuth';
import { addressService } from '../services/addressService';
import { UserAddress } from '../types/address';
import { AddressForm } from './account/AddressForm';

export const ClientArea: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    establishments,
    products,
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [clientSubView, setClientSubView] = useState<'home' | 'menu' | 'tracking'>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
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
  const [productNotes, setProductNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

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
  const [bairro, setBairro] = useState('Centro');
  const [complement, setComplement] = useState('');
  const [deliveryType, setDeliveryType] = useState<'entrega' | 'retirada'>('entrega');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card_on_delivery' | 'pix_on_delivery'>('pix_on_delivery');
  const [changeRequired, setChangeRequired] = useState<boolean>(false);
  const [changeFor, setChangeFor] = useState<string>('');
  const [confirmPaymentToEst, setConfirmPaymentToEst] = useState<boolean>(false);
  const [checkoutNotes, setCheckoutNotes] = useState('');

  // Address integration for checkout
  const { userProfile } = useAuth();
  const [userAddresses, setUserAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [showNewAddressModal, setShowNewAddressModal] = useState(false);

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

      // 2. filtrar por estabelecimento ativo
      const isActive = est.active === true;
      if (!isActive) return false;

      // 3. aplicar categoria
      if (selectedCategory !== 'Todos') {
        if (selectedCategory === 'Destaques') {
          if (est.featured !== true) return false;
        } else {
          // Map categories
          const categoryMap: Record<string, string> = {
            'Pizzas': 'Pizzas',
            'Lanches': 'Lanches',
            'Japonesa': 'Japonesa',
            'Brasileira': 'Brasileira',
            'Açaí e doces': 'Açaí e doces',
            'Mercados': 'Mercados',
            'Conveniências': 'Conveniências'
          };
          const mappedCategory = categoryMap[selectedCategory] || selectedCategory;
          if (est.category.toLowerCase() !== mappedCategory.toLowerCase()) return false;
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
                              matchesProduct;
        if (!matchesSearch) return false;
      }

      return true;
    }).sort((a, b) => {
      const aCanReceive = canEstablishmentReceiveOrders(a);
      const bCanReceive = canEstablishmentReceiveOrders(b);
      if (aCanReceive && !bCanReceive) return -1;
      if (!aCanReceive && bCanReceive) return 1;

      const aPaused = a.temporarilyPaused === true;
      const bPaused = b.temporarilyPaused === true;
      if (aPaused && !bPaused) return -1;
      if (!aPaused && bPaused) return 1;

      return 0;
    });
  }, [establishments, selectedCategory, searchQuery, selectedCity, products]);

  // Current viewed establishment
  const currentEst = useMemo(() => {
    return establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
  }, [establishments, selectedEstablishmentId]);

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
    if (isCheckoutOpen) {
      const isDeliveryAllowed = currentEst?.acceptDeliveryPayment !== false;
      const isPickupAllowed = currentEst?.acceptPickupPayment !== false;
      if (!isDeliveryAllowed && deliveryType === 'entrega') {
        setDeliveryType('retirada');
      } else if (!isPickupAllowed && deliveryType === 'retirada') {
        setDeliveryType('entrega');
      }
    }
  }, [isCheckoutOpen, currentEst, deliveryType]);

  // Current establishment's products
  const currentProducts = useMemo(() => {
    return products[selectedEstablishmentId] || [];
  }, [products, selectedEstablishmentId]);

  // Categories in the viewed menu
  const menuCategories = useMemo(() => {
    const cats = new Set(currentProducts.map(p => p.category));
    return Array.from(cats);
  }, [currentProducts]);

  // Handle viewing an establishment's menu
  const handleViewMenu = (estId: string) => {
    setSelectedEstablishmentId(estId);
    setClientSubView('menu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Open item detail
  const handleOpenProduct = (product: Product) => {
    if (!product.available) {
      showToast('Este produto está indisponível no momento.', 'error');
      return;
    }
    setSelectedProduct(product);
    setSelectedSize(product.sizes && product.sizes.length > 0 ? product.sizes[0] : '');
    setSelectedBorder(product.borders && product.borders.length > 0 ? product.borders[0] : '');
    setSelectedExtras([]);
    setProductNotes('');
    setQuantity(1);
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

  // Dynamic Product Price calculation
  const calculatedProductPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    const item = calculateConfiguredOrderItem(
      selectedProduct,
      selectedSize,
      selectedBorder,
      selectedExtras,
      quantity,
      productNotes
    );
    return item.lineTotal;
  }, [selectedProduct, selectedSize, selectedBorder, selectedExtras, quantity, productNotes]);

  // Handle adding configured item to cart
  const handleConfirmAddToCart = () => {
    if (!selectedProduct) return;
    
    const cartItem: CartItem = {
      product: selectedProduct,
      quantity,
      selectedSize: selectedSize || undefined,
      selectedBorder: selectedBorder || undefined,
      selectedExtras: [...selectedExtras],
      notes: productNotes.trim() || undefined
    };

    addToCart(cartItem);
    setSelectedProduct(null);
  };

  // Cart calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const normalized = normalizeOrderItem(item);
      return sum + normalized.lineTotal;
    }, 0);
  }, [cart]);

  const deliveryFee = useMemo(() => {
    if (deliveryType === 'retirada') return 0;
    
    // Dynamic neighborhood fee mapping
    const matchedBairro = neighborhoods.find(n => n.name.toLowerCase() === bairro.toLowerCase());
    return matchedBairro ? matchedBairro.fee : currentEst.deliveryFee;
  }, [deliveryType, bairro, neighborhoods, currentEst]);

  const cartTotal = useMemo(() => {
    const afterDiscount = cartSubtotal - couponDiscount;
    return Math.max(0, afterDiscount + deliveryFee);
  }, [cartSubtotal, couponDiscount, deliveryFee]);

  // Apply Coupon
  const handleApplyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    if (code === 'PEDENOVO') {
      setCouponDiscount(5.00);
      showToast('Cupom PEDENOVO aplicado: R$ 5,00 de desconto!', 'success');
    } else if (code === 'UAIPERTIM10') {
      setCouponDiscount(10.00);
      showToast('Cupom UAIPERTIM10 aplicado: R$ 10,00 de desconto!', 'success');
    } else {
      showToast('Cupom inválido ou expirado.', 'error');
    }
  };

  // Handle checkout submit
  const handlePlaceOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || (deliveryType === 'entrega' && (!street || !number || !bairro))) {
      showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
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
      const orderObj = await placeOrder({
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
                className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 shadow-md transition-transform active:scale-95 font-bold text-sm relative flex-1 sm:flex-initial"
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {clientSubView === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Banner Apresentação Principal */}
            <div className="bg-gradient-to-br from-[#E94F2F] to-[#BD351C] text-white p-8 md:p-12 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-15 hidden md:block">
                <img 
                  src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=60" 
                  alt="Background Pizza" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="max-w-2xl relative z-10 space-y-4">
                <span className="bg-[#FFBE5C] text-[#201A17] text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                  Startup Regional
                </span>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                  O melhor da sua cidade, em um só lugar.
                </h2>
                <p className="text-sm md:text-base text-white/95 font-medium leading-relaxed max-w-lg">
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
            </div>

            {/* Categorias Horizontais */}
            <div className="space-y-3">
              <h3 className="text-lg font-black text-[#201A17] tracking-tight">Categorias recomendadas</h3>
              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                {[
                  'Todos', 'Destaques', 'Pizzas', 'Lanches', 'Japonesa', 'Brasileira', 'Açaí e doces', 'Mercados', 'Conveniências'
                ].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap border shrink-0 ${
                      selectedCategory === cat
                        ? 'bg-[#E94F2F] text-white border-[#E94F2F] shadow-sm'
                        : 'bg-white text-[#756B66] border-[#EADFD8] hover:text-[#201A17] hover:border-[#756B66]/30'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Estabelecimentos */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h3 className="text-xl font-black text-[#201A17] tracking-tight flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const prefix = (() => {
                      if (selectedCategory === 'Todos') return 'Estabelecimentos';
                      if (selectedCategory === 'Destaques') return 'Destaques';
                      const categoryTitles: Record<string, string> = {
                        'Pizzas': 'Pizzarias',
                        'Lanches': 'Lanches',
                        'Japonesa': 'Comida Japonesa',
                        'Brasileira': 'Comida Brasileira',
                        'Açaí e doces': 'Açaí e doces',
                        'Mercados': 'Mercados',
                        'Conveniências': 'Conveniências'
                      };
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredEstablishments.map((est) => {
                    const isEstOpen = canEstablishmentReceiveOrders(est);
                    let badgeText = 'Aberto';
                    let badgeClass = 'bg-[#2F9E69]/10 text-[#2F9E69]';
                    let imgClass = 'w-full h-36 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl object-cover shrink-0 bg-gray-100 transition-all';
                    let buttonText = 'Pedir agora';
                    let nextTimeText = null;

                    if (est.suspended === true) {
                      badgeText = 'Indisponível';
                      badgeClass = 'bg-neutral-100 text-neutral-600';
                      imgClass += ' opacity-50 grayscale';
                      buttonText = 'Ver cardápio';
                    } else if (est.temporarilyPaused === true) {
                      badgeText = 'Pausado';
                      badgeClass = 'bg-amber-100 text-amber-800';
                      imgClass += ' opacity-75';
                      buttonText = 'Ver cardápio';
                    } else if (est.acceptingOrders === false) {
                      badgeText = 'Indisponível';
                      badgeClass = 'bg-orange-100 text-orange-800';
                      imgClass += ' opacity-75';
                      buttonText = 'Ver cardápio';
                    } else if (!isEstOpen) {
                      badgeText = 'Fechado';
                      badgeClass = 'bg-rose-100 text-rose-800';
                      imgClass += ' opacity-75';
                      buttonText = 'Ver cardápio';
                      nextTimeText = getNextOpeningTimeText(businessHours);
                    }

                    return (
                      <div 
                        key={est.id}
                        className={`bg-white rounded-2xl border border-[#EADFD8] p-4 flex flex-col sm:flex-row gap-4 shadow-sm hover:shadow-md transition-shadow relative ${
                          est.id === 'pizzaria-da-praca' ? 'ring-2 ring-[#FFBE5C]' : ''
                        }`}
                      >
                        {est.id === 'pizzaria-da-praca' && (
                          <span className="absolute -top-3 left-4 bg-[#FFBE5C] text-[#201A17] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-10">
                            Principal da Demo
                          </span>
                        )}

                        <img 
                          src={est.image} 
                          alt={est.name} 
                          className={imgClass}
                        />
                        
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <h4 className="font-extrabold text-[#201A17] text-base md:text-lg leading-snug">{est.name}</h4>
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${badgeClass}`}>
                                {badgeText}
                              </span>
                            </div>
                            <p className="text-xs text-[#756B66] font-medium mt-0.5">
                              {est.category} • {est.city}
                              {nextTimeText && <span className="block text-[11px] text-rose-600 font-black mt-1">{nextTimeText}</span>}
                            </p>
                            
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-[#201A17] font-semibold">
                              <span className="flex items-center gap-1 text-amber-600">
                                <Star className="w-3.5 h-3.5 fill-current text-[#FFBE5C]" />
                                {est.rating}
                              </span>
                              <span className="text-[#EADFD8]">|</span>
                              <span className="flex items-center gap-1 text-[#756B66]">
                                <Clock className="w-3.5 h-3.5" />
                                {est.deliveryTime}
                              </span>
                              <span className="text-[#EADFD8]">|</span>
                              <span className="text-[#2F9E69]">
                                Entrega: {est.deliveryFee === 0 ? 'Grátis' : `R$ ${est.deliveryFee.toFixed(2).replace('.', ',')}`}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-[#F7F4EF]">
                            <span className="text-[10px] text-[#756B66] font-bold">Ped. Min: R$ {est.minOrderValue.toFixed(2)}</span>
                            <button
                              onClick={() => handleViewMenu(est.id)}
                              className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"
                            >
                              <span>{buttonText}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
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
            <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-sm">
              <div className="h-40 relative bg-gray-200">
                <img src={currentEst.image} alt={currentEst.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <span className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm text-[#201A17] text-xs font-black px-3 py-1 rounded-full">
                  Taxa de Entrega: R$ {currentEst.deliveryFee.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="p-6 md:p-8 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-[#201A17] tracking-tight">{currentEst.name}</h2>
                    <p className="text-sm text-[#756B66] font-medium mt-1">{currentEst.category} • {currentEst.address} • {currentEst.phone}</p>
                  </div>
                  {(() => {
                    const isCurrentEstOpen = canEstablishmentReceiveOrders(currentEst);
                    let headerBadgeText = '● ABERTO AGORA';
                    let headerBadgeClass = 'bg-emerald-100 text-emerald-800';

                    if (currentEst.suspended === true) {
                      headerBadgeText = '● INDISPONÍVEL';
                      headerBadgeClass = 'bg-neutral-100 text-neutral-600';
                    } else if (currentEst.temporarilyPaused === true) {
                      headerBadgeText = '● PAUSADO';
                      headerBadgeClass = 'bg-amber-100 text-amber-800';
                    } else if (currentEst.acceptingOrders === false) {
                      headerBadgeText = '● INDISPONÍVEL';
                      headerBadgeClass = 'bg-orange-100 text-orange-800';
                    } else if (!isCurrentEstOpen) {
                      headerBadgeText = '● FECHADO';
                      headerBadgeClass = 'bg-rose-100 text-rose-800';
                    }

                    return (
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${headerBadgeClass}`}>
                        {headerBadgeText}
                      </span>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#F7F4EF] text-center">
                  <div className="p-3 bg-[#F7F4EF] rounded-xl">
                    <p className="text-[10px] text-[#756B66] font-extrabold uppercase leading-none">Avaliação</p>
                    <p className="text-base font-black text-[#201A17] mt-1.5 flex items-center justify-center gap-1">
                      <Star className="w-4 h-4 fill-current text-[#FFBE5C]" /> {currentEst.rating}
                    </p>
                  </div>
                  <div className="p-3 bg-[#F7F4EF] rounded-xl">
                    <p className="text-[10px] text-[#756B66] font-extrabold uppercase leading-none">Tempo Estimado</p>
                    <p className="text-base font-black text-[#201A17] mt-1.5">{currentEst.deliveryTime}</p>
                  </div>
                  <div className="p-3 bg-[#F7F4EF] rounded-xl">
                    <p className="text-[10px] text-[#756B66] font-extrabold uppercase leading-none">Pedido Mínimo</p>
                    <p className="text-base font-black text-[#201A17] mt-1.5">R$ {currentEst.minOrderValue.toFixed(2).replace('.', ',')}</p>
                  </div>
                  <div className="p-3 bg-[#F7F4EF] rounded-xl">
                    <p className="text-[10px] text-[#756B66] font-extrabold uppercase leading-none">Plataforma</p>
                    <p className="text-sm font-black text-[#E94F2F] mt-2">UaiPertim Premium</p>
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
                        key={cat}
                        href={`#cat-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                        className="block px-3 py-2 rounded-xl text-xs font-bold text-[#756B66] hover:bg-[#F7F4EF] hover:text-[#201A17] transition-colors"
                      >
                        {cat}
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
                    const catProducts = currentProducts.filter(p => p.category === cat);
                    return (
                      <div 
                        key={cat} 
                        id={`cat-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                        className="space-y-4 scroll-mt-48"
                      >
                        <h3 className="text-xl font-black text-[#201A17] border-b border-[#EADFD8] pb-2 tracking-tight">
                          {cat}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {catProducts.map((prod) => (
                            <div
                              key={prod.id}
                              onClick={() => handleOpenProduct(prod)}
                              className={`bg-white rounded-2xl border border-[#EADFD8] p-4 flex gap-4 cursor-pointer hover:border-[#E94F2F]/40 hover:shadow-sm transition-all ${
                                !prod.available ? 'opacity-65' : ''
                              }`}
                            >
                              <div className="flex-1 flex flex-col justify-between">
                                <div className="space-y-1.5">
                                  <div className="flex justify-between items-start gap-1">
                                    <h4 className="font-extrabold text-[#201A17] text-sm md:text-base leading-tight">
                                      {prod.name}
                                    </h4>
                                    {!prod.available && (
                                      <span className="bg-gray-100 text-gray-500 text-[9px] font-bold px-1 rounded">
                                        Esgotado
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[#756B66] font-medium line-clamp-2 leading-relaxed">
                                    {prod.description}
                                  </p>
                                </div>

                                <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#F7F4EF]">
                                  <span className="text-base font-black text-[#E94F2F]">
                                    R$ {prod.price.toFixed(2).replace('.', ',')}
                                  </span>
                                  
                                  {prod.available && (
                                    canEstablishmentReceiveOrders(currentEst) ? (
                                      <span className="bg-[#E94F2F]/10 text-[#E94F2F] hover:bg-[#E94F2F] hover:text-white p-1 rounded-lg transition-colors">
                                        <Plus className="w-4 h-4" />
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-rose-600 font-black bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg transition-colors">
                                        {currentEst.suspended === true ? "Indisponível" : "Ver detalhes"}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>

                              {prod.image && (
                                <img 
                                  src={prod.image} 
                                  alt={prod.name} 
                                  className="w-20 h-20 md:w-24 md:h-24 rounded-xl object-cover bg-gray-100 shrink-0"
                                />
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
                                  
                                  {/* Variations & Options */}
                                  <div className="space-y-0.5">
                                    {item.selectedSize && (
                                      <p className="text-xs text-[#756B66] font-bold">
                                        Tamanho: <span className="text-[#201A17]">{item.selectedSize.name}</span>
                                      </p>
                                    )}
                                    {item.selectedCrust && item.selectedCrust.name !== 'Sem borda' && (
                                      <p className="text-xs text-[#756B66] font-bold">
                                        Borda: <span className="text-[#201A17]">{item.selectedCrust.name}</span>
                                      </p>
                                    )}
                                    {item.selectedExtras.length > 0 && (
                                      <p className="text-xs text-[#756B66] font-bold">
                                        Adicionais: <span className="text-[#201A17]">{item.selectedExtras.map(e => `${e.name} (${e.quantity}x)`).join(', ')}</span>
                                      </p>
                                    )}
                                    {item.notes && (
                                      <p className="text-xs text-[#756B66] italic bg-[#EADFD8]/40 px-2 py-1 rounded-md mt-1 inline-block">
                                        Obs: "{item.notes}"
                                      </p>
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

      {/* -------------------- MODAL DETALHE DO PRODUTO / CONFIGURADOR -------------------- */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="product-config-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADFD8]"
            >
              {/* Header Image */}
              {selectedProduct.image && (
                <div className="h-44 relative bg-gray-100">
                  <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Scrollable Config Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {!selectedProduct.image && (
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-black text-[#201A17]">{selectedProduct.name}</h3>
                    <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                )}

                {/* Info */}
                <div className="space-y-1">
                  {selectedProduct.image && <h3 className="text-xl font-black text-[#201A17]">{selectedProduct.name}</h3>}
                  <p className="text-xs text-[#756B66] font-medium leading-relaxed">{selectedProduct.description}</p>
                </div>

                {/* Size Choice */}
                {selectedProduct.sizes && selectedProduct.sizes.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Escolha o tamanho</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedProduct.sizes.map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSelectedSize(sz)}
                          className={`p-2.5 rounded-xl font-bold text-xs border text-center transition-all ${
                            selectedSize === sz
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F] shadow-xs'
                              : 'bg-white text-[#756B66] border-[#EADFD8] hover:border-[#756B66]/30'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Borda Choice */}
                {selectedProduct.borders && selectedProduct.borders.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Escolha a Borda (+ R$ 5,00)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {selectedProduct.borders.map((bd) => (
                        <button
                          key={bd}
                          type="button"
                          onClick={() => setSelectedBorder(bd)}
                          className={`p-2.5 rounded-xl font-bold text-xs border text-center transition-all ${
                            selectedBorder === bd
                              ? 'bg-[#E94F2F] text-white border-[#E94F2F] shadow-xs'
                              : 'bg-white text-[#756B66] border-[#EADFD8] hover:border-[#756B66]/30'
                          }`}
                        >
                          {bd}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extras Choice */}
                {selectedProduct.extras && selectedProduct.extras.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Adicionais premium</h4>
                    <div className="space-y-2">
                      {selectedProduct.extras.map((ex) => {
                        const isAdded = selectedExtras.some(e => e.name === ex.name);
                        return (
                          <div
                            key={ex.name}
                            onClick={() => handleToggleExtra(ex)}
                            className="bg-white border border-[#EADFD8] p-3 rounded-xl flex justify-between items-center cursor-pointer hover:border-[#E94F2F]/30 transition-colors"
                          >
                            <span className="text-xs font-bold text-[#201A17] flex items-center gap-2">
                              <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                                isAdded ? 'bg-[#2F9E69] border-[#2F9E69] text-white' : 'border-[#EADFD8]'
                              }`}>
                                {isAdded && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              {ex.name}
                            </span>
                            <span className="text-xs font-extrabold text-[#2F9E69]">
                              + R$ {ex.price.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Observações */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Alguma observação?</h4>
                  <textarea
                    placeholder="Ex: sem cebola, ponto da carne bem passado, etc."
                    value={productNotes}
                    onChange={(e) => setProductNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 resize-none placeholder:text-[#756B66]"
                  />
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="p-6 bg-[#F7F4EF] border-t border-[#EADFD8] flex flex-col sm:flex-row gap-4 items-center justify-between">
                {/* Quantity adjustments */}
                {canEstablishmentReceiveOrders(currentEst) ? (
                  <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-[#EADFD8]">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="text-[#756B66] hover:text-[#E94F2F]"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-black w-6 text-center text-[#201A17]">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="text-[#756B66] hover:text-[#E94F2F]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-rose-600 font-extrabold bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">
                    {currentEst.suspended === true ? (
                      "Este estabelecimento está temporariamente indisponível."
                    ) : (
                      "Disponível quando o estabelecimento abrir."
                    )}
                  </div>
                )}

                <div className="flex items-center gap-4 w-full sm:w-auto flex-1 justify-end">
                  <div className="text-right">
                    <p className="text-[10px] text-[#756B66] font-bold uppercase leading-none">Subtotal item</p>
                    <p className="text-lg font-black text-[#2F9E69]">R$ {calculatedProductPrice.toFixed(2).replace('.', ',')}</p>
                  </div>

                  {canEstablishmentReceiveOrders(currentEst) ? (
                    <button
                      type="button"
                      onClick={handleConfirmAddToCart}
                      className="bg-[#E94F2F] hover:bg-[#BD351C] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 flex-1 sm:flex-none text-center"
                    >
                      Adicionar ao carrinho
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="bg-gray-200 text-gray-400 cursor-not-allowed px-6 py-3 rounded-xl font-bold text-sm flex-1 sm:flex-none text-center border border-gray-300"
                    >
                      {currentEst.suspended === true ? "Indisponível" : "Loja Fechada"}
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
                      <div key={index} className="border-b border-[#F7F4EF] pb-3 flex gap-3 items-start justify-between text-xs">
                        <div className="flex-1 space-y-1">
                          <h4 className="font-bold text-sm text-[#201A17]">{normalized.productName}</h4>
                          
                          {/* Config specifications */}
                          <div className="text-[11px] text-[#756B66] space-y-0.5">
                            {normalized.selectedSize && <p>Tamanho: {normalized.selectedSize.name}</p>}
                            {normalized.selectedCrust && normalized.selectedCrust.name !== 'Sem borda' && (
                              <p>Borda: {normalized.selectedCrust.name} (+ R$ {normalized.selectedCrust.priceDelta.toFixed(2).replace('.', ',')})</p>
                            )}
                            {normalized.selectedExtras.length > 0 && (
                              <p>Adicionais: {normalized.selectedExtras.map(e => `${e.name} (${e.quantity}x + R$ ${e.unitPrice.toFixed(2).replace('.', ',')})`).join(', ')}</p>
                            )}
                            {normalized.notes && <p className="italic text-amber-700">Obs: “{normalized.notes}”</p>}
                          </div>

                          <div className="flex items-center gap-3 pt-2">
                            <div className="flex items-center gap-2 bg-[#F7F4EF] px-2 py-0.5 rounded-lg border border-[#EADFD8]">
                              <button
                                onClick={() => updateCartItemQuantity(index, -1)}
                                className="text-[#756B66] hover:text-[#E94F2F]"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-black w-4 text-center text-[#201A17]">{normalized.quantity}</span>
                              <button
                                onClick={() => updateCartItemQuantity(index, 1)}
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

                        <span className="text-sm font-black text-[#2F9E69] shrink-0">
                          R$ {normalized.lineTotal.toFixed(2).replace('.', ',')}
                        </span>
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
                <div className="space-y-2">
                  <label className="text-xs font-black text-[#756B66] uppercase tracking-wider block">Modalidade</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('entrega')}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
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
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                        deliveryType === 'retirada'
                          ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                          : 'bg-[#F7F4EF] text-[#756B66] border-[#EADFD8]'
                      }`}
                    >
                      <ShoppingBag className="w-3.5 h-3.5 inline mr-1.5" /> Retirada no balcão
                    </button>
                  </div>
                </div>

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
                    <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Telefone fictício *</label>
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
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#756B66] uppercase">Bairro *</label>
                            <select
                              value={bairro}
                              onChange={(e) => setBairro(e.target.value)}
                              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none bg-white focus:border-[#E94F2F]/50 font-bold"
                            >
                              {neighborhoods.map((n) => (
                                <option key={n.id} value={n.name}>
                                  {n.name} (Taxa: R$ {n.fee.toFixed(2)})
                                </option>
                              ))}
                            </select>
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
                    <span>Taxa de Entrega ({deliveryType === 'entrega' ? bairro : 'Retirada'})</span>
                    <span>R$ {deliveryFee.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[#201A17] font-black pt-2 border-t border-[#EADFD8] mt-2">
                    <span>Total a Pagar</span>
                    <span className="text-[#2F9E69] text-base">R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>

                {/* Pay Alert Fictional */}
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-[10px] font-semibold leading-relaxed">
                  <strong>Aviso de demonstração:</strong> Nenhum pagamento real será efetuado. Este é um protótipo estritamente simulado e sincronizado localmente.
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
                  <button
                    type="submit"
                    className="flex-1 bg-[#E94F2F] hover:bg-[#BD351C] text-white py-3 rounded-xl font-bold text-xs shadow-md"
                  >
                    Finalizar e Enviar Pedido
                  </button>
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
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
