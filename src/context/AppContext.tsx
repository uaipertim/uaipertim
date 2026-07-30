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
  City,
  MenuCategory
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
import { doc, onSnapshot, query, collection, orderBy, collectionGroup } from 'firebase/firestore';
import { orderService } from '../services/orderService';
import { citiesRepository } from '../repositories/citiesRepository';
import { establishmentsRepository } from '../repositories/establishmentsRepository';
import { productsRepository } from '../repositories/productsRepository';
import { menuCategoriesRepository } from '../repositories/menuCategoriesRepository';
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
  menuCategories: Record<string, MenuCategory[]>;
  setMenuCategories: React.Dispatch<React.SetStateAction<Record<string, MenuCategory[]>>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  ordersLoading: boolean;
  cart: CartItem[];
  pendingCartItem: CartItem | null;
  setPendingCartItem: React.Dispatch<React.SetStateAction<CartItem | null>>;
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
  allDeliveryZones?: Record<string, any[]>;
  
  // Actions
  placeOrder: (orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'establishmentId' | 'establishmentName'> & { addressId?: string }) => Promise<Order>;
  updateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  updateOrderPaymentStatus: (orderId: string, newPaymentStatus: 'pending' | 'paid' | 'not_paid' | 'cancelled') => void;
  addOrUpdateProduct: (establishmentId: string, product: Product, options?: { silent?: boolean }) => Promise<void>;
  deleteProduct: (establishmentId: string, productId: string) => Promise<void>;
  addOrUpdateMenuCategory: (establishmentId: string, category: MenuCategory) => Promise<void>;
  deleteMenuCategory: (establishmentId: string, categoryId: string) => Promise<void>;
  resetDemo: () => void;
  
  // Toast
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', id?: string) => void;
  dismissToast: (id: string) => void;

  // Firebase Database Connection Status
  connectionStatus: ConnectionStatus | null;
  retryConnection: () => void;

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
  const [connectionRetryTrigger, setConnectionRetryTrigger] = useState(0);

  useEffect(() => {
    checkFirebaseConnection().then((status) => {
      setConnectionStatus(status);
    });
  }, [connectionRetryTrigger]);

  const retryConnection = () => {
    setConnectionStatus(null);
    setConnectionRetryTrigger(prev => prev + 1);
  };


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
      
      if (isDemo || catalogDataSource !== 'firestore') {
        localStorage.setItem('pl_products', JSON.stringify(next));
      }
      return next;
    });
  };

  const products = productsState;

  const [menuCategoriesState, setMenuCategoriesState] = useState<Record<string, MenuCategory[]>>({});

  const [allDeliveryZonesState, setAllDeliveryZonesState] = useState<Record<string, any[]>>({});

  const setMenuCategories = (
    value: Record<string, MenuCategory[]> | ((prev: Record<string, MenuCategory[]>) => Record<string, MenuCategory[]>)
  ) => {
    setMenuCategoriesState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      
      if (!isDemo && catalogDataSource === 'firestore') {
        Object.entries(next).forEach(([estId, nextList]) => {
          const prevList = prev[estId] || [];
          
          nextList.forEach((newCat) => {
            const oldCat = prevList.find((c) => c.id === newCat.id);
            if (!oldCat || JSON.stringify(oldCat) !== JSON.stringify(newCat)) {
              menuCategoriesRepository.saveMenuCategory(estId, newCat).catch((err) => {
                console.error(`Error saving category ${newCat.id} to Firestore:`, err);
              });
            }
          });
        });
      } else {
        localStorage.setItem('pl_menu_categories', JSON.stringify(next));
      }
      return next;
    });
  };

  const menuCategories = menuCategoriesState;

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
      setEstablishmentsState(list.map(e => {
        const normalized = normalizeEstablishmentFromFirestore(e, e.id);
        return {
          ...normalized,
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
        };
      }));
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
      const loadedProducts = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
      
      const savedCats = localStorage.getItem('pl_menu_categories');
      if (!savedCats) {
        const initialCats: Record<string, MenuCategory[]> = {};
        Object.keys(loadedProducts).forEach(estId => {
          const prods = loadedProducts[estId] || [];
          const uniqueCats = Array.from(new Set(prods.map((p: any) => p.category).filter(Boolean)));
          initialCats[estId] = uniqueCats.map((catNameObj, idx) => {
            const catName = String(catNameObj);
            const normName = catName.toLowerCase().trim();
            const catId = `${estId}-${normName.replace(/\s+/g, '-')}`;
            return {
              id: catId,
              establishmentId: estId,
              name: catName,
              normalizedName: normName,
              active: true,
              sortOrder: idx + 1,
            };
          });

          prods.forEach((p: any) => {
            if (!p.menuCategoryId) {
              const normName = p.category?.toLowerCase().trim();
              const matchedCat = initialCats[estId].find(c => c.normalizedName === normName);
              if (matchedCat) {
                p.menuCategoryId = matchedCat.id;
                p.menuCategoryName = matchedCat.name;
              }
            }
          });
        });
        localStorage.setItem('pl_menu_categories', JSON.stringify(initialCats));
        localStorage.setItem('pl_products', JSON.stringify(loadedProducts));
        setMenuCategoriesState(initialCats);
      }
      
      setProductsState(loadedProducts);
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

  // Menu Categories Subscription
  useEffect(() => {
    if (isDemo || catalogDataSource !== 'firestore' || !db) {
      const saved = localStorage.getItem('pl_menu_categories');
      if (saved) {
        setMenuCategoriesState(JSON.parse(saved));
      }
      return;
    }

    try {
      const q = collectionGroup(db, 'menuCategories');
      const unsub = onSnapshot(q, (snapshot) => {
        const record: Record<string, MenuCategory[]> = {};
        snapshot.forEach((doc) => {
          const data = doc.data();
          const estId = data.establishmentId || doc.ref.parent.parent?.id || 'unknown';
          if (!record[estId]) {
            record[estId] = [];
          }
          record[estId].push({
            id: doc.id,
            establishmentId: estId,
            name: data.name || '',
            normalizedName: data.normalizedName || '',
            active: data.active !== false,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
        });
        
        Object.keys(record).forEach(estId => {
          record[estId].sort((a, b) => a.sortOrder - b.sortOrder);
        });

        setMenuCategoriesState(record);
      }, (err) => {
        console.error("Menu categories subscription error:", err);
      });

      return () => unsub();
    } catch (error) {
      console.error("Error setting up menuCategories subscription:", error);
    }
  }, [isDemo, catalogDataSource]);

  // Delivery Zones Subscription - REMOVED for security and performance optimization.
  useEffect(() => {
    // No-op: Removed global collectionGroup listener.
    setAllDeliveryZonesState({});
  }, []);

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

  const [pendingCartItem, setPendingCartItem] = useState<CartItem | null>(null);

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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', id?: string) => {
    const toastId = id || Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      // Deduplicate: do not add the same toast if it already exists in the active queue
      if (prev.some((t) => t.id === toastId || (t.message === message && t.type === type))) {
        return prev;
      }
      return [...prev, { id: toastId, type, message }];
    });
    setTimeout(() => {
      dismissToast(toastId);
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
    const productEstId = item.product.establishmentId;
    const est = establishments.find(e => e.id === productEstId) || establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
    if (!canEstablishmentReceiveOrders(est)) {
      showToast(`O estabelecimento está fechado e não pode receber novos pedidos neste momento.`, 'error');
      return;
    }
    if (cart.length > 0 && cart[0].product.establishmentId !== productEstId) {
      setPendingCartItem(item);
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
        return prev.map((curr, idx) => {
          if (idx === existingIndex) {
            return {
              ...curr,
              quantity: curr.quantity + item.quantity
            };
          }
          return curr;
        });
      }
      return [...prev, { ...item }];
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
      const item = prev[index];
      if (!item) return prev;
      const newQty = item.quantity + change;
      if (newQty <= 0) {
        return prev.filter((_, idx) => idx !== index);
      } else {
        return prev.map((curr, idx) => {
          if (idx === index) {
            return {
              ...curr,
              quantity: newQty
            };
          }
          return curr;
        });
      }
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

  const placeOrder = async (orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'establishmentId' | 'establishmentName' | 'cityId' | 'cityName' | 'state'> & { addressId?: string }): Promise<Order> => {
    const activeEstId = cart.length > 0 ? cart[0].product.establishmentId : selectedEstablishmentId;
    const est = establishments.find(e => e.id === activeEstId) || establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];
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
      const order = orders.find(o => o.id === orderId);
      const currentStatus = order ? order.status : 'desconhecido';
      console.error("ORDER_STATUS_UPDATE_FAILED", {
        orderId,
        currentStatus,
        targetStatus: newStatus,
        errorCode: e?.code || e?.name || "unknown",
        errorMessage: e?.message || String(e),
        httpStatus: e?.status || null
      });
      let errorMsg = "Não foi possível atualizar o status no servidor. Verifique a conexão.";
      if (e.message) {
        try {
          const parsed = JSON.parse(e.message);
          if (parsed.error && (parsed.error.includes("Transição") || parsed.error.includes("Não é permitido") || parsed.error.includes("não existe") || parsed.error.includes("permissão") || parsed.error.includes("permission-denied"))) {
            errorMsg = parsed.error;
          }
        } catch {
          if (e.message.includes("Transição") || e.message.includes("Não é permitido") || e.message.includes("não existe") || e.message.includes("permissão") || e.message.includes("permission-denied")) {
            errorMsg = e.message;
          }
        }
      }
      if (e?.code === 'permission-denied' || e?.message?.includes('permission-denied') || e?.message?.includes('insufficient permissions')) {
        errorMsg = "Seu perfil não possui permissão para atualizar este pedido.";
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

  const addOrUpdateProduct = async (establishmentId: string, product: Product, options?: { silent?: boolean }) => {
    let isUpdate = false;
    const currentList = products[establishmentId] || [];
    if (currentList.some(p => p.id === product.id)) {
      isUpdate = true;
    }

    if (!isDemo && catalogDataSource === 'firestore') {
      const startTime = Date.now();
      console.log(`[Diagnostic] Iniciando submit do produto ${product.id} em ${new Date(startTime).toISOString()}`);
      
      try {
        await productsRepository.saveProduct(establishmentId, product);

        const endTime = Date.now();
        console.log(`[Diagnostic] Fim da requisição. Tempo de gravação no Firestore: ${endTime - startTime}ms. Quantidade de writes lógicos: 1.`);
      } catch (err: any) {
        console.error("Error saving product to Firestore:", err);
        showToast("Erro ao salvar o produto no servidor. Verifique sua conexão.", 'error');
        throw err;
      }
    }

    const stateStartTime = Date.now();
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
    console.log(`[Diagnostic] Tempo de atualização local do estado: ${Date.now() - stateStartTime}ms`);

    if (!options?.silent) {
      if (isUpdate) {
        showToast('Produto atualizado com sucesso!', 'success', `product-update-success-${product.id}`);
      } else {
        showToast('Produto adicionado ao catálogo!', 'success', `product-add-success-${product.id}`);
      }
    }
  };

  const deleteProduct = async (establishmentId: string, productId: string) => {
    if (!isDemo && catalogDataSource === 'firestore') {
      try {
        await productsRepository.deleteProduct(productId);
        setProducts((prev) => {
          const currentList = prev[establishmentId] || [];
          const updatedList = currentList.filter(p => p.id !== productId);
          return {
            ...prev,
            [establishmentId]: updatedList
          };
        });
      } catch (err) {
        console.error("Error deleting product from Firestore:", err);
        throw err;
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
      showToast('Produto excluído do catálogo!', 'info');
    }
  };

  const addOrUpdateMenuCategory = async (establishmentId: string, category: MenuCategory) => {
    let isUpdate = false;
    const currentList = menuCategoriesState[establishmentId] || [];
    if (currentList.some(c => c.id === category.id)) {
      isUpdate = true;
    }

    if (!isDemo && catalogDataSource === 'firestore') {
      try {
        await menuCategoriesRepository.saveMenuCategory(establishmentId, category);
      } catch (err) {
        console.error("Error saving menu category to Firestore:", err);
        showToast("Erro ao salvar a categoria no servidor.", 'error');
        throw err;
      }
    }

    setMenuCategories((prev) => {
      const currentList = prev[establishmentId] || [];
      const index = currentList.findIndex(c => c.id === category.id);
      const updatedList = [...currentList];
      
      if (index > -1) {
        updatedList[index] = category;
      } else {
        updatedList.push(category);
      }

      updatedList.sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        ...prev,
        [establishmentId]: updatedList
      };
    });

    if (isUpdate) {
      showToast('Categoria atualizada com sucesso!', 'success');
    } else {
      showToast('Categoria criada com sucesso!', 'success');
    }
  };

  const deleteMenuCategory = async (establishmentId: string, categoryId: string) => {
    if (!isDemo && catalogDataSource === 'firestore') {
      try {
        await menuCategoriesRepository.deleteMenuCategory(establishmentId, categoryId);
      } catch (err) {
        console.error("Error deleting menu category:", err);
        showToast('Erro ao excluir categoria.', 'error');
        throw err;
      }
    }

    setMenuCategories((prev) => {
      const currentList = prev[establishmentId] || [];
      const updatedList = currentList.filter(c => c.id !== categoryId);
      return {
        ...prev,
        [establishmentId]: updatedList
      };
    });
    showToast('Categoria excluída com sucesso!', 'info');
  };

  const resetDemo = () => {
    localStorage.removeItem('pl_establishments');
    localStorage.removeItem('pl_products');
    localStorage.removeItem('pl_menu_categories');
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
    setMenuCategoriesState({});
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
      menuCategories,
      setMenuCategories,
      orders,
      setOrders,
      ordersLoading,
      cart,
      pendingCartItem,
      setPendingCartItem,
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
      allDeliveryZones: allDeliveryZonesState,
      placeOrder,
      updateOrderStatus,
      updateOrderPaymentStatus,
      addOrUpdateProduct,
      deleteProduct,
      addOrUpdateMenuCategory,
      deleteMenuCategory,
      resetDemo,
      toasts,
      showToast,
      dismissToast,
      connectionStatus,
      retryConnection,
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
