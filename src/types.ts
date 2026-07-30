export type AppEnvironment = 'cliente' | 'estabelecimento' | 'administracao';

export type EstablishmentSegment = 'food' | 'market' | 'pharmacy' | 'petshop' | 'agro' | 'convenience' | 'gifts' | 'other';
export type OperationMode = 'preparation' | 'picking' | 'mixed';

export interface OptionGroup {
  id: string;
  clientKey?: string;
  tempId?: string;
  name: string;
  description?: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  minSelections: number;
  maxSelections: number;
  allowOptionQuantity?: boolean;
  maxQuantityPerOption?: number;
  position: number;
  active: boolean;
  displayType?: 'segmented' | 'list';
  options: {
    id: string;
    name: string;
    description?: string;
    additionalPrice: number;
    position: number;
    active: boolean;
  }[];
}

export interface OrderMessage {
  id: string;
  orderId: string;
  orderNumber: string;
  establishmentId: string;
  senderId: string;
  senderRole: "customer" | "merchant" | "admin" | "system";
  senderName: string;
  type: "text" | "system";
  text: string;
  createdAt: any;
  readByCustomer: boolean;
  readByMerchant: boolean;
  readByAdmin: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string; // e.g. "Pizzas tradicionais", "Lanches", "Combos", "Bebidas"
  available: boolean;
  image?: string;
  sizes?: string[]; // e.g. ["Pequena", "Média", "Grande"]
  borders?: string[]; // e.g. ["Sem borda", "Borda de Catupiry", "Borda de Cheddar"]
  extras?: { name: string; price: number }[];
  optionGroups?: OptionGroup[]; // NEW GENERIC STRUCTURE
  establishmentId?: string;
  menuCategoryId?: string;
  menuCategoryName?: string;
  promotionalPrice?: number;
  promotionEnabled?: boolean;
  promotionSource?: 'establishment' | 'uaipertim';
  promotionLabel?: string;
  promotionStartsAt?: any;
  promotionEndsAt?: any;
  preparedToOrder?: boolean;
  freshIngredients?: boolean;
}

export interface MenuCategory {
  id: string;
  establishmentId: string;
  name: string;
  normalizedName: string;
  active: boolean;
  sortOrder: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface City {
  id: string;
  name: string;
  state: string;
  active: boolean;
  default: boolean;
}

export interface Establishment {
  id: string;
  name: string;
  category: string;
  rating: number;
  ratingCount?: number;
  ratingAverage?: number;
  ratingSum?: number;
  deliveryTime: string; // e.g. "30-45 min"
  deliveryFee: number;
  minOrderValue: number;
  isOpen: boolean;
  open?: boolean;
  active: boolean;
  acceptingOrders?: boolean;
  temporarilyPaused?: boolean;
  pausedUntil?: string | null;
  suspended?: boolean;
  featured: boolean;
  image: string;
  logoUrl?: string;
  coverImageUrl?: string;
  phone: string;
  email: string;
  owner: string;
  address: string;
  city: string;
  cityId: string;
  cityName: string;
  state: string;
  document: string; // CNPJ
  companyName: string; // Razão Social
  platformFeePercent: number; // Taxa cobrada pela plataforma (e.g. 10%)
  bairro?: string;
  cep?: string;
  atendeRetirada?: boolean;
  entregaPropria?: boolean;
  acceptsDelivery?: boolean;
  acceptsPickup?: boolean;
  aboutDescription?: string;
  acceptedPaymentMethods?: string[];
  bairrosAtendidos?: string;
  acceptCash?: boolean;
  acceptPix?: boolean;
  acceptDebitCard?: boolean;
  acceptCreditCard?: boolean;
  acceptContactless?: boolean;
  acceptDeliveryPayment?: boolean;
  acceptPickupPayment?: boolean;
  description?: string;
  segment?: EstablishmentSegment;
  operationMode?: OperationMode;
  platformStatus?: 'active' | 'inactive' | 'archived';
  categoryName?: string;
  categoryIds?: string[];
  operationalPause?: boolean;
  legalContactName?: string;
  legalContactPhone?: string;
  legalContactEmail?: string;
  ownerUid?: string;
  merchantUid?: string;
  baseEstimatedMinutes?: number;
  pickupEstimatedMinutes?: number;
  estimatedMinMinutes?: number;
  estimatedMaxMinutes?: number;
  deliverySettings?: {
    enabled: boolean;
    defaultDeliveryFee: number;
    defaultMinimumOrderValue: number;
    defaultAdditionalMinutes: number;
    cityId: string;
    cityName: string;
    coverageMode?: 'entire_city' | 'listed_zones_only';
  };
}

export type OrderStatus = 
  | 'aguardando_confirmacao'
  | 'confirmado'
  | 'em_preparacao'
  | 'pronto'
  | 'pronto_retirada'
  | 'saiu_entrega'
  | 'concluido'
  | 'recusado';

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  timestamp: string; // ISO string
}

export interface SelectedOptionGroup {
  groupId: string;
  groupName: string;
  selectedOptions: {
    optionId: string;
    name: string;
    additionalPrice: number;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
  }[];
}

export interface ConfiguredOrderItem {
  productId: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  baseUnitPrice: number;
  regularUnitPrice?: number;
  effectiveUnitPrice?: number;
  promotionApplied?: boolean;
  promotionSource?: 'establishment' | 'uaipertim';
  promotionLabel?: string;
  discountPercentage?: number;
  selectedSize: {
    id: string;
    name: string;
    priceDelta: number;
  } | null;
  selectedCrust: {
    id: string;
    name: string;
    priceDelta: number;
  } | null;
  selectedExtras: {
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
  }[];
  selectedOptionGroups?: SelectedOptionGroup[];
  notes: string | null;
  optionsUnitTotal: number;
  finalUnitPrice: number;
  lineTotal: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedBorder?: string;
  selectedExtras: { name: string; price: number }[];
  selectedOptionGroups?: SelectedOptionGroup[];
  notes?: string;
}

export interface Order {
  id: string; // e.g. "#PL-8429"
  customerId?: string;
  createdAt: string; // ISO string
  customerName: string;
  customerPhone: string;
  customerAddress: {
    street: string;
    number: string;
    bairro: string;
    complement?: string;
  };
  items: (ConfiguredOrderItem | CartItem)[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode?: string | null;
  total: number;
  paymentMethod: 'cash' | 'card_on_delivery' | 'pix_on_delivery' | 'pix' | 'entrega_cartao' | 'entrega_dinheiro';
  paymentStatus?: 'pending' | 'paid' | 'not_paid' | 'cancelled';
  paymentLocation?: 'delivery' | 'pickup';
  changeRequired?: boolean;
  changeFor?: number | null;
  platformProcessedPayment?: boolean;
  deliveryType: 'entrega' | 'retirada';
  notes?: string;
  establishmentId: string;
  establishmentName: string;
  establishmentImage?: string;
  establishmentCity?: string;
  cityId: string;
  cityName: string;
  state: string;
  status: OrderStatus;
  statusHistory?: OrderStatusHistoryEntry[];
  chatLastMessage?: string | null;
  chatLastMessageAt?: any; // Firestore Timestamp
  chatLastSenderRole?: "customer" | "merchant" | null;
  chatUnreadCustomer?: number;
  chatUnreadMerchant?: number;
  chatMessageCount?: number;
  loyaltyPointsGranted?: boolean;
  reviewId?: string;
  reviewSubmitted?: boolean;
  reviewSubmittedAt?: string;
  hasUnreadCustomerUpdate?: boolean;
  customerLastSeenStatus?: string;
  customerLastViewedAt?: any;
}

export interface SupportTicket {
  id: string;
  sender: string; // "Cliente" or "Pizzaria da Praça" etc.
  type: 'cliente' | 'estabelecimento';
  subject: string;
  description: string;
  priority: 'baixa' | 'media' | 'alta';
  status: 'aberto' | 'respondido' | 'fechado';
  date: string;
  replies: { sender: string; message: string; date: string }[];
}

export interface Feedback {
  id: string;
  customerName: string;
  establishmentName: string;
  rating: number; // 1-5
  comment: string;
  date: string;
  approved: boolean;
}

export interface Review {
  id: string; // Matches orderId
  orderId: string;
  establishmentId: string;
  establishmentName?: string;
  customerUid: string;
  customerName: string;
  overallRating: number;
  productQualityRating?: number;
  serviceRating?: number;
  deliveryTimeRating?: number;
  tags?: string[];
  comment?: string;
  status: 'published' | 'under_review' | 'hidden';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  merchantReply?: {
    text: string;
    repliedAt: string;
    repliedByUid: string;
    repliedByName?: string;
  } | null;
  moderationReason?: string | null;
  moderatedByUid?: string | null;
}

export interface DeliveryNeighborhood {
  id: string;
  name: string;
  fee: number;
  timeEstimate: string;
  cityId?: string;
}

export interface DeliveryZone {
  id?: string;
  establishmentId: string;
  cityId: string;
  neighborhoodId: string;
  neighborhoodName: string;
  deliveryFee: number;
  additionalEstimatedMinutes: number;
  minimumOrderValue: number | null;
  active: boolean;
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
}

export interface BusinessHours {
  day: string; // e.g. "Segunda-feira"
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export const ESTABLISHMENT_CATEGORIES = [
  { id: "restaurantes", filterLabel: "Restaurantes", establishmentLabel: "Restaurante", label: "Restaurantes", icon: "🍽️", homeTitle: "Restaurantes", public: true, homeOrder: 1 },
  { id: "pizzarias", filterLabel: "Pizzarias", establishmentLabel: "Pizzaria", label: "Pizzarias", icon: "🍕", homeTitle: "Pizzarias", public: true, homeOrder: 2 },
  { id: "lanches", filterLabel: "Lanches", establishmentLabel: "Lanche", label: "Lanches", icon: "🍔", homeTitle: "Lanches", public: true, homeOrder: 3 },
  { id: "hamburgueres", filterLabel: "Hambúrgueres", establishmentLabel: "Hamburgueria", label: "Hambúrgueres", icon: "🍔", homeTitle: "Hambúrgueres", public: true, homeOrder: 4 },
  { id: "acai_doces", filterLabel: "Açaí e doces", establishmentLabel: "Açaí e doces", label: "Açaí e doces", icon: "🍧", homeTitle: "Açaí e doces", public: true, homeOrder: 5 },
  { id: "padarias", filterLabel: "Padarias", establishmentLabel: "Padaria", label: "Padarias", icon: "🍞", homeTitle: "Padarias", public: true, homeOrder: 6 },
  { id: "confeitarias", filterLabel: "Confeitarias", establishmentLabel: "Confeitaria", label: "Confeitarias", icon: "🍰", homeTitle: "Confeitarias", public: true, homeOrder: 7 },
  { id: "japonesa", filterLabel: "Japonesa", establishmentLabel: "Japonesa", label: "Japonesa", icon: "🍣", homeTitle: "Comida japonesa", public: true, homeOrder: 8 },
  { id: "mineira", filterLabel: "Mineira", establishmentLabel: "Mineira", label: "Mineira", icon: "🍽️", homeTitle: "Comida mineira", public: true, homeOrder: 9 },
  { id: "mercados", filterLabel: "Mercados", establishmentLabel: "Mercado", label: "Mercados", icon: "🛒", homeTitle: "Mercados", public: true, homeOrder: 10 },
  { id: "mercearias", filterLabel: "Mercearias", establishmentLabel: "Mercearia", label: "Mercearias", icon: "🛒", homeTitle: "Mercearias", public: true, homeOrder: 11 },
  { id: "hortifrutis", filterLabel: "Hortifrútis", establishmentLabel: "Hortifrúti", label: "Hortifrútis", icon: "🥦", homeTitle: "Hortifrútis", public: true, homeOrder: 12 },
  { id: "acougues", filterLabel: "Açougues", establishmentLabel: "Açougue", label: "Açougues", icon: "🥩", homeTitle: "Açougues", public: true, homeOrder: 13 },
  { id: "farmacias", filterLabel: "Farmácias", establishmentLabel: "Farmácia", label: "Farmácias", icon: "💊", homeTitle: "Farmácias", public: true, homeOrder: 14 },
  { id: "pet_shops", filterLabel: "Pet Shops", establishmentLabel: "Pet Shop", label: "Pet Shops", icon: "🐾", homeTitle: "Pet Shops", public: true, homeOrder: 15 },
  { id: "agropecuarias", filterLabel: "Agropecuárias", establishmentLabel: "Agropecuária", label: "Agropecuárias", icon: "🌱", homeTitle: "Agropecuárias", public: true, homeOrder: 16 },
  { id: "bebidas", filterLabel: "Bebidas", establishmentLabel: "Bebida", label: "Bebidas", icon: "🍺", homeTitle: "Bebidas", public: true, homeOrder: 17 },
  { id: "conveniencias", filterLabel: "Conveniências", establishmentLabel: "Conveniência", label: "Conveniências", icon: "🏪", homeTitle: "Conveniências", public: true, homeOrder: 18 },
  { id: "papelarias", filterLabel: "Papelarias", establishmentLabel: "Papelaria", label: "Papelarias", icon: "✏️", homeTitle: "Papelarias", public: true, homeOrder: 19 },
  { id: "floriculturas", filterLabel: "Floriculturas", establishmentLabel: "Floricultura", label: "Floriculturas", icon: "🌸", homeTitle: "Floriculturas", public: true, homeOrder: 20 },
  { id: "materiais_construcao", filterLabel: "Materiais de construção", establishmentLabel: "Material de construção", label: "Materiais de construção", icon: "🧱", homeTitle: "Materiais de construção", public: true, homeOrder: 21 },
  { id: "utilidades_domesticas", filterLabel: "Utilidades domésticas", establishmentLabel: "Utilidade doméstica", label: "Utilidades domésticas", icon: "🧹", homeTitle: "Utilidades domésticas", public: true, homeOrder: 22 }
];

export const PUBLIC_ESTABLISHMENT_CATEGORIES = ESTABLISHMENT_CATEGORIES.filter(c => c.public);

export const CATEGORY_LABELS: Record<string, string> = {
  // Canonical
  restaurantes: "Restaurantes",
  pizzarias: "Pizzarias",
  lanches: "Lanches",
  hamburgueres: "Hambúrgueres",
  acai_doces: "Açaí e doces",
  padarias: "Padarias",
  confeitarias: "Confeitarias",
  japonesa: "Japonesa",
  mineira: "Mineira",
  brasileira: "Mineira",
  mercados: "Mercados",
  mercearias: "Mercearias",
  hortifrutis: "Hortifrútis",
  acougues: "Açougues",
  farmacias: "Farmácias",
  pet_shops: "Pet Shops",
  agropecuarias: "Agropecuárias",
  bebidas: "Bebidas",
  conveniencias: "Conveniências",
  papelarias: "Papelarias",
  floriculturas: "Floriculturas",
  materiais_construcao: "Materiais de construção",
  utilidades_domesticas: "Utilidades domésticas",

  // Legacy mappings for robustness and safety
  comida_brasileira: 'Mineira',
  culinaria_brasileira: 'Mineira',
  comida_mineira: 'Mineira',
  restaurants: 'Restaurantes',
  pizzerias: 'Pizzarias',
  pizzas: 'Pizzarias',
  pizza: 'Pizzarias',
  snacks: 'Lanches',
  snack: 'Lanches',
  burgers: 'Hambúrgueres',
  acai_sweets: 'Açaí e doces',
  bakeries: 'Padarias',
  confectioneries: 'Confeitarias',
  markets: 'Mercados',
  grocery: 'Mercearias',
  produce: 'Hortifrútis',
  butchers: 'Açougues',
  pharmacies: 'Farmácias',
  pharmacy: 'Farmácias',
  pet_shops_legacy: 'Pet Shops',
  agriculture: 'Agropecuárias',
  beverages: 'Bebidas',
  convenience: 'Conveniências',
  stationery: 'Papelarias',
  flower_shops: 'Floriculturas',
  construction: 'Materiais de construção',
  home_utilities: 'Utilidades domésticas',
  fashion: 'Moda e acessórios',
  electronics: 'Eletrônicos',
  local_services: 'Serviços locais',
  other: 'Outros'
};

