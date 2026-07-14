import { Product } from './product';

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
  timestamp: string;
  changedByUid?: string;
  changedByRole?: 'merchant' | 'admin';
  note?: string | null;
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
  id: string;
  customerId?: string;
  createdAt: string;
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
}
