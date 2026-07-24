import { Product, Establishment, CATEGORY_LABELS } from '../types';
import { INITIAL_ESTABLISHMENTS } from '../initialData';
import { normalizeCategoryId } from '../utils/labelUtils';

export function normalizeProductFromFirestore(data: any, id: string): Product {
  const basePrice = typeof data.basePrice === 'number' ? data.basePrice : (typeof data.price === 'number' ? data.price : 0);
  
  // Extract sizes
  let sizesList = data.sizes || [];
  let sizesStrings: string[] = [];
  if (Array.isArray(sizesList)) {
    if (sizesList.length > 0 && typeof sizesList[0] === 'string') {
      sizesStrings = sizesList;
      sizesList = sizesList.map((name, idx) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        priceDelta: name === 'Pequena' ? -5.0 : (name === 'Grande' ? 8.0 : 0.0),
        active: true,
        sortOrder: idx + 1
      }));
    } else {
      sizesStrings = sizesList.filter((s: any) => s && s.active !== false).map((s: any) => s.name);
    }
  }

  // Extract crusts / borders
  let crustsList = data.crusts || data.borders || [];
  let bordersStrings: string[] = [];
  if (Array.isArray(crustsList)) {
    if (crustsList.length > 0 && typeof crustsList[0] === 'string') {
      bordersStrings = crustsList;
      crustsList = crustsList.map((name, idx) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        priceDelta: name.includes('Catupiry') || name.includes('Cheddar') ? 5.0 : 0.0,
        active: true,
        sortOrder: idx + 1
      }));
    } else {
      bordersStrings = crustsList.filter((c: any) => c && c.active !== false).map((c: any) => c.name);
    }
  }

  // Extract extras
  let extrasList = data.extras || [];
  if (Array.isArray(extrasList)) {
    extrasList = extrasList.map((ext: any, idx: number) => {
      if (typeof ext === 'string') {
        return {
          id: ext.toLowerCase().replace(/\s+/g, '-'),
          name: ext,
          price: 0,
          active: true,
          maxQuantity: 5,
          sortOrder: idx + 1
        };
      }
      return {
        id: ext.id || ext.name?.toLowerCase().replace(/\s+/g, '-') || `extra-${idx}`,
        name: ext.name || '',
        price: typeof ext.price === 'number' ? ext.price : 0,
        active: ext.active !== undefined ? ext.active : true,
        maxQuantity: typeof ext.maxQuantity === 'number' ? ext.maxQuantity : 5,
        sortOrder: typeof ext.sortOrder === 'number' ? ext.sortOrder : idx + 1
      };
    });
  }

  // Build optionGroups canonical list
  const incomingGroups = data.optionGroups || [];
  const normalizedGroups: any[] = [...incomingGroups];

  // 1. Unify Sizes
  const hasSizeGroup = normalizedGroups.some(g => g.name.toLowerCase().includes('tamanho') || g.id === 'tamanho' || g.id === 'escolha-o-tamanho');
  if (!hasSizeGroup && sizesList.length > 0) {
    const options = sizesList.map((s: any, idx: number) => ({
      id: s.id || s.name?.toLowerCase().replace(/\s+/g, '-') || `size-${idx}`,
      name: s.name,
      description: '',
      additionalPrice: typeof s.priceDelta === 'number' ? s.priceDelta : 0,
      position: idx + 1,
      active: s.active !== false
    }));

    normalizedGroups.push({
      id: 'escolha-o-tamanho',
      name: 'Escolha o tamanho',
      description: 'Selecione o tamanho ideal do seu produto',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      position: 1,
      active: true,
      displayType: 'segmented',
      options
    });
  } else {
    // Ensure displayType is present
    const sGroup = normalizedGroups.find(g => g.name.toLowerCase().includes('tamanho') || g.id === 'tamanho' || g.id === 'escolha-o-tamanho');
    if (sGroup && !sGroup.displayType) {
      sGroup.displayType = 'segmented';
    }
  }

  // 2. Unify Borders
  const hasBorderGroup = normalizedGroups.some(g => g.name.toLowerCase().includes('borda') || g.id === 'borda' || g.id === 'escolha-a-borda');
  if (!hasBorderGroup && crustsList.length > 0) {
    const options = crustsList.map((c: any, idx: number) => ({
      id: c.id || c.name?.toLowerCase().replace(/\s+/g, '-') || `border-${idx}`,
      name: c.name,
      description: '',
      additionalPrice: typeof c.priceDelta === 'number' ? c.priceDelta : 0,
      position: idx + 1,
      active: c.active !== false
    }));

    normalizedGroups.push({
      id: 'escolha-a-borda',
      name: 'Escolha a borda',
      description: 'Adicione uma borda recheada',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      position: 2,
      active: true,
      displayType: 'segmented',
      options
    });
  } else {
    // Ensure displayType is present
    const bGroup = normalizedGroups.find(g => g.name.toLowerCase().includes('borda') || g.id === 'borda' || g.id === 'escolha-a-borda');
    if (bGroup && !bGroup.displayType) {
      bGroup.displayType = 'segmented';
    }
  }

  // 3. Unify Extras (Adicionais premium)
  const hasExtrasGroup = normalizedGroups.some(g => g.name.toLowerCase().includes('adicionais premium') || g.id === 'adicionais-premium' || g.name.toLowerCase() === 'adicionais');
  if (!hasExtrasGroup && extrasList.length > 0) {
    const options = extrasList.map((e: any, idx: number) => ({
      id: e.id || e.name?.toLowerCase().replace(/\s+/g, '-') || `extra-${idx}`,
      name: e.name,
      description: '',
      additionalPrice: typeof e.price === 'number' ? e.price : 0,
      position: idx + 1,
      active: e.active !== false
    }));

    normalizedGroups.push({
      id: 'adicionais-premium',
      name: 'Adicionais premium',
      description: 'Deixe seu produto ainda mais gostoso',
      required: false,
      minSelections: 0,
      maxSelections: Math.max(5, options.length),
      position: 3,
      active: true,
      displayType: 'list',
      options
    });
  } else {
    // Ensure displayType is present
    const eGroup = normalizedGroups.find(g => g.name.toLowerCase().includes('adicionais premium') || g.id === 'adicionais-premium' || g.name.toLowerCase() === 'adicionais');
    if (eGroup && !eGroup.displayType) {
      eGroup.displayType = 'list';
    }
  }

  // Ensure options have valid additionalPrice and position
  normalizedGroups.forEach(g => {
    if (g.active === undefined) {
      g.active = true;
    }
    if (g.options && Array.isArray(g.options)) {
      g.options.forEach((o, oIdx) => {
        if (typeof o.position !== 'number') {
          o.position = oIdx + 1;
        }
        if (o.active === undefined) {
          o.active = true;
        }
        if (o.additionalPrice === undefined) {
          o.additionalPrice = typeof o.price === 'number' ? o.price : (typeof o.priceDelta === 'number' ? o.priceDelta : 0);
        }
      });
    }
  });

  // Ensure positions are established
  normalizedGroups.forEach((g, idx) => {
    if (typeof g.position !== 'number') {
      g.position = idx + 1;
    }
  });

  // Sort groups by position
  normalizedGroups.sort((a, b) => a.position - b.position);

  // Sync back to sizes, borders, and extras arrays for compatibility if needed, but optionGroups is canonical!
  const finalSizes = normalizedGroups.find(g => g.name.toLowerCase().includes('tamanho') || g.id === 'tamanho' || g.id === 'escolha-o-tamanho')
    ?.options.filter((o: any) => o.active).map((o: any) => o.name) || sizesStrings;

  const finalBorders = normalizedGroups.find(g => g.name.toLowerCase().includes('borda') || g.id === 'borda' || g.id === 'escolha-a-borda')
    ?.options.filter((o: any) => o.active).map((o: any) => o.name) || bordersStrings;

  const finalExtras = normalizedGroups.find(g => g.name.toLowerCase().includes('adicionais premium') || g.id === 'adicionais-premium' || g.name.toLowerCase() === 'adicionais')
    ?.options.filter((o: any) => o.active).map((o: any) => ({ name: o.name, price: o.additionalPrice })) || extrasList.filter((e: any) => e.active !== false).map((e: any) => ({ name: e.name, price: e.price }));

  return {
    id: id || data.id,
    name: data.name || '',
    description: data.description || '',
    price: basePrice,
    basePrice: basePrice,
    category: data.categoryName || data.category || '',
    categoryName: data.categoryName || data.category || '',
    categoryId: data.categoryId || data.category?.toLowerCase().replace(/\s+/g, '-') || 'outros',
    available: data.available !== undefined ? data.available : true,
    active: data.active !== undefined ? data.active : true,
    featured: data.featured || false,
    image: data.imageUrl || data.image || '',
    imageUrl: data.imageUrl || data.image || '',
    sizes: finalSizes,
    borders: finalBorders,
    extras: finalExtras,
    sizesList,
    crusts: crustsList,
    extrasList,
    establishmentId: data.establishmentId || '',
    establishmentName: data.establishmentName || '',
    cityId: data.cityId || '',
    slug: data.slug || id || '',
    notesEnabled: data.notesEnabled !== undefined ? data.notesEnabled : true,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 1,
    optionGroups: normalizedGroups,
    menuCategoryId: data.menuCategoryId || null,
    menuCategoryName: data.menuCategoryName || null
  } as any;
}

export function normalizeEstablishmentFromFirestore(data: any, id: string): Establishment {
  const deliveryFee = typeof data.deliveryFee === 'number' ? data.deliveryFee : (typeof data.deliveryFeeValue === 'number' ? data.deliveryFeeValue : 0);
  const minOrderValue = typeof data.minimumOrder === 'number' ? data.minimumOrder : (typeof data.minOrderValue === 'number' ? data.minOrderValue : 0);
  
  // Canonical Statuses & Contact Fields Mapping
  let platformStatus = data.platformStatus || data.status || '';
  if (platformStatus !== 'active' && platformStatus !== 'inactive' && platformStatus !== 'archived') {
    if (data.archived === true) {
      platformStatus = 'archived';
    } else if (data.active === false || data.suspended === true) {
      platformStatus = 'inactive';
    } else {
      platformStatus = 'active';
    }
  }

  const operationalPause = data.operationalPause !== undefined ? data.operationalPause : (data.temporarilyPaused !== undefined ? data.temporarilyPaused : false);
  const legalContactName = data.legalContactName || data.owner || '';
  const legalContactPhone = data.legalContactPhone || data.phone || '';
  const legalContactEmail = data.legalContactEmail || data.email || '';
  const ownerUid = data.merchantOwnerUid || data.ownerUid || data.merchantUid || '';
  const merchantUid = data.merchantOwnerUid || data.merchantUid || data.ownerUid || '';

  // Stable Category Translation
  const categoryRaw = data.categoryName || data.category || '';
  let categoryStable = 'other';
  const catLower = categoryRaw.toLowerCase().trim();

  if (catLower === 'pizzas' || catLower === 'pizzarias' || catLower === 'pizzerias') {
    categoryStable = 'pizzerias';
  } else if (catLower === 'supermercado' || catLower === 'mercados' || catLower === 'markets') {
    categoryStable = 'markets';
  } else if (catLower === 'lanches' || catLower === 'snacks') {
    categoryStable = 'snacks';
  } else if (catLower === 'hambúrgueres' || catLower === 'burgers') {
    categoryStable = 'burgers';
  } else if (catLower === 'japonesa' || catLower === 'brasileira' || catLower === 'restaurantes' || catLower === 'restaurants') {
    categoryStable = 'restaurants';
  } else if (catLower === 'bebidas' || catLower === 'beverages') {
    categoryStable = 'beverages';
  } else if (catLower === 'conveniências' || catLower === 'conveniência' || catLower === 'convenience') {
    categoryStable = 'convenience';
  } else if (catLower === 'doces e bolos' || catLower === 'confeitarias' || catLower === 'confectioneries') {
    categoryStable = 'confectioneries';
  } else if (catLower === 'açaí e doces' || catLower === 'acai_sweets') {
    categoryStable = 'acai_sweets';
  } else if (catLower === 'padarias' || catLower === 'bakeries') {
    categoryStable = 'bakeries';
  } else if (catLower === 'mercearias' || catLower === 'grocery') {
    categoryStable = 'grocery';
  } else if (catLower === 'hortifrútis' || catLower === 'produce') {
    categoryStable = 'produce';
  } else if (catLower === 'açougues' || catLower === 'butchers') {
    categoryStable = 'butchers';
  } else if (catLower === 'farmácias' || catLower === 'pharmacies' || catLower === 'farmacia' || catLower === 'farmacias' || catLower === 'drogaria' || catLower === 'drogarias') {
    categoryStable = 'farmacias';
  } else if (catLower === 'pet shops' || catLower === 'pet_shops' || catLower === 'petshop' || catLower === 'petshops' || catLower === 'pet') {
    categoryStable = 'pet_shops';
  } else if (catLower === 'agropecuárias' || catLower === 'agriculture' || catLower === 'agro' || catLower === 'agropecuaria' || catLower === 'agropecuarias') {
    categoryStable = 'agropecuarias';
  } else if (catLower === 'lojas de produtos agrícolas' || catLower === 'agricultural_supplies') {
    categoryStable = 'agricultural_supplies';
  } else if (catLower === 'papelarias' || catLower === 'stationery') {
    categoryStable = 'stationery';
  } else if (catLower === 'floriculturas' || catLower === 'flower_shops') {
    categoryStable = 'flower_shops';
  } else if (catLower === 'materiais de construção' || catLower === 'construction') {
    categoryStable = 'construction';
  } else if (catLower === 'utilidades domésticas' || catLower === 'home_utilities') {
    categoryStable = 'home_utilities';
  } else if (catLower === 'moda e acessórios' || catLower === 'fashion') {
    categoryStable = 'fashion';
  } else if (catLower === 'eletrônicos' || catLower === 'electronics') {
    categoryStable = 'electronics';
  } else if (catLower === 'serviços locais' || catLower === 'local_services') {
    categoryStable = 'local_services';
  } else if (catLower === 'outros' || catLower === 'other') {
    categoryStable = 'other';
  } else {
    // Keep raw string if it maps directly or can't be resolved
    categoryStable = categoryRaw;
  }

  const categoryName = CATEGORY_LABELS[categoryStable] || categoryRaw;

  // Priority for initial/default values
  const defaultEst = INITIAL_ESTABLISHMENTS.find(e => e.id === id);
  const defaultImage = defaultEst?.image || '';

  let logoUrl = null;
  if (data.logoUrl && typeof data.logoUrl === 'string' && data.logoUrl.trim().length > 0) {
    logoUrl = data.logoUrl.trim();
  } else if (data.image && typeof data.image === 'string' && data.image.trim().length > 0) {
    logoUrl = data.image.trim();
  } else if (defaultImage && typeof defaultImage === 'string' && defaultImage.trim().length > 0) {
    logoUrl = defaultImage.trim();
  }

  let coverImageUrl = null;
  if (data.coverImageUrl && typeof data.coverImageUrl === 'string' && data.coverImageUrl.trim().length > 0) {
    coverImageUrl = data.coverImageUrl.trim();
  } else if (data.bannerUrl && typeof data.bannerUrl === 'string' && data.bannerUrl.trim().length > 0) {
    coverImageUrl = data.bannerUrl.trim();
  } else if (data.image && typeof data.image === 'string' && data.image.trim().length > 0) {
    coverImageUrl = data.image.trim();
  } else if (defaultImage && typeof defaultImage === 'string' && defaultImage.trim().length > 0) {
    coverImageUrl = defaultImage.trim();
  }

  const resolvedImage = logoUrl || '';

  // Compute canonical category IDs
  let categoryIds: string[] = [];
  if (data.categoryIds !== undefined && Array.isArray(data.categoryIds)) {
    categoryIds = data.categoryIds
      .map(c => normalizeCategoryId(c))
      .filter((c): c is string => c !== null);
  } else {
    const primary = data.category || data.categoryId || categoryStable || '';
    const canonical = normalizeCategoryId(primary);
    if (canonical) {
      categoryIds = [canonical];
    }
  }

  return {
    id: id || data.id,
    name: data.name || '',
    category: categoryStable,
    categoryName: categoryName,
    categoryIds,
    rating: typeof data.rating === 'number' ? data.rating : 4.5,
    deliveryTime: data.deliveryTime || `${data.deliveryTimeMin || 30}-${data.deliveryTimeMax || 45} min`,
    deliveryFee: deliveryFee,
    minOrderValue: minOrderValue,
    isOpen: data.open !== undefined ? data.open : (data.isOpen !== undefined ? data.isOpen : true),
    open: data.open !== undefined ? data.open : (data.isOpen !== undefined ? data.isOpen : true),
    active: platformStatus === 'active',
    featured: data.featured || false,
    image: resolvedImage,
    phone: legalContactPhone || data.phone || '',
    email: legalContactEmail || data.email || '',
    owner: legalContactName || data.owner || '',
    address: typeof data.address === 'object' && data.address ? `${data.address.street || ''}, ${data.address.number || ''}` : (data.address || ''),
    city: data.cityName || data.city || '',
    cityId: data.cityId || '',
    cityName: data.cityName || data.city || '',
    state: data.state || 'MG',
    document: data.taxDocument || data.document || '',
    companyName: data.legalName || data.companyName || '',
    platformFeePercent: typeof data.platformFeePercent === 'number' ? data.platformFeePercent : 10,
    bairro: data.address?.neighborhood || data.bairro || '',
    cep: data.address?.zipCode || data.cep || '',
    atendeRetirada: data.fulfillment?.pickup !== undefined ? data.fulfillment.pickup : (data.atendeRetirada !== undefined ? data.atendeRetirada : true),
    entregaPropria: data.fulfillment?.delivery !== undefined ? data.fulfillment.delivery : (data.entregaPropria !== undefined ? data.entregaPropria : true),
    bairrosAtendidos: data.bairrosAtendidos || '',
    logoUrl,
    coverImageUrl,
    
    // New fields
    platformStatus,
    operationalPause,
    legalContactName,
    legalContactPhone,
    legalContactEmail,
    ownerUid,
    merchantUid,
    merchantOwnerUid: ownerUid || null,
    archived: platformStatus === 'archived',
    archiveReason: data.archiveReason || null,
    deactivationReason: data.deactivationReason || null,

    // Payment methods mapping
    acceptCash: data.paymentMethods?.cash !== undefined ? data.paymentMethods.cash : (data.acceptCash !== undefined ? data.acceptCash : true),
    acceptPix: data.paymentMethods?.pixOnDelivery !== undefined ? data.paymentMethods.pixOnDelivery : (data.acceptPix !== undefined ? data.acceptPix : true),
    acceptDebitCard: data.paymentMethods?.debitCard !== undefined ? data.paymentMethods.debitCard : (data.acceptDebitCard !== undefined ? data.acceptDebitCard : true),
    acceptCreditCard: data.paymentMethods?.creditCard !== undefined ? data.paymentMethods.creditCard : (data.acceptCreditCard !== undefined ? data.acceptCreditCard : true),
    acceptContactless: data.paymentMethods?.contactless !== undefined ? data.paymentMethods.contactless : (data.acceptContactless !== undefined ? data.acceptContactless : true),
    acceptDeliveryPayment: data.acceptDeliveryPayment !== undefined ? data.acceptDeliveryPayment : true,
    acceptPickupPayment: data.acceptPickupPayment !== undefined ? data.acceptPickupPayment : true,
    suspended: platformStatus === 'inactive',
    temporarilyPaused: operationalPause,
    acceptingOrders: data.acceptingOrders !== undefined ? data.acceptingOrders : !operationalPause,
  } as any;
}
