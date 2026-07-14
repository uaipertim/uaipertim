export type AppEnvironment = 'cliente' | 'estabelecimento' | 'administracao';

export type EstablishmentSegment = 'food' | 'market' | 'pharmacy' | 'petshop' | 'agro' | 'convenience' | 'gifts' | 'other';
export type OperationMode = 'preparation' | 'picking' | 'mixed';

export interface OptionGroup {
  id: string;
  name: string;
  selectionType: "single" | "multiple";
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  active: boolean;
  options: {
    id: string;
    name: string;
    priceDelta: number;
    active: boolean;
    sortOrder: number;
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
  deliveryTime: string; // e.g. "30-45 min"
  deliveryFee: number;
  minOrderValue: number;
  isOpen: boolean;
  open?: boolean;
  active: boolean;
  acceptingOrders?: boolean;
  temporarilyPaused?: boolean;
  suspended?: boolean;
  featured: boolean;
  image: string;
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

export interface ConfiguredOrderItem {
  productId: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  baseUnitPrice: number;
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

export interface DeliveryNeighborhood {
  id: string;
  name: string;
  fee: number;
  timeEstimate: string;
}

export interface BusinessHours {
  day: string; // e.g. "Segunda-feira"
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}
