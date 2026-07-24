import { Order, OrderStatus } from '../types/order';

export type CanonicalOrderStatus =
  | 'aguardando_confirmacao'
  | 'confirmado'
  | 'em_preparacao'
  | 'pronto'
  | 'saiu_entrega'
  | 'concluido'
  | 'recusado'
  | 'cancelado';

export const normalizeOrderStatus = (status: string | undefined): CanonicalOrderStatus => {
  if (!status) return 'aguardando_confirmacao';

  const mapping: Record<string, CanonicalOrderStatus> = {
    'pending': 'aguardando_confirmacao',
    'aguardando': 'aguardando_confirmacao',
    'aguardando_confirmacao': 'aguardando_confirmacao',
    
    'confirmed': 'confirmado',
    'confirmado': 'confirmado',
    
    'preparing': 'em_preparacao',
    'em_preparo': 'em_preparacao',
    'em_preparacao': 'em_preparacao',
    
    'ready': 'pronto',
    'pronto': 'pronto',
    'ready_for_pickup': 'pronto',
    'pronto_retirada': 'pronto',
    
    'out_for_delivery': 'saiu_entrega',
    'saiu_para_entrega': 'saiu_entrega',
    'saiu_entrega': 'saiu_entrega',
    
    'completed': 'concluido',
    'concluido': 'concluido',
    
    'rejected': 'recusado',
    'recusado': 'recusado',
    
    'cancelled': 'cancelado',
    'cancelado': 'cancelado',
  };

  return mapping[status.toLowerCase()] || 'aguardando_confirmacao';
};

export const getCanonicalOrderStatus = (order: Order): CanonicalOrderStatus => {
  return normalizeOrderStatus(order.status);
};

export const getOrderFulfillmentType = (order: Order): 'delivery' | 'pickup' => {
  const type = (order.fulfillmentType || '').toLowerCase().trim();
  if (type === 'pickup') return 'pickup';
  if (type === 'delivery') return 'delivery';
  
  console.error(`[Lifecycle Diagnostic] Invalid or missing fulfillmentType for order ID ${order.id}:`, order.fulfillmentType);
  return 'delivery';
};

export const isActiveOrderStatus = (status: CanonicalOrderStatus): boolean => {
  return ['aguardando_confirmacao', 'confirmado', 'em_preparacao', 'pronto', 'saiu_entrega'].includes(status);
};

export const isFinalOrderStatus = (status: CanonicalOrderStatus): boolean => {
  return ['concluido', 'recusado', 'cancelado'].includes(status);
};

export const getAllowedOrderTransitions = (order: Order): CanonicalOrderStatus[] => {
  const currentStatus = getCanonicalOrderStatus(order);
  const fulfillmentType = getOrderFulfillmentType(order);

  const transitions: Record<CanonicalOrderStatus, CanonicalOrderStatus[]> = {
    aguardando_confirmacao: ['confirmado', 'recusado', 'cancelado'],
    confirmado: ['em_preparacao', 'recusado', 'concluido'],
    em_preparacao: ['pronto', 'recusado', 'concluido'],
    pronto: ['concluido', 'saiu_entrega', 'recusado'],
    saiu_entrega: ['concluido', 'recusado'],
    concluido: [],
    recusado: [],
    cancelado: []
  };

  return transitions[currentStatus] || [];
};

export const canTransitionOrder = (order: Order, nextStatus: CanonicalOrderStatus): boolean => {
  return getAllowedOrderTransitions(order).includes(nextStatus);
};
