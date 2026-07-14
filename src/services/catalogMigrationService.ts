import { collection, doc, writeBatch, getDocs, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CITIES, INITIAL_ESTABLISHMENTS, INITIAL_PRODUCTS } from '../initialData';
import { City, Establishment, Product } from '../types';

export interface MigrationAnalysis {
  citiesCount: number;
  establishmentsCount: number;
  productsCount: number;
  productsByEstablishment: Record<string, number>;
  missingIds: string[];
  missingEstablishmentIds: string[];
  missingCityIds: string[];
  duplicateIds: string[];
  missingRequiredFields: string[];
}

export interface DryRunResult {
  valid: boolean;
  documentsToCreate: {
    cities: any[];
    establishments: any[];
    products: any[];
  };
  alreadyExists: {
    cities: string[];
    establishments: string[];
    products: string[];
  };
  conflicts: string[];
  ignored: string[];
  fatalErrors: string[];
  counts: {
    cities: number;
    establishments: number;
    products: number;
  };
}

export interface MigrationStatusDoc {
  version: number;
  status: 'not_started' | 'running' | 'completed' | 'failed';
  source: string;
  destination: string;
  startedAt: any;
  completedAt: any;
  executedBy: string | null;
  sourceCounts: {
    cities: number;
    establishments: number;
    products: number;
  };
  destinationCounts: {
    cities: number;
    establishments: number;
    products: number;
  };
  errors: string[];
  updatedAt: any;
}

export interface MigrationPlan {
  valid: boolean;
  cities: any[];
  establishments: any[];
  products: any[];
  errors: string[];
  warnings: string[];
  counts: {
    cities: number;
    establishments: number;
    products: number;
  };
}

export function sanitizeFirestoreData(data: any): any {
  if (data === null) return null;
  if (data === undefined) return undefined;
  if (data instanceof Timestamp) return data;
  if (data instanceof Date) return data;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeFirestoreData(item)).filter(item => item !== undefined);
  }
  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        sanitized[key] = sanitizeFirestoreData(val);
      }
    }
    return sanitized;
  }
  return data;
}

export const catalogMigrationService = {
  analyzeLocalData(): MigrationAnalysis {
    const missingIds: string[] = [];
    const missingEstablishmentIds: string[] = [];
    const missingCityIds: string[] = [];
    const duplicateIds: string[] = [];
    const missingRequiredFields: string[] = [];
    const idSet = new Set<string>();

    // 1. Analyze Cities
    CITIES.forEach((c) => {
      if (!c.id) missingIds.push(`Cidade sem ID: ${c.name}`);
      else if (idSet.has(c.id)) duplicateIds.push(`ID de Cidade duplicado: ${c.id}`);
      else idSet.add(c.id);

      if (!c.name) missingRequiredFields.push(`Cidade ${c.id || 'sem ID'} sem 'name'`);
      if (!c.state) missingRequiredFields.push(`Cidade ${c.id || 'sem ID'} sem 'state'`);
    });

    // 2. Analyze Establishments
    INITIAL_ESTABLISHMENTS.forEach((e) => {
      if (!e.id) missingIds.push(`Estabelecimento sem ID: ${e.name}`);
      else if (idSet.has(e.id)) duplicateIds.push(`ID de Estabelecimento duplicado: ${e.id}`);
      else idSet.add(e.id);

      if (!e.name) missingRequiredFields.push(`Estabelecimento ${e.id || 'sem ID'} sem 'name'`);
      if (!e.cityId) {
        missingCityIds.push(`Estabelecimento ${e.id} sem cityId`);
      }
      if (!e.category) missingRequiredFields.push(`Estabelecimento ${e.id} sem 'category'`);
    });

    // 3. Analyze Products
    let totalProducts = 0;
    const productsByEstablishment: Record<string, number> = {};

    Object.entries(INITIAL_PRODUCTS).forEach(([estId, prodList]) => {
      productsByEstablishment[estId] = prodList.length;
      prodList.forEach((p) => {
        totalProducts++;
        if (!p.id) missingIds.push(`Produto sem ID no estabelecimento ${estId}: ${p.name}`);
        else if (idSet.has(p.id)) duplicateIds.push(`ID de Produto duplicado: ${p.id}`);
        else idSet.add(p.id);

        if (!p.name) missingRequiredFields.push(`Produto ${p.id || 'sem ID'} sem 'name'`);
        if (p.price === undefined || p.price === null) {
          missingRequiredFields.push(`Produto ${p.id} sem preço`);
        }

        const est = INITIAL_ESTABLISHMENTS.find((e) => e.id === estId);
        if (!est) {
          missingEstablishmentIds.push(`Produto ${p.id} pertence a estabelecimento inexistente: ${estId}`);
        }
      });
    });

    return {
      citiesCount: CITIES.length,
      establishmentsCount: INITIAL_ESTABLISHMENTS.length,
      productsCount: totalProducts,
      productsByEstablishment,
      missingIds,
      missingEstablishmentIds,
      missingCityIds,
      duplicateIds,
      missingRequiredFields,
    };
  },

  buildCatalogMigrationPlan(): MigrationPlan {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Map Cities
    const cities = CITIES.map((c) => {
      const slug = c.id;
      const displayName = `${c.name} - ${c.state}`;
      const sortOrder = c.id === 'sao-joao-batista-do-gloria-mg' ? 1 : 2;
      return {
        id: c.id,
        name: c.name,
        displayName,
        state: c.state || 'MG',
        slug,
        active: c.active !== undefined ? c.active : true,
        isDefault: c.default !== undefined ? c.default : (c.id === 'sao-joao-batista-do-gloria-mg'),
        sortOrder,
      };
    });

    // 2. Map Establishments
    const establishments = INITIAL_ESTABLISHMENTS.map((e) => {
      const city = CITIES.find((c) => c.id === e.cityId);
      if (!e.cityId) {
        errors.push(`Estabelecimento ${e.id} possui cityId ausente.`);
      } else if (!city) {
        errors.push(`Estabelecimento ${e.id} possui cityId inválido: ${e.cityId}`);
      }

      const addressObj = {
        street: e.address?.split(',')[0] || e.address || null,
        number: e.address?.split(',')[1]?.trim() || null,
        complement: null,
        neighborhood: e.bairro || null,
        zipCode: e.cep || null,
        cityName: e.cityName || city?.name || '',
        state: e.state || 'MG',
      };

      const openingHours = {
        seg_sex: '18:00 - 23:30',
        sab_dom: '18:00 - 00:00',
      };

      return {
        id: e.id,
        name: e.name,
        slug: e.id,
        cityId: e.cityId || (city?.id || ''),
        cityName: e.cityName || (city?.name || ''),
        state: e.state || 'MG',
        categoryId: e.category?.toLowerCase().replace(/\s+/g, '-') || 'outras',
        categoryName: e.category,
        description: e.description || null,
        phone: e.phone || null,
        address: addressObj,
        active: e.active !== undefined ? e.active : true,
        open: e.isOpen !== undefined ? e.isOpen : true,
        acceptingOrders: e.acceptingOrders !== undefined ? e.acceptingOrders : true,
        temporarilyPaused: e.temporarilyPaused !== undefined ? e.temporarilyPaused : false,
        suspended: e.suspended !== undefined ? e.suspended : false,
        featured: e.featured || false,
        rating: e.rating || null,
        reviewCount: 15,
        deliveryTimeMin: e.deliveryTime ? parseInt(e.deliveryTime.split('-')[0]) || 30 : 30,
        deliveryTimeMax: e.deliveryTime ? parseInt(e.deliveryTime.split('-')[1]) || 45 : 45,
        deliveryFee: typeof e.deliveryFee === 'number' ? e.deliveryFee : 0,
        minimumOrder: typeof e.minOrderValue === 'number' ? e.minOrderValue : 0,
        fulfillment: {
          delivery: e.entregaPropria !== undefined ? e.entregaPropria : true,
          pickup: e.atendeRetirada !== undefined ? e.atendeRetirada : true,
        },
        paymentMethods: {
          cash: e.acceptCash !== undefined ? e.acceptCash : true,
          cardOnDelivery: e.acceptCreditCard !== undefined ? e.acceptCreditCard : true,
          pixOnDelivery: e.acceptPix !== undefined ? e.acceptPix : true,
          debitCard: e.acceptDebitCard !== undefined ? e.acceptDebitCard : true,
          creditCard: e.acceptCreditCard !== undefined ? e.acceptCreditCard : true,
          contactless: e.acceptContactless !== undefined ? e.acceptContactless : true,
        },
        openingHours,
        logoUrl: e.image || null,
        bannerUrl: e.image || null,
        subscriptionPlan: 'Plano Grátis',
        subscriptionStatus: 'active',
        monthlyFee: 0,
        sortOrder: 1,
      };
    });

    // 3. Map Products
    const products: any[] = [];
    Object.entries(INITIAL_PRODUCTS).forEach(([estId, prodList]) => {
      const est = INITIAL_ESTABLISHMENTS.find((e) => e.id === estId);
      if (!est) {
        errors.push(`Produto listado pertence a estabelecimento inexistente: ${estId}`);
      }

      prodList.forEach((p, idx) => {
        if (!estId) {
          errors.push(`Produto ${p.name} (id: ${p.id}) está sem establishmentId.`);
        }
        if (p.price === undefined || p.price === null || isNaN(p.price)) {
          errors.push(`Produto ${p.name} (id: ${p.id}) possui preço inválido: ${p.price}`);
        }

        const mappedSizes = p.sizes?.map((sz, sIdx) => ({
          id: sz.toLowerCase().replace(/\s+/g, '-'),
          name: sz,
          priceDelta: 0,
          active: true,
          sortOrder: sIdx + 1,
        })) || [];

        const mappedCrusts = p.borders?.map((br, bIdx) => ({
          id: br.toLowerCase().replace(/\s+/g, '-'),
          name: br,
          priceDelta: br.includes('Catupiry') || br.includes('Cheddar') ? 5.0 : 0.0,
          active: true,
          sortOrder: bIdx + 1,
        })) || [];

        const mappedExtras = p.extras?.map((ex, eIdx) => ({
          id: ex.name.toLowerCase().replace(/\s+/g, '-'),
          name: ex.name,
          price: typeof ex.price === 'number' ? ex.price : 0,
          active: true,
          maxQuantity: 5,
          sortOrder: eIdx + 1,
        })) || [];

        products.push({
          id: p.id,
          establishmentId: estId,
          establishmentName: est ? est.name : 'Unknown Store',
          cityId: est ? est.cityId : 'sao-joao-batista-do-gloria-mg',
          categoryId: p.category?.toLowerCase().replace(/\s+/g, '-') || 'outros',
          categoryName: p.category || 'Outros',
          name: p.name,
          slug: p.id,
          description: p.description || null,
          imageUrl: p.image || null,
          basePrice: typeof p.price === 'number' ? p.price : 0,
          active: true,
          available: p.available !== undefined ? p.available : true,
          featured: false,
          sizes: mappedSizes,
          crusts: mappedCrusts,
          extras: mappedExtras,
          notesEnabled: true,
          sortOrder: idx + 1,
        });
      });
    });

    return {
      valid: errors.length === 0,
      cities,
      establishments,
      products,
      errors,
      warnings,
      counts: {
        cities: cities.length,
        establishments: establishments.length,
        products: products.length,
      },
    };
  },

  async runDryRun(): Promise<DryRunResult> {
    const plan = this.buildCatalogMigrationPlan();
    const fatalErrors: string[] = [...plan.errors];
    const conflicts: string[] = [];
    const ignored: string[] = [];
    
    const alreadyExists = {
      cities: [] as string[],
      establishments: [] as string[],
      products: [] as string[],
    };

    if (db) {
      try {
        const citiesSnap = await getDocs(collection(db, 'cities'));
        citiesSnap.forEach((doc) => alreadyExists.cities.push(doc.id));

        const estSnap = await getDocs(collection(db, 'establishments'));
        estSnap.forEach((doc) => alreadyExists.establishments.push(doc.id));

        const prodSnap = await getDocs(collection(db, 'products'));
        prodSnap.forEach((doc) => alreadyExists.products.push(doc.id));
      } catch (err: any) {
        console.warn("Dry run Firestore check warning:", err);
      }
    }

    return {
      valid: fatalErrors.length === 0,
      documentsToCreate: {
        cities: plan.cities,
        establishments: plan.establishments,
        products: plan.products,
      },
      alreadyExists,
      conflicts,
      ignored,
      fatalErrors,
      counts: plan.counts,
    };
  },

  async executeCatalogMigration(
    plan: MigrationPlan,
    currentUserUid: string,
    currentUserEmail: string | null,
    onProgress: (msg: string) => void
  ): Promise<{ success: boolean; errors: string[] }> {
    if (!db) {
      return { success: false, errors: ['Conexão com Firestore indisponível'] };
    }

    const errors: string[] = [];
    const startedAt = Timestamp.now();

    // 1. Update Tracking to "running"
    onProgress("Preparando migração...");
    const trackingDocRef = doc(db, 'appConfig', 'catalogMigrationV1');
    const updateTracking = async (
      status: 'running' | 'completed' | 'failed',
      destCounts?: any,
      errs: string[] = []
    ) => {
      try {
        await writeBatch(db)
          .set(trackingDocRef, {
            version: 1,
            status,
            source: "local-catalog",
            destination: "firestore",
            startedAt,
            completedAt: status === 'running' ? null : Timestamp.now(),
            executedBy: currentUserUid,
            sourceCounts: {
              cities: plan.counts.cities,
              establishments: plan.counts.establishments,
              products: plan.counts.products,
            },
            destinationCounts: destCounts || { cities: 0, establishments: 0, products: 0 },
            errors: errs,
            updatedAt: serverTimestamp(),
          }, { merge: true })
          .commit();
      } catch (e: any) {
        console.error("Error updating migration tracking doc:", e);
      }
    };

    await updateTracking('running');

    try {
      const { cities, establishments, products } = plan;

      // 2. Write Cities
      onProgress("Gravando cidades: 0 de " + cities.length);
      let batch = writeBatch(db);
      cities.forEach((c) => {
        const ref = doc(db, 'cities', c.id);
        batch.set(ref, {
          ...sanitizeFirestoreData(c),
          createdAt: startedAt,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      onProgress(`Gravando cidades: ${cities.length} de ${cities.length}`);

      // 3. Write Establishments
      onProgress("Gravando estabelecimentos: 0 de " + establishments.length);
      batch = writeBatch(db);
      establishments.forEach((e) => {
        const ref = doc(db, 'establishments', e.id);
        batch.set(ref, {
          ...sanitizeFirestoreData(e),
          createdAt: startedAt,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      onProgress(`Gravando estabelecimentos: ${establishments.length} de ${establishments.length}`);

      // 4. Write Products in chunks
      onProgress(`Gravando produtos: 0 de ${products.length}`);
      const chunkSize = 25;
      let written = 0;
      for (let i = 0; i < products.length; i += chunkSize) {
        batch = writeBatch(db);
        const chunk = products.slice(i, i + chunkSize);
        chunk.forEach((p) => {
          const ref = doc(db, 'products', p.id);
          batch.set(ref, {
            ...sanitizeFirestoreData(p),
            createdAt: startedAt,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        });
        await batch.commit();
        written += chunk.length;
        onProgress(`Gravando produtos: ${written} de ${products.length}`);
      }

      // 5. Validation after write
      onProgress("Validando dados gravados...");
      
      const citiesSnap = await getDocs(collection(db, 'cities'));
      const estsSnap = await getDocs(collection(db, 'establishments'));
      const prodsSnap = await getDocs(collection(db, 'products'));

      const actualCitiesCount = citiesSnap.size;
      const actualEstsCount = estsSnap.size;
      const actualProdsCount = prodsSnap.size;

      if (actualCitiesCount !== plan.counts.cities) {
        errors.push(`Validação falhou: Esperava ${plan.counts.cities} cidades no Firestore, mas encontrou ${actualCitiesCount}.`);
      }
      if (actualEstsCount !== plan.counts.establishments) {
        errors.push(`Validação falhou: Esperava ${plan.counts.establishments} estabelecimentos no Firestore, mas encontrou ${actualEstsCount}.`);
      }
      if (actualProdsCount !== plan.counts.products) {
        errors.push(`Validação falhou: Esperava ${plan.counts.products} produtos no Firestore, mas encontrou ${actualProdsCount}.`);
      }

      const estIds = new Set(estsSnap.docs.map(d => d.id));
      const cityIds = new Set(citiesSnap.docs.map(d => d.id));

      prodsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.establishmentId) {
          errors.push(`Validação falhou: Produto ${docSnap.id} no Firestore está sem establishmentId.`);
        } else if (!estIds.has(data.establishmentId)) {
          errors.push(`Validação falhou: Produto ${docSnap.id} no Firestore está vinculado a estabelecimento inexistente: ${data.establishmentId}.`);
        }
      });

      estsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.cityId) {
          errors.push(`Validação falhou: Estabelecimento ${docSnap.id} no Firestore está sem cityId.`);
        } else if (!cityIds.has(data.cityId)) {
          errors.push(`Validação falhou: Estabelecimento ${docSnap.id} no Firestore está vinculado a cidade inexistente: ${data.cityId}.`);
        }
      });

      if (errors.length > 0) {
        await updateTracking('failed', {
          cities: actualCitiesCount,
          establishments: actualEstsCount,
          products: actualProdsCount,
        }, errors);
        return { success: false, errors };
      }

      const finalCounts = {
        cities: actualCitiesCount,
        establishments: actualEstsCount,
        products: actualProdsCount,
      };
      await updateTracking('completed', finalCounts);
      onProgress("Gravação concluída.");
      return { success: true, errors: [] };

    } catch (err: any) {
      console.error("Migration execution aborted due to error:", err);
      const errMsg = err.message || 'Erro desconhecido durante escrita em lote';
      errors.push(errMsg);
      await updateTracking('failed', null, errors);
      return { success: false, errors };
    }
  },

  async executeMigration(currentUserEmail: string | null): Promise<{ success: boolean; errors: string[] }> {
    const plan = this.buildCatalogMigrationPlan();
    return this.executeCatalogMigration(plan, "legacy-admin", currentUserEmail, () => {});
  }
};
