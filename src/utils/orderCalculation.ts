import { Product, ConfiguredOrderItem, CartItem, SelectedOptionGroup } from '../types';

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
  const baseUnitPrice = product.price;

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

  // If item is already in the fully structured format (contains lineTotal)
  if (typeof item.lineTotal === 'number' && 'baseUnitPrice' in item) {
    return item as ConfiguredOrderItem;
  }

  // Extract core product info
  const productObj: Product = item.product || {};
  const productId = productObj.id || item.productId || item.id || '';
  const productName = productObj.name || item.productName || item.name || 'Produto';
  const productImage = productObj.image || item.productImage || null;
  const quantity = typeof item.quantity === 'number' ? item.quantity : 1;
  const baseUnitPrice = typeof item.baseUnitPrice === 'number'
    ? item.baseUnitPrice
    : (typeof item.price === 'number' ? item.price : (productObj.price || 0));

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

