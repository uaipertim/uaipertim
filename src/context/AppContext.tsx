import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  AppEnvironment, 
  Establishment, 
  Product, 
  Order, 
  CartItem, 
  SupportTicket, 
  Feedback, 
  DeliveryNeighborhood, 
  BusinessHours,
  OrderStatus,
  City
} from '../types';
import { 
  CITIES,
  INITIAL_ESTABLISHMENTS, 
  INITIAL_PRODUCTS, 
  INITIAL_NEIGHBORHOODS, 
  INITIAL_BUSINESS_HOURS, 
  INITIAL_TICKETS, 
  INITIAL_FEEDBACKS, 
  INITIAL_ORDERS 
} from '../initialData';
import { checkFirebaseConnection, ConnectionStatus } from '../services/firebaseConnectionService';
import { canEstablishmentReceiveOrders } from '../utils/establishmentUtils';
import { APP_ENV, OFFICIAL_APP_DATA_VERSION } from '../config';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, query, collection, orderBy } from 'firebase/firestore';
import { orderService } from '../services/orderService';
import { citiesRepository } from '../repositories/citiesRepository';
import { establishmentsRepository } from '../repositories/establishmentsRepository';
import { productsRepository } from '../repositories/productsRepository';
import { normalizeProductFromFirestore, normalizeEstablishmentFromFirestore } from '../services/productNormalizer';


export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  environment: AppEnvironment;
  setEnvironment: (env: AppEnvironment) => void;
  selectedCity: City;
  setSelectedCity: (city: City) => void;
  cities: City[];
  establishments: Establishment[];
  setEstablishments: React.Dispatch<React.SetStateAction<Establishment[]>>;
  products: Record<string, Product[]>;
  setProducts: React.Dispatch<React.SetStateAction<Record<string, Product[]>>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  ordersLoading: boolean;
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  updateCartItemQuantity: (index: number, change: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  selectedEstablishmentId: string;
  setSelectedEstablishmentId: (id: string) => void;
  neighborhoods: DeliveryNeighborhood[];
  setNeighborhoods: (n: DeliveryNeighborhood[]) => void;
  businessHours: BusinessHours[];
  setBusinessHours: (h: BusinessHours[]) => void;
  tickets: SupportTicket[];
  setTickets: React.Dispatch<React.SetStateAction<SupportTicket[]>>;
  feedbacks: Feedback[];
  setFeedbacks: React.Dispatch<React.SetStateAction<Feedback[]>>;
  
  // Actions
  placeOrder: (orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'establishmentId' | 'establishmentName'>) => Promise<Order>;
  updateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  updateOrderPaymentStatus: (orderId: string, newPaymentStatus: 'pending' | 'paid' | 'not_paid' | 'cancelled') => void;
  addOrUpdateProduct: (establishmentId: string, product: Product) => void;
  deleteProduct: (establishmentId: string, productId: string) => void;
  resetDemo: () => void;
  
  // Toast
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;

  // Firebase Database Connection Status
  connectionStatus: ConnectionStatus | null;

  // Admin Filters for real-time synchronization
  adminFilters: {
    cityId: string;
    establishmentId: string;
    status: string;
    deliveryType: string;
    paymentMethod: string;
    period: string;
  };
  setAdminFilters: React.Dispatch<React.SetStateAction<{
    cityId: string;
    establishmentId: string;
    status: string;
    deliveryType: string;
    paymentMethod: string;
    period: string;
  }>>;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

const DEMO_DATA_VERSION = 3;

function ensureDemoEstablishments(items: any[]): Establishment[] {
  const requiredIds = [
    'pizzaria-da-praca',
    'burger-do-gloria',
    'sabor-mineiro',
    'mercado-central-do-gloria',
    'pizzaria-avenida',
    'burger-17',
    'sushi-nori',
    'mercado-passos'
  ];

  const currentMap = new Map<string, any>();
  items.forEach(item => {
    currentMap.set(item.id, item);
  });

  const result: Establishment[] = [];

  items.forEach(item => {
    const id = item.id;
    const updated = { ...item };
    
    if (id === 'pizzaria-da-praca') {
      updated.cityId = 'sao-joao-batista-do-gloria-mg';
      updated.cityName = 'São João Batista do Glória';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = true;
    } else if (id === 'burger-do-gloria') {
      updated.cityId = 'sao-joao-batista-do-gloria-mg';
      updated.cityName = 'São João Batista do Glória';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = true;
    } else if (id === 'sabor-mineiro') {
      updated.cityId = 'sao-joao-batista-do-gloria-mg';
      updated.cityName = 'São João Batista do Glória';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = false;
    } else if (id === 'mercado-central-do-gloria') {
      updated.cityId = 'sao-joao-batista-do-gloria-mg';
      updated.cityName = 'São João Batista do Glória';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = false;
    } else if (id === 'pizzaria-avenida') {
      updated.cityId = 'passos-mg';
      updated.cityName = 'Passos';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = true;
    } else if (id === 'burger-17') {
      updated.cityId = 'passos-mg';
      updated.cityName = 'Passos';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = true;
    } else if (id === 'sushi-nori') {
      updated.cityId = 'passos-mg';
      updated.cityName = 'Passos';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = false;
    } else if (id === 'mercado-passos') {
      updated.cityId = 'passos-mg';
      updated.cityName = 'Passos';
      updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = false;
    } else {
      if (!updated.cityId) updated.cityId = 'sao-joao-batista-do-gloria-mg';
      if (!updated.cityName) updated.cityName = 'São João Batista do Glória';
      if (!updated.state) updated.state = 'MG';
      if (updated.active === undefined) updated.active = true;
      if (updated.featured === undefined) updated.featured = false;
    }

    updated.city = updated.cityName;
    result.push(updated);
  });

  requiredIds.forEach(id => {
    if (!currentMap.has(id)) {
      const original = INITIAL_ESTABLISHMENTS.find(e => e.id === id);
      if (original) {
        result.push({ ...original });
      }
    }
  });

  return result;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [environment, setEnvironment] = useState<AppEnvironment>('cliente');
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>('pizzaria-da-praca');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    checkFirebaseConnection().then((status) => {
      setConnectionStatus(status);
    });
  }, []);


  const [selectedCity, setSelectedCityState] = useState<City>(() => {
    const saved = localStorage.getItem('pl_selected_city');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return CITIES.find(c => c.default) || CITIES[0];
  });

  const setSelectedCity = (city: City) => {
    setSelectedCityState(city);
    localStorage.setItem('pl_selected_city', JSON.stringify(city));
  };

  const isDemo = typeof window !== 'undefined' && window.location.pathname.startsWith('/demo');
  const [catalogDataSource, setCatalogDataSource] = useState<'local' | 'firestore'>('local');

  // Real-time sync of catalogDataSource from appConfig/public
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'appConfig', 'public'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.catalogDataSource === 'firestore') {
          setCatalogDataSource('firestore');
        } else {
          setCatalogDataSource('local');
        }
      } else {
        setCatalogDataSource('local');
      }
    }, (err) => {
      console.warn("Could not load appConfig/public, defaulting to local:", err);
      setCatalogDataSource('local');
    });
    return () => unsub();
  }, []);

  const [citiesState, setCitiesState] = useState<City[]>(CITIES);

  const setCities = (
    value: City[] | ((prev: City[]) => City[])
  ) => {
    setCitiesState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (!isDemo && catalogDataSource === 'firestore') {
        next.forEach((newCity) => {
          const oldCity = prev.find((c) => c.id === newCity.id);
          if (!oldCity || JSON.stringify(oldCity) !== JSON.stringify(newCity)) {
            citiesRepository.saveCity(newCity).catch((err) => {
              console.error(`Error saving city ${newCity.id} to Firestore:`, err);
            });
          }
        });
      }
      return next;
    });
  };

  const cities = citiesState;

  const [establishmentsState, setEstablishmentsState] = useState<Establishment[]>([]);

  const setEstablishments = (
    value: Establishment[] | ((prev: Establishment[]) => Establishment[])
  ) => {
    setEstablishmentsState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      
      if (!isDemo && catalogDataSource === 'firestore') {
        next.forEach((newEst) => {
          const oldEst = prev.find((e) => e.id === newEst.id);
          if (!oldEst || JSON.stringify(oldEst) !== JSON.stringify(newEst)) {
            establishmentsRepository.saveEstablishment(newEst).catch((err) => {
              console.error(`Error saving establishment ${newEst.id} to Firestore:`, err);
            });
          }
        });
      } else {
        localStorage.setItem('pl_establishments', JSON.stringify(next));
      }
      return next;
    });
  };

  const establishments = establishmentsState;

  const [productsState, setProductsState] = useState<Record<string, Product[]>>({});

  const setProducts = (
    value: Record<string, Product[]> | ((prev: Record<string, Product[]>) => Record<string, Product[]>)
  ) => {
    setProductsState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      
      if (!isDemo && catalogDataSource === 'firestore') {
        Object.entries(next).forEach(([estId, nextList]) => {
          const prevList = prev[estId] || [];
          
          nextList.forEach((newProd) => {
            const oldProd = prevList.find((p) => p.id === newProd.id);
            if (!oldProd || JSON.stringify(oldProd) !== JSON.stringify(newProd)) {
              productsRepository.saveProduct(estId, newProd).catch((err) => {
                console.error(`Error saving product ${newProd.id} to Firestore:`, err);
              });
            }
          });
        });
      } else {
        localStorage.setItem('pl_products', JSON.stringify(next));
      }
      return next;
    });
  };

  const products = productsState;

  // Cities Subscription
  useEffect(() => {
    if (isDemo || catalogDataSource !== 'firestore' || !db) {
      setCitiesState(CITIES);
      return;
    }

    const q = query(collection(db, 'cities'), orderBy('sortOrder'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: City[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as City);
      });
      if (list.length > 0) {
        setCitiesState(list);
      } else {
        setCitiesState(CITIES);
      }
    }, (err) => {
      console.error("Cities subscription error:", err);
    });

    return () => unsub();
  }, [isDemo, catalogDataSource]);

  // Establishments Subscription
  useEffect(() => {
    if (isDemo || catalogDataSource !== 'firestore' || !db) {
      const saved = localStorage.getItem('pl_establishments');
      let list = saved ? JSON.parse(saved) : [...INITIAL_ESTABLISHMENTS];
      list = ensureDemoEstablishments(list);
      setEstablishmentsState(list.map(e => ({
        ...e,
        open: e.open !== undefined ? e.open : (e.isOpen !== undefined ? e.isOpen : true),
        acceptingOrders: e.acceptingOrders !== undefined ? e.acceptingOrders : true,
        temporarilyPaused: e.temporarilyPaused !== undefined ? e.temporarilyPaused : false,
        suspended: e.suspended !== undefined ? e.suspended : false,
        acceptCash: e.acceptCash !== undefined ? e.acceptCash : true,
        acceptPix: e.acceptPix !== undefined ? e.acceptPix : true,
        acceptDebitCard: e.acceptDebitCard !== undefined ? e.acceptDebitCard : true,
        acceptCreditCard: e.acceptCreditCard !== undefined ? e.acceptCreditCard : true,
        acceptContactless: e.acceptContactless !== undefined ? e.acceptContactless : true,
        acceptDeliveryPayment: e.acceptDeliveryPayment !== undefined ? e.acceptDeliveryPayment : true,
        acceptPickupPayment: e.acceptPickupPayment !== undefined ? e.acceptPickupPayment : true,
      })));
      return;
    }

    const q = collection(db, 'establishments');
    const unsub = onSnapshot(q, (snapshot) => {
      const list: Establishment[] = [];
      snapshot.forEach((doc) => {
        list.push(normalizeEstablishmentFromFirestore(doc.data(), doc.id));
      });
      if (list.length > 0) {
        setEstablishmentsState(list);
      }
    }, (err) => {
      console.error("Establishments subscription error:", err);
    });

    return () => unsub();
  }, [isDemo, catalogDataSource]);

  // Products Subscription
  useEffect(() => {
    if (isDemo || catalogDataSource !== 'firestore' || !db) {
      const saved = localStorage.getItem('pl_products');
      setProductsState(saved ? JSON.parse(saved) : INITIAL_PRODUCTS);
      return;
    }

    const q = collection(db, 'products');
    const unsub = onSnapshot(q, (snapshot) => {
      const record: Record<string, Product[]> = {};
      snapshot.forEach((doc) => {
        const prod = normalizeProductFromFirestore(doc.data(), doc.id);
        const estId = prod.establishmentId || 'unknown';
        if (!record[estId]) {
          record[estId] = [];
        }
        record[estId].push(prod);
      });
      setProductsState(record);
    }, (err) => {
      console.error("Products subscription error:", err);
    });

    return () => unsub();
  }, [isDemo, catalogDataSource]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(true);

  const [currentUserRole, setCurrentUserRole] = useState<'customer' | 'merchant' | 'admin' | null>(null);

  const [adminFilters, setAdminFilters] = useState({
    cityId: 'all',
    establishmentId: 'all',
    status: 'all',
    deliveryType: 'all',
    paymentMethod: 'all',
    period: 'all'
  });

  // Dynamic real-time subscription for orders
  useEffect(() => {
    if (!db) {
      setOrdersLoading(false);
      return;
    }

    let unsubscribeOrders: (() => void) | null = null;
    let unsubscribeProfile: (() => void) | null = null;

    const setupSubscription = (uid: string) => {
      // Clean up previous order subscription
      if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
      }

      setOrdersLoading(true);

      // We listen to the user profile document at 'users/{uid}'
      const profileRef = doc(db, "users", uid);
      unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
        let role = 'customer';
        let estId: string | null = null;

        if (docSnap.exists()) {
          const profileData = docSnap.data();
          role = profileData.role || 'customer';
          estId = profileData.establishmentId || null;
        }

        setCurrentUserRole(role as any);

        // Based on role and estId, subscribe to the correct orders
        if (unsubscribeOrders) {
          unsubscribeOrders();
          unsubscribeOrders = null;
        }

        if (role === 'merchant' && estId) {
          unsubscribeOrders = orderService.subscribeToEstablishmentOrders(estId, (fetchedOrders) => {
            setOrders(fetchedOrders);
            setOrdersLoading(false);
          });
        } else if (role === 'admin') {
          // Admins subscribe to filtered orders in real-time
          unsubscribeOrders = orderService.subscribeToAdminOrders(adminFilters, (fetchedOrders) => {
            setOrders(fetchedOrders);
            setOrdersLoading(false);
          });
        } else {
          // Customer (or anyone else) subscribes to their own customer orders
          unsubscribeOrders = orderService.subscribeToCustomerOrders(uid, (fetchedOrders) => {
            setOrders(fetchedOrders);
            setOrdersLoading(false);
          });
        }
      }, (err) => {
        console.error("Error watching user profile:", err);
        // Fallback to customer orders subscription
        unsubscribeOrders = orderService.subscribeToCustomerOrders(uid, (fetchedOrders) => {
          setOrders(fetchedOrders);
          setOrdersLoading(false);
        });
      });
    };

    // Listen to Firebase Auth state
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
      }

      if (user) {
        setupSubscription(user.uid);
      } else {
        setOrders([]);
        setCurrentUserRole(null);
        setOrdersLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, [adminFilters]);

  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('pl_cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [neighborhoods, setNeighborhoodsState] = useState<DeliveryNeighborhood[]>(() => {
    const saved = localStorage.getItem('pl_neighborhoods');
    return saved ? JSON.parse(saved) : INITIAL_NEIGHBORHOODS;
  });

  const [businessHours, setBusinessHoursState] = useState<BusinessHours[]>(() => {
    const saved = localStorage.getItem('pl_business_hours');
    return saved ? JSON.parse(saved) : INITIAL_BUSINESS_HOURS;
  });

  const [tickets, setTickets] = useState<SupportTicket[]>(() => {
    const saved = localStorage.getItem('pl_tickets');
    return saved ? JSON.parse(saved) : INITIAL_TICKETS;
  });

  const [feedbacks, setFeedbacks] = useState<Feedback[]>(() => {
    const saved = localStorage.getItem('pl_feedbacks');
    return saved ? JSON.parse(saved) : INITIAL_FEEDBACKS;
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      dismissToast(id);
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('pl_establishments', JSON.stringify(establishments));
  }, [establishments]);

  useEffect(() => {
    localStorage.setItem('pl_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    const runMigration = () => {
      const currentVersion = localStorage.getItem('uaipertim_official_data_version');
      if (currentVersion !== String(OFFICIAL_APP_DATA_VERSION)) {
        const keysToRemove = [
          'demoOrders',
          'mockOrders',
          'demoUserOrders',
          'orderHistory',
          'activeDemoOrders',
          'pl_orders'
        ];
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
        });
        localStorage.setItem('uaipertim_official_data_version', String(OFFICIAL_APP_DATA_VERSION));
      }
    };
    runMigration();
  }, []);

  useEffect(() => {
    localStorage.setItem('pl_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('pl_neighborhoods', JSON.stringify(neighborhoods));
  }, [neighborhoods]);

  useEffect(() => {
    localStorage.setItem('pl_business_hours', JSON.stringify(businessHours));
  }, [businessHours]);

  useEffect(() => {
    localStorage.setItem('pl_tickets', JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    localStorage.setItem('pl_feedbacks', JSON.stringify(feedbacks));
  }, [feedbacks]);

  // Actions
  const addToCart = (item: CartItem) => {
    const est = establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
    if (!canEstablishmentReceiveOrders(est)) {
      showToast(`O estabelecimento está fechado e não pode receber novos pedidos neste momento.`, 'error');
      return;
    }
    setCart((prev) => {
      // Look for identical item (same product, size, border, extras)
      const existingIndex = prev.findIndex((i) => {
        if (i.product.id !== item.product.id) return false;
        if (i.selectedSize !== item.selectedSize) return false;
        if (i.selectedBorder !== item.selectedBorder) return false;
        if (JSON.stringify(i.selectedExtras) !== JSON.stringify(item.selectedExtras)) return false;
        return true;
      });

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += item.quantity;
        return updated;
      }
      return [...prev, item];
    });
    showToast(`${item.product.name} adicionado ao carrinho!`, 'success');
  };

  const updateCartItemQuantity = (index: number, change: number) => {
    if (change > 0) {
      const est = establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
      if (!canEstablishmentReceiveOrders(est)) {
        showToast('O estabelecimento está fechado e não pode receber pedidos agora.', 'error');
        return;
      }
    }
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + change;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index].quantity = newQty;
      }
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    const item = cart[index];
    if (!item) return;
    setCart((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
    showToast(`${item.product.name} removido do carrinho.`, 'info');
  };

  const clearCart = () => {
    setCart([]);
  };

  const setNeighborhoods = (n: DeliveryNeighborhood[]) => {
    setNeighborhoodsState(n);
    showToast('Configurações de bairros salvas!', 'success');
  };

  const setBusinessHours = (h: BusinessHours[]) => {
    setBusinessHoursState(h);
    showToast('Configurações de horários salvas!', 'success');
  };

  const placeOrder = async (orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'establishmentId' | 'establishmentName' | 'cityId' | 'cityName' | 'state'>): Promise<Order> => {
    const est = establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
    if (!canEstablishmentReceiveOrders(est)) {
      throw new Error("O estabelecimento não pode receber pedidos neste momento.");
    }

    try {
      // 1. Validar e criar o pedido no Firestore;
      // 2. Aguardar a confirmação da gravação;
      const newOrder = await orderService.createOrder(orderData, {
        establishmentId: est.id,
        establishmentName: est.name,
        cityId: est.cityId || 'sao-joao-batista-do-gloria-mg',
        cityName: est.cityName || 'São João Batista do Glória',
        state: est.state || 'MG'
      });

      // 3. Somente depois limpar o carrinho
      clearCart();
      showToast(`Pedido ${newOrder.id} enviado com sucesso!`, 'success');
      return newOrder;
    } catch (error: any) {
      console.error("Erro ao realizar pedido no Firestore:", error);
      // Se a gravação falhar, não limpar o carrinho, mostrar mensagem de erro, etc.
      throw new Error(error.message || "Não foi possível enviar seu pedido ao banco de dados. Verifique a conexão.");
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    changedByUid?: string,
    changedByRole?: 'merchant' | 'admin',
    note?: string | null
  ) => {
    try {
      const uid = changedByUid || auth.currentUser?.uid || 'system';
      const role = changedByRole || (currentUserRole === 'admin' ? 'admin' : 'merchant');
      await orderService.updateOrderStatus(orderId, newStatus, uid, role, note);
      
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
      showToast(`Pedido ${orderId} atualizado para: ${statusLabels[newStatus]}!`, 'info');
    } catch (e: any) {
      console.error("Erro ao atualizar status:", e);
      let errorMsg = "Não foi possível atualizar o status no servidor. Verifique a conexão.";
      if (e.message) {
        try {
          const parsed = JSON.parse(e.message);
          if (parsed.error && (parsed.error.includes("Transição") || parsed.error.includes("Não é permitido") || parsed.error.includes("não existe"))) {
            errorMsg = parsed.error;
          }
        } catch {
          if (e.message.includes("Transição") || e.message.includes("Não é permitido") || e.message.includes("não existe")) {
            errorMsg = e.message;
          }
        }
      }
      showToast(errorMsg, 'error');
      throw e;
    }
  };

  const updateOrderPaymentStatus = async (orderId: string, newPaymentStatus: 'pending' | 'paid' | 'not_paid' | 'cancelled') => {
    try {
      await orderService.updateOrderPaymentStatus(orderId, newPaymentStatus);
      
      const paymentStatusLabels: Record<string, string> = {
        pending: 'Pendente',
        paid: 'Pago',
        not_paid: 'Não Realizado',
        cancelled: 'Cancelado'
      };
      showToast(`Pagamento do Pedido ${orderId} atualizado para: ${paymentStatusLabels[newPaymentStatus]}!`, 'success');
    } catch (e: any) {
      console.error("Erro ao atualizar pagamento:", e);
      showToast("Não foi possível atualizar o pagamento no servidor.", 'error');
    }
  };

  const addOrUpdateProduct = (establishmentId: string, product: Product) => {
    let isUpdate = false;
    const currentList = products[establishmentId] || [];
    if (currentList.some(p => p.id === product.id)) {
      isUpdate = true;
    }

    setProducts((prev) => {
      const currentList = prev[establishmentId] || [];
      const index = currentList.findIndex(p => p.id === product.id);
      const updatedList = [...currentList];
      
      if (index > -1) {
        updatedList[index] = product;
      } else {
        updatedList.push(product);
      }

      return {
        ...prev,
        [establishmentId]: updatedList
      };
    });

    if (isUpdate) {
      showToast('Produto atualizado com sucesso!', 'success');
    } else {
      showToast('Produto adicionado ao cardápio!', 'success');
    }
  };

  const deleteProduct = (establishmentId: string, productId: string) => {
    if (!isDemo && catalogDataSource === 'firestore') {
      const currentList = products[establishmentId] || [];
      const prod = currentList.find(p => p.id === productId);
      if (prod) {
        const updated = { ...prod, available: false, active: false };
        productsRepository.saveProduct(establishmentId, updated).then(() => {
          showToast('Produto desativado com sucesso!', 'info');
        }).catch((err) => {
          console.error("Error disabling product:", err);
          showToast('Erro ao desativar produto.', 'error');
        });
      }
    } else {
      setProducts((prev) => {
        const currentList = prev[establishmentId] || [];
        const updatedList = currentList.filter(p => p.id !== productId);
        return {
          ...prev,
          [establishmentId]: updatedList
        };
      });
      showToast('Produto excluído do cardápio!', 'info');
    }
  };

  const resetDemo = () => {
    localStorage.removeItem('pl_establishments');
    localStorage.removeItem('pl_products');
    localStorage.removeItem('pl_orders');
    localStorage.removeItem('pl_cart');
    localStorage.removeItem('pl_neighborhoods');
    localStorage.removeItem('pl_business_hours');
    localStorage.removeItem('pl_tickets');
    localStorage.removeItem('pl_feedbacks');
    localStorage.removeItem('pl_selected_city');
    localStorage.setItem('uaipertim_demo_version', String(DEMO_DATA_VERSION));

    setEstablishments(INITIAL_ESTABLISHMENTS);
    setProducts(INITIAL_PRODUCTS);
    setOrders(INITIAL_ORDERS);
    setCart([]);
    setNeighborhoodsState(INITIAL_NEIGHBORHOODS);
    setBusinessHoursState(INITIAL_BUSINESS_HOURS);
    setTickets(INITIAL_TICKETS);
    setFeedbacks(INITIAL_FEEDBACKS);
    setSelectedEstablishmentId('pizzaria-da-praca');
    setEnvironment('cliente');
    
    const defaultCity = CITIES.find(c => c.id === 'sao-joao-batista-do-gloria-mg') || CITIES[0];
    setSelectedCityState(defaultCity);
    localStorage.setItem('pl_selected_city', JSON.stringify(defaultCity));
    
    showToast('Demonstração da UaiPertim reiniciada com sucesso.', 'success');
  };

  return (
    <AppContext.Provider value={{
      environment,
      setEnvironment,
      selectedCity,
      setSelectedCity,
      cities: CITIES,
      establishments,
      setEstablishments,
      products,
      setProducts,
      orders,
      setOrders,
      ordersLoading,
      cart,
      addToCart,
      updateCartItemQuantity,
      removeFromCart,
      clearCart,
      selectedEstablishmentId,
      setSelectedEstablishmentId,
      neighborhoods,
      setNeighborhoods,
      businessHours,
      setBusinessHours,
      tickets,
      setTickets,
      feedbacks,
      setFeedbacks,
      placeOrder,
      updateOrderStatus,
      updateOrderPaymentStatus,
      addOrUpdateProduct,
      deleteProduct,
      resetDemo,
      toasts,
      showToast,
      dismissToast,
      connectionStatus,
      adminFilters,
      setAdminFilters
    }}>

      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
