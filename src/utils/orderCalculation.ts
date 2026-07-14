import { Product, ConfiguredOrderItem, CartItem } from '../types';

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
  notes: string | null | undefined
): ConfiguredOrderItem {
  const baseUnitPrice = product.price;

  // Size details & pricing delta
  let sizeDelta = 0;
  let sizeId = 'medium';
  let sizeName = 'Média'; // default to Média if undefined but product has sizes
  if (selectedSize) {
    sizeName = selectedSize;
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
  } else if (product.sizes && product.sizes.length > 0) {
    // If product has sizes but none selected, default to the first one or "Média"
    sizeName = product.sizes[0];
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

  const selectedSizeObj = (product.sizes && product.sizes.length > 0)
    ? { id: sizeId, name: sizeName, priceDelta: sizeDelta }
    : null;

  // Crust / Border details & pricing delta
  let crustDelta = 0;
  let crustId = 'none';
  let crustName = 'Sem borda';
  if (selectedBorder) {
    crustName = selectedBorder;
    if (selectedBorder !== 'Sem borda') {
      crustDelta = 5.00;
      crustId = selectedBorder.toLowerCase().replace(/\s+/g, '-');
    } else {
      crustDelta = 0.00;
      crustId = 'none';
    }
  } else if (product.borders && product.borders.length > 0) {
    crustName = product.borders[0];
    if (crustName !== 'Sem borda') {
      crustDelta = 5.00;
      crustId = crustName.toLowerCase().replace(/\s+/g, '-');
    } else {
      crustDelta = 0.00;
      crustId = 'none';
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
      const id = `extra-${ex.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      extrasMap.set(key, {
        id,
        name: ex.name,
        unitPrice: ex.price,
        quantity: 1
      });
    }
  });

  const selectedExtrasList = Array.from(extrasMap.values());

  // optionsUnitTotal = sizeDelta + crustDelta + sum(extraUnitPrice * extraQuantity)
  const extrasUnitTotal = selectedExtrasList.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const optionsUnitTotal = sizeDelta + crustDelta + extrasUnitTotal;

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

  // 5. Compute Options Unit Total
  const sizeDelta = selectedSizeObj?.priceDelta || 0;
  const crustDelta = selectedCrustObj?.priceDelta || 0;
  const extrasDelta = selectedExtrasList.reduce((sum, ex) => sum + (ex.unitPrice * ex.quantity), 0);
  const optionsUnitTotal = sizeDelta + crustDelta + extrasDelta;

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
    notes: notes?.trim() || null,
    optionsUnitTotal,
    finalUnitPrice,
    lineTotal
  };
}
