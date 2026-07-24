import { EstablishmentSegment, OrderStatus, OperationMode } from '../types';
import { CATEGORY_LABELS } from '../types';

export const normalizeCategoryId = (cat: string | undefined | null): string => {
  if (!cat) return 'restaurantes';
  const trimmed = cat.trim().toLowerCase();
  
  const mapping: Record<string, string> = {
    'restaurants': 'restaurantes',
    'restaurant': 'restaurantes',
    'restaurante': 'restaurantes',
    'restaurantes': 'restaurantes',
    
    'pizzas': 'pizzarias',
    'pizza': 'pizzarias',
    'pizzerias': 'pizzarias',
    'pizzeria': 'pizzarias',
    'pizzaria': 'pizzarias',
    'pizzarias': 'pizzarias',
    
    'snacks': 'lanches',
    'snack': 'lanches',
    'lanche': 'lanches',
    'lanches': 'lanches',
    
    'burgers': 'hamburgueres',
    'burger': 'hamburgueres',
    'hambúrgueres': 'hamburgueres',
    'hambúrguer': 'hamburgueres',
    'hamburgueres': 'hamburgueres',
    'hamburguer': 'hamburgueres',
    
    'acai_sweets': 'acai_doces',
    'sweets': 'acai_doces',
    'sweet': 'acai_doces',
    'doce': 'acai_doces',
    'doces': 'acai_doces',
    'açaí e doces': 'acai_doces',
    'acai_doces': 'acai_doces',
    
    'bakeries': 'padarias',
    'bakery': 'padarias',
    'padaria': 'padarias',
    'padarias': 'padarias',
    
    'confectioneries': 'confeitarias',
    'confectionery': 'confeitarias',
    'confeitaria': 'confeitarias',
    'confeitarias': 'confeitarias',
    
    'japonesa': 'japonesa',
    'comida japonesa': 'japonesa',
    
    'brasileira': 'brasileira',
    'comida brasileira': 'brasileira',
    
    'markets': 'mercados',
    'market': 'mercados',
    'mercado': 'mercados',
    'mercados': 'mercados',
    
    'grocery': 'mercearias',
    'mercearia': 'mercearias',
    'mercearias': 'mercearias',
    
    'produce': 'hortifrutis',
    'hortifrútis': 'hortifrutis',
    'hortifruti': 'hortifrutis',
    'hortifrutis': 'hortifrutis',
    
    'butchers': 'acougues',
    'açougue': 'acougues',
    'açougues': 'acougues',
    'acougues': 'acougues',
    
    'farmacias': 'farmacias',
    'farmácia': 'farmacias',
    'farmácias': 'farmacias',
    'pharmacy': 'farmacias',
    'pharmacies': 'farmacias',
    
    'pet_shops': 'pet_shops',
    'petshop': 'pet_shops',
    'petshops': 'pet_shops',
    'pet shops': 'pet_shops',
    'pet shop': 'pet_shops',
    
    'agropecuarias': 'agropecuarias',
    'agropecuária': 'agropecuarias',
    'agropecuárias': 'agropecuarias',
    'agriculture': 'agropecuarias',
    
    'beverages': 'bebidas',
    'bebida': 'bebidas',
    'bebidas': 'bebidas',
    'drink': 'bebidas',
    'drinks': 'bebidas',
    
    'convenience': 'conveniencias',
    'conveniências': 'conveniencias',
    'conveniência': 'conveniencias',
    'conveniencias': 'conveniencias',
    
    'stationery': 'papelarias',
    'papelaria': 'papelarias',
    'papelarias': 'papelarias',
    
    'flower_shops': 'floriculturas',
    'floricultura': 'floriculturas',
    'floriculturas': 'floriculturas',
    
    'construction': 'materiais_construcao',
    'materiais de construção': 'materiais_construcao',
    'materiais_construcao': 'materiais_construcao',
    
    'home_utilities': 'utilidades_domesticas',
    'utilidades domésticas': 'utilidades_domesticas',
    'utilidades_domesticas': 'utilidades_domesticas'
  };
  
  return mapping[trimmed] || trimmed;
};

export const getEstablishmentCategoryIds = (est: any): string[] => {
  if (est && Array.isArray(est.categoryIds)) {
    return est.categoryIds.map((id: string) => normalizeCategoryId(id));
  }
  const primary = est?.category || est?.categoryId;
  if (primary) {
    return [normalizeCategoryId(primary)];
  }
  return [];
};

export const getCategoryLabel = (categoryId: string | undefined | null): string => {
  if (!categoryId) return 'Comércio local';
  
  const trimmed = categoryId.trim();
  
  // 1. Check if the input is a direct key in the mapping (e.g. "snacks")
  if (CATEGORY_LABELS[trimmed]) {
    return CATEGORY_LABELS[trimmed];
  }
  
  // 2. Check if the input is already a value in CATEGORY_LABELS (e.g. "Lanches")
  const values = Object.values(CATEGORY_LABELS);
  if (values.includes(trimmed)) {
    return trimmed;
  }
  
  // 3. Check lowercase matches or alternative spellings
  const lower = trimmed.toLowerCase();
  
  // Check if lower is a key
  if (CATEGORY_LABELS[lower]) {
    return CATEGORY_LABELS[lower];
  }
  
  // Case-insensitive check for values
  const foundValue = values.find(v => v.toLowerCase() === lower);
  if (foundValue) {
    return foundValue;
  }
  
  // Extra legacy mappings if any
  const legacyMap: Record<string, string> = {
    'snack': 'Lanches',
    'pizzas': 'Pizzarias',
    'pizza': 'Pizzarias',
    'pizzeria': 'Pizzarias',
    'restaurant': 'Restaurantes',
    'bakery': 'Padarias',
    'pharmacy': 'Farmácias',
    'petshop': 'Pet shops',
    'drink': 'Bebidas',
    'drinks': 'Bebidas',
    'sweet': 'Açaí e doces',
    'sweets': 'Açaí e doces',
    'market': 'Mercados'
  };
  
  if (legacyMap[lower]) {
    return legacyMap[lower];
  }
  
  return 'Comércio local';
};

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
