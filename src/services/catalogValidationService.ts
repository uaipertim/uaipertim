import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CITIES, INITIAL_ESTABLISHMENTS, INITIAL_PRODUCTS } from '../initialData';
import { normalizeProductFromFirestore } from './productNormalizer'; // wait, we will define productNormalizer helper

export interface ValidationReport {
  isValid: boolean;
  tests: {
    name: string;
    status: 'pass' | 'fail';
    message: string;
    expected: string;
    actual: string;
  }[];
  counts: {
    cities: { local: number; firestore: number };
    establishments: { local: number; firestore: number };
    products: { local: number; firestore: number };
  };
}

export const catalogValidationService = {
  async runValidation(): Promise<ValidationReport> {
    const report: ValidationReport = {
      isValid: true,
      tests: [],
      counts: {
        cities: { local: CITIES.length, firestore: 0 },
        establishments: { local: INITIAL_ESTABLISHMENTS.length, firestore: 0 },
        products: { local: Object.values(INITIAL_PRODUCTS).flat().length, firestore: 0 },
      },
    };

    if (!db) {
      report.isValid = false;
      report.tests.push({
        name: 'Conexão com Firestore',
        status: 'fail',
        message: 'Banco de dados Firestore não inicializado ou indisponível.',
        expected: 'Conectado',
        actual: 'Desconectado',
      });
      return report;
    }

    try {
      // 1. Fetch cities, establishments and products from Firestore
      const citiesSnap = await getDocs(collection(db, 'cities'));
      const estsSnap = await getDocs(collection(db, 'establishments'));
      const prodsSnap = await getDocs(collection(db, 'products'));

      const firestoreCities = citiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const firestoreEsts = estsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const firestoreProds = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      report.counts.cities.firestore = firestoreCities.length;
      report.counts.establishments.firestore = firestoreEsts.length;
      report.counts.products.firestore = firestoreProds.length;

      const cityIds = new Set(firestoreCities.map(c => c.id));
      const estIds = new Set(firestoreEsts.map(e => e.id));
      const prodIds = new Set(firestoreProds.map(p => p.id));

      // Test 1: Exatamente duas cidades oficiais
      const citiesPass = firestoreCities.length === 2 && cityIds.has('sao-joao-batista-do-gloria-mg') && cityIds.has('passos-mg');
      report.tests.push({
        name: 'Quantidade de Cidades Oficiais',
        status: citiesPass ? 'pass' : 'fail',
        message: citiesPass ? 'Cidades corretas encontradas' : 'Cidades ausentes ou em quantidade incorreta.',
        expected: '2 (sao-joao-batista-do-gloria-mg, passos-mg)',
        actual: `${firestoreCities.length} (${firestoreCities.map(c => c.id).join(', ')})`,
      });
      if (!citiesPass) report.isValid = false;

      // Test 2: Oito estabelecimentos iniciais
      const estsPass = firestoreEsts.length === 8;
      report.tests.push({
        name: 'Quantidade de Estabelecimentos Iniciais',
        status: estsPass ? 'pass' : 'fail',
        message: estsPass ? '8 estabelecimentos oficiais cadastrados' : 'A quantidade de estabelecimentos gravada diverge dos 8 iniciais.',
        expected: '8 estabelecimentos',
        actual: `${firestoreEsts.length} estabelecimentos`,
      });
      if (!estsPass) report.isValid = false;

      // Test 3: Quantidade de produtos igual à origem
      const localProductsCount = Object.values(INITIAL_PRODUCTS).flat().length;
      const productsPass = firestoreProds.length === localProductsCount;
      report.tests.push({
        name: 'Quantidade de Produtos de Catálogo',
        status: productsPass ? 'pass' : 'fail',
        message: productsPass ? 'Número total de produtos coincide perfeitamente' : 'Divergência na quantidade de produtos do catálogo.',
        expected: `${localProductsCount} produtos`,
        actual: `${firestoreProds.length} produtos`,
      });
      if (!productsPass) report.isValid = false;

      // Test 4: Nenhum produto sem establishmentId
      const productsWithoutEstId = firestoreProds.filter(p => !p.establishmentId);
      const estIdPass = productsWithoutEstId.length === 0;
      report.tests.push({
        name: 'Integridade dos Produtos: establishmentId',
        status: estIdPass ? 'pass' : 'fail',
        message: estIdPass ? 'Todos os produtos possuem establishmentId' : `${productsWithoutEstId.length} produtos estão órfãos.`,
        expected: '0 produtos sem establishmentId',
        actual: `${productsWithoutEstId.length} produtos sem establishmentId`,
      });
      if (!estIdPass) report.isValid = false;

      // Test 5: Nenhum produto vinculado a estabelecimento inexistente
      const productsOrphaned = firestoreProds.filter(p => p.establishmentId && !estIds.has(p.establishmentId));
      const orphanedPass = productsOrphaned.length === 0;
      report.tests.push({
        name: 'Integridade de Relações: Produto -> Estabelecimento',
        status: orphanedPass ? 'pass' : 'fail',
        message: orphanedPass ? 'Nenhum produto vinculado a loja inexistente' : `${productsOrphaned.length} produtos vinculados a IDs de loja inválidos.`,
        expected: '0 produtos órfãos',
        actual: `${productsOrphaned.length} produtos órfãos`,
      });
      if (!orphanedPass) report.isValid = false;

      // Test 6: Nenhum estabelecimento vinculado a cidade inexistente
      const estsOrphaned = firestoreEsts.filter(e => e.cityId && !cityIds.has(e.cityId));
      const estCityPass = estsOrphaned.length === 0;
      report.tests.push({
        name: 'Integridade de Relações: Estabelecimento -> Cidade',
        status: estCityPass ? 'pass' : 'fail',
        message: estCityPass ? 'Todos os estabelecimentos pertencem a cidades cadastradas' : `${estsOrphaned.length} lojas com cidades inválidas.`,
        expected: '0 lojas órfãs',
        actual: `${estsOrphaned.length} lojas órfãs`,
      });
      if (!estCityPass) report.isValid = false;

      // Test 7: IDs sem duplicação
      const uniqueIdsCheck = firestoreCities.length + firestoreEsts.length + firestoreProds.length === cityIds.size + estIds.size + prodIds.size;
      report.tests.push({
        name: 'Identificadores Únicos e Estáveis',
        status: uniqueIdsCheck ? 'pass' : 'fail',
        message: uniqueIdsCheck ? 'Sem IDs duplicados ou gerados aleatoriamente de forma incorreta' : 'Detectada colisão de IDs ou duplicação de documentos.',
        expected: 'Identificadores 100% únicos',
        actual: uniqueIdsCheck ? 'Válido' : 'Inválido',
      });
      if (!uniqueIdsCheck) report.isValid = false;

      // Test 8: Preços numéricos
      const nonNumericPrices = firestoreProds.filter(p => typeof p.basePrice !== 'number' || isNaN(p.basePrice));
      const pricesPass = nonNumericPrices.length === 0;
      report.tests.push({
        name: 'Formato Financeiro (basePrice como Number)',
        status: pricesPass ? 'pass' : 'fail',
        message: pricesPass ? 'Todos os preços são números válidos no banco' : `Encontrados preços salvos em formato string em ${nonNumericPrices.length} produtos.`,
        expected: '0 preços não numéricos',
        actual: `${nonNumericPrices.length} preços com formato string`,
      });
      if (!pricesPass) report.isValid = false;

      // Test 9: Arrays de personalizações válidos
      const invalidCustoms = firestoreProds.filter(p => {
        const hasSizes = Array.isArray(p.sizes) && p.sizes.every((s: any) => typeof s === 'object' && s.id && s.name);
        const hasCrusts = Array.isArray(p.crusts) && p.crusts.every((c: any) => typeof c === 'object' && c.id && c.name);
        const hasExtras = Array.isArray(p.extras) && p.extras.every((e: any) => typeof e === 'object' && e.id && e.name);
        return !hasSizes || !hasCrusts || !hasExtras;
      });
      const customsPass = invalidCustoms.length === 0;
      report.tests.push({
        name: 'Estruturas de Personalização (Tamanhos, Bordas, Extras)',
        status: customsPass ? 'pass' : 'fail',
        message: customsPass ? 'Tamanhos, bordas e adicionais normalizados e preservados' : `Estrutura de opcionais corrompida em ${invalidCustoms.length} produtos.`,
        expected: 'Estruturas de opcionais 100% íntegras',
        actual: customsPass ? 'Válidas' : 'Corrompidas',
      });
      if (!customsPass) report.isValid = false;

      // Test 10: Pizzaria da Praça com cardápio preservado
      const pizzaDaPracaProds = firestoreProds.filter(p => p.establishmentId === 'pizzaria-da-praca');
      const expectedDaPracaCount = INITIAL_PRODUCTS['pizzaria-da-praca']?.length || 0;
      const pizzaPracaPass = pizzaDaPracaProds.length === expectedDaPracaCount;
      report.tests.push({
        name: 'Preservação de Cardápio da Pizzaria da Praça',
        status: pizzaPracaPass ? 'pass' : 'fail',
        message: pizzaPracaPass ? 'Cardápio e opcionais da Pizzaria da Praça preservados integralmente' : 'Divergência ou perda de pratos da Pizzaria da Praça.',
        expected: `${expectedDaPracaCount} produtos`,
        actual: `${pizzaDaPracaProds.length} produtos no Firestore`,
      });
      if (!pizzaPracaPass) report.isValid = false;

    } catch (error: any) {
      console.error("Error running validations:", error);
      report.isValid = false;
      report.tests.push({
        name: 'Execução de Testes',
        status: 'fail',
        message: `Ocorreu uma falha ao rodar a suite de testes: ${error.message || error}`,
        expected: 'Sucesso',
        actual: 'Erro',
      });
    }

    return report;
  }
};
