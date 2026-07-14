export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
  pix_on_delivery: "Pix na entrega",
  pix: "Pix",
  entrega_cartao: "Cartão na entrega",
  entrega_dinheiro: "Dinheiro na entrega"
};

/**
 * Returns the human-readable payment method label, dynamically adjusting for delivery/pickup context.
 */
export function getPaymentMethodLabel(
  paymentMethod: string,
  fulfillmentType: 'entrega' | 'retirada' | string
): string {
  const isPickup = fulfillmentType === 'retirada';

  if (paymentMethod === 'cash' || paymentMethod === 'entrega_dinheiro') {
    return isPickup ? "Dinheiro na retirada" : "Dinheiro na entrega";
  }
  if (paymentMethod === 'card_on_delivery' || paymentMethod === 'entrega_cartao') {
    return isPickup ? "Cartão na retirada" : "Cartão na entrega";
  }
  if (paymentMethod === 'pix_on_delivery' || paymentMethod === 'pix') {
    return isPickup ? "Pix na retirada" : "Pix na entrega";
  }

  return PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod;
}

export const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  entrega: "Entrega",
  retirada: "Retirada"
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pagamento recebido",
  not_paid: "Pagamento não realizado",
  cancelled: "Pagamento cancelado"
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando confirmação",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmed: "Confirmado",
  confirmado: "Confirmado",
  preparing: "Em preparação",
  em_preparacao: "Em preparação",
  ready: "Pedido pronto",
  pronto: "Pedido pronto",
  out_for_delivery: "Saiu para entrega",
  saiu_entrega: "Saiu para entrega",
  ready_for_pickup: "Pronto para retirada",
  pronto_retirada: "Pronto para retirada",
  completed: "Concluído",
  concluido: "Concluído",
  cancelled: "Cancelado",
  recusado: "Recusado",
  rejected: "Recusado"
};
