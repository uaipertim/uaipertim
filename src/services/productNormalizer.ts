import { Product, Establishment } from '../types';

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
        priceDelta: 0,
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
    sizes: sizesStrings,
    borders: bordersStrings,
    extras: extrasList.filter((e: any) => e.active !== false),
    sizesList,
    crusts: crustsList,
    extrasList,
    establishmentId: data.establishmentId || '',
    establishmentName: data.establishmentName || '',
    cityId: data.cityId || '',
    slug: data.slug || id || '',
    notesEnabled: data.notesEnabled !== undefined ? data.notesEnabled : true,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 1
  } as any;
}

export function normalizeEstablishmentFromFirestore(data: any, id: string): Establishment {
  const deliveryFee = typeof data.deliveryFee === 'number' ? data.deliveryFee : (typeof data.deliveryFeeValue === 'number' ? data.deliveryFeeValue : 0);
  const minOrderValue = typeof data.minimumOrder === 'number' ? data.minimumOrder : (typeof data.minOrderValue === 'number' ? data.minOrderValue : 0);
  
  return {
    id: id || data.id,
    name: data.name || '',
    category: data.categoryName || data.category || '',
    rating: typeof data.rating === 'number' ? data.rating : 4.5,
    deliveryTime: data.deliveryTime || `${data.deliveryTimeMin || 30}-${data.deliveryTimeMax || 45} min`,
    deliveryFee: deliveryFee,
    minOrderValue: minOrderValue,
    isOpen: data.open !== undefined ? data.open : (data.isOpen !== undefined ? data.isOpen : true),
    open: data.open !== undefined ? data.open : (data.isOpen !== undefined ? data.isOpen : true),
    active: data.active !== undefined ? data.active : true,
    featured: data.featured || false,
    image: data.logoUrl || data.image || '',
    phone: data.phone || '',
    email: data.email || '',
    owner: data.owner || '',
    address: typeof data.address === 'object' && data.address ? `${data.address.street || ''}, ${data.address.number || ''}` : (data.address || ''),
    city: data.cityName || data.city || '',
    cityId: data.cityId || '',
    cityName: data.cityName || data.city || '',
    state: data.state || 'MG',
    document: data.document || '',
    companyName: data.companyName || '',
    platformFeePercent: typeof data.platformFeePercent === 'number' ? data.platformFeePercent : 10,
    bairro: data.address?.neighborhood || data.bairro || '',
    cep: data.address?.zipCode || data.cep || '',
    atendeRetirada: data.fulfillment?.pickup !== undefined ? data.fulfillment.pickup : (data.atendeRetirada !== undefined ? data.atendeRetirada : true),
    entregaPropria: data.fulfillment?.delivery !== undefined ? data.fulfillment.delivery : (data.entregaPropria !== undefined ? data.entregaPropria : true),
    bairrosAtendidos: data.bairrosAtendidos || '',
    
    // Payment methods mapping
    acceptCash: data.paymentMethods?.cash !== undefined ? data.paymentMethods.cash : (data.acceptCash !== undefined ? data.acceptCash : true),
    acceptPix: data.paymentMethods?.pixOnDelivery !== undefined ? data.paymentMethods.pixOnDelivery : (data.acceptPix !== undefined ? data.acceptPix : true),
    acceptDebitCard: data.paymentMethods?.debitCard !== undefined ? data.paymentMethods.debitCard : (data.acceptDebitCard !== undefined ? data.acceptDebitCard : true),
    acceptCreditCard: data.paymentMethods?.creditCard !== undefined ? data.paymentMethods.creditCard : (data.acceptCreditCard !== undefined ? data.acceptCreditCard : true),
    acceptContactless: data.paymentMethods?.contactless !== undefined ? data.paymentMethods.contactless : (data.acceptContactless !== undefined ? data.acceptContactless : true),
    acceptDeliveryPayment: data.acceptDeliveryPayment !== undefined ? data.acceptDeliveryPayment : true,
    acceptPickupPayment: data.acceptPickupPayment !== undefined ? data.acceptPickupPayment : true,
    suspended: data.suspended !== undefined ? data.suspended : false,
    temporarilyPaused: data.temporarilyPaused !== undefined ? data.temporarilyPaused : false,
    acceptingOrders: data.acceptingOrders !== undefined ? data.acceptingOrders : true,
  } as any;
}
