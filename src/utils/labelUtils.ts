import { EstablishmentSegment, OrderStatus, OperationMode } from '../types';

export const getCatalogLabel = (segment: EstablishmentSegment = 'other'): string => {
  const labels: Record<EstablishmentSegment, string> = {
    food: 'Cardápio',
    market: 'Produtos',
    pharmacy: 'Produtos',
    petshop: 'Catálogo',
    agro: 'Catálogo',
    convenience: 'Catálogo',
    gifts: 'Catálogo',
    other: 'Catálogo',
  };
  return labels[segment] || 'Catálogo';
};

export const getStatusLabel = (status: OrderStatus, operationMode: OperationMode = 'preparation'): string => {
  const labels: Record<OperationMode, Record<OrderStatus, string>> = {
    preparation: {
      aguardando_confirmacao: 'Aguardando Confirmação',
      confirmado: 'Pedido confirmado',
      em_preparacao: 'Em preparação',
      pronto: 'Pedido pronto',
      pronto_retirada: 'Pedido pronto',
      saiu_entrega: 'Saiu para Entrega',
      concluido: 'Concluído',
      recusado: 'Recusado'
    },
    picking: {
      aguardando_confirmacao: 'Aguardando Confirmação',
      confirmado: 'Pedido confirmado',
      em_preparacao: 'Em separação',
      pronto: 'Pedido separado',
      pronto_retirada: 'Pedido separado',
      saiu_entrega: 'Saiu para Entrega',
      concluido: 'Concluído',
      recusado: 'Recusado'
    },
    mixed: {
      aguardando_confirmacao: 'Aguardando Confirmação',
      confirmado: 'Pedido confirmado',
      em_preparacao: 'Processando pedido',
      pronto: 'Pedido pronto',
      pronto_retirada: 'Pedido pronto',
      saiu_entrega: 'Saiu para Entrega',
      concluido: 'Concluído',
      recusado: 'Recusado'
    }
  };
  
  return labels[operationMode][status] || status;
};

export const getStatusMessage = (status: OrderStatus, operationMode: OperationMode = 'preparation'): string => {
  const messages: Record<OperationMode, Record<OrderStatus, string>> = {
    preparation: {
      aguardando_confirmacao: 'O estabelecimento está revisando seu pedido.',
      confirmado: 'O estabelecimento iniciou a preparação do seu pedido.',
      em_preparacao: 'O estabelecimento iniciou a preparação do seu pedido.',
      pronto: 'Pedido pronto para entrega.',
      pronto_retirada: 'Pedido pronto para retirada.',
      saiu_entrega: 'Seu pedido saiu para entrega.',
      concluido: 'Pedido concluído.',
      recusado: 'Pedido recusado.'
    },
    picking: {
      aguardando_confirmacao: 'O estabelecimento está revisando seu pedido.',
      confirmado: 'O estabelecimento iniciou a separação dos seus produtos.',
      em_preparacao: 'O estabelecimento iniciou a separação dos seus produtos.',
      pronto: 'Pedido separado para entrega.',
      pronto_retirada: 'Pedido separado para retirada.',
      saiu_entrega: 'Seu pedido saiu para entrega.',
      concluido: 'Pedido concluído.',
      recusado: 'Pedido recusado.'
    },
    mixed: {
      aguardando_confirmacao: 'O estabelecimento está revisando seu pedido.',
      confirmado: 'O estabelecimento está processando seu pedido.',
      em_preparacao: 'O estabelecimento está processando seu pedido.',
      pronto: 'Pedido pronto.',
      pronto_retirada: 'Pedido pronto.',
      saiu_entrega: 'Seu pedido saiu para entrega.',
      concluido: 'Pedido concluído.',
      recusado: 'Pedido recusado.'
    }
  };
  
  return messages[operationMode][status] || '';
};
