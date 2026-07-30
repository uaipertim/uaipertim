import { Product, ConfiguredOrderItem, CartItem, SelectedOptionGroup } from '../types';

/**
 * Helper to safely convert different formats into a JS Date.
 */
export function convertToDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const str = String(val).trim();
    // Check Brazilian format: DD/MM/YYYY HH:mm or DD/MM/YYYY
    const brPattern = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/;
    const brMatch = str.match(brPattern);
    if (brMatch) {
      const day = parseInt(brMatch[1], 10);
      const month = parseInt(brMatch[2], 10) - 1; // 0-indexed month
      const year = parseInt(brMatch[3], 10);
      const hours = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
      const minutes = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
      const d = new Date(year, month, day, hours, minutes, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object' && val.seconds !== undefined) {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'object' && val._seconds !== undefined) {
    return new Date(val._seconds * 1000);
  }
  return null;
}

/**
 * Checks if a product's promotion is currently active based on dates and prices.
 */
export function isPromotionActive(product: Product, currentDate: Date = new Date()): boolean {
  if (!product) return false;
  if (!product.promotionEnabled) return false;
  if (product.promotionalPrice === undefined || product.promotionalPrice === null) return false;
  if (product.promotionalPrice <= 0 || product.promotionalPrice >= product.price) return false;

  if (product.promotionStartsAt) {
    const start = convertToDate(product.promotionStartsAt);
    if (start && currentDate < start) return false;
  }
  if (product.promotionEndsAt) {
    const end = convertToDate(product.promotionEndsAt);
    if (end && currentDate > end) return false;
  }

  return true;
}

/**
 * Gets the effective base price of a product, considering active promotions.
 */
export function getEffectiveProductPrice(product: Product, currentDate: Date = new Date()): number {
  if (!product) return 0;
  if (isPromotionActive(product, currentDate)) {
    return product.promotionalPrice!;
  }
  return product.price;
}

/**
 * Calculates discount percentage as an integer.
 */
export function calculateDiscountPercentage(price: number, promotionalPrice: number): number {
  if (!price || !promotionalPrice || price <= promotionalPrice) return 0;
  const pct = Math.round(((price - promotionalPrice) / price) * 100);
  if (pct < 0) return 0;
  if (pct > 99) return 99;
  return pct;
}

/**
 * Validates promotional data.
 */
export interface PromotionValidationResult {
  isValid: boolean;
  error?: string;
}

export function validatePromotion(
  price: number,
  promotionalPrice: number | undefined,
  startsAt: any,
  endsAt: any
): PromotionValidationResult {
  if (promotionalPrice === undefined || promotionalPrice === null) {
    return { isValid: false, error: 'O preço promocional deve ser menor que o preço normal.' };
  }
  if (promotionalPrice <= 0) {
    return { isValid: false, error: 'O preço promocional deve ser menor que o preço normal.' };
  }
  if (promotionalPrice >= price) {
    return { isValid: false, error: 'O preço promocional deve ser menor que o preço normal.' };
  }
  if (startsAt && endsAt) {
    const start = convertToDate(startsAt);
    const end = convertToDate(endsAt);
    if (start && end && end <= start) {
      return { isValid: false, error: 'A data de encerramento deve ser posterior à data de início.' };
    }
  }
  return { isValid: true };
}

/**
 * Calculates and maps a product and its customization choices into a ConfiguredOrderItem.
 * This ensures consistent calculation logic across all views (modal, cart, checkout, order histories).
 */
export function calculateConfiguredOrderItem(
  product: Product,
  selectedSize: string | null | undefined,
  selectedBorder: string | null | undefined,
  selectedExtras: { name: string; price: number }[],
  quantity: number,
  notes: string | null | undefined,
  selectedOptionGroups?: SelectedOptionGroup[]
): ConfiguredOrderItem {
  const activePromo = isPromotionActive(product);
  const baseUnitPrice = activePromo ? product.promotionalPrice! : product.price;
  const regularUnitPrice = product.price;
  const effectiveUnitPrice = baseUnitPrice;
  const promotionApplied = activePromo;
  const promotionSource = activePromo ? product.promotionSource : undefined;
  const promotionLabel = activePromo ? (product.promotionLabel || (product.promotionSource === 'uaipertim' ? 'Oferta UaiPertim' : 'Oferta')) : undefined;
  const discountPercentage = activePromo ? calculateDiscountPercentage(product.price, product.promotionalPrice!) : undefined;

  // Find size, border, and extras groups in product's optionGroups
  const sizeGroup = product.optionGroups?.find(g => g.name.toLowerCase().includes('tamanho') || g.id === 'tamanho' || g.id === 'escolha-o-tamanho');
  const borderGroup = product.optionGroups?.find(g => g.name.toLowerCase().includes('borda') || g.id === 'borda' || g.id === 'escolha-a-borda');
  const premiumGroup = product.optionGroups?.find(g => g.name.toLowerCase().includes('adicionais premium') || g.id === 'adicionais-premium' || g.name.toLowerCase() === 'adicionais');

  // Size details & pricing delta
  let sizeDelta = 0;
  let sizeId = 'medium';
  let sizeName = 'Média'; // default to Média if undefined but product has sizes
  if (selectedSize) {
    sizeName = selectedSize;
    const opt = sizeGroup?.options?.find(o => o.name === selectedSize);
    if (opt) {
      sizeDelta = opt.additionalPrice;
      sizeId = opt.id;
    } else {
      if (selectedSize === 'Pequena') {
        sizeDelta = -5.00;
        sizeId = 'small';
      } else if (selectedSize === 'Grande') {
        sizeDelta = 8.00;
        sizeId = 'large';
      } else if (selectedSize === 'Média') {
        sizeDelta = 0.00;
        sizeId = 'medium';
      } else {
        sizeDelta = 0.00;
        sizeId = selectedSize.toLowerCase().replace(/\s+/g, '-');
      }
    }
  } else if (product.sizes && product.sizes.length > 0) {
    // If product has sizes but none selected, default to the first one or "Média"
    sizeName = product.sizes[0];
    const opt = sizeGroup?.options?.find(o => o.name === sizeName);
    if (opt) {
      sizeDelta = opt.additionalPrice;
      sizeId = opt.id;
    } else {
      if (sizeName === 'Pequena') {
        sizeDelta = -5.00;
        sizeId = 'small';
      } else if (sizeName === 'Grande') {
        sizeDelta = 8.00;
        sizeId = 'large';
      } else {
        sizeDelta = 0.00;
        sizeId = 'medium';
      }
    }
  }

  const selectedSizeObj = (product.sizes && product.sizes.length > 0)
    ? { id: sizeId, name: sizeName, priceDelta: sizeDelta }
    : null;

  // Crust / Border details & pricing delta
  let crustDelta = 0;
  let crustId = 'none';
  let crustName = 'Sem borda';
  if (selectedBorder) {
    crustName = selectedBorder;
    const opt = borderGroup?.options?.find(o => o.name === selectedBorder);
    if (opt) {
      crustDelta = opt.additionalPrice;
      crustId = opt.id;
    } else {
      if (selectedBorder !== 'Sem borda') {
        crustDelta = 5.00;
        crustId = selectedBorder.toLowerCase().replace(/\s+/g, '-');
      } else {
        crustDelta = 0.00;
        crustId = 'none';
      }
    }
  } else if (product.borders && product.borders.length > 0) {
    crustName = product.borders[0];
    const opt = borderGroup?.options?.find(o => o.name === crustName);
    if (opt) {
      crustDelta = opt.additionalPrice;
      crustId = opt.id;
    } else {
      if (crustName !== 'Sem borda') {
        crustDelta = 5.00;
        crustId = crustName.toLowerCase().replace(/\s+/g, '-');
      } else {
        crustDelta = 0.00;
        crustId = 'none';
      }
    }
  }

  const selectedCrustObj = (product.borders && product.borders.length > 0)
    ? { id: crustId, name: crustName, priceDelta: crustDelta }
    : null;

  // Group multiple selections of the same extra to prevent duplication and aggregate quantities
  const extrasMap = new Map<string, { id: string; name: string; unitPrice: number; quantity: number }>();
  selectedExtras.forEach((ex) => {
    const key = ex.name;
    const existing = extrasMap.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      const opt = premiumGroup?.options?.find(o => o.name === ex.name);
      const unitPrice = opt ? opt.additionalPrice : ex.price;
      const id = opt ? opt.id : `extra-${ex.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      extrasMap.set(key, {
        id,
        name: ex.name,
        unitPrice,
        quantity: 1
      });
    }
  });

  const selectedExtrasList = Array.from(extrasMap.values());

  // optionsUnitTotal = sizeDelta + crustDelta + sum(extraUnitPrice * extraQuantity)
  const extrasUnitTotal = selectedExtrasList.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  
  // Custom option groups pricing delta and enrichment
  let customGroupsDelta = 0;
  const enrichedOptionGroups: SelectedOptionGroup[] = [];

  if (selectedOptionGroups && selectedOptionGroups.length > 0) {
    selectedOptionGroups.forEach(g => {
      // Skip groups that are already handled as size/border/extras to avoid double counting
      const isLegacyGroup = 
        g.groupId === 'escolha-o-tamanho' || 
        g.groupId === 'escolha-a-borda' || 
        g.groupId === 'adicionais-premium' ||
        g.groupName.toLowerCase().includes('tamanho') ||
        g.groupName.toLowerCase().includes('borda') ||
        g.groupName.toLowerCase().includes('adicionais premium') ||
        g.groupName.toLowerCase() === 'adicionais';
        
      if (isLegacyGroup) return;

      const optionCountsMap = new Map<string, { optionId: string; name: string; additionalPrice: number; quantity: number }>();
      
      if (g.selectedOptions && g.selectedOptions.length > 0) {
        g.selectedOptions.forEach(o => {
          const key = o.optionId;
          const oQty = o.quantity ?? 1;
          const existing = optionCountsMap.get(key);
          if (existing) {
            existing.quantity += oQty;
          } else {
            optionCountsMap.set(key, {
              optionId: o.optionId,
              name: o.name,
              additionalPrice: o.additionalPrice,
              quantity: oQty
            });
          }
        });
      }

      const enrichedOptions = Array.from(optionCountsMap.values()).map(o => ({
        optionId: o.optionId,
        name: o.name,
        additionalPrice: o.additionalPrice,
        unitPrice: o.additionalPrice,
        quantity: o.quantity,
        totalPrice: o.additionalPrice * o.quantity
      }));

      enrichedOptions.forEach(o => {
        customGroupsDelta += o.totalPrice;
      });

      enrichedOptionGroups.push({
        groupId: g.groupId,
        groupName: g.groupName,
        selectedOptions: enrichedOptions
      });
    });
  }

  const optionsUnitTotal = sizeDelta + crustDelta + extrasUnitTotal + customGroupsDelta;

  const finalUnitPrice = baseUnitPrice + optionsUnitTotal;
  const lineTotal = finalUnitPrice * quantity;

  return {
    productId: product.id,
    productName: product.name,
    productImage: product.image || null,
    quantity,
    baseUnitPrice,
    regularUnitPrice,
    effectiveUnitPrice,
    promotionApplied,
    promotionSource,
    promotionLabel,
    discountPercentage,
    selectedSize: selectedSizeObj,
    selectedCrust: selectedCrustObj,
    selectedExtras: selectedExtrasList,
    selectedOptionGroups: enrichedOptionGroups,
    notes: notes?.trim() || null,
    optionsUnitTotal,
    finalUnitPrice,
    lineTotal
  };
}

/**
 * Normalizes any legacy or loosely-structured order item to a ConfiguredOrderItem.
 * This guarantees backwards compatibility with older order structures saved in storage.
 */
export function normalizeOrderItem(item: any): ConfiguredOrderItem {
  if (!item) {
    return {
      productId: '',
      productName: 'Item desconhecido',
      productImage: null,
      quantity: 1,
      baseUnitPrice: 0,
      selectedSize: null,
      selectedCrust: null,
      selectedExtras: [],
      notes: null,
      optionsUnitTotal: 0,
      finalUnitPrice: 0,
      lineTotal: 0
    };
  }

  // Extract core product info
  const productObj: Product = item.product || {};
  const productId = productObj.id || item.productId || item.id || '';
  const productName = productObj.name || item.productName || item.name || 'Produto';
  const productImage = productObj.image || item.productImage || null;
  const quantity = typeof item.quantity === 'number' ? item.quantity : 1;

  // Resolve prices considering promotions
  const rawBasePrice = typeof item.baseUnitPrice === 'number'
    ? item.baseUnitPrice
    : (typeof item.price === 'number' ? item.price : (productObj.price || 0));

  const promoActive = productObj ? isPromotionActive(productObj) : false;
  const baseUnitPrice = promoActive ? productObj.promotionalPrice! : rawBasePrice;

  const regularUnitPrice = typeof item.regularUnitPrice === 'number'
    ? item.regularUnitPrice
    : (productObj ? productObj.price : rawBasePrice);

  const effectiveUnitPrice = typeof item.effectiveUnitPrice === 'number'
    ? item.effectiveUnitPrice
    : baseUnitPrice;

  const promotionApplied = typeof item.promotionApplied === 'boolean'
    ? item.promotionApplied
    : promoActive;

  const promotionSource = item.promotionSource || (promoActive ? productObj.promotionSource : undefined);
  const promotionLabel = item.promotionLabel || (promoActive ? (productObj.promotionLabel || (productObj.promotionSource === 'uaipertim' ? 'Oferta UaiPertim' : 'Oferta')) : undefined);
  const discountPercentage = typeof item.discountPercentage === 'number'
    ? item.discountPercentage
    : (promoActive ? calculateDiscountPercentage(productObj.price, productObj.promotionalPrice!) : undefined);

  // If item is already in the fully structured format (contains lineTotal)
  // but let's recompute it if promo prices changed or were missing.
  const hasValidTotals = typeof item.lineTotal === 'number' && 'baseUnitPrice' in item && 'regularUnitPrice' in item;

  // 1. Resolve Size
  let selectedSizeObj: ConfiguredOrderItem['selectedSize'] = null;
  const rawSize = item.selectedSize || item.size;
  if (rawSize) {
    if (typeof rawSize === 'object') {
      selectedSizeObj = {
        id: rawSize.id || 'size',
        name: rawSize.name || 'Tamanho',
        priceDelta: typeof rawSize.priceDelta === 'number' ? rawSize.priceDelta : 0
      };
    } else if (typeof rawSize === 'string') {
      let delta = 0;
      let id = 'medium';
      if (rawSize === 'Pequena') {
        delta = -5.00;
        id = 'small';
      } else if (rawSize === 'Grande') {
        delta = 8.00;
        id = 'large';
      }
      selectedSizeObj = { id, name: rawSize, priceDelta: delta };
    }
  }

  // 2. Resolve Crust / Border
  let selectedCrustObj: ConfiguredOrderItem['selectedCrust'] = null;
  const rawCrust = item.selectedCrust || item.selectedBorder || item.crust;
  if (rawCrust) {
    if (typeof rawCrust === 'object') {
      selectedCrustObj = {
        id: rawCrust.id || 'crust',
        name: rawCrust.name || 'Borda',
        priceDelta: typeof rawCrust.priceDelta === 'number' ? rawCrust.priceDelta : 0
      };
    } else if (typeof rawCrust === 'string') {
      const isNone = rawCrust === 'Sem borda' || rawCrust === 'Nenhum';
      const delta = isNone ? 0.00 : 5.00;
      const id = isNone ? 'none' : rawCrust.toLowerCase().replace(/\s+/g, '-');
      selectedCrustObj = { id, name: rawCrust, priceDelta: delta };
    }
  }

  // 3. Resolve Extras / Addons
  let selectedExtrasList: ConfiguredOrderItem['selectedExtras'] = [];
  const rawExtras = item.selectedExtras || item.extras || item.addons || item.options;
  if (Array.isArray(rawExtras)) {
    const extrasMap = new Map<string, { id: string; name: string; unitPrice: number; quantity: number }>();
    rawExtras.forEach((ex: any) => {
      if (!ex) return;
      const name = ex.name || (typeof ex === 'string' ? ex : 'Adicional');
      const unitPrice = typeof ex.unitPrice === 'number'
        ? ex.unitPrice
        : (typeof ex.price === 'number' ? ex.price : 0);
      const qty = typeof ex.quantity === 'number' ? ex.quantity : 1;

      const existing = extrasMap.get(name);
      if (existing) {
        existing.quantity += qty;
      } else {
        const id = ex.id || `extra-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        extrasMap.set(name, { id, name, unitPrice, quantity: qty });
      }
    });
    selectedExtrasList = Array.from(extrasMap.values());
  }

  // 4. Resolve Notes
  const notes = item.notes || item.observacoes || null;

  // 4.5. Resolve Custom Option Groups
  let selectedOptionGroups: SelectedOptionGroup[] = [];
  if (Array.isArray(item.selectedOptionGroups)) {
    selectedOptionGroups = item.selectedOptionGroups.map((g: any) => {
      const selectedOptions = Array.isArray(g.selectedOptions)
        ? g.selectedOptions.map((o: any) => {
            const oQty = typeof o.quantity === 'number' ? o.quantity : 1;
            const uPrice = typeof o.unitPrice === 'number'
              ? o.unitPrice
              : (typeof o.additionalPrice === 'number' ? o.additionalPrice : 0);
            const tPrice = typeof o.totalPrice === 'number'
              ? o.totalPrice
              : uPrice * oQty;
            return {
              optionId: o.optionId || '',
              name: o.name || 'Opção',
              additionalPrice: uPrice, // Keep as uPrice for legacy compatibility
              unitPrice: uPrice,
              quantity: oQty,
              totalPrice: tPrice
            };
          })
        : [];
      return {
        groupId: g.groupId || '',
        groupName: g.groupName || 'Grupo',
        selectedOptions
      };
    });
  }

  // 5. Compute Options Unit Total
  const sizeDelta = selectedSizeObj?.priceDelta || 0;
  const crustDelta = selectedCrustObj?.priceDelta || 0;
  const extrasDelta = selectedExtrasList.reduce((sum, ex) => sum + (ex.unitPrice * ex.quantity), 0);
  const customGroupsDelta = selectedOptionGroups.reduce((sum, g) => {
    // Skip groups that are already handled as size/border/extras to avoid double counting
    const isLegacyGroup = 
      g.groupId === 'escolha-o-tamanho' || 
      g.groupId === 'escolha-a-borda' || 
      g.groupId === 'adicionais-premium' ||
      g.groupName.toLowerCase().includes('tamanho') ||
      g.groupName.toLowerCase().includes('borda') ||
      g.groupName.toLowerCase().includes('adicionais premium') ||
      g.groupName.toLowerCase() === 'adicionais';
      
    if (isLegacyGroup) return sum;

    return sum + g.selectedOptions.reduce((innerSum, o) => {
      const qty = o.quantity ?? 1;
      return innerSum + (o.additionalPrice * qty);
    }, 0);
  }, 0);
  const optionsUnitTotal = sizeDelta + crustDelta + extrasDelta + customGroupsDelta;

  const finalUnitPrice = baseUnitPrice + optionsUnitTotal;
  const lineTotal = finalUnitPrice * quantity;

  return {
    productId,
    productName,
    productImage,
    quantity,
    baseUnitPrice,
    regularUnitPrice,
    effectiveUnitPrice,
    promotionApplied,
    promotionSource,
    promotionLabel,
    discountPercentage,
    selectedSize: selectedSizeObj,
    selectedCrust: selectedCrustObj,
    selectedExtras: selectedExtrasList,
    selectedOptionGroups,
    notes: notes?.trim() || null,
    optionsUnitTotal,
    finalUnitPrice,
    lineTotal
  };
}

export interface CustomizationLine {
  key: string;
  groupName: string;
  optionName: string;
  additionalPrice: number;
  quantity?: number;
}

function normalizeKey(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generates a unified, deduplicated list of customization lines for an order item.
 * It prioritizes canonical option groups (selectedOptionGroups) if present, and
 * falls back to legacy options (selectedSize, selectedCrust, selectedExtras) only as a fallback.
 */
export function getCartItemCustomizationLines(item: any): CustomizationLine[] {
  const normalized = normalizeOrderItem(item);
  const lines: CustomizationLine[] = [];

  // 1. Parse Canonical Option Groups (always include if present)
  if (normalized.selectedOptionGroups && normalized.selectedOptionGroups.length > 0) {
    normalized.selectedOptionGroups.forEach(g => {
      if (g.selectedOptions && g.selectedOptions.length > 0) {
        g.selectedOptions.forEach(o => {
          const groupIdStable = g.groupId || normalizeKey(g.groupName);
          const optionIdStable = o.optionId || normalizeKey(o.name);
          lines.push({
            key: `${groupIdStable}-${optionIdStable}`,
            groupName: g.groupName,
            optionName: o.name,
            additionalPrice: o.additionalPrice,
            quantity: (o as any).quantity || 1
          });
        });
      }
    });
  }

  // 2. Parse Legacy Fallback Options (include so we can resolve any missing legacy fields)
  if (normalized.selectedSize) {
    lines.push({
      key: 'size-' + normalizeKey(normalized.selectedSize.name),
      groupName: 'Tamanho',
      optionName: normalized.selectedSize.name,
      additionalPrice: normalized.selectedSize.priceDelta
    });
  }

  if (normalized.selectedCrust && normalized.selectedCrust.name !== 'Sem borda') {
    lines.push({
      key: 'crust-' + normalizeKey(normalized.selectedCrust.name),
      groupName: 'Borda',
      optionName: normalized.selectedCrust.name,
      additionalPrice: normalized.selectedCrust.priceDelta
    });
  }

  if (normalized.selectedExtras && normalized.selectedExtras.length > 0) {
    normalized.selectedExtras.forEach(ex => {
      lines.push({
        key: 'extra-' + normalizeKey(ex.name),
        groupName: 'Adicionais',
        optionName: ex.name,
        additionalPrice: ex.unitPrice,
        quantity: ex.quantity
      });
    });
  }

  // 3. Intelligent Deduplication & Aggregation
  // Sort to prioritize canonical groups over simple generic/legacy labels (e.g. 'Escolha o tamanho' > 'Tamanho')
  const sortedLines = [...lines].sort((a, b) => {
    const aIsLegacyGroup = ['tamanho', 'borda', 'adicionais'].includes(a.groupName.toLowerCase());
    const bIsLegacyGroup = ['tamanho', 'borda', 'adicionais'].includes(b.groupName.toLowerCase());
    if (aIsLegacyGroup && !bIsLegacyGroup) return 1;
    if (!aIsLegacyGroup && bIsLegacyGroup) return -1;
    return 0;
  });

  const seenOptionKeys = new Map<string, CustomizationLine>();

  for (const line of sortedLines) {
    const normOptionName = normalizeKey(line.optionName);
    if (!normOptionName) continue;

    const existing = seenOptionKeys.get(normOptionName);
    if (existing) {
      const existingIsLegacy = ['tamanho', 'borda', 'adicionais'].includes(existing.groupName.toLowerCase());
      const newIsLegacy = ['tamanho', 'borda', 'adicionais'].includes(line.groupName.toLowerCase());

      if (!existingIsLegacy && newIsLegacy) {
        // Skip legacy duplicate of an already processed canonical option (Requirement 1 & 10)
        continue;
      }

      // Aggregate quantity and keep unit price consistent
      existing.quantity = (existing.quantity || 1) + (line.quantity || 1);
      // For unit price display, we keep the latest line's unit additional price
      existing.additionalPrice = line.additionalPrice;
    } else {
      seenOptionKeys.set(normOptionName, { ...line, quantity: line.quantity || 1 });
    }
  }

  return Array.from(seenOptionKeys.values());
}

export interface CartTotals {
  productsSubtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Calculates cart totals in cents to avoid floating-point errors.
 * Accepts cart items, delivery fee, coupon discount and fulfillment type.
 * Returns productsSubtotalCents, deliveryFeeCents, discountCents, totalCents.
 */
export function calculateCartTotals(
  items: any[],
  deliveryFee: number,
  discount: number,
  fulfillmentType: string
): CartTotals {
  let productsSubtotalCents = 0;

  if (Array.isArray(items)) {
    items.forEach((item) => {
      // Normalize the item first to ensure a standard structure
      const normalized = normalizeOrderItem(item);
      
      const basePriceCents = Math.round((normalized.baseUnitPrice || 0) * 100);
      let optionsPriceCents = 0;

      // 1. Size price delta
      if (normalized.selectedSize) {
        optionsPriceCents += Math.round((normalized.selectedSize.priceDelta || 0) * 100);
      }

      // 2. Crust/Border price delta
      if (normalized.selectedCrust) {
        optionsPriceCents += Math.round((normalized.selectedCrust.priceDelta || 0) * 100);
      }

      // 3. Extras / Addons price delta (deduplicated / grouped format)
      if (Array.isArray(normalized.selectedExtras)) {
        normalized.selectedExtras.forEach((ex) => {
          const exQty = typeof ex.quantity === 'number' ? ex.quantity : 1;
          const exPrice = typeof ex.unitPrice === 'number' ? ex.unitPrice : 0;
          optionsPriceCents += Math.round(exPrice * 100) * exQty;
        });
      }

      // 4. Custom option groups price delta
      if (Array.isArray(normalized.selectedOptionGroups)) {
        normalized.selectedOptionGroups.forEach((g) => {
          // Skip groups that are already handled as size/border/extras to avoid double counting
          const isLegacyGroup = 
            g.groupId === 'escolha-o-tamanho' || 
            g.groupId === 'escolha-a-borda' || 
            g.groupId === 'adicionais-premium' ||
            g.groupName.toLowerCase().includes('tamanho') ||
            g.groupName.toLowerCase().includes('borda') ||
            g.groupName.toLowerCase().includes('adicionais premium') ||
            g.groupName.toLowerCase() === 'adicionais';
            
          if (isLegacyGroup) return;

          if (Array.isArray(g.selectedOptions)) {
            g.selectedOptions.forEach((o) => {
              const oQty = typeof o.quantity === 'number' ? o.quantity : 1;
              const oPrice = typeof o.unitPrice === 'number' 
                ? o.unitPrice 
                : (typeof o.additionalPrice === 'number' ? o.additionalPrice : 0);
              optionsPriceCents += Math.round(oPrice * 100) * oQty;
            });
          }
        });
      }

      const finalUnitPriceCents = basePriceCents + optionsPriceCents;
      const quantity = typeof normalized.quantity === 'number' ? normalized.quantity : 1;
      const lineTotalCents = finalUnitPriceCents * quantity;

      productsSubtotalCents += lineTotalCents;
    });
  }

  const isPickup = fulfillmentType === 'pickup' || fulfillmentType === 'retirada';
  const deliveryFeeCents = isPickup ? 0 : Math.round((deliveryFee || 0) * 100);
  const discountCents = Math.round((discount || 0) * 100);
  const totalCents = Math.max(0, productsSubtotalCents - discountCents + deliveryFeeCents);

  return {
    productsSubtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents
  };
}


